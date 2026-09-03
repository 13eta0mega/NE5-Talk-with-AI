import { AudioGate } from "./AudioGate";

type DeviceSnapshot = { microphones: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] };
export type AudioDeviceCapabilities = {
  microphoneSelection: boolean;
  speakerSelection: boolean;
  speakerPicker: boolean;
  audioSession: boolean;
};

type AudioSessionType = "auto" | "playback";
type AudioSessionController = { type: AudioSessionType };
type OutputMediaDevices = MediaDevices & {
  selectAudioOutput?: (options?: { deviceId?: string }) => Promise<MediaDeviceInfo>;
};
type SinkAudioContext = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };
type PlaybackWorkletMessage =
  | { type: "playback-start" }
  | { type: "playback-end" }
  | { type: "level"; level?: number };

export const ANDROID_AUDIO_MODE_SETTLE_MS = 260;
export const PLAYBACK_SAMPLE_RATE = 24000;
export const AUDIO_WORKLET_VERSION = "20260904-jitter-1";
export const CAPTURE_HEARTBEAT_FRESH_MS = 700;
export const PLAYBACK_DRAIN_TIMEOUT_MS = 30000;
export const ANDROID_PLAYBACK_INITIAL_BUFFER_MS = 220;
export const ANDROID_PLAYBACK_REBUFFER_MS = 140;
export const DEFAULT_PLAYBACK_INITIAL_BUFFER_MS = 100;
export const DEFAULT_PLAYBACK_REBUFFER_MS = 70;
export const toBrowserSinkId = (deviceId: string): string => deviceId === "default" ? "" : deviceId;

function versionedWorkletUrl(fileName: string): string {
  const url = new URL(`./worklets/${fileName}`, window.location.href);
  url.searchParams.set("v", AUDIO_WORKLET_VERSION);
  return url.href;
}

export class AudioEngine {
  readonly gate = new AudioGate();
  private captureContext?: AudioContext;
  private captureNode?: AudioWorkletNode;
  private captureStream?: MediaStream;
  private playbackContext?: SinkAudioContext;
  private playbackNode?: AudioWorkletNode;
  private playbackPreparing?: Promise<void>;
  private playbackEnded = true;
  private outputDeviceId = "default";
  private captureDeviceId?: string;
  private drainWaiters: Array<() => void> = [];
  private modelPlaybackActive = false;
  private lastCapturePcmAt = 0;
  private lastForwardedMicAt = 0;
  private captureStartedAt = 0;

  onInputLevel?: (level: number) => void;
  onOutputLevel?: (level: number) => void;
  onCapturePcm?: (chunk: Int16Array) => void;
  onRawCapturePcm?: (chunk: Int16Array) => void;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;

  get deviceCapabilities(): AudioDeviceCapabilities {
    const contextPrototype = typeof AudioContext === "undefined"
      ? undefined
      : AudioContext.prototype as unknown as SinkAudioContext;
    const mediaDevices = navigator.mediaDevices as OutputMediaDevices | undefined;
    const speakerSelection = typeof contextPrototype?.setSinkId === "function";
    return {
      microphoneSelection: Boolean(navigator.mediaDevices?.enumerateDevices),
      speakerSelection,
      speakerPicker: typeof mediaDevices?.selectAudioOutput === "function" && speakerSelection,
      audioSession: Boolean(this.audioSession),
    };
  }

  private get audioSession(): AudioSessionController | undefined {
    return (navigator as Navigator & { audioSession?: AudioSessionController }).audioSession;
  }

  private setAudioSessionType(type: AudioSessionType): void {
    try {
      if (this.audioSession) this.audioSession.type = type;
    } catch {
      // Audio Session is experimental. The playback AudioContext remains the fallback signal.
    }
  }

  private get needsAndroidAudioModeReset(): boolean {
    return /Android/i.test(navigator.userAgent);
  }

  private async waitForAndroidAudioModeReset(): Promise<void> {
    if (!this.needsAndroidAudioModeReset) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, ANDROID_AUDIO_MODE_SETTLE_MS));
  }

  private stopModelPlaybackSignal(): void {
    if (!this.modelPlaybackActive) return;
    this.modelPlaybackActive = false;
    this.onOutputLevel?.(0);
    this.onPlaybackEnd?.();
  }

  private resolveDrainWaiters(): void {
    this.drainWaiters.splice(0).forEach((resolve) => resolve());
  }

  private async applyOutputDevice(): Promise<void> {
    if (!this.playbackContext?.setSinkId) return;
    await this.playbackContext.setSinkId(toBrowserSinkId(this.outputDeviceId));
  }

  private async createPlaybackContext(): Promise<void> {
    if (this.playbackContext && this.playbackNode) return;

    let context: SinkAudioContext;
    try {
      context = new AudioContext({ latencyHint: "interactive", sampleRate: PLAYBACK_SAMPLE_RATE }) as SinkAudioContext;
    } catch {
      context = new AudioContext({ latencyHint: "interactive" }) as SinkAudioContext;
    }

    try {
      await context.audioWorklet.addModule(versionedWorkletUrl("playback-processor.js"));
      const android = this.needsAndroidAudioModeReset;
      const node = new AudioWorkletNode(context, "deskpet-playback", {
        processorOptions: {
          inputSampleRate: PLAYBACK_SAMPLE_RATE,
          initialBufferMs: android ? ANDROID_PLAYBACK_INITIAL_BUFFER_MS : DEFAULT_PLAYBACK_INITIAL_BUFFER_MS,
          rebufferMs: android ? ANDROID_PLAYBACK_REBUFFER_MS : DEFAULT_PLAYBACK_REBUFFER_MS,
        },
      });
      node.port.onmessage = (event: MessageEvent<PlaybackWorkletMessage>) => {
        if (event.data.type === "level") {
          this.onOutputLevel?.(event.data.level ?? 0);
          return;
        }
        if (event.data.type === "playback-start") {
          this.playbackEnded = false;
          if (!this.modelPlaybackActive) {
            this.modelPlaybackActive = true;
            this.onPlaybackStart?.();
          }
          return;
        }
        if (event.data.type === "playback-end") {
          this.playbackEnded = true;
          this.stopModelPlaybackSignal();
          this.resolveDrainWaiters();
        }
      };
      node.connect(context.destination);
      this.playbackContext = context;
      this.playbackNode = node;
      await this.applyOutputDevice();
    } catch (error) {
      if (context.state !== "closed") await context.close();
      throw error;
    }
  }

  async listDevices(requestPermission = false): Promise<DeviceSnapshot> {
    if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("이 브라우저에서는 마이크 장치 API를 사용할 수 없습니다. HTTPS 주소에서 열어 주세요.");
    }
    if (requestPermission) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      microphones: devices.filter((device) => device.kind === "audioinput"),
      speakers: devices.filter((device) => device.kind === "audiooutput"),
    };
  }

  async startCapture(deviceId = "default"): Promise<void> {
    if (this.captureContext && this.captureDeviceId === deviceId && this.captureActive) {
      this.setAudioSessionType(this.needsAndroidAudioModeReset ? "playback" : "auto");
      if (this.captureContext.state === "suspended") await this.captureContext.resume();
      return;
    }
    await this.createCapture(deviceId);
  }

  private async createCapture(deviceId: string): Promise<void> {
    await this.stopCapture();
    this.flushPlayback(false);

    const android = this.needsAndroidAudioModeReset;
    this.setAudioSessionType(android ? "playback" : "auto");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId === "default" ? undefined : { exact: deviceId },
        channelCount: 1,
        echoCancellation: android ? false : true,
        noiseSuppression: android ? false : true,
        autoGainControl: android ? false : true,
      },
    });
    const context = new AudioContext({ latencyHint: "interactive" });
    await context.audioWorklet.addModule(versionedWorkletUrl("capture-processor.js"));
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "deskpet-capture", {
      processorOptions: { targetSampleRate: 16000, chunkSamples: 320 },
    });
    node.port.onmessage = (event: MessageEvent<{ type: string; level?: number; pcm?: ArrayBuffer }>) => {
      if (event.data.type === "level") this.onInputLevel?.(event.data.level ?? 0);
      if (event.data.type === "pcm" && event.data.pcm) {
        const pcm = new Int16Array(event.data.pcm);
        this.lastCapturePcmAt = Date.now();
        this.onRawCapturePcm?.(pcm);
        this.gate.forward(pcm, (value) => {
          this.lastForwardedMicAt = Date.now();
          this.onCapturePcm?.(value);
        });
      }
    };
    source.connect(node);
    node.connect(context.destination);
    this.captureStream = stream;
    this.captureContext = context;
    this.captureNode = node;
    this.captureDeviceId = deviceId;
    this.captureStartedAt = Date.now();
    this.lastCapturePcmAt = 0;
    this.lastForwardedMicAt = 0;
  }

  async forceRestartCapture(deviceId = this.captureDeviceId ?? "default"): Promise<void> {
    await this.createCapture(deviceId);
  }

  async stopCapture(): Promise<void> {
    this.captureNode?.disconnect();
    this.captureStream?.getTracks().forEach((track) => track.stop());
    if (this.captureContext && this.captureContext.state !== "closed") await this.captureContext.close();
    this.captureNode = undefined;
    this.captureStream = undefined;
    this.captureContext = undefined;
    this.captureDeviceId = undefined;
    this.captureStartedAt = 0;
    this.lastCapturePcmAt = 0;
    this.lastForwardedMicAt = 0;
    this.onInputLevel?.(0);
  }

  async pauseCaptureForPlayback(): Promise<void> {
    // Keep the microphone stream/context alive between turns. AudioGate is already
    // closed before playback, so captured PCM is dropped locally while the model speaks.
    this.flushPlayback(false);
    this.setAudioSessionType("playback");
    await this.waitForAndroidAudioModeReset();
    await this.preparePlayback(this.outputDeviceId);
  }

  async preparePlayback(deviceId = this.outputDeviceId): Promise<void> {
    this.outputDeviceId = deviceId;
    if (deviceId !== "default" && !this.deviceCapabilities.speakerSelection) {
      throw new Error("이 스마트폰 브라우저는 개별 스피커 선택을 지원하지 않습니다. 휴대폰의 시스템 출력 장치를 사용해 주세요.");
    }
    if (!this.playbackPreparing) {
      this.playbackPreparing = this.createPlaybackContext().finally(() => {
        this.playbackPreparing = undefined;
      });
    }
    await this.playbackPreparing;
    await this.applyOutputDevice();
  }

  async unlockPlayback(): Promise<void> {
    this.setAudioSessionType("playback");
    await this.preparePlayback(this.outputDeviceId);
    if (this.playbackContext?.state === "suspended") await this.playbackContext.resume();
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId;
    if (deviceId !== "default" && !this.deviceCapabilities.speakerSelection) {
      throw new Error("이 스마트폰 브라우저는 개별 스피커 선택을 지원하지 않습니다. 휴대폰의 시스템 출력 장치를 사용해 주세요.");
    }
    await this.preparePlayback(deviceId);
  }

  async requestOutputDevice(deviceId = this.outputDeviceId): Promise<MediaDeviceInfo> {
    const mediaDevices = navigator.mediaDevices as OutputMediaDevices | undefined;
    if (!mediaDevices?.selectAudioOutput || !this.deviceCapabilities.speakerSelection) {
      throw new Error("이 Chrome 버전은 웹페이지의 스피커 선택창을 지원하지 않습니다. Android의 미디어 출력 패널에서 스피커나 Bluetooth 장치를 선택해 주세요.");
    }
    const selected = await mediaDevices.selectAudioOutput(deviceId === "default" ? undefined : { deviceId });
    await this.setOutputDevice(selected.deviceId);
    return selected;
  }

  async enqueuePcm24k(pcm: Int16Array): Promise<void> {
    if (!pcm.length) return;
    this.setAudioSessionType("playback");
    await this.preparePlayback(this.outputDeviceId);
    if (this.playbackContext?.state === "suspended") await this.playbackContext.resume();
    const copy = new Int16Array(pcm);
    this.playbackEnded = false;
    this.playbackNode?.port.postMessage({ type: "pcm", pcm: copy.buffer }, [copy.buffer]);
  }

  async commitBufferedPlayback(): Promise<void> {
    await this.preparePlayback(this.outputDeviceId);
    this.playbackNode?.port.postMessage({ type: "commit" });
  }

  async waitForDrain(tailGuardMs = 80, timeoutMs = PLAYBACK_DRAIN_TIMEOUT_MS): Promise<void> {
    if (!this.playbackEnded) {
      await new Promise<void>((resolve, reject) => {
        let timeoutId: number | undefined;
        const onDrain = () => {
          if (timeoutId !== undefined) window.clearTimeout(timeoutId);
          resolve();
        };
        this.drainWaiters.push(onDrain);
        timeoutId = window.setTimeout(() => {
          const index = this.drainWaiters.indexOf(onDrain);
          if (index >= 0) this.drainWaiters.splice(index, 1);
          reject(new Error("오디오 재생 종료 신호가 지연되어 재생 파이프라인을 초기화합니다."));
        }, timeoutMs);
      });
    }
    await new Promise<void>((resolve) => window.setTimeout(resolve, tailGuardMs));
  }

  flushPlayback(releaseContext = false): void {
    this.playbackNode?.port.postMessage({ type: "flush" });
    this.playbackEnded = true;
    this.stopModelPlaybackSignal();
    this.onOutputLevel?.(0);
    this.resolveDrainWaiters();

    if (releaseContext) {
      const node = this.playbackNode;
      const context = this.playbackContext;
      this.playbackNode = undefined;
      this.playbackContext = undefined;
      this.playbackPreparing = undefined;
      if (node) {
        node.port.onmessage = null;
        node.disconnect();
      }
      if (context && context.state !== "closed") void context.close();
    }
  }

  get queueEmpty(): boolean {
    return this.playbackEnded;
  }

  get captureActive(): boolean {
    const tracks = this.captureStream?.getAudioTracks() ?? [];
    return Boolean(
      this.captureContext
      && this.captureContext.state !== "closed"
      && this.captureStream?.active
      && tracks.some((track) => track.readyState === "live"),
    );
  }

  get captureHeartbeatFresh(): boolean {
    if (!this.captureActive) return false;
    const now = Date.now();
    const reference = this.lastCapturePcmAt || this.captureStartedAt;
    return reference > 0 && now - reference <= CAPTURE_HEARTBEAT_FRESH_MS;
  }

  captureDiagnostics() {
    return {
      active: this.captureActive,
      heartbeatFresh: this.captureHeartbeatFresh,
      lastCapturePcmAt: this.lastCapturePcmAt,
      lastForwardedMicAt: this.lastForwardedMicAt,
      captureStartedAt: this.captureStartedAt,
      contextState: this.captureContext?.state ?? "none",
      trackStates: (this.captureStream?.getAudioTracks() ?? []).map((track) => track.readyState),
    };
  }

  async dispose(): Promise<void> {
    await this.stopCapture();
    const context = this.playbackContext;
    const node = this.playbackNode;
    this.playbackNode = undefined;
    this.playbackContext = undefined;
    this.playbackPreparing = undefined;
    if (node) {
      node.port.postMessage({ type: "flush" });
      node.port.onmessage = null;
      node.disconnect();
    }
    this.playbackEnded = true;
    this.stopModelPlaybackSignal();
    this.resolveDrainWaiters();
    if (context && context.state !== "closed") await context.close();
    this.setAudioSessionType("auto");
  }
}

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
type SinkMediaElement = HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };

export const ANDROID_AUDIO_MODE_SETTLE_MS = 260;
export const PLAYBACK_SAMPLE_RATE = 24000;
export const OUTPUT_LEVEL_WINDOW_MS = 50;
export const toBrowserSinkId = (deviceId: string): string => deviceId === "default" ? "" : deviceId;

function concatPcm(chunks: Int16Array[]): Int16Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Int16Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export function pcm16ToWavBlob(samples: Int16Array, sampleRate = PLAYBACK_SAMPLE_RATE): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);
  for (let index = 0; index < samples.length; index += 1) view.setInt16(44 + index * 2, samples[index], true);
  return new Blob([buffer], { type: "audio/wav" });
}

function outputLevels(samples: Int16Array, sampleRate = PLAYBACK_SAMPLE_RATE): number[] {
  const windowSamples = Math.max(1, Math.round(sampleRate * OUTPUT_LEVEL_WINDOW_MS / 1000));
  const levels: number[] = [];
  for (let offset = 0; offset < samples.length; offset += windowSamples) {
    const end = Math.min(samples.length, offset + windowSamples);
    let sumSquares = 0;
    for (let index = offset; index < end; index += 1) {
      const normalized = samples[index] / 32768;
      sumSquares += normalized * normalized;
    }
    levels.push(Math.min(1, Math.sqrt(sumSquares / Math.max(1, end - offset)) * 3.2));
  }
  return levels;
}

export class AudioEngine {
  readonly gate = new AudioGate();
  private captureContext?: AudioContext;
  private captureNode?: AudioWorkletNode;
  private captureStream?: MediaStream;
  private playbackElement?: SinkMediaElement;
  private playbackObjectUrl?: string;
  private pendingPlaybackChunks: Int16Array[] = [];
  private playbackQueuedSamples = 0;
  private playbackLevels: number[] = [];
  private playbackLevelFrame?: number;
  private outputDeviceId = "default";
  private captureDeviceId?: string;
  private drainWaiters: Array<() => void> = [];

  onInputLevel?: (level: number) => void;
  onOutputLevel?: (level: number) => void;
  onCapturePcm?: (chunk: Int16Array) => void;

  get deviceCapabilities(): AudioDeviceCapabilities {
    const mediaPrototype = typeof HTMLMediaElement === "undefined" ? undefined : HTMLMediaElement.prototype as HTMLMediaElement & {
      setSinkId?: (sinkId: string) => Promise<void>;
    };
    const mediaDevices = navigator.mediaDevices as OutputMediaDevices | undefined;
    return {
      microphoneSelection: Boolean(navigator.mediaDevices?.enumerateDevices),
      speakerSelection: typeof mediaPrototype?.setSinkId === "function",
      speakerPicker: typeof mediaDevices?.selectAudioOutput === "function" && typeof mediaPrototype?.setSinkId === "function",
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
      // Audio Session is experimental. HTMLMediaElement still advertises playback intent.
    }
  }

  private get needsAndroidAudioModeReset(): boolean {
    return /Android/i.test(navigator.userAgent);
  }

  private async waitForAndroidAudioModeReset(): Promise<void> {
    if (!this.needsAndroidAudioModeReset) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, ANDROID_AUDIO_MODE_SETTLE_MS));
  }

  private clearObjectUrl(): void {
    if (this.playbackObjectUrl) URL.revokeObjectURL(this.playbackObjectUrl);
    this.playbackObjectUrl = undefined;
  }

  private stopOutputMeter(): void {
    if (this.playbackLevelFrame !== undefined) cancelAnimationFrame(this.playbackLevelFrame);
    this.playbackLevelFrame = undefined;
    this.onOutputLevel?.(0);
  }

  private releasePlaybackElement(): void {
    const element = this.playbackElement;
    this.playbackElement = undefined;
    if (!element) return;
    element.onended = null;
    element.onerror = null;
    element.pause();
    element.removeAttribute("src");
    try { element.load(); } catch { /* ignore browser cleanup errors */ }
  }

  private startOutputMeter(): void {
    this.stopOutputMeter();
    const tick = () => {
      const element = this.playbackElement;
      if (!element || element.paused || element.ended) {
        this.onOutputLevel?.(0);
        return;
      }
      const index = Math.min(this.playbackLevels.length - 1, Math.max(0, Math.floor(element.currentTime * 1000 / OUTPUT_LEVEL_WINDOW_MS)));
      this.onOutputLevel?.(this.playbackLevels[index] ?? 0);
      this.playbackLevelFrame = requestAnimationFrame(tick);
    };
    this.playbackLevelFrame = requestAnimationFrame(tick);
  }

  private completePlayback(): void {
    this.playbackQueuedSamples = 0;
    this.playbackLevels = [];
    this.pendingPlaybackChunks = [];
    this.stopOutputMeter();
    this.clearObjectUrl();
    this.releasePlaybackElement();
    this.drainWaiters.splice(0).forEach((resolve) => resolve());
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
    if (this.captureContext && this.captureDeviceId === deviceId) {
      if (this.captureContext.state === "suspended") await this.captureContext.resume();
      return;
    }
    await this.stopCapture();
    this.flushPlayback();

    const android = this.needsAndroidAudioModeReset;
    // Chromium Android enters MODE_IN_COMMUNICATION for processed microphone input.
    // Keep the browser session classified as playback and request NO_EFFECTS capture
    // so hardware volume remains associated with media across repeated turns.
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
    await context.audioWorklet.addModule(new URL("./worklets/capture-processor.js", window.location.href).href);
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "deskpet-capture", {
      processorOptions: { targetSampleRate: 16000, chunkSamples: 320 },
    });
    node.port.onmessage = (event: MessageEvent<{ type: string; level?: number; pcm?: ArrayBuffer }>) => {
      if (event.data.type === "level") this.onInputLevel?.(event.data.level ?? 0);
      if (event.data.type === "pcm" && event.data.pcm) {
        const chunk = new Int16Array(event.data.pcm);
        this.gate.forward(chunk, (value) => this.onCapturePcm?.(value));
      }
    };
    source.connect(node);
    node.connect(context.destination);
    this.captureStream = stream;
    this.captureContext = context;
    this.captureNode = node;
    this.captureDeviceId = deviceId;
  }

  async stopCapture(): Promise<void> {
    this.captureNode?.disconnect();
    this.captureStream?.getTracks().forEach((track) => track.stop());
    if (this.captureContext && this.captureContext.state !== "closed") await this.captureContext.close();
    this.captureNode = undefined;
    this.captureStream = undefined;
    this.captureContext = undefined;
    this.captureDeviceId = undefined;
    this.onInputLevel?.(0);
  }

  async pauseCaptureForPlayback(): Promise<void> {
    await this.stopCapture();
    this.flushPlayback();
    this.setAudioSessionType("playback");
    await this.waitForAndroidAudioModeReset();
  }

  async preparePlayback(deviceId = this.outputDeviceId): Promise<void> {
    this.outputDeviceId = deviceId;
    if (!this.playbackElement) {
      const element = new Audio() as SinkMediaElement;
      element.preload = "auto";
      element.setAttribute("playsinline", "");
      element.onended = () => this.completePlayback();
      element.onerror = () => this.completePlayback();
      this.playbackElement = element;
    }
    if (deviceId !== "default" && !this.deviceCapabilities.speakerSelection) {
      throw new Error("이 스마트폰 브라우저는 개별 스피커 선택을 지원하지 않습니다. 휴대폰의 시스템 출력 장치를 사용해 주세요.");
    }
    if (this.playbackElement?.setSinkId) await this.playbackElement.setSinkId(toBrowserSinkId(deviceId));
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId;
    if (deviceId !== "default" && !this.deviceCapabilities.speakerSelection) {
      throw new Error("이 스마트폰 브라우저는 개별 스피커 선택을 지원하지 않습니다. 휴대폰의 시스템 출력 장치를 사용해 주세요.");
    }
    if (this.playbackElement?.setSinkId) await this.playbackElement.setSinkId(toBrowserSinkId(deviceId));
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
    this.pendingPlaybackChunks.push(new Int16Array(pcm));
    this.playbackQueuedSamples += pcm.length;
  }

  async commitBufferedPlayback(): Promise<void> {
    if (!this.pendingPlaybackChunks.length || !this.playbackQueuedSamples) return;

    // Never reuse the element that existed while microphone capture was active.
    // A fresh HTMLMediaElement gives Android a new media-playback routing decision
    // for every model turn instead of inheriting the previous communication route.
    this.releasePlaybackElement();
    this.setAudioSessionType("playback");
    await this.waitForAndroidAudioModeReset();
    await this.preparePlayback(this.outputDeviceId);

    const samples = concatPcm(this.pendingPlaybackChunks);
    this.pendingPlaybackChunks = [];
    this.playbackLevels = outputLevels(samples);
    this.clearObjectUrl();
    this.playbackObjectUrl = URL.createObjectURL(pcm16ToWavBlob(samples));
    const element = this.playbackElement!;
    element.src = this.playbackObjectUrl;
    element.currentTime = 0;
    try {
      await element.play();
      this.startOutputMeter();
    } catch (error) {
      this.completePlayback();
      throw new Error(error instanceof Error ? `미디어 재생을 시작하지 못했습니다: ${error.message}` : "미디어 재생을 시작하지 못했습니다.");
    }
  }

  async waitForDrain(tailGuardMs = 160): Promise<void> {
    if (this.playbackQueuedSamples > 0) await new Promise<void>((resolve) => this.drainWaiters.push(resolve));
    await new Promise<void>((resolve) => window.setTimeout(resolve, tailGuardMs));
  }

  flushPlayback(): void {
    this.pendingPlaybackChunks = [];
    this.playbackQueuedSamples = 0;
    this.playbackLevels = [];
    this.stopOutputMeter();
    this.clearObjectUrl();
    this.releasePlaybackElement();
    this.drainWaiters.splice(0).forEach((resolve) => resolve());
  }

  get queueEmpty(): boolean {
    return this.playbackQueuedSamples === 0;
  }

  get captureActive(): boolean {
    return Boolean(this.captureContext && this.captureStream?.active);
  }

  async dispose(): Promise<void> {
    await this.stopCapture();
    this.flushPlayback();
    this.setAudioSessionType("auto");
  }
}

import { AudioGate } from "./AudioGate";
import { resamplePcm16 } from "./pcm";

type DeviceSnapshot = { microphones: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] };

export class AudioEngine {
  readonly gate = new AudioGate();
  private captureContext?: AudioContext;
  private captureNode?: AudioWorkletNode;
  private captureStream?: MediaStream;
  private playbackContext?: AudioContext;
  private playbackNode?: AudioWorkletNode;
  private playbackQueuedSamples = 0;
  private outputDeviceId = "default";
  private captureDeviceId?: string;
  private drainWaiters: Array<() => void> = [];

  onInputLevel?: (level: number) => void;
  onOutputLevel?: (level: number) => void;
  onCapturePcm?: (chunk: Int16Array) => void;

  async listDevices(requestPermission = false): Promise<DeviceSnapshot> {
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
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId === "default" ? undefined : { exact: deviceId },
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
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

  async preparePlayback(deviceId = this.outputDeviceId): Promise<void> {
    if (this.playbackContext) {
      if (deviceId !== this.outputDeviceId) await this.setOutputDevice(deviceId);
      return;
    }
    const context = new AudioContext({ latencyHint: "interactive" });
    await context.audioWorklet.addModule(new URL("./worklets/playback-processor.js", window.location.href).href);
    const node = new AudioWorkletNode(context, "deskpet-playback", { outputChannelCount: [1] });
    node.port.onmessage = (event: MessageEvent<{ type: string; level?: number; consumed?: number }>) => {
      if (event.data.type === "level") this.onOutputLevel?.(event.data.level ?? 0);
      if (event.data.type === "consumed") {
        this.playbackQueuedSamples = Math.max(0, this.playbackQueuedSamples - (event.data.consumed ?? 0));
        if (this.playbackQueuedSamples === 0) {
          this.onOutputLevel?.(0);
          this.drainWaiters.splice(0).forEach((resolve) => resolve());
        }
      }
    };
    node.connect(context.destination);
    this.playbackContext = context;
    this.playbackNode = node;
    await this.setOutputDevice(deviceId);
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDeviceId = deviceId;
    const context = this.playbackContext as AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };
    if (context?.setSinkId) await context.setSinkId(deviceId);
  }

  async enqueuePcm24k(pcm: Int16Array): Promise<void> {
    await this.preparePlayback();
    const context = this.playbackContext!;
    if (context.state === "suspended") await context.resume();
    const frames = resamplePcm16(pcm, 24000, context.sampleRate);
    this.playbackQueuedSamples += frames.length;
    this.playbackNode!.port.postMessage({ type: "push", frames: frames.buffer }, [frames.buffer]);
  }

  async waitForDrain(tailGuardMs = 160): Promise<void> {
    if (this.playbackQueuedSamples > 0) await new Promise<void>((resolve) => this.drainWaiters.push(resolve));
    await new Promise<void>((resolve) => window.setTimeout(resolve, tailGuardMs));
  }

  flushPlayback(): void {
    this.playbackQueuedSamples = 0;
    this.playbackNode?.port.postMessage({ type: "flush" });
    this.drainWaiters.splice(0).forEach((resolve) => resolve());
    this.onOutputLevel?.(0);
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
    this.playbackNode?.disconnect();
    if (this.playbackContext && this.playbackContext.state !== "closed") await this.playbackContext.close();
  }
}

class DeskpetPlaybackProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.inputSampleRate = options.processorOptions?.inputSampleRate || 24000;
    this.queue = [];
    this.queueOffset = 0;
    this.committed = false;
    this.started = false;
    this.levelAccumulator = 0;
    this.levelPeak = 0;
    this.levelSamples = 0;
    this.smoothedLevel = 0;
    this.levelWindow = Math.max(1, Math.round(sampleRate * 0.02));
    this.sourcePosition = 0;
    this.previousSample = 0;
    this.currentSample = 0;
    this.haveCurrentSample = false;
    this.sourceStep = this.inputSampleRate / sampleRate;

    this.port.onmessage = (event) => {
      if (event.data?.type === "pcm" && event.data.pcm) {
        this.queue.push(new Int16Array(event.data.pcm));
        this.committed = false;
        return;
      }
      if (event.data?.type === "commit") {
        this.committed = true;
        return;
      }
      if (event.data?.type === "flush") {
        this.queue = [];
        this.queueOffset = 0;
        this.committed = false;
        this.started = false;
        this.sourcePosition = 0;
        this.haveCurrentSample = false;
        this.levelAccumulator = 0;
        this.levelPeak = 0;
        this.levelSamples = 0;
        this.smoothedLevel = 0;
        this.port.postMessage({ type: "level", level: 0 });
      }
    };
  }

  readSourceSample() {
    while (this.queue.length) {
      const head = this.queue[0];
      if (this.queueOffset < head.length) {
        return head[this.queueOffset++] / 32768;
      }
      this.queue.shift();
      this.queueOffset = 0;
    }
    return null;
  }

  nextSample() {
    if (!this.haveCurrentSample) {
      const first = this.readSourceSample();
      if (first === null) return null;
      this.previousSample = first;
      this.currentSample = this.readSourceSample();
      if (this.currentSample === null) this.currentSample = this.previousSample;
      this.haveCurrentSample = true;
      this.sourcePosition = 0;
    }

    const value = this.previousSample + (this.currentSample - this.previousSample) * this.sourcePosition;
    this.sourcePosition += this.sourceStep;
    while (this.sourcePosition >= 1) {
      this.sourcePosition -= 1;
      this.previousSample = this.currentSample;
      const next = this.readSourceSample();
      if (next === null) {
        if (this.queue.length === 0 && this.queueOffset === 0) {
          this.haveCurrentSample = false;
          return value;
        }
        this.currentSample = this.previousSample;
      } else {
        this.currentSample = next;
      }
    }
    return value;
  }

  emitLevel(sample) {
    const absolute = Math.abs(sample);
    this.levelAccumulator += sample * sample;
    this.levelPeak = Math.max(this.levelPeak, absolute);
    this.levelSamples += 1;
    if (this.levelSamples < this.levelWindow) return;

    const rms = Math.sqrt(this.levelAccumulator / this.levelSamples);
    const rmsLevel = Math.max(0, (rms - 0.004) * 11);
    const peakLevel = Math.max(0, (this.levelPeak - 0.012) * 3.8);
    let target = Math.min(1, Math.max(rmsLevel, peakLevel));
    if (target < 0.025) target = 0;

    const smoothing = target > this.smoothedLevel ? 0.72 : 0.38;
    this.smoothedLevel += (target - this.smoothedLevel) * smoothing;
    if (target === 0 && this.smoothedLevel < 0.018) this.smoothedLevel = 0;

    this.port.postMessage({ type: "level", level: this.smoothedLevel });
    this.levelAccumulator = 0;
    this.levelPeak = 0;
    this.levelSamples = 0;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const channel = output?.[0];
    if (!channel) return true;

    let rendered = false;
    for (let i = 0; i < channel.length; i += 1) {
      const sample = this.nextSample();
      if (sample === null) {
        channel[i] = 0;
        this.emitLevel(0);
        continue;
      }
      if (!this.started) {
        this.started = true;
        this.port.postMessage({ type: "playback-start" });
      }
      rendered = true;
      channel[i] = sample;
      this.emitLevel(sample);
    }

    if (!rendered && this.committed && this.started && this.queue.length === 0 && !this.haveCurrentSample) {
      this.started = false;
      this.committed = false;
      this.smoothedLevel = 0;
      this.port.postMessage({ type: "level", level: 0 });
      this.port.postMessage({ type: "playback-end" });
    }
    return true;
  }
}

registerProcessor("deskpet-playback", DeskpetPlaybackProcessor);

class DeskPetCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetRate = options.processorOptions?.targetSampleRate ?? 16000;
    this.chunkSamples = options.processorOptions?.chunkSamples ?? 320;
    this.ratio = sampleRate / this.targetRate;
    this.source = [];
    this.output = [];
    this.readPosition = 0;
    this.levelTick = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    let energy = 0;
    for (let i = 0; i < channel.length; i += 1) {
      const sample = channel[i];
      this.source.push(sample);
      energy += sample * sample;
    }
    this.levelTick += channel.length;
    if (this.levelTick >= sampleRate / 30) {
      this.port.postMessage({ type: "level", level: Math.min(1, Math.sqrt(energy / channel.length) * 6) });
      this.levelTick = 0;
    }

    while (this.readPosition + 1 < this.source.length) {
      const left = Math.floor(this.readPosition);
      const fraction = this.readPosition - left;
      const sample = this.source[left] * (1 - fraction) + this.source[left + 1] * fraction;
      this.output.push(Math.max(-32768, Math.min(32767, Math.round(sample * 32767))));
      this.readPosition += this.ratio;
      if (this.output.length >= this.chunkSamples) {
        const pcm = Int16Array.from(this.output.splice(0, this.chunkSamples));
        this.port.postMessage({ type: "pcm", pcm: pcm.buffer }, [pcm.buffer]);
      }
    }
    const consumed = Math.floor(this.readPosition);
    if (consumed > 0) {
      this.source.splice(0, consumed);
      this.readPosition -= consumed;
    }
    return true;
  }
}

registerProcessor("deskpet-capture", DeskPetCaptureProcessor);

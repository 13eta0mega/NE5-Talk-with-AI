class DeskPetPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.wasActive = false;
    this.levelCounter = 0;
    this.levelEnergy = 0;
    this.consumedSinceReport = 0;
    this.port.onmessage = (event) => {
      if (event.data.type === "push") this.queue.push(new Float32Array(event.data.frames));
      if (event.data.type === "flush") {
        this.queue = [];
        this.offset = 0;
        this.wasActive = false;
        this.port.postMessage({ type: "consumed", consumed: this.consumedSinceReport });
        this.consumedSinceReport = 0;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    let wrote = 0;
    for (let i = 0; i < output.length; i += 1) {
      while (this.queue.length && this.offset >= this.queue[0].length) {
        this.queue.shift();
        this.offset = 0;
      }
      const sample = this.queue.length ? this.queue[0][this.offset++] : 0;
      output[i] = sample;
      if (this.queue.length) {
        wrote += 1;
        this.levelEnergy += sample * sample;
        this.levelCounter += 1;
      }
    }
    this.consumedSinceReport += wrote;
    const active = this.queue.length > 0;
    if (this.levelCounter >= sampleRate / 40 || (this.wasActive && !active)) {
      const level = this.levelCounter ? Math.min(1, Math.sqrt(this.levelEnergy / this.levelCounter) * 3.8) : 0;
      this.port.postMessage({ type: "level", level });
      this.levelCounter = 0;
      this.levelEnergy = 0;
    }
    if ((this.consumedSinceReport >= sampleRate / 20) || (wrote > 0 && !active) || (this.wasActive && !active)) {
      this.port.postMessage({ type: "consumed", consumed: this.consumedSinceReport });
      this.consumedSinceReport = 0;
    }
    this.wasActive = active;
    return true;
  }
}

registerProcessor("deskpet-playback", DeskPetPlaybackProcessor);

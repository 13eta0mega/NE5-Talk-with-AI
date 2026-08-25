export class AudioGate {
  private openState = false;
  private speakingState = false;
  private sentBytes = 0;
  private droppedBytes = 0;
  private sentDuringSpeaking = 0;

  open(): void {
    if (!this.speakingState) this.openState = true;
  }

  close(): void {
    this.openState = false;
  }

  setSpeaking(speaking: boolean): void {
    this.speakingState = speaking;
    if (speaking) this.openState = false;
  }

  forward(chunk: Int16Array, send: (chunk: Int16Array) => void): boolean {
    const bytes = chunk.byteLength;
    if (!this.openState || this.speakingState) {
      this.droppedBytes += bytes;
      return false;
    }
    if (this.speakingState) this.sentDuringSpeaking += bytes;
    send(chunk);
    this.sentBytes += bytes;
    return true;
  }

  diagnostics() {
    return {
      open: this.openState,
      speaking: this.speakingState,
      sentBytes: this.sentBytes,
      droppedBytes: this.droppedBytes,
      outgoingMicBytesDuringSpeaking: this.sentDuringSpeaking,
    };
  }
}

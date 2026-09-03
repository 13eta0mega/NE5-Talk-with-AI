export const MIC_LOCAL_MIN_SPEECH_MS = 100;
export const MIC_LOCAL_END_SILENCE_MS = 1200;
export const MIC_LOCAL_START_CONFIRM_MS = 60;

export type MicTurnSignal = "speech-start" | "speech-end";

export interface MicTurnDiagnostics {
  speaking: boolean;
  noiseFloor: number;
  lastRms: number;
  speechMs: number;
  silenceMs: number;
}

function pcmRms(pcm: Int16Array): number {
  if (!pcm.length) return 0;
  let energy = 0;
  for (let i = 0; i < pcm.length; i += 1) {
    const normalized = pcm[i] / 32768;
    energy += normalized * normalized;
  }
  return Math.sqrt(energy / pcm.length);
}

/**
 * Lightweight client-side speech activity detector used alongside Gemini server
 * VAD. Server VAD owns conversational turn completion. The long local speech-end
 * threshold is diagnostic/fallback state only and must never terminate a normal
 * continuous microphone turn on a short mid-sentence pause.
 */
export class MicTurnDetector {
  private noiseFloor = 0.0025;
  private speaking = false;
  private candidateSpeechMs = 0;
  private speechMs = 0;
  private silenceMs = 0;
  private lastRms = 0;

  reset(): void {
    this.speaking = false;
    this.candidateSpeechMs = 0;
    this.speechMs = 0;
    this.silenceMs = 0;
    this.lastRms = 0;
  }

  feed(pcm: Int16Array, sampleRate = 16000): MicTurnSignal | undefined {
    if (!pcm.length || sampleRate <= 0) return undefined;
    const rms = pcmRms(pcm);
    this.lastRms = rms;
    const chunkMs = pcm.length / sampleRate * 1000;

    if (!this.speaking) {
      const startThreshold = Math.max(0.007, Math.min(0.035, this.noiseFloor * 2.4 + 0.002));
      if (rms >= startThreshold) {
        this.candidateSpeechMs += chunkMs;
        if (this.candidateSpeechMs >= MIC_LOCAL_START_CONFIRM_MS) {
          this.speaking = true;
          this.speechMs = this.candidateSpeechMs;
          this.silenceMs = 0;
          return "speech-start";
        }
      } else {
        this.candidateSpeechMs = 0;
        this.noiseFloor = Math.max(0.0008, Math.min(0.02, this.noiseFloor * 0.96 + rms * 0.04));
      }
      return undefined;
    }

    this.speechMs += chunkMs;
    const endThreshold = Math.max(0.005, Math.min(0.025, this.noiseFloor * 1.8 + 0.001));
    if (rms < endThreshold) {
      this.silenceMs += chunkMs;
      if (this.speechMs >= MIC_LOCAL_MIN_SPEECH_MS && this.silenceMs >= MIC_LOCAL_END_SILENCE_MS) {
        this.speaking = false;
        this.candidateSpeechMs = 0;
        this.speechMs = 0;
        this.silenceMs = 0;
        return "speech-end";
      }
    } else {
      this.silenceMs = 0;
    }
    return undefined;
  }

  diagnostics(): MicTurnDiagnostics {
    return {
      speaking: this.speaking,
      noiseFloor: this.noiseFloor,
      lastRms: this.lastRms,
      speechMs: this.speechMs,
      silenceMs: this.silenceMs,
    };
  }
}

export const GEMINI25_AUDIO_IDLE_COMMIT_MS = 900;
export const GEMINI25_MAX_COMPLETION_REPAIRS = 1;

const INCOMPLETE_CONNECTIVE = /(?:고|서|는데|지만|니까|면|면서|다가|거나|든지|때문에|그리고|그래서|하지만|또는|하는|되는|있는|없는|같은|위한|위해)$/;
const DANGLING_PARTICLE = /(?:은|는|이|가|을|를|에|의|와|과|도|만|부터|까지|로|으로)$/;
const COMPLETE_ENDING = /(?:[.!?…。！？~]|야|이야|예요|이에요|해|해요|했어|했어요|돼|돼요|거야|거예요|지|죠|네|군|구나|다|요|까|니|냐|래|어|아|자|겠습니다|입니다|한다|된다)$/;

export function looksLikePrematureCutoff(value: string): boolean {
  const text = value.trim();
  if (text.length < 4) return false;
  if (COMPLETE_ENDING.test(text)) return false;
  if (/[,;:·…(\[{'\"]$/.test(text)) return true;
  if (INCOMPLETE_CONNECTIVE.test(text)) return true;
  if (DANGLING_PARTICLE.test(text)) return true;
  return false;
}

export function completionRepairPrompt(): string {
  return "직전 음성 응답이 문장 중간에서 끊겼어. 이미 말한 내용은 반복하지 말고, 끊긴 지점 다음부터 즉시 이어서 한두 문장 안에 자연스럽게 완결해.";
}

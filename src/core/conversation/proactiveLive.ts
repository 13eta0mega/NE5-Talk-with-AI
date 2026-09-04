import { GeminiLiveAdapter } from "../gemini/GeminiLiveAdapter";

export const FIRST_PROACTIVE_IDLE_MS = 30_000;
export const FOLLOWUP_PROACTIVE_IDLE_MS = 90_000;
export const MAX_PROACTIVE_IDLE_NUDGES = 3;
export const PROACTIVE_MIC_RMS_THRESHOLD = 0.018;

const INTERNAL_IDLE_PROMPT = `[DESKPET_INTERNAL_IDLE_NUDGE]
이 메시지는 사용자가 말한 내용이 아니라 DeskPet의 내부 유휴 트리거다. 사용자 입력처럼 인용하거나 언급하지 않는다.
최근 대화 맥락을 먼저 떠올리고, 사용자가 잠시 조용한 상태이므로 캐릭터가 자연스럽게 먼저 말을 건다.
- 최근 주제가 분명하면 그 주제와 직접 이어지는 호기심이나 후속 질문을 1개 던진다.
- 최근 주제가 약하면 설정된 사용자 이름이 있을 때 가끔 이름을 부르거나, 아주 짧게 흥얼거리거나, "어디 갔어?"처럼 친근하게 찾는다.
- 매번 같은 표현을 반복하지 않는다. 흥얼거림은 한두 박자 정도의 짧은 비언어적 소리만 사용한다.
- 1~2개의 짧고 자연스러운 문장으로 말하고, "30초", "유휴", "타이머", "시스템" 같은 내부 사정은 절대 말하지 않는다.`;

type ProactiveState = {
  ready: boolean;
  userActivitySeen: boolean;
  nudgeCount: number;
  timer?: number;
};

type PatchedPrototype = GeminiLiveAdapter & {
  onEvent(callback: (event: any) => void): () => void;
  sendText(text: string): void;
  sendPcm16(chunk: Int16Array): void;
  close(): Promise<void>;
};

const states = new WeakMap<GeminiLiveAdapter, ProactiveState>();
let installed = false;

function stateFor(instance: GeminiLiveAdapter): ProactiveState {
  let state = states.get(instance);
  if (!state) {
    state = { ready: false, userActivitySeen: false, nudgeCount: 0 };
    states.set(instance, state);
  }
  return state;
}

function clearTimer(state: ProactiveState): void {
  if (state.timer !== undefined) window.clearTimeout(state.timer);
  state.timer = undefined;
}

export function proactiveIdleDelayMs(nudgeCount: number): number | undefined {
  if (nudgeCount >= MAX_PROACTIVE_IDLE_NUDGES) return undefined;
  return nudgeCount === 0 ? FIRST_PROACTIVE_IDLE_MS : FOLLOWUP_PROACTIVE_IDLE_MS;
}

export function proactiveIdlePrompt(): string {
  return INTERNAL_IDLE_PROMPT;
}

export function pcmLooksLikeUserSpeech(chunk: Int16Array): boolean {
  if (!chunk.length) return false;
  let energy = 0;
  const stride = Math.max(1, Math.floor(chunk.length / 320));
  let samples = 0;
  for (let index = 0; index < chunk.length; index += stride) {
    const normalized = chunk[index] / 32768;
    energy += normalized * normalized;
    samples += 1;
  }
  return Math.sqrt(energy / Math.max(1, samples)) >= PROACTIVE_MIC_RMS_THRESHOLD;
}

function markRealUserActivity(instance: GeminiLiveAdapter): void {
  const state = stateFor(instance);
  clearTimer(state);
  state.userActivitySeen = true;
  state.nudgeCount = 0;
}

function scheduleIdleNudge(instance: GeminiLiveAdapter, originalSendText: (this: GeminiLiveAdapter, text: string) => void): void {
  const state = stateFor(instance);
  clearTimer(state);
  if (!state.ready || !state.userActivitySeen || !instance.isReady) return;
  const delay = proactiveIdleDelayMs(state.nudgeCount);
  if (delay === undefined) return;
  state.timer = window.setTimeout(() => {
    state.timer = undefined;
    if (!state.ready || !state.userActivitySeen || !instance.isReady) return;
    state.nudgeCount += 1;
    try {
      originalSendText.call(instance, INTERNAL_IDLE_PROMPT);
    } catch {
      // Connection recovery remains the coordinator's responsibility. A proactive
      // nudge must never turn an otherwise healthy conversation into an error state.
    }
  }, delay);
}

export function installProactiveLiveConversation(): void {
  if (installed) return;
  installed = true;

  const prototype = GeminiLiveAdapter.prototype as PatchedPrototype;
  const originalOnEvent = prototype.onEvent;
  const originalSendText = prototype.sendText;
  const originalSendPcm16 = prototype.sendPcm16;
  const originalClose = prototype.close;

  prototype.onEvent = function onEvent(callback) {
    return originalOnEvent.call(this, (event) => {
      const state = stateFor(this);
      switch (event.type) {
        case "connected":
          state.ready = true;
          break;
        case "input-transcript":
          markRealUserActivity(this);
          break;
        case "turn-complete":
        case "waiting-for-input":
          scheduleIdleNudge(this, originalSendText);
          break;
        case "closed":
        case "error":
          state.ready = false;
          clearTimer(state);
          break;
        default:
          break;
      }
      callback(event);
    });
  };

  prototype.sendText = function sendText(text) {
    if (text.trim()) markRealUserActivity(this);
    return originalSendText.call(this, text);
  };

  prototype.sendPcm16 = function sendPcm16(chunk) {
    if (pcmLooksLikeUserSpeech(chunk)) markRealUserActivity(this);
    return originalSendPcm16.call(this, chunk);
  };

  prototype.close = async function close() {
    const state = stateFor(this);
    state.ready = false;
    clearTimer(state);
    return originalClose.call(this);
  };
}

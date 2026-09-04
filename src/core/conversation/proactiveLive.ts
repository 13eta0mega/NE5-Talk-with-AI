import { ConversationCoordinator, type ConversationSnapshot } from "./ConversationCoordinator";

export const FIRST_PROACTIVE_IDLE_MS = 30_000;
export const FOLLOWUP_PROACTIVE_IDLE_MS = 90_000;
export const MAX_PROACTIVE_IDLE_NUDGES = 3;

const INTERNAL_IDLE_MARKER = "[DESKPET_INTERNAL_IDLE_NUDGE]";
const INTERNAL_IDLE_PROMPT = `${INTERNAL_IDLE_MARKER}
이 메시지는 사용자가 말한 내용이 아니라 DeskPet의 내부 유휴 트리거다. 사용자 입력처럼 인용하거나 언급하지 않는다.
최근 대화 맥락을 먼저 떠올리고, 사용자가 잠시 조용한 상태이므로 캐릭터가 자연스럽게 먼저 말을 건다.
- 최근 주제가 분명하면 그 주제와 직접 이어지는 호기심이나 후속 질문을 1개 던진다.
- 최근 주제가 약하면 설정된 사용자 이름이 있을 때 가끔 이름을 부르거나, 아주 짧게 흥얼거리거나, "어디 갔어?"처럼 친근하게 찾는다.
- 매번 같은 표현을 반복하지 않는다. 흥얼거림은 한두 박자 정도의 짧은 비언어적 소리만 사용한다.
- 1~2개의 짧고 자연스러운 문장으로 말하고, "30초", "유휴", "타이머", "시스템" 같은 내부 사정은 절대 말하지 않는다.`;

type ProactiveState = {
  nudgeCount: number;
  timer?: number;
  latest?: ConversationSnapshot;
  lastObservedInputTranscript: string;
  lastPublicInputTranscript: string;
};

type PatchedPrototype = ConversationCoordinator & {
  subscribe(listener: (value: ConversationSnapshot) => void): () => void;
  sendText(text: string): Promise<void>;
};

let states = new WeakMap<ConversationCoordinator, ProactiveState>();
let installed = false;
let restorePrototype: (() => void) | undefined;

function stateFor(instance: ConversationCoordinator): ProactiveState {
  let state = states.get(instance);
  if (!state) {
    state = {
      nudgeCount: 0,
      lastObservedInputTranscript: "",
      lastPublicInputTranscript: "",
    };
    states.set(instance, state);
  }
  return state;
}

function clearTimer(state: ProactiveState): void {
  if (state.timer !== undefined) window.clearTimeout(state.timer);
  state.timer = undefined;
}

function isInternalIdleInput(value: string): boolean {
  return value.includes(INTERNAL_IDLE_MARKER);
}

export function proactiveIdleDelayMs(nudgeCount: number): number | undefined {
  if (nudgeCount >= MAX_PROACTIVE_IDLE_NUDGES) return undefined;
  return nudgeCount === 0 ? FIRST_PROACTIVE_IDLE_MS : FOLLOWUP_PROACTIVE_IDLE_MS;
}

export function proactiveIdlePrompt(): string {
  return INTERNAL_IDLE_PROMPT;
}

function markRealUserActivity(instance: ConversationCoordinator): void {
  const state = stateFor(instance);
  clearTimer(state);
  state.nudgeCount = 0;
}

function publicSnapshot(state: ProactiveState, snapshot: ConversationSnapshot): ConversationSnapshot {
  if (!isInternalIdleInput(snapshot.inputTranscript)) return snapshot;
  return { ...snapshot, inputTranscript: state.lastPublicInputTranscript };
}

function scheduleIdleNudge(
  instance: ConversationCoordinator,
  originalSendText: (this: ConversationCoordinator, text: string) => Promise<void>,
): void {
  const state = stateFor(instance);
  clearTimer(state);
  if (state.latest?.phase !== "listening" || !instance.provider.isReady) return;
  const delay = proactiveIdleDelayMs(state.nudgeCount);
  if (delay === undefined) return;

  state.timer = window.setTimeout(() => {
    state.timer = undefined;
    if (state.latest?.phase !== "listening" || !instance.provider.isReady) return;
    state.nudgeCount += 1;

    // Use the coordinator's ordinary text-turn path so a proactive turn owns the
    // microphone gate, phase changes, playback and listening restoration exactly
    // like a user-initiated text turn. Never write directly to the Live socket.
    void originalSendText.call(instance, INTERNAL_IDLE_PROMPT).catch(() => {
      // Proactive speech is optional. Normal coordinator recovery owns connection
      // errors, and a failed nudge must never add a second competing recovery path.
    });
  }, delay);
}

export function installProactiveLiveConversation(): void {
  if (installed) return;
  installed = true;

  const prototype = ConversationCoordinator.prototype as PatchedPrototype;
  const originalSubscribe = prototype.subscribe;
  const originalSendText = prototype.sendText;

  prototype.subscribe = function subscribe(listener) {
    return originalSubscribe.call(this, (snapshot) => {
      const state = stateFor(this);
      const previousPhase = state.latest?.phase;
      state.latest = snapshot;

      const input = snapshot.inputTranscript.trim();
      const internalInput = isInternalIdleInput(input);
      const newRealInput = Boolean(input)
        && !internalInput
        && input !== state.lastObservedInputTranscript;

      if (newRealInput) {
        state.lastObservedInputTranscript = input;
        state.lastPublicInputTranscript = snapshot.inputTranscript;
        markRealUserActivity(this);
      }

      listener(publicSnapshot(state, snapshot));

      if (snapshot.phase === "disconnected") {
        clearTimer(state);
        state.nudgeCount = 0;
        state.lastObservedInputTranscript = "";
        state.lastPublicInputTranscript = "";
        return;
      }

      if (snapshot.phase !== "listening") {
        clearTimer(state);
        return;
      }

      // Entering listening arms the companion even before the first user utterance.
      // Streaming user transcription restarts the same inactivity clock, and after a
      // model turn the speaking/thinking -> listening transition arms the next nudge.
      if (newRealInput || previousPhase !== "listening") {
        scheduleIdleNudge(this, originalSendText);
      }
    });
  };

  prototype.sendText = async function sendText(text) {
    const value = text.trim();
    if (value && !isInternalIdleInput(value)) markRealUserActivity(this);
    return originalSendText.call(this, text);
  };

  restorePrototype = () => {
    prototype.subscribe = originalSubscribe;
    prototype.sendText = originalSendText;
  };
}

export function uninstallProactiveLiveConversationForTests(): void {
  restorePrototype?.();
  restorePrototype = undefined;
  installed = false;
  states = new WeakMap<ConversationCoordinator, ProactiveState>();
}

import type { ConversationPhase } from "../types";

export type SessionEvent =
  | "CONNECT" | "CONNECTED" | "START_LISTENING" | "USER_SPEECH_END"
  | "MODEL_AUDIO_START" | "PLAYBACK_DRAINED" | "RECONNECT"
  | "RECONNECTED" | "DISCONNECT" | "FAIL" | "RETRY";

export function nextPhase(current: ConversationPhase, event: SessionEvent): ConversationPhase {
  if (event === "FAIL") return "error";
  if (event === "DISCONNECT") return "disconnected";
  if (event === "RECONNECT") return "reconnecting";
  switch (current) {
    case "disconnected": return event === "CONNECT" ? "connecting" : current;
    case "connecting": return event === "CONNECTED" ? "idle" : current;
    case "idle": return event === "START_LISTENING" ? "listening" : current;
    case "listening":
      if (event === "USER_SPEECH_END") return "thinking";
      if (event === "MODEL_AUDIO_START") return "speaking";
      return current;
    case "thinking": return event === "MODEL_AUDIO_START" ? "speaking" : current;
    case "speaking": return event === "PLAYBACK_DRAINED" ? "listening" : current;
    case "reconnecting": return event === "RECONNECTED" ? "idle" : current;
    case "error": return event === "RETRY" ? "connecting" : current;
    default: return current;
  }
}

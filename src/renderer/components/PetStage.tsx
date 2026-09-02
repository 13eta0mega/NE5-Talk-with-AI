import type { CharacterProfile } from "../../characters/catalog";
import type { ConversationPhase, EmotionId } from "../../core/types";
import { GreusCat, type IdleAction } from "./GreusCat";

export const MIN_AUDIBLE_SPEECH_LEVEL = .018;

export function PetStage({
  profile,
  emotion,
  phase,
  mouthLevel,
  inputLevel,
  customColor,
  idleAction,
}: {
  profile: CharacterProfile;
  emotion: EmotionId;
  intensity: number;
  phase: ConversationPhase;
  mouthLevel: number;
  inputLevel: number;
  customColor: string;
  idleAction: IdleAction | "auto";
}) {
  const audibleSpeechLevel = phase === "speaking" ? Math.max(0, Math.min(1, mouthLevel)) : 0;
  return (
    <GreusCat
      coat={profile.coat}
      customColor={customColor}
      emotion={emotion}
      bodyRatio={.86}
      size={530}
      className="pet-svg"
      label={`${profile.displayName} 캐릭터, ${emotion}`}
      easing="ease-in-out"
      durationMs={780}
      idleAnchor="bottom-center"
      isSpeaking={phase === "speaking" && audibleSpeechLevel >= MIN_AUDIBLE_SPEECH_LEVEL}
      speechLevel={audibleSpeechLevel}
      microphoneActive={phase === "listening"}
      microphoneLevel={inputLevel}
      idleAction={idleAction === "auto" ? undefined : idleAction}
      enableIdleActions={idleAction === "auto"}
    />
  );
}

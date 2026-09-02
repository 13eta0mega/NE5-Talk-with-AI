import type { CharacterProfile } from "../../characters/catalog";
import type { ConversationPhase, EmotionId } from "../../core/types";
import { GreusCat, type IdleAction } from "./GreusCat";

export const ORIGINAL_SPEECH_LEVEL = .72;

export function PetStage({
  profile,
  emotion,
  phase,
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
      isSpeaking={phase === "speaking"}
      speechLevel={ORIGINAL_SPEECH_LEVEL}
      microphoneActive={phase === "listening"}
      microphoneLevel={inputLevel}
      idleAction={idleAction === "auto" ? undefined : idleAction}
      enableIdleActions={idleAction === "auto"}
    />
  );
}

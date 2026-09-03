import type { LiveModelOption, LogicalSessionPublic, SecureSettingsPublic } from "../core/types";

declare global {
  interface Window {
    deskPet?: {
      auth: {
        createLiveToken(request: { characterId: string; voiceName: string; modelId: string; freshSession?: boolean }): Promise<{
          token: string;
          model: string;
          expiresAt: number;
          hasResumeState: boolean;
        }>;
      };
      settings: {
        get(): Promise<SecureSettingsPublic>;
        saveApiKey(value: string): Promise<{ ok: true }>;
        clearApiKey(): Promise<{ ok: true }>;
        savePreferences(value: {
          voiceName?: string; modelId?: string; characterId?: string; microphoneId?: string;
          speakerId?: string; transcriptEnabled?: boolean;
        }): Promise<{ ok: true }>;
      };
      catalog: { listLiveModels(): Promise<LiveModelOption[]> };
      session: {
        get(characterId: string): Promise<LogicalSessionPublic>;
        update(patch: Record<string, unknown>): Promise<{ ok: true }>;
      };
    };
  }
}

export {};

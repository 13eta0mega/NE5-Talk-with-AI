import type { LogicalSessionPublic, SecureSettingsPublic } from "../core/types";
import { CHARACTER_VOICE_PROFILE_VERSION, DEFAULT_LIVE_MODEL, DEFAULT_VOICE_NAME } from "../core/gemini/catalog";

const SETTINGS_KEY = "deskpet:mobile-settings:v1";
const SESSION_PREFIX = "deskpet:mobile-session:v1:";
const VOICE_PROFILE_VERSION_KEY = "deskpet:voice-profile-version";

type StoredSettings = Pick<SecureSettingsPublic,
  "selectedVoiceName" | "selectedModelId" | "selectedCharacterId" |
  "microphoneId" | "speakerId" | "transcriptEnabled">;

type StoredSession = LogicalSessionPublic & {
  resumeHandle?: string;
  resumeHandleUpdatedAt?: number;
  resumeVoiceName?: string;
  resumeModelId?: string;
  memorySummary?: string;
};

const defaultSettings: StoredSettings = {
  selectedVoiceName: DEFAULT_VOICE_NAME,
  selectedModelId: DEFAULT_LIVE_MODEL,
  selectedCharacterId: "greus-greeny",
  microphoneId: "default",
  speakerId: "default",
  transcriptEnabled: true,
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) as object } : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function readStoredSettings(): StoredSettings {
  const settings = readJson(SETTINGS_KEY, defaultSettings);
  const profileVersion = Number(localStorage.getItem(VOICE_PROFILE_VERSION_KEY) ?? "1");
  if (profileVersion < CHARACTER_VOICE_PROFILE_VERSION && settings.selectedVoiceName === "Kore") {
    const migrated = { ...settings, selectedVoiceName: DEFAULT_VOICE_NAME };
    writeJson(SETTINGS_KEY, migrated);
    localStorage.setItem(VOICE_PROFILE_VERSION_KEY, String(CHARACTER_VOICE_PROFILE_VERSION));
    return migrated;
  }
  if (profileVersion < CHARACTER_VOICE_PROFILE_VERSION) {
    localStorage.setItem(VOICE_PROFILE_VERSION_KEY, String(CHARACTER_VOICE_PROFILE_VERSION));
  }
  return settings;
}

function sessionKey(characterId: string): string {
  return `${SESSION_PREFIX}${characterId}`;
}

function getStoredSession(characterId: string): StoredSession {
  const settings = readStoredSettings();
  return readJson<StoredSession>(sessionKey(characterId), {
    characterId,
    logicalSessionId: crypto.randomUUID(),
    selectedVoiceName: settings.selectedVoiceName,
    selectedModelId: settings.selectedModelId,
    updatedAt: Date.now(),
  });
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new Error("모바일 토큰 서버에 연결하지 못했습니다. HTTPS 배포 주소와 네트워크를 확인해 주세요.");
  }
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || `서버 요청에 실패했습니다. (${response.status})`);
  return payload;
}

export function installMobileBridge(): void {
  if (window.deskPet) return;

  window.deskPet = {
    auth: {
      async createLiveToken(request) {
        const session = getStoredSession(request.characterId);
        return apiRequest("./api/live-token", {
          method: "POST",
          body: JSON.stringify({
            ...request,
            resumeHandle: session.resumeHandle,
            resumeVoiceName: session.resumeVoiceName,
            resumeModelId: session.resumeModelId,
            memorySummary: session.memorySummary,
          }),
        });
      },
    },
    settings: {
      async get() {
        const local = readStoredSettings();
        const status = await apiRequest<{ hasApiKey: boolean }>("./api/mobile-status").catch(() => ({ hasApiKey: false }));
        return {
          hasApiKey: status.hasApiKey,
          keySource: "broker",
          apiKeyEditable: false,
          encryptionAvailable: false,
          ...local,
        } satisfies SecureSettingsPublic;
      },
      async saveApiKey() {
        throw new Error("모바일에서는 호스팅 서버의 GEMINI_API_KEY 환경 변수를 사용합니다.");
      },
      async clearApiKey() {
        throw new Error("모바일 API 키는 호스팅 서버에서만 변경할 수 있습니다.");
      },
      async savePreferences(patch) {
        const current = readStoredSettings();
        writeJson(SETTINGS_KEY, { ...current, ...patch });
        return { ok: true };
      },
    },
    catalog: {
      listLiveModels: () => apiRequest("./api/live-models"),
    },
    session: {
      async get(characterId) {
        const session = getStoredSession(characterId);
        writeJson(sessionKey(characterId), session);
        const { resumeHandle: _resumeHandle, memorySummary: _memorySummary, ...publicSession } = session;
        return publicSession;
      },
      async update(patch) {
        if (typeof patch.characterId !== "string") throw new Error("캐릭터 세션 정보가 없습니다.");
        const current = getStoredSession(patch.characterId);
        const next = { ...current, ...patch, characterId: patch.characterId, updatedAt: Date.now() } as StoredSession;
        if (patch.resumeHandle === null) {
          delete next.resumeHandle;
          delete next.resumeHandleUpdatedAt;
          delete next.resumeVoiceName;
          delete next.resumeModelId;
        }
        writeJson(sessionKey(patch.characterId), next);
        return { ok: true };
      },
    },
  };
}

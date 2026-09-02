import { useEffect, useMemo, useRef, useState } from "react";
import { characterById } from "../characters/catalog";
import { ConversationCoordinator, type ConversationSnapshot } from "../core/conversation/ConversationCoordinator";
import { EMOTION_IDS, normalizeEmotionId, type ConversationPhase, type EmotionId, type LiveModelOption, type SecureSettingsPublic } from "../core/types";
import { DEFAULT_LIVE_MODEL, DEFAULT_VOICE_NAME } from "../core/gemini/catalog";
import { EMOTION_META } from "../core/emotion";
import { CharacterPicker } from "./components/CharacterPicker";
import { ChatPanel, type ChatMessage } from "./components/ChatPanel";
import { PetStage } from "./components/PetStage";
import { IDLE_ACTIONS, type IdleAction } from "./components/GreusCat";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { EMOTION_AUDIO_ACTIVITY_THRESHOLD, shouldResetEmotion } from "./emotionReset";

const INITIAL_SNAPSHOT: ConversationSnapshot = {
  phase: "disconnected", inputTranscript: "", outputTranscript: "", resumed: false, reconnectCount: 0,
};

const STATUS: Record<ConversationPhase, { label: string; note: string }> = {
  disconnected: { label: "쉬는 중", note: "Live로 연결하거나 데모를 시작해 보세요" },
  connecting: { label: "연결 중", note: "대화를 준비하고 있어요" },
  idle: { label: "함께 있어요", note: "마이크를 켜거나 채팅으로 이야기해 보세요" },
  listening: { label: "듣는 중", note: "천천히 이야기해 주세요" },
  thinking: { label: "생각 중", note: "무슨 말이 좋을지 고르는 중이에요" },
  speaking: { label: "말하는 중", note: "재생이 끝날 때까지 마이크는 잠시 쉬어요" },
  reconnecting: { label: "연결 복구 중", note: "대화의 흐름은 그대로 보존됩니다" },
  error: { label: "잠시 멈춤", note: "설정을 확인하고 다시 연결해 주세요" },
};

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const readableError = (error: unknown, fallback: string) => {
  const raw = error instanceof Error ? error.message : fallback;
  return raw.replace(/^Error invoking remote method '[^']+': Error:\s*/, "");
};

const IDLE_ACTION_LABEL: Record<(typeof IDLE_ACTIONS)[number], string> = {
  "air-punch": "냥냥 펀치", sleep: "잠자기", stretch: "기지개", groom: "세수하기",
  yawn: "하품", knead: "꾹꾹이", butterfly: "나비 사냥",
};

export default function App() {
  const coordinator = useMemo(() => new ConversationCoordinator(), []);
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);
  const [characterId, setCharacterId] = useState(() => characterById(localStorage.getItem("deskpet:selected-character") ?? "").id);
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE_NAME);
  const [modelId, setModelId] = useState<string>(DEFAULT_LIVE_MODEL);
  const [secureSettings, setSecureSettings] = useState<SecureSettingsPublic>();
  const [liveModels, setLiveModels] = useState<LiveModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [emotion, setEmotion] = useState<EmotionId>("idle");
  const [emotionIntensity, setEmotionIntensity] = useState(1);
  const [inputLevel, setInputLevel] = useState(0);
  const [mouthLevel, setMouthLevel] = useState(0);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [microphoneId, setMicrophoneId] = useState("default");
  const [speakerId, setSpeakerId] = useState("default");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [transcriptEnabled, setTranscriptEnabled] = useState(true);
  const [notice, setNotice] = useState<string>();
  const [demoPhase, setDemoPhase] = useState<ConversationPhase>();
  const [customColor, setCustomColor] = useState(() => localStorage.getItem("deskpet:custom-coat") ?? "#8fd6ff");
  const [idlePreview, setIdlePreview] = useState<IdleAction | "auto">("auto");
  const demoRun = useRef(0);
  const chatMessageId = useRef(0);
  const lastAssistantMessage = useRef("");
  const emotionRef = useRef<EmotionId>(emotion);
  const phaseRef = useRef<ConversationPhase>(INITIAL_SNAPSHOT.phase);
  const inputLevelRef = useRef(0);
  const mouthLevelRef = useRef(0);
  const lastEmotionActivityAt = useRef(Date.now());
  const profile = characterById(characterId);
  const phase = demoPhase ?? snapshot.phase;
  const audioCapabilities = coordinator.audio.deviceCapabilities;

  useEffect(() => coordinator.subscribe(setSnapshot), [coordinator]);
  const refreshModels = async () => {
    if (!window.deskPet) return;
    setModelsLoading(true);
    try { setLiveModels(await window.deskPet.catalog.listLiveModels()); }
    catch (error) { setNotice(readableError(error, "Live 모델 목록을 불러오지 못했습니다.")); }
    finally { setModelsLoading(false); }
  };

  useEffect(() => {
    void window.deskPet?.settings.get().then((settings) => {
      setSecureSettings(settings);
      setVoice(settings.selectedVoiceName || DEFAULT_VOICE_NAME);
      setModelId(settings.selectedModelId || DEFAULT_LIVE_MODEL);
      setCharacterId(characterById(settings.selectedCharacterId || "").id);
      setMicrophoneId(settings.microphoneId || "default");
      const nextSpeakerId = audioCapabilities.speakerSelection ? settings.speakerId || "default" : "default";
      setSpeakerId(nextSpeakerId);
      void coordinator.audio.setOutputDevice(nextSpeakerId).catch((error) => setNotice(error.message));
      setTranscriptEnabled(settings.transcriptEnabled !== false);
      if (settings.hasApiKey) void refreshModels();
    });
  }, [audioCapabilities.speakerSelection, coordinator]);

  useEffect(() => {
    coordinator.onExpression((nextEmotion, intensity) => {
      setEmotion(nextEmotion);
      setEmotionIntensity(intensity);
      void window.deskPet?.session.update({ characterId, lastEmotion: nextEmotion });
    });
    coordinator.audio.onInputLevel = setInputLevel;
    coordinator.audio.onOutputLevel = setMouthLevel;
  }, [coordinator, characterId]);

  useEffect(() => {
    const text = snapshot.outputTranscript.trim();
    if (!text || !["idle", "listening"].includes(snapshot.phase) || text === lastAssistantMessage.current) return;
    lastAssistantMessage.current = text;
    setChatMessages((messages) => [...messages, { id: ++chatMessageId.current, role: "assistant", text }]);
  }, [snapshot.outputTranscript, snapshot.phase]);

  useEffect(() => {
    localStorage.setItem("deskpet:selected-character", characterId);
    void window.deskPet?.session.get(characterId).then((session) => {
      if (session.lastEmotion) setEmotion(normalizeEmotionId(session.lastEmotion));
    });
  }, [characterId]);

  useEffect(() => {
    emotionRef.current = emotion;
    if (emotion !== "idle" && emotion !== "listening") lastEmotionActivityAt.current = Date.now();
  }, [emotion]);

  useEffect(() => {
    phaseRef.current = phase;
    inputLevelRef.current = inputLevel;
    mouthLevelRef.current = mouthLevel;
    if (
      ["connecting", "reconnecting", "thinking", "speaking"].includes(phase)
      || inputLevel >= EMOTION_AUDIO_ACTIVITY_THRESHOLD
      || mouthLevel >= EMOTION_AUDIO_ACTIVITY_THRESHOLD
    ) {
      lastEmotionActivityAt.current = Date.now();
    }
  }, [phase, inputLevel, mouthLevel]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!shouldResetEmotion({
        emotion: emotionRef.current,
        phase: phaseRef.current,
        inputLevel: inputLevelRef.current,
        mouthLevel: mouthLevelRef.current,
        lastActivityAt: lastEmotionActivityAt.current,
        now: Date.now(),
      })) return;
      lastEmotionActivityAt.current = Date.now();
      setIdlePreview("auto");
      coordinator.resetExpression();
    }, 400);
    return () => window.clearInterval(timer);
  }, [coordinator]);

  useEffect(() => () => { void coordinator.dispose(); }, [coordinator]);

  const refreshDevices = async (requestPermission = false) => {
    try {
      const devices = await coordinator.audio.listDevices(requestPermission);
      setMicrophones(devices.microphones);
      setSpeakers(devices.speakers);
      setNotice(undefined);
    } catch (error) {
      setNotice(error instanceof Error ? `장치 권한: ${error.message}` : "오디오 장치를 불러오지 못했습니다.");
    }
  };

  const pickSpeaker = async () => {
    try {
      const selected = await coordinator.audio.requestOutputDevice(speakerId);
      setSpeakerId(selected.deviceId);
      void window.deskPet?.settings.savePreferences({ speakerId: selected.deviceId });
      const devices = await coordinator.audio.listDevices(false);
      setMicrophones(devices.microphones);
      setSpeakers(devices.speakers);
      setNotice(`${selected.label || "선택한 출력 장치"}로 소리를 재생합니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "출력 장치를 선택하지 못했습니다.");
    }
  };

  useEffect(() => {
    void refreshDevices(false);
    const listener = () => void refreshDevices(false);
    navigator.mediaDevices?.addEventListener("devicechange", listener);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", listener);
  }, []);

  const connectLive = async () => {
    setNotice(undefined);
    try {
      await coordinator.connect(characterId, voice, modelId);
      await coordinator.startListening(microphoneId);
      await refreshDevices(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Live 연결에 실패했습니다.");
    }
  };

  const toggleMic = async () => {
    try {
      if (snapshot.phase === "listening") coordinator.stopListening();
      else if (["idle", "thinking"].includes(snapshot.phase)) await coordinator.startListening(microphoneId);
      else if (["disconnected", "error"].includes(snapshot.phase)) await connectLive();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "마이크를 시작하지 못했습니다.");
    }
  };

  const sendChat = async (text: string) => {
    setChatMessages((messages) => [...messages, { id: ++chatMessageId.current, role: "user", text }]);
    lastAssistantMessage.current = "";
    try {
      await coordinator.sendText(text);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "메시지를 보내지 못했습니다.");
      throw error;
    }
  };

  const selectCharacter = async (id: string) => {
    demoRun.current += 1;
    setDemoPhase(undefined);
    setPickerOpen(false);
    setCharacterId(id);
    setChatMessages([]);
    lastAssistantMessage.current = "";
    void window.deskPet?.settings.savePreferences({ characterId: id });
    setEmotion("idle");
    setEmotionIntensity(1);
    setIdlePreview("auto");
    await coordinator.switchCharacter(id, voice, modelId);
  };

  const previewIdleAction = (next: IdleAction | "auto") => {
    if (next === "auto") {
      setIdlePreview("auto");
      return;
    }
    setEmotion("idle");
    setEmotionIntensity(1);
    setIdlePreview("none");
    window.requestAnimationFrame(() => setIdlePreview(next));
  };

  const changeVoice = async (name: string) => {
    setVoice(name);
    try {
      await window.deskPet?.settings.savePreferences({ voiceName: name });
      await window.deskPet?.session.update({ characterId, selectedVoiceName: name, resumeHandle: null });
      await coordinator.changeVoice(name);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "음성을 변경하지 못했습니다.");
    }
  };

  const changeModel = async (nextModelId: string) => {
    setModelId(nextModelId);
    try {
      await window.deskPet?.settings.savePreferences({ modelId: nextModelId });
      await window.deskPet?.session.update({ characterId, selectedModelId: nextModelId, resumeHandle: null });
      await coordinator.changeModel(nextModelId);
    }
    catch (error) { setNotice(error instanceof Error ? error.message : "모델을 변경하지 못했습니다.")); }
  };

  const saveApiKey = async (value: string) => {
    if (!window.deskPet) throw new Error("Electron 앱에서 설정해 주세요.");
    try {
      await window.deskPet.settings.saveApiKey(value);
      const next = await window.deskPet.settings.get();
      setSecureSettings(next);
      setNotice("API 키를 Windows 보안 저장소에 암호화해 저장했습니다.");
      await refreshModels();
    } catch (error) {
      setNotice(readableError(error, "API 키를 저장하지 못했습니다."));
      throw error;
    }
  };

  const clearApiKey = async () => {
    if (!window.deskPet) return;
    await window.deskPet.settings.clearApiKey();
    setSecureSettings(await window.deskPet.settings.get());
    setLiveModels([]);
    setNotice("저장된 API 키를 삭제했습니다.");
  };

  const runDemo = async () => {
    const run = ++demoRun.current;
    setNotice("데모 모드: 실제 Gemini 연결 없이 상태·감정·립싱크를 시연합니다.");
    setDemoPhase("listening");
    setEmotion("curious");
    for (let i = 0; i < 46 && demoRun.current === run; i += 1) {
      setInputLevel(0.08 + Math.random() * 0.6);
      await delay(70);
    }
    if (demoRun.current !== run) return;
    setInputLevel(0);
    setDemoPhase("thinking");
    setEmotion("thinking");
    await delay(950);
    if (demoRun.current !== run) return;
    setDemoPhase("speaking");
    setEmotion("sad");
    setEmotionIntensity(0.78);
    for (let i = 0; i < 52 && demoRun.current === run; i += 1) {
      const syllable = Math.sin(i * 1.8) * 0.32 + Math.random() * 0.58;
      setMouthLevel(Math.max(0.04, syllable));
      await delay(55);
    }
    setMouthLevel(0);
    await delay(160);
    if (demoRun.current !== run) return;
    setDemoPhase("listening");
    await delay(650);
    setEmotion("happy");
    setEmotionIntensity(1);
    setDemoPhase(undefined);
  };

  const status = STATUS[phase];
  const chatDisabled = ["disconnected", "connecting", "reconnecting", "error", "speaking", "thinking"].includes(snapshot.phase);
  return (
    <div className="app-shell">
      <div className="ambient-blob blob-a" /><div className="ambient-blob blob-b" />
      <header className="app-header">
        <button className="wordmark" onClick={() => setPickerOpen(true)}>DeskPet<span>.</span></button>
        <nav aria-label="주 메뉴">
          <button onClick={() => setPickerOpen(true)}>캐릭터</button>
          <button onClick={() => setChatOpen(true)}>채팅</button>
          <button onClick={() => setSettingsOpen(true)}>설정</button>
        </nav>
        <button className="header-action" onClick={runDemo}>데모 보기</button>
      </header>

      <main className="main-panel">
        <div className="dot-pattern" aria-hidden="true" />
        <section className="pet-info">
          <span className="eyebrow light">YOUR DESK COMPANION</span>
          <h1>안녕,<br /><em>{profile.displayName}</em>!</h1>
          <p>{profile.teaser}.<br />네 이야기를 들려줘.</p>
          <button className="change-pet" onClick={() => setPickerOpen(true)}><span>친구 바꾸기</span><b>→</b></button>
        </section>

        <section className="pet-viewport" aria-live="polite">
          <div className={`status-aura ${phase}`} style={{ "--pet-color": profile.base } as React.CSSProperties} />
          <PetStage profile={profile} emotion={emotion} intensity={emotionIntensity} phase={phase} mouthLevel={mouthLevel} inputLevel={inputLevel} customColor={customColor} idleAction={idlePreview} />
          <div className={`status-pill ${phase}`}><i /><span>{status.label}</span></div>
        </section>

        <aside className="quick-controls">
          <div className="connection-card">
            <div className="connection-title"><i className={snapshot.phase === "error" ? "error" : snapshot.phase === "disconnected" ? "off" : ""} /><span>{snapshot.phase === "disconnected" ? "오프라인" : snapshot.phase === "error" ? "연결 필요" : "Live 연결"}</span></div>
            <small>{snapshot.resumed ? "이전 맥락 복원됨" : "논리 세션 준비됨"}</small>
          </div>
          <button className="round-control" onClick={() => setChatOpen(true)} aria-label="채팅 열기"><span>⌨</span><small>채팅</small></button>
          <button className="round-control" onClick={() => setSettingsOpen(true)} aria-label="오디오 설정"><span>⌁</span><small>오디오</small></button>
          <button className="round-control" onClick={() => setPickerOpen(true)} aria-label="캐릭터 선택"><span>◌</span><small>친구</small></button>
        </aside>

        <section className="conversation-bar">
          <div className="transcript-area">
            <span className="speaker-label">{phase === "speaking" ? profile.displayName : "STATUS"}</span>
            {transcriptEnabled && snapshot.outputTranscript ? <p className="model-transcript">{snapshot.outputTranscript}</p> : <p className="model-transcript status-copy">{status.note}</p>}
            {transcriptEnabled && snapshot.inputTranscript && <small className="input-transcript">나 · {snapshot.inputTranscript}</small>}
          </div>
          <div className="audio-wave" aria-hidden="true">
            {Array.from({ length: 17 }, (_, index) => <i key={index} style={{ height: `${8 + ((phase === "speaking" ? mouthLevel : inputLevel) * (16 + (index % 5) * 8))}px` }} />)}
          </div>
          <button className="chat-shortcut" onClick={() => setChatOpen(true)} aria-label="텍스트 채팅">⌨</button>
          <button className={`mic-button ${phase}`} onClick={toggleMic} disabled={["connecting", "reconnecting", "speaking"].includes(phase)} aria-label={phase === "listening" ? "듣기 멈춤" : "대화 시작"}>
            <span>{phase === "listening" ? "■" : "●"}</span>
          </button>
        </section>

        <ChatPanel
          open={chatOpen}
          messages={chatMessages}
          characterName={profile.displayName}
          disabled={chatDisabled}
          onSend={sendChat}
          onClose={() => setChatOpen(false)}
        />
      </main>

      <section className="emotion-lab">
        <div><span className="eyebrow">EXPRESSION LAB</span><strong>{EMOTION_META[emotion].label}</strong></div>
        <div className="emotion-scroll">
          {EMOTION_IDS.map((id) => <button key={id} className={emotion === id ? "active" : ""} onClick={() => { setIdlePreview("auto"); setEmotion(id); setEmotionIntensity(1); }}>{EMOTION_META[id].label}</button>)}
        </div>
      </section>

      <section className="emotion-lab motion-lab">
        <div><span className="eyebrow">MOTION LAB</span><strong>{idlePreview === "auto" ? "자동 동작" : idlePreview === "none" ? "준비 중" : IDLE_ACTION_LABEL[idlePreview]}</strong></div>
        <div className="emotion-scroll">
          <button className={idlePreview === "auto" ? "active" : ""} onClick={() => previewIdleAction("auto")}>자동</button>
          {IDLE_ACTIONS.map((action) => <button key={action} className={idlePreview === action ? "active" : ""} onClick={() => previewIdleAction(action)}>{IDLE_ACTION_LABEL[action]}</button>)}
        </div>
      </section>

      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice(undefined)}>×</button></div>}
      {pickerOpen && <CharacterPicker selected={characterId} customColor={customColor} onCustomColor={(color) => { setCustomColor(color); localStorage.setItem("deskpet:custom-coat", color); void selectCharacter("greus-custom"); }} onSelect={(id) => void selectCharacter(id)} onClose={() => setPickerOpen(false)} />}
      <div className={`drawer-scrim ${settingsOpen ? "visible" : ""}`} onClick={() => setSettingsOpen(false)} />
      <SettingsDrawer
        open={settingsOpen} onClose={() => setSettingsOpen(false)} voice={voice} onVoice={(name) => void changeVoice(name)}
        modelId={modelId} onModel={(id) => void changeModel(id)} liveModels={liveModels} modelsLoading={modelsLoading}
        onRefreshModels={() => void refreshModels()} secureSettings={secureSettings} onSaveApiKey={saveApiKey} onClearApiKey={clearApiKey}
        microphones={microphones} speakers={speakers} microphoneId={microphoneId} speakerId={speakerId}
        onMicrophone={(id) => { setMicrophoneId(id); void window.deskPet?.settings.savePreferences({ microphoneId: id }); void coordinator.changeMicrophoneDevice(id).catch((error) => setNotice(error.message)); }}
        onSpeaker={(id) => { setSpeakerId(id); void window.deskPet?.settings.savePreferences({ speakerId: id }); void coordinator.audio.setOutputDevice(id).catch((error) => setNotice(error.message)); }}
        inputLevel={inputLevel} transcriptEnabled={transcriptEnabled} onTranscriptEnabled={(value) => { setTranscriptEnabled(value); void window.deskPet?.settings.savePreferences({ transcriptEnabled: value }); }}
        onRefreshDevices={() => void refreshDevices(true)}
        microphoneSelectionSupported={audioCapabilities.microphoneSelection}
        speakerSelectionSupported={audioCapabilities.speakerSelection}
        speakerPickerSupported={audioCapabilities.speakerPicker}
        onPickSpeaker={() => void pickSpeaker()}
      />
    </div>
  );
}

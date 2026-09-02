import { useRef, useState } from "react";
import type { LiveModelOption, SecureSettingsPublic } from "../../core/types";
import { DEFAULT_VOICE_NAME, VOICE_CATALOG } from "../../core/gemini/catalog";

type SinkAudioElement = HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };

function toneWavBlob(frequency = 660, durationMs = 850, sampleRate = 24000): Blob {
  const sampleCount = Math.max(1, Math.round(sampleRate * durationMs / 1000));
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, "RIFF"); view.setUint32(4, 36 + sampleCount * 2, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, sampleCount * 2, true);
  for (let i = 0; i < sampleCount; i += 1) {
    const attack = Math.min(1, i / Math.max(1, sampleRate * .04));
    const release = Math.min(1, (sampleCount - i) / Math.max(1, sampleRate * .08));
    const envelope = Math.min(attack, release) * .32;
    view.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * frequency * i / sampleRate) * 32767 * envelope), true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function keyStatus(settings?: SecureSettingsPublic): string {
  if (!settings?.hasApiKey) return "미설정";
  if (settings.keySource === "environment") return "환경 변수 사용 중";
  if (settings.keySource === "broker") return "서버 키 사용 가능";
  if (settings.keySource === "browser-storage") return "이 기기에 저장됨";
  if (settings.keySource === "secure-storage") return "암호화 저장됨";
  return "설정됨";
}

export function SettingsDrawer({
  open, onClose, voice, onVoice, modelId, onModel, liveModels, modelsLoading, onRefreshModels,
  secureSettings, onSaveApiKey, onClearApiKey, microphones, speakers, microphoneId, speakerId,
  onMicrophone, onSpeaker, inputLevel, transcriptEnabled, onTranscriptEnabled, onRefreshDevices,
  microphoneSelectionSupported, speakerSelectionSupported, speakerPickerSupported, onPickSpeaker,
}: {
  open: boolean; onClose: () => void; voice: string; onVoice: (name: string) => void;
  modelId: string; onModel: (id: string) => void; liveModels: LiveModelOption[]; modelsLoading: boolean;
  onRefreshModels: () => void; secureSettings?: SecureSettingsPublic;
  onSaveApiKey: (value: string) => Promise<void>; onClearApiKey: () => Promise<void>;
  microphones: MediaDeviceInfo[]; speakers: MediaDeviceInfo[]; microphoneId: string; speakerId: string;
  onMicrophone: (id: string) => void; onSpeaker: (id: string) => void; inputLevel: number;
  transcriptEnabled: boolean; onTranscriptEnabled: (value: boolean) => void; onRefreshDevices: () => void;
  microphoneSelectionSupported: boolean; speakerSelectionSupported: boolean; speakerPickerSupported: boolean;
  onPickSpeaker: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [speakerTestState, setSpeakerTestState] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [microphoneTestState, setMicrophoneTestState] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [microphoneTestLevel, setMicrophoneTestLevel] = useState(0);
  const testRun = useRef(0);
  const brokerManaged = secureSettings?.apiKeyEditable === false;

  const submitKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try { await onSaveApiKey(apiKey); setApiKey(""); }
    finally { setSaving(false); }
  };

  const runSpeakerTest = async () => {
    setSpeakerTestState("running");
    const audio = new Audio() as SinkAudioElement;
    const url = URL.createObjectURL(toneWavBlob());
    try {
      const session = (navigator as Navigator & { audioSession?: { type: "auto" | "playback" } }).audioSession;
      if (session) session.type = "playback";
      audio.preload = "auto";
      audio.muted = false;
      audio.volume = 1;
      if (audio.setSinkId) await audio.setSinkId(speakerId === "default" ? "" : speakerId);
      audio.src = url;
      await audio.play();
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("테스트음을 재생하지 못했습니다."));
      });
      setSpeakerTestState("ok");
    } catch {
      setSpeakerTestState("error");
    } finally {
      audio.pause();
      audio.removeAttribute("src");
      URL.revokeObjectURL(url);
    }
  };

  const runMicrophoneTest = async () => {
    const run = ++testRun.current;
    setMicrophoneTestState("running");
    setMicrophoneTestLevel(0);
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: microphoneId === "default" ? undefined : { exact: microphoneId },
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      context = new AudioContext({ latencyHint: "interactive" });
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const startedAt = performance.now();
      let peak = 0;
      while (run === testRun.current && performance.now() - startedAt < 3000) {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        const rms = Math.sqrt(sum / samples.length);
        const normalized = Math.min(1, rms * 8);
        peak = Math.max(peak, normalized);
        setMicrophoneTestLevel(normalized);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 60));
      }
      setMicrophoneTestState(peak >= .02 ? "ok" : "error");
    } catch {
      setMicrophoneTestState("error");
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") await context.close();
      window.setTimeout(() => setMicrophoneTestLevel(0), 500);
    }
  };

  return (
    <aside className={`settings-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="modal-heading"><div><span className="eyebrow">SETTINGS · AUTO SAVE</span><h2>Gemini와 소리</h2><small className="autosave-note">선택값은 변경 즉시 저장되고 다음 실행 때 복원됩니다.</small></div><button className="icon-button" onClick={onClose} aria-label="닫기">×</button></div>
      <div className="setting-block api-key-block">
        <div className="label-row"><label htmlFor="gemini-key">Gemini API 키</label><span className={`key-status ${secureSettings?.hasApiKey ? "saved" : ""}`}>{keyStatus(secureSettings)}</span></div>
        {brokerManaged ? (
          <div className="broker-key-note"><span>☁</span><p><strong>서버 관리 키</strong><br />이 배포에서는 API 키를 서버에서 관리합니다.</p></div>
        ) : <>
          <div className="secret-input"><input id="gemini-key" type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={secureSettings?.hasApiKey ? "새 키로 교체하려면 입력" : "새 API 키 입력"} autoComplete="off" /><button onClick={() => setShowKey(!showKey)} aria-label={showKey ? "API 키 숨기기" : "API 키 보기"}>{showKey ? "숨김" : "보기"}</button></div>
          <div className="setting-actions"><button className="primary-mini" disabled={saving || !apiKey.trim()} onClick={() => void submitKey()}>{saving ? "저장 중…" : "키 저장 · 교체"}</button>{secureSettings?.hasApiKey && secureSettings.keySource !== "environment" && <button className="text-button danger" onClick={() => void onClearApiKey()}>저장 키 삭제</button>}</div>
          <p className="hint">{secureSettings?.keySource === "browser-storage" || secureSettings?.encryptionAvailable === false ? "모바일 웹에서는 키가 이 브라우저의 로컬 저장소에 보관됩니다. Gemini 연결 때만 같은 출처의 HTTPS 토큰 브로커로 전달되고 Live 세션에는 단기 토큰만 사용합니다." : "키는 OS 보안 저장소로 암호화되어 앱 재실행 후에도 유지됩니다. 렌더러나 로그에는 다시 표시하지 않습니다."}</p>
        </>}
      </div>
      <div className="setting-block">
        <div className="label-row"><label htmlFor="live-model">Gemini Live 모델</label><button className="text-button" disabled={modelsLoading || !secureSettings?.hasApiKey} onClick={onRefreshModels}>{modelsLoading ? "불러오는 중…" : "목록 새로고침"}</button></div>
        <select id="live-model" value={modelId} onChange={(event) => onModel(event.target.value)}>{!liveModels.some((model) => model.id === modelId) && <option value={modelId}>{modelId}</option>}{liveModels.map((model) => <option key={model.id} value={model.id}>{model.displayName} · {model.id}</option>)}</select>
        <p className="hint">저장한 키의 계정에서 실제로 조회되는 양방향 Live 모델만 표시합니다.</p>
      </div>
      <div className="setting-block">
        <label>목소리 · {VOICE_CATALOG.length}개 전체</label>
        <div className="voice-catalog" role="radiogroup" aria-label="Gemini 목소리">{VOICE_CATALOG.map(([name, description]) => <button key={name} role="radio" aria-checked={voice === name} className={voice === name ? "active" : ""} onClick={() => onVoice(name)}><strong>{name}</strong><small>{description}{name === DEFAULT_VOICE_NAME ? " · 그린냥 추천" : ""}</small></button>)}</div>
      </div>
      <div className="setting-block">
        <div className="label-row"><label htmlFor="microphone">마이크</label><button className="text-button" onClick={onRefreshDevices}>권한 허용 · 장치 검색</button></div>
        <select id="microphone" value={microphoneId} disabled={!microphoneSelectionSupported} onChange={(event) => onMicrophone(event.target.value)}><option value="default">시스템 기본 마이크</option>{microphoneId !== "default" && !microphones.some((item) => item.deviceId === microphoneId) && <option value={microphoneId}>이전에 선택한 마이크 (현재 연결 안 됨)</option>}{microphones.filter((item) => item.deviceId !== "default").map((item, index) => <option key={item.deviceId} value={item.deviceId}>{item.label || `마이크 ${index + 1}`}</option>)}</select>
        <div className="level-meter" aria-label={`입력 레벨 ${Math.round((microphoneTestState === "running" ? microphoneTestLevel : inputLevel) * 100)}%`}><i style={{ width: `${(microphoneTestState === "running" ? microphoneTestLevel : inputLevel) * 100}%` }} /></div>
        <div className="setting-actions"><button className="primary-mini" disabled={microphoneTestState === "running"} onClick={() => void runMicrophoneTest()}>{microphoneTestState === "running" ? "3초 측정 중…" : "마이크 테스트"}</button><span className={`key-status ${microphoneTestState === "ok" ? "saved" : ""}`}>{microphoneTestState === "ok" ? "입력 정상" : microphoneTestState === "error" ? "입력 확인 필요" : "대기"}</span></div>
        <p className="hint">말하거나 손뼉을 쳐서 3초 동안 입력 레벨을 확인합니다. 테스트는 Gemini 전송 없이 선택한 마이크만 직접 측정합니다.</p>
      </div>
      <div className="setting-block">
        <div className="label-row"><label htmlFor="speaker">스피커</label>{speakerPickerSupported && <button className="text-button" onClick={onPickSpeaker}>출력 선택</button>}</div>
        <select id="speaker" value={speakerSelectionSupported ? speakerId : "default"} disabled={!speakerSelectionSupported} onChange={(event) => onSpeaker(event.target.value)}><option value="default">시스템 기본 스피커</option>{speakerSelectionSupported && speakerId !== "default" && !speakers.some((item) => item.deviceId === speakerId) && <option value={speakerId}>이전에 선택한 스피커 (현재 연결 안 됨)</option>}{speakerSelectionSupported && speakers.filter((item) => item.deviceId !== "default").map((item, index) => <option key={item.deviceId} value={item.deviceId}>{item.label || `스피커 ${index + 1}`}</option>)}</select>
        <div className="setting-actions"><button className="primary-mini" disabled={speakerTestState === "running"} onClick={() => void runSpeakerTest()}>{speakerTestState === "running" ? "재생 중…" : "스피커 테스트"}</button><span className={`key-status ${speakerTestState === "ok" ? "saved" : ""}`}>{speakerTestState === "ok" ? "재생 완료" : speakerTestState === "error" ? "재생 실패" : "대기"}</span></div>
        <p className="hint">선택한 출력 장치로 약 0.8초 테스트음을 재생합니다. 테스트음이 들리면 웹 앱에서 해당 출력 경로를 사용할 수 있습니다.</p>
      </div>
      <div className="setting-block row-setting"><div><label>대화 자막</label><p className="hint">표시 여부만 저장합니다. 전체 기록 저장은 기본적으로 꺼져 있습니다.</p></div><button className={`toggle ${transcriptEnabled ? "on" : ""}`} aria-pressed={transcriptEnabled} onClick={() => onTranscriptEnabled(!transcriptEnabled)}><i /></button></div>
      <div className="security-note"><span>🔒</span><p><strong>비공개 경계</strong><br />API 키와 캐릭터 페르소나 원문은 화면 또는 모델 대화에 노출되지 않습니다.</p></div>
    </aside>
  );
}

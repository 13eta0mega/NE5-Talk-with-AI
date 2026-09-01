import { useState } from "react";
import type { LiveModelOption, SecureSettingsPublic } from "../../core/types";
import { VOICE_CATALOG } from "../../core/gemini/catalog";

export function SettingsDrawer({
  open, onClose, voice, onVoice, modelId, onModel, liveModels, modelsLoading, onRefreshModels,
  secureSettings, onSaveApiKey, onClearApiKey, microphones, speakers, microphoneId, speakerId,
  onMicrophone, onSpeaker, inputLevel, transcriptEnabled, onTranscriptEnabled, onRefreshDevices,
  microphoneSelectionSupported, speakerSelectionSupported,
}: {
  open: boolean; onClose: () => void; voice: string; onVoice: (name: string) => void;
  modelId: string; onModel: (id: string) => void; liveModels: LiveModelOption[]; modelsLoading: boolean;
  onRefreshModels: () => void; secureSettings?: SecureSettingsPublic;
  onSaveApiKey: (value: string) => Promise<void>; onClearApiKey: () => Promise<void>;
  microphones: MediaDeviceInfo[]; speakers: MediaDeviceInfo[]; microphoneId: string; speakerId: string;
  onMicrophone: (id: string) => void; onSpeaker: (id: string) => void; inputLevel: number;
  transcriptEnabled: boolean; onTranscriptEnabled: (value: boolean) => void; onRefreshDevices: () => void;
  microphoneSelectionSupported: boolean; speakerSelectionSupported: boolean;
}) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const brokerManaged = secureSettings?.keySource === "broker" || secureSettings?.apiKeyEditable === false;
  const submitKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try { await onSaveApiKey(apiKey); setApiKey(""); }
    finally { setSaving(false); }
  };

  return (
    <aside className={`settings-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="modal-heading"><div><span className="eyebrow">SETTINGS · AUTO SAVE</span><h2>Gemini와 소리</h2><small className="autosave-note">선택값은 변경 즉시 저장되고 다음 실행 때 복원됩니다.</small></div><button className="icon-button" onClick={onClose} aria-label="닫기">×</button></div>
      <div className="setting-block api-key-block">
        <div className="label-row"><label htmlFor="gemini-key">Gemini API 키</label><span className={`key-status ${secureSettings?.hasApiKey ? "saved" : ""}`}>{secureSettings?.hasApiKey ? secureSettings.keySource === "environment" ? "환경 변수 사용 중" : secureSettings.keySource === "broker" ? "서버에서 보호 중" : "암호화 저장됨" : "미설정"}</span></div>
        {brokerManaged ? (
          <div className="broker-key-note"><span>☁</span><p><strong>모바일 보안 연결</strong><br />API 키는 이 스마트폰에 저장되지 않고 HTTPS 서버에서 일회용 Live 토큰으로 교환됩니다.</p></div>
        ) : <>
          <div className="secret-input">
            <input id="gemini-key" type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={secureSettings?.hasApiKey ? "새 키로 교체하려면 입력" : "새 API 키 입력"} autoComplete="off" />
            <button onClick={() => setShowKey(!showKey)} aria-label={showKey ? "API 키 숨기기" : "API 키 보기"}>{showKey ? "숨김" : "보기"}</button>
          </div>
          <div className="setting-actions">
            <button className="primary-mini" disabled={saving || !apiKey.trim()} onClick={() => void submitKey()}>{saving ? "저장 중…" : "안전하게 저장"}</button>
            {secureSettings?.hasApiKey && secureSettings.keySource !== "environment" && <button className="text-button danger" onClick={() => void onClearApiKey()}>저장 키 삭제</button>}
          </div>
          <p className="hint">키는 Windows 보안 저장소로 암호화되어 앱 재실행 후에도 유지됩니다. 렌더러나 로그에는 다시 표시하지 않습니다.</p>
        </>}
      </div>
      <div className="setting-block">
        <div className="label-row"><label htmlFor="live-model">Gemini Live 모델</label><button className="text-button" disabled={modelsLoading || !secureSettings?.hasApiKey} onClick={onRefreshModels}>{modelsLoading ? "불러오는 중…" : "목록 새로고침"}</button></div>
        <select id="live-model" value={modelId} onChange={(event) => onModel(event.target.value)}>
          {!liveModels.some((model) => model.id === modelId) && <option value={modelId}>{modelId}</option>}
          {liveModels.map((model) => <option key={model.id} value={model.id}>{model.displayName} · {model.id}</option>)}
        </select>
        <p className="hint">저장한 키의 계정에서 실제로 조회되는 양방향 Live 모델만 표시합니다.</p>
      </div>
      <div className="setting-block">
        <label>목소리 · {VOICE_CATALOG.length}개 전체</label>
        <div className="voice-catalog" role="radiogroup" aria-label="Gemini 목소리">
          {VOICE_CATALOG.map(([name, description]) => <button key={name} role="radio" aria-checked={voice === name} className={voice === name ? "active" : ""} onClick={() => onVoice(name)}><strong>{name}</strong><small>{description}</small></button>)}
        </div>
      </div>
      <div className="setting-block">
        <div className="label-row"><label htmlFor="microphone">마이크</label><button className="text-button" onClick={onRefreshDevices}>새로고침</button></div>
        <select id="microphone" value={microphoneId} disabled={!microphoneSelectionSupported} onChange={(event) => onMicrophone(event.target.value)}><option value="default">시스템 기본 마이크</option>{microphoneId !== "default" && !microphones.some((item) => item.deviceId === microphoneId) && <option value={microphoneId}>이전에 선택한 마이크 (현재 연결 안 됨)</option>}{microphones.filter((item) => item.deviceId !== "default").map((item, index) => <option key={item.deviceId} value={item.deviceId}>{item.label || `마이크 ${index + 1}`}</option>)}</select>
        <div className="level-meter" aria-label={`입력 레벨 ${Math.round(inputLevel * 100)}%`}><i style={{ width: `${inputLevel * 100}%` }} /></div>
        <p className="hint">{microphones.some((item) => item.deviceId !== "default") ? "마이크를 바꾸면 듣는 중에도 즉시 다시 연결됩니다." : "스마트폰에서는 운영체제가 선택한 기본 마이크를 사용합니다. 권한 허용 후 위 레벨 미터로 입력을 확인하세요."}</p>
      </div>
      <div className="setting-block"><label htmlFor="speaker">스피커</label><select id="speaker" value={speakerSelectionSupported ? speakerId : "default"} disabled={!speakerSelectionSupported} onChange={(event) => onSpeaker(event.target.value)}><option value="default">시스템 기본 스피커</option>{speakerSelectionSupported && speakerId !== "default" && !speakers.some((item) => item.deviceId === speakerId) && <option value={speakerId}>이전에 선택한 스피커 (현재 연결 안 됨)</option>}{speakerSelectionSupported && speakers.filter((item) => item.deviceId !== "default").map((item, index) => <option key={item.deviceId} value={item.deviceId}>{item.label || `스피커 ${index + 1}`}</option>)}</select><p className="hint">{speakerSelectionSupported ? "선택한 출력 장치는 다음 응답부터 적용됩니다." : "스마트폰 브라우저에서는 앱이 스피커를 직접 바꿀 수 없어 휴대폰의 미디어 출력 설정을 따릅니다."}</p></div>
      <div className="setting-block row-setting"><div><label>대화 자막</label><p className="hint">표시 여부만 저장합니다. 전체 기록 저장은 기본적으로 꺼져 있습니다.</p></div><button className={`toggle ${transcriptEnabled ? "on" : ""}`} aria-pressed={transcriptEnabled} onClick={() => onTranscriptEnabled(!transcriptEnabled)}><i /></button></div>
      <div className="security-note"><span>🔒</span><p><strong>비공개 경계</strong><br />API 키와 캐릭터 페르소나 원문은 화면 또는 모델 대화에 노출되지 않습니다.</p></div>
    </aside>
  );
}

import {useEffect,useMemo,useRef,useState,type CSSProperties,type MutableRefObject} from 'react';
import {ConversationCoordinator,type ConversationSnapshot} from '../../core/conversation/ConversationCoordinator';
import {DEFAULT_LIVE_MODEL,DEFAULT_VOICE_NAME} from '../../core/gemini/catalog';
import type {EmotionId,LiveModelOption,SecureSettingsPublic} from '../../core/types';
import {SettingsDrawer} from '../components/SettingsDrawer';
import {AVATARS,EXPRESSION_LABELS,MOTIONS,speakingMouth,dialogueMotion,type Motion} from './rig';
import {createRenderer,exportGltf,type FrameState,type RenderStats} from './renderer';
import './studio.css';

const T={title:'작은 친구,',title2:'진짜 대화.',description:'표정과 몸짓으로 마음을 전하는 나만의 3D 친구',choose:'친구 선택',settings:'설정',connect:'음성 대화 시작',stop:'대화 종료',send:'보내기',placeholder:'오늘 어떤 일이 있었어?',demo:'표정 데모',reset:'시점 초기화',rig:'리깅 보기',wire:'와이어프레임',expressions:'표정 실험실',motion:'동작',download:'모델 내려받기',offline:'체험 모드 · API 키 없이 사용 가능',live:'실제 Gemini Live 연결',rotate:'드래그하여 360° 돌려보세요',you:'나',noSpeech:'무음 표정·동작 시연',setup:'설정에서 Gemini API 키를 입력해 주세요.',exportNote:'정점·재질·관절 계층 glTF. 애니메이션 코드는 rig.ts에 있습니다.'};
const PHASE:Record<string,string>={disconnected:'데모 준비',connecting:'연결 중',idle:'채팅 가능',listening:'마이크 입력 가능',thinking:'생각 중',speaking:'말하는 중',reconnecting:'연결 복구 중',error:'연결 확인 필요'};
const MOTION_LABEL:Record<Motion,string>={auto:'자연스럽게',wave:'손 흔들기',bounce:'통통',dance:'춤추기',nod:'끄덕',sleep:'잠자기',celebrate:'신나게'};
const INITIAL:ConversationSnapshot={phase:'disconnected',inputTranscript:'',outputTranscript:'',resumed:false,reconnectCount:0};
function download(content:string,name:string,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function AvatarStage({avatar,frame,onStats}:{avatar:string;frame:MutableRefObject<FrameState>;onStats:(s:RenderStats)=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),renderer=useRef<ReturnType<typeof createRenderer>|undefined>(undefined);const [error,setError]=useState('');
  const avatarRef=useRef(avatar);avatarRef.current=avatar;
  useEffect(()=>{if(!canvas.current)return;let animation=0,last=performance.now(),report=last;
    try{renderer.current=createRenderer(canvas.current,avatarRef.current);}catch(e){setError(e instanceof Error?e.message:String(e));return;}
    const tick=(now:number)=>{const r=renderer.current;if(!r)return;const interval=canvas.current?.dataset.renderer==='software'?66:33;if(document.hidden||now-last<interval){animation=requestAnimationFrame(tick);return;}if(canvas.current?.dataset.context){setError('3D context lost. Reload this page or switch to 2D.');return;}const stats=r.render(now/1000,Math.min(.05,(now-last)/1000),frame.current);last=now;if(canvas.current){canvas.current.dataset.avatar=r.rig.avatar.id;canvas.current.dataset.emotion=frame.current.emotion;canvas.current.dataset.mouth=String(frame.current.mouth);}if(now-report>1000){onStats(stats);report=now;}animation=requestAnimationFrame(tick);};animation=requestAnimationFrame(tick);
    const exportListener=()=>{const r=renderer.current;if(r)download(exportGltf(r.rig),r.rig.avatar.id+'.gltf','model/gltf+json');};
    const reset=()=>renderer.current?.resetCamera();window.addEventListener('deskpet:3d-export',exportListener);window.addEventListener('deskpet:3d-camera-reset',reset);
    return()=>{cancelAnimationFrame(animation);window.removeEventListener('deskpet:3d-export',exportListener);window.removeEventListener('deskpet:3d-camera-reset',reset);renderer.current?.destroy();renderer.current=undefined;};
  },[frame,onStats]);
  useEffect(()=>{if(renderer.current?.rig.avatar.id!==avatar)renderer.current?.setAvatar(avatar);},[avatar]);
  return <>{error&&<div role="alert" className="chibi-render-error">{error}<a href="?view=classic">2D mode</a></div>}<canvas ref={canvas} aria-label="Interactive rigged 3D companion" data-testid="chibi-canvas"/></>;
}

export default function CompanionStudio(){
  const coordinator=useMemo(()=>new ConversationCoordinator(),[]);
  const [snapshot,setSnapshot]=useState(INITIAL),[avatar,setAvatar]=useState<string>(AVATARS[0].id),[voice,setVoice]=useState(DEFAULT_VOICE_NAME),[model,setModel]=useState<string>(DEFAULT_LIVE_MODEL);
  const [settings,setSettings]=useState<SecureSettingsPublic>(),[settingsOpen,setSettingsOpen]=useState(false),[models,setModels]=useState<LiveModelOption[]>([]),[loadingModels,setLoadingModels]=useState(false);
  const [microphones,setMicrophones]=useState<MediaDeviceInfo[]>([]),[speakers,setSpeakers]=useState<MediaDeviceInfo[]>([]),[micId,setMicId]=useState('default'),[speakerId,setSpeakerId]=useState('default'),[transcriptEnabled,setTranscriptEnabled]=useState(true);
  const [emotion,setEmotion]=useState<EmotionId>('idle'),[motion,setMotion]=useState<Motion>('auto'),[intensity,setIntensity]=useState(1),[wireframe,setWireframe]=useState(false),[skeleton,setSkeleton]=useState(false),[demo,setDemo]=useState(false);
  const [input,setInput]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[inputLevel,setInputLevel]=useState(0),[stats,setStats]=useState<RenderStats>(),[reduced,setReduced]=useState(false);
  const frame=useRef<FrameState>({emotion:'idle',motion:'auto',intensity:1,mouth:0,wireframe:false,skeleton:false,reduced:false});
  const outputLevel=useRef(0),phaseRef=useRef(snapshot.phase),lastEmotionAt=useRef(0),lastInputAt=useRef(0),mounted=useRef(true),micEnabled=useRef(false),lastObservedText=useRef('');
  phaseRef.current=snapshot.phase;
  const profile=AVATARS.find(a=>a.id===avatar)||AVATARS[0],connected=!['disconnected','error'].includes(snapshot.phase),caps=coordinator.audio.deviceCapabilities;
  frame.current={emotion,motion,intensity,mouth:speakingMouth(snapshot.phase,outputLevel.current),wireframe,skeleton,reduced};
  const operationBusy=useRef(false);
  const run=async(task:()=>Promise<unknown>)=>{if(operationBusy.current)return;operationBusy.current=true;setBusy(true);setNotice('');try{await task();}catch(e){setNotice(e instanceof Error?e.message:String(e));}finally{operationBusy.current=false;if(mounted.current)setBusy(false);}};
  const refreshModels=async()=>{setLoadingModels(true);try{const list=await window.deskPet?.catalog.listLiveModels();if(mounted.current)setModels(list||[]);}catch(e){if(mounted.current)setNotice(String(e instanceof Error?e.message:e));}finally{if(mounted.current)setLoadingModels(false);}};
  const refreshDevices=async(permission=false)=>{const devices=await coordinator.audio.listDevices(permission);setMicrophones(devices.microphones);setSpeakers(devices.speakers);};
  useEffect(()=>{mounted.current=true;const unsubscribe=coordinator.subscribe(s=>{if(['idle','listening'].includes(s.phase)&&!['idle','listening'].includes(phaseRef.current))lastEmotionAt.current=Date.now();phaseRef.current=s.phase;setSnapshot(s);frame.current.mouth=speakingMouth(s.phase,outputLevel.current);});
    coordinator.onExpression((value,power)=>{lastEmotionAt.current=Date.now();setEmotion(value);setIntensity(power);});
    coordinator.audio.onOutputLevel=value=>{outputLevel.current=value;frame.current.mouth=speakingMouth(phaseRef.current,value);};
    coordinator.audio.onInputLevel=value=>{if(value>.03)lastInputAt.current=Date.now();setInputLevel(value);};
    void window.deskPet?.settings.get().then(s=>{if(!mounted.current)return;setSettings(s);setVoice(s.selectedVoiceName||DEFAULT_VOICE_NAME);setModel(s.selectedModelId||DEFAULT_LIVE_MODEL);if(AVATARS.some(a=>a.id===s.selectedCharacterId))setAvatar(s.selectedCharacterId);setMicId(s.microphoneId||'default');const output=caps.speakerSelection?s.speakerId||'default':'default';setSpeakerId(output);setTranscriptEnabled(s.transcriptEnabled!==false);if(output!=='default')void coordinator.audio.setOutputDevice(output).catch(e=>setNotice(String(e)));if(s.hasApiKey)void refreshModels();}).catch(e=>setNotice(String(e)));
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');setReduced(media.matches);const change=()=>setReduced(media.matches);media.addEventListener('change',change);
    return()=>{mounted.current=false;unsubscribe();media.removeEventListener('change',change);void coordinator.dispose();};
  },[coordinator]);
  useEffect(()=>{if(!demo)return;const sequence:EmotionId[]=['happy','curious','wink','sad','crying','startled','love','laughing'];let i=0;setEmotion(sequence[0]);const timer=window.setInterval(()=>{i=(i+1)%sequence.length;setEmotion(sequence[i]);setMotion(i%3===0?'wave':i%3===1?'auto':'bounce');},2600);return()=>window.clearInterval(timer);},[demo]);
  useEffect(()=>{if(!connected||demo)return;const timer=window.setInterval(()=>{if(['idle','listening'].includes(phaseRef.current)&&Date.now()-Math.max(lastEmotionAt.current,lastInputAt.current)>5000){setEmotion('idle');setMotion('auto');}},500);return()=>clearInterval(timer);},[connected,demo]);
  useEffect(()=>{const text=snapshot.inputTranscript;if(!text||text===lastObservedText.current||text.includes('[DESKPET_INTERNAL'))return;lastObservedText.current=text;const gesture=dialogueMotion(text);if(gesture)setMotion(gesture);},[snapshot.inputTranscript]);
  const openLive=async(microphone:boolean)=>{if(!settings?.hasApiKey){setSettingsOpen(true);throw new Error(T.setup);}setDemo(false);if(['disconnected','error'].includes(phaseRef.current))await coordinator.connect(avatar,voice,model);if(microphone){await coordinator.startListening(micId);micEnabled.current=true;}};
  const stop=async()=>{micEnabled.current=false;await coordinator.dispose();phaseRef.current='disconnected';outputLevel.current=0;setSnapshot(INITIAL);setEmotion('idle');setMotion('auto');};
  const selectAvatar=async(id:string)=>{const resume=connected,resumeMic=micEnabled.current;await coordinator.switchCharacter(id,voice,model);setSnapshot(INITIAL);setAvatar(id);setEmotion('idle');setMotion('auto');await window.deskPet?.settings.savePreferences({characterId:id});if(resume){await coordinator.connect(id,voice,model);if(resumeMic)await coordinator.startListening(micId);}};
  const send=async()=>{const value=input.trim();if(!value)return;await openLive(false);await coordinator.sendText(value);setInput('');const gesture=dialogueMotion(value);if(gesture)setMotion(gesture);};
  const saveKey=async(value:string)=>{await stop();await window.deskPet?.settings.saveApiKey(value);setSettings(await window.deskPet?.settings.get());await refreshModels();};
  const clearKey=async()=>{await stop();await window.deskPet?.settings.clearApiKey();setSettings(await window.deskPet?.settings.get());setModels([]);};
  const diagnostic=()=>download(JSON.stringify({version:'lowpoly-3d-v1',model,avatar,renderer:document.querySelector('canvas[data-testid="chibi-canvas"]')?.getAttribute('data-renderer'),geometry:stats,live:coordinator.diagnostics()},null,2),'deskpet-3d-diagnostics.json');
  const micReady=snapshot.phase==='listening'&&coordinator.audio.captureActive&&coordinator.audio.captureHeartbeatFresh&&coordinator.audio.gate.diagnostics().open&&!coordinator.audio.gate.diagnostics().speaking;
  return <div className="chibi-app" style={{'--pet-accent':profile.accent,'--pet-tint':profile.hair} as CSSProperties}>
    <header className="chibi-header"><a className="chibi-brand" href="?">DeskPet<span>.</span><small>3D STUDIO</small></a><nav><a href="?view=classic">2D</a><button onClick={()=>setSettingsOpen(true)}>{T.settings}</button><span className="chibi-preview-badge">BRANCH PREVIEW</span></nav></header>
    <section className="chibi-intro"><div><span className="chibi-eyebrow">A LITTLE WORLD, A LITTLE FRIEND</span><h1>{T.title} <em>{T.title2}</em></h1><p>{T.description}</p></div><div className="chibi-offline"><i/>{connected?T.live:T.offline}</div></section>
    <main className="chibi-layout">
      <section className="chibi-view"><div className="chibi-stage-top"><span>01 / {profile.role}</span><span>{stats?.triangles.toLocaleString()||'...'} TRI <b>LIVE RIG</b></span></div>
        <div className="chibi-stage"><div className="chibi-orbit-ring"/><AvatarStage avatar={avatar} frame={frame} onStats={setStats}/><div className="chibi-name"><h2>{profile.name}</h2><span>{EXPRESSION_LABELS[emotion]} / {MOTION_LABEL[motion]}</span></div></div>
        <div className="chibi-stage-tools"><span>{T.rotate}</span><button onClick={()=>window.dispatchEvent(new Event('deskpet:3d-camera-reset'))}>{T.reset}</button></div>
        <div className="chibi-cast-title"><span>{T.choose}</span><small>05 LITTLE COMPANIONS</small></div>
        <div className="chibi-cast" role="group" aria-label={T.choose}>{AVATARS.map((a,i)=><button key={a.id} disabled={busy} className={avatar===a.id?'selected':''} onClick={()=>void run(()=>selectAvatar(a.id))} data-testid={`avatar-${i}`} aria-pressed={avatar===a.id}><i style={{background:a.hair,color:a.shade}}><span>{['✦','★','❀','☾','☁'][i]}</span></i><strong>{a.name}</strong><small>{a.role}</small></button>)}</div>
      </section>
      <aside className="chibi-controls"><section className="chibi-conversation"><div className="chibi-panel-heading"><span className="chibi-eyebrow">LET'S TALK</span><span className={`chibi-status ${micReady?'ready':''}`} role="status"><i/>{snapshot.phase==='listening'&&!micReady?'마이크 준비 중':PHASE[snapshot.phase]}</span></div><h2>오늘은 어땠어?</h2>
        <p className="chibi-conversation-note">{connected?model:'Gemini 2.5 / 3.1 Native Live'}</p>
        <div className="chibi-dialogue" aria-live="polite" hidden={!transcriptEnabled}>{snapshot.inputTranscript&&<p><b>{T.you}</b><span>{snapshot.inputTranscript}</span></p>}<p><b>{profile.name}</b><span>{snapshot.outputTranscript||(demo?T.noSpeech:'안녕! 설정한 목소리로 이야기해 보자.')}</span></p></div>
        <form className="chibi-composer" onSubmit={e=>{e.preventDefault();void run(send);}}><input aria-label="Chat message" placeholder={T.placeholder} value={input} onChange={e=>setInput(e.target.value)} disabled={busy}/><button disabled={busy||!input.trim()} aria-label={T.send}>↑</button></form>
        <button className={`chibi-talk-button ${connected?'connected':''}`} disabled={busy} onClick={()=>void run(connected&&micEnabled.current?stop:()=>openLive(true))}><span>{connected&&micEnabled.current?'■':'●'}</span>{busy?'처리 중...':connected&&micEnabled.current?T.stop:T.connect}</button>
        {connected&&!micEnabled.current&&<button className="chibi-end-chat" onClick={()=>void run(stop)}>연결 종료</button>}
        <div className="chibi-mic-meter" aria-label="Microphone level"><i style={{width:`${Math.min(100,inputLevel*100)}%`}}/></div>
        {(notice||snapshot.error)&&<p className="chibi-notice" role="alert">{notice||snapshot.error}</p>}
      </section>
      <section className="chibi-lab"><div className="chibi-panel-heading"><span className="chibi-eyebrow">EXPRESSION LAB</span><button className={demo?'on':''} disabled={connected} onClick={()=>{setDemo(!demo);if(demo){setEmotion('idle');setMotion('auto');}}}>{T.demo}{demo?' ■':''}</button></div><h3>{T.expressions}</h3>
        <div className="chibi-expression-grid">{Object.entries(EXPRESSION_LABELS).map(([id,label])=><button key={id} aria-pressed={emotion===id} className={emotion===id?'active':''} onClick={()=>{setDemo(false);setEmotion(id as EmotionId);lastEmotionAt.current=Date.now();}}>{label}</button>)}</div>
        <label className="chibi-range">감정 강도<input aria-label="Emotion intensity" type="range" min="0" max="1" step=".05" value={intensity} onChange={e=>setIntensity(Number(e.target.value))}/><small>{Math.round(intensity*100)}%</small></label>
        <h3>{T.motion}</h3><div className="chibi-motions">{MOTIONS.map(m=><button key={m} aria-pressed={motion===m} className={motion===m?'active':''} onClick={()=>{setDemo(false);setMotion(m);}}>{MOTION_LABEL[m]}</button>)}</div>
        <div className="chibi-debug-toggles"><label><input type="checkbox" checked={skeleton} onChange={e=>setSkeleton(e.target.checked)}/>{T.rig}</label><label><input type="checkbox" checked={wireframe} onChange={e=>setWireframe(e.target.checked)}/>{T.wire}</label></div>
      </section></aside>
    </main>
    <footer className="chibi-footer"><div><b>{stats?.joints||31} JOINTS / 26 EXPRESSIONS / NATIVE AUDIO</b><p>웹 3D 데모입니다. ESP32-S3 실기 성능을 측정한 화면은 아닙니다.</p></div><div><button title={T.exportNote} onClick={()=>window.dispatchEvent(new Event('deskpet:3d-export'))}>{T.download} (.gltf)</button><button onClick={diagnostic}>진단 JSON</button></div></footer>
    <SettingsDrawer open={settingsOpen} onClose={()=>setSettingsOpen(false)} voice={voice} onVoice={v=>void run(async()=>{await coordinator.changeVoice(v);setVoice(v);await window.deskPet?.settings.savePreferences({voiceName:v});})} modelId={model} onModel={v=>void run(async()=>{await coordinator.changeModel(v);setModel(v);await window.deskPet?.settings.savePreferences({modelId:v});})} liveModels={models} modelsLoading={loadingModels} onRefreshModels={()=>void refreshModels()} secureSettings={settings} onSaveApiKey={value=>run(()=>saveKey(value))} onClearApiKey={()=>run(clearKey)} microphones={microphones} speakers={speakers} microphoneId={micId} speakerId={speakerId} onMicrophone={id=>void run(async()=>{await coordinator.changeMicrophoneDevice(id);setMicId(id);await window.deskPet?.settings.savePreferences({microphoneId:id});})} onSpeaker={id=>void run(async()=>{await coordinator.audio.setOutputDevice(id);setSpeakerId(id);await window.deskPet?.settings.savePreferences({speakerId:id});})} inputLevel={inputLevel} transcriptEnabled={transcriptEnabled} onTranscriptEnabled={value=>{setTranscriptEnabled(value);void window.deskPet?.settings.savePreferences({transcriptEnabled:value});}} onRefreshDevices={()=>void run(()=>refreshDevices(true))} microphoneSelectionSupported={caps.microphoneSelection} speakerSelectionSupported={caps.speakerSelection} speakerPickerSupported={caps.speakerPicker} onPickSpeaker={()=>void run(async()=>{const device=await coordinator.audio.requestOutputDevice();setSpeakerId(device.deviceId);await window.deskPet?.settings.savePreferences({speakerId:device.deviceId});})}/>
    {settingsOpen&&<button className="chibi-settings-backdrop" aria-label="Close settings" onClick={()=>setSettingsOpen(false)}/>}
  </div>;
}

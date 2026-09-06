import { useEffect, useId, useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { ConversationPhase, EmotionId } from "../../core/types";
import type { IdleAction } from "./GreusCat";
import { createLumiState, expressionPose, eyePath, mouthPath, stepLumi, unit, type LumiFrame, type LumiInput } from "./lumiModel";
import "./lumi.css";

export interface LumiProps {
  emotion?: EmotionId;
  intensity?: number;
  phase?: ConversationPhase;
  speechLevel?: number;
  microphoneLevel?: number;
  idleAction?: IdleAction | "auto";
  size?: number;
  className?: string;
  animated?: boolean;
  interactive?: boolean;
  label?: string;
}
const BODY = "M103 142C109 113 129 99 153 101C151 91 159 81 172 82C165 90 171 98 183 101C215 107 228 132 229 164C230 193 239 227 237 251C236 265 230 275 220 273C209 269 203 280 191 277C179 273 173 281 160 279C146 277 140 281 129 276C116 271 105 278 96 269C84 258 88 240 91 222C96 193 96 166 103 142Z";
const HEART = "M0 5C-11-2-9-11-3-10C-1-10 0-8 0-7C1-11 7-12 9-7C12-1 5 3 0 7Z";
const STAR = "M160 229L165 239L176 241L168 249L170 260L160 255L150 260L152 249L144 241L155 239Z";
const n = (v: number) => (Number.isFinite(v) ? v : 0).toFixed(3);

/** Cache semantic nodes once, then update attributes without React rendering at 60fps. */
function bindRig(svg: SVGSVGElement) {
  const nodes = new Map<string, SVGElement>();
  svg.querySelectorAll<SVGElement>("[data-part]").forEach((node) => nodes.set(node.dataset.part!, node));
  const set = (part: string, attribute: string, value: string | number) => nodes.get(part)?.setAttribute(attribute, String(value));
  return (frame: LumiFrame, input: LumiInput) => {
    const p = frame.pose;
    const shake = input.animated && !input.reducedMotion && ["anxious", "scared"].includes(input.emotion) ? Math.sin(frame.time * 21) * .65 : 0;
    const squash = Math.max(.84, Math.min(1.18, p.stretch + frame.breathe));
    set("rig-root", "transform", `translate(${n(shake)} ${n(p.lift + frame.bob)}) rotate(${n(p.tilt)} 160 278)`);
    set("body-squash", "transform", `translate(160 278) scale(${n(1 / Math.sqrt(squash))} ${n(squash)}) translate(-160 -278)`);
    set("arm-left", "transform", `translate(${n(p.armLX)} ${n(p.armLY)}) rotate(${n(p.armL + frame.bob)} 100 221)`);
    set("arm-right", "transform", `translate(${n(p.armRX)} ${n(p.armRY)}) rotate(${n(p.armR - frame.bob)} 222 221)`);
    set("antenna", "transform", `rotate(${n(Math.sin(frame.time * 1.5) * (input.reducedMotion || !input.animated ? 0 : 5) + frame.mic * 19)} 164 104)`);
    set("face", "transform", `translate(${n(frame.gazeX * 2.4)} ${n(frame.gazeY * 1.5)})`);
    for (const side of ["left", "right"] as const) {
      const x = side === "left" ? 139 : 181;
      const height = side === "left" ? p.eyeL : p.eyeR;
      const curve = side === "left" ? p.curveL : p.curveR;
      const angle = side === "left" ? p.eyeTiltL : p.eyeTiltR;
      set(`eye-${side}`, "d", eyePath(x, 176, p.eyeWidth, height * (1 - frame.blink * .97), curve));
      set(`eye-${side}`, "transform", `rotate(${n(angle)} ${x} 176)`);
      set(`brow-${side}`, "opacity", unit(side === "left" ? p.browL : p.browR));
      set(`brow-${side}`, "d", side === "left"
        ? `M131 ${n(162 - p.browTilt)} Q139 159 147 ${n(162 + p.browTilt)}`
        : `M173 ${n(162 + p.browTilt)} Q181 159 189 ${n(162 - p.browTilt)}`);
    }
    const talking = input.phase === "speaking";
    const opening = talking ? frame.jaw * 10 : Math.max(0, p.mouthOpen);
    set("mouth", "d", mouthPath(p.mouthWidth + (talking ? frame.jaw * 2 : 0), p.smile, opening, p.mouthSkew));
    set("blush", "opacity", unit(p.blush));
    set("tears", "opacity", unit(p.tears));
    set("tear-left", "transform", `translate(0 ${n((frame.time * 15) % 15)})`);
    set("tear-right", "transform", `translate(0 ${n((frame.time * 15 + 7) % 15)})`);
    set("heart-eyes", "opacity", unit((p.hearts - .55) / .45) * (1 - frame.blink));
    set("hearts", "opacity", unit(p.hearts));
    set("hearts", "transform", `translate(0 ${n(-Math.sin(frame.time * 2) * 3)})`);
    set("worry", "opacity", unit(p.worry));
    set("sleep-bubble", "opacity", unit((.4 - p.glow) * 4) * unit((3 - p.eyeL) / 3));
    set("sleep-bubble", "transform", `translate(209 139) scale(${n(1 + frame.breathe * 10)}) translate(-209 -139)`);
    set("core-glow", "opacity", .15 + unit(p.glow) * .6 + frame.jaw * .15);
    set("core", "transform", `translate(160 246) scale(${n(1 + frame.breathe * 3 + frame.jaw * .05)}) translate(-160 -246)`);
    set("sparkles", "opacity", .12 + unit(p.sparkle) * .8);
    set("sparkle-one", "transform", `translate(0 ${n(Math.sin(frame.time * 1.7) * 4)})`);
    set("sparkle-two", "transform", `translate(0 ${n(Math.cos(frame.time * 1.3) * 3)})`);
    set("shadow", "rx", 54 - (p.lift + frame.bob) * .3);
    set("shadow", "opacity", .16 + unit((p.lift + 15) / 30) * .09);
    // Fade the comet with the action's blended sparkle, rather than a body transform.
    set("comet", "opacity", unit(p.comet));
    set("comet", "transform", `translate(${n(160 + Math.sin(frame.time * 2) * 77)} ${n(109 + Math.cos(frame.time * 2.5) * 17)})`);
    svg.dataset.action = frame.action;
    svg.dataset.mouthOpen = n(opening);
    svg.dataset.motion = input.reducedMotion ? "reduced" : input.animated ? "animated" : "static";
  };
}

export function Lumi({ emotion = "idle", intensity = 1, phase = "disconnected", speechLevel = 0,
  microphoneLevel = 0, idleAction = "auto", size = 530, className = "", animated = true,
  interactive = true, label = "루미, 별빛을 품은 정령" }: LumiProps) {
  const uid = `lumi-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const svg = useRef<SVGSVGElement>(null);
  const state = useRef(createLumiState(emotion, intensity));
  const wake = useRef<() => void>(() => {});
  const petTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const gaze = useRef({ x: 0, y: 0 });
  const input = useRef<LumiInput>({ emotion, intensity, phase, speechLevel, microphoneLevel,
    action: idleAction, reducedMotion: false, animated, gazeX: 0, gazeY: 0 });
  input.current = { ...input.current, emotion, intensity, phase, speechLevel, microphoneLevel, action: idleAction, animated };
  // RAF owns morph attributes after mount; React must never snap them on retarget.
  const initial = useRef(expressionPose(emotion, intensity)).current;
  const id = (name: string) => `${uid}-${name}`;
  const paint = (name: string) => `url(#${id(name)})`;

  useEffect(() => {
    if (!svg.current) return;
    const draw = bindRig(svg.current);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0, last = 0, disposed = false;
    const tick = (now: number) => {
      raf = 0;
      if (disposed || document.hidden) return;
      input.current = { ...input.current, reducedMotion: media.matches, gazeX: gaze.current.x, gazeY: gaze.current.y };
      const frame = stepLumi(state.current, input.current, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      draw(frame, input.current);
      if (input.current.animated && !media.matches) raf = requestAnimationFrame(tick);
    };
    const resume = () => {
      if (disposed || document.hidden || raf) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const visibility = () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; last = 0; }
      else resume();
    };
    const preference = () => { cancelAnimationFrame(raf); raf = 0; last = 0; resume(); };
    wake.current = resume;
    media.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    resume();
    return () => {
      disposed = true; cancelAnimationFrame(raf); clearTimeout(petTimer.current); wake.current = () => {};
      media.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => { wake.current(); }, [emotion, intensity, phase, speechLevel, microphoneLevel, idleAction, animated]);
  const pet = () => {
    if (!interactive) return;
    clearTimeout(petTimer.current);
    const still = input.current.reducedMotion || !input.current.animated;
    state.current.pet = still ? .5 : .99;
    if (still) petTimer.current = setTimeout(() => { state.current.pet = 0; wake.current(); }, 700);
    wake.current();
  };
  const keyPet = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pet(); }
  };
  const look = (event: PointerEvent<SVGSVGElement>) => {
    if (!interactive || event.pointerType === "touch" || !svg.current) return;
    const rect = svg.current.getBoundingClientRect();
    gaze.current = { x: (event.clientX - rect.left) / Math.max(rect.width, 1) * 2 - 1,
      y: (event.clientY - rect.top) / Math.max(rect.height, 1) * 2 - 1 };
  };
  return (
    <svg ref={svg} className={`lumi-character ${className}`} viewBox="0 0 320 360" width={size} height={size * 1.125}
      role={interactive ? "group" : "img"} aria-labelledby={id("title")} aria-describedby={id("description")}
      data-character="lumi" data-emotion={emotion} data-speaking={phase === "speaking"}
      onPointerMove={look} onPointerLeave={() => { gaze.current = { x: 0, y: 0 }; }}>
      <title id={id("title")}>{label}</title>
      <desc id={id("description")}>{"민트와 라벤더빛 말랑한 몸에 작은 별을 품은 친구. 누르면 반갑게 반응해요."}</desc>
      <defs>
        <linearGradient id={id("body")} x1=".16" y1="0" x2=".83" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="#f3fff9" /><stop offset=".36" stopColor="#c3f4e8" /><stop offset=".72" stopColor="#b6dce9" /><stop offset="1" stopColor="#c5b9eb" />
        </linearGradient>
        <linearGradient id={id("rim")} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffffff" stopOpacity=".96" /><stop offset=".5" stopColor="#e1fffb" stopOpacity=".25" /><stop offset="1" stopColor="#e7dfff" stopOpacity=".8" /></linearGradient>
        <radialGradient id={id("light")} cx=".35" cy=".15" r=".8"><stop stopColor="#ffffff" stopOpacity=".76" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></radialGradient>
        <radialGradient id={id("core-light")}><stop stopColor="#fff4bd" stopOpacity=".8" /><stop offset="1" stopColor="#fff0b6" stopOpacity="0" /></radialGradient>
        <radialGradient id={id("cheek")}><stop stopColor="#ed9fbf" stopOpacity=".85" /><stop offset="1" stopColor="#ed9fbf" stopOpacity="0" /></radialGradient>
        <linearGradient id={id("gold")} x2=".7" y2="1"><stop stopColor="#fff9d4" /><stop offset=".5" stopColor="#ffe49a" /><stop offset="1" stopColor="#f1bb75" /></linearGradient>
        <filter id={id("glow")} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <ellipse data-part="shadow" cx="160" cy="308" rx="54" ry="7" fill="#798f99" opacity=".2" />
      <g data-part="sparkles" fill="#d4eae1" opacity=".3" aria-hidden="true">
        <path data-part="sparkle-one" d="M74 150l2.5 6.5L83 159l-6.5 2.5L74 168l-2.5-6.5L65 159l6.5-2.5Z" />
        <path data-part="sparkle-two" d="M250 202l2 5L257 209l-5 2L250 216l-2-5L243 209l5-2Z" />
        <circle cx="239" cy="130" r="2" /><circle cx="76" cy="245" r="1.8" />
      </g>
      <g data-part="hearts" fill="#eea9c6" opacity="0" aria-hidden="true"><path d={HEART} transform="translate(88 142) scale(.65) rotate(-15)" /><path d={HEART} transform="translate(238 166) scale(.48) rotate(16)" /></g>
      <g data-part="comet" opacity="0" fill="#ffe5a0" aria-hidden="true"><path d="M0-7L2-2L7 0L2 2L0 7L-2 2L-7 0L-2-2Z" /><path d="M-10 0h-15M-12 4h-7" stroke="#fff1bb" strokeWidth="1.5" strokeLinecap="round" /></g>
      <g data-part="rig-root" transform={`rotate(${initial.tilt} 160 278)`}>
        <g data-part="body-squash">
          <g data-part="antenna"><path d="M162 103Q174 97 177 83" fill="none" stroke="#c2e8dc" strokeWidth="3" strokeLinecap="round" /><path d="M177 65Q179 75 188 77Q180 79 177 88Q175 79 167 77Q175 75 177 65Z" fill={paint("gold")} stroke="#fff4c8" strokeWidth="1.2" /></g>
          <ellipse cx="136" cy="281" rx="11" ry="14" fill={paint("body")} transform="rotate(9 136 281)" />
          <ellipse cx="186" cy="280" rx="11" ry="14" fill={paint("body")} transform="rotate(-9 186 280)" />
          <path data-part="body" d={BODY} fill={paint("body")} stroke={paint("rim")} strokeWidth="1.8" strokeLinejoin="round" />
          <path d={BODY} fill={paint("light")} />
          <path d="M113 144C121 126 134 118 144 116" fill="none" stroke="#ffffff" strokeOpacity=".65" strokeWidth="5.2" strokeLinecap="round" />
          <path d="M110 153l-1 4" stroke="#ffffff" strokeOpacity=".6" strokeWidth="4" strokeLinecap="round" />
          <path d="M102 251Q117 265 134 263M208 257l7-5" fill="none" stroke="#efeaff" strokeOpacity=".4" strokeWidth="2.5" strokeLinecap="round" />
          <ellipse data-part="core-glow" cx="160" cy="246" rx="43" ry="39" fill={paint("core-light")} opacity=".5" />
          <g data-part="core"><path d={STAR} fill={paint("gold")} stroke="#fff8d9" strokeWidth="1.4" strokeLinejoin="round" filter={paint("glow")} /><path d="M158 238l-4 5" stroke="#fffcec" strokeWidth="2.5" strokeLinecap="round" /></g>
          <circle cx="126" cy="229" r="2.3" fill="#ffffff" opacity=".35" /><circle cx="195" cy="237" r="1.6" fill="#ffffff" opacity=".45" />
          <g data-part="arm-left"><path d="M103 218C95 208 84 210 80 220C75 232 83 242 91 237L106 225Z" fill={paint("body")} stroke={paint("rim")} strokeWidth="1.2" /></g>
          <g data-part="arm-right"><path d="M219 218C227 208 238 210 242 220C247 232 239 242 231 237L216 225Z" fill={paint("body")} stroke={paint("rim")} strokeWidth="1.2" /></g>
          <g data-part="face" fill="#364652" strokeLinecap="round" strokeLinejoin="round">
            <g data-part="blush" opacity={initial.blush}><ellipse cx="122" cy="191" rx="14" ry="8" fill={paint("cheek")} /><ellipse cx="199" cy="191" rx="14" ry="8" fill={paint("cheek")} /></g>
            <path data-part="eye-left" d={eyePath(139, 176, initial.eyeWidth, initial.eyeL, initial.curveL)} />
            <path data-part="eye-right" d={eyePath(181, 176, initial.eyeWidth, initial.eyeR, initial.curveR)} />
            <path data-part="brow-left" d="M131 162Q139 159 147 162" fill="none" stroke="#697681" strokeWidth="2" opacity="0" />
            <path data-part="brow-right" d="M173 162Q181 159 189 162" fill="none" stroke="#697681" strokeWidth="2" opacity="0" />
            <g data-part="heart-eyes" fill="#c16a91" opacity="0"><path d={HEART} transform="translate(139 176) scale(.65)" /><path d={HEART} transform="translate(181 176) scale(.65)" /></g>
            <path data-part="mouth" d={mouthPath(initial.mouthWidth, initial.smile, initial.mouthOpen, initial.mouthSkew)} stroke="#364652" strokeWidth="1.8" />
            <g data-part="tears" fill="#80cbe6" opacity="0"><path d="M136 183Q132 196 135 207Q138 210 141 207L142 183Z" opacity=".6" /><path d="M178 183Q177 197 180 209Q184 212 186 208L185 183Z" opacity=".6" /><ellipse data-part="tear-left" cx="138" cy="205" rx="2.7" ry="4.2" /><ellipse data-part="tear-right" cx="182" cy="205" rx="2.7" ry="4.2" /></g>
          </g>
          <path data-part="worry" d="M213 145Q204 156 209 160Q213 164 217 160Q221 156 213 145Z" fill="#8ccbdc" stroke="#d0f6fa" strokeWidth="1" opacity="0" />
          <g data-part="sleep-bubble" opacity="0"><circle cx="209" cy="139" r="13" fill="#d6f6ef" fillOpacity=".3" stroke="#eafff9" strokeOpacity=".7" strokeWidth="1.3" /><path d="M202 134l2-2" stroke="white" strokeWidth="2" strokeLinecap="round" /></g>
        </g>
      </g>
      {interactive && <g className="lumi-pet-target" role="button" tabIndex={0} aria-label={"루미 쓰다듬기"} onClick={pet} onKeyDown={keyPet}>
        <rect x="78" y="87" width="169" height="206" rx="70" fill="transparent" />
        <rect className="lumi-focus-ring" x="72" y="80" width="181" height="221" rx="78" fill="none" stroke="#ffe49a" strokeWidth="2" strokeDasharray="3 5" />
      </g>}
    </svg>
  );
}

import { useEffect, useId, useRef } from "react";
import type { ConversationPhase, EmotionId } from "../../core/types";
import type { IdleAction } from "./GreusCat";
import { bodyPath, clamp, eyePath, FACES, mixFace, MORU_ACTIONS, motionAt, mouthPath, spring, type Face, type Spring } from "./moru/rig";
import "./moru/moru.css";

export interface MoruProps {
  emotion?: EmotionId; intensity?: number; phase?: ConversationPhase;
  speechLevel?: number; microphoneLevel?: number; idleAction?: IdleAction | "auto";
  size?: number; className?: string; staticPreview?: boolean;
}
const INK = "#382d34", FUR = "#fff7eb", EDGE = "#c7b4aa", PEACH = "#edb7b0";
const makeSpring = (): Spring => ({ value: 0, velocity: 0 });

/** Flat artwork; one animation owner. React never replaces in-flight geometry. */
export function MoruRabbit({ emotion = "idle", intensity = 1, phase = "disconnected", speechLevel = 0,
  microphoneLevel = 0, idleAction = "auto", size = 530, className = "", staticPreview = false }: MoruProps) {
  const svg = useRef<SVGSVGElement>(null), titleId = useId();
  const live = useRef({ emotion, intensity, phase, speechLevel, microphoneLevel, idleAction });
  live.current = { emotion, intensity, phase, speechLevel, microphoneLevel, idleAction };
  const controls = useRef({ lookX: 0, lookY: 0, down: false, drag: 0, pointerY: 0, petUntil: 0, wake: () => {} });
  const initial = useRef(FACES[emotion]);

  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    const parts = Object.fromEntries([...root.querySelectorAll<SVGElement>("[data-part]")].map(el => [el.dataset.part!, el]));
    const set = (part: string, attr: string, value: number | string) => parts[part]?.setAttribute(attr, String(value));
    const transform = (part: string, value: string) => set(part, "transform", value);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = preference.matches || staticPreview;
    let frame = 0, disposed = false, last = 0, time = 0, feedbackTimer = 0;
    let current: Face = { ...initial.current };
    const springs = Object.fromEntries(["squash", "lift", "lean", "leftEar", "rightEar", "earTip", "pawL", "pawR", "pawLX", "pawLY", "pawRX", "pawRY", "gazeX", "gazeY"].map(k => [k, makeSpring()]));
    const { squash, lift, lean, leftEar, rightEar, earTip, pawL, pawR, pawLX, pawLY, pawRX, pawRY, gazeX, gazeY } = springs;
    let previousInput: MoruProps["idleAction"];
    let action: IdleAction = "none", actionStarted = 0, nextAction = 14, nextBlink = 3.4, blinkStarted = -10, autoIndex = 0;
    const automatic: Exclude<IdleAction, "none">[] = ["groom", "stretch", "knead", "sleep", "air-punch", "yawn", "butterfly"];

    const draw = (now: number) => {
      const dt = last ? clamp((now - last) / 1000, 0, .064) : 1 / 60;
      last = now;
      if (!reduced) time += dt;
      const input = live.current, interaction = controls.current;
      const pet = !staticPreview && (interaction.down || now < interaction.petUntil);
      const talking = input.phase === "speaking", busy = !["disconnected", "idle"].includes(input.phase);
      if (previousInput !== input.idleAction) {
        action = input.idleAction === "auto" ? "none" : input.idleAction;
        actionStarted = time; previousInput = input.idleAction; nextAction = time + 14;
      }
      if (busy || pet || reduced || !["idle", "relaxed", "sleepy"].includes(input.emotion)) { action = "none"; nextAction = time + 14; }
      if (action !== "none" && time - actionStarted >= MORU_ACTIONS[action].seconds) { action = "none"; nextAction = time + 10 + autoIndex % 4; }
      if (!busy && !pet && !reduced && action === "none" && input.idleAction === "auto" && time > nextAction) {
        action = automatic[autoIndex++ % automatic.length]; actionStarted = time;
      }
      const motion = motionAt(action, time - actionStarted);
      const target = mixFace(FACES.idle, FACES[input.emotion] ?? FACES.idle, clamp(input.intensity));
      if (pet && !talking) Object.assign(target, { left: .03, right: .03, arc: 1.05, mouth: .95, blush: .95, brow: 0 });
      if (motion.closed) {
        target.left *= 1 - motion.closed; target.right *= 1 - motion.closed;
        target.arc = action === "sleep" || action === "yawn" ? -.7 : 1;
      }
      current = reduced ? target : mixFace(current, target, 1 - Math.exp(-dt * 12));
      const breathe = reduced ? 0 : Math.sin(time * 1.8) * .018;
      const bob = !reduced && ["excited", "laughing", "happy"].includes(input.emotion) ? Math.sin(time * 6) * .035 : 0;
      if (reduced) {
        // Reset velocities too: re-enabling motion must not release stale momentum.
        Object.values(springs).forEach(s => { s.value = 0; s.velocity = 0; });
        squash.value = current.squash + (pet ? .15 : 0); lean.value = current.tilt;
        leftEar.value = current.earL; rightEar.value = current.earR; earTip.value = -current.earR * .35;
      } else {
        spring(squash, current.squash + motion.squash + breathe + bob + (pet ? .22 : 0) + clamp(interaction.drag, 0, .45), dt, 19, .66);
        spring(lift, motion.y, dt, 23, .83);
        spring(lean, current.tilt + motion.tilt + interaction.lookX * 2, dt, 13, .76);
        const mic = input.phase === "listening" ? clamp(input.microphoneLevel) : 0;
        // Different response times produce overlap, not a synchronized wiggle.
        spring(leftEar, current.earL + motion.earL + (pet ? -13 : 0) + mic * 16 + squash.velocity * 9 - lean.velocity * .23, dt, 11, .5);
        spring(rightEar, current.earR + motion.earR + (pet ? 14 : 0) - mic * 9 - squash.velocity * 13 + lean.velocity * .3, dt, 8.5, .52);
        spring(earTip, -rightEar.value * .35 + rightEar.velocity * .18, dt, 10, .58);
        spring(pawL, motion.armL + (pet ? -24 : 0), dt, 16, .7); spring(pawR, motion.armR + (pet ? 24 : 0), dt, 14, .7);
        spring(pawLX, motion.pawLX, dt, 18, .75); spring(pawLY, motion.pawLY, dt, 18, .75);
        spring(pawRX, motion.pawRX, dt, 18, .75); spring(pawRY, motion.pawRY, dt, 18, .75);
        spring(gazeX, interaction.lookX * 4, dt, 13, .85); spring(gazeY, interaction.lookY * 2.5, dt, 13, .85);
      }
      const q = clamp(squash.value, -.55, .95), f = (v: number) => v.toFixed(3);
      set("body", "d", bodyPath(q));
      transform("mass", `translate(0 ${f(lift.value)}) rotate(${f(lean.value)} 160 266)`);
      transform("ears", `translate(0 ${f(q * 50)})`);
      transform("ear-left", `rotate(${f(leftEar.value)} 119 140)`);
      transform("ear-right", `rotate(${f(rightEar.value)} 190 136)`);
      transform("ear-tip", `rotate(${f(earTip.value)} 212 83)`);
      transform("face", `translate(${f(gazeX.value)} ${f(q * 32 + gazeY.value)})`);
      transform("arm-left", `translate(${f(-q * 7 + pawLX.value)} ${f(q * 6 + pawLY.value)}) rotate(${f(pawL.value)} 104 213)`);
      transform("arm-right", `translate(${f(q * 7 + pawRX.value)} ${f(q * 6 + pawRY.value)}) rotate(${f(pawR.value)} 216 213)`);
      transform("feet", `translate(0 ${f(lift.value)})`);
      transform("tail", `translate(${f(q * 9)} ${f(q * 3)})`);
      set("shadow", "rx", 57 + q * 8 + lift.value * .25); set("shadow", "opacity", .13 + lift.value * .0016);
      if (!reduced && time > nextBlink && motion.closed < .2 && !pet) { blinkStarted = time; nextBlink = time + 3.2 + (Math.sin(time * 11) + 1) * 1.25; }
      const blinkT = time - blinkStarted, blink = !reduced && blinkT < .19 ? Math.sin(Math.PI * blinkT / .19) : 0;
      set("eye-left", "d", eyePath(137, current.left * (1 - blink * .96), current.arc, current.slant));
      set("eye-right", "d", eyePath(183, current.right * (1 - blink * .96), current.arc, -current.slant));
      set("brows", "opacity", current.brow);
      set("brow-left", "d", `M130 ${160-current.browLift-current.browTilt/2} Q137 ${158-current.browLift} 144 ${160-current.browLift+current.browTilt/2}`);
      set("brow-right", "d", `M176 ${160-current.browLift+current.browTilt/2} Q183 ${158-current.browLift} 190 ${160-current.browLift-current.browTilt/2}`);
      const level = talking ? clamp(input.speechLevel) : 0;
      // Silence is authoritative; no face tween may hold the speech mouth open.
      const open = talking ? (level >= .012 ? Math.sqrt(level) * 11 : 0) : Math.max(current.open, motion.yawn);
      set("mouth-line", "d", mouthPath(current.mouth, current.width));
      set("mouth-line", "opacity", talking ? 1 : clamp(1-open*(1-Math.max(current.mouth,0))*.5-motion.yawn*.13));
      set("mouth-inner", "rx", (3.8 + open * .25) * current.width); set("mouth-inner", "ry", open);
      set("mouth-inner", "cy", 198 + open * .65); set("mouth-inner", "opacity", open > .05 ? 1 : 0);
      set("tongue", "opacity", open > 3 ? .95 : 0); set("tongue", "cy", 198 + open * 1.2);
      set("tongue", "rx", Math.min(3.8, open * .4)); set("tongue", "ry", Math.min(2.4, open * .22));
      set("cheeks", "opacity", Math.max(current.blush, motion.cheek)); set("tears", "opacity", current.tears);
      transform("tears", `translate(0 ${reduced ? 0 : (Math.sin(time * 6)+1)*1.3})`);
      set("pet-heart", "opacity", pet ? 1 : 0); transform("pet-heart", `translate(0 ${reduced ? 0 : -Math.sin(time*3)*2})`);
      Object.assign(root.dataset, { action, speaking: String(talking), mouthOpen: f(open), petting: String(pet), squash: f(q), reducedMotion: String(reduced), blinking: String(blink > .1) });
    };
    const tick = (now: number) => { frame = 0; if (disposed || document.hidden) return; draw(now); if (!reduced) frame = requestAnimationFrame(tick); };
    const wake = () => {
      if (disposed || document.hidden) return;
      const next = preference.matches || staticPreview;
      if (next !== reduced) { cancelAnimationFrame(frame); frame = 0; reduced = next; }
      if (reduced) { draw(performance.now()); return; }
      if (!frame) { last = 0; frame = requestAnimationFrame(tick); }
    };
    const onPreference = () => { cancelAnimationFrame(frame); frame = 0; wake(); };
    const onVisibility = () => {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      if (!document.hidden) wake(); else { controls.current.down = false; controls.current.drag = 0; }
    };
    controls.current.wake = () => { wake(); clearTimeout(feedbackTimer); if (reduced && !staticPreview) feedbackTimer = window.setTimeout(wake, 1100); };
    preference.addEventListener("change", onPreference); document.addEventListener("visibilitychange", onVisibility);
    draw(performance.now()); wake();
    return () => {
      disposed = true; cancelAnimationFrame(frame); clearTimeout(feedbackTimer);
      preference.removeEventListener("change", onPreference); document.removeEventListener("visibilitychange", onVisibility);
      controls.current.wake = () => {};
    };
  }, [staticPreview]);
  useEffect(() => { controls.current.wake(); }, [emotion, intensity, phase, speechLevel, microphoneLevel, idleAction]);
  const pet = () => { controls.current.petUntil = performance.now() + 950; controls.current.wake(); };
  const stopDrag = () => { controls.current.down = false; controls.current.drag = 0; controls.current.wake(); };
  return (
    <svg ref={svg} className={`moru-rabbit ${className}`} viewBox="0 0 320 320" width={size} height={size}
      role={staticPreview ? "img" : "group"} aria-labelledby={titleId} data-character="moru" data-emotion={emotion}
      onPointerMove={staticPreview ? undefined : e => {
        const r = e.currentTarget.getBoundingClientRect();
        controls.current.lookX = clamp((e.clientX-r.left)/r.width*2-1,-1,1);
        controls.current.lookY = clamp((e.clientY-r.top)/r.height*2-1,-1,1);
        if (controls.current.down) controls.current.drag = clamp((e.clientY-controls.current.pointerY)/r.height*1.8,0,.45);
      }} onPointerLeave={() => { controls.current.lookX=0; controls.current.lookY=0; }}>
      <title id={titleId}>{"\ubaa8\ub8e8, \ud55c\ucabd \uadc0\uac00 \uc811\ud78c \ub9d0\ub791\ud55c \ud1a0\ub07c"}</title>
      <ellipse data-part="shadow" cx="160" cy="282" rx="57" ry="5" fill="#44333e" opacity=".13" />
      <g data-part="feet" fill="#f2e3d2" stroke={EDGE} strokeWidth="1.5">
        <path d="M115 258 C113 265 115 279 127 280 C140 280 146 271 143 258Z" /><path d="M177 258 C174 270 180 280 193 280 C206 280 209 266 204 258Z" />
      </g>
      <g data-part="mass">
        <g data-part="tail"><path d="M230 225 C241 213 256 219 254 232 C253 245 239 247 231 239Z" fill={FUR} stroke={EDGE} strokeWidth="1.5" /></g>
        <g data-part="ears" fill={FUR} stroke={EDGE} strokeWidth="1.5" strokeLinejoin="round">
          <g data-part="ear-left"><path d="M102 145 C93 121 83 75 96 54 C102 43 115 44 120 54 C130 73 137 114 140 143Z" /><path d="M111 123 C106 107 96 72 103 61 C108 56 112 61 114 68 C120 83 124 109 125 125Z" fill={PEACH} stroke="none" /></g>
          <g data-part="ear-right"><path d="M176 139 C172 114 172 85 185 66 C194 53 207 54 217 66 C224 78 218 92 209 107 L198 142Z" /><path d="M184 125 C182 107 182 83 192 73 C198 68 203 72 204 79 C201 94 196 105 194 127Z" fill={PEACH} stroke="none" />
            <g data-part="ear-tip"><path d="M201 61 C218 52 232 70 238 90 C243 106 237 121 226 121 C214 121 211 112 211 100 C211 86 208 70 201 61Z" fill={FUR} /><path d="M218 82 C223 84 228 95 228 105 C228 111 223 112 221 105 C218 98 220 89 218 82Z" fill={PEACH} stroke="none" /></g>
          </g>
        </g>
        <path data-part="body" d={bodyPath(0)} fill={FUR} stroke={EDGE} strokeWidth="1.5" />
        <g data-part="face">
          <g data-part="cheeks" fill="#eca9aa" opacity=".28"><ellipse cx="117" cy="196" rx="10" ry="5.5" /><ellipse cx="203" cy="196" rx="10" ry="5.5" /></g>
          <g data-part="brows" opacity="0" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round"><path data-part="brow-left" /><path data-part="brow-right" /></g>
          <path data-part="eye-left" d={eyePath(137,1,0,0)} fill={INK} /><path data-part="eye-right" d={eyePath(183,1,0,0)} fill={INK} />
          <ellipse data-part="mouth-inner" cx="160" cy="199" rx="4" ry="0" fill={INK} opacity="0" /><ellipse data-part="tongue" cx="160" cy="206" rx="3" ry="2" fill="#eea8ac" opacity="0" />
          <path data-part="mouth-line" d={mouthPath(.65,1)} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <g data-part="tears" fill="#a6cfdd" opacity="0"><path d="M132 188 C132 193 128 197 130 201 C133 205 138 201 136 197Z" /><path d="M188 188 C188 193 192 197 190 201 C187 205 182 201 184 197Z" /></g>
        </g>
        <g data-part="arm-left"><path d="M103 206 C94 200 86 204 85 214 C85 224 92 234 101 235 C109 235 112 226 109 217" fill="#f8ecdf" stroke={EDGE} strokeWidth="1.5" strokeLinecap="round" /></g>
        <g data-part="arm-right"><path d="M217 206 C226 200 234 204 235 214 C235 224 228 234 219 235 C211 235 208 226 211 217" fill="#f8ecdf" stroke={EDGE} strokeWidth="1.5" strokeLinecap="round" /></g>
      </g>
      <g data-part="pet-heart" opacity="0"><path d="M252 157 C240 149 241 142 247 142 C250 142 252 145 252 146 C253 141 259 140 262 143 C269 149 260 155 252 160Z" fill="#e5a3a5" /></g>
      {!staticPreview && <g role="button" tabIndex={0} aria-label={"\ubaa8\ub8e8 \uc4f0\ub2e4\ub4ec\uae30"} className="moru-touch" onClick={pet}
        onKeyDown={e => { if(e.key==="Enter"||e.key===" "){e.preventDefault();if(!e.repeat)pet();} }}
        onPointerDown={e => { if(e.button!==0)return;controls.current.down=true;controls.current.pointerY=e.clientY;e.currentTarget.setPointerCapture(e.pointerId);controls.current.wake(); }}
        onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}>
        <path d="M91 155 Q160 108 227 155 L226 234 Q160 267 94 234Z" fill="transparent" />
        <path className="moru-focus-ring" d="M87 151 Q160 101 231 151 L232 239 Q160 278 88 239Z" fill="none" stroke="#725b71" strokeWidth="2" strokeDasharray="4 5" />
      </g>}
    </svg>
  );
}

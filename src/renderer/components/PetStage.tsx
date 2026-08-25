import { useEffect, useId, useRef } from "react";
import type { CharacterProfile, OrnamentKind } from "../../characters/catalog";
import { BASE_RIG, EMOTION_RIGS, emotionTransitionRate, interpolateRig } from "../../core/emotion";
import type { CharacterRigState, ConversationPhase, EmotionId } from "../../core/types";

type Refs = {
  root: SVGGElement | null;
  head: SVGGElement | null;
  body: SVGGElement | null;
  face: SVGGElement | null;
  eyeL: SVGGElement | null;
  eyeR: SVGGElement | null;
  browL: SVGPathElement | null;
  browR: SVGPathElement | null;
  cheekL: SVGEllipseElement | null;
  cheekR: SVGEllipseElement | null;
  mouth: SVGPathElement | null;
  armL: SVGGElement | null;
  armR: SVGGElement | null;
  ornamentL: SVGGElement | null;
  ornamentR: SVGGElement | null;
  tail: SVGGElement | null;
};

function HeadShape({ kind }: { kind: OrnamentKind }) {
  if (kind === "bot-screen") return <path id="head-shape" d="M176 325 Q176 207 302 190 H698 Q824 207 824 325 V601 Q824 719 698 736 H302 Q176 719 176 601Z" />;
  if (kind === "bot-orbit") return <path id="head-shape" d="M177 466 C177 274 304 169 500 169 C696 169 823 274 823 466 C823 661 696 746 500 746 C304 746 177 661 177 466Z" />;
  if (kind === "bot-cloud") return <path id="head-shape" d="M184 482 C184 341 262 250 380 220 C420 157 528 143 589 202 C715 203 817 309 817 474 C817 648 697 742 500 742 C303 742 184 649 184 482Z" />;
  if (kind === "jirai") return <path id="head-shape" d="M198 472 C198 286 315 188 500 188 C685 188 802 286 802 472 C802 651 690 736 500 736 C310 736 198 651 198 472Z" />;
  if (kind === "fox") return <path id="head-shape" d="M150 486 C150 300 282 202 500 202 C718 202 850 300 850 486 C850 666 711 748 500 748 C289 748 150 666 150 486Z" />;
  if (kind === "antenna-short") return <path id="head-shape" d="M170 478 C170 292 292 185 500 185 C708 185 830 292 830 478 C830 650 704 733 500 733 C296 733 170 650 170 478Z" />;
  if (kind === "rabbit") return <path id="head-shape" d="M187 500 C187 316 303 232 500 232 C697 232 813 316 813 500 C813 678 694 758 500 758 C306 758 187 678 187 500Z" />;
  if (kind === "sprout") return <path id="head-shape" d="M168 478 C168 282 288 175 500 175 C712 175 832 282 832 478 C832 659 704 739 500 739 C296 739 168 659 168 478Z" />;
  if (kind === "bear") return <path id="head-shape" d="M176 485 C176 303 294 200 500 200 C706 200 824 303 824 485 C824 658 697 738 500 738 C303 738 176 658 176 485Z" />;
  if (kind === "roundear") return <path id="head-shape" d="M164 482 C164 294 286 194 500 194 C714 194 836 294 836 482 C836 657 702 735 500 735 C298 735 164 657 164 482Z" />;
  return <path id="head-shape" d="M195 480 C195 300 305 198 500 198 C695 198 805 300 805 480 C805 655 690 742 500 742 C310 742 195 655 195 480Z" />;
}

function EmotionAccents({ emotion, outline, cheek }: { emotion: EmotionId; outline: string; cheek: string }) {
  if (emotion === "affectionate") return <g className="emotion-accent accent-float" fill={cheek} stroke={outline} strokeWidth="8"><path d="M266 488 C245 463 207 480 214 509 C219 530 246 543 266 557 C286 543 313 530 318 509 C325 480 287 463 266 488Z" /><path d="M758 421 C745 405 720 416 725 435 C729 449 747 458 758 468 C771 458 788 449 792 435 C797 416 772 405 758 421Z" /></g>;
  if (emotion === "sad" || emotion === "lonely") return <g className="emotion-accent accent-tear" fill="#71C9FF" stroke="none"><path d="M390 622 C390 622 374 648 374 660 C374 673 384 681 396 678 C410 675 415 660 408 648Z" /></g>;
  if (emotion === "worried" || emotion === "afraid") return <g className="emotion-accent accent-sweat" fill="#80D6FF" stroke={outline} strokeWidth="7"><path d="M746 431 C746 431 725 465 725 480 C725 497 739 508 754 503 C770 498 774 480 765 464Z" /></g>;
  if (emotion === "angry") return <g className="emotion-accent accent-pulse" fill="none" stroke="#E85D67" strokeWidth="13" strokeLinecap="round"><path d="M702 402 L733 371 M711 371 L735 397 M748 385 L768 365" /></g>;
  if (emotion === "sleepy") return <g className="emotion-accent accent-float" fill={outline} stroke="none"><text x="690" y="430" fontSize="58" fontWeight="900">Z</text><text x="746" y="372" fontSize="42" fontWeight="900" opacity=".7">Z</text></g>;
  if (emotion === "confused") return <g className="emotion-accent accent-float" fill={outline} stroke="none"><text x="724" y="447" fontSize="92" fontWeight="900">?</text></g>;
  if (emotion === "proud") return <g className="emotion-accent accent-spark" fill="#FFF6A7" stroke={outline} strokeWidth="7"><path d="M746 390 L758 420 L789 432 L758 444 L746 475 L734 444 L703 432 L734 420Z" /></g>;
  if (emotion === "excited" || emotion === "joyful") return <g className="emotion-accent accent-spark" fill="none" stroke="#FFF6A7" strokeWidth="11" strokeLinecap="round"><path d="M234 444 L193 420 M242 403 L219 363 M766 444 L807 420 M758 403 L781 363" /></g>;
  if (emotion === "surprised") return <g className="emotion-accent accent-pulse" fill="none" stroke="#FFF6A7" strokeWidth="9" opacity=".85"><circle cx="500" cy="493" r="354" /></g>;
  return null;
}

function Ornaments({ kind, outline, refs }: { kind: OrnamentKind; outline: string; refs: React.MutableRefObject<Refs> }) {
  const common = { stroke: outline, strokeWidth: 26, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "bot-orbit":
      return <><g id="ear-or-antenna-left" ref={(node) => { refs.current.ornamentL = node; }}><path {...common} d="M500 180 C492 131 480 105 458 80" fill="none" /><circle {...common} cx="439" cy="58" r="38" fill="#79FFF6" /></g><g id="ear-or-antenna-right" ref={(node) => { refs.current.ornamentR = node; }}><path {...common} d="M230 391 C145 397 122 454 142 516" fill="none" opacity=".75" /><path {...common} d="M770 391 C855 397 878 454 858 516" fill="none" opacity=".75" /></g></>;
    case "bot-screen":
      return <><g id="ear-or-antenna-left" ref={(node) => { refs.current.ornamentL = node; }}><path {...common} d="M178 370 H124 Q92 370 92 405 V520 Q92 555 124 555 H178Z" fill="#5B89FF" /></g><g id="ear-or-antenna-right" ref={(node) => { refs.current.ornamentR = node; }}><path {...common} d="M822 370 H876 Q908 370 908 405 V520 Q908 555 876 555 H822Z" fill="#5B89FF" /></g></>;
    case "bot-cloud":
      return <><g id="ear-or-antenna-left" ref={(node) => { refs.current.ornamentL = node; }}><path {...common} d="M366 231 C342 168 358 103 416 75" fill="none" /><circle {...common} cx="441" cy="63" r="34" fill="#A88CFF" /></g><g id="ear-or-antenna-right" ref={(node) => { refs.current.ornamentR = node; }}><path {...common} d="M660 241 C714 198 773 210 803 258" fill="none" opacity=".68" /></g></>;
    case "jirai":
      return <><g id="ear-or-antenna-left" ref={(node) => { refs.current.ornamentL = node; }} fill="#2D1820"><path {...common} d="M287 347 C220 314 176 240 189 178 C201 118 259 112 296 160 C329 204 334 278 325 340Z" /><path {...common} d="M250 377 C169 376 109 431 116 511 C122 574 181 600 236 565 C270 543 289 487 292 425Z" /><path d="M220 196 C241 173 260 185 274 209 C290 238 293 279 288 315" fill="none" stroke="#FF5AA8" strokeWidth="18" /></g><g id="ear-or-antenna-right" ref={(node) => { refs.current.ornamentR = node; }} fill="#2D1820"><path {...common} d="M713 347 C780 314 824 240 811 178 C799 118 741 112 704 160 C671 204 666 278 675 340Z" /><path {...common} d="M750 377 C831 376 891 431 884 511 C878 574 819 600 764 565 C730 543 711 487 708 425Z" /><path d="M780 196 C759 173 740 185 726 209 C710 238 707 279 712 315" fill="none" stroke="#FF5AA8" strokeWidth="18" /></g></>;
    case "rabbit":
      return <>
        <g id="ear-or-antenna-left" ref={(node) => { refs.current.ornamentL = node; }}><path {...common} d="M392 264 C344 221 274 151 276 79 C278 18 351 8 387 59 C429 120 430 205 425 271Z" /></g>
        <g id="ear-or-antenna-right" ref={(node) => { refs.current.ornamentR = node; }}><path {...common} d="M575 271 C570 205 571 120 613 59 C649 8 722 18 724 79 C726 151 656 221 608 264Z" /></g>
      </>;
    case "bear":
      return <>
        <g id="ear-or-antenna-left" ref={(node) => { refs.current.ornamentL = node; }}><circle {...common} cx="315" cy="215" r="91" /></g>
        <g id="ear-or-antenna-right" ref={(node) => { refs.current.ornamentR = node; }}><circle {...common} cx="685" cy="215" r="91" /></g>
      </>;
    case "roundear":
      return <>
        <g id="ear-or-antenna-left" ref={(node) => { refs.current.ornamentL = node; }}><circle {...common} cx="315" cy="205" r="98" /><path {...common} fill="#F8BBD3" strokeWidth="18" d="M282 205 C282 161 335 148 359 183 L365 229 L315 257 L277 225Z" /></g>
        <g id="ear-or-antenna-right" ref={(node) => { refs.current.ornamentR = node; }}><circle {...common} cx="685" cy="205" r="98" /><path {...common} fill="#F8BBD3" strokeWidth="18" d="M718 205 C718 161 665 148 641 183 L635 229 L685 257 L723 225Z" /></g>
      </>;
    case "fox":
      return <>
        <g id="ear-or-antenna-left" ref={(node) => { refs.current.ornamentL = node; }}><path {...common} d="M262 305 C210 235 196 122 220 65 C282 72 355 150 390 240Z" /></g>
        <g id="ear-or-antenna-right" ref={(node) => { refs.current.ornamentR = node; }}><path {...common} d="M738 305 C790 235 804 122 780 65 C718 72 645 150 610 240Z" /></g>
      </>;
    case "sprout":
      return <>
        <g id="ear-or-antenna-left" ref={(node) => { refs.current.ornamentL = node; }}><path {...common} d="M474 218 C454 170 421 126 424 79 C428 28 482 22 505 63 C520 31 561 31 581 61 C606 99 568 145 520 174 L520 220Z" /></g>
        <g id="ear-or-antenna-right" ref={(node) => { refs.current.ornamentR = node; }} />
      </>;
    case "heart":
      return <>
        <g id="ear-or-antenna-left" ref={(node) => { refs.current.ornamentL = node; }}><path {...common} d="M480 218 L480 156 C480 124 456 112 430 101 C375 77 392 22 438 32 C469 38 487 60 500 84 C513 60 531 38 562 32 C608 22 625 77 570 101 C544 112 520 124 520 156 L520 218Z" /></g>
        <g id="ear-or-antenna-right" ref={(node) => { refs.current.ornamentR = node; }} />
      </>;
    case "antenna-single":
      return <>
        <g id="ear-or-antenna-left" ref={(node) => { refs.current.ornamentL = node; }}><path {...common} d="M485 215 C485 170 495 139 495 106" fill="none" /><circle {...common} cx="500" cy="70" r="58" /></g>
        <g id="ear-or-antenna-right" ref={(node) => { refs.current.ornamentR = node; }} />
      </>;
    case "antenna-short":
      return <>
        <g id="ear-or-antenna-left" ref={(node) => { refs.current.ornamentL = node; }}><path {...common} d="M270 245 L222 186" fill="none" /><circle {...common} cx="198" cy="154" r="68" /></g>
        <g id="ear-or-antenna-right" ref={(node) => { refs.current.ornamentR = node; }}><path {...common} d="M730 245 L778 186" fill="none" /><circle {...common} cx="802" cy="154" r="68" /></g>
      </>;
    default:
      return <>
        <g id="ear-or-antenna-left" ref={(node) => { refs.current.ornamentL = node; }}><path {...common} d="M360 240 C350 182 336 138 306 106" fill="none" /><circle {...common} cx="283" cy="81" r="58" /></g>
        <g id="ear-or-antenna-right" ref={(node) => { refs.current.ornamentR = node; }}><path {...common} d="M640 240 C650 182 664 138 694 106" fill="none" /><circle {...common} cx="717" cy="81" r="58" /></g>
      </>;
  }
}

function BodyDetails({ profile }: { profile: CharacterProfile }) {
  if (profile.signature === "jirai") return <g id="costume" stroke={profile.outline} strokeWidth="20" strokeLinejoin="round"><path d="M397 788 Q500 742 603 788 L635 910 Q500 978 365 910Z" fill="#242127" /><path d="M389 842 Q500 892 611 842" fill="none" stroke="#F8F5FF" strokeWidth="12" /><path d="M465 788 L500 820 L535 788" fill="#FF5AA8" /><path d="M420 918 L407 972 M580 918 L593 972" fill="none" /><path d="M376 963 Q420 939 454 972 Q422 997 373 982Z M624 963 Q580 939 546 972 Q578 997 627 982Z" fill="#171319" /></g>;
  if (profile.signature === "screen") return <g id="chest-screen"><rect x="431" y="783" width="138" height="104" rx="28" fill="#242B3B" stroke={profile.outline} strokeWidth="16" /><path d="M458 834 H542" stroke="#79FFF6" strokeWidth="13" strokeLinecap="round" /><circle cx="500" cy="866" r="8" fill="#5B89FF" stroke="none" /></g>;
  if (["orbit", "cloud"].includes(profile.signature)) return <g id="core-light"><circle cx="500" cy="838" r="45" fill="#163653" stroke={profile.outline} strokeWidth="16" /><circle cx="500" cy="838" r="20" fill={profile.signature === "orbit" ? "#79FFF6" : "#CFC8FF"} stroke="none" /></g>;
  return null;
}

function SignatureDetails({ profile }: { profile: CharacterProfile }) {
  const o = profile.outline;
  switch (profile.signature) {
    case "bunny": return <g fill={o} stroke="none"><path d="M490 610 Q500 601 510 610 Q500 623 490 610Z" /><circle cx="360" cy="639" r="5" /><circle cx="640" cy="639" r="5" /></g>;
    case "bear": return <g><ellipse cx="500" cy="617" rx="78" ry="55" fill="#FFF0DB" stroke="none" opacity=".72" /><path d="M487 594 Q500 583 513 594 Q500 610 487 594Z" fill={o} stroke="none" /></g>;
    case "sunny": return <g fill="#EFA84B" stroke="none" opacity=".8"><circle cx="348" cy="616" r="6" /><circle cx="366" cy="624" r="4" /><circle cx="652" cy="616" r="6" /><circle cx="634" cy="624" r="4" /></g>;
    case "fox": return <g><path d="M454 276 L500 238 L546 276 L520 265 L500 290 L480 265Z" fill="#FFF0D8" stroke="none" opacity=".8" /><path d="M490 610 Q500 600 510 610 Q500 623 490 610Z" fill={o} stroke="none" /></g>;
    case "soft": return <g fill={o} stroke="none" opacity=".55"><circle cx="360" cy="612" r="4" /><circle cx="378" cy="618" r="3" /><circle cx="640" cy="612" r="4" /><circle cx="622" cy="618" r="3" /></g>;
    case "explorer": return <g fill="none" stroke="#FFF" strokeWidth="8" opacity=".55"><circle cx="382" cy="579" r="41" /><path d="M423 579 H456" /></g>;
    case "heart": return <path d="M486 608 C474 594 450 607 458 624 C464 636 482 643 500 655 C518 643 536 636 542 624 C550 607 526 594 514 608 C506 598 494 598 486 608Z" fill="#F06FA9" stroke="none" opacity=".75" />;
    case "goofy": return <path d="M524 650 L548 650 L536 679Z" fill="white" stroke={o} strokeWidth="7" />;
    case "solver": return <g fill="none" stroke={o} strokeWidth="11"><rect x="346" y="531" width="112" height="78" rx="32" /><rect x="542" y="531" width="112" height="78" rx="32" /><path d="M458 563 H542" /></g>;
    case "dreamer": return <g fill="#FFF8C9" stroke={o} strokeWidth="5"><path d="M350 619 L358 638 L378 646 L358 654 L350 674 L342 654 L322 646 L342 638Z" /></g>;
    case "orbit": return <g fill="none" stroke="#123A55" strokeWidth="12" opacity=".72"><path d="M301 479 C337 424 407 393 500 393 C593 393 663 424 699 479" /><circle cx="700" cy="479" r="13" fill="#4CA6FF" stroke="none" /></g>;
    case "screen": return <g><rect x="292" y="487" width="416" height="173" rx="72" fill="#242B3B" stroke={o} strokeWidth="14" opacity=".96" /></g>;
    case "cloud": return <g fill="none" stroke="#A88CFF" strokeWidth="9" opacity=".55"><path d="M305 447 C363 404 431 395 500 395" /><path d="M695 447 C637 404 569 395 500 395" /></g>;
    case "jirai": return <g><path d="M240 420 C259 265 370 190 500 190 C630 190 741 265 760 420 C705 341 640 318 584 315 L548 365 L500 324 L452 365 L416 315 C360 318 295 341 240 420Z" fill="#2D1820" stroke={o} strokeWidth="20" /><path d="M423 307 L455 230 L474 330 M577 307 L545 230 L526 330" fill="none" stroke="#FF5AA8" strokeWidth="17" /><g fill="white" stroke={o} strokeWidth="7"><g transform="translate(230 267)"><ellipse cx="21" cy="-13" rx="11" ry="23" transform="rotate(-18 21 -13)" /><ellipse cx="49" cy="-13" rx="11" ry="23" transform="rotate(18 49 -13)" /><circle cx="35" cy="18" r="28" /><circle cx="26" cy="17" r="3" fill={o} stroke="none" /><circle cx="44" cy="17" r="3" fill={o} stroke="none" /></g><g transform="translate(700 267)"><ellipse cx="21" cy="-13" rx="11" ry="23" transform="rotate(-18 21 -13)" /><ellipse cx="49" cy="-13" rx="11" ry="23" transform="rotate(18 49 -13)" /><circle cx="35" cy="18" r="28" /><circle cx="26" cy="17" r="3" fill={o} stroke="none" /><circle cx="44" cy="17" r="3" fill={o} stroke="none" /></g></g></g>;
    default: return null;
  }
}

function mouthPath(rig: CharacterRigState, profile: CharacterProfile): string {
  const centerX = 500;
  const width = 58 * profile.face.mouthScale * rig.mouthWidth * (1 - rig.mouthRound * 0.25);
  const top = profile.face.mouthY;
  const emotionalCurve = 20 * (rig.mouthSmile + profile.face.smileBias);
  const open = 5 + 50 * rig.mouthOpen;
  const leftY = top - emotionalCurve * 0.22;
  const centerY = top + emotionalCurve;
  const rightY = leftY;
  return `M ${centerX - width} ${leftY} C ${centerX - width * 0.48} ${centerY} ${centerX + width * 0.48} ${centerY} ${centerX + width} ${rightY} C ${centerX + width * 0.5} ${centerY + open} ${centerX - width * 0.5} ${centerY + open} ${centerX - width} ${leftY} Z`;
}

export function PetStage({
  profile,
  emotion,
  intensity,
  phase,
  mouthLevel,
  inputLevel,
}: {
  profile: CharacterProfile;
  emotion: EmotionId;
  intensity: number;
  phase: ConversationPhase;
  mouthLevel: number;
  inputLevel: number;
}) {
  const gradientId = useId().replaceAll(":", "");
  const refs = useRef<Refs>({ root: null, head: null, body: null, face: null, eyeL: null, eyeR: null, browL: null, browR: null, cheekL: null, cheekR: null, mouth: null, armL: null, armR: null, ornamentL: null, ornamentR: null, tail: null });
  const state = useRef<CharacterRigState>({ ...BASE_RIG });
  const propsRef = useRef({ emotion, intensity, phase, mouthLevel, inputLevel });
  propsRef.current = { emotion, intensity, phase, mouthLevel, inputLevel };

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let nextBlink = last + 2200 + Math.random() * 2500;
    let blinkStarted = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = propsRef.current;
      const baseTarget = EMOTION_RIGS[p.emotion];
      const target = { ...BASE_RIG } as CharacterRigState;
      for (const key of Object.keys(target) as (keyof CharacterRigState)[]) {
        target[key] = BASE_RIG[key] + (baseTarget[key] - BASE_RIG[key]) * p.intensity;
      }
      const alpha = 1 - Math.exp(-emotionTransitionRate(p.emotion) * dt);
      state.current = interpolateRig(state.current, target, alpha);
      const rig = state.current;
      const t = now / 1000;
      const motionScale = reduced ? 0.25 : 1;
      const breath = Math.sin(t * 2.1) * (1.8 + rig.bounce * 4 * profile.motion.bounce) * motionScale;
      const sway = Math.sin(t * (1.2 + rig.sway * 2.5)) * rig.sway * 10 * profile.motion.sway * motionScale;
      const listenTilt = p.phase === "listening" ? 2.5 + p.inputLevel * 2 : 0;
      const thinkTilt = p.phase === "thinking" ? Math.sin(t * 1.6) * 4 : 0;
      const speakPulse = p.phase === "speaking" ? p.mouthLevel * 4 : 0;

      if (now >= nextBlink && !blinkStarted && !["surprised", "afraid"].includes(p.emotion)) blinkStarted = now;
      let blink = 1;
      if (blinkStarted) {
        const elapsed = now - blinkStarted;
        blink = Math.max(0.06, Math.abs(elapsed - 65) / 65);
        if (elapsed > 130) {
          blinkStarted = 0;
          nextBlink = now + 2500 + Math.random() * 3000;
          blink = 1;
        }
      }

      refs.current.root?.setAttribute("transform", `translate(${sway.toFixed(2)} ${(breath - speakPulse).toFixed(2)})`);
      refs.current.body?.setAttribute("transform", `translate(0 ${rig.bodyY.toFixed(2)}) rotate(${rig.bodyRotate.toFixed(2)} 500 790) scale(1 ${rig.bodyScaleY.toFixed(3)})`);
      refs.current.head?.setAttribute("transform", `translate(${rig.headX.toFixed(2)} ${rig.headY.toFixed(2)}) rotate(${(rig.headRotate + listenTilt + thinkTilt).toFixed(2)} 500 480) scale(${(rig.headScaleX + rig.squash).toFixed(3)} ${(rig.headScaleY - rig.squash).toFixed(3)})`);
      refs.current.eyeL?.setAttribute("transform", `translate(0 ${rig.eyeY.toFixed(2)}) scale(${rig.eyeScaleX.toFixed(3)} ${(rig.eyeOpenL * blink).toFixed(3)})`);
      refs.current.eyeR?.setAttribute("transform", `translate(0 ${rig.eyeY.toFixed(2)}) scale(${rig.eyeScaleX.toFixed(3)} ${(rig.eyeOpenR * blink).toFixed(3)})`);
      refs.current.browL?.setAttribute("transform", `translate(0 ${rig.browY.toFixed(2)}) rotate(${rig.browTiltL.toFixed(2)} ${500 - profile.face.eyeSpacing} ${profile.face.eyeY - 39})`);
      refs.current.browR?.setAttribute("transform", `translate(0 ${rig.browY.toFixed(2)}) rotate(${rig.browTiltR.toFixed(2)} ${500 + profile.face.eyeSpacing} ${profile.face.eyeY - 39})`);
      const browsVisible = ["curious", "surprised", "sad", "lonely", "worried", "afraid", "angry", "confused"].includes(p.emotion);
      refs.current.browL?.setAttribute("opacity", (browsVisible ? profile.face.browOpacity : 0).toFixed(2));
      refs.current.browR?.setAttribute("opacity", (browsVisible ? profile.face.browOpacity : 0).toFixed(2));
      refs.current.cheekL?.setAttribute("opacity", rig.cheekOpacity.toFixed(3));
      refs.current.cheekR?.setAttribute("opacity", rig.cheekOpacity.toFixed(3));
      const waveMotion = ["joyful", "excited"].includes(p.emotion) ? Math.sin(t * 10.5) * 13 : p.phase === "listening" ? Math.sin(t * 3.2) * 2 : 0;
      refs.current.armL?.setAttribute("transform", `rotate(${(rig.armLiftL * 58 + rig.armRotateL).toFixed(2)} 414 756)`);
      refs.current.armR?.setAttribute("transform", `rotate(${(-rig.armLiftR * 58 + rig.armRotateR + waveMotion).toFixed(2)} 586 756)`);
      const moodDrop = ["sad", "lonely", "worried"].includes(p.emotion) ? 5 : 0;
      const ornamentMotion = ((p.phase === "speaking" ? p.mouthLevel * 3 : 0) + (p.emotion === "excited" ? Math.sin(t * 10) * 3 : moodDrop)) * profile.motion.ornament;
      refs.current.ornamentL?.setAttribute("transform", `rotate(${ornamentMotion.toFixed(2)} 380 235)`);
      refs.current.ornamentR?.setAttribute("transform", `rotate(${(-ornamentMotion).toFixed(2)} 620 235)`);
      const tailWag = (Math.sin(t * (p.emotion === "excited" ? 8 : 3.2)) * (p.emotion === "sad" ? 2 : 7) + (p.phase === "speaking" ? p.mouthLevel * 5 : 0)) * profile.motion.tail;
      refs.current.tail?.setAttribute("transform", `rotate(${tailWag.toFixed(2)} 650 850)`);
      const renderedRig = { ...rig, mouthOpen: Math.max(rig.mouthOpen, p.phase === "speaking" ? p.mouthLevel : 0) };
      refs.current.mouth?.setAttribute("d", mouthPath(renderedRig, profile));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [profile.id]);

  const outline = profile.outline;
  const faceInk = profile.signature === "screen" ? "#79FFF6" : outline;
  return (
    <svg className="pet-svg" viewBox="0 0 1000 1000" role="img" aria-label={`${profile.displayName} 캐릭터, ${emotion}`}>
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="43%" r="70%">
          <stop offset="0" stopColor={profile.highlight} />
          <stop offset="1" stopColor={profile.base} />
        </radialGradient>
        <linearGradient id={`${gradientId}shine`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="white" stopOpacity=".22" /><stop offset=".46" stopColor="white" stopOpacity="0" /><stop offset="1" stopColor={profile.outline} stopOpacity=".08" /></linearGradient>
      </defs>
      <g id="pet-root" ref={(node) => { refs.current.root = node; }} fill={`url(#${gradientId})`} stroke={outline} strokeWidth="27" strokeLinecap="round" strokeLinejoin="round">
        {profile.ornament === "fox" && <g id="tail" ref={(node) => { refs.current.tail = node; }}><path d="M635 804 C735 747 821 737 834 671 C888 758 867 875 765 899 C709 912 668 885 635 855Z" /></g>}
        <g id="body" ref={(node) => { refs.current.body = node; }}>
          <g id="arm-left" ref={(node) => { refs.current.armL = node; }}><path d="M424 770 C391 760 360 783 358 810 C356 834 377 847 398 833 C414 822 423 802 434 786Z" /></g>
          <g id="arm-right" ref={(node) => { refs.current.armR = node; }}><path d="M576 770 C609 760 640 783 642 810 C644 834 623 847 602 833 C586 822 577 802 566 786Z" /></g>
          <path id="torso" d="M415 724 C393 753 392 803 400 858 L404 889 C409 944 460 967 486 919 L514 919 C540 967 591 944 596 889 L600 858 C608 803 607 753 585 724Z" />
          <BodyDetails profile={profile} />
          <g id="leg-left" /><g id="leg-right" />
          <path d="M434 746 C470 731 530 731 566 746" fill="none" stroke="white" strokeWidth="10" opacity=".12" />
        </g>
        <g id="head" ref={(node) => { refs.current.head = node; }}>
          <Ornaments kind={profile.ornament} outline={outline} refs={refs} />
          <HeadShape kind={profile.ornament} />
          <SignatureDetails profile={profile} />
          <path d="M255 386 C306 275 403 236 500 236 C628 236 704 295 750 385" fill="none" stroke={`url(#${gradientId}shine)`} strokeWidth="24" opacity=".62" />
          <g id="face" ref={(node) => { refs.current.face = node; }} fill={faceInk} stroke="none">
            <g id="eye-left" ref={(node) => { refs.current.eyeL = node; }} style={{ transformOrigin: `${500 - profile.face.eyeSpacing}px ${profile.face.eyeY}px` }}>
              <ellipse cx={500 - profile.face.eyeSpacing} cy={profile.face.eyeY} rx={profile.face.eyeRx} ry={profile.face.eyeRy} transform={`rotate(${profile.face.eyeTiltL} ${500 - profile.face.eyeSpacing} ${profile.face.eyeY})`} />
              {profile.face.highlight && <circle cx={493 - profile.face.eyeSpacing} cy={profile.face.eyeY - 8} r="5" fill="white" opacity=".82" />}
            </g>
            <g id="eye-right" ref={(node) => { refs.current.eyeR = node; }} style={{ transformOrigin: `${500 + profile.face.eyeSpacing}px ${profile.face.eyeY}px` }}>
              <ellipse cx={500 + profile.face.eyeSpacing} cy={profile.face.eyeY} rx={profile.face.eyeRx} ry={profile.face.eyeRy} transform={`rotate(${profile.face.eyeTiltR} ${500 + profile.face.eyeSpacing} ${profile.face.eyeY})`} />
              {profile.face.highlight && <circle cx={493 + profile.face.eyeSpacing} cy={profile.face.eyeY - 8} r="5" fill="white" opacity=".82" />}
            </g>
            <path id="brow-left" ref={(node) => { refs.current.browL = node; }} d={`M${470 - profile.face.eyeSpacing} ${profile.face.eyeY - 40} Q${500 - profile.face.eyeSpacing} ${profile.face.eyeY - 54} ${530 - profile.face.eyeSpacing} ${profile.face.eyeY - 39}`} fill="none" stroke={faceInk} strokeWidth="12" strokeLinecap="round" opacity={profile.face.browOpacity} />
            <path id="brow-right" ref={(node) => { refs.current.browR = node; }} d={`M${470 + profile.face.eyeSpacing} ${profile.face.eyeY - 39} Q${500 + profile.face.eyeSpacing} ${profile.face.eyeY - 54} ${530 + profile.face.eyeSpacing} ${profile.face.eyeY - 40}`} fill="none" stroke={faceInk} strokeWidth="12" strokeLinecap="round" opacity={profile.face.browOpacity} />
            <ellipse id="cheek-left" ref={(node) => { refs.current.cheekL = node; }} cx={455 - profile.face.eyeSpacing} cy={profile.face.mouthY + 22} rx="34" ry="15" fill={profile.face.cheek} opacity="0" />
            <ellipse id="cheek-right" ref={(node) => { refs.current.cheekR = node; }} cx={545 + profile.face.eyeSpacing} cy={profile.face.mouthY + 22} rx="34" ry="15" fill={profile.face.cheek} opacity="0" />
            <path id="mouth" ref={(node) => { refs.current.mouth = node; }} d={mouthPath(BASE_RIG, profile)} fill={outline} />
          </g>
          <EmotionAccents emotion={emotion} outline={outline} cheek={profile.face.cheek} />
        </g>
      </g>
    </svg>
  );
}

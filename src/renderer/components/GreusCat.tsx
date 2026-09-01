import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import "./greeny-animal.css";

export const EMOTIONS = [
  "idle",
  "listening",
  "happy",
  "sleepy",
  "curious",
  "alert",
  "playful",
  "excited",
  "affectionate",
  "relaxed",
  "startled",
  "anxious",
  "annoyed",
  "angry",
  "sad",
  "scared",
  "laughing",
  "love",
  "wink",
  "proud",
  "smug",
  "thinking",
  "confused",
  "disappointed",
  "tired",
  "crying",
] as const;
export const COATS = ["greeny", "cheese", "calico", "black", "custom"] as const;
export const IDLE_ACTIONS = [
  "air-punch",
  "sleep",
  "stretch",
  "groom",
  "yawn",
  "knead",
  "butterfly",
] as const;

export type Emotion = (typeof EMOTIONS)[number];
export type CoatPreset = (typeof COATS)[number];
export type IdleAction = "none" | (typeof IDLE_ACTIONS)[number];
export type EasingPreset = "ease-in-out" | "snappy" | "bouncy" | "dreamy";
export type IdleAnchor = "bottom-center" | "center" | "top-center";
export type GreusCatHandle = { transitionTo: (emotion: Emotion) => void };

export const BLINK_DELAY_RANGE_MS = [3000, 6000] as const;
export const LISTENING_EAR_DELAY_RANGE_MS = [2000, 5000] as const;
export const MICROPHONE_EAR_SAMPLE_RANGE_MS = [1000, 3000] as const;
export const MICROPHONE_TRIGGER_THRESHOLD = .075;
export const BLINK_HOLD_MS = 230;
export const PETTING_HOVER_DELAY_MS = 360;

const IDLE_EAR_DELAY_RANGE_MS = [9000, 18000] as const;
const EAR_TWITCH_DURATION_MS = 780;
const PETTING_RELEASE_MS = 720;
const DEFAULT_IDLE_ACTION_DELAY_MS = 12000;
const IDLE_ACTION_DURATION_MS: Record<(typeof IDLE_ACTIONS)[number], number> = {
  "air-punch": 3800,
  sleep: 10000,
  stretch: 4600,
  groom: 5600,
  yawn: 4800,
  knead: 5800,
  butterfly: 6400,
};

const BLINKABLE_EMOTIONS = new Set<Emotion>([
  "idle",
  "listening",
  "happy",
  "curious",
  "alert",
  "startled",
  "thinking",
]);

function randomUnit() {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const sample = new Uint32Array(1);
    window.crypto.getRandomValues(sample);
    return sample[0] / 0x1_0000_0000;
  }
  return Math.random();
}

function randomBetween([minimum, maximum]: readonly [number, number]) {
  return minimum + (maximum - minimum) * randomUnit();
}

function shuffledIdleActions() {
  const result = [...IDLE_ACTIONS];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(randomUnit() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Shape = number[];
type FacePose = {
  leftEye: Shape;
  rightEye: Shape;
  leftEyeLine: Shape;
  rightEyeLine: Shape;
  leftBrow: Shape;
  rightBrow: Shape;
  mouthLine: Shape;
  mouthOuter: Shape;
  mouthInner: Shape;
};

const KAPPA = .5522848;
const ellipseShape = (cx: number, cy: number, rx: number, ry: number): Shape => [
  cx - rx, cy,
  cx - rx, cy - KAPPA * ry, cx - KAPPA * rx, cy - ry, cx, cy - ry,
  cx + KAPPA * rx, cy - ry, cx + rx, cy - KAPPA * ry, cx + rx, cy,
  cx + rx, cy + KAPPA * ry, cx + KAPPA * rx, cy + ry, cx, cy + ry,
  cx - KAPPA * rx, cy + ry, cx - rx, cy + KAPPA * ry, cx - rx, cy,
];

const crescentShape = (cx: number, cy: number, width: number, height: number, tilt = 0): Shape => {
  const leftX = cx - width / 2;
  const rightX = cx + width / 2;
  const leftY = cy + tilt / 2;
  const rightY = cy - tilt / 2;
  const middleY = (leftY + rightY) / 2;
  return [
    leftX, leftY,
    leftX + width * .16, leftY + tilt * -.08, cx - width * .16, middleY, cx, middleY,
    cx + width * .16, middleY, rightX - width * .16, rightY + tilt * .08, rightX, rightY,
    rightX, rightY + height * .58, cx + width * .22, cy + height, cx, cy + height,
    cx - width * .22, cy + height, leftX, leftY + height * .58, leftX, leftY,
  ];
};

const heartShape = (cx: number, cy: number, size: number): Shape => [
  cx, cy + size * .92,
  cx - size * .34, cy + size * .62, cx - size, cy + size * .22, cx - size, cy - size * .24,
  cx - size, cy - size * .76, cx - size * .36, cy - size, cx, cy - size * .43,
  cx + size * .36, cy - size, cx + size, cy - size * .76, cx + size, cy - size * .24,
  cx + size, cy + size * .22, cx + size * .34, cy + size * .62, cx, cy + size * .92,
];

const lineShape = (...values: number[]): Shape => values;
const EYE_LINE_HIDDEN_LEFT = lineShape(103, 127, 103, 127, 103, 127, 103, 127, 103, 127, 103, 127, 103, 127);
const EYE_LINE_HIDDEN_RIGHT = lineShape(137, 127, 137, 127, 137, 127, 137, 127, 137, 127, 137, 127, 137, 127);
const chevronLineShape = (cx: number, cy: number, direction: 1 | -1, scale = 1): Shape => [
  cx - direction * 7 * scale, cy - 5.5 * scale,
  cx - direction * 4.2 * scale, cy - 4.1 * scale, cx + direction * .8 * scale, cy - 1.2 * scale, cx + direction * 4 * scale, cy,
  cx + direction * .8 * scale, cy + 1.2 * scale, cx - direction * 4.2 * scale, cy + 4.1 * scale, cx - direction * 7 * scale, cy + 5.5 * scale,
];
const closedEyeLineShape = (cx: number, cy: number, width = 14, depth = 4.2): Shape => [
  cx - width / 2, cy,
  cx - width * .34, cy + depth * .72, cx - width * .17, cy + depth, cx, cy + depth,
  cx + width * .17, cy + depth, cx + width * .34, cy + depth * .72, cx + width / 2, cy,
];
const smugEyeLineShape = (cx: number, cy: number, tilt = 0): Shape => [
  cx - 7.5, cy + tilt / 2,
  cx - 5.2, cy + .7 + tilt * .28, cx - 2.4, cy + 1.7 + tilt * .12, cx, cy + 1.8,
  cx + 2.4, cy + 1.7 - tilt * .12, cx + 5.2, cy + .7 - tilt * .28, cx + 7.5, cy - tilt / 2,
];
const CAT_MOUTH = lineShape(111.5, 139, 114, 143.5, 117, 145, 120, 139, 123, 145, 126, 143.5, 128.5, 139);
const FROWN_MOUTH = lineShape(113, 147, 115, 143, 117, 139, 120, 139, 123, 139, 125, 143, 127, 147);
const STRAIGHT_MOUTH = lineShape(114, 143, 116, 143, 118, 143, 120, 143, 122, 143, 124, 143, 126, 143);
const CRYING_MOUTH = lineShape(112, 144, 114.5, 140, 117.5, 148, 120, 144, 122.5, 140, 125.5, 148, 128, 144);
const SMUG_MOUTH = lineShape(112, 142, 115, 145, 119, 146, 122, 143, 124, 141, 126.5, 141, 128, 140);
const MOUTH_LINE_HIDDEN = lineShape(120, 141, 120, 141, 120, 141, 120, 141, 120, 141, 120, 141, 120, 141);
// Dormant brows fold into the black eye fill, so no opacity swap is needed.
const BROW_HIDDEN_LEFT = lineShape(103, 127, 103, 127, 103, 127, 103, 127);
const BROW_HIDDEN_RIGHT = lineShape(137, 127, 137, 127, 137, 127, 137, 127);
const CLOSED_MOUTH = ellipseShape(120, 140.5, 0, 0);
const HAPPY_MOUTH_OUTER = lineShape(
  111.7, 139.4,
  113.8, 140.9, 117.1, 141.5, 120, 139.4,
  122.9, 141.5, 126.2, 140.9, 128.3, 139.4,
  128.4, 147.8, 125.1, 154.7, 120, 154.7,
  114.9, 154.7, 111.6, 147.8, 111.7, 140,
);
const HAPPY_MOUTH_INNER = ellipseShape(120, 151.2, 4.25, 2.55);

const cubicPath = (shape: Shape) => `M${shape[0]} ${shape[1]} C${shape.slice(2, 8).join(" ")} C${shape.slice(8, 14).join(" ")} C${shape.slice(14, 20).join(" ")} C${shape.slice(20, 26).join(" ")} Z`;
const openPath = (shape: Shape) => `M${shape[0]} ${shape[1]} C${shape.slice(2, 8).join(" ")} C${shape.slice(8, 14).join(" ")}`;
const browPath = (shape: Shape) => `M${shape[0]} ${shape[1]} C${shape.slice(2, 8).join(" ")}`;
const mixShape = (from: Shape, to: Shape, amount: number) => from.map((value, index) => value + (to[index] - value) * amount);

function facePoseFor(emotion: Emotion): FacePose {
  let leftEye = ellipseShape(103, 127, 4.6, 5.2);
  let rightEye = ellipseShape(137, 127, 4.6, 5.2);
  let leftEyeLine = EYE_LINE_HIDDEN_LEFT;
  let rightEyeLine = EYE_LINE_HIDDEN_RIGHT;
  let leftBrow = BROW_HIDDEN_LEFT;
  let rightBrow = BROW_HIDDEN_RIGHT;
  let mouthLine = CAT_MOUTH;
  let mouthOuter = CLOSED_MOUTH;
  let mouthInner = CLOSED_MOUTH;

  if (emotion === "playful") {
    rightEye = ellipseShape(137, 127, 0, 0);
    rightEyeLine = chevronLineShape(137, 127, -1, .82);
  } else if (["excited", "laughing"].includes(emotion)) {
    leftEye = ellipseShape(103, 127, 0, 0);
    rightEye = ellipseShape(137, 127, 0, 0);
    leftEyeLine = chevronLineShape(103, 127, 1);
    rightEyeLine = chevronLineShape(137, 127, -1);
  } else if (emotion === "love") {
    leftEye = heartShape(103, 126.5, 5.25);
    rightEye = heartShape(137, 126.5, 5.25);
  } else if (emotion === "affectionate") {
    leftEye = ellipseShape(103, 127, 0, 0);
    rightEye = ellipseShape(137, 127, 0, 0);
    leftEyeLine = closedEyeLineShape(103, 125.5, 14, 4.5);
    rightEyeLine = closedEyeLineShape(137, 125.5, 14, 4.5);
  } else if (emotion === "wink") {
    rightEye = ellipseShape(137, 127, 0, 0);
    rightEyeLine = chevronLineShape(137, 127, -1, .76);
  } else if (["sleepy", "relaxed"].includes(emotion)) {
    leftEye = ellipseShape(103, 127, 0, 0);
    rightEye = ellipseShape(137, 127, 0, 0);
    leftEyeLine = closedEyeLineShape(103, 125, 14, 3.8);
    rightEyeLine = closedEyeLineShape(137, 125, 14, 3.8);
  } else if (emotion === "proud") {
    leftEye = ellipseShape(103, 126.5, 5.5, 6.1);
    rightEye = ellipseShape(137, 126.5, 5.5, 6.1);
  } else if (emotion === "smug") {
    leftEye = ellipseShape(103, 127, 0, 0);
    rightEye = ellipseShape(137, 127, 0, 0);
    leftEyeLine = smugEyeLineShape(103, 123.7, -.8);
    rightEyeLine = smugEyeLineShape(137, 124.1, .8);
  } else if (emotion === "annoyed") {
    leftEye = ellipseShape(103, 128, 4.8, 5.4);
    rightEye = ellipseShape(137, 128, 4.8, 5.4);
  } else if (emotion === "tired") {
    leftEye = crescentShape(103, 125, 14, 4.8, .5);
    rightEye = crescentShape(137, 125, 14, 4.8, -.5);
  } else if (emotion === "sad") {
    leftEye = ellipseShape(103, 128, 5.4, 6.1);
    rightEye = ellipseShape(137, 128, 5.4, 6.1);
  } else if (emotion === "disappointed") {
    leftEye = crescentShape(103, 124, 14, 7.5, 2.3);
    rightEye = crescentShape(137, 124, 14, 7.5, -2.3);
  } else if (emotion === "crying") {
    leftEye = ellipseShape(103, 128, 5.8, 6.5);
    rightEye = ellipseShape(137, 128, 5.8, 6.5);
  }

  if (emotion === "angry") {
    leftEye = ellipseShape(103, 131, 4, 4.8);
    rightEye = ellipseShape(137, 131, 4, 4.8);
    leftBrow = lineShape(94, 122, 98, 123, 103, 126, 107, 127);
    rightBrow = lineShape(133, 127, 137, 126, 142, 123, 146, 122);
    mouthLine = FROWN_MOUTH;
  } else if (emotion === "annoyed") {
    leftBrow = lineShape(96, 119.5, 100, 119.5, 105, 119.5, 109, 119.5);
    rightBrow = lineShape(131, 119.5, 135, 119.5, 140, 119.5, 144, 119.5);
    mouthLine = STRAIGHT_MOUTH;
  } else if (["sad", "scared", "crying"].includes(emotion)) {
    leftBrow = lineShape(96, 121, 100, 120, 105, 117, 109, 115.5);
    rightBrow = lineShape(131, 115.5, 135, 117, 140, 120, 144, 121);
  } else if (["confused", "anxious"].includes(emotion)) {
    leftBrow = lineShape(96, 122, 100, 121, 103, 120, 106, 119);
    rightBrow = lineShape(134, 120, 138, 120, 141, 122, 144, 123);
  }

  if (["happy", "playful", "excited", "love", "laughing"].includes(emotion)) {
    mouthOuter = HAPPY_MOUTH_OUTER;
    mouthInner = HAPPY_MOUTH_INNER;
  } else if (emotion === "sleepy") {
    mouthLine = MOUTH_LINE_HIDDEN;
    mouthOuter = ellipseShape(120, 144, 4, 5);
    mouthInner = ellipseShape(120, 146, 2.2, 2.6);
  } else if (emotion === "startled") {
    mouthLine = MOUTH_LINE_HIDDEN;
    mouthOuter = ellipseShape(120, 144, 5.1, 6.2);
    mouthInner = ellipseShape(120, 145.5, 2.8, 3.5);
  } else if (emotion === "scared") {
    mouthLine = MOUTH_LINE_HIDDEN;
    mouthOuter = ellipseShape(120, 147, 10, 5.5);
    mouthInner = ellipseShape(120, 148.5, 7, 3.4);
  } else if (emotion === "tired") {
    mouthLine = MOUTH_LINE_HIDDEN;
    mouthOuter = ellipseShape(120, 145, 8, 3.5);
    mouthInner = ellipseShape(120, 146, 4.5, 1.8);
  } else if (emotion === "crying") {
    mouthLine = CRYING_MOUTH;
  } else if (emotion === "sad") {
    mouthLine = MOUTH_LINE_HIDDEN;
    mouthOuter = ellipseShape(120, 145, 4.2, 2.8);
    mouthInner = ellipseShape(120, 145.7, 2.4, 1.2);
  } else if (emotion === "smug") {
    mouthLine = SMUG_MOUTH;
  } else if (["confused", "disappointed", "angry", "anxious", "thinking"].includes(emotion)) {
    mouthLine = FROWN_MOUTH;
  }

  return { leftEye, rightEye, leftEyeLine, rightEyeLine, leftBrow, rightBrow, mouthLine, mouthOuter, mouthInner };
}

function stagedFacePose(
  emotion: Emotion,
  activeIdleAction: IdleAction,
  petting: boolean,
  isSpeaking: boolean,
): FacePose {
  let pose = facePoseFor(emotion);

  if (petting) {
    const affectionatePose = facePoseFor("affectionate");
    if (emotion === "love" || emotion === "proud") {
      pose = {
        ...affectionatePose,
        leftEye: pose.leftEye,
        rightEye: pose.rightEye,
        leftEyeLine: pose.leftEyeLine,
        rightEyeLine: pose.rightEyeLine,
        leftBrow: pose.leftBrow,
        rightBrow: pose.rightBrow,
      };
    } else {
      pose = affectionatePose;
    }
  } else if (activeIdleAction === "stretch" || activeIdleAction === "groom") {
    pose = facePoseFor("affectionate");
  } else if (activeIdleAction === "sleep") {
    pose = {
      ...facePoseFor("relaxed"),
      mouthLine: MOUTH_LINE_HIDDEN,
      mouthOuter: ellipseShape(120, 144, 3.7, 4.8),
      mouthInner: ellipseShape(120, 146, 1.9, 2.4),
    };
  } else if (activeIdleAction === "yawn") {
    pose = {
      ...facePoseFor("relaxed"),
      mouthLine: MOUTH_LINE_HIDDEN,
      mouthOuter: ellipseShape(120, 145, 7.2, 8.5),
      mouthInner: ellipseShape(120, 149, 4.3, 2.7),
    };
  }

  if (isSpeaking && activeIdleAction !== "yawn") {
    const speakingFace = facePoseFor("happy");
    pose = {
      ...pose,
      mouthLine: speakingFace.mouthLine,
      mouthOuter: speakingFace.mouthOuter,
      mouthInner: speakingFace.mouthInner,
    };
  }

  return pose;
}

type CatPalette = {
  base: string;
  shade: string;
  soft: string;
  hand: string;
  ear: string;
  face: string;
  accent: string;
  patchDark: string;
  patchOrange: string;
};

type GreusCatProps = {
  emotion?: Emotion;
  coat?: CoatPreset;
  customColor?: string;
  bodyRatio?: number;
  isSpeaking?: boolean;
  speechLevel?: number;
  microphoneActive?: boolean;
  microphoneLevel?: number;
  size?: number;
  className?: string;
  label?: string;
  easing?: EasingPreset;
  durationMs?: number;
  idleAnchor?: IdleAnchor;
  idleAction?: IdleAction;
  enableIdleActions?: boolean;
  idleActionDelayMs?: number;
  forceBlink?: boolean;
  onEmotionChange?: (emotion: Emotion) => void;
  onEmotionChangeComplete?: (emotion: Emotion) => void;
  onIdleActionChange?: (action: IdleAction) => void;
};

export const CAT_PALETTES: Record<Exclude<CoatPreset, "custom">, CatPalette> = {
  greeny: { base: "#a8ff2f", shade: "#93e91f", soft: "#ceff78", hand: "#d8ff86", ear: "#ff5e70", face: "#17181b", accent: "#ff8f79", patchDark: "#252620", patchOrange: "#dc8b3e" },
  cheese: { base: "#f4c66a", shade: "#d89732", soft: "#ffe2a5", hand: "#ffe2a5", ear: "#e98e91", face: "#2a2118", accent: "#493421", patchDark: "#5b3a20", patchOrange: "#d98d37" },
  calico: { base: "#fbf4e7", shade: "#d8ccba", soft: "#ffffff", hand: "#d8ccba", ear: "#e89a9e", face: "#29231f", accent: "#6b5547", patchDark: "#2c2925", patchOrange: "#d9893f" },
  black: { base: "#292a25", shade: "#10110e", soft: "#3d3f37", hand: "#3d3f37", ear: "#c98993", face: "#f4d467", accent: "#9b998c", patchDark: "#11120f", patchOrange: "#b18455" },
};

const EASING: Record<EasingPreset, string> = {
  "ease-in-out": "cubic-bezier(.45, 0, .2, 1)",
  snappy: "cubic-bezier(.2, .8, .2, 1)",
  bouncy: "cubic-bezier(.2, 1.22, .35, 1)",
  dreamy: "cubic-bezier(.37, 0, .63, 1)",
};

const EASING_BEZIER: Record<EasingPreset, readonly [number, number, number, number]> = {
  "ease-in-out": [.45, 0, .2, 1],
  snappy: [.2, .8, .2, 1],
  bouncy: [.2, 1.22, .35, 1],
  dreamy: [.37, 0, .63, 1],
};

function cubicBezierEase([x1, y1, x2, y2]: readonly [number, number, number, number], x: number) {
  const sample = (a1: number, a2: number, t: number) => {
    const inverse = 1 - t;
    return 3 * inverse * inverse * t * a1 + 3 * inverse * t * t * a2 + t * t * t;
  };
  let lower = 0;
  let upper = 1;
  let t = x;
  for (let index = 0; index < 12; index += 1) {
    const estimate = sample(x1, x2, t);
    if (Math.abs(estimate - x) < .0001) break;
    if (estimate < x) lower = t;
    else upper = t;
    t = (lower + upper) / 2;
  }
  return sample(y1, y2, t);
}

type EyeFamily = "round" | "line" | "heart" | "crescent";

function eyeFamily(emotion: Emotion): EyeFamily {
  if (emotion === "love") return "heart";
  if (["playful", "excited", "laughing", "wink", "sleepy", "relaxed", "affectionate", "smug"].includes(emotion)) return "line";
  if (["tired", "disappointed"].includes(emotion)) return "crescent";
  return "round";
}

function stagedEyeFamily(emotion: Emotion, activeIdleAction: IdleAction, petting: boolean): EyeFamily {
  if (petting && emotion !== "love" && emotion !== "proud") return "line";
  if (["sleep", "stretch", "groom", "yawn"].includes(activeIdleAction)) return "line";
  return eyeFamily(emotion);
}

const hasVisibleEyeLine = (shape: Shape) => shape.some((value, index) => Math.abs(value - shape[index % 2]) > .01);

function stagedEyeSignature(emotion: Emotion, activeIdleAction: IdleAction, petting: boolean) {
  const pose = stagedFacePose(emotion, activeIdleAction, petting, false);
  return `${stagedEyeFamily(emotion, activeIdleAction, petting)}:${hasVisibleEyeLine(pose.leftEyeLine) ? 1 : 0}:${hasVisibleEyeLine(pose.rightEyeLine) ? 1 : 0}`;
}

const FACE_BRIDGE_RELEASE_RATIO = .72;

const ANCHOR: Record<IdleAnchor, string> = {
  "bottom-center": "120px 211px",
  center: "120px 125px",
  "top-center": "120px 42px",
};

const BODY = "M120 62 C82 62 57 80 52 119 C47 158 59 190 84 203 C95 209 108 210 120 210 C132 210 145 209 156 203 C181 190 193 158 188 119 C183 80 158 62 120 62 Z";
const clampChannel = (value: number) => Math.max(0, Math.min(255, value));

function adjustHex(hex: string, amount: number) {
  const clean = hex.replace("#", "");
  const normalized = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return hex;
  const value = Number.parseInt(normalized, 16);
  const channels = [
    clampChannel((value >> 16) + amount),
    clampChannel(((value >> 8) & 255) + amount),
    clampChannel((value & 255) + amount),
  ];
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function readableFace(hex: string) {
  const clean = hex.replace("#", "");
  const normalized = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  const value = Number.parseInt(normalized, 16);
  const luminance = .299 * (value >> 16) + .587 * ((value >> 8) & 255) + .114 * (value & 255);
  return luminance < 95 ? "#f4d467" : "#17181b";
}

function customPalette(color: string): CatPalette {
  return {
    base: color,
    shade: adjustHex(color, -34),
    soft: adjustHex(color, 54),
    hand: adjustHex(color, 54),
    ear: "#e89199",
    face: readableFace(color),
    accent: adjustHex(color, -52),
    patchDark: adjustHex(color, -74),
    patchOrange: "#d9893f",
  };
}

export const GreusCat = forwardRef<GreusCatHandle, GreusCatProps>(
  function GreusCat(
    {
      emotion = "idle",
      coat = "greeny",
      customColor = "#8fd6ff",
      bodyRatio = .86,
      isSpeaking = false,
      speechLevel = .72,
      microphoneActive = false,
      microphoneLevel = 0,
      size = 360,
      className = "",
      label,
      easing = "ease-in-out",
      durationMs = 780,
      idleAnchor = "bottom-center",
      idleAction,
      enableIdleActions = true,
      idleActionDelayMs = DEFAULT_IDLE_ACTION_DELAY_MS,
      forceBlink,
      onEmotionChange,
      onEmotionChangeComplete,
      onIdleActionChange,
    },
    ref,
  ) {
    const [visualEmotion, setVisualEmotion] = useState<Emotion>(emotion);
    const [blinking, setBlinking] = useState(false);
    const [tailSlap, setTailSlap] = useState(false);
    const [earTwitch, setEarTwitch] = useState<"none" | "left" | "right" | "both">("none");
    const [petting, setPetting] = useState(false);
    const [pettingTransition, setPettingTransition] = useState(false);
    const [faceBridging, setFaceBridging] = useState(false);
    const [autoIdleAction, setAutoIdleAction] = useState<IdleAction>("none");
    const [nextBlinkDelayMs, setNextBlinkDelayMs] = useState(0);
    const [lastBlinkDurationMs, setLastBlinkDurationMs] = useState(0);
    const [nextEarDelayMs, setNextEarDelayMs] = useState(0);
    const currentState = useRef<Emotion>(emotion);
    const currentTarget = useRef<Emotion>(emotion);
    const transitionToken = useRef(0);
    const transitionCompleteTimer = useRef(0);
    const bridgeReleaseTimer = useRef(0);
    const bridgeToken = useRef(0);
    const pettingIntentTimer = useRef(0);
    const pettingReleaseTimer = useRef(0);
    const microphoneEarTimer = useRef(0);
    const microphoneEarResetTimer = useRef(0);
    const microphoneLevelRef = useRef(microphoneLevel);
    const microphonePeakRef = useRef(microphoneLevel);
    const autoIdleActionRef = useRef<IdleAction>("none");
    const idleActionBagRef = useRef<(typeof IDLE_ACTIONS)[number][]>([]);
    const initialFace = useRef(facePoseFor(emotion));
    const liveFace = useRef<FacePose>(facePoseFor(emotion));
    const currentEyeSignature = useRef(stagedEyeSignature(emotion, "none", false));
    const faceFrame = useRef(0);
    const idleAmplitudeFrame = useRef(0);
    const idleAmplitudeReturnTimer = useRef(0);
    const idleAmplitude = useRef(1);
    const hasMounted = useRef(false);
    const svgRef = useRef<SVGSVGElement>(null);
    const leftEyePathRef = useRef<SVGPathElement>(null);
    const rightEyePathRef = useRef<SVGPathElement>(null);
    const leftEyeLinePathRef = useRef<SVGPathElement>(null);
    const rightEyeLinePathRef = useRef<SVGPathElement>(null);
    const leftBrowPathRef = useRef<SVGPathElement>(null);
    const rightBrowPathRef = useRef<SVGPathElement>(null);
    const mouthLinePathRef = useRef<SVGPathElement>(null);
    const mouthOuterPathRef = useRef<SVGPathElement>(null);
    const mouthInnerPathRef = useRef<SVGPathElement>(null);
    const instanceId = useId().replace(/:/g, "");
    const clipId = `cat-body-${instanceId}`;
    const baseGradientId = `cat-base-gradient-${instanceId}`;
    const handGradientId = `cat-hand-gradient-${instanceId}`;
    const shadeGradientId = `cat-shade-gradient-${instanceId}`;
    const heartGradientId = `cat-heart-gradient-${instanceId}`;
    const palette = coat === "custom" ? customPalette(customColor) : CAT_PALETTES[coat];
    const ratio = Math.max(.78, Math.min(1.08, bodyRatio));
    const level = Math.max(0, Math.min(1, speechLevel));
    const micLevel = Math.max(0, Math.min(1, microphoneLevel));
    const activeIdleAction = idleAction ?? autoIdleAction;
    const canBlink = BLINKABLE_EMOTIONS.has(visualEmotion) && activeIdleAction === "none" && !petting;
    const renderedBlink = canBlink && (forceBlink ?? blinking);
    const handFill = coat === "calico" ? "var(--cat-hand)" : `url(#${handGradientId})`;

    const setAutomaticIdleAction = (next: IdleAction) => {
      autoIdleActionRef.current = next;
      setAutoIdleAction(next);
      onIdleActionChange?.(next);
    };

    const transitionTo = (next: Emotion) => {
      if (autoIdleActionRef.current !== "none") setAutomaticIdleAction("none");
      const token = ++transitionToken.current;
      window.clearTimeout(transitionCompleteTimer.current);
      currentTarget.current = next;
      setVisualEmotion(next);
      onEmotionChange?.(next);
      if (durationMs <= 0 || prefersReducedMotion()) {
        currentState.current = next;
        onEmotionChangeComplete?.(next);
      } else {
        transitionCompleteTimer.current = window.setTimeout(() => {
          if (transitionToken.current !== token) return;
          currentState.current = next;
          onEmotionChangeComplete?.(next);
        }, durationMs);
      }
    };

    useImperativeHandle(ref, () => ({ transitionTo }), [durationMs, onEmotionChange, onEmotionChangeComplete, onIdleActionChange]);

    useEffect(() => () => {
      window.clearTimeout(transitionCompleteTimer.current);
      window.clearTimeout(bridgeReleaseTimer.current);
      window.clearTimeout(pettingIntentTimer.current);
      window.clearTimeout(pettingReleaseTimer.current);
      window.clearTimeout(microphoneEarTimer.current);
      window.clearTimeout(microphoneEarResetTimer.current);
    }, []);

    useEffect(() => {
      if (emotion !== currentTarget.current) transitionTo(emotion);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [emotion]);

    useEffect(() => {
      const nextSignature = stagedEyeSignature(visualEmotion, activeIdleAction, petting);
      const shouldBridge = durationMs > 0 && !prefersReducedMotion() && currentEyeSignature.current !== nextSignature;
      currentEyeSignature.current = nextSignature;
      if (!shouldBridge) return;

      const token = ++bridgeToken.current;
      window.clearTimeout(bridgeReleaseTimer.current);
      setFaceBridging(true);
      bridgeReleaseTimer.current = window.setTimeout(() => {
        if (bridgeToken.current === token) setFaceBridging(false);
      }, durationMs * FACE_BRIDGE_RELEASE_RATIO);
    }, [visualEmotion, activeIdleAction, petting, durationMs]);

    useEffect(() => {
      const svg = svgRef.current;
      if (!svg) return;

      const applyAmplitude = (value: number) => {
        idleAmplitude.current = value;
        svg.style.setProperty("--cat-breathe-scale", String(1 + .02 * value));
        svg.style.setProperty("--cat-breathe-y", `${-value}px`);
      };

      if (!hasMounted.current || durationMs <= 0 || prefersReducedMotion()) {
        hasMounted.current = true;
        applyAmplitude(1);
        return;
      }

      window.cancelAnimationFrame(idleAmplitudeFrame.current);
      window.clearTimeout(idleAmplitudeReturnTimer.current);

      const tweenAmplitude = (target: number, tweenDuration: number) => {
        const from = idleAmplitude.current;
        const startedAt = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - startedAt) / Math.max(1, tweenDuration));
          const eased = .5 - Math.cos(Math.PI * progress) / 2;
          applyAmplitude(from + (target - from) * eased);
          if (progress < 1) idleAmplitudeFrame.current = window.requestAnimationFrame(tick);
        };
        idleAmplitudeFrame.current = window.requestAnimationFrame(tick);
      };

      const blendDuration = Math.max(80, durationMs * .4);
      tweenAmplitude(.1, blendDuration);
      idleAmplitudeReturnTimer.current = window.setTimeout(() => tweenAmplitude(1, blendDuration), durationMs);

      return () => {
        window.cancelAnimationFrame(idleAmplitudeFrame.current);
        window.clearTimeout(idleAmplitudeReturnTimer.current);
      };
      // The persistent idle phase stays alive; only an actual state transition blends its amplitude.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visualEmotion]);

    useEffect(() => {
      const target = stagedFacePose(visualEmotion, activeIdleAction, petting, isSpeaking);
      const start = liveFace.current;
      const startedAt = performance.now();
      const faceDuration = pettingTransition ? Math.max(durationMs, 820) : durationMs;
      window.cancelAnimationFrame(faceFrame.current);

      const applyFace = (pose: FacePose) => {
        leftEyePathRef.current?.setAttribute("d", cubicPath(pose.leftEye));
        rightEyePathRef.current?.setAttribute("d", cubicPath(pose.rightEye));
        leftEyeLinePathRef.current?.setAttribute("d", openPath(pose.leftEyeLine));
        rightEyeLinePathRef.current?.setAttribute("d", openPath(pose.rightEyeLine));
        leftBrowPathRef.current?.setAttribute("d", browPath(pose.leftBrow));
        rightBrowPathRef.current?.setAttribute("d", browPath(pose.rightBrow));
        mouthLinePathRef.current?.setAttribute("d", openPath(pose.mouthLine));
        mouthOuterPathRef.current?.setAttribute("d", cubicPath(pose.mouthOuter));
        mouthInnerPathRef.current?.setAttribute("d", cubicPath(pose.mouthInner));
      };

      if (faceDuration <= 0 || prefersReducedMotion()) {
        liveFace.current = target;
        applyFace(target);
        return;
      }

      const animateFace = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / faceDuration);
        const eased = Math.max(0, Math.min(1, cubicBezierEase(EASING_BEZIER[easing], progress)));
        const next: FacePose = {
          leftEye: mixShape(start.leftEye, target.leftEye, eased),
          rightEye: mixShape(start.rightEye, target.rightEye, eased),
          leftEyeLine: mixShape(start.leftEyeLine, target.leftEyeLine, eased),
          rightEyeLine: mixShape(start.rightEyeLine, target.rightEyeLine, eased),
          leftBrow: mixShape(start.leftBrow, target.leftBrow, eased),
          rightBrow: mixShape(start.rightBrow, target.rightBrow, eased),
          mouthLine: mixShape(start.mouthLine, target.mouthLine, eased),
          mouthOuter: mixShape(start.mouthOuter, target.mouthOuter, eased),
          mouthInner: mixShape(start.mouthInner, target.mouthInner, eased),
        };
        liveFace.current = next;
        applyFace(next);
        if (progress < 1) faceFrame.current = window.requestAnimationFrame(animateFace);
      };

      faceFrame.current = window.requestAnimationFrame(animateFace);
      return () => window.cancelAnimationFrame(faceFrame.current);
    }, [visualEmotion, activeIdleAction, petting, pettingTransition, durationMs, easing, isSpeaking]);

    useEffect(() => {
      if (
        !BLINKABLE_EMOTIONS.has(visualEmotion)
        || visualEmotion === "sleepy"
        || activeIdleAction === "sleep"
        || activeIdleAction === "yawn"
        || petting
        || prefersReducedMotion()
      ) {
        setBlinking(false);
        setNextBlinkDelayMs(0);
        return;
      }
      let timer = 0;
      let closeTimer = 0;
      let gapTimer = 0;

      const schedule = () => {
        const delay = randomBetween(BLINK_DELAY_RANGE_MS);
        setNextBlinkDelayMs(Math.round(delay));
        timer = window.setTimeout(() => blinkOnce(randomUnit() < .16 ? 2 : 1), delay);
      };

      const blinkOnce = (remaining: number) => {
          const blinkStartedAt = performance.now();
          setBlinking(true);
          closeTimer = window.setTimeout(() => {
            setLastBlinkDurationMs(Math.round(performance.now() - blinkStartedAt));
            setBlinking(false);
            if (remaining > 1) {
              gapTimer = window.setTimeout(() => blinkOnce(remaining - 1), 145);
            } else {
              schedule();
            }
          }, BLINK_HOLD_MS);
      };

      schedule();
      return () => {
        window.clearTimeout(timer);
        window.clearTimeout(closeTimer);
        window.clearTimeout(gapTimer);
      };
    }, [visualEmotion, activeIdleAction, petting]);

    useEffect(() => {
      if (visualEmotion !== "angry") {
        setTailSlap(false);
        return;
      }
      let strikeTimer = 0;
      let resetTimer = 0;
      const scheduleStrike = () => {
        strikeTimer = window.setTimeout(() => {
          setTailSlap(true);
          resetTimer = window.setTimeout(() => {
            setTailSlap(false);
            scheduleStrike();
          }, 1120);
        }, randomBetween([2800, 6000]));
      };
      scheduleStrike();
      return () => {
        window.clearTimeout(strikeTimer);
        window.clearTimeout(resetTimer);
      };
    }, [visualEmotion]);

    useEffect(() => {
      if (
        !["idle", "listening"].includes(visualEmotion)
        || activeIdleAction !== "none"
        || petting
        || microphoneActive
        || prefersReducedMotion()
      ) {
        setEarTwitch("none");
        setNextEarDelayMs(0);
        return;
      }
      let twitchTimer = 0;
      let resetTimer = 0;
      const scheduleTwitch = () => {
        const range = visualEmotion === "listening" ? LISTENING_EAR_DELAY_RANGE_MS : IDLE_EAR_DELAY_RANGE_MS;
        const delay = randomBetween(range);
        setNextEarDelayMs(Math.round(delay));
        twitchTimer = window.setTimeout(() => {
          const options = ["left", "right", "both"] as const;
          setEarTwitch(options[Math.floor(randomUnit() * options.length)]);
          resetTimer = window.setTimeout(() => {
            setEarTwitch("none");
            scheduleTwitch();
          }, EAR_TWITCH_DURATION_MS);
        }, delay);
      };
      scheduleTwitch();
      return () => {
        window.clearTimeout(twitchTimer);
        window.clearTimeout(resetTimer);
      };
    }, [visualEmotion, activeIdleAction, petting, microphoneActive]);

    useEffect(() => {
      microphoneLevelRef.current = micLevel;
      if (microphoneActive) microphonePeakRef.current = Math.max(microphonePeakRef.current, micLevel);
    }, [micLevel, microphoneActive]);

    useEffect(() => {
      window.clearTimeout(microphoneEarTimer.current);
      window.clearTimeout(microphoneEarResetTimer.current);

      if (
        !microphoneActive
        || activeIdleAction !== "none"
        || petting
        || prefersReducedMotion()
      ) {
        setNextEarDelayMs(0);
        microphonePeakRef.current = 0;
        if (microphoneActive) setEarTwitch("none");
        return;
      }

      let disposed = false;
      microphonePeakRef.current = microphoneLevelRef.current;
      const scheduleSample = () => {
        const delay = randomBetween(MICROPHONE_EAR_SAMPLE_RANGE_MS);
        setNextEarDelayMs(Math.round(delay));
        microphoneEarTimer.current = window.setTimeout(() => {
          if (disposed) return;
          const peak = microphonePeakRef.current;
          microphonePeakRef.current = microphoneLevelRef.current;
          if (peak >= MICROPHONE_TRIGGER_THRESHOLD) {
            const options = ["left", "right", "both"] as const;
            setEarTwitch(options[Math.floor(randomUnit() * options.length)]);
            window.clearTimeout(microphoneEarResetTimer.current);
            microphoneEarResetTimer.current = window.setTimeout(
              () => setEarTwitch("none"),
              EAR_TWITCH_DURATION_MS,
            );
          }
          scheduleSample();
        }, delay);
      };

      scheduleSample();
      return () => {
        disposed = true;
        window.clearTimeout(microphoneEarTimer.current);
        window.clearTimeout(microphoneEarResetTimer.current);
      };
    }, [microphoneActive, activeIdleAction, petting]);

    useEffect(() => {
      const shouldRun = enableIdleActions
        && idleAction === undefined
        && visualEmotion === "idle"
        && !isSpeaking
        && !petting
        && !prefersReducedMotion();

      if (!shouldRun) {
        if (autoIdleActionRef.current !== "none") setAutomaticIdleAction("none");
        return;
      }

      let scheduleTimer = 0;
      let actionTimer = 0;
      let disposed = false;

      const clearTimers = () => {
        window.clearTimeout(scheduleTimer);
        window.clearTimeout(actionTimer);
      };

      const scheduleAction = (delay: number) => {
        window.clearTimeout(scheduleTimer);
        scheduleTimer = window.setTimeout(startAction, Math.max(500, delay));
      };

      const startAction = () => {
        if (disposed) return;
        if (idleActionBagRef.current.length === 0) idleActionBagRef.current = shuffledIdleActions();
        const next = idleActionBagRef.current.shift();
        if (!next) return;
        setAutomaticIdleAction(next);
        actionTimer = window.setTimeout(() => {
          setAutomaticIdleAction("none");
          scheduleAction(randomBetween([7000, 14000]));
        }, IDLE_ACTION_DURATION_MS[next]);
      };

      const handleActivity = () => {
        window.clearTimeout(scheduleTimer);
        if (autoIdleActionRef.current === "none") scheduleAction(idleActionDelayMs);
      };

      const passive = { passive: true } as const;
      window.addEventListener("pointermove", handleActivity, passive);
      window.addEventListener("pointerdown", handleActivity, passive);
      window.addEventListener("keydown", handleActivity);
      window.addEventListener("wheel", handleActivity, passive);
      window.addEventListener("touchstart", handleActivity, passive);
      scheduleAction(idleActionDelayMs);

      return () => {
        disposed = true;
        clearTimers();
        window.removeEventListener("pointermove", handleActivity);
        window.removeEventListener("pointerdown", handleActivity);
        window.removeEventListener("keydown", handleActivity);
        window.removeEventListener("wheel", handleActivity);
        window.removeEventListener("touchstart", handleActivity);
      };
      // The callback is deliberately sampled with the scheduler lifecycle.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enableIdleActions, idleAction, visualEmotion, isSpeaking, petting, idleActionDelayMs]);

    const activatePetting = () => {
      window.clearTimeout(pettingIntentTimer.current);
      window.clearTimeout(pettingReleaseTimer.current);
      if (autoIdleActionRef.current !== "none") setAutomaticIdleAction("none");
      setPettingTransition(true);
      setPetting(true);
    };

    const beginPetting = (withHoverIntent = true) => {
      window.clearTimeout(pettingReleaseTimer.current);
      if (petting) return;
      window.clearTimeout(pettingIntentTimer.current);
      if (!withHoverIntent || prefersReducedMotion()) {
        activatePetting();
        return;
      }
      pettingIntentTimer.current = window.setTimeout(activatePetting, PETTING_HOVER_DELAY_MS);
    };

    const endPetting = () => {
      window.clearTimeout(pettingIntentTimer.current);
      setPetting(false);
      window.clearTimeout(pettingReleaseTimer.current);
      pettingReleaseTimer.current = window.setTimeout(() => setPettingTransition(false), PETTING_RELEASE_MS);
    };

    const style = {
      "--cat-duration": `${durationMs}ms`,
      "--cat-ease": EASING[easing],
      "--cat-anchor": ANCHOR[idleAnchor],
      "--cat-breathe-scale": 1.02,
      "--cat-breathe-y": "-1px",
      "--cat-body-ratio": ratio,
      "--cat-tail-y": `${(1 - ratio) * 42}px`,
      "--cat-mouth-mid": .5 + level * .45,
      "--cat-mouth-open": .64 + level * .62,
      "--cat-mouth-mid-y": `${-16 + level * 10}px`,
      "--cat-mouth-open-y": `${-16 + level * 16}px`,
      "--cat-base": palette.base,
      "--cat-shade": palette.shade,
      "--cat-soft": palette.soft,
      "--cat-hand": palette.hand,
      "--cat-ear": palette.ear,
      "--cat-face": palette.face,
      "--cat-accent": palette.accent,
      "--cat-patch-dark": palette.patchDark,
      "--cat-patch-orange": palette.patchOrange,
    } as CSSProperties;

    return (
      <svg
        ref={svgRef}
        className={`greus-cat ${className}`}
        style={style}
        viewBox="0 0 240 240"
        width={size}
        height={size}
        role="img"
        aria-label={label ?? `Greus cat — ${coat} — ${visualEmotion}`}
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        data-emotion={visualEmotion}
        data-coat={coat}
        data-speaking={isSpeaking ? "true" : "false"}
        data-blinking={renderedBlink ? "true" : "false"}
        data-face-bridge={faceBridging ? "true" : "false"}
        data-eye-family={stagedEyeFamily(visualEmotion, activeIdleAction, petting)}
        data-left-eye-line={hasVisibleEyeLine(stagedFacePose(visualEmotion, activeIdleAction, petting, false).leftEyeLine) ? "true" : "false"}
        data-right-eye-line={hasVisibleEyeLine(stagedFacePose(visualEmotion, activeIdleAction, petting, false).rightEyeLine) ? "true" : "false"}
        data-blink-hold-ms={BLINK_HOLD_MS}
        data-last-blink-duration-ms={lastBlinkDurationMs || undefined}
        data-next-blink-ms={nextBlinkDelayMs || undefined}
        data-tail-slap={tailSlap ? "true" : "false"}
        data-ear-twitch={earTwitch}
        data-next-ear-ms={nextEarDelayMs || undefined}
        data-petting={petting ? "true" : "false"}
        data-petting-transition={pettingTransition ? "true" : "false"}
        data-microphone-active={microphoneActive ? "true" : "false"}
        data-microphone-level={micLevel.toFixed(2)}
        data-microphone-threshold={MICROPHONE_TRIGGER_THRESHOLD.toFixed(2)}
        data-idle-action={activeIdleAction}
        data-body-ratio={ratio.toFixed(2)}
        data-speech-level={level.toFixed(2)}
      >
        <defs>
          <clipPath id={clipId}><path d={BODY} /></clipPath>
          <linearGradient id={baseGradientId} x1="120" y1="46" x2="120" y2="211" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--cat-base)" />
            <stop offset=".58" stopColor="var(--cat-base)" />
            <stop offset="1" stopColor="var(--cat-soft)" />
          </linearGradient>
          <radialGradient id={handGradientId} cx="38%" cy="30%" r="75%">
            <stop offset="0" stopColor="var(--cat-soft)" />
            <stop offset="1" stopColor="var(--cat-hand)" />
          </radialGradient>
          <linearGradient id={shadeGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--cat-base)" />
            <stop offset="1" stopColor="var(--cat-shade)" />
          </linearGradient>
          <linearGradient id={heartGradientId} x1="184" y1="66" x2="218" y2="112" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff8fb3" />
            <stop offset=".48" stopColor="#ff5f91" />
            <stop offset="1" stopColor="#ff3e72" />
          </linearGradient>
        </defs>
        <ellipse className="ground-shadow" cx="120" cy="222" rx="48" ry="6" fill="#000" opacity=".16" />

        <g id="rig-root" data-rig-part="root" className="rig-root">
          <g id="rig-tail" data-rig-part="tail" className="rig-part rig-tail">
            <g className="tail-motion">
              <path className="tail-base" d="M171 172 C186 179 202 175 211 162" fill="none" stroke={`url(#${shadeGradientId})`} strokeWidth="14" strokeLinecap="round" />
            </g>
          </g>

          <g id="rig-leg-left" data-rig-part="leg-left" className="rig-part rig-leg rig-leg-left">
            <rect x="86" y="187" width="22" height="31" rx="11" fill={`url(#${shadeGradientId})`} />
          </g>
          <g id="rig-leg-right" data-rig-part="leg-right" className="rig-part rig-leg rig-leg-right">
            <rect x="132" y="187" width="22" height="31" rx="11" fill={`url(#${shadeGradientId})`} />
          </g>

          <g id="rig-body-ratio" data-rig-part="body-ratio" className="rig-part rig-body-ratio">
            <g id="rig-body-pose" data-rig-part="body-pose" className="rig-part rig-body-pose">
              <g id="rig-ear-left" data-rig-part="ear-left" className="rig-part rig-ear rig-ear-left">
                <path className="ear-shell ear-shell-left" d="M64 104 C64 82 67 55 78 40 C82 34 88 36 93 43 L116 77 C98 72 80 84 64 104 Z" fill={`url(#${baseGradientId})`} />
                <path className="ear-inner-fill ear-inner-left" d="M73 85 C74 69 79 53 85 45 C88 43 93 50 97 58 C101 66 103 75 104 83 C93 77 82 78 73 85 Z" fill="var(--cat-ear)" />
              </g>
              <g id="rig-ear-right" data-rig-part="ear-right" className="rig-part rig-ear rig-ear-right">
                <path className="ear-shell ear-shell-right" d="M124 77 L147 43 C152 36 158 34 162 40 C173 55 176 82 176 104 C160 84 142 72 124 77 Z" fill={`url(#${baseGradientId})`} />
                <path className="ear-inner-fill ear-inner-right" d="M136 83 C137 75 139 66 143 58 C147 50 152 43 155 45 C161 53 166 69 167 85 C158 78 147 77 136 83 Z" fill="var(--cat-ear)" />
              </g>

              <g id="rig-body" data-rig-part="body" className="rig-part rig-body">
                <path d={BODY} fill={`url(#${baseGradientId})`} />
              </g>

              <g id="rig-coat-pattern" data-rig-part="coat-pattern" clipPath={`url(#${clipId})`} className="rig-part rig-coat-pattern">
                <g className="pattern pattern-cheese" fill="none" stroke="var(--cat-shade)" strokeWidth="4" strokeLinecap="round" opacity=".46">
                  <path d="M104 64 Q109 73 107 82 M120 61 Q120 72 120 81 M136 64 Q131 73 133 82" />
                  <path d="M58 108 Q70 112 81 121 M56 128 Q69 130 79 138 M58 148 Q69 150 77 157" />
                  <path d="M182 108 Q170 112 159 121 M184 128 Q171 130 161 138 M182 148 Q171 150 163 157" />
                </g>
                <g className="pattern pattern-calico">
                  <path d="M53 91 C66 64 91 59 109 69 C114 83 106 98 91 104 C74 110 59 104 53 91 Z" fill="var(--cat-patch-dark)" />
                  <path d="M146 63 C166 65 181 79 185 100 C174 111 159 108 151 96 C143 85 141 73 146 63 Z" fill="var(--cat-patch-orange)" />
                  <path d="M142 156 C158 143 180 149 186 166 C183 188 168 203 145 208 C133 196 132 171 142 156 Z" fill="var(--cat-patch-dark)" />
                  <path d="M57 159 C69 148 85 151 94 163 C98 180 89 196 72 201 C58 191 53 176 57 159 Z" fill="var(--cat-patch-orange)" />
                </g>
              </g>

              <g id="rig-hand-left" data-rig-part="hand-left" className="rig-part rig-hand rig-hand-left">
                <circle cx="56" cy="143" r="12.5" fill={handFill} />
              </g>
              <g id="rig-hand-right" data-rig-part="hand-right" className="rig-part rig-hand rig-hand-right">
                <circle cx="184" cy="143" r="12.5" fill={handFill} />
              </g>

              <g id="rig-face" data-rig-part="face" className="rig-part rig-face">
                <g className="face-art" transform="translate(0 -18)">
                <g className="expression expression-open">
                  <g id="rig-eye-left" data-rig-part="eye-left" className="eye eye-left"><ellipse cx="103" cy="127" rx="4.6" ry="5.2" fill="var(--cat-face)" /></g>
                  <g id="rig-eye-right" data-rig-part="eye-right" className="eye eye-right"><ellipse cx="137" cy="127" rx="4.6" ry="5.2" fill="var(--cat-face)" /></g>
                </g>
                <g className="expression expression-excited">
                  <path d="M95 123 L103 128 L96 133 M145 123 L137 128 L144 133" fill="none" stroke="var(--cat-face)" strokeWidth="3.3" strokeLinecap="round" strokeLinejoin="round" />
                </g>
                <g className="expression expression-laughing">
                  <path d="M95 129 Q103 121 111 129 M129 129 Q137 121 145 129" fill="none" stroke="var(--cat-face)" strokeWidth="3" strokeLinecap="round" />
                </g>
                <g className="expression expression-proud">
                  <path d="M96 125 Q103 132 110 125 M130 125 Q137 132 144 125" fill="none" stroke="var(--cat-face)" strokeWidth="2.8" strokeLinecap="round" />
                </g>
                <g className="expression expression-confused">
                  <path d="M96 122 L106 119 M134 120 L144 123" fill="none" stroke="var(--cat-face)" strokeWidth="2.5" strokeLinecap="round" />
                  <ellipse cx="103" cy="130" rx="4.3" ry="4.8" fill="var(--cat-face)" />
                  <ellipse cx="137" cy="130" rx="4.3" ry="4.8" fill="var(--cat-face)" />
                </g>
                <g className="expression expression-sad">
                  <path d="M96 124 L110 124 Q103 133 96 124 Z M130 124 L144 124 Q137 133 130 124 Z" fill="var(--cat-face)" />
                </g>
                <g className="expression expression-disappointed">
                  <path d="M96 125 C100 127 105 127 110 123 C110 129 106 133 102 132 C98 132 96 129 96 125 Z M130 123 C135 127 140 127 144 125 C144 129 142 132 138 132 C134 133 130 129 130 123 Z" fill="var(--cat-face)" />
                </g>
                <g className="expression expression-tired">
                  <path d="M95 125 Q102 128 109 125 L108 129 Q102 132 96 129 Z M131 125 Q138 128 145 125 L144 129 Q138 132 132 129 Z" fill="var(--cat-face)" />
                </g>
                <g className="expression expression-sleepy">
                  <path d="M96 125 Q103 132 110 125 M130 125 Q137 132 144 125" fill="none" stroke="var(--cat-face)" strokeWidth="2.8" strokeLinecap="round" />
                </g>
                <g className="expression expression-angry">
                  <path d="M94 122 L107 127 M133 127 L146 122" fill="none" stroke="var(--cat-face)" strokeWidth="3" strokeLinecap="round" />
                  <ellipse cx="103" cy="131" rx="4" ry="4.8" fill="var(--cat-face)" />
                  <ellipse cx="137" cy="131" rx="4" ry="4.8" fill="var(--cat-face)" />
                </g>
                <g className="expression expression-crying">
                  <path d="M96 122 Q103 118 110 123 M130 123 Q137 118 144 122" fill="none" stroke="var(--cat-face)" strokeWidth="2.4" strokeLinecap="round" />
                  <circle cx="103" cy="130" r="4.2" fill="var(--cat-face)" />
                  <circle cx="137" cy="130" r="4.2" fill="var(--cat-face)" />
                </g>
                <g className="expression expression-scared">
                  <path d="M96 123 Q102 124 109 118 M131 118 Q138 124 144 123" fill="none" stroke="var(--cat-face)" strokeWidth="2.4" strokeLinecap="round" />
                  <circle cx="103" cy="130" r="4.1" fill="var(--cat-face)" />
                  <circle cx="137" cy="130" r="4.1" fill="var(--cat-face)" />
                </g>
                <g className="expression expression-love" fill="#ff3f73">
                  <path d="M103 134 C93 127 95 119 103 123 C111 119 113 127 103 134 Z" />
                  <path d="M137 134 C127 127 129 119 137 123 C145 119 147 127 137 134 Z" />
                </g>
                <g className="expression expression-wink">
                  <ellipse cx="103" cy="127" rx="4.6" ry="5.2" fill="var(--cat-face)" />
                  <path d="M135 123 L129.5 128 L135 133" fill="none" stroke="var(--cat-face)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </g>

                <g id="rig-whiskers-left" data-rig-part="whiskers-left" className="rig-part rig-whiskers rig-whiskers-left" fill="none" stroke="var(--cat-accent)" strokeWidth="2.2" strokeLinecap="round" opacity=".72">
                  <path d="M94 137 L81 134 M94 142 L80 144" />
                </g>
                <g id="rig-whiskers-right" data-rig-part="whiskers-right" className="rig-part rig-whiskers rig-whiskers-right" fill="none" stroke="var(--cat-accent)" strokeWidth="2.2" strokeLinecap="round" opacity=".72">
                  <path d="M146 137 L159 134 M146 142 L160 144" />
                </g>

                <g id="rig-mouth" data-rig-part="mouth" className="rig-part rig-mouth">
                  <path className="mouth mouth-idle" d="M113 138 Q116.5 145 120 139 Q123.5 145 127 138" fill="none" stroke="var(--cat-face)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  <g className="mouth mouth-happy"><path className="mouth-cat-line" d="M112 139 Q116 145 120 139 Q124 145 128 139" fill="none" stroke="var(--cat-face)" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" /><g className="mouth-opening"><path d="M116 142 C117 144 123 144 124 142 C124 149 123 153 120 153 C117 153 116 149 116 142 Z" fill="var(--cat-face)" /><path d="M117.5 148 C117.5 145 122.5 145 122.5 148 C122.5 151 121.5 152.5 120 152.5 C118.5 152.5 117.5 151 117.5 148 Z" fill="var(--cat-ear)" /></g></g>
                  <g className="mouth mouth-sleepy"><ellipse cx="120" cy="144" rx="4" ry="5" fill="var(--cat-face)" /><ellipse cx="120" cy="146" rx="2.2" ry="2.6" fill="var(--cat-ear)" /></g>
                  <g className="mouth mouth-surprised"><ellipse cx="120" cy="144" rx="5.1" ry="6.2" fill="var(--cat-face)" /><ellipse cx="120" cy="145" rx="2.8" ry="3.5" fill="var(--cat-ear)" /></g>
                  <path className="mouth mouth-annoyed" d="M114 146 Q120 137 126 146" fill="none" stroke="var(--cat-face)" strokeWidth="2.7" strokeLinecap="round" />
                  <path className="mouth mouth-sad" d="M113 147 Q120 137 127 147" fill="none" stroke="var(--cat-face)" strokeWidth="2.8" strokeLinecap="round" />
                  <g className="mouth mouth-tired"><path d="M112 145 Q120 137 128 145 Q120 151 112 145 Z" fill="var(--cat-face)" /></g>
                  <g className="mouth mouth-laugh"><path d="M112 139 Q116 145 120 139 Q124 145 128 139" fill="none" stroke="var(--cat-face)" strokeWidth="2.7" strokeLinecap="round" /><g className="mouth-opening"><path d="M116 142 C117 144 123 144 124 142 C124 149 123 153 120 153 C117 153 116 149 116 142 Z" fill="var(--cat-face)" /><path d="M117.5 148 C117.5 145 122.5 145 122.5 148 C122.5 151 121.5 152.5 120 152.5 C118.5 152.5 117.5 151 117.5 148 Z" fill="var(--cat-ear)" /></g></g>
                  <path className="mouth mouth-cry" d="M113 147 Q120 138 127 147" fill="none" stroke="var(--cat-face)" strokeWidth="2.8" strokeLinecap="round" />
                  <g className="mouth mouth-hiss">
                    <path d="M111 139 Q120 157 129 139 Q120 144 111 139 Z" fill="var(--cat-face)" />
                    <path d="M114 142 L117 147 L119 142 M121 142 L123 147 L126 142" fill="var(--cat-soft)" />
                    <path d="M116 151 Q120 154 124 151" fill="var(--cat-ear)" />
                  </g>
                  <g className="mouth mouth-scared">
                    <path d="M109 144 C112 138 116 140 120 143 C124 139 129 141 131 146 C130 152 126 154 120 151 C115 154 111 152 109 147 Z" fill="var(--cat-face)" />
                    <path d="M112 147 C116 144 119 147 121 148 C124 145 128 147 129 149 C127 153 124 153 120 151 C116 154 113 152 112 147 Z" fill="var(--cat-ear)" />
                  </g>
                </g>

                <g className="morph-face">
                  <g className="morph-eye morph-eye-left eye eye-left">
                    <path ref={leftEyePathRef} d={cubicPath(initialFace.current.leftEye)} />
                  </g>
                  <g className="morph-eye morph-eye-right eye eye-right">
                    <path ref={rightEyePathRef} d={cubicPath(initialFace.current.rightEye)} />
                  </g>
                  <path ref={leftEyeLinePathRef} className="morph-eye-line morph-eye-line-left" d={openPath(initialFace.current.leftEyeLine)} fill="none" stroke="var(--cat-face)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  <path ref={rightEyeLinePathRef} className="morph-eye-line morph-eye-line-right" d={openPath(initialFace.current.rightEyeLine)} fill="none" stroke="var(--cat-face)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  <g
                    className="blink-eyelids"
                    data-testid="blink-eyelids"
                    fill="none"
                    stroke="var(--cat-face)"
                    strokeWidth="3"
                    strokeLinecap="round"
                  >
                    <path className="blink-eyelid blink-eyelid-left" d="M96 127.2 C99.2 130.4 106.8 130.4 110 127.2" />
                    <path className="blink-eyelid blink-eyelid-right" d="M130 127.2 C133.2 130.4 140.8 130.4 144 127.2" />
                  </g>
                  <path ref={leftBrowPathRef} className="morph-brow morph-brow-left" d={browPath(initialFace.current.leftBrow)} fill="none" stroke="var(--cat-face)" strokeWidth="2.8" strokeLinecap="round" />
                  <path ref={rightBrowPathRef} className="morph-brow morph-brow-right" d={browPath(initialFace.current.rightBrow)} fill="none" stroke="var(--cat-face)" strokeWidth="2.8" strokeLinecap="round" />
                  <g className="morph-mouth-clip">
                    <g className="morph-mouth-opening">
                      <path ref={mouthOuterPathRef} className="morph-mouth-outer" d={cubicPath(initialFace.current.mouthOuter)} fill="var(--cat-face)" />
                      <path ref={mouthInnerPathRef} className="morph-mouth-inner" d={cubicPath(initialFace.current.mouthInner)} fill="var(--cat-ear)" />
                    </g>
                  </g>
                  <path ref={mouthLinePathRef} className="morph-mouth-line" d={openPath(initialFace.current.mouthLine)} fill="none" stroke="var(--cat-face)" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </g>

                <g className="face-detail face-detail-proud" fill="#fff" pointerEvents="none">
                  <path d="M103 121.2 C103.5 123.9 104.7 125.1 107.4 125.6 C104.7 126.1 103.5 127.3 103 130 C102.5 127.3 101.3 126.1 98.6 125.6 C101.3 125.1 102.5 123.9 103 121.2 Z" />
                  <path d="M137 121.2 C137.5 123.9 138.7 125.1 141.4 125.6 C138.7 126.1 137.5 127.3 137 130 C136.5 127.3 135.3 126.1 132.6 125.6 C135.3 125.1 136.5 123.9 137 121.2 Z" />
                </g>
                <g className="face-detail face-detail-crying" fill="#fff" pointerEvents="none">
                  <circle cx="101" cy="125.5" r="2.2" /><circle cx="105.7" cy="130.3" r="1" />
                  <circle cx="135" cy="125.5" r="2.2" /><circle cx="139.7" cy="130.3" r="1" />
                </g>
                <g className="face-detail face-detail-sad" pointerEvents="none">
                  <circle cx="101.2" cy="125.5" r="2" fill="#fff" opacity=".9" />
                  <circle cx="135.2" cy="125.5" r="2" fill="#fff" opacity=".9" />
                  <path className="sad-tear-well" d="M103.8 132.1 C106 134.4 107.1 137.1 105.3 139.3 C103.8 141.1 100.6 140.6 100.1 138.2 C99.7 136.1 101.8 134.2 103.8 132.1 Z" fill="#73c8ff" stroke="#2f94df" strokeWidth=".75" />
                </g>

                <g className="interaction-face interaction-face-petting" fill="none" stroke="var(--cat-face)" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M96 126 Q103 132 110 126 M130 126 Q137 132 144 126" strokeWidth="2.9" />
                  <path d="M112 139 Q116 145 120 139 Q124 145 128 139" strokeWidth="2.7" />
                </g>
                <g className="interaction-face interaction-face-sleep" fill="none" stroke="var(--cat-face)" strokeLinecap="round">
                  <path d="M96 126 Q103 132 110 126 M130 126 Q137 132 144 126" strokeWidth="2.8" />
                  <ellipse cx="120" cy="144" rx="3.7" ry="4.8" fill="var(--cat-face)" stroke="none" />
                  <ellipse cx="120" cy="146" rx="1.9" ry="2.4" fill="var(--cat-ear)" stroke="none" />
                </g>
                <g className="interaction-face interaction-face-yawn" fill="none" stroke="var(--cat-face)" strokeLinecap="round">
                  <path d="M96 126 Q103 132 110 126 M130 126 Q137 132 144 126" strokeWidth="2.8" />
                  <ellipse cx="120" cy="145" rx="7.2" ry="8.5" fill="var(--cat-face)" stroke="none" />
                  <ellipse cx="120" cy="149" rx="4.3" ry="2.7" fill="var(--cat-ear)" stroke="none" />
                </g>
                </g>
              </g>

              <g id="rig-effects" data-rig-part="effects" className="rig-part rig-effects">
                <g className="effect effect-excited" fill="#ffad00"><path d="M179 56 L184 38 L190 41 L184 59 Z M189 62 L202 48 L207 53 L192 66 Z M192 70 L209 68 L209 75 L192 75 Z" /></g>
                <g className="effect effect-proud" fill="#ffb30f">
                  <path d="M194 39 C195.4 47 198.8 50.6 206.7 52 C198.8 53.4 195.4 57 194 65 C192.6 57 189.2 53.4 181.3 52 C189.2 50.6 192.6 47 194 39 Z" />
                  <path d="M207 69 C207.8 73.5 209.7 75.4 214.2 76.2 C209.7 77 207.8 78.9 207 83.4 C206.2 78.9 204.3 77 199.8 76.2 C204.3 75.4 206.2 73.5 207 69 Z" />
                </g>
                <g className="effect effect-proud-hands"><circle cx="87" cy="159" r="12.5" fill={handFill} /><circle cx="153" cy="159" r="12.5" fill={handFill} /></g>
                <g className="effect effect-thinking" fill="#fff" stroke="#8290aa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M177 78 C173 73 176 67 181 66 C183 59 191 57 196 61 C202 59 207 63 207 69 C213 72 211 80 205 82 C202 88 194 89 190 85 C184 89 177 85 177 78 Z" /><circle cx="171" cy="96" r="3.5" /><circle cx="162" cy="106" r="2.1" /></g>
                <g className="effect effect-thinking-hand"><circle cx="137" cy="158" r="11.5" fill={handFill} /></g>
                <g className="effect effect-startled" fill="#ee252a"><path d="M190 43 C192 40 198 42 197 46 L193 67 C192 71 187 70 187 66 Z" /><circle cx="189" cy="78" r="4.6" /></g>
                <g className="effect effect-confused" fill="#258ed8"><path d="M178 55 C178 45 187 39 197 42 C207 45 211 54 207 62 C204 68 197 70 196 77 L188 77 C188 67 195 64 198 59 C201 54 198 50 194 49 C189 48 186 52 186 56 Z" /><circle cx="192" cy="88" r="4" /></g>
                <g className="effect effect-disappointed" fill="#4b78c6"><rect x="183" y="48" width="3.5" height="25" rx="1.75" /><rect x="193" y="43" width="3.5" height="31" rx="1.75" /><rect x="203" y="50" width="3.5" height="22" rx="1.75" /></g>
                <g className="effect effect-tired" fill="none" stroke="#7891bd" strokeWidth="2.5" strokeLinecap="round"><path d="M192 64 L192 76 M201 59 L201 76 M210 65 L210 76" /></g>
                <g className="effect effect-sleepy" fill="#258ed8"><text x="169" y="91" fontSize="21" fontWeight="800">z</text><text x="183" y="76" fontSize="17" fontWeight="800">z</text><text x="195" y="64" fontSize="13" fontWeight="800">z</text></g>
                <g className="effect effect-angry" fill="none" stroke="#ee2c32" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M188 42 L188 47 Q188 51 184 51 L180 51" />
                  <path d="M195 42 L195 47 Q195 51 199 51 L203 51" />
                  <path d="M188 68 L188 63 Q188 59 184 59 L180 59" />
                  <path d="M195 68 L195 63 Q195 59 199 59 L203 59" />
                </g>
                <g className="effect effect-scared-tremble" fill="none" stroke="#438fd2" strokeWidth="2" strokeLinecap="round">
                  <path className="tremble tremble-left-top" d="M54 91 Q48 95 51 101 Q45 105 49 111" />
                  <path className="tremble tremble-left-bottom" d="M47 139 Q41 144 45 150 Q40 155 44 162" />
                  <path className="tremble tremble-right-top" d="M186 86 Q192 91 189 97 Q195 102 191 108" />
                  <path className="tremble tremble-right-bottom" d="M193 133 Q199 139 195 145 Q201 151 197 158" />
                </g>
                <g className="effect effect-crying" fill="#73c8ff" stroke="#2f94df" strokeWidth=".8">
                  <path className="cry-tear cry-tear-left" d="M97 116 C100 119.8 106.2 120.1 109 116.3 C109.8 121.7 107.2 126 103 126 C98.8 126 96.2 121.7 97 116 Z" />
                  <path className="cry-tear cry-tear-right" d="M131 116.3 C133.8 120.1 140 119.8 143 116 C143.8 121.7 141.2 126 137 126 C132.8 126 130.2 121.7 131 116.3 Z" />
                </g>
                <g className="effect idle-effect idle-effect-punch" fill="#ffc83d">
                  <path className="punch-impact punch-impact-left" d="M45 119 L50 127 L60 124 L55 133 L62 141 L51 138 L46 147 L43 137 L33 138 L40 130 L34 122 Z" />
                  <path className="punch-impact punch-impact-right" d="M195 119 L190 127 L180 124 L185 133 L178 141 L189 138 L194 147 L197 137 L207 138 L200 130 L206 122 Z" />
                </g>
                <g className="effect idle-effect idle-effect-stretch" stroke="#7b523f" strokeWidth="1.15" strokeLinejoin="round">
                  <g className="stretch-paw-print stretch-paw-print-left">
                    <path d="M43 189 C39.5 186.2 40.4 181.8 44.2 180.8 C47.8 179.8 50.6 182.6 49.7 186.1 C48.7 189.7 46.2 191.4 43 189 Z" fill="#f5a4ae" />
                    <ellipse cx="36.9" cy="180.6" rx="2.45" ry="3.2" transform="rotate(-25 36.9 180.6)" fill="#ffbac2" />
                    <ellipse cx="42.5" cy="176.8" rx="2.5" ry="3.25" transform="rotate(-8 42.5 176.8)" fill="#ffbac2" />
                    <ellipse cx="48.7" cy="177.2" rx="2.5" ry="3.25" transform="rotate(10 48.7 177.2)" fill="#ffbac2" />
                    <ellipse cx="54" cy="181.4" rx="2.4" ry="3.1" transform="rotate(27 54 181.4)" fill="#ffbac2" />
                  </g>
                  <g className="stretch-paw-print stretch-paw-print-right">
                    <path d="M197 189 C200.5 186.2 199.6 181.8 195.8 180.8 C192.2 179.8 189.4 182.6 190.3 186.1 C191.3 189.7 193.8 191.4 197 189 Z" fill="#f5a4ae" />
                    <ellipse cx="203.1" cy="180.6" rx="2.45" ry="3.2" transform="rotate(25 203.1 180.6)" fill="#ffbac2" />
                    <ellipse cx="197.5" cy="176.8" rx="2.5" ry="3.25" transform="rotate(8 197.5 176.8)" fill="#ffbac2" />
                    <ellipse cx="191.3" cy="177.2" rx="2.5" ry="3.25" transform="rotate(-10 191.3 177.2)" fill="#ffbac2" />
                    <ellipse cx="186" cy="181.4" rx="2.4" ry="3.1" transform="rotate(-27 186 181.4)" fill="#ffbac2" />
                  </g>
                </g>
                <g className="effect idle-effect idle-effect-groom" fill="#7fd5ff">
                  <path d="M75 112 C70 118 71 123 75 124 C79 122 79 117 75 112 Z" />
                  <path d="M84 104 C80 109 81 113 84 114 C87 112 87 108 84 104 Z" />
                </g>
                <g className="effect idle-effect idle-effect-yawn" fill="#d8edff" stroke="#8db9da" strokeWidth="1.5">
                  <path d="M165 130 C169 125 176 127 176 132 C182 131 186 135 184 140 C181 144 174 144 171 141 C166 143 161 139 163 135 C159 133 161 130 165 130 Z" />
                </g>
                <g className="foreground-paw foreground-paw-groom"><circle cx="56" cy="143" r="12.5" fill={handFill} /></g>
              </g>

            </g>
          </g>
        </g>

        <g className="canvas-effects" pointerEvents="none">
          <g className="effect effect-playful-star" fill="#ffb30f">
            <path d="M181 45 L184.2 53.2 L193 53.5 L186.1 58.9 L188.5 67.5 L181 62.6 L173.5 67.5 L175.9 58.9 L169 53.5 L177.8 53.2 Z" />
          </g>
          <g className="effect effect-laughing" fill="none" stroke="#ffbd2f" strokeWidth="3.2" strokeLinecap="round">
            <g className="laugh-burst laugh-burst-left"><path d="M42 104 Q34 96 30 86" /><path d="M49 96 Q46 86 47 78" /></g>
            <g className="laugh-burst laugh-burst-right"><path d="M198 104 Q206 96 210 86" /><path d="M191 96 Q194 86 193 78" /></g>
          </g>
          <g className="effect idle-effect idle-effect-butterfly" stroke="#17181b" strokeWidth="1.45" strokeLinejoin="round" strokeLinecap="round">
            <g className="butterfly-flight">
              <g className="butterfly-figure">
                <path className="butterfly-wing butterfly-wing-left" d="M-1 1 C-5 -10 -15 -10 -14 -1 C-13 7 -7 9 -1 5 Z" fill="#fff" />
                <path className="butterfly-wing butterfly-wing-right" d="M1 1 C5 -10 15 -10 14 -1 C13 7 7 9 1 5 Z" fill="#fff" />
                <path className="butterfly-body" d="M0 -2 C-2 0 -2 7 0 10 C2 7 2 0 0 -2 Z" fill="#17181b" />
                <path className="butterfly-antennae" d="M-.8 -1 Q-5 -7 -8 -5 M.8 -1 Q5 -7 8 -5" fill="none" />
              </g>
            </g>
          </g>
          <g className="effect effect-love cute-heart-effect" fill={`url(#${heartGradientId})`} stroke="#ff326c" strokeWidth="1.1" strokeLinejoin="round">
            <g className="heart heart-one" data-heart-kind="chubby">
              <path d="M198 109 C193 105 186 99 186 91 C186 84 191 80 197 80 C201 80 204 82 207 86 C210 82 213 80 217 80 C223 80 228 84 228 91 C228 100 219 107 207 114 C203 112 201 111 198 109 Z" />
              <ellipse className="heart-shine" cx="196" cy="87" rx="2.5" ry="1.7" fill="#fff" stroke="none" transform="rotate(-26 196 87)" />
            </g>
            <g className="heart heart-two" data-heart-kind="chubby">
              <path d="M209 83 C205 80 201 76 201 71 C201 66 205 63 209 63 C212 63 214 65 216 68 C218 65 221 63 224 63 C229 63 232 66 232 71 C232 77 226 82 216 88 C213 86 211 85 209 83 Z" />
              <ellipse className="heart-shine" cx="208.5" cy="68.8" rx="1.7" ry="1.1" fill="#fff" stroke="none" transform="rotate(-24 208.5 68.8)" />
            </g>
            <g className="heart heart-three" data-heart-kind="chubby">
              <path d="M170 79 C166 76 163 72 163 68 C163 63 167 60 171 60 C174 60 176 62 178 65 C180 62 182 60 185 60 C190 60 193 63 193 68 C193 74 187 78 178 84 C175 82 172 81 170 79 Z" />
              <ellipse className="heart-shine" cx="170.2" cy="65.5" rx="1.6" ry="1" fill="#fff" stroke="none" transform="rotate(-24 170.2 65.5)" />
            </g>
          </g>
          <g className="effect effect-affectionate cute-heart-effect" fill={`url(#${heartGradientId})`} stroke="#ff4678" strokeWidth="1" strokeLinejoin="round">
            <g className="heart affectionate-heart" data-heart-kind="chubby">
              <path d="M197 108 C193 105 188 100 188 94 C188 88 192 85 197 85 C201 85 203 87 205 90 C207 87 210 85 213 85 C219 85 222 89 222 94 C222 101 215 107 205 113 C202 111 199 110 197 108 Z" />
              <ellipse className="heart-shine" cx="196.7" cy="91.2" rx="2" ry="1.25" fill="#fff" stroke="none" transform="rotate(-25 196.7 91.2)" />
            </g>
          </g>
          <g className="effect idle-effect idle-effect-petting cute-heart-effect" fill={`url(#${heartGradientId})`} stroke="#ff326c" strokeWidth="1" strokeLinejoin="round">
            <g className="pet-heart pet-heart-one" data-heart-kind="chubby">
              <path d="M194 105 C190 102 186 98 186 93 C186 87 190 84 195 84 C198 84 201 86 203 89 C205 86 208 84 211 84 C216 84 220 87 220 93 C220 100 213 105 203 111 C199 109 197 107 194 105 Z" />
              <ellipse className="heart-shine" cx="194.5" cy="90" rx="1.9" ry="1.2" fill="#fff" stroke="none" transform="rotate(-25 194.5 90)" />
            </g>
            <g className="pet-heart pet-heart-two" data-heart-kind="chubby">
              <path d="M209 83 C205 80 202 77 202 72 C202 67 206 64 210 64 C213 64 215 66 217 69 C219 66 221 64 224 64 C229 64 232 67 232 72 C232 78 226 83 217 88 C214 86 211 85 209 83 Z" />
              <ellipse className="heart-shine" cx="209.3" cy="69.8" rx="1.5" ry="1" fill="#fff" stroke="none" transform="rotate(-24 209.3 69.8)" />
            </g>
            <g className="pet-heart pet-heart-three" data-heart-kind="chubby">
              <path d="M169 82 C166 79 163 76 163 72 C163 67 166 64 170 64 C173 64 175 66 177 68 C179 66 181 64 184 64 C188 64 191 67 191 72 C191 77 186 81 177 86 C174 84 171 83 169 82 Z" />
              <ellipse className="heart-shine" cx="169.5" cy="69.5" rx="1.4" ry=".9" fill="#fff" stroke="none" transform="rotate(-24 169.5 69.5)" />
            </g>
          </g>
        </g>

        <ellipse
          className="head-pet-hitbox"
          data-testid="head-pet-hitbox"
          cx="120"
          cy="103"
          rx="61"
          ry="57"
          fill="transparent"
          pointerEvents="all"
          onPointerEnter={(event) => beginPetting(event.pointerType === "mouse")}
          onPointerLeave={endPetting}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            beginPetting(false);
          }}
          onPointerUp={(event) => {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
            endPetting();
          }}
          onPointerCancel={endPetting}
        />
      </svg>
    );
  },
);

GreusCat.displayName = "GreusCat";

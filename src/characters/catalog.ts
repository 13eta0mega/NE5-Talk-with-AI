export type OrnamentKind = "rabbit" | "bear" | "sprout" | "fox" | "roundear" | "antenna-long" | "heart" | "antenna-single" | "antenna-short" | "bot-orbit" | "bot-screen" | "bot-cloud" | "jirai";

export interface CharacterProfile {
  id: string;
  displayName: string;
  teaser: string;
  base: string;
  highlight: string;
  outline: string;
  ornament: OrnamentKind;
  signature: "bunny" | "bear" | "sunny" | "fox" | "soft" | "explorer" | "heart" | "goofy" | "solver" | "dreamer" | "orbit" | "screen" | "cloud" | "jirai";
  asset: string;
  face: {
    eyeSpacing: number; eyeY: number; eyeRx: number; eyeRy: number;
    eyeTiltL: number; eyeTiltR: number; mouthY: number; mouthScale: number;
    smileBias: number; browOpacity: number; cheek: string; highlight: boolean;
  };
  motion: { bounce: number; sway: number; ornament: number; tail: number };
}

const face = (patch: Partial<CharacterProfile["face"]> = {}): CharacterProfile["face"] => ({
  eyeSpacing: 95, eyeY: 580, eyeRx: 22, eyeRy: 24, eyeTiltL: 0, eyeTiltR: 0,
  mouthY: 605, mouthScale: 1, smileBias: 0, browOpacity: .72, cheek: "#F486A8", highlight: false, ...patch,
});
const motion = (patch: Partial<CharacterProfile["motion"]> = {}): CharacterProfile["motion"] => ({ bounce: 1, sway: 1, ornament: 1, tail: 1, ...patch });

export const CHARACTERS: CharacterProfile[] = [
  { id: "pet-rabbit-pink", displayName: "모모", teaser: "포근하고 장난기 많은 토끼", base: "#FDC8DE", highlight: "#FFE4EF", outline: "#261412", ornament: "rabbit", signature: "bunny", asset: "./characters/pet-rabbit-pink.svg", face: face({ eyeSpacing: 91, eyeY: 607, eyeRx: 22, eyeRy: 29, mouthY: 644, mouthScale: .82, cheek: "#F38EB3", highlight: true }), motion: motion({ bounce: 1.18, ornament: 1.25 }) },
  { id: "pet-bear-tan", displayName: "두리", teaser: "느긋하고 듬직한 곰", base: "#ECC5A5", highlight: "#F9DDC4", outline: "#2A1610", ornament: "bear", signature: "bear", asset: "./characters/pet-bear-tan.svg", face: face({ eyeSpacing: 99, eyeY: 579, eyeRx: 20, eyeRy: 25, mouthY: 626, mouthScale: .84, browOpacity: .35, cheek: "#E9A079" }), motion: motion({ bounce: .55, sway: .55, ornament: .3 }) },
  { id: "pet-sprout-yellow", displayName: "삐오", teaser: "햇살처럼 밝은 새싹", base: "#FDF290", highlight: "#FFF9B9", outline: "#28130E", ornament: "sprout", signature: "sunny", asset: "./characters/pet-sprout-yellow.svg", face: face({ eyeSpacing: 106, eyeY: 569, eyeRx: 24, eyeRy: 30, mouthY: 607, mouthScale: .94, smileBias: .15, cheek: "#F5BA58", highlight: true }), motion: motion({ bounce: 1.45, sway: 1.15, ornament: 1.5 }) },
  { id: "pet-fox-orange", displayName: "여우비", teaser: "툭툭 말해도 속은 따뜻한 여우", base: "#FDA669", highlight: "#FFC18F", outline: "#2A120B", ornament: "fox", signature: "fox", asset: "./characters/pet-fox-orange.svg", face: face({ eyeSpacing: 112, eyeY: 581, eyeRx: 28, eyeRy: 17, eyeTiltL: 9, eyeTiltR: -9, mouthY: 621, mouthScale: 1.03, smileBias: .1, browOpacity: .88, cheek: "#E9775B" }), motion: motion({ bounce: .8, sway: 1.25, ornament: .9, tail: 1.5 }) },
  { id: "pet-roundear-cream", displayName: "포포", teaser: "차분히 곁을 지키는 친구", base: "#FDE0BF", highlight: "#FFF0D9", outline: "#28120B", ornament: "roundear", signature: "soft", asset: "./characters/pet-roundear-cream.svg", face: face({ eyeSpacing: 104, eyeY: 560, eyeRx: 19, eyeRy: 27, mouthY: 602, mouthScale: .8, browOpacity: .28, cheek: "#F7A5B4", highlight: true }), motion: motion({ bounce: .62, sway: .75, ornament: .55 }) },
  { id: "pet-antenna-green-a", displayName: "초롱", teaser: "궁금한 게 많은 탐험가", base: "#BFFABB", highlight: "#D8FFD5", outline: "#201310", ornament: "antenna-long", signature: "explorer", asset: "./characters/pet-antenna-green-a.svg", face: face({ eyeSpacing: 118, eyeY: 587, eyeRx: 25, eyeRy: 29, eyeTiltL: -3, eyeTiltR: 4, mouthY: 628, mouthScale: .92, browOpacity: .65, cheek: "#6FDB91", highlight: true }), motion: motion({ bounce: 1.12, sway: 1.3, ornament: 1.7 }) },
  { id: "pet-heart-pink", displayName: "하티", teaser: "작은 마음도 알아보는 다정함", base: "#FDB9DA", highlight: "#FFD8EB", outline: "#180909", ornament: "heart", signature: "heart", asset: "./characters/pet-heart-pink.svg", face: face({ eyeSpacing: 112, eyeY: 589, eyeRx: 25, eyeRy: 31, mouthY: 630, mouthScale: .86, smileBias: .18, browOpacity: .3, cheek: "#F06FA9", highlight: true }), motion: motion({ bounce: .9, sway: 1.35, ornament: 1.1 }) },
  { id: "pet-antenna-orange", displayName: "콩이", teaser: "엉뚱하고 씩씩한 낙천가", base: "#FDB88E", highlight: "#FFD2B5", outline: "#210F0D", ornament: "antenna-single", signature: "goofy", asset: "./characters/pet-antenna-orange.svg", face: face({ eyeSpacing: 106, eyeY: 598, eyeRx: 19, eyeRy: 28, eyeTiltL: -7, eyeTiltR: 2, mouthY: 638, mouthScale: .78, browOpacity: .62, cheek: "#F48263", highlight: true }), motion: motion({ bounce: 1.35, sway: 1.05, ornament: 1.85 }) },
  { id: "pet-antenna-lime", displayName: "라임", teaser: "솔직하고 똑똑한 해결사", base: "#D5FA99", highlight: "#E8FFBB", outline: "#1C1C1B", ornament: "antenna-short", signature: "solver", asset: "./characters/pet-antenna-lime.svg", face: face({ eyeSpacing: 102, eyeY: 567, eyeRx: 27, eyeRy: 17, eyeTiltL: 7, eyeTiltR: -7, mouthY: 606, mouthScale: .82, smileBias: -.05, browOpacity: .92, cheek: "#9CD968" }), motion: motion({ bounce: .72, sway: .7, ornament: 1.35 }) },
  { id: "pet-antenna-purple", displayName: "루미", teaser: "상상력이 몽글몽글한 친구", base: "#F5B2FC", highlight: "#FBD3FF", outline: "#140F14", ornament: "antenna-long", signature: "dreamer", asset: "./characters/pet-antenna-purple.svg", face: face({ eyeSpacing: 102, eyeY: 594, eyeRx: 28, eyeRy: 33, mouthY: 636, mouthScale: .86, smileBias: .08, browOpacity: .4, cheek: "#D87AE5", highlight: true }), motion: motion({ bounce: .82, sway: 1.6, ornament: 1.45 }) },
  { id: "pet-orbit-bot", displayName: "오르비", teaser: "신호를 모아 마음을 읽는 궤도 로봇", base: "#79FFF6", highlight: "#D9FFFC", outline: "#123A55", ornament: "bot-orbit", signature: "orbit", asset: "./characters/pet-orbit-bot.svg", face: face({ eyeSpacing: 105, eyeY: 574, eyeRx: 28, eyeRy: 14, mouthY: 620, mouthScale: .8, cheek: "#4CA6FF", highlight: true }), motion: motion({ bounce: 1.05, sway: 1.1, ornament: 1.65 }) },
  { id: "pet-screen-bot", displayName: "비트", teaser: "딱딱해 보여도 섬세한 화면 로봇", base: "#DDE4F2", highlight: "#FFFFFF", outline: "#242B3B", ornament: "bot-screen", signature: "screen", asset: "./characters/pet-screen-bot.svg", face: face({ eyeSpacing: 100, eyeY: 570, eyeRx: 31, eyeRy: 13, mouthY: 620, mouthScale: .72, cheek: "#5B89FF" }), motion: motion({ bounce: .78, sway: .65, ornament: .85 }) },
  { id: "pet-cloud-bot", displayName: "누보", teaser: "느린 구름처럼 곁을 맴도는 안내자", base: "#CFC8FF", highlight: "#F1EEFF", outline: "#342A62", ornament: "bot-cloud", signature: "cloud", asset: "./characters/pet-cloud-bot.svg", face: face({ eyeSpacing: 112, eyeY: 584, eyeRx: 24, eyeRy: 31, mouthY: 631, mouthScale: .92, cheek: "#A88CFF", highlight: true }), motion: motion({ bounce: .9, sway: 1.75, ornament: 1.25 }) },
  { id: "pet-jirai", displayName: "지라이", teaser: "새침하지만 정 많은 고딕 토끼 소녀", base: "#F9D7C2", highlight: "#FFF1E8", outline: "#2B151D", ornament: "jirai", signature: "jirai", asset: "./characters/pet-jirai.svg", face: face({ eyeSpacing: 105, eyeY: 555, eyeRx: 38, eyeRy: 48, mouthY: 624, mouthScale: .58, cheek: "#FF8CB3", highlight: true, browOpacity: .82 }), motion: motion({ bounce: .72, sway: .9, ornament: 1.35 }) },
];

export const characterById = (id: string): CharacterProfile => CHARACTERS.find((item) => item.id === id) ?? CHARACTERS[0];

export type CoatPreset = "greeny" | "cheese" | "calico" | "black" | "custom";

export interface CharacterProfile {
  id: string;
  displayName: string;
  teaser: string;
  coat: CoatPreset;
  base: string;
}

export const CHARACTERS: CharacterProfile[] = [
  { id: "greus-greeny", displayName: "초록냥", teaser: "싱그럽고 다정한 그루스 고양이", coat: "greeny", base: "#a8ff2f" },
  { id: "greus-cheese", displayName: "치즈냥", teaser: "포근하고 장난기 많은 그루스 고양이", coat: "cheese", base: "#f4c66a" },
  { id: "greus-calico", displayName: "삼색냥", teaser: "호기심 많고 당당한 그루스 고양이", coat: "calico", base: "#fbf4e7" },
  { id: "greus-black", displayName: "검은냥", teaser: "차분하고 눈빛이 반짝이는 그루스 고양이", coat: "black", base: "#292a25" },
  { id: "greus-custom", displayName: "커스텀냥", teaser: "원하는 색으로 함께하는 그루스 고양이", coat: "custom", base: "#8fd6ff" },
];

export const characterById = (id: string): CharacterProfile => CHARACTERS.find((item) => item.id === id) ?? CHARACTERS[0];

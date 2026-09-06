import type { EmotionId } from "../../../core/types";
import type { IdleAction } from "../GreusCat";

export const MORU_ACTIONS: Record<Exclude<IdleAction, "none">, { label: string; seconds: number }> = {
  "air-punch": { label: "\uc55e\ubc1c \uc778\uc0ac", seconds: 2.7 },
  sleep: { label: "\ub0a9\uc791 \ub0ae\uc7a0", seconds: 7.2 },
  stretch: { label: "\uae38\uac8c \uae30\uc9c0\uac1c", seconds: 3.8 },
  groom: { label: "\ubcfc \ubd80\ube44\ubd80\ube44", seconds: 3.7 },
  yawn: { label: "\ub098\ub978\ud55c \ud558\ud488", seconds: 3.3 },
  knead: { label: "\ucc39\uc300 \uafb9\uafb9", seconds: 4.2 },
  butterfly: { label: "\uae61\ucd1d \ub450 \ubc88", seconds: 3.4 },
};
export type Face = {
  left: number; right: number; arc: number; slant: number; mouth: number; open: number; width: number;
  blush: number; brow: number; browTilt: number; browLift: number;
  tilt: number; squash: number; earL: number; earR: number; tears: number;
};
const face = (v: Partial<Face>): Face => ({left:1,right:1,arc:0,slant:0,mouth:.65,open:0,width:1,blush:.28,
  brow:0,browTilt:0,browLift:0,tilt:0,squash:0,earL:0,earR:0,tears:0,...v});
export const FACES: Record<EmotionId, Face> = {
  idle: face({}),
  listening: face({left:1.08,right:1.08,tilt:-3,earL:9,earR:5}),
  happy: face({left:.03,right:.03,arc:1,mouth:1,blush:.65,earL:-7,earR:7}),
  sleepy: face({left:.04,right:.04,arc:-.8,mouth:.2,tilt:5,squash:.2,earL:-17,earR:22}),
  curious: face({left:1.08,right:1.18,mouth:.3,width:.8,tilt:-9,brow:.4,browLift:3,earL:13,earR:-9}),
  alert: face({left:1.22,right:1.22,mouth:0,width:.6,squash:-.07,earL:17,earR:-12}),
  playful: face({left:.03,right:.9,arc:1,mouth:1,open:2.5,tilt:7,blush:.7,earL:-13,earR:12}),
  excited: face({left:1.15,right:1.15,mouth:1,open:7,blush:.8,squash:-.07,earL:10,earR:-10}),
  affectionate: face({left:.04,right:.04,arc:.9,mouth:.8,blush:.85,tilt:-5,earL:-15,earR:15}),
  relaxed: face({left:.04,right:.04,arc:-.55,mouth:.75,blush:.35,squash:.09,earL:-10,earR:13}),
  startled: face({left:1.4,right:1.4,mouth:0,open:8,width:.6,squash:-.15,earL:24,earR:-19,blush:.1}),
  anxious: face({left:.85,right:.85,mouth:-.45,width:.85,brow:.85,browTilt:-7,browLift:2,squash:.09,earL:-18,earR:22}),
  annoyed: face({left:.42,right:.42,slant:2,mouth:-.5,blush:.18,brow:.6,browTilt:4,tilt:3,earL:-8,earR:8}),
  angry: face({left:.65,right:.65,slant:3.7,mouth:-.8,open:2,blush:.7,brow:1,browTilt:8,squash:.03,earL:-23,earR:25}),
  sad: face({left:.9,right:.9,mouth:-.8,brow:.8,browTilt:-7,browLift:2,squash:.13,tilt:-2,earL:-25,earR:25,blush:.18}),
  scared: face({left:1.25,right:1.25,mouth:-.8,open:5,width:.75,brow:1,browTilt:-9,squash:.18,earL:-30,earR:33}),
  laughing: face({left:.02,right:.02,arc:1.3,mouth:1,open:9,blush:.85,tilt:-4,earL:-10,earR:11}),
  love: face({left:.04,right:.04,arc:1.2,mouth:1,open:2,blush:1,tilt:7,squash:.05,earL:-18,earR:19}),
  wink: face({left:1,right:.02,arc:1.1,mouth:.9,blush:.65,tilt:-6,earL:8,earR:13}),
  proud: face({left:.55,right:.55,arc:.5,mouth:1,blush:.45,squash:-.09,earL:12,earR:-8}),
  smug: face({left:.4,right:.6,slant:-.8,mouth:.9,width:1.1,tilt:6,brow:.3,browLift:2,earL:-7,earR:7}),
  thinking: face({left:.55,right:.85,mouth:.1,width:.65,tilt:-7,brow:.6,browTilt:-3,browLift:4,earL:6,earR:-5}),
  confused: face({left:1.1,right:.7,mouth:-.15,width:.8,tilt:10,brow:.8,browTilt:-2,browLift:4,earL:-10,earR:-12}),
  disappointed: face({left:.48,right:.48,arc:-.5,mouth:-.65,blush:.12,squash:.18,tilt:4,earL:-28,earR:30}),
  tired: face({left:.3,right:.3,arc:-.3,mouth:.1,width:.7,blush:.1,squash:.23,tilt:-4,earL:-26,earR:28}),
  crying: face({left:.03,right:.03,arc:-.9,mouth:-.85,open:5,blush:.6,brow:.85,browTilt:-8,squash:.16,earL:-27,earR:31,tears:1}),
};
export function clamp(v: number, min=0, max=1): number {return Number.isFinite(v)?Math.min(max,Math.max(min,v)):min;}
export function mixFace(a: Face,b: Face,amount: number): Face {
  const t=clamp(amount);
  return Object.fromEntries(Object.keys(a).map(k=>[k,a[k as keyof Face]+(b[k as keyof Face]-a[k as keyof Face])*t])) as Face;
}
export const smooth=(t:number)=>{const x=clamp(t);return x*x*(3-2*x);};
export type Spring={value:number;velocity:number};
export function spring(s:Spring,target:number,dt:number,frequency=16,damping=.72):void {
  const duration=clamp(dt,0,.064), count=Math.max(1,Math.ceil(duration/.008)),h=duration/count;
  for(let i=0;i<count;i++){s.velocity+=((target-s.value)*frequency*frequency-2*damping*frequency*s.velocity)*h;s.value+=s.velocity*h;}
}
const n=(v:number)=>(Number.isFinite(v)?v:0).toFixed(3);
/** Feet and lower body are anchors, rather than scaling the entire drawing. */
export function bodyPath(squash:number):string {
  const q=clamp(squash,-.55,.95),top=124+q*50,wide=q*12;
  return `M160 ${n(top)} C119 ${n(top-1)} ${n(84-wide)} ${n(147+q*38)} ${n(82-wide)} 196 C${n(78-wide)} 234 102 265 132 270 C148 273 177 273 192 269 C222 265 ${n(245+wide)} 236 ${n(239+wide)} 198 C${n(236+wide)} ${n(155+q*37)} 208 ${n(top+1)} 160 ${n(top)}Z`;
}
/** The two edges share a centerline curvature: closed eyes are arcs, not dashes. */
export function eyePath(cx:number,openness:number,arc:number,tilt:number):string {
  const o=clamp(openness,0,1.5),h=1.25+o*5.85,bend=-arc*5.5*(1-Math.min(o,1));
  return `M${cx-5.2} ${n(180-tilt)} C${cx-5.2} ${n(180-h+bend)} ${cx+5.2} ${n(180-h+bend)} ${cx+5.2} ${n(180+tilt)} C${cx+5.2} ${n(180+h+bend)} ${cx-5.2} ${n(180+h+bend)} ${cx-5.2} ${n(180-tilt)}Z`;
}
export function mouthPath(smile:number,width:number):string {
  const s=clamp(smile,-1,1),w=clamp(width,.5,1.4),up=Math.max(s,0),down=Math.max(-s,0);
  const y=195+3*down,outer=195+6*up-4*down,center=195+up-down;
  return `M${n(160-9*w)} ${n(y)} C${n(160-7*w)} ${n(outer)} ${n(160-3*w)} ${n(outer)} 160 ${n(center)} C${n(160+3*w)} ${n(outer)} ${n(160+7*w)} ${n(outer)} ${n(160+9*w)} ${n(y)}`;
}
export type Motion={squash:number;y:number;tilt:number;armL:number;armR:number;pawLX:number;pawLY:number;pawRX:number;pawRY:number;earL:number;earR:number;closed:number;yawn:number;cheek:number};
export const restMotion=():Motion=>({squash:0,y:0,tilt:0,armL:0,armR:0,pawLX:0,pawLY:0,pawRX:0,pawRY:0,earL:0,earR:0,closed:0,yawn:0,cheek:0});
export function motionAt(action:IdleAction,elapsed:number):Motion {
  const m=restMotion();
  if(action==='none'||!Number.isFinite(elapsed)||elapsed<=0)return m;
  const duration=MORU_ACTIONS[action].seconds;if(elapsed>=duration)return m;
  const t=elapsed/duration,e=smooth(t/.14)*(1-smooth((t-.78)/.22)),pulse=Math.sin(elapsed*7);
  switch(action){
    case 'air-punch':m.tilt=-5*e;m.armR=(-137+Math.sin(elapsed*13)*18)*e;m.pawRY=-23*e;m.armL=-10*e;m.squash=.07*e;m.earL=6*e;break;
    case 'sleep':m.squash=.76*e;m.closed=e;m.tilt=-7*e;m.earL=-35*e;m.earR=38*e;m.armL=-18*e;m.armR=18*e;break;
    case 'stretch':m.squash=-.47*e;m.closed=e;m.armL=133*e;m.armR=-133*e;m.pawLY=-38*e;m.pawRY=-38*e;m.earL=13*e;m.earR=-19*e;m.y=-2*e;break;
    case 'groom':m.armL=(-125+pulse*9)*e;m.armR=(125+pulse*9)*e;m.pawLY=(-9+pulse*3)*e;m.pawRY=(-9-pulse*3)*e;m.squash=.08*e;m.closed=e;m.tilt=pulse*4*e;m.cheek=.9*e;break;
    case 'yawn':m.closed=e;m.yawn=13*e**3;m.squash=-.12*e;m.armR=132*e;m.pawRX=-37*e;m.pawRY=-2*e;m.earL=-12*e;m.earR=16*e;break;
    case 'knead':m.squash=(.12+.045*pulse)*e;m.armL=(-30+pulse*18)*e;m.armR=(30+pulse*18)*e;m.pawLY=(4+pulse*3)*e;m.pawRY=(4-pulse*3)*e;m.closed=.3*e;m.tilt=pulse*2*e;break;
    case 'butterfly':{
      const hop=(at:number)=>{const u=elapsed-at;if(u<0||u>1.2)return;
        if(u<.25)m.squash+=.38*Math.sin(u/.25*Math.PI/2);
        else if(u<.83){const k=(u-.25)/.58;m.y-=30*Math.sin(k*Math.PI);m.squash-=.24*Math.sin(k*Math.PI);}
        else m.squash+=.36*Math.sin((u-.83)/.37*Math.PI);};
      hop(.2);hop(1.55);m.armL=-10*e;m.armR=10*e;break;
    }
  }return m;
}

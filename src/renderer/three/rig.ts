/** Original low-poly chibi assets. Rigid-joint rig, no external models/textures. */
export type V3 = [number, number, number];
export type M4 = Float32Array;
export const identity = (): M4 => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
export function multiply(a: M4,b: M4): M4 {
  const o=new Float32Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) for(let k=0;k<4;k++) o[c*4+r]+=a[k*4+r]*b[c*4+k];
  return o;
}
export function matrix(p: V3=[0,0,0],r: V3=[0,0,0],s: V3=[1,1,1]): M4 {
  const [x,y,z]=r, cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  const m=new Float32Array([cy*cz,cy*sz,-sy,0, sx*sy*cz-cx*sz,sx*sy*sz+cx*cz,sx*cy,0, cx*sy*cz+sx*sz,cx*sy*sz-sx*cz,cx*cy,0, ...p,1]);
  for(let c=0;c<3;c++) for(let j=0;j<3;j++) m[c*4+j]*=s[c];
  return m;
}
export const transform=(m:M4,v:V3):V3=>[m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
export interface Geometry { positions: Float32Array; normals: Float32Array; }
export function geometry(points: V3[],indices: number[],reverse=false): Geometry {
  const p:number[]=[],n:number[]=[];
  for(let i=0;i<indices.length;i+=3){
    const a=points[indices[i]],b=points[indices[i+(reverse?2:1)]],c=points[indices[i+(reverse?1:2)]];
    const u=b.map((v,k)=>v-a[k]),v=c.map((q,k)=>q-a[k]);
    let normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const len=Math.hypot(...normal)||1; normal=normal.map(q=>q/len);
    for(const q of [a,b,c]){p.push(...q);n.push(...normal);}
  }
  return {positions:Float32Array.from(p),normals:Float32Array.from(n)};
}
export function sphere(w=12,h=8):Geometry {
  const p:V3[]=[],ind:number[]=[];
  for(let j=0;j<=h;j++)for(let i=0;i<=w;i++){
    const phi=i/w*Math.PI*2,t=j/h*Math.PI;
    p.push([Math.sin(t)*Math.cos(phi),Math.cos(t),Math.sin(t)*Math.sin(phi)]);
  }
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){const a=j*(w+1)+i,b=a+w+1;ind.push(a,b,a+1,b,b+1,a+1);}
  return geometry(p,ind,true);
}
export function cone(top=.65,segments=8): Geometry {
  const p:V3[]=[],ind:number[]=[];
  for(const y of [-.5,.5])for(let i=0;i<segments;i++){const a=i/segments*2*Math.PI;const r=y<0?1:top;p.push([Math.cos(a)*r,y,Math.sin(a)*r]);}
  p.push([0,-.5,0],[0,.5,0]);
  for(let i=0;i<segments;i++){const j=(i+1)%segments;ind.push(i,j,i+segments,j,j+segments,i+segments,segments*2,j,i,segments*2+1,i+segments,j+segments);}
  return geometry(p,ind,true);
}
export function polygon(points: [number,number][]):Geometry {
  const p:V3[]=points.map(([x,y])=>[x,y,0]);const ind:number[]=[];
  for(let i=1;i<p.length-1;i++)ind.push(0,i,i+1);
  return geometry(p,ind);
}
const SPHERE=sphere(),SMALL_SPHERE=sphere(8,6),CYLINDER=cone(1),WEDGE=geometry([[-1,1,-.12],[1,1,-.12],[0,-1,.1],[-1,1,.13],[1,1,.13],[0,-1,.3]],[0,2,1,3,4,5,0,1,4,0,4,3,1,2,5,1,5,4,2,0,3,2,3,5],true);
const OVAL=polygon(Array.from({length:24},(_,i)=>[Math.cos(i/24*Math.PI*2),Math.sin(i/24*Math.PI*2)]));
export interface Part {name:string; p:V3; r:V3; s:V3; baseP:V3; baseR:V3; baseS:V3; children:Part[]; mesh?:Geometry; color?:string; unlit?:boolean; visible:boolean;}
export function part(name:string,p:V3=[0,0,0],s:V3=[1,1,1],mesh?:Geometry,color?:string,r:V3=[0,0,0],unlit=false):Part{
  return {name,p:[...p],s:[...s],r:[...r],baseP:[...p],baseR:[...r],baseS:[...s],children:[],mesh,color,unlit,visible:true};
}
const add=(parent:Part,child:Part):Part=>{parent.children.push(child);return child;};
export const AVATARS=[
  {id:'greus-greeny',name:'\uadf8\ub9b0\ub0e5',role:'\uc232\uc758 \ub9c8\ubc95\uc0ac',hair:'#8edcc9',shade:'#438e89',accent:'#518a7c',light:'#eef3cf',iris:'#408e85',style:'mage'},
  {id:'greus-cheese',name:'\uce58\uc988\ub0e5',role:'\ubcc4\ube5b \ud0d0\ud5d8\uac00',hair:'#f5cf86',shade:'#c1884b',accent:'#c0784f',light:'#fff0ca',iris:'#bd763f',style:'scout'},
  {id:'greus-calico',name:'\uc0bc\uc0c9\ub0e5',role:'\uaf43\uc78e \uc815\uc6d0\uc0ac',hair:'#e8afbe',shade:'#b36f90',accent:'#b37291',light:'#fff0e5',iris:'#9d709e',style:'bunny'},
  {id:'greus-black',name:'\uac80\uc740\ub0e5',role:'\ub2ec\ube5b \uae30\ub85d\uc790',hair:'#5b617e',shade:'#353c56',accent:'#6e6d9e',light:'#eee4f6',iris:'#9585b6',style:'moon'},
  {id:'greus-custom',name:'\ucee4\uc2a4\ud140\ub0e5',role:'\ud558\ub298 \uc6b0\ud3b8\ubd80',hair:'#add9ed',shade:'#669dbb',accent:'#5485b0',light:'#f3f7ed',iris:'#548aac',style:'pilot'},
] as const;
export type AvatarId=(typeof AVATARS)[number]['id'];
export const MOTIONS=['auto','wave','bounce','dance','nod','sleep','celebrate'] as const;
export type Motion=(typeof MOTIONS)[number];
export const EXPRESSION_LABELS:Record<string,string>={idle:'\ud3c9\uc628',listening:'\ub4e3\uae30',happy:'\uae30\uc068',sleepy:'\uc878\ub9bc',curious:'\ud638\uae30\uc2ec',alert:'\uc9d1\uc911',playful:'\uc7a5\ub09c',excited:'\uc2e0\ub0a8',affectionate:'\ub2e4\uc815',relaxed:'\ud3b8\uc548',startled:'\ub180\ub78c',anxious:'\ubd88\uc548',annoyed:'\ud22c\ub35c',angry:'\ud654\ub0a8',sad:'\uc2ac\ud514',scared:'\ubb34\uc11c\uc6c0',laughing:'\uc6c3\uc74c',love:'\uc0ac\ub791',wink:'\uc719\ud06c',proud:'\ubfcc\ub4ef',smug:'\uc790\uc2e0\uac10',thinking:'\uc0dd\uac01',confused:'\uac38\uc6c3',disappointed:'\uc2e4\ub9dd',tired:'\ud53c\uace4',crying:'\uc6b8\uc74c'};
export type FacePose={eye:number;smile:number;brow:number;mouth:number;tilt:number;energy:number;blush:number;wink:number;tear:number;};
const face=(eye=1,smile=.4,brow=0,mouth=0,tilt=0,energy=.2,blush=.1,wink=0,tear=0):FacePose=>({eye,smile,brow,mouth,tilt,energy,blush,wink,tear});
export const FACES:Record<string,FacePose>={idle:face(),listening:face(1,.1,.12,0,-.08),happy:face(.75,1,0,.15,0,.7,.5),sleepy:face(.2,.2,-.08,.12,.13,.05),curious:face(1,.25,.3,.15,-.15,.4),alert:face(1.1,0,.1,.1,0,.4),playful:face(.7,.9,-.1,.2,.12,.7,.4),excited:face(1.05,1,.2,.6,-.06,1,.5),affectionate:face(.65,.8,.1,.05,.09,.15,.8),relaxed:face(.55,.6,0,0,.04,.1),startled:face(1.2,0,.45,.8,0,.7),anxious:face(.85,-.5,.42,.13,.06,.15),annoyed:face(.55,-.35,-.4,0,-.03,.2),angry:face(.62,-.6,-.65,.2,0,.4,.2),sad:face(.64,-.6,.5,.05,.12,.05),scared:face(1.15,-.6,.55,.5,0,.5),laughing:face(.14,1,0,.75,0,.9,.8),love:face(.7,1,.1,.25,.1,.45,1),wink:face(.95,.9,0,.15,.12,.5,.6,1),proud:face(.75,.8,-.15,.05,-.06,.3),smug:face(.5,.6,-.25,0,-.1,.2),thinking:face(.7,.05,.25,0,-.18,.1),confused:face(.8,-.2,.4,.3,.22,.3),disappointed:face(.4,-.7,.4,0,.1,.08),tired:face(.3,-.1,.15,.15,.1,.02),crying:face(.15,-.8,.6,.5,.1,.2,.8,0,1)};
export interface ChibiRig {root:Part;joints:Record<string,Part>;face:FacePose;triangles:number;avatar:typeof AVATARS[number];}
export function visit(node:Part,fn:(n:Part)=>void):void{fn(node);node.children.forEach(n=>visit(n,fn));}
export function createChibi(id:string):ChibiRig {
  const a=AVATARS.find(a=>a.id===id)||AVATARS[0],j:Record<string,Part>={};
  const root=part('root',[0,-.055,0]),body=add(root,part('hips',[0,.63,0]));j.hips=body;
  const dark='#39394b',skin='#ffdfc5',cream=a.light;
  const joint=(p:Part,name:string,pos:V3)=>{const n=add(p,part(name,pos));j[name]=n;return n;};
  const mesh=(p:Part,name:string,pos:V3,size:V3,g:Geometry,c:string,r:V3=[0,0,0],flat=false)=>add(p,part(name,pos,size,g,c,r,flat));
  mesh(body,'tunic',[0,.28,0],[.27,.53,.19],cone(.8,10),a.accent);
  mesh(body,'skirt',[0,.05,0],[.35,.24,.27],cone(.73,10),dark);
  mesh(body,'hem',[0,-.055,0],[.354,.045,.276],cone(.98,10),cream);
  mesh(body,'belt',[0,.19,0],[.284,.06,.205],CYLINDER,cream);
  mesh(body,'shirt',[0,.39,.177],[.125,.23,.026],WEDGE,cream);
  mesh(body,'brooch',[0,.4,.218],[.044,.055,.025],SMALL_SPHERE,'#eabe6d');
  const head=joint(body,'head',[0,1.04,0]);
  mesh(head,'hair-back',[0,.105,-.07],[.665,.635,.505],SPHERE,a.shade);
  const headShape=sphere(16,10);for(let i=2;i<headShape.positions.length;i+=3)headShape.positions[i]=Math.min(headShape.positions[i],.88);
  mesh(head,'face',[0,.03,.09],[.592,.556,.555],headShape,skin);
  mesh(head,'hair-cap',[0,.3,-.08],[.65,.445,.52],SPHERE,a.hair);
  for(let i=0;i<7;i++){
    const x=(i-3)*.145,y=.405-(Math.abs(i-3)*.012),z=.545-Math.abs(i-3)*.025;
    mesh(head,'bang-'+i,[x,y,z],[.123,.22+(i%3)*.035,.18],WEDGE,i%3===0?a.shade:a.hair,[0,0,(i-3)*-.09]);
  }
  for(const side of [-1,1]){
    const key=side<0?'L':'R';
    const lock=joint(head,'hair'+key,[side*.55,.24,-.04]);
    const long=a.style==='mage'||a.style==='bunny'||a.style==='pilot';
    mesh(lock,'lock-'+key,[0,long?-.38:-.25,.09],[.18,long?.47:.33,.27],WEDGE,a.hair,[.04,side*.18,side*-.06]);
    const ear=joint(head,'ear'+key,[side*.405,.685,-.09]);
    if(a.style==='bunny'){
      mesh(ear,'bunny-ear'+key,[0,.26,0],[.126,.42,.092],SPHERE,cream,[0,0,side*-.15]);
      mesh(ear,'ear-inner'+key,[0,.27,.081],[.066,.28,.018],SPHERE,'#de9bb0',[0,0,side*-.15]);
    }else{
      mesh(ear,'cat-ear'+key,[0,.06,0],[.205,.258,.2],WEDGE,a.hair,[0,0,Math.PI+side*-.18]);
      mesh(ear,'ear-inner'+key,[0,.073,.055],[.112,.17,.18],WEDGE,a.style==='moon'?'#cdb8d9':'#efb3b0',[0,0,Math.PI+side*-.18]);
    }
    const arm=joint(body,'arm'+key,[side*.27,.42,0]); arm.r[2]=side*.12;arm.baseR[2]=side*.12;
    mesh(arm,'sleeve'+key,[side*.06,-.115,0],[.125,.23,.125],cone(.86,8),a.accent,[0,0,side*.24]);
    const elbow=joint(arm,'elbow'+key,[side*.09,-.25,.02]);
    mesh(elbow,'cuff'+key,[0,-.07,0],[.097,.17,.095],cone(.9,8),cream);
    mesh(elbow,'hand'+key,[0,-.18,.015],[.091,.095,.079],SMALL_SPHERE,skin);
    const leg=joint(body,'leg'+key,[side*.145,-.09,0]);
    mesh(leg,'stocking'+key,[0,-.10,0],[.098,.31,.1],CYLINDER,cream);
    const knee=joint(leg,'knee'+key,[0,-.245,0]);
    mesh(knee,'boot'+key,[0,-.085,.045],[.12,.14,.17],SMALL_SPHERE,dark);
    mesh(knee,'shoe-trim'+key,[0,-.022,.02],[.108,.035,.119],CYLINDER,a.accent);
    const eye=joint(head,'eye'+key,[side*.247,-.065,.597]);
    mesh(eye,'eyeliner'+key,[0,0,0],[.186,.135,1],OVAL,dark,[0,0,side*-.055],true);
    mesh(eye,'sclera'+key,[0,-.012,.002],[.164,.111,1],OVAL,'#fff9ed',[0,0,side*-.055],true);
    const iris=joint(eye,'iris'+key,[side*-.015,-.015,.005]);iris.s[1]=.64;iris.baseS[1]=.64;
    mesh(iris,'iris-color'+key,[0,0,0],[.104,.164,1],OVAL,a.iris,[0,0,0],true);
    mesh(iris,'iris-dark'+key,[0,.024,.001],[.070,.117,1],OVAL,a.shade,[0,0,0],true);
    mesh(iris,'pupil'+key,[0,.033,.002],[.041,.081,1],OVAL,dark,[0,0,0],true);
    mesh(iris,'iris-light'+key,[.016,-.087,.003],[.055,.033,1],OVAL,cream,[0,0,0],true);
    mesh(iris,'glint'+key,[-.038,.077,.004],[.035,.045,1],OVAL,'#ffffff',[0,0,0],true);
    mesh(iris,'glint-tiny'+key,[.041,-.043,.005],[.017,.022,1],OVAL,'#ffffff',[0,0,0],true);
    mesh(eye,'lash'+key,[side*.168,.063,.006],[.055,.026,1],polygon([[-1,-.6],[1,.6],[-1,.6]]),dark,[0,0,side*-.8],true);
    const brow=joint(head,'brow'+key,[side*.247,.23,.585]);
    mesh(brow,'brow-line'+key,[0,0,0],[.129,.021,1],OVAL,a.shade,[0,0,side*.05],true);
    const cheek=joint(head,'cheek'+key,[side*.39,-.275,.541]);
    mesh(cheek,'blush'+key,[0,0,0],[.09,.035,1],OVAL,'#eeafa7',[0,0,0],true);
    const tear=joint(head,'tear'+key,[side*.265,-.26,.616]);
    mesh(tear,'teardrop'+key,[0,-.04,0],[.04,.105,.025],SMALL_SPHERE,'#9fdaef');tear.visible=false;
  }
  const mouth=joint(head,'mouth',[0,-.274,.584]);
  mesh(mouth,'mouth-inside',[0,0,0],[.073,.025,1],OVAL,'#a05a67',[0,0,0],true);
  const tongue=mesh(mouth,'tongue',[0,-.006,.002],[.042,.011,1],OVAL,'#f1a1aa',[0,0,0],true);j.tongue=tongue;
  const smile=joint(head,'smile',[0,-.261,.603]);
  const pts:V3[]=[],idx:number[]=[];
  for(let i=0;i<=12;i++){const x=(i/12-.5)*.16,y=.55*x*x*9;pts.push([x,y,0],[x,y+.017,0]);if(i<12)idx.push(i*2,i*2+2,i*2+1,i*2+1,i*2+2,i*2+3);}
  mesh(smile,'smile-line',[0,0,0],[1,1,1],geometry(pts,idx),'#9a5b63',[0,0,0],true);
  const tail=joint(body,'tail',[0,.1,-.23]);
  const tail1=joint(tail,'tail1',[.16,.0,-.07]);
  mesh(tail1,'tail-base',[.18,.04,-.07],[.27,.083,.083],SMALL_SPHERE,a.hair,[0,0,.28]);
  const tail2=joint(tail1,'tail2',[.37,.09,-.08]);
  mesh(tail2,'tail-tip',[.09,.09,0],[.09,.18,.09],SMALL_SPHERE,cream,[0,0,-.5]);
  const ribbon=joint(head,'ribbon',[.59,.32,.1]);
  for(const s of [-1,1])mesh(ribbon,'bow'+s,[s*.065,0,0],[.087,.095,.057],WEDGE,a.accent,[0,0,s*1.5]);
  mesh(ribbon,'bow-knot',[0,0,.025],[.04,.045,.04],SMALL_SPHERE,'#eabe6d');
  if(a.style==='mage'){
    mesh(body,'cape',[0,.32,-.12],[.365,.56,.13],cone(.58,8),cream);
    const hat=joint(head,'hat',[-.29,.62,-.05]);hat.baseR[2]=.24;hat.r[2]=.24;
    mesh(hat,'hat-brim',[0,0,0],[.34,.048,.26],CYLINDER,a.accent);
    mesh(hat,'hat-crown',[0,.19,0],[.22,.4,.18],cone(.04,7),a.accent);
    mesh(hat,'hat-band',[0,.06,.0],[.213,.07,.172],cone(.9,7),'#eabe6d');
  }
  if(a.style==='scout'||a.style==='pilot'){
    mesh(body,'scarf',[0,.53,.02],[.27,.09,.21],CYLINDER,cream);
    mesh(body,'scarf-end',[.18,.26,.206],[.075,.24,.023],WEDGE,cream,[0,0,-.24]);
    mesh(body,'satchel',[-.24,.06,.16],[.13,.12,.08],SMALL_SPHERE,a.shade);
    for(const s of [-1,1]){
      mesh(head,'goggle-rim'+s,[s*.17,.49,.443],[.133,.093,.035],SMALL_SPHERE,'#eabe6d');
      mesh(head,'goggle-glass'+s,[s*.17,.494,.473],[.103,.069,.019],SMALL_SPHERE,a.style==='pilot'?'#94cbe1':'#b6ded1');
    }
  }
  if(a.style==='moon'){
    mesh(body,'cape',[0,.32,-.14],[.38,.59,.17],cone(.55,9),a.accent);
    mesh(head,'moon-pin',[-.43,.31,.526],[.073,.075,.015],SMALL_SPHERE,'#eabe6d');
    mesh(head,'moon-cut',[-.411,.337,.543],[.06,.061,.017],SMALL_SPHERE,a.hair);
  }
  if(a.style==='bunny'){
    for(let k=0;k<5;k++){const t=k/5*6.28;mesh(head,'petal'+k,[-.43+Math.cos(t)*.064,.35+Math.sin(t)*.064,.547],[.052,.052,.018],SMALL_SPHERE,cream);}
    mesh(head,'flower-center',[-.43,.35,.571],[.04,.04,.024],SMALL_SPHERE,'#eac97b');
  }
  let triangles=0;visit(root,n=>{if(n.mesh)triangles+=n.mesh.positions.length/9;});
  return {root,joints:j,face:face(),triangles,avatar:a};
}
export function speakingMouth(phase:string,level:number,preview=false):number{
  if(phase!=='speaking'&&!preview)return 0;
  return Math.max(0,Math.min(1,Number.isFinite(level)?level:0));
}
export function poseRig(rig:ChibiRig,time:number,dt:number,emotion='idle',motion:Motion='auto',mouthLevel=0,intensity=1,reduced=false):void {
  const target=FACES[emotion]||FACES.idle,blend=1-Math.exp(-Math.min(.1,Math.max(0,Number.isFinite(dt)?dt:0))*10);
  const strength=Math.max(0,Math.min(1,Number.isFinite(intensity)?intensity:1));
  mouthLevel=Math.max(0,Math.min(1,Number.isFinite(mouthLevel)?mouthLevel:0));
  time=Number.isFinite(time)?time:0;
  for(const key of Object.keys(target) as (keyof FacePose)[]){const value=FACES.idle[key]+(target[key]-FACES.idle[key])*strength;rig.face[key]+=(value-rig.face[key])*blend;}
  const f=rig.face,j=rig.joints,t=time,move=reduced?0:1;
  const previous=Object.fromEntries(Object.entries(j).map(([k,n])=>[k,{p:[...n.p],r:[...n.r],s:[...n.s]}]));
  visit(rig.root,n=>{n.p=[...n.baseP];n.r=[...n.baseR];n.s=[...n.baseS];});
  const bounce=motion==='bounce'||motion==='celebrate'?Math.abs(Math.sin(t*5))*.14:Math.sin(t*2.4)*.014;
  j.hips.p[1]+=(bounce+Math.sin(t*3)*f.energy*.012)*move;
  j.hips.r[2]=Math.sin(t*1.4)*.025*move;
  j.head.r[2]=f.tilt+Math.sin(t*1.3)*.035*move;
  j.head.r[1]=Math.sin(t*.7)*.055*move;
  j.head.r[0]=(emotion==='sad'||emotion==='sleepy'? .10:0)+Math.sin(t*1.9)*.017*move;
  if(motion==='nod')j.head.r[0]=Math.sin(t*4)*.18*move;
  if(motion==='sleep'){j.head.r[2]=.15;j.head.r[0]=.14;}
  const blinkPhase=t%4.7,blink=reduced?1:blinkPhase>4.48?Math.max(.035,Math.abs(blinkPhase-4.59)/.11):1;
  for(const side of [-1,1]){
    const k=side<0?'L':'R';
    j['ear'+k].r[2]=side*(.035+Math.sin(t*2.3+side)*.055*move)-(f.brow>0?.13:0)*side;
    j['hair'+k].r[2]=Math.sin(t*2.1+side)*.026*move;
    const wink=k==='R'?1-f.wink*.97:1;
    j['eye'+k].s[1]=Math.max(.035,(motion==='sleep'?.055:f.eye)*blink*wink);
    j['iris'+k].p[0]+=Math.sin(t*.7)*.009*move;
    j['brow'+k].r[2]=side*f.brow*.7;
    j['brow'+k].p[1]+=(1-f.eye)*.024;
    j['cheek'+k].s=[.7+f.blush*.7,.7+f.blush*.7,1];
    j['tear'+k].visible=f.tear>.1;j['tear'+k].p[1]-=(t*.35% .12)*move;
    j['arm'+k].r[0]=Math.sin(t*2+side)*.07*move;
    j['arm'+k].r[2]=side*(.14+f.energy*.10);
    if(motion==='celebrate'){j['arm'+k].r[2]=side*2.45;j['elbow'+k].r[2]=side*.25*Math.sin(t*5)*move;}
    if(motion==='dance'){j['arm'+k].r[2]=side*(.65+Math.sin(t*4)*.45)*move;j['leg'+k].r[0]=Math.sin(t*4+side)*.25*move;j.hips.r[1]=Math.sin(t*4)*.2*move;}
  }
  if(motion==='wave'){j.armL.r[2]=-2.1;j.elbowL.r[2]=-.45+Math.sin(t*7)*.32*move;}
  j.tail.r[1]=Math.sin(t*2.4)*.35*move;j.tail1.r[2]=Math.sin(t*2.4)*.13*move;j.tail2.r[2]=Math.sin(t*2.4-.5)*.18*move;
  j.ribbon.r[2]=Math.sin(t*2.6)*.075*move;
  j.mouth.s[1]=1+Math.max(f.mouth*.6,mouthLevel)*4.8;
  j.mouth.s[0]=1+Math.max(0,f.smile)*.18;
  j.smile.s[1]=f.smile>=0?Math.max(.1,f.smile):f.smile;
  j.smile.p[1]+=.024*Math.max(f.mouth,mouthLevel);
  for(const [k,n] of Object.entries(j)){const prev=previous[k];for(let i=0;i<3;i++){n.p[i]=prev.p[i]+(n.p[i]-prev.p[i])*blend;n.r[i]=prev.r[i]+(n.r[i]-prev.r[i])*blend;n.s[i]=prev.s[i]+(n.s[i]-prev.s[i])*blend;}}
}
export function rigStats(rig:ChibiRig){let meshes=0,nodes=0;visit(rig.root,n=>{nodes++;if(n.mesh)meshes++;});return {triangles:rig.triangles,meshes,nodes,joints:Object.keys(rig.joints).length};}

/** Shared by chat and transcribed speech. Does not send extra model turns. */
export function dialogueMotion(text:string):Motion|undefined {
  if(/wave|\uc190.*\ud754|\uc548\ub155/i.test(text))return 'wave';
  if(/dance|\ucda4/i.test(text))return 'dance';
  if(/\ub044\ub355|nod/i.test(text))return 'nod';
  return undefined;
}

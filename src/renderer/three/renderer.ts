import {createChibi,part,cone,polygon,identity,multiply,matrix,transform,poseRig,rigStats,type ChibiRig,type Part,type Geometry,type V3,type M4,type Motion} from './rig';

export interface FrameState {emotion:string;intensity:number;motion:Motion;mouth:number;wireframe:boolean;skeleton:boolean;reduced:boolean;}
export interface RenderStats {triangles:number;meshes:number;nodes:number;joints:number;drawCalls:number;}
const VERTEX=`attribute vec3 aPosition;attribute vec3 aNormal;uniform mat4 uWorld;uniform mat4 uCamera;varying vec3 vNormal;void main(){mat3 w=mat3(uWorld);vec3 invScale=vec3(1.0/max(dot(w[0],w[0]),0.000001),1.0/max(dot(w[1],w[1]),0.000001),1.0/max(dot(w[2],w[2]),0.000001));vNormal=w*(aNormal*invScale);gl_Position=uCamera*uWorld*vec4(aPosition,1.0);}`;
const FRAGMENT=`precision mediump float;uniform vec4 uColor;uniform float uUnlit;varying vec3 vNormal;void main(){float d=max(0.0,dot(normalize(vNormal),normalize(vec3(-0.5,0.85,1.0))));float light=0.70+0.30*smoothstep(0.12,0.85,d);gl_FragColor=vec4(uColor.rgb*mix(light,1.0,uUnlit),uColor.a);}`;
function color(hex:string):Float32Array {const h=hex.replace('#','');return new Float32Array([parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255,h.length===8?parseInt(h.slice(6,8),16)/255:1]);}
function ortho(left:number,right:number,bottom:number,top:number,near:number,far:number):M4 {return new Float32Array([2/(right-left),0,0,0,0,2/(top-bottom),0,0,0,0,-2/(far-near),0,-(right+left)/(right-left),-(top+bottom)/(top-bottom),-(far+near)/(far-near),1]);}
function lookAt(eye:V3,at:V3):M4 {
  const norm=(v:V3):V3=>{const n=Math.hypot(...v)||1;return v.map(q=>q/n) as V3;};
  const cross=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const z=norm(eye.map((v,i)=>v-at[i]) as V3),x=norm(cross([0,1,0],z)),y=cross(z,x),dot=(a:V3,b:V3)=>a.reduce((s,v,i)=>s+v*b[i],0);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
export class ChibiRenderer {
  readonly gl:WebGLRenderingContext;
  rig:ChibiRig;
  private program:WebGLProgram;
  private buffers=new Map<Geometry,{position:WebGLBuffer;normal:WebGLBuffer;wire:WebGLBuffer;count:number}>();
  private colors=new Map<string,Float32Array>();
  private observer:ResizeObserver;
  private listeners:Array<()=>void>=[];
  private worldLocation:WebGLUniformLocation|null;
  private cameraLocation:WebGLUniformLocation|null;
  private colorLocation:WebGLUniformLocation|null;
  private unlitLocation:WebGLUniformLocation|null;
  private positionLocation:number;
  private normalLocation:number;
  private ground:Part;
  private lineBuffer:WebGLBuffer;
  private destroyed=false;
  private contextLost=false;
  yaw=.16; elevation=.08; zoom=1;
  constructor(readonly canvas:HTMLCanvasElement,id:string){
    const gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
    if(!gl)throw new Error('WebGL is unavailable. Enable browser hardware acceleration or use the 2D mode.');
    this.gl=gl;this.rig=createChibi(id);
    const shader=(type:number,source:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader failed');return s;};
    const v=shader(gl.VERTEX_SHADER,VERTEX),f=shader(gl.FRAGMENT_SHADER,FRAGMENT),p=gl.createProgram()!;gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'WebGL link failed');
    this.program=p;gl.useProgram(p);
    this.positionLocation=gl.getAttribLocation(p,'aPosition');this.normalLocation=gl.getAttribLocation(p,'aNormal');
    this.worldLocation=gl.getUniformLocation(p,'uWorld');this.cameraLocation=gl.getUniformLocation(p,'uCamera');this.colorLocation=gl.getUniformLocation(p,'uColor');this.unlitLocation=gl.getUniformLocation(p,'uUnlit');
    this.lineBuffer=gl.createBuffer()!;
    this.ground=part('stage');
    this.ground.children.push(part('pedestal',[0,-.105,0],[.95,.14,.73],cone(.97,64),'#eee7dc'));
    this.ground.children.push(part('top',[0,-.031,0],[.92,.005,.70],cone(1,64),'#fbf6ec'));
    const disk=polygon(Array.from({length:40},(_,i)=>[Math.cos(i/40*Math.PI*2),Math.sin(i/40*Math.PI*2)]));
    this.ground.children.push(part('shadow',[0,-.023,0],[.44,.27,1],disk,'#d7ccc6',[-Math.PI/2,0,0],true));
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
    let pointer:number|undefined,startX=0,startY=0,oldYaw=0,oldElevation=0;
    const bind=(name:string,fn:EventListener)=>{canvas.addEventListener(name,fn);this.listeners.push(()=>canvas.removeEventListener(name,fn));};
    bind('pointerdown',(e)=>{const p=e as PointerEvent;pointer=p.pointerId;startX=p.clientX;startY=p.clientY;oldYaw=this.yaw;oldElevation=this.elevation;canvas.setPointerCapture(p.pointerId);});
    bind('pointermove',(e)=>{const p=e as PointerEvent;if(p.pointerId!==pointer)return;this.yaw=oldYaw+(p.clientX-startX)*.008;this.elevation=Math.max(-.12,Math.min(.55,oldElevation+(p.clientY-startY)*.004));});
    bind('pointerup',()=>{pointer=undefined;});bind('pointercancel',()=>{pointer=undefined;});
    bind('wheel',(e)=>{e.preventDefault();this.zoom=Math.max(.72,Math.min(1.35,this.zoom-(e as WheelEvent).deltaY*.001));});
    bind('dblclick',()=>this.resetCamera());
    bind('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;canvas.dataset.context='lost';});
    bind('webglcontextrestored',()=>{canvas.dataset.context='restored-reload-required';});
  }
  resetCamera(){this.yaw=.16;this.elevation=.08;this.zoom=1;}
  resize(){const dpr=Math.min(window.devicePixelRatio||1,1.5),w=Math.max(1,this.canvas.clientWidth),h=Math.max(1,this.canvas.clientHeight);this.canvas.width=Math.round(w*dpr);this.canvas.height=Math.round(h*dpr);this.gl.viewport(0,0,this.canvas.width,this.canvas.height);}
  setAvatar(id:string){this.releaseBuffers();this.rig=createChibi(id);}
  private releaseBuffers(){for(const b of this.buffers.values()){this.gl.deleteBuffer(b.position);this.gl.deleteBuffer(b.normal);this.gl.deleteBuffer(b.wire);}this.buffers.clear();}
  private upload(g:Geometry){let b=this.buffers.get(g);if(b)return b;const gl=this.gl;
    const buffer=(array:Float32Array)=>{const b=gl.createBuffer()!;gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW);return b;};
    const wire:number[]=[];for(let i=0;i<g.positions.length;i+=9){const a=Array.from(g.positions.slice(i,i+3)),b=Array.from(g.positions.slice(i+3,i+6)),c=Array.from(g.positions.slice(i+6,i+9));wire.push(...a,...b,...b,...c,...c,...a);}
    b={position:buffer(g.positions),normal:buffer(g.normals),wire:buffer(Float32Array.from(wire)),count:g.positions.length/3};this.buffers.set(g,b);return b;
  }
  render(time:number,dt:number,state:FrameState):RenderStats {
    const stats={...rigStats(this.rig),drawCalls:0};if(this.destroyed||this.contextLost)return stats;
    poseRig(this.rig,time,dt,state.emotion,state.motion,state.mouth,state.intensity,state.reduced);
    const gl=this.gl;gl.useProgram(this.program);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    const aspect=this.canvas.width/this.canvas.height,span=1.64/this.zoom;
    const view=lookAt([Math.sin(this.yaw)*6,1.43+Math.sin(this.elevation)*6,Math.cos(this.yaw)*6],[0,1.43,0]);
    gl.uniformMatrix4fv(this.cameraLocation,false,multiply(ortho(-span*aspect,span*aspect,-span,span,.1,30),view));
    const jointPositions=new Map<Part,V3>();
    const draw=(n:Part,parent:M4,wire=false)=>{
      if(!n.visible)return;
      const world=multiply(parent,matrix(n.p,n.r,n.s));jointPositions.set(n,transform(world,[0,0,0]));
      if(n.mesh){const b=this.upload(n.mesh),hex=wire?'#55566c':n.color||'#ffffff';if(!this.colors.has(hex))this.colors.set(hex,color(hex));
        gl.uniformMatrix4fv(this.worldLocation,false,world);gl.uniform4fv(this.colorLocation,this.colors.get(hex)!);gl.uniform1f(this.unlitLocation,n.unlit||wire?1:0);
        gl.bindBuffer(gl.ARRAY_BUFFER,wire?b.wire:b.position);gl.enableVertexAttribArray(this.positionLocation);gl.vertexAttribPointer(this.positionLocation,3,gl.FLOAT,false,0,0);
        if(wire){gl.disableVertexAttribArray(this.normalLocation);gl.vertexAttrib3f(this.normalLocation,0,0,1);}else{gl.bindBuffer(gl.ARRAY_BUFFER,b.normal);gl.enableVertexAttribArray(this.normalLocation);gl.vertexAttribPointer(this.normalLocation,3,gl.FLOAT,false,0,0);}
        gl.drawArrays(wire?gl.LINES:gl.TRIANGLES,0,b.count*(wire?2:1));stats.drawCalls++;
      }
      for(const c of n.children)draw(c,world,wire);
    };
    draw(this.ground,identity());draw(this.rig.root,identity(),state.wireframe);
    if(state.skeleton){
      const lines:number[]=[];const nodes=new Set(Object.values(this.rig.joints));
      const walk=(n:Part,last?:V3)=>{const pos=jointPositions.get(n);const isJoint=nodes.has(n);if(isJoint&&pos&&last)lines.push(...last,...pos);for(const c of n.children)walk(c,isJoint&&pos?pos:last);};walk(this.rig.root);
      gl.disable(gl.DEPTH_TEST);gl.uniformMatrix4fv(this.worldLocation,false,identity());gl.uniform4fv(this.colorLocation,color('#fa806c'));gl.uniform1f(this.unlitLocation,1);gl.bindBuffer(gl.ARRAY_BUFFER,this.lineBuffer);gl.bufferData(gl.ARRAY_BUFFER,Float32Array.from(lines),gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(this.positionLocation);gl.vertexAttribPointer(this.positionLocation,3,gl.FLOAT,false,0,0);gl.disableVertexAttribArray(this.normalLocation);gl.vertexAttrib3f(this.normalLocation,0,0,1);gl.drawArrays(gl.LINES,0,lines.length/3);stats.drawCalls++;
    }
    return stats;
  }
  destroy(){if(this.destroyed)return;this.destroyed=true;this.observer.disconnect();this.listeners.forEach(fn=>fn());this.releaseBuffers();this.gl.deleteBuffer(this.lineBuffer);this.gl.deleteProgram(this.program);}
}
/** Export editable mesh/joint hierarchy as glTF 2.0, not a screenshot. */
export function exportGltf(rig:ChibiRig):string {
  const nodes:any[]=[],meshes:any[]=[],materials:any[]=[],views:any[]=[],accessors:any[]=[],chunks:Uint8Array[]=[];let length=0;
  const materialIds=new Map<string,number>();
  const attribute=(a:Float32Array)=>{const bytes=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);const offset=length;chunks.push(bytes);length+=bytes.length;const v=views.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target:34962})-1;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i++) {const k=i%3;min[k]=Math.min(min[k],a[i]);max[k]=Math.max(max[k],a[i]);}return accessors.push({bufferView:v,componentType:5126,count:a.length/3,type:'VEC3',min,max})-1;};
  const quaternion=(r:V3)=>{const [x,y,z]=r.map(v=>v/2),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);return [sx*cy*cz-cx*sy*sz,cx*sy*cz+sx*cy*sz,cx*cy*sz-sx*sy*cz,cx*cy*cz+sx*sy*sz];};
  const addNode=(p:Part):number=>{const node:any={name:p.name,translation:p.p,rotation:quaternion(p.r),scale:p.s};const index=nodes.push(node)-1;
    if(p.mesh){const hex=p.color||'#ffffff',key=hex+':'+Boolean(p.unlit);if(!materialIds.has(key)){materialIds.set(key,materials.length);materials.push({name:hex,pbrMetallicRoughness:{baseColorFactor:Array.from(color(hex)),metallicFactor:0,roughnessFactor:1},doubleSided:true,...(p.unlit?{extensions:{KHR_materials_unlit:{}}}:{})});}
      node.mesh=meshes.push({name:p.name,primitives:[{attributes:{POSITION:attribute(p.mesh.positions),NORMAL:attribute(p.mesh.normals)},material:materialIds.get(key)}]})-1;
    }node.children=p.children.filter(c=>c.visible).map(addNode);return index;};addNode(rig.root);
  const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return JSON.stringify({asset:{version:'2.0',generator:'DeskPet original low-poly rigid-joint rig'},scene:0,scenes:[{nodes:[0]}],nodes,meshes,materials,accessors,bufferViews:views,buffers:[{byteLength:length,uri:'data:application/octet-stream;base64,'+btoa(binary)}],extensionsUsed:['KHR_materials_unlit'],extras:{rigType:'hierarchical-rigid',jointNames:Object.keys(rig.joints),note:'Motion and expression controller source is rig.ts. No weighted skin or baked animation clips in this snapshot export.'}});
}

/** Real 3D projection fallback for browsers with WebGL disabled. No static images. */
export class SoftwareChibiRenderer {
  rig:ChibiRig; yaw=.16;elevation=.08;zoom=1;
  private context:CanvasRenderingContext2D;
  private observer:ResizeObserver;
  private listeners:Array<()=>void>=[];
  constructor(readonly canvas:HTMLCanvasElement,id:string){
    const context=canvas.getContext('2d');if(!context)throw new Error('Neither WebGL nor Canvas is available');this.context=context;this.rig=createChibi(id);canvas.dataset.renderer='software';
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
    let active=false,x=0,start=0;
    const bind=(type:string,fn:EventListener)=>{canvas.addEventListener(type,fn);this.listeners.push(()=>canvas.removeEventListener(type,fn));};
    bind('pointerdown',e=>{active=true;x=(e as PointerEvent).clientX;start=this.yaw;canvas.setPointerCapture((e as PointerEvent).pointerId);});
    bind('pointermove',e=>{if(active)this.yaw=start+((e as PointerEvent).clientX-x)*.008;});
    bind('pointerup',()=>{active=false;});bind('pointercancel',()=>{active=false;});bind('dblclick',()=>this.resetCamera());
  }
  resize(){this.canvas.width=Math.max(1,Math.round(this.canvas.clientWidth));this.canvas.height=Math.max(1,Math.round(this.canvas.clientHeight));}
  resetCamera(){this.yaw=.16;this.elevation=.08;this.zoom=1;}
  setAvatar(id:string){this.rig=createChibi(id);}
  render(time:number,dt:number,state:FrameState):RenderStats{
    poseRig(this.rig,time,dt,state.emotion,state.motion,state.mouth,state.intensity,state.reduced);
    const ctx=this.context,w=this.canvas.width,h=this.canvas.height,span=1.64/this.zoom;
    const view=lookAt([Math.sin(this.yaw)*6,1.43+Math.sin(this.elevation)*6,Math.cos(this.yaw)*6],[0,1.43,0]);
    const projected=(v:V3):V3=>{const p=transform(view,v);return [w/2+p[0]*h/(2*span),h/2-p[1]*h/(2*span),p[2]];};
    type Triangle={points:V3[];z:number;fill:string};const triangles:Triangle[]=[];const joints=new Map<Part,V3>();
    const draw=(n:Part,parent:M4)=>{
      if(!n.visible)return;const world=multiply(parent,matrix(n.p,n.r,n.s));joints.set(n,projected(transform(world,[0,0,0])));
      if(n.mesh){const m=n.mesh,c=color(n.color||'#ffffff');for(let i=0;i<m.positions.length;i+=9){const points:V3[]=[];for(let k=0;k<3;k++)points.push(projected(transform(world,[m.positions[i+k*3],m.positions[i+k*3+1],m.positions[i+k*3+2]])));
        const area=(points[1][0]-points[0][0])*(points[2][1]-points[0][1])-(points[1][1]-points[0][1])*(points[2][0]-points[0][0]);if(area>=0&&!n.unlit)continue;
        const normal=transform(matrix([0,0,0],n.r),[m.normals[i],m.normals[i+1],m.normals[i+2]]);const d=Math.max(0,(-.5*normal[0]+.85*normal[1]+normal[2])/1.405),l=n.unlit?1:.70+.30*Math.max(0,Math.min(1,(d-.12)/.73));
        triangles.push({points,z:points.reduce((s,p)=>s+p[2],0)/3,fill:`rgb(${Math.round(c[0]*l*255)},${Math.round(c[1]*l*255)},${Math.round(c[2]*l*255)})`});
      }}n.children.forEach(c=>draw(c,world));};draw(this.rig.root,identity());
    ctx.clearRect(0,0,w,h);const base=projected([0,-.01,0]);ctx.fillStyle='#e8dfd3';ctx.beginPath();ctx.ellipse(base[0],base[1],h*.24,h*.045,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d0c8c1';ctx.beginPath();ctx.ellipse(base[0],base[1]-2,h*.1,h*.02,0,0,Math.PI*2);ctx.fill();
    triangles.sort((a,b)=>a.z-b.z);for(const f of triangles){ctx.beginPath();f.points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=f.fill;ctx.strokeStyle=state.wireframe?'#686177':f.fill;ctx.lineWidth=state.wireframe?.6:.5;if(!state.wireframe)ctx.fill();ctx.stroke();}
    if(state.skeleton){ctx.strokeStyle='#f17f75';ctx.lineWidth=2;const set=new Set(Object.values(this.rig.joints));const walk=(n:Part,parent?:V3)=>{const p=joints.get(n),joint=set.has(n);if(joint&&p&&parent){ctx.beginPath();ctx.moveTo(parent[0],parent[1]);ctx.lineTo(p[0],p[1]);ctx.stroke();}n.children.forEach(c=>walk(c,joint&&p?p:parent));};walk(this.rig.root);}
    return {...rigStats(this.rig),drawCalls:triangles.length};
  }
  destroy(){this.observer.disconnect();this.listeners.forEach(fn=>fn());}
}
export function createRenderer(canvas:HTMLCanvasElement,id:string):ChibiRenderer|SoftwareChibiRenderer{
  if(canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'})){canvas.dataset.renderer='webgl';return new ChibiRenderer(canvas,id);}
  return new SoftwareChibiRenderer(canvas,id);
}

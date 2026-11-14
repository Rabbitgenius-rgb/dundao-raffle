import * as THREE from './vendor/three.module.js';
import { getTier } from './game.mjs';
import { DISTINCT_EFFECT_ROUTES, createRouteMotif } from './route-effects.mjs';

const STYLES={
  lava:{color:0xff913e,light:0xffda83,speed:.13,nodes:8},
  frost:{color:0x6ad8ff,light:0xc9f5ff,speed:-.10,nodes:6},
  storm:{color:0xbb86ff,light:0xc8f1ff,speed:.17,nodes:8},
  bone:{color:0xd7b1fa,light:0xffedda,speed:-.08,nodes:7},
  vine:{color:0xa5d748,light:0xffd978,speed:.09,nodes:6},
  carapace:{color:0xffbd59,light:0xcb97ee,speed:-.12,nodes:6},
  star:{color:0xf1c96e,light:0xc9e6ff,speed:.12,nodes:6},
  clockwork:{color:0xe5a35b,light:0xffdc99,speed:.12,nodes:8},
  holy:{color:0xf4d389,light:0xfffae5,speed:.10,nodes:8},
  ocean:{color:0x54ded3,light:0xc4fff1,speed:-.10,nodes:6},
  ghost:{color:0x55edb8,light:0xb6ffe1,speed:-.10,nodes:6},
  desert:{color:0xe9bc72,light:0xffe5a1,speed:.09,nodes:6},
};
const COUNTS=[2,4,10,14,20,28,40];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// All magic lives outside the collidable sword. No gameplay randomness is used.
export class BladeEffects {
  constructor(parent,motion,camera=null){
    this.root=new THREE.Group();this.root.name='blade-magic';parent.add(this.root);
    this.motion=motion;this.camera=camera;this.materials=new Map();this.geometries=new Set();
    this.pixelGeometry=new THREE.BoxGeometry(1,1,1);
    this.shardGeometry=new THREE.OctahedronGeometry(1,0);
    this.matrix=new THREE.Matrix4();this.position=new THREE.Vector3();
    this.rotation=new THREE.Quaternion();this.euler=new THREE.Euler();this.scale=new THREE.Vector3();
    this.parentRotation=new THREE.Quaternion();this.cameraRotation=new THREE.Quaternion();this.cameraOffset=new THREE.Vector3();
    this.signature='';this.clockOffset=0;this.transition=null;
    this.rings=[];
  }
  material(color,opacity=1,side=THREE.FrontSide){
    const key=color+'-'+opacity+'-'+side;
    if(!this.materials.has(key))this.materials.set(key,new THREE.MeshBasicMaterial({
      color,transparent:true,opacity,depthWrite:false,toneMapped:false,fog:false,side,
    }));
    return this.materials.get(key);
  }
  lines(points,color,opacity=.8){
    // World-space strips remain readable when a high-DPI canvas is downsampled;
    // WebGL's one-device-pixel line width nearly vanished in the atlas cards.
    const stripGeometry=half=>{
      const positions=[],indices=[];
      for(let i=0;i<points.length;i+=2){
        const a=points[i],b=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1];
        const length=Math.hypot(dx,dy)||1;
        const nx=-dy/length*half,ny=dx/length*half,n=positions.length/3;
        positions.push(a[0]+nx,a[1]+ny,a[2],a[0]-nx,a[1]-ny,a[2],b[0]+nx,b[1]+ny,b[2],b[0]-nx,b[1]-ny,b[2]);
        indices.push(n,n+1,n+2,n+2,n+1,n+3);
      }
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
      this.geometries.add(geometry);return geometry;
    };
    const geometry=stripGeometry(.008);
    const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,fog:false});
    const line=new THREE.Mesh(geometry,material);line.userData.ownedMaterial=true;
    const glow=new THREE.Mesh(stripGeometry(.027),new THREE.MeshBasicMaterial({color,transparent:true,opacity:opacity*.15,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide,fog:false}));
    glow.userData.ownedMaterial=true;line.add(glow);
    return line;
  }
  ring(radius,{color,opacity=.75,arc=Math.PI*2,runes=false,outer=false}={}){
    const group=new THREE.Group(),points=[];
    const segment=(a,b)=>points.push(a,b);
    const pt=(a,r=radius)=>[Math.cos(a)*r,Math.sin(a)*r,0];
    const steps=144;
    for(let i=0;i<steps;i++){
      if(outer&&i%6===0)continue;
      const a=i/steps*arc,b=(i+.96)/steps*arc;
      segment(pt(a),pt(b));
      if(runes&&i%12<7)segment(pt(a,radius*.955),pt(b,radius*.955));
    }
    if(runes){
      for(let i=0;i<this.style.nodes;i++){
        const a=i/this.style.nodes*Math.PI*2;
        const c=pt(a),s=.065;
        const corners=this.route==='frost'||this.route==='carapace'?6:4;
        for(let k=0;k<corners;k++){
          const p=k/corners*Math.PI*2,q=(k+1)/corners*Math.PI*2;
          segment([c[0]+Math.cos(p)*s,c[1]+Math.sin(p)*s,0],[c[0]+Math.cos(q)*s,c[1]+Math.sin(q)*s,0]);
        }
        // Tiny angular inscription, distinct from the larger perimeter nodes.
        for(let k=0;k<3;k++){
          const angle=a+.15+k*.045;
          segment(pt(angle,radius*.98),pt(angle+.018,radius*.90));
          segment(pt(angle+.018,radius*.90),pt(angle+.036,radius*.94));
        }
      }
    }
    group.add(this.lines(points,color,opacity));
    group.userData.baseRadius=radius;return group;
  }
  clearState(){
    this.root.traverse(o=>{
      if(o.isInstancedMesh)o.dispose();
      if(o.userData.ownedMaterial)o.material.dispose();
    });
    for(const geometry of this.geometries)geometry.dispose();
    this.geometries.clear();this.root.clear();this.rings=[];
    this.particles=null;this.halo=null;this.orbit=null;this.arc=null;this.sweep=null;this.shock=null;this.motif=null;
  }
  setState(state,mode,meta={}){
    this.state=state;this.mode=mode;
    const level=getTier(state.score).level;
    const extent=meta.bounds?.max?.[1]||5.3;
    const width=Math.max(.45,(meta.bounds?.max?.[0]||.4)-(meta.bounds?.min?.[0]||-.4));
    const signature=(state.route||'none')+'-'+level+'-'+mode+'-'+extent.toFixed(1)+'-'+width.toFixed(1);
    this.extent=extent;this.width=width;
    if(signature===this.signature)return;
    this.clearState();this.signature=signature;this.level=level;this.route=state.route;
    this.root.userData={quality:level,particleCount:0,ringCount:0,orbitalCount:0};
    if(!state.route||!state.hits){this.transition=null;return;}
    this.style=STYLES[state.route];
    const bladeLength=Math.max(1.3,extent-1.2);
    this.centerY=1.2+bladeLength*.40;
    this.radius=clamp(bladeLength*.28,.58,1.33);
    const count=COUNTS[level];
    const shard=['vine','frost','carapace','star','ocean'].includes(state.route);
    this.particles=new THREE.InstancedMesh(shard?this.shardGeometry:this.pixelGeometry,this.material(0xffffff,.88),count);
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particles.frustumCulled=false;this.particles.name='route-particles';
    const color=new THREE.Color();
    for(let i=0;i<count;i++)this.particles.setColorAt(i,color.setHex(i%4===0?this.style.light:this.style.color));
    this.root.add(this.particles);this.root.userData.particleCount=count;
    if(level>=3&&!DISTINCT_EFFECT_ROUTES.has(state.route)){
      this.halo=new THREE.Group();this.halo.name='rune-halo';this.root.add(this.halo);
      // Behind an upright sword; above the anvil while forging so its rim stays visible.
      this.halo.position.set(0,this.centerY,mode==='forge'?.30:-.42);
      const main=this.ring(this.radius,{color:this.style.color,arc:level===3?Math.PI*1.22:Math.PI*2,runes:level>=4});
      main.rotation.z=.22;this.halo.add(main);this.rings.push({group:main,speed:this.style.speed});
      this.root.userData.ringCount=1;
      if(level===6){
        const second=this.ring(this.radius*1.17,{color:this.style.light,opacity:.66,runes:true,outer:true});
        second.rotation.y=.20;this.halo.add(second);this.rings.push({group:second,speed:-this.style.speed*.66});
        this.root.userData.ringCount=2;
      }
      if(level>=5){
        this.orbit=this.ring(this.radius*1.12,{color:this.style.light,opacity:level===6?.40:.62,arc:Math.PI*1.7,outer:level===6});
        this.orbit.rotation.set(.95,.38,.3);this.halo.add(this.orbit);
        this.root.userData.orbitalCount=1;
      }
    }
    if(DISTINCT_EFFECT_ROUTES.has(state.route)){
      this.motif=createRouteMotif(this,{route:state.route,level,mode,centerY:this.centerY,width});
      this.root.userData.motif=this.motif?.root.name||null;
    }
    if(state.route==='storm'){
      const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(48),3));
      this.geometries.add(geometry);
      this.arc=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:this.style.light,transparent:true,opacity:.68,depthWrite:false,toneMapped:false,fog:false}));
      this.arc.userData.ownedMaterial=true;this.root.add(this.arc);
    }
    this.sweep=new THREE.Mesh(this.pixelGeometry,this.material(this.style.light,.65));
    this.sweep.scale.set(Math.min(width*1.1,1.7),.018,.018);this.sweep.position.z=.48;this.sweep.visible=false;this.root.add(this.sweep);
    this.shock=this.ring(.5,{color:this.style.light,opacity:.8});
    this.shock.position.set(0,this.centerY,.48);this.shock.visible=false;this.root.add(this.shock);
    this.update(performance.now()/1000);
  }
  play(event,{up=false,down=false}={}){
    this.transition={start:performance.now()/1000-this.clockOffset,kind:event.kind,up,down};
  }
  resume(pauseSeconds){this.clockOffset+=pauseSeconds;}
  update(time){
    if(!this.state?.route||!this.particles)return 0;
    const still=this.motion.matches;
    const clock=time-this.clockOffset,t=still?0:clock;
    const bladeLength=Math.max(1.3,this.extent-1.2);
    for(let i=0;i<this.particles.count;i++){
      const phase=i*2.39996;
      let x,y,z;
      const spread=Math.max(.32,this.width*.55);
      if(this.route==='lava'){
        const rise=(t*.22+i*.137)%1;
        x=Math.sin(phase+t*.25)*(spread+.13);y=1.2+rise*bladeLength;z=.25+Math.cos(phase)*.35;
      }else if(this.route==='vine'){
        x=Math.sin(t*.45+phase)*(spread+.2);y=1.25+((i*.37+t*.12)%bladeLength);z=Math.cos(t*.35+phase)*.48;
      }else if(this.route==='bone'){
        x=Math.cos(t*.28+phase)*(spread+.15);y=1.4+(i*.41%bladeLength)+Math.sin(t*.6+phase)*.09;z=Math.sin(t*.28+phase)*.4;
      }else if(this.route==='carapace'){
        x=Math.cos(phase+t*.3)*(spread+.12);y=this.centerY+Math.sin(phase+t*.3)*bladeLength*.4;z=.25+Math.sin(t+i)*.15;
      }else{
        x=Math.cos(t*.25+phase)*(spread+.16);y=1.35+(i*.43%bladeLength)+Math.sin(t+phase)*.06;z=Math.sin(t*.25+phase)*.4;
      }
      const s=.022+(i%3)*.009+(this.level===6?.008:0);
      this.position.set(x,y,z);
      this.scale.set(s,this.route==='vine'?s*1.9:s*1.25,this.route==='vine'?s*.42:s);
      this.euler.set(t*.5+phase,t*.3,t*.4+phase);this.rotation.setFromEuler(this.euler);
      this.matrix.compose(this.position,this.rotation,this.scale);this.particles.setMatrixAt(i,this.matrix);
    }
    this.particles.instanceMatrix.needsUpdate=true;
    // Display new-route motifs toward the viewer during the rotating result.
    // While forging, they remain aligned to the blade lying on the anvil.
    if(this.motif&&this.camera&&this.mode==='result'){
      this.root.getWorldQuaternion(this.parentRotation).invert();
      this.camera.getWorldQuaternion(this.cameraRotation);
      this.motif.root.quaternion.copy(this.parentRotation).multiply(this.cameraRotation);
      this.camera.getWorldDirection(this.cameraOffset).multiplyScalar(.52).applyQuaternion(this.parentRotation);
      this.motif.root.position.set(0,this.centerY,0).add(this.cameraOffset);
    }
    this.motif?.update(t);
    for(const {group,speed} of this.rings)group.rotation.z=.22+t*speed;
    if(this.orbit)this.orbit.rotation.z=.3-t*.08;
    if(this.arc){
      const points=this.arc.geometry.attributes.position;
      const rail=Math.min(.19,this.width*.2);
      for(let i=0;i<16;i++)points.setXYZ(i,(i===0||i===15?0:Math.sin(Math.floor(t*7)+i*2.1)*rail),1.35+i*(bladeLength-.15)/15,.31);
      points.needsUpdate=true;
    }
    let focus=0;
    if(this.transition){
      const duration=still?.12:this.transition.up?1.25:.65;
      const p=clamp((clock-this.transition.start)/duration,0,1);
      const amplitude=Math.sin(p*Math.PI);
      if(this.halo)this.halo.scale.setScalar(1+(!still&&this.transition.up?amplitude*.07:0));
      this.sweep.visible=!still&&p<1;this.sweep.position.y=1.1+p*(this.extent-.9);
      this.shock.visible=!still&&p<1;
      this.shock.scale.setScalar(.4+p*2.2);
      this.shock.children[0].material.opacity=(1-p)*.65;
      this.shock.children[0].children[0].material.opacity=(1-p)*.10;
      if(p>=1){this.transition=null;this.shock.visible=false;}
      else if(!still&&this.transition.up)focus=amplitude;
    }
    return focus;
  }
  dispose(){
    this.clearState();this.pixelGeometry.dispose();this.shardGeometry.dispose();
    for(const material of this.materials.values())material.dispose();this.materials.clear();
    this.root.removeFromParent();
  }
}

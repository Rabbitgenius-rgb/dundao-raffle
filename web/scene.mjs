import * as THREE from './vendor/three.module.js';
import { buildSword, disposeSword } from './sword.mjs';
import { getTier } from './game.mjs';
import { BladeEffects } from './effects.mjs';
import { ForgeAudio } from './audio.mjs';
import { HAMMER_TIMING, hammerPose, impactResponse, impactStrength } from './hammer.mjs';

const ROUTE_COLORS = {
  lava:0xff7946, frost:0x8de6ff, storm:0xc1a0ff, bone:0xf0c5a1, vine:0x9cdd91, carapace:0xe9a2be,
  star:0xeacb83, clockwork:0xe7a65d, holy:0xffdf9d, ocean:0x69dbcf, ghost:0x73eec0, desert:0xe5bf79,
};
const ease = t => t * t * (3 - 2 * t);

export class ForgeScene {
  constructor(host) {
    this.host = host;
    this.mode = 'home';
    this.audio = new ForgeAudio();
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x151925);
    this.scene.fog = new THREE.FogExp2(0x151925, 0.025);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    host.replaceChildren(this.renderer.domElement);
    this.cube = new THREE.BoxGeometry(1, 1, 1);
    this.pixelTexture=this.makePixelTexture();
    this.materials = new Map();
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.particles = [];
    this.flames = [];
    this.pulse = 0;
    this.impactAt = null;
    this.impactPower = 1;
    this.sword = null;
    this.strikeState = null;
    this.swordPose = new THREE.Group();
    this.scene.add(this.swordPose);
    this.effects=new BladeEffects(this.swordPose,this.motion,this.camera);
    this.createLights();
    this.createWorkshop();
    this.createHammer();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.audio.pause();
        this.hiddenAt ??= performance.now();
        this.renderer.setAnimationLoop(null);
      } else {
        if(this.audio.context)void this.audio.unlock();
        if(this.hiddenAt!=null) {
          const pause=performance.now()-this.hiddenAt;
          if(this.strikeState) this.strikeState.start+=pause;
          if(this.impactAt!=null) this.impactAt+=pause/1000;
          if(this.poseEpoch) this.poseEpoch+=pause/1000;
          this.effects?.resume(pause/1000);
          this.hiddenAt=null;this.previousTime=undefined;
        }
        this.renderer.setAnimationLoop(t => this.frame(t));
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.renderer.setAnimationLoop(t => this.frame(t));
    this.resize();
  }

  mat(color, glow = false, metallic = false) {
    const key = color + '-' + glow + '-' + metallic;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({
      color, roughness: metallic ? 0.58 : 0.93, metalness: metallic ? 0.6 : 0.03,
      emissive: glow ? color : 0x000000, emissiveIntensity: glow ? 1.4 : 0,
      flatShading: true, map:glow?null:this.pixelTexture,
    }));
    return this.materials.get(key);
  }

  makePixelTexture() {
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
    const ctx=canvas.getContext('2d');
    for(let y=0;y<32;y++) for(let x=0;x<32;x++){
      const h=((x*73+y*151+x*y*11)%37);
      const n=218+h;
      ctx.fillStyle='rgb('+n+','+n+','+n+')';ctx.fillRect(x,y,1,1);
    }
    ctx.fillStyle='#bfc2c5';ctx.fillRect(3,9,6,1);ctx.fillRect(21,24,5,1);
    ctx.fillStyle='#f7f5ee';ctx.fillRect(3,8,5,1);ctx.fillRect(22,23,4,1);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;
    texture.minFilter=THREE.NearestMipmapNearestFilter;return texture;
  }

  box(parent, pos, size, color, glow = false, metallic = false) {
    const mesh = new THREE.Mesh(this.cube, this.mat(color, glow, metallic));
    mesh.position.set(...pos); mesh.scale.set(...size);
    mesh.castShadow = !glow; mesh.receiveShadow = !glow;
    parent.add(mesh); return mesh;
  }

  createLights() {
    this.scene.add(new THREE.HemisphereLight(0xbbc9e9, 0x30242a, 2.2));
    const key = new THREE.DirectionalLight(0xffd3a1, 3.8);
    key.position.set(-3, 10, 5); key.castShadow = true;
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 30 });
    key.shadow.mapSize.set(1024, 1024); key.shadow.normalBias = 0.035;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8c91ff, 2.7);
    rim.position.set(5, 6, -6); this.scene.add(rim);
    this.fireLight = new THREE.PointLight(0xff7a29, 27, 12, 2);
    this.fireLight.position.set(-2.8, 2, -2.5); this.scene.add(this.fireLight);
    this.bladeLight = new THREE.PointLight(0xffb75c, 3, 7, 2);
    this.bladeLight.position.set(0, 3, 0); this.scene.add(this.bladeLight);
    this.impactLight = new THREE.PointLight(0xffd7a0, 0, 3, 2);
    this.scene.add(this.impactLight);
  }

  createWorkshop() {
    const w = this.world;
    this.box(w, [0, -0.57, 0], [9.1, 0.65, 7.8], 0x222839);
    this.box(w, [0, -0.2, 0], [9.5, 0.25, 8.15], 0x414351);
    // The floor is assembled from subtly mismatched, stepped stone blocks.
    for (let x = -4; x <= 4; x++) for (let z = -3; z <= 3; z++) {
      const tone = [0x3a3d4a,0x41434f,0x343b49,0x454450][Math.abs(x * 7 + z * 3) % 4];
      this.box(w, [x, -0.035, z * 1.05], [0.96, 0.19, 1], tone);
      if ((x * 3 + z) % 7 === 0) this.box(w, [x - 0.28, 0.068, z * 1.05 + 0.2], [0.26, 0.008, 0.025], 0x69636a);
    }
    for (const x of [-4.3,4.3]) for (let z=-3;z<=3;z+=0.4) this.box(w,[x,0.1,z],[0.055,0.04,0.16],0xb2895d);
    // Broken masonry backdrop, kept low enough to frame the blade.
    for (let j=0;j<4;j++) for (let i=0;i<10;i++) {
      if (j===3 && (i===0||i===9||i===6)) continue;
      this.box(w,[-4.35+i*0.94+(j%2)*0.12,0.35+j*0.56,-3.7],[0.9,0.52,0.4],j%2?0x333845:0x3d3c48);
    }
    for (const x of [-4.15,4.15]) {
      this.box(w,[x,1.8,-3.6],[0.56,3.6,0.65],0x474552);
      this.box(w,[x,3.65,-3.6],[0.84,0.3,0.84],0x61565a);
    }
    // Furnace: arch-like stepped opening, hot coals and a stout chimney.
    const kiln = new THREE.Group(); kiln.position.set(-2.7,0,-2.05); w.add(kiln);
    this.box(kiln,[0,.18,0],[2.45,.35,1.75],0x514351);
    for (const x of [-.88,.88]) for (let j=0;j<4;j++) this.box(kiln,[x,.62+j*.43,0],[.54,.4,1.42],j%2?0x6a5158:0x594650);
    this.box(kiln,[0,2.2,0],[2.25,.48,1.62],0x75565b);
    this.box(kiln,[0,2.58,-.22],[1.55,.3,1.27],0x4c4050);
    for(let j=0;j<4;j++) this.box(kiln,[0,2.92+j*.38,-.32],[1.05,.36,.97],j%2?0x594956:0x423b4b);
    this.box(kiln,[0,.65,-.48],[1.25,.72,.18],0xf26b22,true);
    for(let i=0;i<8;i++) {
      const x=((i*7)%9-4)*.14,z=((i*5)%7-3)*.11;
      this.box(kiln,[x,.42,z],[.25,.14,.23],i%2?0xd76131:0xffa43a,true);
      const f=this.box(kiln,[x,.72,z],[.16,.55+(i%3)*.12,.16],i%2?0xffa03c:0xffd06a,true);
      this.flames.push({mesh:f,base:f.scale.y,phase:i*1.3});
    }
    for(let i=0;i<5;i++) this.box(kiln,[-.64+i*.32,.5,.62],[.035,.55,.04],0x292c36,false,true);
    // Tool rack, a spare hammer and tongs, all actual low-resolution geometry.
    for(const x of [2.45,3.95]) this.box(w,[x,1.25,-2.6],[.2,2.5,.24],0x624b44);
    this.box(w,[3.2,2.45,-2.6],[1.9,.24,.25],0x917050);
    for (let i=0;i<4;i++) {
      const x=2.65+i*.37;
      this.box(w,[x,1.8,-2.43],[.08,.9,.1],0x9c8260);
      if(i%2===0) this.box(w,[x,1.24,-2.43],[.3,.32,.2],0x718598,false,true);
      else {
        this.box(w,[x-.08,1.26,-2.43],[.045,.4,.08],0x8997a5,false,true);
        this.box(w,[x+.08,1.26,-2.43],[.045,.4,.08],0x8997a5,false,true);
      }
    }
    // Workbench and small bottles.
    this.box(w,[3.1,.95,-1.35],[2.1,.22,.9],0x705344);
    for(const x of [2.3,3.9]) this.box(w,[x,.45,-1.35],[.2,.9,.65],0x4b3c3c);
    for(let i=0;i<3;i++) {
      this.box(w,[2.55+i*.53,1.2,-1.35],[.2,.3,.2],[0x68a68f,0x8395cc,0xb680a2][i]);
      this.box(w,[2.55+i*.53,1.4,-1.35],[.1,.12,.1],0xae9675);
    }
    // Centerpiece: block-forged anvil, supports and riveted iron bands.
    this.box(w,[0,.3,0],[2.12,.55,2.35],0x4e3e39);
    for(let i=0;i<6;i++) this.box(w,[-.88+i*.35,.61,0],[.32,.16,2.2],i%2?0x695144:0x5b453d);
    this.box(w,[0,.76,0],[1.8,.22,2.2],0x344354,false,true);
    this.box(w,[0,1.13,0],[.95,.58,1.8],0x44546a,false,true);
    this.box(w,[0,1.44,0],[1.25,.2,2.2],0x586a7e,false,true);
    this.box(w,[0,1.66,0],[1.8,.27,3.05],0x6c7c8c,false,true);
    this.box(w,[0,1.82,0],[1.73,.08,3],0x9aa8b4,false,true);
    for(let i=0;i<3;i++) this.box(w,[0,1.61,-1.6-i*.27],[1.4-i*.4,.24,.3],0x5b6f83,false,true);
    for(const x of [-.96,.96]) for(const z of [-.78,.78]) this.box(w,[x,.54,z],[.08,.1,.1],0xba965f,false,true);
    // Blue cooling trough, coal and ore crates.
    this.box(w,[-3,.48,1.45],[1.45,.9,1.5],0x4b4546);
    this.box(w,[-3,.96,1.45],[1.5,.1,1.55],0x696665,false,true);
    this.box(w,[-3,.99,1.45],[1.2,.04,1.23],0x497a90);
    this.box(w,[-3,1.012,1.4],[.55,.015,.04],0x91b9c6);
    this.box(w,[3,.38,1.35],[1.3,.7,1.1],0x644e40);
    for(let i=0;i<6;i++) {
      const ore=this.box(w,[2.63+(i%3)*.34,.8+(i%2)*.1,1.12+Math.floor(i/3)*.4],[.28,.3,.28],0x828b9a,false,true);
      ore.rotation.y=i*.45;
    }
    // Inlaid runes lead the eye toward the anvil.
    for(const side of [-1,1]) for(let i=0;i<5;i++){
      this.box(w,[side*1.75,.076,-1.7+i*.67],[.18,.02,.06],0xb99b64,true);
      this.box(w,[side*1.75+.07,.076,-1.63+i*.67],[.04,.02,.16],0xa37d5e,true);
    }
    // Hanging lantern, glowing square pixels instead of a smooth bulb.
    this.box(w,[3.85,3.23,-3.2],[.06,.8,.06],0x897353,false,true);
    this.box(w,[3.85,2.69,-3.2],[.4,.5,.4],0x3f3b3d,false,true);
    this.box(w,[3.85,2.69,-2.98],[.25,.32,.035],0xffb04b,true);
  }

  createHammer() {
    this.hammer = new THREE.Group(); this.scene.add(this.hammer);
    const h=this.hammer;
    // A compact cross-peen head, perpendicular to its long wooden shaft.
    this.box(h,[0,.13,0],[.46,.42,.42],0x4c6077,false,true);
    this.box(h,[0,.13,0],[.38,.42,.50],0x657b90,false,true);
    this.box(h,[0,-.13,0],[.38,.16,.38],0x56697c,false,true);
    // The chamfered striking face keeps the animation's contact plane at y=-.31.
    this.box(h,[0,-.25,0],[.56,.12,.38],0xb8cbd4,false,true);
    this.box(h,[0,-.25,0],[.42,.12,.52],0xb8cbd4,false,true);
    this.box(h,[0,-.202,.201],[.39,.024,.034],0xe3e1d1,false,true);
    // Stepped steel tapers to a narrow peen instead of another broad slab.
    for(let i=0;i<5;i++) {
      this.box(h,[0,.365+i*.059,0],[.42-i*.07,.062,.46-i*.025],
        i<2?0x71879b:0xa4b8c5,false,true);
    }
    // Bronze cheek plates, a dark eye and a tiny inset forge rune.
    for(const side of [-1,1]) {
      this.box(h,[0,.13,side*.258],[.25,.24,.024],0xb38a4d,false,true);
      this.box(h,[0,.13,side*.274],[.16,.16,.014],0x293747,false,true);
      this.box(h,[0,.13,side*.285],[.035,.10,.012],0xffb858,true);
      this.box(h,[.032,.165,side*.285],[.065,.025,.012],0xffb858,true);
      for(const y of [.045,.215]) this.box(h,[-.09,y,side*.275],[.025,.025,.018],0xe2c184,false,true);
    }
    // Exposed ash shaft, reinforced socket and separate leather-wrapped grip.
    this.box(h,[1.21,.13,0],[2.08,.135,.15],0xa47643);
    this.box(h,[1.02,.182,.078],[1.20,.018,.012],0xd0a366);
    this.box(h,[.40,.13,0],[.29,.21,.23],0x536274,false,true);
    this.box(h,[.555,.13,0],[.065,.23,.25],0xc29b5c,false,true);
    this.box(h,[1.84,.13,0],[.74,.19,.205],0x302d36);
    for(let i=0;i<8;i++) {
      this.box(h,[1.51+i*.091,.13,0],[.057,.214,.23],i%2?0x654738:0x78523e);
      this.box(h,[1.53+i*.091,.16,.119],[.012,.052,.012],0xb28b59);
    }
    for(const x of [1.43,2.235]) this.box(h,[x,.13,0],[.065,.235,.25],0xb78c51,false,true);
    this.box(h,[2.29,.13,0],[.06,.20,.21],0x56697d,false,true);
    this.restHammer();
  }

  restHammer() {
    this.hammer.position.set(1.7,3.8,.55);
    this.hammer.rotation.set(0,-.15,-.65);
  }

  resize() {
    const {width,height}=this.host.getBoundingClientRect();
    if(!width || !height) return;
    this.renderer.setSize(Math.max(1,Math.round(width)),Math.max(1,Math.round(height)),false);
    this.camera.aspect=width/height;
    this.camera.updateProjectionMatrix();
  }

  setState(state, mode = this.mode) {
    const modeChanged=mode!==this.mode;
    this.mode=mode; this.state=state;
    if(this.sword){ this.swordPose.remove(this.sword); disposeSword(this.sword); }
    this.sword=buildSword(state); this.swordPose.add(this.sword);
    this.effects?.setState(state,mode,this.sword.userData);
    this.bladeLight.color.setHex(ROUTE_COLORS[state.route] || 0xffb75c);
    this.hammer.visible=mode==='forge';
    if(modeChanged) { this.poseEpoch=performance.now()/1000; this.impactAt=null; }
    this.poseSword(0);
  }

  poseSword(time) {
    if(!this.sword) return;
    if(this.mode==='forge') {
      this.swordPose.position.set(0,1.98,1.78);
      this.swordPose.rotation.set(-Math.PI/2,0,0);
      this.swordPose.scale.setScalar(.79);
    } else {
      this.swordPose.position.set(0,1.95,0);
      const yaw=this.mode==='result'&&!this.motion.matches ? .65+Math.max(0,time-(this.poseEpoch||time))*.24 : .65;
      this.swordPose.rotation.set(0,yaw,0);
      this.swordPose.scale.setScalar(this.mode==='result'?.98:1.05);
      if(!this.motion.matches) this.swordPose.position.y+=Math.sin(time*1.35)*.055;
    }
  }

  strike(onImpact, event) {
    if(this.strikeState) return Promise.resolve(false);
    // Unlock inside the player's click; sound itself waits for actual contact.
    void this.audio?.unlock();
    return new Promise((resolve,reject) => {
      this.strikeState={start:performance.now(),onImpact,event,resolve,reject,contact:this.contactPoint(),impacted:false,
        reducedMotion:this.motion.matches,duration:this.motion.matches?HAMMER_TIMING.reducedDuration:HAMMER_TIMING.duration};
    });
  }

  contactPoint() {
    this.swordPose.updateWorldMatrix(true,true);
    const ray=new THREE.Raycaster();
    let point=new THREE.Vector3(0,1.98,-.35);
    // Fine voxels have intentional seams at x=0. Probe both sides of that seam
    // so even the narrow initial blade receives a real surface contact.
    for(const x of [-.375,-.175,-.025,.025,.175,.375]) for(const z of [-.59,-.35,-.11]){
      ray.set(new THREE.Vector3(x,8,z),new THREE.Vector3(0,-1,0));
      const hit=ray.intersectObject(this.sword,true)[0];
      if(hit&&hit.point.y>point.y) point=hit.point.clone();
    }
    return point;
  }

  burst(kind) {
    if(this.motion.matches){this.pulse=0;return;}
    const isDamage=kind==='damage';
    const col=ROUTE_COLORS[this.state?.route]||0xffb657;
    const contact=this.strikeState?.contact?.clone()||new THREE.Vector3(0,2.12,-.35);
    const count=kind==='awakening'?42:kind==='surge'?32:26;
    for(let i=0;i<count;i++){
      const angle=i*2.39996+(this.state?.hits||0)*.71, speed=1.8+(i%7)*.48;
      const fragment=isDamage&&i%4===0;
      const color=fragment?0x777a82:i%5===0?col:[0xffedba,0xffca63,0xff8b3b][i%3];
      const p=this.box(this.scene,[contact.x,contact.y+.025,contact.z],[.018+(i%3)*.009,.023,.045+(i%4)*.025],color,!fragment);
      const particle={mesh:p,velocity:new THREE.Vector3(Math.cos(angle)*speed,.75+(i%5)*.31,Math.sin(angle)*speed*.75),
        baseScale:p.scale.clone(),life:0,limit:fragment?.65:.24+(i%5)*.055,drag:fragment?1.3:2.1};
      p.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),particle.velocity.clone().normalize());
      if(kind==='repair'&&i>=18){
        particle.target=contact.clone();particle.limit=.75+(i%3)*.12;
        particle.from=contact.clone().add(new THREE.Vector3(Math.cos(angle)*1.2,.2+(i%5)*.25,Math.sin(angle)*1.2));
        p.position.copy(particle.from);
      }
      this.particles.push(particle);
    }
    this.pulse=1;
  }

  frame(ms) {
    const frameStarted=performance.now();
    const time=ms*.001;
    const dt=Math.min(.05, Math.max(0,(ms-(this.previousTime||ms))/1000));
    this.previousTime=ms;
    const strike=this.strikeState;
    let contacted=false;
    if(strike){
      const impactAt=HAMMER_TIMING.impactAt;
      let t=Math.min(1,Math.max(strike.impacted?impactAt:0,(ms-strike.start)/strike.duration));
      // A delayed frame still presents contact before it commits the score.
      if(t>=impactAt&&!strike.impacted){
        t=impactAt;
        strike.start=ms-impactAt*strike.duration;
      }
      const pose=hammerPose(t,strike.contact,strike.reducedMotion??this.motion.matches);
      this.hammer.position.set(...pose.position);
      this.hammer.rotation.set(...pose.rotation);
      if(t>=impactAt&&!strike.impacted){
        strike.impacted=true;
        try {
          const previousTier=getTier(this.state.score).level;
          strike.onImpact();
          const nextTier=getTier(this.state.score).level;
          this.audio?.play(strike.event,{route:this.state.route,up:nextTier>previousTier,legendary:nextTier===6});
          this.effects?.play(strike.event,{up:nextTier>previousTier,down:nextTier<previousTier});
          const nextContact=this.contactPoint();
          strike.contact.y=nextContact.y;
          this.hammer.position.set(strike.contact.x,strike.contact.y+.31,strike.contact.z);
          this.impactAt=time;this.impactPower=impactStrength(strike.event.kind);
          this.impactLight?.position.set(strike.contact.x,strike.contact.y+.12,strike.contact.z);
          this.burst(strike.event.kind);
          contacted=true;
        }
        catch(error){this.strikeState=null;this.restHammer();strike.reject(error);}
      }
      if(t===1&&this.strikeState===strike){this.strikeState=null;this.restHammer();strike.resolve(true);}
    }
    this.poseSword(time);
    const impact=impactResponse(this.impactAt==null?Infinity:Math.max(0,time-this.impactAt),this.impactPower,this.motion.matches);
    if(this.mode==='forge'){
      this.swordPose.position.y+=impact.bladeY;
      this.swordPose.rotation.z+=impact.bladeTilt;
      // During the brief contact hold, the face follows the blade's tiny give.
      if(strike?.impacted&&time-this.impactAt<HAMMER_TIMING.holdMs/1000)this.hammer.position.y+=impact.bladeY;
    }
    if(this.impactLight)this.impactLight.intensity=impact.flash*16;
    const evolutionFocus=this.effects?.update(time)||0;
    this.pulse=Math.max(0,this.pulse-dt*3);
    this.bladeLight.intensity=3+this.pulse*18;
    for(const flame of this.flames) {
      const flicker=this.motion.matches?1:.82+Math.sin(time*5+flame.phase)*.18;
      flame.mesh.scale.y=flame.base*flicker;
    }
    this.fireLight.intensity=27+(this.motion.matches?0:Math.sin(time*7)*2.5);
    for(let i=this.particles.length-1;i>=0;i--){
      const p=this.particles[i];p.life+=dt;
      if(p.target){
        const u=ease(Math.min(1,p.life/p.limit));p.mesh.position.lerpVectors(p.from,p.target,u);
      }else{
        p.velocity.multiplyScalar(Math.exp(-(p.drag||0)*dt));
        p.velocity.y-=10*dt;p.mesh.position.addScaledVector(p.velocity,dt);
        const onAnvil=Math.abs(p.mesh.position.x)<.85&&Math.abs(p.mesh.position.z)<1.48;
        const floor=onAnvil?1.87:.12;
        if(p.mesh.position.y<floor&&p.velocity.y<0){p.mesh.position.y=floor;p.velocity.y*=-.22;p.velocity.x*=.65;p.velocity.z*=.65;}
      }
      if(p.baseScale)p.mesh.scale.copy(p.baseScale).multiplyScalar(Math.max(.03,1-p.life/p.limit)**.6);
      p.mesh.rotation.x+=dt*4;p.mesh.rotation.z+=dt*3;
      if(p.life>p.limit){this.scene.remove(p.mesh);this.particles.splice(i,1);}
    }
    const wide=this.camera.aspect>1.55;
    const distance=(wide?1.08:1)*(1-evolutionFocus*.045);
    const showcase=this.mode!=='forge';
    let targetY=showcase?2.7:1.5;
    if(this.mode==='result'){
      const height=(this.sword.userData.bounds?.max?.[1]||5)*.98;
      targetY=1.95+height*.51;
      const framing=Math.max(height*1.20,3.7/this.camera.aspect);
      const d=framing/(2*Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2)))*distance;
      this.camera.position.set(d*.42,targetY+d*.18,d*.89);
    }else this.camera.position.set((showcase?8.6:5.5)*distance,(showcase?7.4:7.1)*distance,(showcase?11:8)*distance);
    this.camera.position.x+=impact.cameraX;
    this.camera.position.y+=impact.cameraY;
    this.camera.lookAt(0,targetY,0);
    this.renderer.render(this.scene,this.camera);
    if(contacted&&this.strikeState===strike){
      // Rebuilding/uploading an evolved blade can take longer than a frame.
      // Start the hold from the presented contact, not from before that work.
      const presentationCost=Math.max(0,performance.now()-frameStarted);
      strike.start+=presentationCost;
      this.impactAt+=presentationCost/1000;
    }
  }

  dispose() {
    this.audio?.dispose();
    this.renderer.setAnimationLoop(null);this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange',this.visibilityHandler);
    if(this.strikeState){this.strikeState.resolve(false);this.strikeState=null;}
    disposeSword(this.sword);
    this.effects?.dispose();this.pixelTexture.dispose();
    this.cube.dispose();for(const m of this.materials.values()) m.dispose();
    this.renderer.dispose();
  }
}

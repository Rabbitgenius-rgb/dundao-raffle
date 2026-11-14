import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three.module.js';
import { ForgeScene } from '../web/scene.mjs';
import { buildSword, disposeSword } from '../web/sword.mjs';
import { createGame, ROUTES, PARTS } from '../web/game.mjs';
import { HAMMER_TIMING, hammerPose, impactResponse } from '../web/hammer.mjs';
import { synthesizeStrike } from '../web/audio.mjs';

function fixture(state) {
  const scene=Object.create(ForgeScene.prototype);
  Object.assign(scene,{
    state,mode:'forge',motion:{matches:false},particles:[],flames:[],pulse:0,
    scene:new THREE.Scene(),swordPose:new THREE.Group(),hammer:new THREE.Group(),
    camera:new THREE.PerspectiveCamera(36,1.3,.1,100),
    bladeLight:{intensity:0},fireLight:{intensity:0},renderer:{render(){}},
  });
  scene.sword=buildSword(state);scene.swordPose.add(scene.sword);scene.poseSword(0);
  scene.burst=()=>{};
  return scene;
}

test('contact follows the actual selected/evolved blade rather than a fixed anvil height',()=>{
  const initial=createGame();
  const surfaces=[];
  const states=[...PARTS.blade.map(part=>createGame({blade:part.id})),...ROUTES.map(({id:route})=>({...initial,route,hits:15,growth:20,score:95000}))];
  for(const state of states) {
    const scene=fixture(state);
    const point=scene.contactPoint();
    assert.ok(point.y>1.98,'contact reaches the blade surface');
    const ray=new THREE.Raycaster(new THREE.Vector3(point.x,8,point.z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(scene.swordPose,true)[0];
    assert.ok(Math.abs(point.y-hit.point.y)<1e-7);
    surfaces.push(point.y);
    disposeSword(scene.sword);
  }
  assert.ok(Math.max(...surfaces)-Math.min(...surfaces)>.1,'evolution changes physical contact height');
});

test('a delayed animation frame still contacts the blade before committing exactly one strike',()=>{
  const scene=fixture(createGame());
  let impacts=0,resolves=0,sounds=0;
  scene.audio={play(){sounds++;assert.equal(impacts,1,'sound follows the accepted impact');}};
  const contact=scene.contactPoint();
  scene.strikeState={start:0,duration:920,contact,impacted:false,event:{kind:'growth'},
    onImpact(){impacts++;assert.ok(Math.abs(scene.hammer.position.y-.31-contact.y)<1e-7);},
    resolve(){resolves++;},reject(e){throw e;}};
  scene.frame(80);assert.equal(impacts,0);assert.equal(sounds,0);
  scene.frame(2000);assert.equal(impacts,1);assert.equal(resolves,0);assert.equal(sounds,1);
  assert.ok(scene.strikeState,'contact is visible for a frame before recovery');
  scene.frame(3000);assert.equal(impacts,1);assert.equal(resolves,1);
  scene.frame(4000);assert.equal(impacts,1);assert.equal(sounds,1);
  disposeSword(scene.sword);
});

test('the hammer lifts, accelerates, holds real contact, rebounds and returns without penetrating the blade',()=>{
  const contact={x:.175,y:2.22,z:-.59};
  const pose=t=>hammerPose(t,contact);
  const hit=HAMMER_TIMING.impactAt;
  assert.ok(pose(.14).position[1]>pose(0).position[1],'the windup raises the head');
  const earlyDrop=pose(.23).position[1]-pose(.25).position[1];
  const lateDrop=pose(.39).position[1]-pose(.41).position[1];
  assert.ok(lateDrop>earlyDrop*2,'the final approach accelerates');
  for(const t of [hit,hit+.01,hit+.025]){
    assert.deepEqual(pose(t).position,[contact.x,contact.y+.31,contact.z]);
    assert.deepEqual(pose(t).rotation,[0,0,0]);
  }
  assert.ok(pose(.54).position[1]>pose(hit).position[1]+.1,'the smaller recoil follows contact');
  for(const key of ['position','rotation'])for(let axis=0;axis<3;axis++){
    assert.ok(Math.abs(pose(1)[key][axis]-pose(0)[key][axis])<1e-12,'the resting pose is restored');
  }
  for(let i=0;i<=1000;i++){
    const frame=pose(i/1000),angle=frame.rotation[2];
    // Lowest corner of the .08-high, 1.07-wide metal striking plate.
    const faceBottom=frame.position[1]-.31*Math.cos(angle)-.535*Math.abs(Math.sin(angle));
    assert.ok(faceBottom>=contact.y-1e-8,'the hammer face stays above the sword');
  }
});

test('impact vibration settles and reduced motion removes camera shake and blade recoil',()=>{
  const quiet={bladeY:0,bladeTilt:0,cameraX:0,cameraY:0,flash:0};
  assert.deepEqual(impactResponse(-.01),quiet);
  assert.deepEqual(impactResponse(1),quiet);
  assert.deepEqual(impactResponse(.02,1.25,true),quiet);
  assert.ok(Math.abs(impactResponse(.02).cameraY)>.01);
  assert.ok(Math.abs(impactResponse(.4).cameraY)<.0001);
  const contact={x:0,y:2.2,z:-.35};
  const reduced=hammerPose(HAMMER_TIMING.impactAt,contact,true);
  assert.deepEqual(reduced.position,[contact.x,contact.y+.31,contact.z]);
});

test('an expensive blade replacement does not consume the visible contact hold or rebound',t=>{
  const scene=fixture(createGame());
  let now=0,impacts=0;
  t.mock.method(performance,'now',()=>now);
  scene.strikeState={start:0,duration:HAMMER_TIMING.duration,contact:scene.contactPoint(),impacted:false,event:{kind:'growth'},
    onImpact(){impacts++;now+=160;},resolve(){},reject(error){throw error;}};
  now=HAMMER_TIMING.impactAt*HAMMER_TIMING.duration;
  scene.frame(now);
  assert.equal(impacts,1);
  now+=20;scene.frame(now);
  const response=impactResponse(.02);
  assert.ok(Math.abs(scene.hammer.position.y-.31-scene.strikeState.contact.y-response.bladeY)<1e-8,'the face is still in its visible contact hold');
  now+=90;scene.frame(now);
  assert.ok(scene.hammer.position.y>scene.strikeState.contact.y+.4,'the recoil is presented after the stall');
  assert.equal(impacts,1);
  disposeSword(scene.sword);
});

test('metal strike audio has a clear transient, a decaying tail and no clipped or discontinuous endpoints',()=>{
  for(const sampleRate of [44100,48000])for(const kind of ['growth','surge','awakening','damage','repair']){
    const samples=synthesizeStrike(sampleRate,{kind,route:'lava'});
    let headEnergy=0,tailEnergy=0,peak=0;
    for(let i=0;i<samples.length;i++){
      assert.ok(Number.isFinite(samples[i]));peak=Math.max(peak,Math.abs(samples[i]));
      if(i<sampleRate*.025)headEnergy+=samples[i]**2;
      if(i>=sampleRate*.5&&i<sampleRate*.525)tailEnergy+=samples[i]**2;
    }
    assert.equal(samples[0],0);assert.equal(samples.at(-1),0);
    assert.ok(peak>.3&&peak<.8,'audible but safely below digital clipping');
    assert.ok(headEnergy>tailEnergy*20,'contact dominates the later resonance');
  }
});

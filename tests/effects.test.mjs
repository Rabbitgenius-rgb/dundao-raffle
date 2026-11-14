import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three.module.js';
import { BladeEffects } from '../web/effects.mjs';
import { createGame, QUALITY_TIERS } from '../web/game.mjs';
import { DISTINCT_EFFECT_ROUTES } from '../web/route-effects.mjs';

const meta={bounds:{min:[-.5,0,-.3],max:[.5,5.4,.3]}};
const fixture=(level,route='storm')=>({...createGame(),route,hits:10,score:QUALITY_TIERS[level].min,growth:12});

test('magic progresses from particles to half/full/double rings and resets before the first strike',()=>{
  const parent=new THREE.Group(),effects=new BladeEffects(parent,{matches:false});
  for(let level=0;level<7;level++){
    const state=fixture(level),before=JSON.stringify(state);
    effects.setState(state,'result',meta);
    assert.equal(effects.root.userData.ringCount,level<3?0:level===6?2:1);
    assert.equal(effects.root.userData.orbitalCount,level>=5?1:0);
    effects.update(12);assert.equal(JSON.stringify(state),before,'rendering must not mutate game state');
  }
  effects.setState(createGame(),'pick',meta);
  assert.equal(effects.root.children.length,0,'the selected blank must have no route magic');
  effects.dispose();assert.equal(parent.children.length,0);
});

test('each original route animates its own particles and rings at divine quality',()=>{
  const effects=new BladeEffects(new THREE.Group(),{matches:false});
  for(const route of ['lava','frost','storm','bone','vine','carapace']){
    effects.setState(fixture(6,route),'result',meta);
    effects.update(1);
    const firstParticles=[...effects.particles.instanceMatrix.array];
    const firstRings=effects.rings.map(item=>item.group.rotation.z);
    effects.update(3);
    assert.notDeepEqual([...effects.particles.instanceMatrix.array],firstParticles,`${route} particles move`);
    assert.notDeepEqual(effects.rings.map(item=>item.group.rotation.z),firstRings,`${route} rings turn`);
  }
  effects.dispose();
});

test('reduced motion retains visible effects but freezes positions and disables hit sweeps',()=>{
  const effects=new BladeEffects(new THREE.Group(),{matches:true});
  effects.setState(fixture(6,'vine'),'result',meta);
  effects.update(3);const positions=[...effects.particles.instanceMatrix.array];
  const rotations=effects.rings.map(r=>r.group.rotation.z);
  effects.play({kind:'awakening'},{up:true});
  assert.equal(effects.update(performance.now()/1000+.05),0);
  effects.update(20);
  assert.deepEqual([...effects.particles.instanceMatrix.array],positions);
  assert.deepEqual(effects.rings.map(r=>r.group.rotation.z),rotations);
  assert.equal(effects.sweep.visible,false);assert.equal(effects.shock.visible,false);
  assert.ok(effects.halo.visible&&effects.particles.count>0);
  effects.dispose();
});

test('hidden-tab clock offsets preserve particle positions and state replacement releases old geometry',()=>{
  const effects=new BladeEffects(new THREE.Group(),{matches:false});
  effects.setState(fixture(6),'result',meta);effects.update(10);
  const positions=[...effects.particles.instanceMatrix.array];
  effects.resume(120);effects.update(130);
  assert.deepEqual([...effects.particles.instanceMatrix.array],positions);
  const owned=[...effects.geometries];let freed=0;
  owned.forEach(g=>g.addEventListener('dispose',()=>freed++));
  effects.setState(fixture(3,'frost'),'forge',meta);
  assert.equal(freed,owned.length,'all replaced rings/arcs release GPU geometry');
  assert.equal(effects.root.children.filter(c=>c.isInstancedMesh).length,1);
  effects.dispose();
});

test('new routes show distinct animated motifs, respect reduced motion, and release replaced objects',()=>{
  const motion={matches:false};
  const effects=new BladeEffects(new THREE.Group(),motion);
  const snapshot=root=>{
    const transforms=[];
    root.traverse(object=>transforms.push([...object.position.toArray(),...object.rotation.toArray().slice(0,3),...object.scale.toArray()]));
    return transforms;
  };
  for(const route of DISTINCT_EFFECT_ROUTES){
    effects.setState(fixture(0,route),'result',meta);
    assert.equal(effects.motif,null,'early forging does not reveal a complete divine effect');
    effects.setState(fixture(6,route),'result',meta);
    assert.equal(effects.motif.root.name,`route-motif-${route}`);
    assert.equal(effects.root.userData.ringCount,0,'new route motifs do not use the common background halo');
    assert.ok(effects.motif.root.userData.animatedParts>0);
    effects.update(1);const first=snapshot(effects.motif.root);
    effects.update(2);assert.notDeepEqual(snapshot(effects.motif.root),first,`${route} has visible moving geometry`);
    motion.matches=true;effects.update(3);const still=snapshot(effects.motif.root);
    effects.update(9);assert.deepEqual(snapshot(effects.motif.root),still,`${route} freezes when reduced motion is requested`);
    motion.matches=false;
    const old=effects.motif.root;
    effects.setState(createGame(),'pick',meta);
    assert.equal(old.parent,null,'switching back to a blank detaches the old motif');
  }
  effects.dispose();
});

test('new result motifs remain visible toward the camera as the sword turns',()=>{
  const parent=new THREE.Group(),camera=new THREE.PerspectiveCamera(36,1,.1,100);
  camera.position.set(4,6,10);camera.lookAt(0,2,0);camera.updateMatrixWorld(true);
  const effects=new BladeEffects(parent,{matches:false},camera);
  for(const route of DISTINCT_EFFECT_ROUTES){
    effects.setState(fixture(6,route),'result',meta);
    for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
      parent.rotation.y=yaw;effects.update(2);
      const normal=new THREE.Vector3(0,0,1).applyQuaternion(effects.motif.root.getWorldQuaternion(new THREE.Quaternion()));
      const cameraNormal=new THREE.Vector3(0,0,1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
      assert.ok(normal.dot(cameraNormal)>.99999,`${route} faces the viewer at yaw ${yaw}`);
      const center=parent.localToWorld(new THREE.Vector3(0,effects.centerY,0));
      const behind=effects.motif.root.getWorldPosition(new THREE.Vector3()).sub(center);
      assert.ok(behind.dot(camera.getWorldDirection(new THREE.Vector3()))>.45,`${route} stays behind the sword`);
    }
    effects.setState(fixture(6,route),'forge',meta);
    assert.ok(effects.motif.root.quaternion.angleTo(new THREE.Quaternion())<1e-8,'forge effect stays aligned to the blade');
  }
  effects.dispose();
});

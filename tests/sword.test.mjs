import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advance, ROUTES, TOTAL_HITS, QUALITY_TIERS } from '../web/game.mjs';
import { generateSwordVoxels, buildSword, disposeSword } from '../web/sword.mjs';
import { EVOLUTION_STAGES, getEvolutionInfo } from '../web/evolution.mjs';

const SELECTIONS = [
  { blade: 'straight', handle: 'wrap', guard: 'disc' },
  { blade: 'curved', handle: 'shark', guard: 'cross' },
  { blade: 'thick', handle: 'bronze', guard: 'beast' },
  { blade: 'thin', handle: 'ebony', guard: 'none' },
];
const coord = v => `${v.x},${v.y},${v.z}`;
const coordinates = model => new Set(model.voxels.map(coord));
function changedCells(before, after) {
  const a = coordinates(before), b = coordinates(after);
  return [...a].filter(key => !b.has(key)).length + [...b].filter(key => !a.has(key)).length;
}
function sequenceRandom(values) {
  let next = 0;
  return () => {
    assert(next < values.length, 'The rule consumed unexpected extra randomness');
    return values[next++];
  };
}
function strike(state, routeIndex, [roll, power = 0.9, detail = 0.5]) {
  const values = state.hits === 0 ? [(routeIndex + 0.5) / ROUTES.length, roll, power, detail] : [roll, power, detail];
  return advance(state, sequenceRandom(values));
}
function assertModelBounds(model) {
  assert(model.voxels.length <= 18000, `Voxel budget exceeded: ${model.voxels.length}`);
  assert(model.meta.bounds.min[0] >= -1.7 && model.meta.bounds.max[0] <= 1.7);
  assert(model.meta.bounds.min[1] >= 0 && model.meta.bounds.max[1] <= 6.10001);
  assert(model.meta.bounds.min[2] >= -0.70001 && model.meta.bounds.max[2] <= 0.70001);
  assert.equal(model.meta.cellSize, 0.05);
}

const PATTERNS = {
  // The original failure: growth=0, score=0 and three severity-2 wounds stop
  // changing, while accepted strikes 5..15 still need a visible consequence.
  'repeated damage after the first growth': hit => hit === 1 ? [0.8, 0.9, 0.5] : [0.03, 0.9, 0.5],
  'awakening after growth and score are capped': () => [0.075, 0.99, 0.5],
  'capped growth alternating damage, repair and healthy repair rolls': hit => {
    if (hit <= 7) return [0.075, 0.99, 0.5];
    return [8, 11, 14].includes(hit) ? [0.03, 0.9, 0.5] : [0.5, 0.9, 0.5];
  },
};

for (const [name, pattern] of Object.entries(PATTERNS)) {
  test(`every accepted strike changes physical geometry: ${name}`, () => {
    for (let routeIndex = 0; routeIndex < ROUTES.length; routeIndex++) {
      for (const selection of SELECTIONS) {
        let state = createGame(selection, () => 0.37);
        let model = generateSwordVoxels(state);
        for (let hit = 1; hit <= TOTAL_HITS; hit++) {
          state = strike(state, routeIndex, pattern(hit));
          const nextModel = generateSwordVoxels(state);
          assert(
            changedCells(model, nextModel) >= 6,
            `${ROUTES[routeIndex].id}/${selection.blade}: strike ${hit} needs multiple changed cells, not a recolor or a hidden single voxel`,
          );
          assert.equal(nextModel.meta.hammerMarks.length, hit);
          assert(nextModel.meta.hammerMarks.every(mark => mark.frontCells >= 4 && mark.backCells >= 4));
          assertModelBounds(nextModel);
          assert.deepEqual(generateSwordVoxels(state), nextModel, 'Rerendering cannot reroll geometry');
          model = nextModel;
        }
        assert.equal(state.route, ROUTES[routeIndex].id);
        assert.equal(state.hits, TOTAL_HITS);
        const finished = advance(state, () => { throw new Error('Finished game must not roll'); });
        assert.equal(finished, state);
        assert.deepEqual(generateSwordVoxels(finished), model, 'Rejected extra clicks leave the model unchanged');
        if (name.startsWith('repeated damage')) {
          assert.equal(state.growth, 0);
          assert.equal(state.score, 0);
          assert.equal(state.damage.length, 3);
          assert(state.damage.every(scar => scar.severity === 2));
        }
      }
    }
  });
}

test('zero-hit selection model ignores dormant route, damage, seed and hammer history', () => {
  for (const selection of SELECTIONS) {
    const initial = createGame(selection, () => 0.2);
    const model = generateSwordVoxels(initial);
    const dormant = generateSwordVoxels({
      ...initial, route: 'bone', growth: 20, score: 100000, appearanceSeed: 987,
      damage: [{ id: 'ignored', site: 1, severity: 2 }],
      history: [{ hit: 1, kind: 'damage' }],
    });
    assert.deepEqual(dormant, model);
    assert.equal(model.meta.hammerMarks.length, 0);
    assert.equal(model.meta.hammerMarkVoxels, 0);
  }
});

test('repair removes an active wound while keeping the visible history of forging', () => {
  for (let routeIndex = 0; routeIndex < ROUTES.length; routeIndex++) {
    for (const selection of SELECTIONS) {
      let state = createGame(selection, () => 0.1);
      state = strike(state, routeIndex, [0.8, 0.9, 0.5]);
      state = strike(state, routeIndex, [0.03, 0.9, 0.5]);
      const wound = state.damage;
      state = strike(state, routeIndex, [0.5, 0.9, 0.5]);
      assert.equal(state.damage.length, 0);
      const repaired = generateSwordVoxels(state);
      const stillWounded = generateSwordVoxels({ ...state, damage: wound });
      assert.equal(repaired.meta.removedVoxels, 0);
      assert(stillWounded.meta.removedVoxels > 0);
      assert(changedCells(repaired, stillWounded) >= 6);
      assert.deepEqual(repaired.meta.hammerMarks.map(mark => mark.kind), ['growth', 'damage', 'repair']);
      assert(repaired.meta.hammerMarkVoxels >= 24, 'Repair does not erase the record of the first two strikes');
    }
  }
});

// Test connectivity independently using string grid coordinates. Authored
// diagonal staircase pixels count as touching; isolated magic motes do not.
function connectedFromPommel(model) {
  const cells = new Map(model.voxels.map(v => [coord(v), v]));
  const seen = new Set();
  if (!cells.has('0,0,0')) return seen;
  const queue = [cells.get('0,0,0')];
  seen.add('0,0,0');
  for (let i = 0; i < queue.length; i++) {
    const { x, y, z } = queue[i];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dy && !dz) continue;
      const key = `${x + dx},${y + dy},${z + dz}`;
      if (cells.has(key) && !seen.has(key)) {
        seen.add(key);
        queue.push(cells.get(key));
      }
    }
  }
  return seen;
}

function assertDamageConnectivity(state, context) {
  const damaged = generateSwordVoxels(state);
  const intact = generateSwordVoxels({ ...state, damage: [] });
  const before = connectedFromPommel(intact);
  const after = connectedFromPommel(damaged);
  assert(damaged.meta.removedVoxels > 0, 'Damage must still remove local structure');
  assert(damaged.meta.protectedCoreVoxels > 0);
  for (const voxel of damaged.voxels) {
    if (before.has(coord(voxel))) assert(after.has(coord(voxel)), `Floating damage fragment: ${context}/${coord(voxel)}`);
  }
  const beforeTop = Math.max(...intact.voxels.filter(v => v.z === 0 && before.has(coord(v))).map(v => v.y));
  assert(damaged.voxels.some(v => v.z === 0 && v.y === beforeTop && after.has(coord(v))), `A structural path must still reach the upper blade: ${context}`);
  assertModelBounds(damaged);
}

test('local damage preserves a connected blade core and removes severed damage fragments', () => {
  for (let routeIndex = 0; routeIndex < ROUTES.length; routeIndex++) {
    for (const selection of SELECTIONS) {
      for (let site = 0; site < 6; site++) {
        let state = createGame(selection, () => 0.41);
        for (let hit = 1; hit < TOTAL_HITS; hit++) state = strike(state, routeIndex, [0.075, 0.99, 0.5]);
        state = strike(state, routeIndex, [0.03, 0.9, (site + 0.5) / 6]);
        assertDamageConnectivity(state, `${ROUTES[routeIndex].id}/${selection.blade}/site${site}`);
      }
    }
  }
});

test('three severe wounds preserve the core at both minimum and near-maximum growth', () => {
  for (let routeIndex = 0; routeIndex < ROUTES.length; routeIndex++) {
    for (const selection of SELECTIONS) {
      for (const minimumGrowth of [true, false]) {
        let state = createGame(selection, () => 0.37);
        for (let hit = 1; hit <= TOTAL_HITS; hit++) {
          const event = minimumGrowth
            ? (hit === 1 ? [0.8, 0.9, 0.5] : [0.03, 0.9, 0.5])
            : (hit <= 12 ? [0.075, 0.99, 0.5] : [0.03, 0.9, 0.5]);
          state = strike(state, routeIndex, event);
        }
        assert.equal(state.damage.length, 3);
        assert(state.damage.every(scar => scar.severity === 2));
        assertDamageConnectivity(state, `${ROUTES[routeIndex].id}/${selection.blade}/${minimumGrowth ? 'minimum' : 'high'} growth`);
      }
    }
  }
});

const stageFixture = (route, level, selection = SELECTIONS[0]) => ({
  selection, route, hits: 15, growth: 18, score: QUALITY_TIERS[level].min,
  appearanceSeed: 12345, damage: [], history: [],
});
const silhouette = model => new Set(model.voxels.map(v => `${v.x},${v.y}`));
const setDifferenceSize = (a, b) => [...a].filter(key => !b.has(key)).length + [...b].filter(key => !a.has(key)).length;

test('all routes have seven physically distinct quality stages with named structural features', () => {
  for (const selection of SELECTIONS) {
    const distinctModels = new Set();
    for (const route of ROUTES) {
      let previous = null;
      for (let level = 0; level < QUALITY_TIERS.length; level++) {
        const state = stageFixture(route.id, level, selection);
        const model = generateSwordVoxels(state);
        const info = getEvolutionInfo(state);
        assert.equal(info.level, level);
        assert.equal(info.qualityName, QUALITY_TIERS[level].name);
        assert.equal(info.routeName, route.name);
        assert.equal(info.featureLabel, EVOLUTION_STAGES[route.id][level].featureLabel);
        assert.equal(info.legendary, level === 6);
        assert.deepEqual(model.meta.evolution, info);
        assert(model.meta.featureStructures.some(feature => feature.id === EVOLUTION_STAGES[route.id][level].featureId));
        if (previous) {
          assert(changedCells(previous, model) > 100, `${route.id} tier ${level} must change physical structure, not just color`);
          assert(setDifferenceSize(silhouette(previous), silhouette(model)) > 10, `${route.id} tier ${level} needs a readable silhouette change`);
        }
        distinctModels.add([...coordinates(model)].sort().join('|'));
        assertModelBounds(model);
        previous = model;
      }
    }
    assert.equal(distinctModels.size, ROUTES.length * QUALITY_TIERS.length, 'Each route × quality pair needs its own physical geometry');
  }
});

test('dense models use bevelled surface-only fine voxels and respect the draw-call budget', () => {
  const directions = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const route of ROUTES) for (let level = 0; level < QUALITY_TIERS.length; level++) {
    const state = stageFixture(route.id, level);
    const model = generateSwordVoxels(state);
    const cells = coordinates(model);
    assert(model.meta.voxelCount > 1000, 'Even slender early blades retain a dense 5 cm surface');
    assert(model.meta.culledInteriorVoxels > 0);
    assert.equal(model.meta.solidVoxelCount - model.meta.voxelCount, model.meta.culledInteriorVoxels);
    assert(model.meta.bevelCells > 0, 'Dense geometry needs refined edges, not only a subdivided coarse cube');
    for (const v of model.voxels) {
      assert(directions.some(([x, y, z]) => !cells.has(`${v.x + x},${v.y + y},${v.z + z}`)), 'A fully hidden fine cube should not be drawn');
    }
    const sword = buildSword(state);
    assert(sword.children.length <= 14);
    assert(sword.children.every(child => child.isInstancedMesh));
    const matrix = sword.children[0].instanceMatrix.array;
    assert(Math.abs(matrix[0] - 0.05 * 0.985) < 0.000001, 'GPU instances must actually use the finer cell size');
    disposeSword(sword);
    disposeSword(sword);
  }
});

test('each legendary route has substantial extra structure, detailed gold inlay and gem focal points', () => {
  for (const route of ROUTES) {
    const previous = generateSwordVoxels(stageFixture(route.id, 5));
    const god = generateSwordVoxels(stageFixture(route.id, 6));
    assert(god.meta.voxelCount > previous.meta.voxelCount * 1.08, `${route.id} God form must have materially richer structure`);
    assert(god.meta.inlayCells >= 90, 'Legendary blades require intricate fine-cell inlay');
    assert(god.voxels.filter(v => v.material === 'gold' || v.material === 'goldDark').length >= 180);
    assert(god.voxels.filter(v => v.material === 'gem').length >= 30);
    assert(god.meta.motionAnchors.some(anchor => anchor.kind !== 'gem'));
    assert(god.meta.motionAnchors.some(anchor => anchor.kind === 'gem'));
    assert(!god.meta.motionAnchors.some(anchor => anchor.kind === 'crown'), 'The approved straight swords have no common physical crown');
    assert(setDifferenceSize(silhouette(previous), silhouette(god)) >= 100);
  }
});

test('selected handle and guard choices remain different in both the initial and legendary forms', () => {
  for (const route of ROUTES) {
    for (const key of ['blade', 'handle', 'guard']) {
      const initialShapes = new Set(), finalShapes = new Set();
      for (const selection of SELECTIONS) {
        const selected = { ...SELECTIONS[0], [key]: selection[key] };
        const initial = generateSwordVoxels(createGame(selected, () => 0.2));
        const final = generateSwordVoxels(stageFixture(route.id, 6, selected));
        // Include materials here: leather, bronze, sharkskin and ebony keep
        // distinct wrapping/material treatments on their common grip volume.
        initialShapes.add(initial.meta.fingerprint);
        finalShapes.add(final.meta.fingerprint);
      }
      assert.equal(initialShapes.size, 4, `Initial ${key} choices should be distinct`);
      if (key !== 'blade') assert.equal(finalShapes.size, 4, `Legendary ${route.id} must preserve the selected ${key}`);
      else assert.equal(finalShapes.size, 1, 'After awakening the approved route body replaces the selected blank blade');
    }
  }
});


test('five approved routes stay centered straight swords at every tier, including a curved starting blank', () => {
  for (const route of ROUTES.filter(route => route.id !== 'carapace')) {
    for (let level = 0; level < QUALITY_TIERS.length; level++) {
      const model = generateSwordVoxels(stageFixture(route.id, level, SELECTIONS[1]));
      const topY = Math.max(...model.voxels.map(v => v.y));
      const tip = model.voxels.filter(v => v.y >= topY - 1);
      assert(tip.length > 0);
      assert(tip.every(v => v.x === -1 || v.x === 0), `${route.id}/${level}: the actual top geometry must be centered over the hilt`);
      const body = model.voxels.filter(v => v.y >= 36);
      const rows = new Map();
      for (const v of body) {
        const range = rows.get(v.y) || [Infinity, -Infinity];
        range[0] = Math.min(range[0], v.x); range[1] = Math.max(range[1], v.x);
        rows.set(v.y, range);
      }
      for (const [y, [min, max]] of rows) {
        assert.equal(min + max, -1, `${route.id}/${level}: blade outline must be symmetric around x=0 at row ${y}`);
      }
    }
  }
  for (let level = 0; level < QUALITY_TIERS.length; level++) {
    const model = generateSwordVoxels(stageFixture('carapace', level));
    const topY = Math.max(...model.voxels.map(v => v.y));
    assert(model.voxels.filter(v => v.y === topY).every(v => v.x > 1), 'The approved carapace tip retains its deliberate curve');
  }
});

test('approved late-stage bodies contain route-specific real openings and aligned storm plates', () => {
  const model = (route, level = 6) => generateSwordVoxels(stageFixture(route, level));
  const projection = m => new Set(m.voxels.map(v => `${Math.floor((v.x + 1) / 2)},${Math.floor(v.y / 2)}`));
  const storm = projection(model('storm'));
  assert(!storm.has('0,40') && storm.has('-5,40') && storm.has('5,40'), 'Storm must have two physical rails separated by open air');
  const floating = model('storm', 5);
  const attached = connectedFromPommel(floating);
  assert(floating.voxels.some(v => v.y > 50 && !attached.has(coord(v))), '名品 storm retains intentional detached aligned plates');
  const bone = projection(model('bone'));
  for (let y = 16; y < 54; y++) assert(bone.has(`0,${y}`), 'Bone retains a continuous straight central spine');
  assert([...Array(25)].some((_, i) => !bone.has(`2,${22 + i}`) && bone.has(`0,${22 + i}`)), 'Bone ribs contain real negative space');
  const vine = projection(model('vine'));
  const pairedHoles = [...Array(28)].filter((_, i) => !vine.has(`2,${22 + i}`) && !vine.has(`-2,${22 + i}`) && vine.has(`0,${22 + i}`));
  assert(pairedHoles.length >= 4, 'The leaf blade has several mirrored perforations around a straight midrib');
  const lava = model('lava');
  assert(lava.meta.bounds.max[2] - lava.meta.bounds.min[2] > .5, 'Lava has a substantial three-dimensional furnace body');
  assert(lava.voxels.filter(v => v.material === 'magma').length > 100, 'Exposed orange molten channels remain visible');
});

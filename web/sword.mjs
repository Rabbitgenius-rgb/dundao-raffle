import * as THREE from './vendor/three.module.js';
import { getEvolutionInfo, getEvolutionStage } from './evolution.mjs';
import { ROUTES } from './game.mjs';

// Structural forms use a coarse design grid, then receive real 5 cm bevels,
// surface facets and inlay. Only exposed fine cells become GPU instances.
const CELL = 0.1;
const FINE_CELL = 0.05;
const ROUTE_IDS = new Set(ROUTES.map(route => route.id));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const keyOf = (x, y, z) => `${x},${y},${z}`;
const cellId = (x, y, z) => (x + 16) * 8192 + y * 32 + z + 8;
const NEIGHBOR_OFFSETS = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
  if (x || y || z) NEIGHBOR_OFFSETS.push(x * 8192 + y * 32 + z);
}

// Diagonal contact counts as connected in the stepped pixel lattice. This
// preserves authored stair-step fins, while genuinely detached charge motes
// remain separately identifiable and are not accidentally pruned as damage.
function connectedToHilt(voxels) {
  const cells = new Set([...voxels].map(v => cellId(v.x, v.y, v.z)));
  const origin = cellId(0, 0, 0);
  const connected = new Set();
  if (!cells.has(origin)) return connected;
  const queue = [origin];
  connected.add(origin);
  for (let i = 0; i < queue.length; i++) {
    for (const offset of NEIGHBOR_OFFSETS) {
      const neighbor = queue[i] + offset;
      if (cells.has(neighbor) && !connected.has(neighbor)) {
        connected.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return connected;
}

function hash(x, y, z, seed = 0) {
  let n = (Math.imul(x + 173, 73856093) ^ Math.imul(y + 43, 19349663) ^ Math.imul(z + 89, 83492791) ^ seed) >>> 0;
  n = Math.imul(n ^ (n >>> 16), 2246822507) >>> 0;
  return (n ^ (n >>> 13)) >>> 0;
}

const ROUTE_PALETTES = {
  lava: { steel: 0x50515c, edge: 0xc1bfba, spine: 0x252832, accent: 0xff5c20, core: 0xffc54e, extra: 0x6b6370 },
  frost: { steel: 0x6aabce, edge: 0xe4faff, spine: 0x3e638f, accent: 0x76e7ff, core: 0xd7ffff, extra: 0x8cbfe9 },
  storm: { steel: 0x7068ba, edge: 0xe8ddff, spine: 0x343954, accent: 0xb48cff, core: 0xfff3a1, extra: 0x6d88d7 },
  bone: { steel: 0xd4c5ab, edge: 0xfff0cf, spine: 0x796b78, accent: 0xb98aff, core: 0xedd4ff, extra: 0xe6d8be },
  vine: { steel: 0x487f72, edge: 0xc6e8a4, spine: 0x2e4e50, accent: 0x86e394, core: 0xe4ffc2, extra: 0x638d42 },
  carapace: { steel: 0x674984, edge: 0xd1b7df, spine: 0x2c263d, accent: 0xffb64e, core: 0xffe9a2, extra: 0x8d5fa0 },
  star: { steel: 0x3d5993, edge: 0xd1dcee, spine: 0x1d2d51, accent: 0xe9bf62, core: 0xffe5a3, extra: 0x6b88c2 },
  clockwork: { steel: 0x59616a, edge: 0xbcc2bd, spine: 0x2f323a, accent: 0xdf9445, core: 0xffc067, extra: 0x986640 },
  holy: { steel: 0xe0e6df, edge: 0xfff9ec, spine: 0x8c97a4, accent: 0xe3b45b, core: 0xe85a54, extra: 0xf9f0da },
  ocean: { steel: 0x258b91, edge: 0xbce8db, spine: 0x1b4c63, accent: 0x59e4d8, core: 0xf4ecda, extra: 0xe78970 },
  ghost: { steel: 0x323443, edge: 0x8d9eae, spine: 0x171a26, accent: 0x46e7b0, core: 0xafffe0, extra: 0x52586c },
  desert: { steel: 0xcba76e, edge: 0xf6e3b2, spine: 0x806943, accent: 0xd9ad55, core: 0x497ae1, extra: 0xb5925f },
};

function makePalette(selection, route) {
  const p = ROUTE_PALETTES[route];
  const handle = {
    wrap: [0x553c35, 0xa9784e],
    shark: [0x294b57, 0x6b9ba0],
    bronze: [0x574839, 0xc99c60],
    ebony: [0x272a38, 0x59546a],
  }[selection.handle] || [0x553c35, 0xa9784e];
  return {
    steel: { color: p?.steel ?? 0x8298ad, metalness: 0.65, roughness: 0.48 },
    edge: { color: p?.edge ?? 0xd7e5ec, metalness: 0.72, roughness: 0.34 },
    spine: { color: p?.spine ?? 0x48586d, metalness: 0.6, roughness: 0.6 },
    guard: { color: route === 'bone' ? 0xcbb48d : 0xb18a53, metalness: 0.68, roughness: 0.48 },
    wood: { color: handle[0], metalness: 0.04, roughness: 0.9 },
    wrap: { color: handle[1], metalness: selection.handle === 'bronze' ? 0.7 : 0.05, roughness: 0.68 },
    ornament: { color: p?.extra ?? 0x738298, metalness: route === 'vine' ? 0.08 : 0.38, roughness: 0.58 },
    accent: { color: p?.accent ?? 0xe0b26b, emissive: p?.accent ?? 0x000000, intensity: 0.6, metalness: 0.25, roughness: 0.35 },
    core: { color: p?.core ?? 0xf4d4a0, emissive: p?.core ?? 0x000000, intensity: 1.25, metalness: 0.2, roughness: 0.25 },
    dark: { color: 0x201c2b, metalness: 0.1, roughness: 1 },
    gold: { color: 0xf0c87b, metalness: 0.82, roughness: 0.28 },
    goldDark: { color: 0x947348, metalness: 0.72, roughness: 0.43 },
    gem: { color: p?.core ?? 0xf2d6a5, emissive: route === 'holy' ? 0x9f1f31 : p?.accent ?? 0x000000, intensity: 0.95, metalness: 0.35, roughness: 0.2 },
    magma: { color: 0xff481c, emissive: 0xff3008, intensity: 1.55, metalness: 0.04, roughness: 0.7 },
  };
}

function generateStructuralVoxels(state = {}) {
  const selection = {
    blade: state.selection?.blade || 'straight',
    handle: state.selection?.handle || 'wrap',
    guard: state.selection?.guard || 'disc',
  };
  const hits = clamp(Math.floor(state.hits || 0), 0, 15);
  const route = hits > 0 && ROUTE_IDS.has(state.route) ? state.route : null;
  const evolution = getEvolutionInfo(state);
  const stage = getEvolutionStage(state);
  const actualGrowth = route ? clamp(Math.floor(state.growth || 0), 0, 20) : 0;
  const growth = route ? Math.min(actualGrowth, 3 + stage.level * 3) : 0;
  const seed = route ? (Number(state.appearanceSeed) || 0) >>> 0 : 0;
  const map = new Map();
  const palettes = makePalette(selection, route);
  const add = (x, y, z, material = 'steel', overwrite = true) => {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (Math.abs(x) > 16 || y < 0 || y > 60 || Math.abs(z) > 6) return;
    const key = keyOf(x, y, z);
    if (overwrite || !map.has(key)) map.set(key, { x, y, z, material });
  };
  const box = (x0, y0, z0, x1, y1, z1, material, overwrite = true) => {
    for (let y = Math.round(y0); y <= Math.round(y1); y++) {
      for (let x = Math.round(x0); x <= Math.round(x1); x++) {
        for (let z = Math.round(z0); z <= Math.round(z1); z++) add(x, y, z, material, overwrite);
      }
    }
  };
  const line = (a, b, material, thickness = 0) => {
    const steps = Math.max(...a.map((v, i) => Math.abs(v - b[i])), 1);
    for (let t = 0; t <= steps; t++) {
      const pt = a.map((v, i) => v + (b[i] - v) * t / steps);
      for (let k = -thickness; k <= thickness; k++) add(pt[0] + k, pt[1], pt[2], material);
    }
  };
  const crystal = (x, y, z, height, lean = 0) => {
    for (let j = 0; j < height; j++) {
      const width = j === height - 1 ? 0 : j < height - 3 ? 1 : 0;
      const center = x + Math.round(lean * j / Math.max(1, height - 1));
      for (let i = -width; i <= width; i++) {
        add(center + i, y + j, z, i === -width ? 'edge' : 'accent');
        if (width) add(center + i, y + j, z - 1, 'ornament');
      }
      if (j % 3 === 1) add(center, y + j, z + 1, 'core');
    }
  };

  // Selected handle. Its construction and colors survive every evolution.
  box(-2, 0, -1, 2, 1, 1, 'guard');
  for (let y = 2; y <= 10; y++) {
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        let material = 'wood';
        if (selection.handle === 'wrap' && (y + x + z + 30) % 4 < 2) material = 'wrap';
        if (selection.handle === 'shark' && (x + y + z + 30) % 3 === 0) material = 'wrap';
        if (selection.handle === 'bronze' && [3, 6, 9].includes(y)) material = 'wrap';
        if (selection.handle === 'ebony' && x === -1 && z === 1) material = 'wrap';
        add(x, y, z, material);
      }
    }
  }
  box(-2, 10, -1, 2, 10, 1, 'guard');

  // Selected guard. Later ornament grows around this recognisable core.
  if (selection.guard === 'disc') {
    for (let x = -4; x <= 4; x++) {
      for (let z = -2; z <= 2; z++) {
        if (x * x / 20 + z * z / 7 <= 1) box(x, 11, z, x, 12, z, 'guard');
      }
    }
  } else if (selection.guard === 'cross') {
    box(-6, 11, -1, 6, 12, 1, 'guard');
    box(-6, 12, -1, -5, 13, 1, 'edge');
    box(5, 12, -1, 6, 13, 1, 'edge');
  } else if (selection.guard === 'beast') {
    box(-4, 11, -1, 4, 13, 1, 'guard');
    for (const side of [-1, 1]) {
      line([side * 4, 12, 0], [side * 6, 15, 0], 'guard');
      add(side * 2, 13, 2, 'dark');
      add(side, 11, 2, 'edge');
    }
    box(-1, 11, 2, 1, 12, 2, 'guard');
  } else {
    box(-2, 11, -1, 2, 12, 1, 'spine');
  }

  const bladeStart = 13;
  const level = stage?.level ?? 0;
  const baseRadius = { straight: 3, curved: 3, thick: 4, thin: 2 }[selection.blade] ?? 3;
  const bladeEnd = route ? Math.min(59, Math.round(stage.body.height / CELL) - 1) : 37;
  const bladeRows = bladeEnd - bladeStart + 1;
  const profile = [];
  const motionAnchors = [];
  const featureStructures = [];
  const anchor = (kind, x, y, z = 0) => motionAnchors.push({ kind, position: [x * CELL, (y + 0.5) * CELL, z * CELL], color: palettes.accent.color });
  const bodyRadius = route ? Math.max(1, (stage.body.width / CELL - 1) / 2) : baseRadius;
  const depth = route ? Math.max(0, Math.round((stage.body.depth / CELL - 1) / 2)) : 1;
  const gem = (x, y, z, radius = 1, material = 'gem') => {
    for (let dy = -radius; dy <= radius; dy++) {
      const half = Math.max(0, radius - Math.abs(dy));
      for (let dx = -half; dx <= half; dx++) {
        add(x + dx, y + dy, z, material);
        if (Math.abs(dx) + Math.abs(dy) < radius) add(x + dx, y + dy, z + 1, material);
      }
    }
    anchor('gem', x, y, z + 1);
  };

  // The approved sheets define different BODIES, not a common blade hidden
  // behind ornaments. The five straight routes always have a centered tip;
  // only the insect's articulated pincer is allowed to leave that axis.
  for (let row = 0; row < bladeRows; row++) {
    const t = row / Math.max(1, bladeRows - 1);
    const y = bladeStart + row;
    let center = !route && selection.blade === 'curved' ? Math.round(-Math.pow(t, 2.5) * 3) : 0;
    let radius = bodyRadius;
    if (!route) {
      const tip = selection.blade === 'thin' ? 9 : 6;
      if (row > bladeRows - tip) radius *= (bladeRows - row) / tip;
    } else if (route === 'lava') {
      // Wide, parallel shoulders with a centered short spear point.
      radius *= row < 3 ? .65 + row * .12 : 1;
      radius *= Math.min(1, (bladeRows - 1 - row) / (5 + level));
    } else if (route === 'frost') {
      // Much longer and slimmer than the other routes: a tapered crystal.
      radius *= (.72 + .28 * Math.sin(t * Math.PI)) * Math.min(1, (1 - t) / .23);
    } else if (route === 'storm') {
      radius *= Math.min(1, (1 - t) / .16);
      if (level >= 2 && row > 2 && t < .82 && row % 7 < 2) radius += .5;
    } else if (route === 'bone') {
      radius *= Math.min(1, (1 - t) / .19);
      if (level >= 2 && row > 2 && t < .8 && row % (level >= 5 ? 5 : 6) < 2) radius += .5;
    } else if (route === 'vine') {
      if (level < 2) { add(-2, 14, 1, 'accent'); add(2, 14, 1, 'accent'); }
      if (level >= 2) radius *= .13 + .87 * Math.pow(Math.sin(Math.PI * t), .72);
      else radius *= Math.min(1, (1 - t) / .2);
      if (level >= 5 && t > .1 && t < .85) radius *= row % 9 < 3 ? .8 : 1;
    } else if (route === 'star') {
      radius *= Math.min(1, (1 - t) / .16);
      if (level >= 4 && row > 5 && t < .78 && row % 9 < 2) radius += .5;
    } else if (route === 'clockwork') {
      radius *= Math.min(1, (1 - t) / .12);
      if (level >= 4 && row > 4 && t < .8 && row % 10 < 2) radius += .5;
    } else if (route === 'holy') {
      radius *= Math.min(1, (1 - t) / .19);
    } else if (route === 'ocean') {
      radius *= Math.min(1, (1 - t) / .15);
      if (level >= 3 && row > 5 && t < .8 && row % 8 < 2) radius += .5;
    } else if (route === 'ghost') {
      radius *= Math.min(1, (1 - t) / .18);
      if (level >= 3 && row > 5 && t < .8 && row % 8 < 2) radius += .6;
    } else if (route === 'desert') {
      radius *= (1 - .20 * t) * Math.min(1, (1 - t) / .18);
      if (level >= 3 && row > 4 && t < .75 && row % 8 < 3) radius += .5;
    } else if (route === 'carapace') {
      // The outer chitin arc curves left, then the long tip curls to the right.
      const bend = .14 + level * .09;
      center = Math.round((-Math.sin(Math.PI * t) * bend + Math.pow(t, 3) * (.24 + level * .13)) / CELL);
      radius *= (.6 + .4 * Math.sin(t * Math.PI)) * Math.min(1, (1 - t) / .18);
      if (level >= 2 && row % 6 < 2 && t > .15 && t < .8) radius += .8;
    }
    radius = Math.max(0, Math.round(radius));
    if (route && row === bladeRows - 1) radius = 0;
    profile.push({ center, radius });
    for (let x = center - radius; x <= center + radius; x++) {
      const localX = x - center;
      const side = Math.abs(localX);
      // Long axial slot bounded by two straight rails. 名品 consists of
      // aligned independent plates; those authored gaps are not damage debris.
      if (route === 'storm' && level >= 3 && row > 3 && t < .84) {
        if (side < Math.max(1, radius - (level >= 4 ? 1 : 0))) continue;
        if (level === 5 && row % 7 < 2) continue;
      }
      if (route === 'bone' && level >= 3 && row > 4 && t < .8) {
        const spacing = level >= 5 ? 5 : 6;
        if (side > 0 && side < radius && row % spacing > 1) continue;
      }
      if (route === 'vine' && level >= 4) {
        const windows = level === 4 ? [.48] : level === 5 ? [.32, .6] : [.24, .43, .62, .77];
        const opening = windows.some(f => Math.abs(t - f) < (level === 4 ? .075 : .043));
        if (opening && side >= 2 && side <= Math.max(2, radius - 1)) continue;
      }
      if (route === 'clockwork' && level >= 4 && radius >= 4 && row > 6 && t < .78 && side > 0 && side < radius - 1 && row % 9 >= 4) continue;
      if (route === 'ghost' && level >= 3 && radius >= 3 && row > 4 && t < .8 && side > 0 && side < radius && row % 8 >= 3) continue;
      let localDepth = depth;
      if (route === 'frost' && side === radius && radius > 0) localDepth = Math.max(0, depth - 1);
      if (route === 'carapace' && row % 6 < 4 && side < radius) localDepth++;
      for (let z = -localDepth; z <= localDepth; z++) {
        let material = side === radius ? 'edge' : 'steel';
        if (z < 0) material = 'spine';
        if (route === 'lava') {
          material = side === radius ? 'edge' : 'steel';
          const channel = level >= 4 && side <= (level >= 5 ? 1 : 0) && row > 3 && t < .88;
          const vent = level === 3 && side === 0 && row > 4 && row % 5 < 3 && t < .85;
          if ((channel || vent) && Math.abs(z) > 0) continue;
          if ((channel || vent) && z === 0) material = 'magma';
          if (side === 0 && level < 3 && row % 5 !== 0) material = 'magma';
          if (level >= 5 && side === radius - 1 && Math.abs(z) === localDepth) material = 'goldDark';
        } else if (route === 'frost') {
          material = side === radius ? 'edge' : Math.abs(z) === localDepth ? 'accent' : 'steel';
          if (side === 0 && Math.abs(z) === localDepth && row % 5 < 2) material = 'core';
          if (level === 0 && t < .75) material = side === radius ? 'edge' : 'steel';
        } else if (route === 'storm') {
          if (side === 0 && level < 3) material = 'accent';
          if (level >= 3 && side < radius) material = level === 6 ? 'gold' : 'accent';
        } else if (route === 'bone') {
          material = side === 0 ? (level === 6 ? 'gold' : 'steel') : side === radius ? 'edge' : 'ornament';
          if (side === 0 && z === localDepth && row % 6 < 3) material = 'accent';
        } else if (route === 'vine') {
          material = side === 0 ? (level >= 4 ? 'gold' : 'accent') : side === radius ? 'edge' : 'steel';
        } else if (route === 'carapace') {
          material = row % 6 === 4 ? (level >= 4 ? 'goldDark' : 'spine') : side === radius ? 'edge' : row % 6 < 2 ? 'ornament' : 'steel';
        } else if (route === 'star') {
          material = side === radius ? 'edge' : side === 0 ? 'accent' : 'steel';
          if (level >= 3 && side === radius - 1 && Math.abs(z) === localDepth) material = 'goldDark';
        } else if (route === 'clockwork') {
          material = side === radius ? 'edge' : z < 0 ? 'spine' : 'steel';
          if (level >= 2 && row % 7 < 2 && side < radius && Math.abs(z) === localDepth) material = 'goldDark';
        } else if (route === 'holy') {
          material = side === radius ? 'edge' : side === 0 ? 'accent' : 'steel';
          if (level >= 4 && side === 1 && Math.abs(z) === localDepth && row % 8 < 3) material = 'gold';
        } else if (route === 'ocean') {
          material = side === radius ? 'edge' : side <= 1 && Math.abs(z) === localDepth ? 'accent' : 'steel';
          if (z < 0) material = 'spine';
        } else if (route === 'ghost') {
          material = side === radius ? 'edge' : side === 0 ? 'accent' : 'steel';
          if (z < 0) material = 'spine';
        } else if (route === 'desert') {
          material = side === radius ? 'edge' : side === 0 && Math.abs(z) === localDepth ? 'core' : 'steel';
          if (level >= 3 && side === radius - 1 && Math.abs(z) === localDepth) material = 'goldDark';
        }
        add(x, y, z, material);
      }
    }
  }

  if (route) {
    const bodyCells = map.size;
    featureStructures.push({ id: stage.featureId, addedStructuralCells: bodyCells, mode: stage.body.mode });
    if (route === 'lava') {
      for (const sign of [-1, 1]) {
        for (let row = 3; row < bladeRows - 6; row++) {
          const { radius } = profile[row];
          if (level >= 3 && row % 5 === 0) {
            line([sign, bladeStart + row, depth], [sign * Math.max(1, radius - 1), bladeStart + row + 1, depth], 'magma');
          }
          if (level >= 5 && row % 6 < 4 && radius >= 3) {
            add(sign * (radius - 1), bladeStart + row, depth + 1, level === 6 ? 'goldDark' : 'ornament');
            if (row % 6 === 1) add(sign * (radius - 1), bladeStart + row, depth + 2, 'gold');
          }
        }
      }
      if (level >= 4) gem(0, 15 + level, depth + 1, level === 6 ? 2 : 1, level === 6 ? 'gem' : 'core');
      if (level === 6) {
        for (const side of [-1, 1]) line([side * 2, 14, 2], [side * 5, 16, 2], 'gold');
        anchor('furnace', 0, 23, depth + 1);
      }
    } else if (route === 'frost') {
      if (level >= 3) {
        const pairs = level >= 5 ? 2 : 1;
        for (let i = 0; i < pairs; i++) for (const side of [-1, 1]) {
          const x = side * (3 + i * 2);
          const y = 16 + i * 2;
          const height = Math.round(bladeRows * (.42 - i * .09));
          // Short parallel prisms, deliberately below the central sword tip.
          crystal(x, y, i ? -1 : 1, height, 0);
          line([side, 14 + i * 2, 0], [x, y + 2, 0], level === 6 ? 'gold' : 'edge');
        }
      }
      if (level >= 4) for (const side of [-1, 1]) {
        line([0, 15, depth + 1], [side * (level >= 5 ? 5 : 4), 22, depth + 1], level === 6 ? 'gold' : 'edge');
        line([side * (level >= 5 ? 5 : 4), 22, depth + 1], [0, 32 + level, depth + 1], 'edge');
      }
      if (level >= 5) gem(0, 22, depth + 2, level === 6 ? 2 : 1);
      if (level === 6) {
        for (const side of [-1, 1]) line([side * 2, 30, depth + 1], [side, 47, depth + 1], 'gold');
        anchor('prism', 0, bladeEnd - 2, 0);
      }
    } else if (route === 'storm') {
      if (level >= 3) {
        const positions = level === 6 ? [.18, .43, .68] : level === 5 ? [.26, .5, .72] : [.4];
        for (const fraction of positions) gem(0, bladeStart + Math.round(bladeRows * fraction), 0, level === 6 ? 2 : 1);
        for (const side of [-1, 1]) {
          for (let row = 5; row < bladeRows - 6; row += 7) {
            const x = side * profile[row].radius;
            add(x, bladeStart + row, depth + 1, level >= 5 ? 'gold' : 'core');
            if (level >= 4) add(x, bladeStart + row + 1, depth + 1, 'goldDark');
          }
        }
        anchor('rail', 0, bladeStart + Math.round(bladeRows * .55), 0);
      }
    } else if (route === 'bone') {
      if (level < 2) for (let row = 3; row < bladeRows - 3; row += 4) add(0, bladeStart + row, depth + 1, 'edge');
      if (level >= 2) for (let row = 4; row < bladeRows - 6; row += level >= 5 ? 5 : 6) {
        const r = profile[row].radius;
        for (const side of [-1, 1]) {
          line([side, bladeStart + row - 1, depth + 1], [side * r, bladeStart + row + 1, depth + 1], 'edge');
          if (level >= 5) add(side * r, bladeStart + row + 2, depth + 1, level === 6 ? 'gold' : 'ornament');
        }
      }
      if (level >= 4) for (const side of [-1, 1]) {
        const x = side * 4;
        box(x - 1, 12, 1, x + 1, 14, 2, 'ornament');
        add(x, 14, 3, 'dark');
        add(x + side, 13, 3, 'accent');
        add(x - side, 11, 2, 'edge');
        if (level >= 5) line([x, 14, 1], [x + side * 2, 16, 1], level === 6 ? 'gold' : 'edge');
      }
      if (level >= 5) gem(0, 17, depth + 2, level === 6 ? 2 : 1);
      if (level === 6) anchor('soul', 0, 36, depth + 1);
    } else if (route === 'vine') {
      if (level < 2) { add(-2, 14, 1, 'accent'); add(2, 14, 1, 'accent'); }
      if (level >= 2) for (let row = 5; row < bladeRows - 5; row += level >= 5 ? 5 : 7) {
        const r = Math.max(1, profile[row].radius - 1);
        for (const side of [-1, 1]) line([0, bladeStart + row - 2, depth + 1], [side * r, bladeStart + row + 1, depth + 1], level >= 4 ? 'gold' : 'accent');
      }
      if (level >= 3) for (const side of [-1, 1]) {
        line([side * 2, 12, 1], [side * 5, 15, 1], 'steel');
        add(side * 4, 14, 2, 'edge');
        if (level === 6) {
          for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) add(side * 5 + dx, 14 + dy, 3, 'edge');
          add(side * 5, 14, 4, 'gold');
        }
      }
      if (level >= 5) gem(0, 18, depth + 2, level === 6 ? 2 : 1);
      if (level === 6) anchor('leaf', 0, 34, depth + 1);
    } else if (route === 'star') {
      if (level >= 1) for (let row = 3; row < bladeRows - 4; row += 6) {
        add(0, bladeStart + row, depth + 1, row % 12 ? 'gold' : 'core');
        if (level >= 3) for (const side of [-1, 1]) add(side * Math.max(1, profile[row].radius - 1), bladeStart + row + 1, depth + 1, 'goldDark');
      }
      if (level >= 3) for (const side of [-1, 1]) {
        line([side, 14, depth + 1], [side * (4 + Math.floor(level / 2)), 16, depth + 1], 'gold');
        for (let row = 10; row < bladeRows - 7; row += 10) {
          const r = Math.max(1, profile[row].radius - 1), y = bladeStart + row;
          line([0, y - 3, depth + 1], [side * r, y, depth + 1], 'goldDark');
          line([side * r, y, depth + 1], [0, y + 3, depth + 1], 'goldDark');
        }
      }
      if (level >= 2) gem(0, 15 + Math.floor(level / 2), depth + 2, level === 6 ? 2 : 1);
      if (level === 6) {
        gem(0, 29, depth + 2, 2);
        for (const side of [-1, 1]) line([side * 4, 15, depth + 1], [side * 8, 18, depth + 1], 'gold');
        anchor('star-core', 0, 29, depth + 1);
      }
    } else if (route === 'clockwork') {
      const cog = (y, radius) => {
        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          if (distance === radius || (dx === 0 && dy === 0)) add(dx, y + dy, depth + 1, distance ? 'goldDark' : 'core');
        }
        for (const [dx, dy] of [[radius + 1,0],[-radius - 1,0],[0,radius + 1],[0,-radius - 1]]) add(dx, y + dy, depth + 1, 'gold');
      };
      if (level >= 2) for (let row = 8; row < bladeRows - 6; row += 11) cog(bladeStart + row, level >= 5 ? 2 : 1);
      if (level >= 3) for (const side of [-1, 1]) {
        for (let row = 4; row < bladeRows - 4; row += 7) {
          const r = Math.max(1, profile[row].radius - 1);
          line([side, bladeStart + row, depth + 1], [side * r, bladeStart + row + 2, depth + 1], 'goldDark');
        }
        line([side * 2, 13, depth + 1], [side * (4 + level), 14, depth + 1], 'gold');
      }
      if (level >= 2) gem(0, 15, depth + 2, level === 6 ? 2 : 1);
      if (level === 6) { cog(25, 3); gem(0, 25, depth + 2, 2); anchor('gear-heart', 0, 25, depth + 1); }
    } else if (route === 'holy') {
      if (level >= 2) gem(0, 15, depth + 2, level === 6 ? 2 : 1);
      if (level >= 3) for (const side of [-1, 1]) {
        const feathers = level - 1;
        for (let i = 0; i < feathers; i++) {
          line([side * 2, 13 + i, 1], [side * (5 + i + Math.floor(level / 2)), 15 + i * 2, 1], i % 2 ? 'edge' : 'ornament', 1);
          line([side * 3, 13 + i, 2], [side * (5 + i + Math.floor(level / 2)), 15 + i * 2, 2], 'goldDark');
        }
      }
      if (level >= 4) for (let row = 5; row < bladeRows - 5; row += 8) add(0, bladeStart + row, depth + 1, 'gold');
      if (level === 6) { gem(0, 24, depth + 2, 2); anchor('holy-wings', 0, 20, depth + 1); }
    } else if (route === 'ocean') {
      if (level >= 2) gem(0, 15, depth + 2, level === 6 ? 2 : 1);
      if (level >= 3) for (const side of [-1, 1]) {
        for (let row = 5; row < bladeRows - 6; row += 9) {
          const y = bladeStart + row, x = side * Math.max(2, profile[row].radius - 1);
          line([x, y - 2, depth + 1], [x + side * 2, y + 2, depth + 1], 'ornament');
          line([x + side, y, depth + 1], [x + side * 3, y + 1, depth + 1], 'ornament');
        }
        line([side * 2, 13, depth + 1], [side * (5 + level), 15, depth + 1], 'edge');
        line([side * 3, 14, depth + 1], [side * (4 + Math.floor(level / 2)), 18, depth + 1], 'goldDark');
      }
      if (level >= 4) for (let row = 4; row < bladeRows - 4; row++) {
        const x = Math.round(Math.sin(row * .35) * Math.min(2, profile[row].radius - 1));
        add(x, bladeStart + row, depth + 1, row % 5 === 0 ? 'core' : 'accent');
      }
      if (level === 6) { gem(0, 22, depth + 2, 2); anchor('tidal-pearl', 0, 22, depth + 1); }
    } else if (route === 'ghost') {
      if (level >= 2) gem(0, 15, depth + 2, level === 6 ? 2 : 1);
      if (level >= 3) for (const side of [-1, 1]) {
        line([side, 14, depth + 1], [side * (4 + level), 16, depth + 1], 'spine');
        for (let row = 6; row < bladeRows - 6; row += 8) {
          const r = Math.max(1, profile[row].radius - 1), y = bladeStart + row;
          line([side, y - 2, depth + 1], [side * r, y, depth + 1], 'ornament');
          line([side * r, y, depth + 1], [side, y + 2, depth + 1], 'ornament');
          add(0, y, depth + 1, 'core');
        }
      }
      if (level === 6) { gem(0, 26, depth + 2, 2); anchor('soul-flame', 0, 26, depth + 1); }
    } else if (route === 'desert') {
      if (level >= 2) gem(0, 15, depth + 2, level === 6 ? 2 : 1);
      if (level >= 3) for (const side of [-1, 1]) {
        line([side * 2, 13, depth + 1], [side * (4 + level), 13, depth + 1], 'gold');
        for (let row = 5; row < bladeRows - 5; row += 7) {
          const y = bladeStart + row, r = Math.max(1, profile[row].radius - 1);
          line([side, y, depth + 1], [side * r, y, depth + 1], 'goldDark');
          if (level >= 5) add(side * r, y + 1, depth + 1, 'gold');
        }
      }
      if (level >= 4) for (let row = 5; row < bladeRows - 5; row += 5) add(0, bladeStart + row, depth + 1, 'core');
      if (level === 6) { gem(0, 25, depth + 2, 2); anchor('desert-heart', 0, 25, depth + 1); }
    } else if (route === 'carapace') {
      // Armor follows the curved spine, then a separate inward-facing claw
      // branches from the lower hinge, creating the reference's open pincer.
      if (level >= 1) for (let row = 3; row < bladeRows - 5; row += 6) {
        const { center, radius } = profile[row];
        for (let x = center - radius; x <= center + radius; x++) add(x, bladeStart + row, depth + 1, level >= 4 ? 'goldDark' : 'ornament');
        add(center - radius, bladeStart + row, depth + 2, 'accent');
      }
      if (level >= 3) {
        const startY = 16 + Math.floor(level / 2);
        const reach = 5 + level;
        const top = 27 + level * 2;
        for (let y = startY; y <= top; y++) {
          const t = (y - startY) / (top - startY);
          const x = Math.round(Math.sin(t * Math.PI * .82) * reach);
          const width = y === top ? 0 : t < .7 ? (level >= 5 ? 2 : 1) : 1;
          for (let dx = -width; dx <= width; dx++) for (let z = -depth; z <= depth; z++) {
            add(x + dx, y, z, dx === -width ? 'edge' : y % 6 === 0 ? 'goldDark' : 'ornament');
          }
        }
        gem(1, startY + 2, depth + 2, level === 6 ? 2 : 1);
      }
      if (level >= 5) {
        for (let row = 7; row < bladeRows - 8; row += 6) {
          const { center, radius } = profile[row];
          line([center - radius, bladeStart + row, 0], [center - radius - 2, bladeStart + row - 2, 0], level === 6 ? 'gold' : 'edge');
        }
      }
      if (level === 6) anchor('hinge', 1, 22, depth + 2);
    }
    featureStructures.push({ id: `${stage.featureId}-surface`, addedStructuralCells: map.size - bodyCells });
  }

  // Carve local chunks out of the built shape. These are true gaps from every
  // viewing direction, not dark paint. Removing a damage record repairs the gap.
  let removedVoxels = 0;
  const damage = route ? (Array.isArray(state.damage) ? state.damage : []).slice(0, 3) : [];
  const connectedBeforeDamage = damage.length ? connectedToHilt(map.values()) : null;
  const protectedCore = new Set();
  if (damage.length) {
    // Follow a real connected path through slots, stepped rails and the curved
    // insect spine. A row-wise guess can jump across an opening at its base.
    const cells = new Map([...map.values()].map(v => [cellId(v.x, v.y, v.z), v]));
    const origin = cellId(0, 0, 0);
    const parents = new Map([[origin, null]]);
    const queue = [origin];
    let tip = origin;
    for (let i = 0; i < queue.length; i++) {
      const current = cells.get(queue[i]);
      const highest = cells.get(tip);
      if (current.y > highest.y || (current.y === highest.y && Math.abs(current.z) < Math.abs(highest.z))) tip = queue[i];
      for (const offset of NEIGHBOR_OFFSETS) {
        const next = queue[i] + offset;
        if (cells.has(next) && !parents.has(next)) { parents.set(next, queue[i]); queue.push(next); }
      }
    }
    for (let cursor = tip; cursor !== null; cursor = parents.get(cursor)) {
      const v = cells.get(cursor);
      protectedCore.add(keyOf(v.x, v.y, v.z));
    }
  }
  if (damage.length) for (let row = 0; row < profile.length; row++) {
    const key = keyOf(profile[row].center, bladeStart + row, 0);
    if (map.has(key) && connectedBeforeDamage.has(cellId(profile[row].center, bladeStart + row, 0))) protectedCore.add(key);
  }
  const damageAnchors = [];
  for (const injury of damage) {
    const site = clamp(Math.floor(injury.site || 0), 0, 5);
    const severity = clamp(Math.floor(injury.severity || 1), 1, 2);
    const fraction = [0.76, 0.48, 0.2, 0, 0, 0.96][site];
    const targetY = site === 3 || site === 4 ? 12 : Math.round(bladeStart + fraction * (bladeRows - 1));
    const side = [ -1, 1, -1, -1, 1, 1 ][site];
    const candidates = [...map.values()].filter(v => Math.abs(v.y - targetY) <= (site === 3 || site === 4 ? 1 : 2));
    if (!candidates.length) continue;
    candidates.sort((a, b) => side * (b.x - a.x) || Math.abs(a.y - targetY) - Math.abs(b.y - targetY));
    const anchor = candidates[0];
    const radius = severity === 2 ? 3.3 : 2.4;
    damageAnchors.push({ site, x: anchor.x * CELL, y: (anchor.y + 0.5) * CELL, severity });
    for (const [key, voxel] of map) {
      // Preserve a narrow metal backbone, including the turn into a forked tip.
      // Local damage may expose that spine but must not sever the whole blade.
      if (protectedCore.has(key)) continue;
      const dx = voxel.x - anchor.x + side * 0.4;
      const dy = (voxel.y - anchor.y) * 0.88;
      const distance = dx * dx + dy * dy;
      if (distance < radius * radius) {
        map.delete(key);
        removedVoxels++;
      } else if (distance < (radius + 1.2) ** 2 && voxel.z >= 0) {
        voxel.material = 'dark';
      }
    }
    for (let j = 2; j < 6; j++) {
      const y = anchor.y - j;
      const x = anchor.x - side * Math.floor(j / 2);
      const surface = [...map.values()].filter(v => v.x === x && v.y === y).sort((a, b) => b.z - a.z)[0];
      if (surface && !protectedCore.has(keyOf(surface.x, surface.y, surface.z))) surface.material = 'dark';
    }
  }
  let detachedFragmentsRemoved = 0;
  if (connectedBeforeDamage) {
    const connectedAfterDamage = connectedToHilt(map.values());
    for (const [key, voxel] of map) {
      const id = cellId(voxel.x, voxel.y, voxel.z);
      if (connectedBeforeDamage.has(id) && !connectedAfterDamage.has(id)) {
        map.delete(key);
        detachedFragmentsRemoved++;
      }
    }
    removedVoxels += detachedFragmentsRemoved;
  }

  const voxels = [...map.values()];
  let fingerprint = 2166136261;
  let maxX = 0, maxY = 0, maxZ = 0, minX = 0, minZ = 0;
  for (const voxel of voxels) {
    const encoded = `${voxel.x},${voxel.y},${voxel.z}:${voxel.material}`;
    for (let i = 0; i < encoded.length; i++) fingerprint = Math.imul(fingerprint ^ encoded.charCodeAt(i), 16777619) >>> 0;
    maxX = Math.max(maxX, voxel.x + 0.5); minX = Math.min(minX, voxel.x - 0.5);
    maxY = Math.max(maxY, voxel.y + 1); maxZ = Math.max(maxZ, voxel.z + 0.5); minZ = Math.min(minZ, voxel.z - 0.5);
  }
  return {
    voxels,
    palette: palettes,
    protectedCells: protectedCore,
    connectedBeforeDamage,
    bladeProfile: profile,
    bladeStart,
    meta: {
      route, growth: actualGrowth, shapeGrowth: growth, hits, selection, seed,
      evolution,
      featureStructures,
      motionAnchors,
      voxelCount: voxels.length,
      removedVoxels,
      detachedFragmentsRemoved,
      protectedCoreVoxels: protectedCore.size,
      damageAnchors,
      hammerMarks: [],
      hammerMarkVoxels: 0,
      fingerprint: fingerprint.toString(16).padStart(8, '0'),
      bounds: { min: [minX * CELL, 0, minZ * CELL], max: [maxX * CELL, maxY * CELL, maxZ * CELL] },
    },
  };
}

/** Fine exposed voxels, with genuine half-cell bevels, facets and inset glyphs. */
export function generateSwordVoxels(state = {}) {
  const structural = generateStructuralVoxels(state);
  const coarse = new Map(structural.voxels.map(v => [keyOf(v.x, v.y, v.z), v]));
  const fine = new Map();
  let bevelCells = 0;
  for (const voxel of structural.voxels) {
    for (const dx of [-1, 0]) for (const dy of [0, 1]) for (const dz of [-1, 0]) {
      const sx = dx < 0 ? -1 : 1;
      const sz = dz < 0 ? -1 : 1;
      const exposedX = !coarse.has(keyOf(voxel.x + sx, voxel.y, voxel.z));
      const exposedZ = !coarse.has(keyOf(voxel.x, voxel.y, voxel.z + sz));
      const diagonalBridge = [-1, 1].some(y => coarse.has(keyOf(voxel.x + sx, voxel.y + y, voxel.z)));
      // Remove the fine outer corner, leaving a real 45-degree stepped bevel.
      // A diagonal structural link is never bevelled away.
      if (!structural.protectedCells.has(keyOf(voxel.x, voxel.y, voxel.z)) && voxel.material === 'edge' && voxel.y > 13 && exposedX && exposedZ && !diagonalBridge && dx === (voxel.x < 0 ? -1 : 0) && dz === 0) {
        bevelCells++;
        continue;
      }
      const v = { x: voxel.x * 2 + dx, y: voxel.y * 2 + dy, z: voxel.z * 2 + dz, material: voxel.material };
      fine.set(keyOf(v.x, v.y, v.z), v);
    }
  }

  const stage = getEvolutionStage(state);
  let inlayCells = 0, facetCuts = 0, moltenSeamCells = 0;
  if (stage) {
    const cut = [];
    for (const [key, voxel] of fine) {
      if (voxel.y < 28 || !['steel', 'spine', 'ornament', 'edge'].includes(voxel.material)) continue;
      const front = voxel.z >= 0 && !fine.has(keyOf(voxel.x, voxel.y, voxel.z + 1));
      const back = voxel.z < 0 && !fine.has(keyOf(voxel.x, voxel.y, voxel.z - 1));
      if (!front && !back) continue;
      const bladeRow = Math.floor(voxel.y / 2) - structural.bladeStart;
      const bladeSection = structural.bladeProfile[bladeRow];
      if (state.route === 'lava' && bladeSection && bladeRow >= 2 && bladeRow < structural.bladeProfile.length - 3) {
        const seam = bladeSection.center * 2 + Math.round(Math.sin(voxel.y * 0.24) * 2);
        const branch = voxel.y % 14 < 2 && Math.abs(voxel.x - bladeSection.center * 2) <= Math.max(2, bladeSection.radius);
        if (Math.abs(voxel.x - seam) <= 1 || branch) {
          voxel.material = 'magma';
          moltenSeamCells++;
          continue;
        }
      }
      const period = stage.legendary ? 9 : 15;
      const diagonal = ((voxel.x - Math.floor(voxel.y / 3)) % period + period) % period;
      const crossbar = voxel.y % (stage.legendary ? 10 : 16) === 0 && Math.abs(voxel.x) % 8 <= 2;
      if (stage.gilded && stage.level >= (state.route === 'frost' ? 5 : 4) && (diagonal === 0 || crossbar)) {
        voxel.material = diagonal === 0 ? 'gold' : 'goldDark';
        inlayCells++;
      } else if (stage.level >= 1 && voxel.material === 'steel' && (voxel.x * 3 + voxel.y * 2 + 1000) % 31 === 0) {
        const below = keyOf(voxel.x, voxel.y, voxel.z + (front ? -1 : 1));
        const parent = keyOf(Math.floor((voxel.x + 1) / 2), Math.floor(voxel.y / 2), Math.floor((voxel.z + 1) / 2));
        if (fine.has(below) && !structural.protectedCells.has(parent)) {
          cut.push(key);
          fine.get(below).material = 'spine';
        }
      }
    }
    for (const key of cut) if (fine.delete(key)) facetCuts++;
  }

  // Fine bevels around a damaged perforation can uncover a tiny diagonal
  // fragment. Remove only fragments from the formerly connected main body;
  // intentional floating storm plates retain their authored positions.
  let detachedFineFragmentsRemoved = 0;
  if (structural.connectedBeforeDamage) {
    const id = (x, y, z) => (x + 40) * 32768 + y * 128 + z + 16;
    const offsets = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (x || y || z) offsets.push(x * 32768 + y * 128 + z);
    }
    const cells = new Set([...fine.values()].map(v => id(v.x, v.y, v.z)));
    const queue = [id(0, 0, 0)], attached = new Set(queue);
    for (let i = 0; i < queue.length; i++) for (const offset of offsets) {
      const next = queue[i] + offset;
      if (cells.has(next) && !attached.has(next)) { attached.add(next); queue.push(next); }
    }
    for (const [key, v] of fine) {
      const parent = cellId(Math.floor((v.x + 1) / 2), Math.floor(v.y / 2), Math.floor((v.z + 1) / 2));
      if (structural.connectedBeforeDamage.has(parent) && !attached.has(id(v.x, v.y, v.z))) {
        fine.delete(key); detachedFineFragmentsRemoved++;
      }
    }
  }

  // Accepted strikes leave shallow, real fine-cell facets on both surfaces.
  // They remain visible even when growth/score/scars have saturated. Applying
  // these at 5 cm instead of the design grid keeps channels and gems legible.
  const hammerMarks = [];
  if (stage) {
    const columns = new Map();
    for (const voxel of fine.values()) {
      const row = Math.floor(voxel.y / 2) - structural.bladeStart;
      const section = structural.bladeProfile[row];
      if (!section || row < 2 || row > structural.bladeProfile.length * .79) continue;
      if (Math.abs((voxel.x + .5) / 2 - section.center) > section.radius + .5) continue;
      const key = `${voxel.x},${voxel.y}`;
      const column = columns.get(key);
      if (column) {
        if (voxel.z > column.front) { column.front = voxel.z; column.frontMaterial = voxel.material; }
        if (voxel.z < column.back) column.back = voxel.z;
      } else columns.set(key, { x: voxel.x, y: voxel.y, front: voxel.z, back: voxel.z, frontMaterial: voxel.material, uses: 0 });
    }
    let candidates = [...columns.values()].filter(v => !['gem', 'core', 'gold', 'magma'].includes(v.frontMaterial));
    if (candidates.length < 24) candidates = [...columns.values()].filter(v => v.frontMaterial !== 'gem');
    for (let i = 0; i < structural.meta.hits; i++) {
      const kind = state.history?.find(event => event.hit === i + 1)?.kind || 'growth';
      const material = kind === 'damage' ? 'spine' : kind === 'repair' ? 'goldDark' : i % 3 === 0 ? 'edge' : 'steel';
      const targetY = structural.bladeStart * 2 + 5 + (i * 7) % Math.max(8, Math.floor(structural.bladeProfile.length * 1.35));
      const targetX = (i % 2 ? 1 : -1) * 3;
      candidates.sort((a, b) => {
        const rank = v => v.uses * 80 + Math.abs(v.y - targetY) * 3 + Math.abs(v.x - targetX);
        return rank(a) - rank(b) || a.y - b.y || a.x - b.x;
      });
      let frontCells = 0, backCells = 0;
      for (const column of candidates) {
        let used = false;
        if (frontCells < 6 && column.front < 12) {
          const voxel = { x: column.x, y: column.y, z: ++column.front, material };
          fine.set(keyOf(voxel.x, voxel.y, voxel.z), voxel);
          frontCells++; used = true;
        }
        if (backCells < 6 && column.back > -13) {
          const voxel = { x: column.x, y: column.y, z: --column.back, material };
          fine.set(keyOf(voxel.x, voxel.y, voxel.z), voxel);
          backCells++; used = true;
        }
        if (used) column.uses++;
        if (frontCells === 6 && backCells === 6) break;
      }
      hammerMarks.push({ hit: i + 1, kind, frontCells, backCells });
    }
  }

  // Full internal cubes have no visible contribution. Emit only the boundary
  // shell, so finer pixels and elaborate divine forms stay within GPU budgets.
  const voxels = [];
  const normals = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const voxel of fine.values()) {
    if (normals.some(([x, y, z]) => !fine.has(keyOf(voxel.x + x, voxel.y + y, voxel.z + z)))) voxels.push(voxel);
  }
  let fingerprint = 2166136261;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const voxel of voxels) {
    const encoded = `${voxel.x},${voxel.y},${voxel.z}:${voxel.material}`;
    for (let i = 0; i < encoded.length; i++) fingerprint = Math.imul(fingerprint ^ encoded.charCodeAt(i), 16777619) >>> 0;
    for (const [index, value] of [voxel.x, voxel.y, voxel.z].entries()) {
      min[index] = Math.min(min[index], value * FINE_CELL);
      max[index] = Math.max(max[index], (value + 1) * FINE_CELL);
    }
  }
  return {
    voxels,
    palette: structural.palette,
    meta: {
      ...structural.meta,
      hammerMarks,
      hammerMarkVoxels: hammerMarks.reduce((total, mark) => total + mark.frontCells + mark.backCells, 0),
      cellSize: FINE_CELL,
      gridOrigin: [0.5, 0.5, 0.5],
      structuralVoxelCount: structural.voxels.length,
      solidVoxelCount: fine.size,
      culledInteriorVoxels: fine.size - voxels.length,
      bevelCells,
      inlayCells,
      facetCuts,
      moltenSeamCells,
      detachedFineFragmentsRemoved,
      voxelCount: voxels.length,
      fingerprint: fingerprint.toString(16).padStart(8, '0'),
      bounds: { min, max },
    },
  };
}

export function buildSword(state) {
  const { voxels, palette, meta } = generateSwordVoxels(state);
  const group = new THREE.Group();
  group.name = `voxel-sword-${meta.route || 'unawakened'}`;
  group.userData = { ...meta };
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const bins = new Map();
  for (const voxel of voxels) {
    if (!bins.has(voxel.material)) bins.set(voxel.material, []);
    bins.get(voxel.material).push(voxel);
  }
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(meta.cellSize * 0.985, meta.cellSize * 0.985, meta.cellSize * 0.985);
  const rotation = new THREE.Quaternion();
  const color = new THREE.Color();
  for (const [name, cells] of bins) {
    const p = palette[name];
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: p.metalness,
      roughness: p.roughness,
      emissive: p.emissive || 0x000000,
      emissiveIntensity: p.intensity || 0,
      flatShading: true,
      // The weapon is a foreground object even in the long-lens atlas.
      // Environment fog must not wash its elemental colors into the backdrop.
      fog: false,
      // Keep luminous inlays saturated; the non-emissive metal still uses the
      // scene's lighting and filmic response. No geometry or palette reroll.
      toneMapped: !(p.emissive && p.intensity > 0),
    });
    const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
    mesh.name = `sword-${name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    cells.forEach((voxel, index) => {
      position.set((voxel.x + 0.5) * meta.cellSize, (voxel.y + 0.5) * meta.cellSize, (voxel.z + 0.5) * meta.cellSize);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
      const grain = hash(voxel.x, voxel.y, voxel.z, meta.seed) % 7;
      color.setHex(p.color).multiplyScalar(0.91 + grain * 0.025);
      mesh.setColorAt(index, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

export function disposeSword(group) {
  if (!group || group.userData?.disposed) return;
  const geometries = new Set();
  const materials = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
    if (object.isInstancedMesh) object.dispose();
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  group.clear();
  group.userData.disposed = true;
}

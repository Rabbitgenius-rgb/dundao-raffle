// Presentation only: these curves never consume the game's random source.
export const HAMMER_TIMING = Object.freeze({ duration: 880, reducedDuration: 240, impactAt: .43, holdMs: 30 });
const clamp = value => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const REST = [1.7, 3.8, .55];
const LIFT = [1.84, 4.16, .67];

export function impactStrength(kind) {
  return ({ growth: 1, surge: 1.12, awakening: 1.25, damage: .95, repair: .85 })[kind] || 1;
}

export function hammerPose(progress, contact, reducedMotion = false) {
  const t = clamp(progress), hit = HAMMER_TIMING.impactAt;
  const duration = reducedMotion ? HAMMER_TIMING.reducedDuration : HAMMER_TIMING.duration;
  const release = hit + HAMMER_TIMING.holdMs / duration;
  const target = [contact.x, contact.y + .31, contact.z];
  const interpolate = (from, to, amount) => from.map((value, index) => mix(value, to[index], amount));
  if (reducedMotion) {
    const k = t < hit ? smooth(t / hit) : t < release ? 1 : 1 - smooth((t - release) / (1 - release));
    return { position: interpolate(REST, target, k), rotation: [0, mix(-.15, 0, k), mix(-.65, 0, k)] };
  }
  if (t < .18) {
    const u = smooth(t / .18);
    return { position: interpolate(REST, LIFT, u), rotation: [0, mix(-.15, -.2, u), mix(-.65, -.86, u)] };
  }
  if (t < hit) {
    const u = (t - .18) / (hit - .18), fall = u * u;
    const position = interpolate(LIFT, target, fall);
    position[2] += .09 * Math.sin(Math.PI * u);
    // The face levels before contact; the head accelerates all the way down.
    const angle = smooth(u);
    return { position, rotation: [0, mix(-.2, 0, angle), mix(-.86, 0, angle)] };
  }
  if (t < release) return { position: target, rotation: [0, 0, 0] };
  const rebound = [target[0] + .09, target[1] + .27, target[2] + .035];
  if (t < .64) {
    const u = (t - release) / (.64 - release), spring = 1 - (1 - u) ** 3;
    return { position: interpolate(target, rebound, spring), rotation: [0, -.025 * spring, -.075 * spring] };
  }
  const u = smooth((t - .64) / .36);
  return { position: interpolate(rebound, REST, u), rotation: [0, mix(-.025, -.15, u), mix(-.075, -.65, u)] };
}

export function impactResponse(age, strength = 1, reducedMotion = false) {
  if (reducedMotion || !Number.isFinite(age) || age < 0 || age > .45) {
    return { bladeY: 0, bladeTilt: 0, cameraX: 0, cameraY: 0, flash: 0 };
  }
  const decay = Math.exp(-age * 22) * strength;
  return {
    bladeY: -.018 * Math.sin(age * 92) * decay,
    bladeTilt: .004 * Math.sin(age * 112) * decay,
    cameraX: .019 * Math.sin(age * 97) * decay,
    cameraY: -.035 * Math.sin(age * 82) * decay,
    flash: Math.exp(-age * 52) * strength,
  };
}

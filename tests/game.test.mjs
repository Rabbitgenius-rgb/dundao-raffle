import test from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, ROUTES, TOTAL_HITS, MAX_SCORE, createGame, advance, getTier, formatScore } from '../web/game.mjs';
import { simulateBalance } from '../verification/simulate-balance.mjs';

const baseSelection = { blade: 'curved', handle: 'ebony', guard: 'beast' };
const create = (selection = baseSelection) => createGame(selection, () => 0.123456);

function sequence(values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'The rule consumed more random draws than its contract allows.');
    return values[index++];
  };
}

function strike(state, roll = 0.8, power = 0.5, detail = 0.5, routeIndex = 0) {
  const values = state.route === null ? [(routeIndex + 0.5) / ROUTES.length, roll, power, detail] : [roll, power, detail];
  return advance(state, sequence(values));
}

test('selection is validated, copied, and kept immutable before any route is revealed', () => {
  const selection = { ...baseSelection };
  const game = create(selection);
  selection.blade = 'thin';
  assert.deepEqual(game.selection, baseSelection);
  assert.equal(game.route, null);
  assert.equal(game.hits, 0);
  assert.equal(game.score, 0);
  assert.equal(game.growth, 0);
  assert.deepEqual(game.damage, []);
  assert.equal(game.lastEvent, null);
  assert.equal(game.totalHits, 15);
  assert.throws(() => { game.selection.blade = 'straight'; }, TypeError);
  assert.throws(() => createGame({ blade: 'fake' }), /无效/);
  assert.throws(() => createGame({ route: 'lava' }), /未知/);
  assert.throws(() => createGame(null), TypeError);
  assert.throws(() => createGame({}, () => 1), /随机源/);
});

test('a completed game accepts exactly 15 strikes and never consumes more randomness', () => {
  let state = create();
  const seed = state.appearanceSeed;
  const initial = JSON.stringify(state);
  const previousStates = [];
  for (let index = 0; index < TOTAL_HITS; index++) {
    previousStates.push({ state, snapshot: JSON.stringify(state) });
    state = strike(state);
    assert.equal(state.hits, index + 1);
    assert.equal(state.history.length, index + 1);
    assert.equal(state.complete, index + 1 === 15);
    assert.equal(state.appearanceSeed, seed);
    assert.deepEqual(state.selection, baseSelection);
    assert.equal(state.route, 'lava');
  }
  assert.equal(JSON.stringify(previousStates[0].state), initial);
  for (const entry of previousStates) assert.equal(JSON.stringify(entry.state), entry.snapshot);
  const afterCompletion = advance(state, () => { throw new Error('Completed games must not roll.'); });
  assert.equal(afterCompletion, state);
  assert.equal(state.history.filter((event) => event.routeRevealed).length, 1);
  assert.equal(state.history.reduce((sum, event) => sum + event.delta, 0), state.score);
});

test('local damage deducts points and growth, repair fixes a scar without changing the route', () => {
  let state = strike(create(), 0.18, 0.9, 0.2, 3);
  const intact = state;
  state = strike(state, 0.03, 0.8, 0.2);
  assert.equal(state.lastEvent.kind, 'damage');
  assert.ok(state.lastEvent.delta < 0);
  assert.equal(state.growth, intact.growth - 1);
  assert.equal(state.damage.length, 1);
  assert.equal(state.damage[0].severity, 2);
  assert.equal(intact.damage.length, 0);
  const wounded = state;
  state = strike(state, 0.5, 0.2, 0.5);
  assert.equal(state.lastEvent.kind, 'repair');
  assert.ok(state.lastEvent.delta > 0);
  assert.equal(state.damage.length, 0);
  assert.equal(wounded.damage.length, 1);
  assert.equal(state.route, 'bone');
});

test('damage on the final strike survives settlement; no automatic recovery occurs', () => {
  let state = create();
  for (let index = 0; index < 14; index++) state = strike(state);
  const scoreBefore = state.score;
  state = strike(state, 0.03, 0.7, 0.9);
  assert.equal(state.hits, 15);
  assert.equal(state.complete, true);
  assert.equal(state.lastEvent.kind, 'damage');
  assert.ok(state.score < scoreBefore);
  assert.equal(state.damage.length, 1);
  const finalSnapshot = JSON.stringify(state);
  advance(state, () => 0.5);
  assert.equal(JSON.stringify(state), finalSnapshot);
});

test('damage stays local and bounded through repeated poor luck', () => {
  let state = strike(create());
  for (let index = 1; index < TOTAL_HITS; index++) {
    state = strike(state, 0.01, 0.99, (index % 6) / 6);
    assert.ok(state.damage.length <= 3);
    assert.equal(new Set(state.damage.map((scar) => scar.site)).size, state.damage.length);
    assert.ok(state.damage.every((scar) => [1, 2].includes(scar.severity)));
    assert.ok(state.damage.every((scar) => scar.site >= 0 && scar.site <= 5));
    assert.ok(state.growth >= 0 && state.growth <= 20);
    assert.ok(state.score >= 0 && state.score <= MAX_SCORE);
  }
  assert.equal(state.score, 0);
  assert.deepEqual(state.selection, baseSelection);
});

test('the displayed delta matches the cap and floor, and maximum score is reachable', () => {
  let state = strike(create(), 0.075, 0.999999, 0.3);
  assert.equal(state.lastEvent.kind, 'awakening');
  for (let index = 1; index < TOTAL_HITS; index++) state = strike(state, 0.075, 0.999999, 0.3);
  assert.equal(state.score, 100000);
  assert.equal(state.lastEvent.delta, 0);
  assert.ok(state.lastEvent.nominalDelta > 0);
  assert.equal(state.history.reduce((sum, event) => sum + event.delta, 0), MAX_SCORE);
  const almostCapped = { ...strike(create()), score: 99999 };
  const capped = strike(almostCapped);
  assert.equal(capped.score, 100000);
  assert.equal(capped.lastEvent.delta, 1);
  const nearFloor = { ...strike(create()), score: 10 };
  const floored = strike(nearFloor, 0.03, 0.999999);
  assert.equal(floored.score, 0);
  assert.equal(floored.lastEvent.delta, -10);
  assert.equal(floored.lastEvent.nominalDelta, -2800);
});

test('every route and all 64 part combinations produce identical event math for the same draws', () => {
  const eventSequence = [
    [0.8, 0.2, 0.1], [0.03, 0.8, 0.3], [0.5, 0.6, 0.2],
    [0.18, 0.1, 0.8], [0.075, 0.9, 0.1], [0.8, 0.6, 0.5],
    [0.03, 0.2, 0.7], [0.03, 0.8, 0.3], [0.5, 0.9, 0.1],
    [0.8, 0.5, 0.7], [0.18, 0.5, 0.5], [0.8, 0.8, 0.4],
    [0.075, 0.6, 0.2], [0.5, 0.3, 0.1], [0.03, 0.4, 0.5],
  ];
  let baseline;
  for (let routeIndex = 0; routeIndex < ROUTES.length; routeIndex++) {
    for (const blade of PARTS.blade) for (const handle of PARTS.handle) for (const guard of PARTS.guard) {
      const selection = { blade: blade.id, handle: handle.id, guard: guard.id };
      let state = create(selection);
      for (const [roll, power, detail] of eventSequence) state = strike(state, roll, power, detail, routeIndex);
      assert.equal(state.route, ROUTES[routeIndex].id);
      assert.deepEqual(state.selection, selection);
      const measured = {
        score: state.score, growth: state.growth, damage: state.damage,
        events: state.history.map(({ kind, delta, nominalDelta }) => ({ kind, delta, nominalDelta })),
        tier: getTier(state.score),
      };
      if (!baseline) baseline = measured;
      else assert.deepEqual(measured, baseline);
    }
  }
});

test('tiers are based on final score, and all event labels are complete', () => {
  assert.equal(getTier(0).name, '废铁');
  assert.equal(getTier(40000).name, '凡品');
  assert.equal(getTier(55000).name, '良品');
  assert.equal(getTier(68000).name, '精品');
  assert.equal(getTier(82000).name, '名品');
  assert.equal(getTier(95000).name, '神品');
  assert.equal(getTier(MAX_SCORE).name, '神品');
  assert.equal(formatScore(73506), '73,506');
  for (let routeIndex = 0; routeIndex < ROUTES.length; routeIndex++) {
    let state = strike(create(), 0.8, 0.5, 0.5, routeIndex);
    for (const roll of [0.03, 0.5, 0.18, 0.075, 0.8]) {
      state = strike(state, roll);
      assert.ok(state.lastEvent.title.length > 0);
      assert.ok(state.lastEvent.description.length > 0);
      assert.ok(!JSON.stringify(state).includes('undefined'));
    }
  }
});

test('event boundaries preserve damage protection, repair eligibility and the new odds',()=>{
  const wounded=strike(strike(create()),.03);
  for(const [roll,kind] of [
    [0,'damage'],[.059999,'damage'],[.06,'awakening'],[.090999,'awakening'],
    [.091,'surge'],[.270999,'surge'],[.271,'repair'],[.530999,'repair'],[.531,'growth'],[.999999,'growth'],
  ])assert.equal(strike(wounded,roll).lastEvent.kind,kind,`roll ${roll}`);
  assert.equal(strike(create(),.03).lastEvent.kind,'growth');
  assert.equal(strike(create(),.5).lastEvent.kind,'growth');
  assert.equal(strike(wounded,.03,0).lastEvent.nominalDelta,-1200);
  assert.equal(strike(wounded,.03,.999999).lastEvent.nominalDelta,-2800);
});

test('complete-game distribution keeps top quality near 1% and most blades intact',()=>{
  const result=simulateBalance(100000,20261113);
  const top=result.tiers.at(-1).count/result.games;
  assert.ok(top>.0085&&top<.0115,`God-tier rate ${top}`);
  assert.ok(result.tiers[0].percent<.1,'Scrap must remain uncommon');
  assert.ok(result.tiers[0].percent+result.tiers[1].percent<1,'Low-tier finishes must stay below 1%');
  assert.ok(result.completeBladePercent>75,'Most blades should finish without scars');
  assert.ok(result.damagePerEligibleStrikePercent>5.7&&result.damagePerEligibleStrikePercent<6.3);
});

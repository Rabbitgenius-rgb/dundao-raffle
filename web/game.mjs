/** Pure, route-neutral rules for the local forging demo. */
export const TOTAL_HITS = 15;
export const MAX_SCORE = 100000;

const freezeItems = (items) => Object.freeze(items.map((item) => Object.freeze(item)));

export const PARTS = Object.freeze({
  blade: freezeItems([
    { id: 'straight', name: '直刃' },
    { id: 'curved', name: '弯刃' },
    { id: 'thick', name: '厚背' },
    { id: 'thin', name: '细身' },
  ]),
  handle: freezeItems([
    { id: 'wrap', name: '缠绳柄' },
    { id: 'shark', name: '鲨皮柄' },
    { id: 'bronze', name: '铜环柄' },
    { id: 'ebony', name: '黑檀柄' },
  ]),
  guard: freezeItems([
    { id: 'disc', name: '圆盘护手' },
    { id: 'cross', name: '十字护手' },
    { id: 'beast', name: '兽首护手' },
    { id: 'none', name: '无护手' },
  ]),
});

export const ROUTES = freezeItems([
  { id: 'lava', name: '熔岩巨刃', color: '#ff7749', subtitle: '熔岩脉络 · 厚重裂刃' },
  { id: 'frost', name: '霜晶长刃', color: '#8bdcff', subtitle: '晶簇生长 · 细长冰刃' },
  { id: 'storm', name: '雷霆裂刃', color: '#c2a4ff', subtitle: '电弧刻痕 · 分叉雷刃' },
  { id: 'bone', name: '龙骨妖刃', color: '#e5d4ae', subtitle: '骨翼舒展 · 弯钩妖刃' },
  { id: 'vine', name: '藤蔓灵刃', color: '#85d991', subtitle: '藤蔓缠生 · 叶脉灵刃' },
  { id: 'carapace', name: '虫甲魔刃', color: '#d78aa5', subtitle: '甲壳叠生 · 锯齿魔刃' },
  { id: 'star', name: '星陨天轨剑', color: '#eacb83', subtitle: '陨星流火 · 星轨长剑' },
  { id: 'clockwork', name: '时械齿轮剑', color: '#e7a65d', subtitle: '齿轮转动 · 机括重剑' },
  { id: 'holy', name: '圣辉天翼剑', color: '#ffdf9d', subtitle: '圣光垂落 · 光羽长剑' },
  { id: 'ocean', name: '深海潮汐剑', color: '#69dbcf', subtitle: '珊瑚生长 · 潮涌巨剑' },
  { id: 'ghost', name: '幽冥魂火剑', color: '#73eec0', subtitle: '幽魂浮现 · 魂火直剑' },
  { id: 'desert', name: '沙海王权剑', color: '#e5bf79', subtitle: '沙尘飞扬 · 遗迹王剑' },
]);

const ROUTE_BY_ID = new Map(ROUTES.map((route) => [route.id, route]));
const DEFAULT_SELECTION = Object.freeze({ blade: 'straight', handle: 'wrap', guard: 'disc' });
const SCORE_RANGES = Object.freeze({
  growth: [2800, 4400],
  surge: [6000, 9000],
  awakening: [12500, 18000],
  damage: [1200, 2800],
  repair: [3800, 6500],
});
const GROWTH_CHANGE = Object.freeze({ growth: 1, surge: 2, awakening: 3, damage: -1, repair: 1 });
const TIERS = freezeItems([
  { min: 0, name: '废铁', color: '#9aa3b0', description: '炉火未尽，锋芒待醒。' },
  { min: 25000, name: '粗胚', color: '#c9d1d9', description: '锤痕尚在，刀形已成。' },
  { min: 40000, name: '凡品', color: '#85d991', description: '一线锋芒，自有来处。' },
  { min: 55000, name: '良品', color: '#8bdcff', description: '刃口流光，炉中初醒。' },
  { min: 68000, name: '精品', color: '#c2a4ff', description: '异相成纹，百炼有灵。' },
  { min: 82000, name: '名品', color: '#ffb55b', description: '刀出有风，群焰低伏。' },
  { min: 95000, name: '神品', color: '#ffd983', description: '灵光贯刃，独一无二。' },
]);
export const QUALITY_TIERS = TIERS;

// Text is the only route-dependent part of a scoring event.
const ROUTE_EVENTS = Object.freeze({
  lava: { growth: '熔脉生长', surge: '焰脊突生', awakening: '熔心觉醒', detail: '熔岩沿刃脊铺开，灼热的裂纹长出新的棱角。' },
  frost: { growth: '霜纹延展', surge: '晶簇绽放', awakening: '极寒觉醒', detail: '霜晶向刃尖攀升，新的晶簇凝结成锋。' },
  storm: { growth: '雷纹刻刃', surge: '雷齿分生', awakening: '雷核觉醒', detail: '电弧刻入刀身，分叉的雷齿向外延伸。' },
  bone: { growth: '骨脊续生', surge: '骨翼舒展', awakening: '龙魂觉醒', detail: '骨脊沿着刃口生长，弯钩与骨翼逐渐展开。' },
  vine: { growth: '藤脉攀生', surge: '灵叶绽生', awakening: '森灵觉醒', detail: '藤蔓缠过护手，新的枝叶与刃口共同生长。' },
  carapace: { growth: '甲片叠生', surge: '棘甲增生', awakening: '虫王觉醒', detail: '甲片一层层合拢，锋利的棘齿破壳而出。' },
  star: { growth: '星痕延展', surge: '陨晶坠入', awakening: '星核觉醒', detail: '星光沿剑身连成轨迹，陨晶与金色剑脊逐渐生长。' },
  clockwork: { growth: '机括嵌合', surge: '齿轮联动', awakening: '时械觉醒', detail: '铜齿轮嵌入钢刃，层层机括沿剑身展开。' },
  holy: { growth: '圣纹延展', surge: '光羽舒展', awakening: '圣辉觉醒', detail: '金纹贯穿白钢，洁白羽翼在护手两侧展开。' },
  ocean: { growth: '潮纹流转', surge: '珊瑚生长', awakening: '深海觉醒', detail: '潮光涌入剑身，珊瑚与珍珠在刃边生长。' },
  ghost: { growth: '魂纹浮现', surge: '幽火升腾', awakening: '幽魂觉醒', detail: '幽绿魂火在黑曜剑脊间流转，暗影逐渐成形。' },
  desert: { growth: '砂岩叠生', surge: '王纹显露', awakening: '王权觉醒', detail: '砂岩与金色阶纹向上叠起，青金石在中央显露。' },
});

function defaultRandom() {
  if (globalThis.crypto?.getRandomValues) {
    const sample = new Uint32Array(1);
    globalThis.crypto.getRandomValues(sample);
    return sample[0] / 0x100000000;
  }
  return Math.random();
}

function draw(rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('随机源必须返回 [0, 1) 范围内的有限数值。');
  }
  return value;
}

function freezeState(state) {
  state.selection = Object.freeze({ ...state.selection });
  state.damage = freezeItems(state.damage.map((scar) => ({ ...scar })));
  state.history = Object.freeze(state.history.map((event) => Object.freeze({ ...event })));
  state.lastEvent = state.history.at(-1) ?? null;
  return Object.freeze(state);
}

export function createGame(selection = DEFAULT_SELECTION, rng = defaultRandom) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    throw new TypeError('请提供刀身、刀柄与护手的配件选择。');
  }
  for (const key of Object.keys(selection)) {
    if (!Object.hasOwn(PARTS, key)) throw new RangeError(`未知配件类别：${key}`);
  }
  const selected = { ...DEFAULT_SELECTION, ...selection };
  for (const [key, options] of Object.entries(PARTS)) {
    if (!options.some((option) => option.id === selected[key])) {
      throw new RangeError(`无效的${key}配件：${selected[key]}`);
    }
  }
  const appearanceSeed = Math.floor(draw(rng) * 0x100000000);
  const token = Math.floor(draw(rng) * 0x100000000);
  return freezeState({
    id: `DD-${appearanceSeed.toString(36).padStart(7, '0').toUpperCase()}-${token.toString(36).padStart(7, '0').toUpperCase()}`,
    selection: selected,
    hits: 0,
    totalHits: TOTAL_HITS,
    score: 0,
    route: null,
    growth: 0,
    damage: [],
    history: [],
    complete: false,
    appearanceSeed,
    lastEvent: null,
  });
}

function chooseKind(roll, state) {
  // Calibrated over full 15-hit games: about 1% finish at 95,000+.
  // Shared draws: 6% damage, 3.1% awakening, 18% surge, 26% repair,
  // 46.9% growth. Healthy repair rolls and first-hit damage become growth.
  // Games stay independent: there is no forced win on the 100th game.
  if (roll < 0.06) return state.hits === 0 ? 'growth' : 'damage';
  if (roll < 0.091) return 'awakening';
  if (roll < 0.271) return 'surge';
  if (roll < 0.531 && state.damage.length) return 'repair';
  return 'growth';
}

function addDamage(scars, hit, power, detail) {
  const result = scars.map((scar) => ({ ...scar }));
  if (result.length < 3) {
    const occupied = new Set(result.map((scar) => scar.site));
    const sites = [0, 1, 2, 3, 4, 5].filter((site) => !occupied.has(site));
    result.push({ id: `scar-${hit}`, site: sites[Math.floor(detail * sites.length)], severity: power >= 0.7 ? 2 : 1 });
  } else {
    // More bad luck deepens a local wound rather than removing the core form.
    const shallow = result.map((scar, index) => ({ scar, index })).filter(({ scar }) => scar.severity === 1);
    if (shallow.length) result[shallow[Math.floor(detail * shallow.length)].index].severity = 2;
  }
  return result;
}

export function advance(state, rng = defaultRandom) {
  if (!state || !Number.isInteger(state.hits) || state.hits < 0) {
    throw new TypeError('请先调用 createGame 创建有效的锻造状态。');
  }
  if (state.complete || state.hits >= TOTAL_HITS) return state;
  if (state.route !== null && !ROUTE_BY_ID.has(state.route)) throw new RangeError('未知的进化路线。');

  // Exactly three event draws per hit, regardless of the route, part choices,
  // wounds or outcome. Route selection is one separate first-strike draw.
  const routeRevealed = state.route === null;
  const route = routeRevealed ? ROUTES[Math.floor(draw(rng) * ROUTES.length)].id : state.route;
  const roll = draw(rng);
  const power = draw(rng);
  const detail = draw(rng);
  const kind = chooseKind(roll, state);
  const [min, max] = SCORE_RANGES[kind];
  const magnitude = min + Math.floor(power * (max - min + 1));
  const nominalDelta = kind === 'damage' ? -magnitude : magnitude;
  const score = Math.max(0, Math.min(MAX_SCORE, state.score + nominalDelta));
  const hit = state.hits + 1;
  let damage = state.damage.map((scar) => ({ ...scar }));
  if (kind === 'damage') damage = addDamage(damage, hit, power, detail);
  if (kind === 'repair') damage.splice(Math.floor(detail * damage.length), 1);

  const words = ROUTE_EVENTS[route];
  const title = kind === 'damage' ? '刃口崩裂' : kind === 'repair' ? '裂痕重铸' : words[kind];
  const description = kind === 'damage'
    ? (hit === TOTAL_HITS
      ? '局部结构受损；成刀保留这处伤痕，损失一并计入最终得分。'
      : '局部结构受损，成长退回一步；剩余的落锤仍有修复机会。')
    : kind === 'repair'
      ? '一处伤痕在炉火中重新接合，刀身恢复生机。'
      : words.detail;
  const event = { kind, title, description, delta: score - state.score, nominalDelta, hit, routeRevealed };

  return freezeState({
    ...state,
    route,
    hits: hit,
    score,
    growth: Math.max(0, Math.min(20, state.growth + GROWTH_CHANGE[kind])),
    damage,
    history: [...state.history, event],
    complete: hit === TOTAL_HITS,
  });
}

export function getTier(score) {
  if (!Number.isFinite(score)) throw new TypeError('分数必须是有限数值。');
  const tier = TIERS.findLast((item) => score >= item.min) ?? TIERS[0];
  return Object.freeze({ name: tier.name, color: tier.color, description: tier.description, level: TIERS.indexOf(tier), min: tier.min });
}

export function formatScore(score) {
  return Math.trunc(score).toLocaleString('en-US');
}

import { getTier, ROUTES } from './game.mjs';

// The visual vocabulary and dimensions come from the approved v3 reference
// sheets. Quality changes the main body, openings and surface construction.
const DEFINITIONS = {
  lava: [
    ['ember-sword', '余火直刃', '窄直铁刃保留零星熔缝，剑尖与刀柄处在同一轴线上。'],
    ['thick-forging', '厚脊熔锋', '直刃加长增厚，熔火裂纹从剑根沿中轴上行。'],
    ['broad-furnace', '阔刃熔脉', '剑身明显变宽，中央熔脉分叉，厚重直剑轮廓成形。'],
    ['furnace-vents', '列窗炉刃', '宽直剑身内出现成排炉窗，橙红炉光从金属隔栅间透出。'],
    ['open-channel', '贯脉重剑', '剑身展开纵向熔槽，两侧加厚装甲保持笔直的双刃轮廓。'],
    ['armored-channel', '铆甲熔心', '直剑两侧叠出铆接甲片，贯穿中央的熔脉更加清晰。'],
    ['divine-furnace', '赤金炉神', '赤金锁边、层叠铆甲和大型炉心镶入宽厚直剑，熔火沿中轴贯通剑尖。'],
  ],
  frost: [
    ['ice-tip', '初凝霜尖', '细直剑尖凝出淡蓝晶光，仍保留未完成的金属轮廓。'],
    ['crystal-edge', '晶棱直锋', '冰晶沿直轴加长，透明感的多棱锋面逐渐形成。'],
    ['faceted-lance', '凝晶长锋', '剑身成为细长尖锐的晶体直剑，中央晶脊挺直向上。'],
    ['parallel-prisms', '并生晶棱', '主剑两侧生出较短的平行晶棱，最长剑尖始终居中。'],
    ['crystal-window', '菱晶长剑', '细长主锋下段展开菱形晶框，侧晶短促而精致。'],
    ['layered-prisms', '叠棱极霜', '多层竖向晶片错落叠生，银色框架托住高挑的中央晶锋。'],
    ['aurora-straight', '极光神锋', '银金镶线盘绕笔直晶脊，中心宝石与细长晶刃融为一体。'],
  ],
  storm: [
    ['faint-current', '初雷直刃', '紫色电流藏在窄直剑身内，剑尖正对刀柄。'],
    ['charged-spine', '蓄雷长锋', '剑身沿中轴加长，明亮电流贯穿直立金属脊。'],
    ['stepped-rails', '折阶雷锋', '两侧形成对称折阶边缘，保持清楚的笔直剑形。'],
    ['open-rails', '双轨雷剑', '直剑中央打开长槽，两条平行剑轨承托居中的剑尖。'],
    ['segmented-rails', '节轨雷刃', '成对节块镶入平行剑轨，中央雷隙继续延长。'],
    ['floating-plates', '悬甲雷锋', '名品剑轨分成沿直轴排列的悬浮甲片，中心晶体保持垂直对齐。'],
    ['divine-rails', '紫金雷神', '紫金双轨围出贯通中槽，多枚雷晶沿正中轴悬列，剑尖仍居中笔直。'],
  ],
  bone: [
    ['ivory-edge', '幼骨直锋', '象牙色骨脊构成细直剑身，末端收束为居中的剑尖。'],
    ['ivory-flutes', '双棱骨剑', '骨质直刃加长，中央魂脉与两侧骨棱逐渐分明。'],
    ['vertebral-edge', '节骨直刃', '成对骨节沿直剑两侧排列，仍有完整笔直的剑形。'],
    ['rib-windows', '肋窗骨剑', '骨肋之间打开对称镂空窗，中轴骨脊保持连续。'],
    ['skull-guard', '龙颅护锋', '小型龙颅收在护手处，清晰的象牙骨肋围绕直立中脊展开。'],
    ['ivory-lattice', '祖骨肋刃', '细长骨剑形成规整肋架，紧凑双龙颅围护剑根。'],
    ['divine-ivory', '龙皇直剑', '鎏金中脊贯穿象牙肋刃，精致龙颅护手与紫色魂晶共同衬托直立剑身。'],
  ],
  vine: [
    ['seed-line', '初芽直刃', '细直金属剑上出现嫩绿中脉，叶芽只生在护手附近。'],
    ['green-midrib', '绿脉直锋', '剑身保持笔直，清晰绿脉从剑根伸向正中的剑尖。'],
    ['lanceolate-leaf', '叶形直剑', '主剑变成细长披针形叶刃，叶脉与中轴对称展开。'],
    ['broad-leaf', '阔叶灵锋', '叶刃体积增大，两侧舒展但剑尖始终正对刀柄。'],
    ['mirrored-windows', '双孔灵叶', '中脉两侧打开镜像叶窗，金绿叶脉保留清楚的剑形。'],
    ['layered-lobes', '叠叶长剑', '成对尖叶层叠在笔直主轴两侧，形成挺拔的叶形长剑。'],
    ['divine-leaf', '森罗神锋', '多对镜像镂空叶窗、金色中脉和护手小花组成笔直的生命神剑。'],
  ],
  carapace: [
    ['chitin-shard', '幼甲弯刃', '少量甲片贴住微弯刀胚，只有虫甲路线保留偏轴弯曲。'],
    ['chitin-segments', '节甲曲锋', '数块甲片沿弯刃叠合，侧面露出琥珀关节。'],
    ['serrated-arc', '锯甲弧刃', '弧形剑背逐渐扩大，甲片内缘长出清晰锯齿。'],
    ['open-pincer', '开颚钳刃', '弯刃旁长出内收副钳，主刃与副钳围出开口。'],
    ['armored-pincer', '叠甲魔钳', '宽大的主弯刃覆上分层甲壳，琥珀关节连接锋利副钳。'],
    ['royal-pincer', '帝甲双钳', '更大的弧形主锋与副钳形成强烈轮廓，节甲逐层错开。'],
    ['divine-pincer', '圣甲神钳', '紫金甲片、巨型弯曲钳锋和琥珀关节组成唯一偏轴弯刃的神品形态。'],
  ],
  star: [
    ['star-scratch', '初陨铁锋', '窄直铁刃上留下细小星痕。'],
    ['star-thread', '星线长锋', '深蓝星线沿剑脊向上延伸。'],
    ['star-inlay', '星图剑胚', '金色星纹与蓝色剑心嵌入直刃。'],
    ['star-frame', '星轨长剑', '星金边框展开，护手生出星芒。'],
    ['star-windows', '陨晶天锋', '菱形星窗与星晶沿主轴成列。'],
    ['star-fragments', '坠星神锋', '金色边轨与陨晶共同围住深蓝剑心。'],
    ['star-divine', '天轨星神', '星核、金边和多层星晶凝成挺拔神剑。'],
  ],
  clockwork: [
    ['clock-iron', '机铁短锋', '厚实铁胚留有初始铆钉。'],
    ['clock-plates', '嵌板重剑', '钢板沿宽刃分层贴合。'],
    ['clock-gears', '齿轮剑胚', '铜齿轮与铆钉显露在直剑上。'],
    ['clock-slots', '机括重剑', '宽刃展开机槽与交错铜片。'],
    ['clock-rails', '联动机锋', '金属导轨和齿轮组逐渐延长。'],
    ['clock-engine', '时械巨剑', '更密的铜构件围绕中央机芯运转。'],
    ['clock-divine', '时械神机', '厚钢、金铜齿轮和明亮机芯组成机械神剑。'],
  ],
  holy: [
    ['holy-silver', '白钢初锋', '一线白钢保持细长直立。'],
    ['holy-line', '初辉长剑', '暖金光纹沿白色剑脊延伸。'],
    ['holy-gem', '圣纹剑胚', '红色圣晶嵌入金色护手。'],
    ['holy-feather', '光羽长剑', '羽形金属从护手两侧舒展。'],
    ['holy-wings', '双翼圣锋', '层叠白羽与金色羽骨托起修长剑身。'],
    ['holy-seraph', '天翼圣剑', '宽大的对称光羽围绕白金剑根展开。'],
    ['holy-divine', '圣辉天翼', '红晶、白金剑身与层叠天翼汇成神品。'],
  ],
  ocean: [
    ['ocean-steel', '潮痕铁锋', '深色直刃中出现微弱潮光。'],
    ['ocean-current', '碧潮剑胚', '海绿色水脉沿剑身升起。'],
    ['ocean-pearl', '珍珠潮锋', '明亮珍珠落在护手中心。'],
    ['ocean-coral', '珊瑚潮剑', '珊瑚枝与贝形护手逐渐展开。'],
    ['ocean-wave', '深海巨刃', '宽阔海蓝剑身中涌动层叠潮纹。'],
    ['ocean-reef', '珊瑚王剑', '珊瑚与贝壳围绕潮汐主刃生长。'],
    ['ocean-divine', '沧海潮神', '珍珠、潮光和珊瑚构成宽阔神剑。'],
  ],
  ghost: [
    ['ghost-iron', '暗铁初锋', '幽暗铁刃藏着一线绿色微光。'],
    ['ghost-flame', '魂火剑胚', '幽绿火线进入直立黑刃。'],
    ['ghost-rune', '幽纹长锋', '暗色剑脊刻出魂纹与小型魂晶。'],
    ['ghost-void', '幽隙直剑', '黑曜剑架围出细长魂火槽。'],
    ['ghost-plates', '暗甲魂剑', '对称暗甲沿魂火剑脊向上延伸。'],
    ['ghost-soul', '幽魂长剑', '绿光与层叠黑曜结构共同显现。'],
    ['ghost-divine', '冥火魂神', '黑曜骨架、幽绿魂火和魂晶汇成神剑。'],
  ],
  desert: [
    ['desert-bronze', '古铜剑胚', '带着砂痕的古铜直刃初成。'],
    ['desert-stone', '砂岩重锋', '浅金砂岩开始叠入宽刃。'],
    ['desert-lapis', '青金石剑', '蓝色宝石与阶形边缘浮现。'],
    ['desert-steps', '阶纹王剑', '层层砂岩阶纹沿剑身上升。'],
    ['desert-temple', '遗迹巨剑', '宽刃形成带青金中脊的遗迹轮廓。'],
    ['desert-crown', '王权长锋', '金色阶台与铭纹围住蓝色剑心。'],
    ['desert-divine', '沙海王神', '巨型砂岩直剑镶入王权金纹与青金石。'],
  ],
};

// World-space dimensions and topology come from the three user-approved v3
// sheets. The five straight routes never inherit a selected starting curve.
const FORMS = {
  lava: {
    heights: [2.95, 3.55, 4.05, 4.45, 4.85, 5.2, 5.65],
    widths: [.34, .48, .64, .8, .96, 1.12, 1.3],
    depths: [.14, .18, .24, .3, .36, .42, .48],
    modes: ['solid', 'solid', 'seamed', 'vents', 'channel', 'armor-channel', 'divine-channel'],
  },
  frost: {
    heights: [2.9, 3.45, 3.95, 4.55, 5.05, 5.55, 6.0],
    widths: [.22, .28, .34, .4, .46, .52, .64],
    depths: [.12, .14, .16, .2, .24, .28, .32],
    modes: ['metal-tip', 'crystal', 'faceted', 'prisms', 'diamond', 'layers', 'divine-prisms'],
  },
  storm: {
    heights: [3.05, 3.7, 4.25, 4.7, 5.05, 5.45, 5.75],
    widths: [.28, .36, .46, .64, .8, .94, 1.1],
    depths: [.12, .16, .2, .22, .26, .28, .32],
    modes: ['solid', 'solid', 'stepped', 'slotted', 'jointed', 'floating', 'divine-rails'],
  },
  bone: {
    heights: [3.05, 3.65, 4.15, 4.6, 4.95, 5.35, 5.7],
    widths: [.28, .36, .48, .64, .76, .86, .98],
    depths: [.12, .16, .18, .22, .26, .3, .34],
    modes: ['solid', 'fluted', 'vertebrae', 'lattice', 'ribs-skull', 'ribs-double-skull', 'divine-ribs'],
  },
  vine: {
    heights: [2.95, 3.5, 4.05, 4.5, 4.9, 5.3, 5.8],
    widths: [.26, .34, .56, .8, .94, 1.08, 1.24],
    depths: [.1, .12, .14, .16, .18, .2, .24],
    modes: ['metal', 'green-line', 'leaf', 'broad-leaf', 'two-windows', 'lobes', 'divine-windows'],
  },
  carapace: {
    heights: [3.0, 3.6, 4.1, 4.6, 5.0, 5.45, 5.8],
    widths: [.34, .48, .64, .8, .96, 1.08, 1.2],
    depths: [.14, .18, .24, .3, .34, .4, .46],
    modes: ['shard', 'segmented', 'serrated', 'pincer', 'layered-pincer', 'double-pincer', 'divine-pincer'],
  },
  star: {
    heights:[3.2,3.5,4.0,4.45,4.85,5.25,5.75], widths:[.32,.4,.5,.62,.74,.86,1.12], depths:[.14,.16,.18,.2,.22,.26,.32],
    modes:['star-scratch','star-thread','star-inlay','star-frame','star-windows','star-fragments','star-divine'],
  },
  clockwork: {
    heights:[2.95,3.45,3.95,4.35,4.75,5.15,5.7], widths:[.4,.54,.68,.82,.96,1.10,1.4], depths:[.16,.2,.24,.28,.32,.36,.46],
    modes:['clock-iron','clock-plates','clock-gears','clock-slots','clock-rails','clock-engine','clock-divine'],
  },
  holy: {
    heights:[3.05,3.55,4.05,4.5,4.95,5.35,5.9], widths:[.28,.34,.42,.5,.58,.7,.94], depths:[.12,.14,.16,.18,.2,.24,.3],
    modes:['holy-silver','holy-line','holy-gem','holy-feather','holy-wings','holy-seraph','holy-divine'],
  },
  ocean: {
    heights:[3.0,3.45,3.9,4.35,4.75,5.2,5.7], widths:[.38,.5,.64,.8,.96,1.12,1.42], depths:[.14,.18,.22,.26,.3,.34,.44],
    modes:['ocean-steel','ocean-current','ocean-pearl','ocean-coral','ocean-wave','ocean-reef','ocean-divine'],
  },
  ghost: {
    heights:[2.85,3.65,4.0,4.45,4.85,5.25,5.8], widths:[.3,.38,.46,.58,.7,.82,1.12], depths:[.12,.14,.16,.2,.22,.26,.34],
    modes:['ghost-iron','ghost-flame','ghost-rune','ghost-void','ghost-plates','ghost-soul','ghost-divine'],
  },
  desert: {
    heights:[2.95,3.4,3.9,4.35,4.8,5.2,5.7], widths:[.4,.55,.7,.86,1.0,1.16,1.48], depths:[.16,.2,.24,.28,.32,.36,.46],
    modes:['desert-bronze','desert-stone','desert-lapis','desert-steps','desert-temple','desert-crown','desert-divine'],
  },
};

export const EVOLUTION_STAGES = Object.freeze(Object.fromEntries(
  Object.entries(DEFINITIONS).map(([route, entries]) => [route, Object.freeze(entries.map(([featureId, featureLabel, description], level) => Object.freeze({
    level,
    featureId,
    featureLabel,
    description,
    structures: Object.freeze(entries.slice(0, level + 1).map(entry => entry[0])),
    body: Object.freeze({ height: FORMS[route].heights[level], width: FORMS[route].widths[level], depth: FORMS[route].depths[level], mode: FORMS[route].modes[level], straight: route !== 'carapace' }),
    detailDensity: 1 + level,
    gilded: level >= 3,
    legendary: level === 6,
  })))]),
));

export function getEvolutionStage(state = {}) {
  if (!(state.hits > 0) || !EVOLUTION_STAGES[state.route]) return null;
  return EVOLUTION_STAGES[state.route][getTier(Number(state.score) || 0).level];
}

export function getEvolutionInfo(state = {}) {
  const stage = getEvolutionStage(state);
  if (!stage) return {
    level: 0,
    qualityName: '未锻造',
    routeName: '尚未觉醒',
    featureLabel: '初始刀形',
    description: '保留所选刀身、刀柄和护手；第一锤落下后才开始进化。',
    legendary: false,
  };
  const quality = getTier(Number(state.score) || 0);
  return {
    level: stage.level,
    qualityName: quality.name,
    routeName: ROUTES.find(route => route.id === state.route).name,
    featureLabel: stage.featureLabel,
    description: stage.description,
    legendary: stage.legendary,
  };
}

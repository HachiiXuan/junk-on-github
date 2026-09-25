import { CORES } from './cores.js';
import { METHODS, capOf } from './methods.js';
import { mixHex } from '../util.js';
import { I18n, t, L } from '../i18n.js';
import { Settings } from '../settings.js';

/* ============================================================
 *  配对 / 三连 协同表（用于面板文案；实际效果由引擎自发涌现）
 * ============================================================ */
const P = (a, b, nameZh, nameEn, descZh, descEn) => ({
  a, b, name: { zh: nameZh, en: nameEn }, desc: { zh: descZh, en: descEn },
});

export const SYNERGY_PAIRS = [
  P('orb', 'beam', '分裂光矛', 'Split Lance', '光球命中后向四周迸出光矛', 'orbs burst into lances on impact'),
  P('orb', 'barrage', '陨星雨', 'Meteor Rain', '光球落点召来陨星', 'each orb impact calls down meteors'),
  P('orb', 'burst', '爆裂弹', 'Detonator Orb', '光球触地即爆，范围翻涌', 'orbs detonate the moment they land'),
  P('orb', 'chain', '电浆球', 'Plasma Orb', '光球炸开的同时迸出电弧', 'orbs explode and spit electric arcs'),
  P('orb', 'field', '播种', 'Sowing', '光球落地绽成领域', 'each orb blooms into a lingering field'),
  P('orb', 'orbit', '伴星', 'Companion Star', '卫星额外抛射光球', 'satellites also throw orbs'),
  P('orb', 'rune', '刻印弹', 'Sigil Shot', '光球落地刻下符文', 'each orb carves a sigil where it lands'),

  P('beam', 'barrage', '天罚', 'Judgement', '光矛坠落，化作陨星', 'lances fall from the sky as meteors'),
  P('beam', 'burst', '贯星爆裂', 'Star-Piercer', '光矛末端剧烈炸裂', 'lances detonate at their far end'),
  P('beam', 'chain', '连锁光束', 'Chain Beam', '光矛在目标之间跳跃', 'lance impacts jump between targets'),
  P('beam', 'field', '灼痕', 'Scorch Mark', '光矛沿途留下领域', 'lances leave a field along their path'),
  P('beam', 'orbit', '齐射', 'Salvo', '卫星与水晶同时倾泻光线', 'satellites and crystal fire together'),
  P('beam', 'rune', '光痕符文', 'Light-Traced Sigil', '光矛沿路刻下符文', 'lances carve sigils along the way'),

  P('barrage', 'burst', '陨石爆裂', 'Shattering Meteors', '每颗陨星落地炸开', 'every meteor detonates on landing'),
  P('barrage', 'chain', '雷陨', 'Thunderfall', '陨星裹挟雷电砸落', 'meteors fall wreathed in lightning'),
  P('barrage', 'field', '陨坑', 'Crater Field', '撞击之处化作领域', 'impact craters become fields'),
  P('barrage', 'orbit', '轨道轰炸', 'Orbital Strike', '卫星引导陨星下坠', 'satellites guide meteors down'),
  P('barrage', 'rune', '坠印', 'Falling Sigil', '陨石落点生成符文', 'meteor craters spawn sigils'),

  P('burst', 'chain', '雷霆爆裂', 'Thunderburst', '爆炸后向四周跳雷', 'explosions throw arcs in every direction'),
  P('burst', 'field', '焦土', 'Scorched Earth', '爆炸在原处留下领域', 'explosions leave a field behind'),
  P('burst', 'orbit', '自爆卫星', 'Kamikaze Satellites', '卫星冲向目标引爆', 'satellites dive in and detonate'),
  P('burst', 'rune', '连爆符阵', 'Chain Detonation Array', '爆炸引爆周围符文', 'explosions set nearby sigils off'),

  P('chain', 'field', '雷电场', 'Lightning Field', '领域内不断跳雷', 'the field keeps arcing between targets'),
  P('chain', 'orbit', '环绕雷弧', 'Orbiting Arcs', '卫星射出电弧', 'satellites fire arcs instead of beams'),
  P('chain', 'rune', '雷符', 'Thunder Sigil', '符文引爆时放电', 'sigils discharge lightning when they blow'),

  P('field', 'orbit', '结界', 'Ward', '卫星维持着领域', 'satellites sustain the field'),
  P('field', 'rune', '法阵', 'Greater Circle', '领域中浮现符文', 'sigils surface inside the field'),
  P('orbit', 'rune', '符卫', 'Sigil Wardens', '卫星在符文之间跃迁', 'satellites hop between sigils'),
];

export const SYNERGY_TRIPLES = [
  { keys: ['orb', 'beam', 'burst'], name: { zh: '三位一体 · 贯星', en: 'Trinity: Star-Piercer' }, desc: { zh: '光球 → 分裂光矛 → 全场爆裂', en: 'orb → split lance → arena-wide burst' } },
  { keys: ['orb', 'barrage', 'burst'], name: { zh: '焚天火雨', en: 'Skyfire Rain' }, desc: { zh: '光球引来陨星，陨星尽数炸开', en: 'orbs summon meteors, meteors all detonate' } },
  { keys: ['beam', 'chain', 'orbit'], name: { zh: '天网', en: "Heaven's Net" }, desc: { zh: '卫星与光矛织成一张雷网', en: 'satellites and lances weave a net of arcs' } },
  { keys: ['field', 'chain', 'rune'], name: { zh: '雷牢', en: 'Thunder Prison' }, desc: { zh: '领域之中，符文连环放电', en: 'inside the field, sigils discharge in sequence' } },
  { keys: ['barrage', 'chain', 'burst'], name: { zh: '灭世', en: "World's End" }, desc: { zh: '雷陨接连炸裂，天地失色', en: 'thunder-meteors detonate in waves' } },
];

const PAIR_MAP = new Map();
for (const p of SYNERGY_PAIRS) PAIR_MAP.set([p.a, p.b].sort().join('|'), p);

/* ============================================================
 *  命名
 * ============================================================ */
const CORE_PREFIX = {
  fire: { zh: '炽炎', en: 'Cinder' },
  water: { zh: '潮汐', en: 'Tidal' },
  earth: { zh: '磐岩', en: 'Stone' },
  ice: { zh: '霜华', en: 'Frost' },
  light: { zh: '圣辉', en: 'Radiant' },
  dark: { zh: '蚀夜', en: 'Umbral' },
  wind: { zh: '烈风', en: 'Gale' },
  thunder: { zh: '霆光', en: 'Storm' },
};

const METHOD_SUFFIX = {
  orb: { zh: '光球', en: 'Orb' },
  beam: { zh: '光矛', en: 'Lance' },
  barrage: { zh: '陨星', en: 'Meteor' },
  burst: { zh: '爆裂', en: 'Burst' },
  chain: { zh: '雷链', en: 'Chain' },
  field: { zh: '领域', en: 'Field' },
  orbit: { zh: '卫星', en: 'Orbit' },
  rune: { zh: '符文', en: 'Sigil' },
};

function dominantMethod(counts) {
  let best = null, bc = 0;
  for (const k of Object.keys(counts)) {
    if (counts[k] > bc) { bc = counts[k]; best = k; }
  }
  return best;
}

/** 按当前语言生成法术名（可随语言切换实时变化） */
export function spellName(spell) {
  if (!spell) return '';
  const pre = CORE_PREFIX[spell.core] || { zh: '未知', en: 'Unknown' };
  const dom = dominantMethod(spell.counts);
  if (!dom) {
    return L({ zh: `${pre.zh}·核心脉冲`, en: `${pre.en} Core Pulse` });
  }
  const suf = METHOD_SUFFIX[dom];
  const c = spell.counts[dom];
  return L({
    zh: `${pre.zh}·${suf.zh}${c > 1 ? '×' + c : ''}`,
    en: `${pre.en} ${suf.en}${c > 1 ? ' ×' + c : ''}`,
  });
}

/* ============================================================
 *  编译
 * ============================================================ */
/**
 * @param {string} coreKey
 * @param {string[]} methodKeys
 * @param {{overload?:boolean}} opts
 */
export function compileSpell(coreKey, methodKeys, opts = {}) {
  const overload = !!opts.overload;
  const core = CORES[coreKey];
  const methods = methodKeys.slice();
  const counts = {};
  for (const k of methods) counts[k] = (counts[k] || 0) + 1;

  const n = methods.length;
  const burst = counts.burst || 0;

  /* 过载模式下可以关闭全部性能限制（面板里的「解除性能限制」开关）。
     唯一保留的是"半径"的宽上限：29 个爆裂叠出来的半径若按线性算会到 135 单位
     （场地半径才 15.5），冲击环会大到糊满屏幕变成一个平面色块 —— 那是坏掉不是暴力。 */
  const brute = overload && Settings.uncapped;

  /* 强度：普通模式维持原公式；过载模式默认前 5 个方式全量、之后每个只加 0.10 */
  const power = overload
    ? (brute
      ? 1 + 0.34 * n
      : 1 + 0.34 * Math.min(n, 5) + 0.10 * Math.max(0, n - 5))
    : 1 + 0.34 * n;

  const burstDmg = brute ? burst : Math.min(burst, 4);
  const burstRadius = brute ? Math.min(burst, 6) : Math.min(burst, 4);
  const spreadN = brute ? Math.min(n, 10) : Math.min(n, 8);

  const baseDamage = 32 * core.dmg * power * (1 + 0.18 * burstDmg);
  const baseRadius = 2.8 * core.radius * (1 + 0.40 * burstRadius) * (1 + 0.06 * spreadN);

  const colors = { core: core.color };
  for (const k of Object.keys(METHODS)) colors[k] = mixHex(METHODS[k].color, core.color, 0.42);

  const spell = {
    core: coreKey,
    coreDef: core,
    methods,
    counts,
    n,
    overload,
    complexity: n + 1,
    power,
    baseDamage,
    baseRadius,
    colors,

    damageAt(depth) { return baseDamage * Math.pow(0.58, depth); },
    radiusAt(depth) { return baseRadius * Math.pow(0.82, depth); },
  };

  /* name 用 getter，切换语言时自动跟着变 */
  Object.defineProperty(spell, 'name', { get() { return spellName(this); }, enumerable: true });

  spell.synergies = findSynergies(counts, methods);
  spell.score = Math.round(baseDamage * baseRadius * 0.6);
  return spell;
}

/* ============================================================
 *  描述
 * ============================================================ */
export function findSynergies(counts) {
  const out = [];
  const keys = Object.keys(counts);

  /* 同名叠加 */
  for (const k of keys) {
    if (counts[k] >= 2) {
      out.push({
        name: L({ zh: `${METHODS[k].name.zh} ×${counts[k]}`, en: `${METHODS[k].name.en} ×${counts[k]}` }),
        desc: L(METHODS[k].stack(counts[k])),
        kind: 'stack',
        color: METHODS[k].color,
      });
    }
  }

  /* 三连 */
  for (const tr of SYNERGY_TRIPLES) {
    if (tr.keys.every(k => counts[k] > 0)) {
      out.push({ name: L(tr.name), desc: L(tr.desc), kind: 'triple', color: 0xffd166 });
      break;
    }
  }

  /* 两两组合（组合多时只展示前 6 条） */
  const pairHits = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const p = PAIR_MAP.get([keys[i], keys[j]].sort().join('|'));
      if (p) pairHits.push({ name: L(p.name), desc: L(p.desc), kind: 'pair', color: METHODS[p.b].color });
    }
  }
  out.push(...pairHits.slice(0, 6));
  return out;
}

/** 面板用：法术详情（结构化，交给 UI 渲染；每次调用都按当前语言重算） */
export function describeSpell(spell) {
  const core = spell.coreDef;
  const parts = Object.entries(spell.counts).map(([k, v]) => ({
    key: k, name: L(METHODS[k].name), count: v, color: METHODS[k].color,
  }));

  const c = spell.counts;
  const lines = [];
  if (c.orb) lines.push(t('line.orb', { n: capOf('orb', c.orb) }));
  if (c.beam) lines.push(t('line.beam', { n: capOf('beam', c.beam) }));
  if (c.barrage) {
    const w = capOf('barrage', c.barrage);
    lines.push(t('line.barrage', { w, m: 1 + Math.floor(w / 2) }));
  }
  if (c.chain) lines.push(t('line.chain', { n: 1 + 2 * capOf('chain', c.chain) }));
  if (c.field) lines.push(t('line.field', { k: (1 + 0.26 * (capOf('field', c.field) - 1)).toFixed(2) }));
  if (c.orbit) lines.push(t('line.orbit', { n: capOf('orbit', c.orbit) }));
  if (c.rune) lines.push(t('line.rune', { n: capOf('rune', c.rune) }));
  if (c.burst) lines.push(t('line.burst', { k: (1 + 0.40 * Math.min(c.burst, 4)).toFixed(2) }));
  if (!lines.length) lines.push(t('line.pulse'));

  return {
    name: spell.name,
    core,
    coreName: L(core.name),
    coreTag: L(core.tag),
    corePassive: L(core.passive),
    parts,
    lines,
    synergies: spell.synergies,
    complexity: spell.complexity,
    overload: spell.overload,
    used: spell.methods.length,
    score: spell.score,
    damage: Math.round(spell.damageAt(0)),
    radius: spell.radiusAt(0),
    lang: I18n.lang,
  };
}

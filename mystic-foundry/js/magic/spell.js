import { CORES } from './cores.js';
import { METHODS } from './methods.js';
import { mixHex } from '../util.js';

/* ============================================================
 *  配对 / 三连 协同表（用于面板文案；实际效果由引擎自发涌现）
 * ============================================================ */
const P = (a, b, name, desc) => ({ a, b, name, desc });

export const SYNERGY_PAIRS = [
  P('orb', 'beam', '分裂光矛', '光球命中后向四周迸出光矛'),
  P('orb', 'barrage', '陨星雨', '光球落点召来陨星'),
  P('orb', 'burst', '爆裂弹', '光球触地即爆，范围翻涌'),
  P('orb', 'chain', '电浆球', '光球炸开的同时迸出电弧'),
  P('orb', 'field', '播种', '光球落地绽成领域'),
  P('orb', 'orbit', '伴星', '卫星额外抛射光球'),
  P('orb', 'rune', '刻印弹', '光球落地刻下符文'),

  P('beam', 'barrage', '天罚', '光矛坠落，化作陨星'),
  P('beam', 'burst', '贯星爆裂', '光矛末端剧烈炸裂'),
  P('beam', 'chain', '连锁光束', '光矛在目标之间跳跃'),
  P('beam', 'field', '灼痕', '光矛沿途留下领域'),
  P('beam', 'orbit', '齐射', '卫星与水晶同时倾泻光线'),
  P('beam', 'rune', '光痕符文', '光矛沿路刻下符文'),

  P('barrage', 'burst', '陨石爆裂', '每颗陨星落地炸开'),
  P('barrage', 'chain', '雷陨', '陨星裹挟雷电砸落'),
  P('barrage', 'field', '陨坑', '撞击之处化作领域'),
  P('barrage', 'orbit', '轨道轰炸', '卫星引导陨星下坠'),
  P('barrage', 'rune', '坠印', '陨石落点生成符文'),

  P('burst', 'chain', '雷霆爆裂', '爆炸后向四周跳雷'),
  P('burst', 'field', '焦土', '爆炸在原处留下领域'),
  P('burst', 'orbit', '自爆卫星', '卫星冲向目标引爆'),
  P('burst', 'rune', '连爆符阵', '爆炸引爆周围符文'),

  P('chain', 'field', '雷电场', '领域内不断跳雷'),
  P('chain', 'orbit', '环绕雷弧', '卫星射出电弧'),
  P('chain', 'rune', '雷符', '符文引爆时放电'),

  P('field', 'orbit', '结界', '卫星维持着领域'),
  P('field', 'rune', '法阵', '领域中浮现符文'),
  P('orbit', 'rune', '符卫', '卫星在符文之间跃迁'),
];

export const SYNERGY_TRIPLES = [
  { keys: ['orb', 'beam', 'burst'], name: '三位一体 · 贯星', desc: '光球 → 分裂光矛 → 全场爆裂' },
  { keys: ['orb', 'barrage', 'burst'], name: '焚天火雨', desc: '光球引来陨星，陨星尽数炸开' },
  { keys: ['beam', 'chain', 'orbit'], name: '天网', desc: '卫星与光矛织成一张雷网' },
  { keys: ['field', 'chain', 'rune'], name: '雷牢', desc: '领域之中，符文连环放电' },
  { keys: ['barrage', 'chain', 'burst'], name: '灭世', desc: '雷陨接连炸裂，天地失色' },
];

const PAIR_MAP = new Map();
for (const p of SYNERGY_PAIRS) PAIR_MAP.set([p.a, p.b].sort().join('|'), p);

/* ============================================================
 *  命名
 * ============================================================ */
const CORE_PREFIX = {
  fire: '炽炎', water: '潮汐', earth: '磐岩', light: '圣辉',
  dark: '蚀夜', wind: '烈风', thunder: '霆光',
};
const METHOD_SUFFIX = {
  orb: '光球', beam: '光矛', barrage: '陨星', burst: '爆裂',
  chain: '雷链', field: '领域', orbit: '卫星', rune: '符文',
};

function dominantMethod(counts) {
  let best = null, bc = 0;
  for (const [k, c] of Object.entries(counts)) {
    if (c > bc) { bc = c; best = k; }
  }
  return best;
}

/* ============================================================
 *  编译
 * ============================================================ */
export function compileSpell(coreKey, methodKeys) {
  const core = CORES[coreKey];
  const methods = methodKeys.slice();
  const counts = {};
  for (const k of methods) counts[k] = (counts[k] || 0) + 1;

  const n = methods.length;
  const burst = counts.burst || 0;
  const power = 1 + 0.34 * n;
  const baseDamage = 32 * core.dmg * power * (1 + 0.18 * burst);
  const baseRadius = 2.8 * core.radius * (1 + 0.40 * burst) * (1 + 0.06 * n);

  const colors = { core: core.color };
  for (const k of Object.keys(METHODS)) {
    colors[k] = mixHex(METHODS[k].color, core.color, 0.42);
  }

  const dom = dominantMethod(counts);
  const name = dom
    ? `${CORE_PREFIX[coreKey]}·${METHOD_SUFFIX[dom]}${counts[dom] > 1 ? '×' + counts[dom] : ''}`
    : `${CORE_PREFIX[coreKey]}·核心脉冲`;

  const spell = {
    core: coreKey,
    coreDef: core,
    methods,
    counts,
    n,
    complexity: n + 1,
    power,
    baseDamage,
    baseRadius,
    colors,
    name,

    damageAt(depth) {
      return baseDamage * Math.pow(0.58, depth);
    },
    radiusAt(depth) {
      return baseRadius * Math.pow(0.82, depth);
    },
  };

  spell.synergies = findSynergies(counts, methods);
  spell.score = Math.round(baseDamage * baseRadius * 0.6);
  return spell;
}

/* ============================================================
 *  描述
 * ============================================================ */
export function findSynergies(counts, methods) {
  const out = [];
  const keys = Object.keys(counts);

  /* 同名叠加 */
  for (const k of keys) {
    if (counts[k] >= 2) {
      out.push({
        name: `${METHODS[k].name} ×${counts[k]}`,
        desc: METHODS[k].stack(counts[k]),
        kind: 'stack',
        color: METHODS[k].color,
      });
    }
  }

  /* 三连 */
  for (const t of SYNERGY_TRIPLES) {
    if (t.keys.every(k => counts[k] > 0)) {
      out.push({ name: t.name, desc: t.desc, kind: 'triple', color: 0xffd166 });
      break;
    }
  }

  /* 两两组合 */
  const pairHits = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const key = [keys[i], keys[j]].sort().join('|');
      const p = PAIR_MAP.get(key);
      if (p) pairHits.push({ name: p.name, desc: p.desc, kind: 'pair', color: METHODS[p.b].color });
    }
  }
  /* 组合多时优先展示，最多额外 6 条 */
  out.push(...pairHits.slice(0, 6));
  return out;
}

/** 面板用：法术详情（结构化，交给 UI 渲染） */
export function describeSpell(spell) {
  const core = spell.coreDef;
  const parts = Object.entries(spell.counts).map(([k, v]) => ({
    key: k, name: METHODS[k].name, count: v, color: METHODS[k].color,
  }));

  const lines = [];
  if (spell.counts.orb) lines.push(`抛出 ${spell.counts.orb} 颗光球`);
  if (spell.counts.beam) lines.push(`${spell.counts.beam} 道光矛贯穿`);
  if (spell.counts.barrage) lines.push(`${spell.counts.barrage} 波 × ${1 + Math.floor(spell.counts.barrage / 2)} 颗陨星`);
  if (spell.counts.chain) lines.push(`电弧跳跃 ${1 + 2 * spell.counts.chain} 次`);
  if (spell.counts.field) lines.push(`领域半径 ×${(1 + 0.26 * (spell.counts.field - 1)).toFixed(2)}`);
  if (spell.counts.orbit) lines.push(`${spell.counts.orbit} 颗环绕卫星`);
  if (spell.counts.rune) lines.push(`${spell.counts.rune} 枚延时符文`);
  if (spell.counts.burst) lines.push(`爆裂半径 ×${(1 + 0.40 * spell.counts.burst).toFixed(2)}`);
  if (!lines.length) lines.push('核心自行迸发能量');

  return {
    name: spell.name,
    core,
    parts,
    lines,
    synergies: spell.synergies,
    complexity: spell.complexity,
    score: spell.score,
    damage: Math.round(spell.damageAt(0)),
    radius: spell.radiusAt(0),
  };
}

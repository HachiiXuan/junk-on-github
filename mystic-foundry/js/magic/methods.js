import { L } from '../i18n.js';
import { Settings } from '../settings.js';

/**
 * 释放方式 —— 决定「如何造成伤害」
 *   role  deliver : 从水晶投送出去
 *   role  place   : 直接在落点生成
 *   role  meta    : 附着在每一次命中上（触发 / 叠加）
 *
 * 文案统一写成 { zh, en }；stack(n) 返回同样结构，且内部先做叠加上限，
 * 这样面板里显示的倍率与实际生效的数值永远一致（过载模式下尤其重要）。
 */
export const METHODS = {
  orb: {
    key: 'orb', name: { zh: '球体', en: 'Orb' }, latin: 'ORB', color: 0x7fe6ff, role: 'deliver',
    tag: { zh: '投送 · 追踪', en: 'Deliver · Seek' },
    desc: {
      zh: '从水晶抛出光球，飞行途中拖出光尾，命中即爆',
      en: 'Hurls orbs from the crystal; they trail light and detonate on contact',
    },
    stack: n => {
      const c = capOf('orb', n);
      return {
        zh: c === 1 ? '1 颗光球' : `${c} 颗光球 · 自动锁定不同目标 · 体积 +${Math.round((c - 1) * 18)}%`,
        en: c === 1 ? '1 orb' : `${c} orbs · each locks a different target · size +${Math.round((c - 1) * 18)}%`,
      };
    },
  },
  beam: {
    key: 'beam', name: { zh: '射线', en: 'Lance' }, latin: 'LANCE', color: 0xffd166, role: 'deliver',
    tag: { zh: '投送 · 贯穿', en: 'Deliver · Pierce' },
    desc: {
      zh: '射出笔直光矛，贯穿路径上的所有目标',
      en: 'Fires straight lances that pierce everything along the path',
    },
    stack: n => {
      const c = capOf('beam', n);
      const volleys = Math.max(1, Math.ceil(c / 3));
      const cover = volleys > 1 ? Math.min(0.7 + 0.22 * c, 6.5).toFixed(1) : '0';
      return {
        zh: `${c} 道光矛 · ${volleys} 轮齐射全部打向落点 · 覆盖半径 ${cover}`,
        en: `${c} lances · ${volleys} volleys, all converging on the target · cover radius ${cover}`,
      };
    },
  },
  barrage: {
    key: 'barrage', name: { zh: '轰击', en: 'Barrage' }, latin: 'BARRAGE', color: 0xff8a4c, role: 'deliver',
    tag: { zh: '投送 · 覆盖', en: 'Deliver · Cover' },
    desc: {
      zh: '自天穹召下陨星，砸向落点周围',
      en: 'Calls meteors down from the sky around the target point',
    },
    stack: n => {
      const c = capOf('barrage', n);
      return {
        zh: `${c} 波陨星 · 每波 ${1 + Math.floor(c / 2)} 颗 · 散布半径 ${Math.min(3.2 + c * 0.75, 9.5).toFixed(1)}`,
        en: `${c} waves · ${1 + Math.floor(c / 2)} meteors each · spread radius ${Math.min(3.2 + c * 0.75, 9.5).toFixed(1)}`,
      };
    },
  },
  burst: {
    key: 'burst', name: { zh: '爆裂', en: 'Burst' }, latin: 'BURST', color: 0xff3d7f, role: 'meta',
    tag: { zh: '增幅 · 连锁', en: 'Amplify · Chain' },
    desc: {
      zh: '让每一次命中都剧烈炸裂；范围与伤害同步放大',
      en: 'Makes every impact detonate; radius and damage scale together',
    },
    stack: n => {
      const rc = Math.min(n, 3);
      const dc = capOf('burst', n);
      return {
        zh: `半径 ×${(1 + 0.40 * rc).toFixed(2)} · 伤害 ×${(1 + 0.18 * dc).toFixed(2)} · 引爆连锁 ${Math.min(n - 1, 6)} 次`,
        en: `radius ×${(1 + 0.40 * rc).toFixed(2)} · damage ×${(1 + 0.18 * dc).toFixed(2)} · ${Math.min(n - 1, 6)} chained detonations`,
      };
    },
  },
  chain: {
    key: 'chain', name: { zh: '雷链', en: 'Chain' }, latin: 'CHAIN', color: 0xb388ff, role: 'meta',
    tag: { zh: '扩散 · 跳弹', en: 'Spread · Jump' },
    desc: {
      zh: '从命中点迸出电弧，在目标之间反复跳跃',
      en: 'Arcs burst from the impact and keep jumping between targets',
    },
    stack: n => {
      const c = capOf('chain', n);
      return {
        zh: `跳数 ${1 + 2 * c} · 跳距 +${Math.round((c - 1) * 35)}% · 电弧更粗`,
        en: `${1 + 2 * c} jumps · range +${Math.round((c - 1) * 35)}% · thicker arcs`,
      };
    },
  },
  field: {
    key: 'field', name: { zh: '领域', en: 'Field' }, latin: 'FIELD', color: 0x3dffa0, role: 'place',
    tag: { zh: '持续 · 控场', en: 'Lingering · Control' },
    desc: {
      zh: '在落点展开持续领域，周期性造成伤害并把目标拉向中心',
      en: 'Leaves a lingering field that ticks damage and pulls targets inward',
    },
    stack: n => {
      const c = capOf('field', n);
      return {
        zh: `半径 +${Math.round((c - 1) * 26)}% · 持续 ${(4 + 1.6 * c).toFixed(1)}s · 频率 +${Math.round((c - 1) * 20)}%`,
        en: `radius +${Math.round((c - 1) * 26)}% · lasts ${(4 + 1.6 * c).toFixed(1)}s · tick rate +${Math.round((c - 1) * 20)}%`,
      };
    },
  },
  orbit: {
    key: 'orbit', name: { zh: '环绕', en: 'Orbit' }, latin: 'SATELLITE', color: 0x5c8cff, role: 'deliver',
    tag: { zh: '召唤 · 自动', en: 'Summon · Auto' },
    desc: {
      zh: '在水晶周围召唤环绕卫星，自动索敌并射击',
      en: 'Summons satellites around the crystal that seek and fire on their own',
    },
    stack: n => {
      const c = capOf('orbit', n);
      return {
        zh: `${c} 颗卫星 · 射击间隔 ${(1.15 / (1 + 0.28 * (c - 1))).toFixed(2)}s · 存在 ${(5 + c * 1.1).toFixed(1)}s`,
        en: `${c} satellites · every ${(1.15 / (1 + 0.28 * (c - 1))).toFixed(2)}s · lasts ${(5 + c * 1.1).toFixed(1)}s`,
      };
    },
  },
  rune: {
    key: 'rune', name: { zh: '符文', en: 'Sigil' }, latin: 'SIGIL', color: 0xff5ce0, role: 'place',
    tag: { zh: '延时 · 连环', en: 'Delayed · Chain' },
    desc: {
      zh: '在地面刻下符文，短暂吟唱后连环引爆',
      en: 'Carves sigils into the ground that chant briefly, then chain-detonate',
    },
    stack: n => {
      const c = capOf('rune', n);
      return {
        zh: `${c} 枚符文 · 半径 +${Math.round((c - 1) * 24)}% · 连环间隔更短`,
        en: `${c} sigils · radius +${Math.round((c - 1) * 24)}% · shorter chain delay`,
      };
    },
  },
};

/** 每个方式的叠加上限（过载模式下最多 29 个方式，默认封顶保护帧率） */
export const METHOD_CAPS = {
  orb: 6, beam: 6, barrage: 4, burst: 6, chain: 5, field: 6, orbit: 6, rune: 8,
};

/** 关闭性能限制时，叠加上限完全放开 */
export function capOf(key, n) {
  if (Settings.uncapped) return Math.max(1, n);
  const cap = METHOD_CAPS[key] ?? n;
  return Math.max(1, Math.min(n, cap));
}

export const METHOD_LIST = Object.values(METHODS);
export const METHOD_KEYS = Object.keys(METHODS);

export const methodName = m => L(m.name);
export const methodTag = m => L(m.tag);
export const methodDesc = m => L(m.desc);
export const methodStack = (m, n) => L(m.stack(n));

/** 施法时各类方式的处理顺序（先铺场，再投送） */
export const CAST_ORDER = ['field', 'rune', 'burst', 'orbit', 'barrage', 'beam', 'orb'];

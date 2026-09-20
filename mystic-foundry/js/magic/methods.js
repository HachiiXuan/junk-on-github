/**
 * 释放方式 —— 决定「如何造成伤害」
 *   role  deliver : 从水晶投送出去
 *   role  place   : 直接在落点生成
 *   role  meta    : 附着在每一次命中上（触发 / 叠加）
 */
export const METHODS = {
  orb: {
    key: 'orb', name: '球体', en: 'ORB', color: 0x7fe6ff, role: 'deliver',
    tag: '投送 · 追踪',
    desc: '从水晶抛出光球，飞行途中拖出光尾，命中即爆',
    stack: n => n === 1 ? '1 颗光球' : `${n} 颗光球 · 自动锁定不同目标 · 体积 +${Math.round((n - 1) * 18)}%`,
  },
  beam: {
    key: 'beam', name: '射线', en: 'LANCE', color: 0xffd166, role: 'deliver',
    tag: '投送 · 贯穿',
    desc: '射出笔直光矛，贯穿路径上的所有目标',
    stack: n => `${n} 道光矛呈扇形展开 · 宽度 +${Math.round((n - 1) * 22)}% · 贯穿不变`,
  },
  barrage: {
    key: 'barrage', name: '轰击', en: 'BARRAGE', color: 0xff8a4c, role: 'deliver',
    tag: '投送 · 覆盖',
    desc: '自天穹召下陨星，砸向落点周围',
    stack: n => `${n} 波陨星 · 每波 ${1 + Math.floor(n / 2)} 颗 · 散布范围 +${Math.round((n - 1) * 30)}%`,
  },
  burst: {
    key: 'burst', name: '爆裂', en: 'BURST', color: 0xff3d7f, role: 'meta',
    tag: '增幅 · 连锁',
    desc: '让每一次命中都剧烈炸裂；范围与伤害同步放大',
    stack: n => `半径 ×${(1 + 0.40 * n).toFixed(2)} · 伤害 ×${(1 + 0.18 * n).toFixed(2)} · 引爆连锁 ${n - 1} 次`,
  },
  chain: {
    key: 'chain', name: '雷链', en: 'CHAIN', color: 0xb388ff, role: 'meta',
    tag: '扩散 · 跳弹',
    desc: '从命中点迸出电弧，在目标之间反复跳跃',
    stack: n => `跳数 ${1 + 2 * n} · 跳距 +${Math.round((n - 1) * 35)}% · 电弧更粗`,
  },
  field: {
    key: 'field', name: '领域', en: 'FIELD', color: 0x3dffa0, role: 'place',
    tag: '持续 · 控场',
    desc: '在落点展开持续领域，周期性造成伤害并把目标拉向中心',
    stack: n => `半径 +${Math.round((n - 1) * 26)}% · 持续 ${(4 + 1.6 * n).toFixed(1)}s · 频率 +${Math.round((n - 1) * 20)}%`,
  },
  orbit: {
    key: 'orbit', name: '环绕', en: 'SATELLITE', color: 0x5c8cff, role: 'deliver',
    tag: '召唤 · 自动',
    desc: '在水晶周围召唤环绕卫星，自动索敌并射击',
    stack: n => `${n} 颗卫星 · 射击间隔 ${(1.15 / (1 + 0.28 * (n - 1))).toFixed(2)}s · 存在 ${(5 + n * 1.1).toFixed(1)}s`,
  },
  rune: {
    key: 'rune', name: '符文', en: 'SIGIL', color: 0xff5ce0, role: 'place',
    tag: '延时 · 连环',
    desc: '在地面刻下符文，短暂吟唱后连环引爆',
    stack: n => `${n} 枚符文 · 半径 +${Math.round((n - 1) * 24)}% · 连环间隔更短`,
  },
};

export const METHOD_LIST = Object.values(METHODS);
export const METHOD_KEYS = Object.keys(METHODS);

/** 施法时各类方式的处理顺序（先铺场，再投送） */
export const CAST_ORDER = ['field', 'rune', 'burst', 'orbit', 'barrage', 'beam', 'orb'];

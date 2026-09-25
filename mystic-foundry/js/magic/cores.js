import { L } from '../i18n.js';

/**
 * 法术核心 —— 决定法术的「全局属性」
 *   · 全局伤害倍率 / 范围倍率 / 飞行速度倍率
 *   · 命中时附加的状态
 *   · 每次命中额外触发的核心特有效果（见 effects.js 的 CORE_FX）
 * 文案一律写成 { zh, en }，由 i18n 层按当前语言取用。8 个核心在面板里排成 2×4。
 */
export const CORES = {
  fire: {
    key: 'fire', name: { zh: '火', en: 'Fire' }, latin: 'IGNIS',
    color: 0xff5a1e, color2: 0xffc46b,
    dmg: 1.30, radius: 1.10, speed: 1.00, status: 'burn',
    tag: { zh: '爆发 · 灼烧', en: 'Burst · Burn' },
    passive: {
      zh: '命中点燃目标，持续灼烧；每次命中溅射火环',
      en: 'Ignites targets for damage over time; every hit splashes a fire ring',
    },
    flavor: { zh: '锻炉之心，脾气不太好。', en: 'A forge heart with a short temper.' },
  },
  water: {
    key: 'water', name: { zh: '水', en: 'Water' }, latin: 'UNDA',
    color: 0x2fa8ff, color2: 0x9fe8ff,
    dmg: 1.00, radius: 1.24, speed: 1.06, status: 'wet',
    tag: { zh: '控场 · 牵引', en: 'Control · Pull' },
    passive: {
      zh: '命中使目标濡湿（减速），并把目标拉向爆心',
      en: 'Soaks targets (slow) and drags them toward the impact point',
    },
    flavor: { zh: '温柔，但会淹死你。', en: 'Gentle. It still drowns you.' },
  },
  earth: {
    key: 'earth', name: { zh: '大地', en: 'Earth' }, latin: 'TERRA',
    color: 0xc98a3c, color2: 0x8a5a2b,
    dmg: 1.42, radius: 1.16, speed: 0.88, status: 'root',
    tag: { zh: '重击 · 震荡', en: 'Heavy · Quake' },
    passive: {
      zh: '命中山崩：击退极强，并追加一圈二次震波',
      en: 'A landslide: massive knockback plus a second shockwave',
    },
    flavor: { zh: '慢，但每一击都算数。', en: 'Slow, and every hit counts.' },
  },
  ice: {
    key: 'ice', name: { zh: '冰', en: 'Ice' }, latin: 'GLACIES',
    color: 0x5ce1ff, color2: 0xe8fbff,
    dmg: 1.22, radius: 1.14, speed: 0.98, status: 'freeze',
    tag: { zh: '冻结 · 脆化', en: 'Freeze · Brittle' },
    passive: {
      zh: '命中冻结目标（定身），冻结期间受到伤害 +30%，并迸出冰晶碎片',
      en: 'Freezes targets in place; frozen targets take +30% damage and ice shards burst outward',
    },
    flavor: { zh: '冷得连时间都慢了半拍。', en: 'So cold that time itself stumbles.' },
  },
  light: {
    key: 'light', name: { zh: '光明', en: 'Light' }, latin: 'LUX',
    color: 0xffe9a8, color2: 0xfff6dd,
    dmg: 1.12, radius: 1.26, speed: 1.24, status: 'mark',
    tag: { zh: '迅捷 · 圣印', en: 'Swift · Brand' },
    passive: {
      zh: '打上圣印（受到伤害 +28%），并射出棱镜光刺',
      en: 'Brands targets (+28% damage taken) and fires prismatic spikes',
    },
    flavor: { zh: '照亮一切，包括不该被照亮的。', en: 'Lights up everything, including what should stay dark.' },
  },
  dark: {
    key: 'dark', name: { zh: '黑暗', en: 'Dark' }, latin: 'NOX',
    color: 0xa24bff, color2: 0x5b1ea8,
    dmg: 1.58, radius: 1.06, speed: 0.96, status: 'curse',
    tag: { zh: '侵蚀 · 诅咒', en: 'Erode · Curse' },
    passive: {
      zh: '施加诅咒（受到伤害 +45%），并汲取生命回馈水晶',
      en: 'Curses targets (+45% damage taken) and drains life back into the crystal',
    },
    flavor: { zh: '它也要吃东西。', en: 'It has to eat too.' },
  },
  wind: {
    key: 'wind', name: { zh: '风', en: 'Wind' }, latin: 'VENTUS',
    color: 0x5ef2c4, color2: 0xc9fff0,
    dmg: 0.88, radius: 1.40, speed: 1.40, status: 'gust',
    tag: { zh: '高频 · 卷扬', en: 'Rapid · Lift' },
    passive: {
      zh: '把目标卷上半空并远远抛开，范围最大',
      en: 'Lifts targets into the air and hurls them away; widest radius',
    },
    flavor: { zh: '你不该站在下风口。', en: 'You should not stand downwind.' },
  },
  thunder: {
    key: 'thunder', name: { zh: '雷', en: 'Thunder' }, latin: 'TONITRUS',
    color: 0x8fd4ff, color2: 0xfff3a0,
    dmg: 1.45, radius: 1.00, speed: 1.18, status: 'shock',
    tag: { zh: '连锁 · 麻痹', en: 'Chain · Stun' },
    passive: {
      zh: '麻痹目标，并且每次命中自动多跳 1 道电弧',
      en: 'Stuns targets, and every hit adds one extra arc jump',
    },
    flavor: { zh: '一次不够，那就跳过去再来一次。', en: 'Once is not enough — it jumps over and does it again.' },
  },
};

export const CORE_LIST = Object.values(CORES);

export const coreName = c => L(c.name);
export const coreTag = c => L(c.tag);
export const corePassive = c => L(c.passive);

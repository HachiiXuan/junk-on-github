/**
 * 法术核心 —— 决定法术的「全局属性」
 *   · 全局伤害倍率 / 范围倍率 / 飞行速度倍率
 *   · 命中时附加的状态
 *   · 每次命中额外触发的核心特有效果（见 effects.js 的 CORE_FX）
 */
export const CORES = {
  fire: {
    key: 'fire', name: '火', en: 'IGNIS', color: 0xff5a1e, color2: 0xffc46b,
    dmg: 1.30, radius: 1.10, speed: 1.00, status: 'burn',
    tag: '爆发 · 灼烧',
    passive: '命中点燃目标，持续灼烧；每次命中溅射火环',
    flavor: '锻炉之心，脾气不太好。',
  },
  water: {
    key: 'water', name: '水', en: 'UNDA', color: 0x2fa8ff, color2: 0x9fe8ff,
    dmg: 1.00, radius: 1.24, speed: 1.06, status: 'wet',
    tag: '控场 · 牵引',
    passive: '命中使目标濡湿（减速），并把目标拉向爆心',
    flavor: '温柔，但会淹死你。',
  },
  earth: {
    key: 'earth', name: '大地', en: 'TERRA', color: 0xc98a3c, color2: 0x8a5a2b,
    dmg: 1.42, radius: 1.16, speed: 0.88, status: 'root',
    tag: '重击 · 震荡',
    passive: '命中山崩：击退极强，并追加一圈二次震波',
    flavor: '慢，但每一击都算数。',
  },
  light: {
    key: 'light', name: '光明', en: 'LUX', color: 0xffe9a8, color2: 0xfff6dd,
    dmg: 1.12, radius: 1.26, speed: 1.24, status: 'mark',
    tag: '迅捷 · 圣印',
    passive: '打上圣印（受到伤害 +28%），并射出棱镜光刺',
    flavor: '照亮一切，包括不该被照亮的。',
  },
  dark: {
    key: 'dark', name: '黑暗', en: 'NOX', color: 0xa24bff, color2: 0x5b1ea8,
    dmg: 1.58, radius: 1.06, speed: 0.96, status: 'curse',
    tag: '侵蚀 · 诅咒',
    passive: '施加诅咒（受到伤害 +45%），并汲取生命回馈水晶',
    flavor: '它也要吃东西。',
  },
  wind: {
    key: 'wind', name: '风', en: 'VENTUS', color: 0x5ef2c4, color2: 0xc9fff0,
    dmg: 0.88, radius: 1.40, speed: 1.40, status: 'gust',
    tag: '高频 · 卷扬',
    passive: '把目标卷上半空并远远抛开，范围最大',
    flavor: '你不该站在下风口。',
  },
  thunder: {
    key: 'thunder', name: '雷', en: 'TONITRUS', color: 0x8fd4ff, color2: 0xfff3a0,
    dmg: 1.45, radius: 1.00, speed: 1.18, status: 'shock',
    tag: '连锁 · 麻痹',
    passive: '麻痹目标，并且每次命中自动多跳 1 道电弧',
    flavor: '一次不够，那就跳过去再来一次。',
  },
};

export const CORE_LIST = Object.values(CORES);

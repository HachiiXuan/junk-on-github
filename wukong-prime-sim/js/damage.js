/**
 * 伤害系统
 * 流程：掷骰决定暴击等级 → 取基础伤害 → 乘暴击倍率 → 紫卡再乘 → 返回颜色/数值
 */
const DamageSystem = (function () {
  'use strict';

  // 暴击等级：白 → 黄 → 橙 → 红
  const CRIT_LEVELS = [
    { level: 0, name: '普通',     color: '#FFFFFF' },
    { level: 1, name: '暴击',     color: '#FFD700' },
    { level: 2, name: '强力暴击', color: '#FF8C00' },
    { level: 3, name: '最强暴击', color: '#FF2A2A' }
  ];

  // 累加概率表：5% 红 / 15% 橙 / 30% 黄 / 50% 白
  const CRIT_ROLL_TABLE = [
    { level: 3, threshold: 0.05 },
    { level: 2, threshold: 0.20 },
    { level: 1, threshold: 0.50 },
    { level: 0, threshold: 1.00 }
  ];

  // 基础伤害区间（紫卡关闭时）
  const BASE_DAMAGE = { min: 200_000, max: 1_000_000 };

  // 各暴击等级对应的倍率
  const CRIT_MULTIPLIERS = [1, 2, 4, 6];

  // 紫卡模式总倍率
  const PURPLE_MULTIPLIER = 100;

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function rollCritLevel() {
    const r = Math.random();
    for (const row of CRIT_ROLL_TABLE) {
      if (r < row.threshold) return row.level;
    }
    return 0;
  }

  /**
   * 掷一次伤害
   * @param {boolean} purpleCard 紫卡模式是否开启
   * @returns {{damage:number, level:number, color:string, name:string, isPurple:boolean}}
   */
  function roll(purpleCard) {
    const baseLevel = rollCritLevel();
    const base = randInt(BASE_DAMAGE.min, BASE_DAMAGE.max);

    let level = baseLevel;
    let multiplier = CRIT_MULTIPLIERS[baseLevel];

    if (purpleCard) {
      multiplier *= PURPLE_MULTIPLIER;
      level = 3; // 紫卡强制最高级颜色
    }

    const damage = Math.floor(base * multiplier);
    const info = CRIT_LEVELS[level];

    return {
      damage,
      level,
      color: info.color,
      name: info.name,
      isPurple: purpleCard
    };
  }

  return {
    roll,
    CRIT_LEVELS,
    // 暴露配置方便后续调参
    config: { BASE_DAMAGE, CRIT_MULTIPLIERS, PURPLE_MULTIPLIER, CRIT_ROLL_TABLE }
  };
})();
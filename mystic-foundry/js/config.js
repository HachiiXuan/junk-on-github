/**
 * 全局配置 —— 数值调优集中在这里
 */
export const CONFIG = {
  /* 场景 */
  arena: {
    radius: 15.5,          // 可站立半径
    groundRadius: 26,      // 地面圆盘半径
    castRadius: 15.0,      // 施法落点最大半径
    figureCount: 38,       // 小人数量
  },

  /* 相机 */
  camera: {
    fov: 48,
    start: { az: 0.0, el: 0.46, dist: 30 },
    minEl: 0.10,
    maxEl: 1.35,
    minDist: 13,
    maxDist: 52,
    target: { x: 0, y: 2.2, z: 0 },
    /* 左键专属施法，所以旋转用右键 / 中键 */
  },

  /* 水晶 */
  crystal: {
    height: 8.2,           // 悬浮高度
    chargeTime: 0.30,      // 蓄力时长
    cooldown: 0.28,        // 两次施法最小间隔
  },

  /* 小人 */
  figure: {
    maxHp: 100,
    respawn: 2.6,
  },

  /* 画面质量开关 */
  quality: {
    bloom: true,
    bloomStrength: 0.62,
    bloomThreshold: 0.84,
    bloomKnee: 0.3,
    exposure: 1.0,
    shadows: true,
    shadowMapSize: 1024,
    sparkBudget: 900,      // 火花粒子池上限
    maxPixelRatio: 1.75,
  },
};

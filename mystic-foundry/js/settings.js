/**
 * 用户级开关（与 config.js 的"调参常量"区分开）
 * 会写进 localStorage，下次打开沿用。
 */
const KEY = 'mf.settings';

const DEFAULTS = {
  /** 过载模式的性能限制总开关：打开后放开预算/数量/深度/数值上限 */
  uncapped: false,
  /** 音效总开关 */
  sfx: true,
  /** 主音量 0~1 */
  volume: 0.75,
};

export const Settings = {
  ...DEFAULTS,

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        for (const k of Object.keys(DEFAULTS)) {
          if (typeof o[k] === typeof DEFAULTS[k]) this[k] = o[k];
        }
      }
    } catch { /* 隐私模式 / 坏数据忽略 */ }
    return this;
  },

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        uncapped: this.uncapped, sfx: this.sfx, volume: this.volume,
      }));
    } catch { /* ignore */ }
  },

  set(key, value) {
    if (!(key in DEFAULTS)) return;
    this[key] = value;
    this.save();
  },

  /** 当前是否处于"过载 + 解除限制"状态 */
  get bruteforce() { return this.uncapped; },
};

Settings.load();

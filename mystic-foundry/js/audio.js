import { Settings } from './settings.js';

/**
 * 纯 Web Audio 合成音效 —— 不加载任何音频资源。
 *
 * 结构：  声源(振荡器/噪声) → 滤波 → 包络 → 总线压缩 → 主音量 → 输出
 * 安全性： 所有对外方法都吞掉异常，音频永远不影响玩法；
 *          有并发声部上限与命中限流，29 个方式的过载法术也不会糊成噪音。
 */

let _ctx = null;
let _comp = null;
let _master = null;
let _noiseBuf = null;
let _voices = 0;
let _ready = false;

/* 命中限流：0.35s 窗口内最多 7 次，避免几十次派生同时炸响 */
let _winStart = 0;
let _winCount = 0;

/* 氛围音（水晶低鸣） */
let _amb = null;

const MAX_VOICES = 44;

/* ============================================================
 *  基础设施
 * ============================================================ */
function ac() {
  if (_ctx) return _ctx;
  const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctor) return null;
  try {
    _ctx = new Ctor({ latencyHint: 'interactive' });
    _comp = _ctx.createDynamicsCompressor();
    _comp.threshold.value = -10;
    _comp.knee.value = 14;
    _comp.ratio.value = 9;
    _comp.attack.value = 0.003;
    _comp.release.value = 0.22;
    _master = _ctx.createGain();
    _master.gain.value = Settings.volume * 0.85;
    _comp.connect(_master);
    _master.connect(_ctx.destination);
    _ready = true;
  } catch {
    _ctx = null;
  }
  return _ctx;
}

function noiseBuffer() {
  if (_noiseBuf || !_ctx) return _noiseBuf;
  const len = Math.floor(_ctx.sampleRate * 2);
  const buf = _ctx.createBuffer(1, len, _ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;      // 轻微低通，听起来更"厚"
    d[i] = w * 0.7 + last * 3;
  }
  _noiseBuf = buf;
  return buf;
}

const now = () => (_ctx ? _ctx.currentTime : 0);
const canVoice = n => _ready && Settings.sfx && _voices < MAX_VOICES && !!ac();

function track(node) {
  _voices++;
  node.onended = () => { _voices = Math.max(0, _voices - 1); };
  return node;
}

/** 单个振荡器声部 */
function osc(type, f0, f1, t0, dur, gain, dest) {
  const c = ac();
  const o = c.createOscillator();
  o.type = type;
  o.detune.value = (Math.random() - 0.5) * 12;
  o.frequency.setValueAtTime(Math.max(1, f0), t0);
  if (f1 != null && f1 !== f0) {
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
  }
  const g = c.createGain();
  const atk = Math.min(0.014, dur * 0.25);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(dest || _comp);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
  return track(o);
}

/** 噪声声部（带可变滤波） */
function noise(t0, dur, gain, filterType, f0, f1, q, dest) {
  const c = ac();
  const s = c.createBufferSource();
  s.buffer = noiseBuffer();
  s.loop = true;
  const f = c.createBiquadFilter();
  f.type = filterType;
  f.Q.value = q ?? 1;
  f.frequency.setValueAtTime(Math.max(20, f0), t0);
  if (f1 != null && f1 !== f0) {
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  }
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.01, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f);
  f.connect(g);
  g.connect(dest || _comp);
  s.start(t0, Math.random() * 1.5);
  s.stop(t0 + dur + 0.03);
  return track(s);
}

/** FM 钟 / 水晶音 */
function bell(t0, freq, dur, gain, ratio = 3.01) {
  const c = ac();
  const car = c.createOscillator();
  car.type = 'sine';
  car.frequency.value = freq;
  const mod = c.createOscillator();
  mod.type = 'sine';
  mod.frequency.value = freq * ratio;
  const mg = c.createGain();
  mg.gain.setValueAtTime(freq * 2.4, t0);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, freq * 0.05), t0 + dur * 0.55);
  mod.connect(mg);
  mg.connect(car.frequency);

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  car.connect(g);
  g.connect(_comp);
  mod.start(t0); mod.stop(t0 + dur + 0.03);
  car.start(t0); car.stop(t0 + dur + 0.03);
  return track(car);
}

/** 低频冲击（爆炸的地基） */
function thump(t0, f0, f1, dur, gain) {
  const c = ac();
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(18, f1), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(_comp);
  o.start(t0); o.stop(t0 + dur + 0.03);
  return track(o);
}

/** 声音总线（供场域之类的持续音使用） */
function bus(gain = 1) {
  const c = ac();
  const g = c.createGain();
  g.gain.value = gain;
  g.connect(_comp);
  return g;
}

function impactAllowed() {
  const t = now();
  if (t - _winStart > 0.35) { _winStart = t; _winCount = 0; }
  if (_winCount >= 7) return false;
  _winCount++;
  return true;
}

/* ============================================================
 *  对外接口
 * ============================================================ */
export const Audio = {
  get ready() { return _ready; },
  get state() { return _ctx ? _ctx.state : 'none'; },
  get voices() { return _voices; },

  /** 首次用户手势时解锁（浏览器自动播放策略） */
  unlock() {
    try {
      if (!Settings.sfx) return;
      const c = ac();
      if (!c) return;
      if (c.state === 'suspended') c.resume();
      if (_master) _master.gain.value = Settings.volume * 0.85;
      this.ambience(true);
    } catch { /* ignore */ }
  },

  setEnabled(on) {
    Settings.set('sfx', !!on);
    try {
      if (on) {
        const c = ac();
        if (!c) return;
        if (c.state === 'suspended') c.resume();
        if (_master) _master.gain.value = Settings.volume * 0.85;
        this.ambience(true);
      } else {
        this.ambience(false);
        if (_master) _master.gain.value = 0;
        if (_ctx && _ctx.state === 'running') _ctx.suspend();
        _voices = 0;
      }
    } catch { /* ignore */ }
  },

  setVolume(v) {
    Settings.set('volume', Math.max(0, Math.min(1, v)));
    try { if (_master && Settings.sfx) _master.gain.value = Settings.volume * 0.85; } catch { /* ignore */ }
  },

  /* ---------------- 界面 ---------------- */

  ui(kind = 'click') {
    if (!canVoice()) return;
    try {
      const t = now() + 0.001;
      if (kind === 'click') {
        osc('triangle', 880, 660, t, 0.07, 0.1);
      } else if (kind === 'toggle') {
        osc('sine', 520, 780, t, 0.09, 0.11);
      } else if (kind === 'deny') {
        osc('square', 220, 160, t, 0.09, 0.07);
        osc('square', 180, 120, t + 0.08, 0.12, 0.07);
      } else if (kind === 'craft') {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          osc('triangle', f, f, t + i * 0.055, 0.34, 0.085);
        });
        bell(t + 0.16, 1568, 0.6, 0.05);
      } else if (kind === 'open') {
        osc('sine', 300, 620, t, 0.16, 0.07);
      }
    } catch { /* ignore */ }
  },

  /* ---------------- 施法 ---------------- */

  /** 蓄力：时长与前摇一致 */
  charge(coreKey, dur = 0.45) {
    if (!canVoice()) return;
    try {
      const t = now() + 0.001;
      const base = CORE_BASE[coreKey] || 140;
      osc('sawtooth', base, base * 4.2, t, dur, 0.055, _sweepFilter(t, dur, 300, 2600));
      noise(t, dur, 0.035, 'bandpass', 260, 2200, 1.4);
      osc('sine', base * 0.5, base * 0.5, t, dur, 0.05);
    } catch { /* ignore */ }
  },

  /** 释放瞬间 */
  fire(coreKey) {
    if (!canVoice()) return;
    try {
      const t = now() + 0.001;
      const base = CORE_BASE[coreKey] || 140;
      noise(t, 0.26, 0.16, 'highpass', 1400, 5200, 0.9);
      osc('sine', base * 6, base * 2.2, t, 0.3, 0.12);
      bell(t, base * 9, 0.5, 0.06);
    } catch { /* ignore */ }
  },

  /** 命中：按核心给不同音色，radius 决定体量 */
  impact(coreKey, radius = 3) {
    if (!canVoice() || !impactAllowed()) return;
    try {
      const t = now() + 0.001;
      const s = Math.max(0.25, Math.min(1.6, radius / 5));
      const base = CORE_BASE[coreKey] || 140;

      switch (coreKey) {
        case 'fire':
          thump(t, base * 1.6, base * 0.5, 0.42 * s, 0.30 * s);
          noise(t, 0.5 * s, 0.18 * s, 'bandpass', 1100, 260, 0.8);
          noise(t + 0.05, 0.3, 0.09 * s, 'highpass', 2600, 3600, 0.6);
          break;

        case 'water':
          thump(t, base * 1.2, base * 0.55, 0.5 * s, 0.22 * s);
          noise(t, 0.5 * s, 0.17 * s, 'lowpass', 1800, 240, 1.6);
          osc('sine', 520, 140, t, 0.34, 0.07);
          break;

        case 'earth':
          thump(t, 86, 34, 0.85 * s, 0.42 * s);
          noise(t, 0.36 * s, 0.16 * s, 'lowpass', 520, 110, 1.2);
          noise(t + 0.02, 0.22, 0.1, 'bandpass', 300, 160, 2);
          break;

        case 'ice':
          bell(t, 1500 + Math.random() * 300, 0.75 * s, 0.11 * s, 3.02);
          bell(t + 0.02, 2350, 0.5, 0.06);
          noise(t, 0.24, 0.13 * s, 'highpass', 3200, 5200, 0.8);
          thump(t, 200, 90, 0.3, 0.13 * s);
          break;

        case 'light':
          [1046.5, 1318.5, 1568].forEach((f, i) => bell(t + i * 0.02, f, 0.6, 0.06));
          noise(t, 0.22, 0.12, 'highpass', 2200, 4600, 0.7);
          thump(t, 260, 110, 0.28, 0.12 * s);
          break;

        case 'dark':
          thump(t, 74, 30, 0.95 * s, 0.36 * s);
          osc('sine', base * 0.8, base * 0.45, t, 0.9 * s, 0.11);
          osc('sawtooth', base * 0.82, base * 0.44, t, 0.7 * s, 0.035);
          noise(t, 0.85 * s, 0.13 * s, 'lowpass', 420, 80, 1.4);
          break;

        case 'wind':
          noise(t, 0.7 * s, 0.16 * s, 'bandpass', 420, 2400, 1.1);
          noise(t + 0.12, 0.5 * s, 0.12 * s, 'bandpass', 2200, 500, 1.3);
          osc('sine', 300, 160, t, 0.5, 0.05);
          break;

        case 'thunder':
          noise(t, 0.16, 0.26 * s, 'highpass', 3800, 1400, 0.6);
          thump(t, 96, 36, 1.1 * s, 0.34 * s);
          noise(t + 0.04, 1.0 * s, 0.16 * s, 'lowpass', 900, 110, 0.9);
          osc('square', 180, 70, t + 0.01, 0.2, 0.06);
          break;

        default:
          thump(t, base, base * 0.5, 0.5, 0.26 * s);
          noise(t, 0.4 * s, 0.15 * s, 'lowpass', 900, 200, 1);
      }
    } catch { /* ignore */ }
  },

  /** 光矛 */
  beam(coreKey) {
    if (!canVoice()) return;
    try {
      const t = now() + 0.001;
      const base = CORE_BASE[coreKey] || 140;
      osc('sawtooth', base * 8, base * 2, t, 0.18, 0.09, _sweepFilter(t, 0.18, 4000, 700));
      noise(t, 0.14, 0.08, 'highpass', 2600, 1400, 0.8);
    } catch { /* ignore */ }
  },

  /** 连锁电弧 */
  chain(count = 3) {
    if (!canVoice()) return;
    try {
      const t = now() + 0.001;
      const n = Math.min(count, 7);
      for (let i = 0; i < n; i++) {
        const tt = t + i * 0.055;
        noise(tt, 0.07, 0.12, 'highpass', 4200, 1800, 0.7);
        osc('square', 900 + Math.random() * 900, 300, tt, 0.07, 0.05);
      }
    } catch { /* ignore */ }
  },

  /** 陨星划过 */
  meteor(size = 1) {
    if (!canVoice()) return;
    try {
      const t = now() + 0.001;
      osc('sine', 1500, 320, t, 0.42, 0.075);
      noise(t, 0.42, 0.07, 'bandpass', 1800, 600, 1.6);
    } catch { /* ignore */ }
  },

  /** 领域：持续低鸣，自动收尾 */
  field(coreKey, dur = 5) {
    if (!canVoice()) return;
    try {
      const t = now() + 0.001;
      const g = bus(0.0001);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.25);
      g.gain.setValueAtTime(0.09, t + Math.max(0.3, dur - 0.6));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      const base = (CORE_BASE[coreKey] || 140) * 0.5;
      const a = ac().createOscillator(); a.type = 'sine'; a.frequency.value = base;
      const b = ac().createOscillator(); b.type = 'sine'; b.frequency.value = base * 1.5;
      const c = ac().createOscillator(); c.type = 'triangle'; c.frequency.value = base * 2.02;
      const lp = ac().createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 2;
      const lfo = ac().createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.28;
      const lg = ac().createGain(); lg.gain.value = 260;
      lfo.connect(lg); lg.connect(lp.frequency);

      [a, b, c].forEach(o => { o.connect(lp); o.start(t); o.stop(t + dur + 0.1); track(o); });
      lfo.start(t); lfo.stop(t + dur + 0.1); track(lfo);
      lp.connect(g);
    } catch { /* ignore */ }
  },

  /** 符文吟唱：音高随引信上升 */
  rune(fuse = 0.7) {
    if (!canVoice()) return;
    try {
      const t = now() + 0.001;
      osc('triangle', 300, 1200, t, fuse, 0.06);
      noise(t, fuse, 0.03, 'bandpass', 600, 1800, 2.4);
    } catch { /* ignore */ }
  },

  /** 卫星射击 */
  orbit() {
    if (!canVoice()) return;
    try {
      const t = now() + 0.001;
      osc('triangle', 1400, 900, t, 0.1, 0.05);
      noise(t, 0.06, 0.045, 'highpass', 3000, 5000, 0.7);
    } catch { /* ignore */ }
  },

  /** 小人被击倒 */
  kill() {
    if (!canVoice()) return;
    try {
      const t = now() + 0.001;
      osc('triangle', 700, 180, t, 0.22, 0.07);
      noise(t, 0.16, 0.07, 'bandpass', 1200, 400, 1.2);
    } catch { /* ignore */ }
  },

  /* ---------------- 氛围 ---------------- */

  ambience(on) {
    if (!_ready) return;
    try {
      if (!on) {
        if (_amb) {
          const t = now();
          try {
            _amb.gain.cancelScheduledValues(t);
            _amb.gain.setValueAtTime(Math.max(0.0001, _amb.gain.value), t);
            _amb.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
          } catch { /* ignore */ }
          const nodes = _amb._nodes || [];
          for (const n of nodes) { try { n.stop(t + 0.55); } catch { /* ignore */ } }
          _amb = null;
        }
        return;
      }
      if (_amb || !Settings.sfx) return;

      const t = now();
      const g = bus(0.0001);
      g.gain.exponentialRampToValueAtTime(0.028, t + 3.5);

      const mk = (f, type, gain) => {
        const o = ac().createOscillator();
        o.type = type;
        o.frequency.value = f;
        const og = ac().createGain();
        og.gain.value = gain;
        o.connect(og); og.connect(g);
        o.start(t);
        return o;
      };
      const a = mk(55, 'sine', 1);
      const b = mk(55.35, 'sine', 0.8);
      const c = mk(110.6, 'triangle', 0.28);

      const lp = ac().createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.7;
      g.disconnect(); g.connect(lp); lp.connect(_comp);

      const lfo = ac().createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.045;
      const lg = ac().createGain(); lg.gain.value = 130;
      lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);

      g._nodes = [a, b, c, lfo];
      _amb = g;
    } catch { /* ignore */ }
  },
};

/* ============================================================
 *  辅助
 * ============================================================ */

/** 各核心的基准频率，决定音色高低 */
const CORE_BASE = {
  fire: 130, water: 190, earth: 74, ice: 320,
  light: 260, dark: 66, wind: 220, thunder: 110,
};

/** 建一个带包络的低通，用来给扫频音色塑形（已接到总线） */
function _sweepFilter(t0, dur, f0, f1) {
  const c = ac();
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 5;
  f.frequency.setValueAtTime(f0, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t0 + dur);
  f.connect(_comp);
  return f;
}

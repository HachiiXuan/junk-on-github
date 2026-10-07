/* ============================================================
   audio.js  ——  音频引擎 + 音效合成 + 频谱分析节点
   ============================================================ */
(function (global) {
  'use strict';

  let ctx = null;
  let masterGain = null;
  let analyser = null;

  const bufferCache = new Map();
  const activeSources = new Set();

  /* ---- 软削波曲线（工业饱和） ---- */
  function makeSaturationCurve() {
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = i / 511 - 1;
      curve[i] = Math.tanh(x * 1.5);
    }
    return curve;
  }

  /* ---- 初始化音频上下文 ---- */
  function ensureAudio() {
    if (ctx) return;

    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.8;

    const shaper = ctx.createWaveShaper();
    shaper.curve = makeSaturationCurve();
    shaper.oversample = '2x';

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 14;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    analyser.minDecibels = -92;
    analyser.maxDecibels = -12;

    /* 主链：masterGain → shaper → comp → analyser → destination */
    masterGain.connect(shaper);
    shaper.connect(comp);
    comp.connect(analyser);
    analyser.connect(ctx.destination);
  }

  /* ---- 生成 AudioBuffer ---- */
  function buildBuffer(dur, fn) {
    const sr = ctx.sampleRate;
    const len = Math.max(1, Math.floor(dur * sr));
    const buf = ctx.createBuffer(1, len, sr);
    fn(buf.getChannelData(0), sr, len);
    return buf;
  }

  /* ============================================================
     音效定义
     ============================================================ */
  const SFX = {

    /* 铁砧重击 */
    anvil: {
      defInterval: 8,
      fn() {
        return buildBuffer(1.5, (out, sr, len) => {
          const partials = [
            [1.00, 1.00, 2.2], [1.73, 0.75, 3.0], [2.41, 0.60, 3.8], [3.17, 0.45, 4.6],
            [4.09, 0.35, 5.6], [5.23, 0.28, 6.6], [6.71, 0.20, 8.0], [8.13, 0.14, 9.5], [10.4, 0.10, 11.5]
          ];
          const f0 = 172;
          let lp = 0; const a = 1 - Math.exp(-2 * Math.PI * 5000 / sr);
          for (let i = 0; i < len; i++) {
            const t = i / sr;
            let s = 0;
            for (const [r, amp, dec] of partials) {
              s += amp * Math.exp(-dec * t) * Math.sin(2 * Math.PI * f0 * r * t + r * 1.7);
            }
            const nz = Math.random() * 2 - 1;
            lp += a * (nz - lp);
            s += lp * 0.65 * Math.exp(-35 * t);
            s += (Math.random() * 2 - 1) * 0.25 * Math.exp(-130 * t);
            out[i] = Math.tanh(s * 1.5) * 0.7;
          }
        });
      }
    },

    /* 钢板撞击 */
    steel: {
      defInterval: 16,
      fn() {
        return buildBuffer(2.4, (out, sr, len) => {
          const partials = [
            [1.00, 1.00, 1.4], [1.66, 0.85, 1.9], [2.34, 0.60, 2.5],
            [3.41, 0.45, 3.1], [4.72, 0.32, 4.0], [6.11, 0.22, 5.0], [7.83, 0.15, 6.5]
          ];
          const f0 = 92;
          let lp = 0; const a = 1 - Math.exp(-2 * Math.PI * 3200 / sr);
          for (let i = 0; i < len; i++) {
            const t = i / sr;
            let s = 0;
            for (const [r, amp, dec] of partials) {
              s += amp * Math.exp(-dec * t) * Math.sin(2 * Math.PI * f0 * r * t + r * 2.3);
            }
            const nz = Math.random() * 2 - 1;
            lp += a * (nz - lp);
            s += lp * 0.85 * Math.exp(-22 * t);
            s += (Math.random() * 2 - 1) * 0.3 * Math.exp(-150 * t);
            out[i] = Math.tanh(s * 1.6) * 0.75;
          }
        });
      }
    },

    /* 低频轰鸣 */
    sub: {
      defInterval: 16,
      fn() {
        return buildBuffer(2.0, (out, sr, len) => {
          let ph = 0;
          for (let i = 0; i < len; i++) {
            const t = i / sr;
            const f = 30 + 70 * Math.exp(-5 * t);
            ph += 2 * Math.PI * f / sr;
            const env = Math.exp(-2.2 * t) * (1 - Math.exp(-t * 300));
            let s = Math.sin(ph) * env;
            s += (Math.random() * 2 - 1) * 0.06 * Math.exp(-8 * t);
            out[i] = Math.tanh(s * 1.3) * 0.9;
          }
        });
      }
    },

    /* 铁锤砸击 */
    hammer: {
      defInterval: 4,
      fn() {
        return buildBuffer(0.9, (out, sr, len) => {
          let ph = 0;
          for (let i = 0; i < len; i++) {
            const t = i / sr;
            const f = 70 * Math.exp(-14 * t) + 45;
            ph += 2 * Math.PI * f / sr;
            const env = Math.exp(-9 * t);
            let s = Math.sin(ph) * env * 0.9;
            s += (Math.random() * 2 - 1) * Math.exp(-55 * t) * 0.5;
            s += Math.sin(2 * Math.PI * 430 * t) * Math.exp(-30 * t) * 0.25;
            s += Math.sin(2 * Math.PI * 710 * t) * Math.exp(-42 * t) * 0.15;
            out[i] = Math.tanh(s * 1.4) * 0.85;
          }
        });
      }
    },

    /* 铁链哐当 */
    chain: {
      defInterval: 8,
      fn() {
        const clicks = [];
        let t = 0;
        while (t < 0.9) {
          clicks.push({
            t: t,
            f: 700 + Math.random() * 1900,
            a: 0.3 + Math.random() * 0.7,
            d: 40 + Math.random() * 70
          });
          t += 0.025 + Math.random() * 0.085;
        }
        return buildBuffer(1.2, (out, sr, len) => {
          for (let i = 0; i < len; i++) {
            const tt = i / sr;
            const nz = Math.random() * 2 - 1;
            let s = 0;
            for (const c of clicks) {
              const dt = tt - c.t;
              if (dt < 0 || dt > 0.25) continue;
              const e = Math.exp(-c.d * dt);
              s += c.a * e * Math.sin(2 * Math.PI * c.f * dt);
              s += c.a * 0.5 * Math.exp(-c.d * 1.6 * dt) * nz;
            }
            out[i] = Math.tanh(s * 0.9) * 0.7;
          }
        });
      }
    },

    /* 蒸汽喷发 */
    steam: {
      defInterval: 16,
      fn() {
        return buildBuffer(1.8, (out, sr, len) => {
          let low = 0, band = 0;
          const q = 0.28;
          for (let i = 0; i < len; i++) {
            const t = i / sr;
            const nz = Math.random() * 2 - 1;
            const fc = Math.min(2600 * Math.exp(-1.6 * t) + 500, sr * 0.45);
            const F = 2 * Math.sin(Math.PI * fc / sr);
            low += F * band;
            const high = nz - low - q * band;
            band += F * high;
            const env = Math.min(1, t * 40) * Math.exp(-1.8 * t);
            out[i] = Math.tanh(band * 1.6) * env * 1.1;
          }
        });
      }
    },

    /* 气动扳手 */
    wrench: {
      defInterval: 8,
      fn() {
        return buildBuffer(1.0, (out, sr, len) => {
          const hits = [];
          let t = 0.005;
          while (t < 0.94) {
            hits.push(t);
            const wob = 1 + 0.14 * Math.sin(2 * Math.PI * 3.3 * t);
            t += 1 / (25 * wob);
          }
          for (let i = 0; i < len; i++) {
            const tt = i / sr;
            const nz = Math.random() * 2 - 1;
            let s = 0;
            for (let h = 0; h < hits.length; h++) {
              const dt = tt - hits[h];
              if (dt < 0) break;
              if (dt > 0.09) continue;
              const e = Math.exp(-68 * dt);
              s += e * (Math.sin(2 * Math.PI * 2050 * dt) * 0.42
                      + Math.sin(2 * Math.PI * 3180 * dt) * 0.30
                      + Math.sin(2 * Math.PI * 1420 * dt) * 0.22);
              s += nz * e * 0.55;
            }
            out[i] = Math.tanh(s * 1.4) * 0.78;
          }
        });
      }
    },

    /* 铁门重闭 */
    gate: {
      defInterval: 16,
      fn() {
        return buildBuffer(2.4, (out, sr, len) => {
          const mods = [
            [214, 0.50, 1.05], [318, 0.38, 1.45], [467, 0.27, 1.95],
            [642, 0.19, 2.55], [889, 0.12, 3.30]
          ];
          let lp = 0;
          const a = 1 - Math.exp(-2 * Math.PI * 2200 / sr);
          let ph = 0;
          for (let i = 0; i < len; i++) {
            const t = i / sr;
            const f = 42 + 62 * Math.exp(-7 * t);
            ph += 2 * Math.PI * f / sr;
            let s = Math.sin(ph) * Math.exp(-3.2 * t) * 0.95;
            for (const [fr, amp, dec] of mods) {
              s += amp * Math.exp(-dec * t) * Math.sin(2 * Math.PI * fr * t + fr * 0.017);
            }
            const nz = Math.random() * 2 - 1;
            lp += a * (nz - lp);
            s += lp * 0.9 * Math.exp(-26 * t);
            s += (Math.random() * 2 - 1) * 0.55 * Math.exp(-180 * t);
            out[i] = Math.tanh(s * 1.5) * 0.8;
          }
        });
      }
    },

    /* 钢缆崩断 */
    snap: {
      defInterval: 12,
      fn() {
        return buildBuffer(1.9, (out, sr, len) => {
          const breaks = [];
          let t = 0.0;
          for (let k = 0; k < 7; k++) {
            breaks.push(t);
            t += 0.018 + Math.random() * 0.03;
          }
          let ph = 0, lp = 0;
          const a = 1 - Math.exp(-2 * Math.PI * 3600 / sr);
          for (let i = 0; i < len; i++) {
            const tt = i / sr;
            const nz = Math.random() * 2 - 1;

            let cr = 0;
            for (let h = 0; h < breaks.length; h++) {
              const dt = tt - breaks[h];
              if (dt < 0) break;
              if (dt > 0.06) continue;
              const e = Math.exp(-95 * dt);
              cr += e * (Math.sin(2 * Math.PI * (2400 + h * 430) * dt) * 0.45
                       + Math.sin(2 * Math.PI * (3900 + h * 260) * dt) * 0.25);
              cr += nz * e * 0.6;
            }

            const f = 58 + 90 * Math.exp(-1.6 * tt);
            ph += 2 * Math.PI * f / sr;
            const sw = 1 + 0.13 * Math.sin(2 * Math.PI * 5.5 * tt);
            const groan = Math.sin(ph) * sw * Math.exp(-1.5 * tt) * (1 - Math.exp(-tt * 45)) * 0.75;

            const te = Math.min(1, Math.max(0, (tt - 0.10) * 12));
            const tail = (Math.sin(2 * Math.PI * 156 * tt) * 0.30
                        + Math.sin(2 * Math.PI * 233 * tt) * 0.20
                        + Math.sin(2 * Math.PI * 349 * tt) * 0.12) * Math.exp(-2.4 * tt) * te;

            lp += a * (nz - lp);
            const nt = lp * 0.35 * Math.exp(-3.5 * tt);

            out[i] = Math.tanh((cr + groan + tail + nt) * 1.3) * 0.82;
          }
        });
      }
    },

    /* 传送带底噪（无缝循环） */
    conveyor: {
      defInterval: 8,
      fn() {
        const dur = 1.6;
        const sr = ctx.sampleRate;
        const rawLen = Math.floor(dur * sr);
        const raw = new Float32Array(rawLen);

        let lp1 = 0, lp2 = 0, lp3 = 0;
        const a1 = 1 - Math.exp(-2 * Math.PI * 180 / sr);
        const a2 = 1 - Math.exp(-2 * Math.PI * 1100 / sr);
        const a3 = 1 - Math.exp(-2 * Math.PI * 4200 / sr);

        let ph1 = 0, ph2 = 0, ph3 = 0;

        for (let i = 0; i < rawLen; i++) {
          const t = i / sr;
          const nz = Math.random() * 2 - 1;

          ph1 += 2 * Math.PI * 50 / sr;
          ph2 += 2 * Math.PI * 100 / sr;
          ph3 += 2 * Math.PI * 150 / sr;

          lp1 += a1 * (nz - lp1);
          lp2 += a2 * (nz - lp2);
          lp3 += a3 * (nz - lp3);

          const beltPos = (t * 10) % 1;
          const clickEnv = Math.exp(-beltPos * 25);
          const click = clickEnv * (
            Math.sin(2 * Math.PI * 380 * beltPos) * 0.14 +
            Math.sin(2 * Math.PI * 880 * beltPos) * 0.07
          );

          const am = 1 + 0.07 * Math.sin(2 * Math.PI * 1.25 * t);

          let s = 0;
          s += Math.sin(ph1) * 0.20;
          s += Math.sin(ph2) * 0.09;
          s += Math.sin(ph3) * 0.035;
          s += lp1 * 0.32;
          s += lp2 * 0.14;
          s += lp3 * 0.05;
          s += click * 0.50;

          s *= am;
          raw[i] = Math.tanh(s * 1.2) * 0.55;
        }

        /* 交叉淡化尾部 → 头部，实现无缝循环 */
        const xf = Math.floor(0.06 * sr);
        const outLen = rawLen - xf;
        const buf = ctx.createBuffer(1, outLen, sr);
        const out = buf.getChannelData(0);

        for (let i = 0; i < outLen; i++) out[i] = raw[i];
        for (let i = 0; i < xf; i++) {
          const w = i / xf;
          out[i] = raw[i] * w + raw[outLen + i] * (1 - w);
        }
        return buf;
      }
    },

    /* 火花迸溅 */
    spark: {
      defInterval: 2,
      fn() {
        return buildBuffer(0.4, (out, sr, len) => {
          let low = 0, band = 0;
          const q = 0.24;
          for (let i = 0; i < len; i++) {
            const t = i / sr;
            const nz = Math.random() * 2 - 1;
            const fc = Math.min(5000 * Math.exp(-20 * t) + 1200, sr * 0.45);
            const F = 2 * Math.sin(Math.PI * fc / sr);
            low += F * band;
            const high = nz - low - q * band;
            band += F * high;
            const env = Math.exp(-25 * t);
            const grain = Math.random() < 0.22 ? 1 : 0.28;
            out[i] = Math.tanh(band * 2.5 * env * grain * 1.5) * 0.8;
          }
        });
      }
    }
  };

  /* ---- 取（带缓存的）Buffer ---- */
  function getBuffer(key) {
    if (bufferCache.has(key)) return bufferCache.get(key);
    const buf = SFX[key].fn();
    bufferCache.set(key, buf);
    return buf;
  }

  /* ============================================================
     暴露接口
     ============================================================ */
  global.AudioEngine = {
    ensureAudio: ensureAudio,
    getCtx: function () { return ctx; },
    getMaster: function () { return masterGain; },
    getAnalyser: function () { return analyser; },
    getBuffer: getBuffer,
    makeSaturationCurve: makeSaturationCurve,
    SFX: SFX,
    activeSources: activeSources
  };

})(window);
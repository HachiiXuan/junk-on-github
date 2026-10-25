/* =====================================================================
   js/audio-engine.js — 音频处理引擎
   对外暴露：window.VoiceEngine
   ===================================================================== */
(function (global) {
  'use strict';

  const AudioCtxClass   = window.AudioContext || window.webkitAudioContext;
  const OfflineCtxClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;

  /* 全局共用 AudioContext（解码 + 播放） */
  const audioCtx = new AudioCtxClass();

  /* ==================================================================
     1) 音高变换：OLA 时间伸缩 + 重采样
     ================================================================== */

  function timeStretch(buffer, ratio) {
    const sr     = buffer.sampleRate;
    const nch    = buffer.numberOfChannels;
    const srcLen = buffer.length;

    const frame   = Math.max(512, Math.round(sr * 0.046));
    const overlap = 4;
    const Ha      = Math.round(frame / overlap);
    const Hs      = Math.max(1, Math.round(Ha * ratio));

    const outLen = Math.round(srcLen * ratio) + frame;
    const chans  = [];
    for (let c = 0; c < nch; c++) chans.push(new Float32Array(outLen));

    const win = new Float32Array(frame);
    for (let i = 0; i < frame; i++) {
      win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / frame));
    }
    const norm = 2 / overlap;

    const srcData = [];
    for (let c = 0; c < nch; c++) srcData.push(buffer.getChannelData(c));

    let inPos = 0, outPos = 0;
    while (inPos + frame < srcLen && outPos + frame < outLen) {
      for (let c = 0; c < nch; c++) {
        const s = srcData[c], d = chans[c];
        for (let i = 0; i < frame; i++) {
          d[outPos + i] += s[inPos + i] * win[i] * norm;
        }
      }
      inPos  += Ha;
      outPos += Hs;
    }

    const result = audioCtx.createBuffer(nch, outLen, sr);
    for (let c = 0; c < nch; c++) result.getChannelData(c).set(chans[c]);
    return result;
  }

  function resampleBuffer(buffer, ratio, targetLength) {
    const sr     = buffer.sampleRate;
    const nch    = buffer.numberOfChannels;
    const outLen = targetLength || Math.round(buffer.length / ratio);
    const out    = audioCtx.createBuffer(nch, outLen, sr);

    for (let c = 0; c < nch; c++) {
      const src = buffer.getChannelData(c);
      const dst = out.getChannelData(c);
      for (let i = 0; i < outLen; i++) {
        const pos  = i * ratio;
        const idx  = Math.floor(pos);
        const frac = pos - idx;
        const a = src[idx]     || 0;
        const b = src[idx + 1] || 0;
        dst[i] = a + (b - a) * frac;
      }
    }
    return out;
  }

  function pitchShiftBuffer(buffer, semitones) {
    const ratio = Math.pow(2, semitones / 12);
    if (Math.abs(ratio - 1) < 0.001) return buffer;
    const stretched = timeStretch(buffer, ratio);
    return resampleBuffer(stretched, ratio, buffer.length);
  }

  /* ==================================================================
     2) 效果链（离线渲染）
     ================================================================== */

  function makeDistortionCurve(amount) {
    const n = 2048;
    const curve = new Float32Array(n);
    const k = amount * 12;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
    }
    return curve;
  }

  function makeImpulse(ctx, duration, decay, channels) {
    const sr  = ctx.sampleRate;
    const len = Math.max(1, Math.floor(sr * duration));
    const imp = ctx.createBuffer(channels, len, sr);
    for (let c = 0; c < channels; c++) {
      const d = imp.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return imp;
  }

  /* ------------------------------------------------------------------
     尾音（效果余响）处理
     ------------------------------------------------------------------
     离线渲染默认只渲染原音频那么长，回声 / 混响 / 颤音这类“时间型”
     效果会在结尾被硬切。这里先按参数算出需要多渲染多久，渲染完再把
     尾部纯静音裁掉：效果能完整播完，导出文件也不会拖一段空白。
     ------------------------------------------------------------------ */

  const TAIL_REL    = 0.001;  /* 衰减到整体峰值的 -60 dB 视为听不见 */
  const TAIL_ABS    = 1e-5;   /* 绝对下限（约 -100 dBFS），防止极安静素材无限延长 */
  const TAIL_MARGIN = 0.5;    /* 估算时多衰减一档，避免卡在门限上 */
  const TAIL_PAD    = 0.05;   /* 额外余量（秒） */
  const TAIL_KEEP   = 0.02;   /* 裁静音时保留的自然收尾（秒） */
  const TAIL_FADE   = 0.005;  /* 结尾淡出，避免截断产生爆音 */
  const REVERB_TIME = 1.9;    /* 混响脉冲响应长度（秒） */

  /* 回声反馈量（与效果链中的计算保持一致） */
  function echoFeedback(p) {
    return Math.min(0.72, 0.45 * p.echo + 0.1);
  }

  /* 回声需要重复几次才衰减到听不见（只看相对衰减，与音量无关） */
  function echoRepeats(p) {
    const wet = Math.max(0.85 * p.echo, 1e-9);
    const fb  = echoFeedback(p);
    if (!(fb > 0) || fb >= 1) return 1;

    /* 第 1 次回声约为 wet·峰值/(1+wet)，目标是比峰值低 60 dB 再多留一档 */
    const target = TAIL_REL * (1 + wet) * TAIL_MARGIN;
    const n = 1 + Math.log(target / wet) / Math.log(fb);
    if (!isFinite(n) || n < 1) return 1;
    return Math.min(64, Math.ceil(n));
  }

  /* 需要额外渲染的尾音长度（秒） */
  function effectTailSeconds(p) {
    let tail = 0;
    if (p.echo > 0.005)    tail += (p.echoTime || 0.25) * echoRepeats(p) + TAIL_PAD;
    if (p.reverb > 0.005)  tail += REVERB_TIME + TAIL_PAD;
    if (p.vibrato > 0.005) tail += 0.02;
    return tail;
  }

  /* 裁掉尾音里听不见的部分，并给结尾加极短淡出。
     minLen = 原音频长度：原始音频自己的结尾（包括结尾静音）保持不动，
     只裁“多渲染出来”的那一段。 */
  function trimTail(buffer, minLen) {
    const sr    = buffer.sampleRate;
    const nch   = buffer.numberOfChannels;
    const chans = [];
    for (let c = 0; c < nch; c++) chans.push(buffer.getChannelData(c));

    /* 门限跟随整体峰值：比峰值低 60 dB 就当听不见 */
    let peak = 0;
    for (let c = 0; c < nch; c++) {
      const d = chans[c];
      for (let i = 0; i < d.length; i++) {
        const a = d[i] < 0 ? -d[i] : d[i];
        if (a > peak) peak = a;
      }
    }
    if (peak <= 0) return buffer;
    const floor = Math.max(TAIL_ABS, peak * TAIL_REL);

    /* 从末尾往前找最后一个还能听见的采样点 */
    let last = -1;
    for (let i = buffer.length - 1; i >= 0; i--) {
      let p = 0;
      for (let c = 0; c < nch; c++) {
        const a = Math.abs(chans[c][i]);
        if (a > p) p = a;
      }
      if (p > floor) { last = i; break; }
    }
    if (last < 0) return buffer;   /* 整段静音，保持原样 */

    const keep = Math.round(sr * TAIL_KEEP);
    const len  = Math.min(buffer.length, Math.max(minLen, last + 1 + keep));
    if (len >= buffer.length) return buffer;   /* 没有可裁的尾巴 */

    const out = audioCtx.createBuffer(nch, len, sr);

    /* 只有裁在“新长出来的尾巴”上才需要淡出，别动原音频的结尾 */
    const fade   = len > minLen
      ? Math.min(len, Math.max(1, Math.round(sr * TAIL_FADE)))
      : 0;
    const fadeAt = len - fade;

    for (let c = 0; c < nch; c++) {
      const dst = out.getChannelData(c);
      dst.set(chans[c].subarray(0, len));
      for (let i = 0; i < fade; i++) dst[fadeAt + i] *= i / fade;
    }
    return out;
  }

  async function renderAudio(buffer, p) {
    const sr  = buffer.sampleRate;
    const nch = buffer.numberOfChannels;
    const len = buffer.length;

    /* 多渲染一段尾音，避免回声 / 混响被截断 */
    const tailLen = Math.round(effectTailSeconds(p) * sr);
    const ctx = new OfflineCtxClass(nch, len + tailLen, sr);

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    let node = src;

    /* ---- 环形调制 ---- */
    if (p.ring > 0.005) {
      const rm = ctx.createGain();
      rm.gain.value = 0;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = p.ringFreq;

      const depth = ctx.createGain();
      depth.gain.value = p.ring;

      osc.connect(depth);
      depth.connect(rm.gain);
      osc.start(0);

      const dry = ctx.createGain();
      dry.gain.value = Math.max(0, 1 - p.ring * 0.5);

      const mix = ctx.createGain();
      mix.gain.value = 1;

      node.connect(dry);
      node.connect(rm);
      rm.connect(mix);
      dry.connect(mix);
      node = mix;
    }

    /* ---- 失真 ---- */
    if (p.distortion > 0.005) {
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(p.distortion);
      shaper.oversample = '4x';
      node.connect(shaper);
      node = shaper;
    }

    /* ---- 高通 ---- */
    if (p.highpass > 25) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = Math.min(p.highpass, sr / 2 - 100);
      hp.Q.value = 0.7;
      node.connect(hp);
      node = hp;
    }

    /* ---- 低通 ---- */
    if (p.lowpass < sr / 2 - 500) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = p.lowpass;
      lp.Q.value = 0.7;
      node.connect(lp);
      node = lp;
    }

    /* ---- 低频搁架 ---- */
    if (Math.abs(p.thickness) > 0.1) {
      const ls = ctx.createBiquadFilter();
      ls.type = 'lowshelf';
      ls.frequency.value = 250;
      ls.gain.value = p.thickness;
      node.connect(ls);
      node = ls;
    }

    /* ---- 高频搁架 ---- */
    if (Math.abs(p.brightness) > 0.1) {
      const hs = ctx.createBiquadFilter();
      hs.type = 'highshelf';
      hs.frequency.value = 3000;
      hs.gain.value = p.brightness;
      node.connect(hs);
      node = hs;
    }

    /* ---- 颤音（延迟调制） ---- */
    if (p.vibrato > 0.005) {
      const vd = ctx.createDelay(0.1);
      vd.delayTime.value = 0.006;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = p.vibratoRate;

      const lg = ctx.createGain();
      lg.gain.value = 0.0045 * p.vibrato;

      lfo.connect(lg);
      lg.connect(vd.delayTime);
      lfo.start(0);

      node.connect(vd);
      node = vd;
    }

    /* ---- 回声 ---- */
    if (p.echo > 0.005) {
      const delay = ctx.createDelay(2.0);
      delay.delayTime.value = p.echoTime;

      const fb = ctx.createGain();
      fb.gain.value = echoFeedback(p);

      const wet = ctx.createGain();
      wet.gain.value = 0.85 * p.echo;

      const dry = ctx.createGain();
      dry.gain.value = 1;

      const mix = ctx.createGain();

      node.connect(dry);
      node.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      dry.connect(mix);
      wet.connect(mix);
      node = mix;
    }

    /* ---- 混响 ---- */
    if (p.reverb > 0.005) {
      const conv = ctx.createConvolver();
      conv.buffer = makeImpulse(ctx, REVERB_TIME, 2.6, Math.max(1, Math.min(2, nch)));

      const wet = ctx.createGain();
      wet.gain.value = 0.75 * p.reverb;

      const dry = ctx.createGain();
      dry.gain.value = 1 - p.reverb * 0.4;

      const mix = ctx.createGain();

      node.connect(dry);
      node.connect(conv);
      conv.connect(wet);
      dry.connect(mix);
      wet.connect(mix);
      node = mix;
    }

    /* ---- 总音量 ---- */
    const g = ctx.createGain();
    g.gain.value = p.gain;
    node.connect(g);
    g.connect(ctx.destination);

    src.start(0);
    const rendered = await ctx.startRendering();

    /* 有尾音时裁掉多余的静音，效果已经完整播完 */
    return tailLen > 0 ? trimTail(rendered, len) : rendered;
  }

  /* ==================================================================
     3) 削波保护
     ================================================================== */
  function limitPeak(buffer, target = 0.98) {
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
      }
    }
    if (peak <= target || peak === 0) return buffer;
    const k = target / peak;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
    return buffer;
  }

  /* ==================================================================
     4) WAV 编码
     ================================================================== */
  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  function encodeWAV(buffer) {
    const numCh = buffer.numberOfChannels;
    const sr    = buffer.sampleRate;
    const len   = buffer.length;
    const bps   = 2;
    const blockAlign = numCh * bps;
    const dataSize   = len * blockAlign;

    const ab   = new ArrayBuffer(44 + dataSize);
    const view = new DataView(ab);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    const chans = [];
    for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));

    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < numCh; c++) {
        let s = chans[c][i];
        s = s < -1 ? -1 : (s > 1 ? 1 : s);
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  /* ==================================================================
     5) MP3 编码（依赖 lamejs）
     ================================================================== */
  function encodeMP3(buffer, kbps) {
    if (!global.lamejs) {
      throw new Error('lamejs not loaded');
    }
    kbps = kbps || 192;

    const numCh = buffer.numberOfChannels;
    const sr    = buffer.sampleRate;
    const len   = buffer.length;

    const mp3encoder = new global.lamejs.Mp3Encoder(numCh, sr, kbps);
    const sampleBlockSize = 1152;
    const mp3Data = [];

    const leftF  = buffer.getChannelData(0);
    const rightF = numCh > 1 ? buffer.getChannelData(1) : null;

    const left  = new Int16Array(len);
    const right = rightF ? new Int16Array(len) : null;

    for (let i = 0; i < len; i++) {
      let s = leftF[i];
      s = s < -1 ? -1 : (s > 1 ? 1 : s);
      left[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;

      if (rightF) {
        let s2 = rightF[i];
        s2 = s2 < -1 ? -1 : (s2 > 1 ? 1 : s2);
        right[i] = s2 < 0 ? s2 * 0x8000 : s2 * 0x7FFF;
      }
    }

    for (let i = 0; i < len; i += sampleBlockSize) {
      const lc = left.subarray(i, i + sampleBlockSize);
      const rc = right ? right.subarray(i, i + sampleBlockSize) : null;
      const buf = rc
        ? mp3encoder.encodeBuffer(lc, rc)
        : mp3encoder.encodeBuffer(lc);
      if (buf.length > 0) mp3Data.push(buf);
    }

    const end = mp3encoder.flush();
    if (end.length > 0) mp3Data.push(end);

    return new Blob(mp3Data, { type: 'audio/mp3' });
  }

  /* ==================================================================
     对外暴露
     ================================================================== */
  global.VoiceEngine = {
    audioCtx,
    pitchShiftBuffer,
    renderAudio,
    limitPeak,
    encodeWAV,
    encodeMP3,
  };

})(window);
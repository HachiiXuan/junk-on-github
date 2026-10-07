/* =====================================================================
   js/waveform.js — 波形绘制（兼进度条 + 实时预览变换）
   对外暴露：window.Waveform
   ===================================================================== */
(function (global) {
  'use strict';

  const PLAYED_COLOR = '#3ee0c8';
  const REMAIN_COLOR = '#4a5578';

  /* 波形数据缓存：同一个 buffer 只需计算一次（按画布宽度） */
  const waveCache = new WeakMap();

  function computeWaveformData(buffer, W) {
    let cached = waveCache.get(buffer);
    if (cached && cached.W === W) return cached;

    const data = buffer.getChannelData(0);
    const step = data.length / W;
    const minArr = new Float32Array(W);
    const maxArr = new Float32Array(W);

    for (let x = 0; x < W; x++) {
      let s = Math.floor(x * step);
      let e = Math.floor((x + 1) * step);
      if (e <= s) e = s + 1;
      if (e > data.length) e = data.length;

      let mn = 1, mx = -1;
      for (let i = s; i < e; i++) {
        const v = data[i];
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      if (mn > mx) { mn = 0; mx = 0; }
      minArr[x] = mn;
      maxArr[x] = mx;
    }

    const result = { W, min: minArr, max: maxArr };
    waveCache.set(buffer, result);
    return result;
  }

  /* ------------------------------------------------------------------
     视觉变换：仅用于实时预览，不改变音频
     根据当前参数对波形做视觉上的"模拟"，给用户即时反馈
     ------------------------------------------------------------------ */
  function applyVisualTransform(wf, visual, W) {
    if (!visual) return wf;

    const gain      = (visual.gain      !== undefined) ? visual.gain      : 1;
    const distort   = visual.distort   || 0;
    const pitch     = visual.pitch     || 0;
    const thickness = visual.thickness || 0;

    /* 参数没有实际变化时直接跳过，避免无谓的数组分配 */
    const hasChange =
      Math.abs(gain - 1) > 0.01 ||
      distort > 0.005 ||
      Math.abs(pitch) > 0.5 ||
      Math.abs(thickness) > 0.5;

    if (!hasChange) return wf;

    const minArr = new Float32Array(W);
    const maxArr = new Float32Array(W);

    /* 音高：升高时波形视觉上"收缩"，降低时"膨胀" */
    const pitchScale = 1 + pitch * 0.012;
    /* 低频厚度：越大波形包络越饱满 */
    const thickScale = 1 + Math.abs(thickness) * 0.010;

    for (let x = 0; x < W; x++) {
      let mn = wf.min[x] * gain * pitchScale * thickScale;
      let mx = wf.max[x] * gain * pitchScale * thickScale;

      /* 失真：用 tanh 曲线压缩峰值，视觉上"削平" */
      if (distort > 0) {
        const k  = 1 + distort * 6;
        const tk = Math.tanh(k);
        mn = Math.tanh(mn * k) / tk;
        mx = Math.tanh(mx * k) / tk;
      }

      minArr[x] = Math.max(-1, Math.min(1, mn));
      maxArr[x] = Math.max(-1, Math.min(1, mx));
    }

    return { W, min: minArr, max: maxArr };
  }

  /**
   * 绘制波形
   * @param {HTMLCanvasElement} canvas
   * @param {AudioBuffer|null}  buffer       要显示的音频
   * @param {number}            progress     0~1 播放进度
   * @param {string}            emptyText    无音频时的提示文字
   * @param {Object}            visual       可选，视觉变换参数（用于实时预览）
   *                                          { gain, distort, pitch, thickness }
   */
  function draw(canvas, buffer, progress, emptyText, visual) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth  || 600;
    const H = canvas.clientHeight || 170;

    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    /* 背景 */
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0a0e1c');
    bg.addColorStop(1, '#070a14');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    /* 网格 */
    g.strokeStyle = 'rgba(255,255,255,0.035)';
    g.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (H / 4) * i;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    for (let i = 1; i < 8; i++) {
      const x = (W / 8) * i;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
    }

    /* 中线 */
    g.strokeStyle = 'rgba(124,92,255,0.22)';
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();

    /* 空状态 */
    if (!buffer) {
      g.fillStyle = '#3a4463';
      g.font = '13px -apple-system, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(emptyText || 'No audio loaded', W / 2, H / 2);
      return;
    }

    /* 波形数据（带缓存）+ 视觉变换（仅预览时） */
    const raw = computeWaveformData(buffer, W);
    const wf  = applyVisualTransform(raw, visual, W);
    const amp = (H / 2) * 0.88;

    const strokeAll = (color, glow) => {
      g.save();
      g.strokeStyle = color;
      g.lineWidth = 1;
      if (glow) { g.shadowColor = color; g.shadowBlur = 6; }
      g.beginPath();
      for (let x = 0; x < W; x++) {
        const y1 = H / 2 - wf.max[x] * amp;
        const y2 = H / 2 - wf.min[x] * amp;
        g.moveTo(x + 0.5, y1);
        g.lineTo(x + 0.5, y2);
      }
      g.stroke();
      g.restore();
    };

    /* 1) 未播放部分：灰色 */
    strokeAll(REMAIN_COLOR, false);

    /* 2) 已播放部分：绿色（裁剪） */
    const pw = Math.max(0, Math.min(W, (progress || 0) * W));
    if (pw > 0) {
      g.save();
      g.beginPath();
      g.rect(0, 0, pw, H);
      g.clip();
      strokeAll(PLAYED_COLOR, true);
      g.restore();
    }

    /* 3) 播放头 */
    if (pw > 0 && pw < W) {
      g.save();
      g.strokeStyle = PLAYED_COLOR;
      g.lineWidth = 1.5;
      g.shadowColor = 'rgba(62,224,200,0.85)';
      g.shadowBlur = 8;
      g.beginPath();
      g.moveTo(pw, 0);
      g.lineTo(pw, H);
      g.stroke();

      g.fillStyle = PLAYED_COLOR;
      g.beginPath();
      g.arc(pw, H / 2, 4, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }

  global.Waveform = { draw };

})(window);
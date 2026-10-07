/* ============================================================
   viz.js  ——  实时频谱可视化（工业风格柱状）
   ============================================================ */
(function (global) {
  'use strict';

  let canvas = null;
  let g = null;
  let rafId = null;
  let running = false;

  let freqData = null;
  let smoothed = null;
  let peakHold = null;

  const MIN_F = 30;
  const MAX_F = 16000;

  /* ---------- 初始化 ---------- */
  function init() {
    canvas = document.getElementById('viz');
    if (!canvas) return;
    g = canvas.getContext('2d');

    resize();
    window.addEventListener('resize', resize);
    start();
  }

  function resize() {
    if (!canvas || !g) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width  = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- 循环 ---------- */
  function start() {
    if (running) return;
    running = true;
    loop();
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function loop() {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    draw();
  }

  /* ---------- 绘制 ---------- */
  function draw() {
    if (!canvas || !g) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    /* 背景 */
    g.fillStyle = '#060708';
    g.fillRect(0, 0, w, h);

    const analyser = AudioEngine.getAnalyser();

    if (!analyser) {
      drawIdle(w, h);
      return;
    }

    const bins = analyser.frequencyBinCount;

    if (!freqData || freqData.length !== bins) {
      freqData = new Uint8Array(bins);
      smoothed = new Float32Array(bins);
      peakHold = new Float32Array(bins);
    }
    analyser.getByteFrequencyData(freqData);

    /* 平滑 + 峰值保持 */
    for (let i = 0; i < bins; i++) {
      const v = freqData[i] / 255;
      smoothed[i] = smoothed[i] * 0.72 + v * 0.28;
      if (smoothed[i] > peakHold[i]) {
        peakHold[i] = smoothed[i];
      } else {
        peakHold[i] *= 0.965;
      }
    }

    const ctx = AudioEngine.getCtx();
    const nyquist = ctx.sampleRate / 2;
    const maxF = Math.min(MAX_F, nyquist);

    const barCount = Math.max(28, Math.min(96, Math.floor(w / 9)));
    const step = w / barCount;

    /* 柱状频谱（对数频率分布） */
    for (let i = 0; i < barCount; i++) {
      const f0 = MIN_F * Math.pow(maxF / MIN_F, i / barCount);
      const f1 = MIN_F * Math.pow(maxF / MIN_F, (i + 1) / barCount);

      const b0 = Math.max(0, Math.floor(f0 / nyquist * bins));
      const b1 = Math.max(b0 + 1, Math.floor(f1 / nyquist * bins));

      let sum = 0, n = 0;
      for (let b = b0; b < b1 && b < bins; b++) { sum += smoothed[b]; n++; }
      const v = n ? (sum / n) : 0;

      let sumP = 0, nP = 0;
      for (let b = b0; b < b1 && b < bins; b++) { sumP += peakHold[b]; nP++; }
      const vp = nP ? (sumP / nP) : 0;

      const bh = Math.max(2, Math.pow(v, 0.85) * (h - 6));
      const x = i * step;
      const bw = Math.max(1, step * 0.72);

      /* 主柱体 */
      const grad = g.createLinearGradient(0, h - bh, 0, h);
      grad.addColorStop(0.00, '#ffd9b0');
      grad.addColorStop(0.25, '#ffb066');
      grad.addColorStop(0.62, '#ff6a1a');
      grad.addColorStop(1.00, '#5a2008');

      g.fillStyle = grad;
      g.fillRect(x + (step - bw) / 2, h - bh, bw, bh);

      /* 峰值线 */
      const yP = h - Math.max(2, Math.pow(vp, 0.85) * (h - 6));
      g.fillStyle = 'rgba(255,177,102,0.85)';
      g.fillRect(x + (step - bw) / 2, yP - 1.5, bw, 1.5);
    }

    /* 底部基线 + 顶部扫描线 */
    g.fillStyle = 'rgba(255,106,26,0.20)';
    g.fillRect(0, h - 1.5, w, 1.5);

    g.strokeStyle = 'rgba(255,106,26,0.06)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < 4; i++) {
      const y = Math.round(h * i / 4) + 0.5;
      g.moveTo(0, y);
      g.lineTo(w, y);
    }
    g.stroke();
  }

  function drawIdle(w, h) {
    g.strokeStyle = 'rgba(255,106,26,0.14)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, h - 2);
    g.lineTo(w, h - 2);
    g.stroke();

    /* 一条静止的"心跳线" */
    g.strokeStyle = 'rgba(255,106,26,0.22)';
    g.beginPath();
    const mid = h * 0.55;
    g.moveTo(0, mid);
    for (let x = 0; x <= w; x += 3) {
      const y = mid + Math.sin(x * 0.035) * Math.min(10, h * 0.12);
      g.lineTo(x, y);
    }
    g.stroke();

    /* 提示文字 */
    g.fillStyle = 'rgba(255,106,26,0.18)';
    g.font = '10px ui-monospace, Consolas, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('S P E C T R U M   O F F L I N E', w / 2, h * 0.82);
  }

  global.Viz = {
    init: init,
    start: start,
    stop: stop,
    resize: resize
  };

})(window);
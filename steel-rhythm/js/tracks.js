/* ============================================================
   tracks.js  ——  音轨管理 + 调度器 + 播放控制
   ============================================================ */
(function (global) {
  'use strict';

  const trackListEl = document.getElementById('tracks');
  const emptyHint   = document.getElementById('emptyHint');

  const state = {
    bpm: 100,
    playing: false,
    tracks: [],
    nextNoteTime: 0,
    timer: null,
    lookahead: 0.12
  };

  let uid = 0;

  /* ---------- 空状态提示 ---------- */
  function updateEmptyHint() {
    emptyHint.style.display = state.tracks.length ? 'none' : 'block';
  }

  /* ---------- 波形峰值 ---------- */
  function computePeaks(buffer, n) {
    const d = buffer.getChannelData(0);
    const peaks = new Float32Array(n);
    const block = d.length / n;
    for (let i = 0; i < n; i++) {
      const s = Math.floor(i * block);
      const e = Math.min(d.length, Math.floor((i + 1) * block));
      let max = 0;
      for (let j = s; j < e; j++) {
        const v = Math.abs(d[j]);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    return peaks;
  }

  function drawWave(canvas, track) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(60, canvas.clientWidth);
    const h = Math.max(30, canvas.clientHeight);
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const peaks = track.peaks;
    const n = peaks.length;
    const step = w / n;
    const mid = h / 2;

    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0,   '#ffb066');
    grad.addColorStop(0.5, '#ff6a1a');
    grad.addColorStop(1,   '#8a3510');

    for (let i = 0; i < n; i++) {
      const p = Math.min(1, peaks[i]);
      const bh = Math.max(1.5, p * (h * 0.92));
      const bw = Math.max(1, step * 0.74);
      g.fillStyle = grad;
      g.fillRect(i * step, mid - bh / 2, bw, bh);
    }
    g.fillStyle = 'rgba(255,106,26,0.16)';
    g.fillRect(0, mid - 0.5, w, 1);
  }

  /* ---------- 声像显示 ---------- */
  function fmtPan(v) {
    if (Math.abs(v) < 0.02) return 'C';
    return (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 100);
  }

  /* ---------- 添加音轨 ---------- */
  function addTrack(key, opts) {
    opts = opts || {};
    AudioEngine.ensureAudio();
    const ctx = AudioEngine.getCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const def = AudioEngine.SFX[key];
    const buffer = AudioEngine.getBuffer(key);

    const track = {
      id: ++uid,
      key: key,
      buffer: buffer,
      peaks: computePeaks(buffer, 220),
      interval: opts.interval != null ? opts.interval : def.defInterval,
      volume:   opts.volume   != null ? opts.volume   : 0.75,
      rate:     opts.rate     != null ? opts.rate     : 1,
      pan:      opts.pan      != null ? opts.pan      : 0,
      muted: false,
      counter: 0,
      canvas: null,
      el: null
    };

    state.tracks.push(track);
    buildTrackDOM(track);
    updateEmptyHint();
    document.dispatchEvent(new CustomEvent('trackschange'));
  }

  /* ---------- 构建音轨 DOM ---------- */
  function buildTrackDOM(track) {
    const card = document.createElement('div');
    card.className = 'track';
    card.innerHTML =
      '<div class="t-head">' +
        '<span class="t-led"></span>' +
        '<span class="t-name"></span>' +
        '<span class="t-spacer"></span>' +
        '<button class="t-btn mute"></button>' +
        '<button class="t-btn del">✕</button>' +
      '</div>' +
      '<canvas class="wave"></canvas>' +
      '<div class="t-params">' +
        '<label class="param"><span></span>' +
          '<input type="range" class="p-interval" min="1" max="32" step="1" value="' + track.interval + '">' +
          '<b class="v-interval"></b></label>' +
        '<label class="param"><span></span>' +
          '<input type="range" class="p-volume" min="0" max="1.2" step="0.01" value="' + track.volume + '">' +
          '<b class="v-volume"></b></label>' +
        '<label class="param"><span></span>' +
          '<input type="range" class="p-rate" min="0.4" max="2" step="0.01" value="' + track.rate + '">' +
          '<b class="v-rate">' + track.rate.toFixed(2) + '</b></label>' +
        '<label class="param"><span></span>' +
          '<input type="range" class="p-pan" min="-1" max="1" step="0.01" value="' + track.pan + '">' +
          '<b class="v-pan">' + fmtPan(track.pan) + '</b></label>' +
      '</div>';

    track.el = card;
    track.canvas = card.querySelector('.wave');

    const q = function (s) { return card.querySelector(s); };

    /* 静态文本 */
    q('.t-name').textContent = I18n.t('sfx.' + track.key);
    q('.t-btn.mute').textContent = 'M';
    q('.t-btn.mute').title = I18n.t('track.mute');
    q('.t-btn.del').title  = I18n.t('track.delete');

    const labels = card.querySelectorAll('.param span');
    labels[0].textContent = I18n.t('track.interval');
    labels[1].textContent = I18n.t('track.volume');
    labels[2].textContent = I18n.t('track.pitch');
    labels[3].textContent = I18n.t('track.pan');

    q('.v-interval').textContent = I18n.t('track.stepUnit', { n: track.interval });
    q('.v-volume').textContent   = Math.round(track.volume * 100) + '%';

    /* 参数绑定 */
    q('.p-interval').addEventListener('input', function (e) {
      track.interval = +e.target.value;
      q('.v-interval').textContent = I18n.t('track.stepUnit', { n: track.interval });
      document.dispatchEvent(new CustomEvent('trackschange'));
    });
    q('.p-volume').addEventListener('input', function (e) {
      track.volume = +e.target.value;
      q('.v-volume').textContent = Math.round(track.volume * 100) + '%';
    });
    q('.p-rate').addEventListener('input', function (e) {
      track.rate = +e.target.value;
      q('.v-rate').textContent = track.rate.toFixed(2);
      document.dispatchEvent(new CustomEvent('trackschange'));
    });
    q('.p-pan').addEventListener('input', function (e) {
      track.pan = +e.target.value;
      q('.v-pan').textContent = fmtPan(track.pan);
    });

    q('.t-btn.mute').addEventListener('click', function (e) {
      track.muted = !track.muted;
      e.target.classList.toggle('on', track.muted);
      document.dispatchEvent(new CustomEvent('trackschange'));
    });
    q('.t-btn.del').addEventListener('click', function () {
      state.tracks = state.tracks.filter(function (t) { return t !== track; });
      card.remove();
      updateEmptyHint();
      document.dispatchEvent(new CustomEvent('trackschange'));
    });

    trackListEl.appendChild(card);
    requestAnimationFrame(function () { drawWave(track.canvas, track); });
  }

  /* ---------- 语言切换后刷新动态文本 ---------- */
  function refreshNames() {
    state.tracks.forEach(function (t) {
      if (!t.el) return;
      t.el.querySelector('.t-name').textContent = I18n.t('sfx.' + t.key);
      t.el.querySelector('.v-interval').textContent =
        I18n.t('track.stepUnit', { n: t.interval });
      t.el.querySelector('.t-btn.mute').title = I18n.t('track.mute');
      t.el.querySelector('.t-btn.del').title  = I18n.t('track.delete');

      const labels = t.el.querySelectorAll('.param span');
      labels[0].textContent = I18n.t('track.interval');
      labels[1].textContent = I18n.t('track.volume');
      labels[2].textContent = I18n.t('track.pitch');
      labels[3].textContent = I18n.t('track.pan');
    });
  }

  /* ============================================================
     调度器 / 播放
     ============================================================ */
  function trigger(track, time) {
    const ctx = AudioEngine.getCtx();
    const masterGain = AudioEngine.getMaster();

    const src = ctx.createBufferSource();
    src.buffer = track.buffer;
    src.playbackRate.value = track.rate;

    const g = ctx.createGain();
    g.gain.value = track.volume;
    src.connect(g);

    let tail = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = track.pan;
      g.connect(p);
      tail = p;
    }
    tail.connect(masterGain);

    src.onended = function () { AudioEngine.activeSources.delete(src); };
    AudioEngine.activeSources.add(src);

    src.start(time);
    src.stop(time + track.buffer.duration / track.rate + 0.05);

    scheduleFlash(track, time);
  }

  function scheduleFlash(track, time) {
    const ctx = AudioEngine.getCtx();
    const delay = Math.max(0, (time - ctx.currentTime) * 1000);
    setTimeout(function () {
      const el = track.el;
      if (!el) return;
      el.classList.add('hit');
      clearTimeout(el._hitT);
      el._hitT = setTimeout(function () { el.classList.remove('hit'); }, 90);
    }, delay);
  }

  function scheduler() {
    if (!state.playing) return;
    const ctx = AudioEngine.getCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const stepDur = 60 / state.bpm / 4;
    let guard = 0;

    while (state.nextNoteTime < now + state.lookahead && guard++ < 200) {
      const time = state.nextNoteTime;
      for (const tr of state.tracks) {
        const fire = !tr.muted && (tr.counter % tr.interval === 0);
        if (fire) trigger(tr, time);
        tr.counter++;
      }
      state.nextNoteTime += stepDur;
    }
  }

  const playBtn = document.getElementById('playBtn');

  function play() {
    AudioEngine.ensureAudio();
    const ctx = AudioEngine.getCtx();
    if (ctx.state === 'suspended') ctx.resume();

    state.playing = true;
    state.tracks.forEach(function (t) { t.counter = 0; });
    state.nextNoteTime = ctx.currentTime + 0.06;

    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(scheduler, 25);

    document.body.classList.add('playing');
    playBtn.textContent = I18n.t('btn.stop');
  }

  function stop() {
    state.playing = false;
    if (state.timer) { clearInterval(state.timer); state.timer = null; }

    AudioEngine.activeSources.forEach(function (s) { try { s.stop(); } catch (e) {} });
    AudioEngine.activeSources.clear();

    state.tracks.forEach(function (t) {
      t.counter = 0;
      if (t.el) t.el.classList.remove('hit');
    });

    document.body.classList.remove('playing');
    playBtn.textContent = I18n.t('btn.play');
  }

  function toggle() { state.playing ? stop() : play(); }

  /* ---------- 语言切换时更新按钮文字 ---------- */
  function refreshPlayBtn() {
    playBtn.textContent = state.playing ? I18n.t('btn.stop') : I18n.t('btn.play');
  }

  /* ============================================================
     间隔时长计算（导出用）
     ============================================================ */
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function lcm(a, b) { return a / gcd(a, b) * b; }

  function computeIntervalDuration() {
    const active = state.tracks.filter(function (t) { return !t.muted; });
    if (active.length === 0) return 0;

    let L = 1;
    for (const tr of active) {
      L = lcm(L, tr.interval);
      if (L > 2000) return 180;
    }

    const stepDur  = 60 / state.bpm / 4;
    const cycleDur = L * stepDur;

    let maxTail = 0;
    for (const tr of active) {
      const d = tr.buffer.duration / tr.rate;
      if (d > maxTail) maxTail = d;
    }

    return Math.min(180, cycleDur + maxTail);
  }

  /* ============================================================
     示例节拍
     ============================================================ */
  function loadPreset() {
    stop();
    state.tracks.forEach(function (t) { if (t.el) t.el.remove(); });
    state.tracks = [];
    updateEmptyHint();

    addTrack('hammer',  { interval: 4,  volume: 0.85, pan: -0.15 });
    addTrack('anvil',   { interval: 8,  volume: 0.70, pan:  0.25 });
    addTrack('chain',   { interval: 8,  volume: 0.55, pan: -0.45 });
    addTrack('steel',   { interval: 16, volume: 0.80, pan:  0.10 });
    addTrack('sub',     { interval: 16, volume: 0.90, pan:  0.00 });
    addTrack('steam',   { interval: 16, volume: 0.45, pan:  0.55 });
    addTrack('spark',   { interval: 2,  volume: 0.30, pan: -0.60 });

    document.dispatchEvent(new CustomEvent('trackschange'));
  }

  function clearAll() {
    stop();
    state.tracks.forEach(function (t) { if (t.el) t.el.remove(); });
    state.tracks = [];
    updateEmptyHint();
    document.dispatchEvent(new CustomEvent('trackschange'));
  }

  /* ---------- 尺寸变化重绘波形 ---------- */
  function redrawAll() {
    state.tracks.forEach(function (tr) {
      if (tr.canvas && tr.canvas.clientWidth) drawWave(tr.canvas, tr);
    });
  }

  /* ============================================================
     暴露接口
     ============================================================ */
  global.Tracks = {
    state: state,
    addTrack: addTrack,
    loadPreset: loadPreset,
    clearAll: clearAll,
    play: play,
    stop: stop,
    toggle: toggle,
    refreshNames: refreshNames,
    refreshPlayBtn: refreshPlayBtn,
    redrawAll: redrawAll,
    computeIntervalDuration: computeIntervalDuration,
    updateEmptyHint: updateEmptyHint
  };

})(window);
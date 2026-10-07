/* ============================================================
   export.js  ——  离线渲染 + WAV 导出
   ============================================================ */
(function (global) {
  'use strict';

  let exportBtn, exportPanel, expGo, expDur, expHint;
  let busy = false;

  /* ---------- 初始化 ---------- */
  function init() {
    exportBtn   = document.getElementById('exportBtn');
    exportPanel = document.getElementById('exportPanel');
    expGo       = document.getElementById('expGo');
    expDur      = document.getElementById('expDur');
    expHint     = document.getElementById('expIntervalHint');

    exportBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      exportPanel.classList.toggle('show');
      refreshHint();
    });

    document.addEventListener('click', function (e) {
      if (!exportPanel.contains(e.target) && e.target !== exportBtn) {
        exportPanel.classList.remove('show');
      }
    });

    document.querySelectorAll('input[name="expMode"]').forEach(function (r) {
      r.addEventListener('change', refreshHint);
    });

    expGo.addEventListener('click', onExportClick);

    refreshHint();
  }

  /* ---------- 提示刷新 ---------- */
  function refreshHint() {
    if (!expHint) return;

    const mode = getMode();
    if (mode !== 'interval') {
      const d = Tracks.computeIntervalDuration();
      expHint.textContent = d > 0
        ? I18n.t('export.hint.range', { n: d.toFixed(1) })
        : I18n.t('export.hint.none');
      return;
    }
    const d = Tracks.computeIntervalDuration();
    expHint.textContent = d > 0
      ? I18n.t('export.hint.range', { n: d.toFixed(1) })
      : I18n.t('export.hint.none');
  }

  function getMode() {
    const el = document.querySelector('input[name="expMode"]:checked');
    return el ? el.value : 'duration';
  }

  /* ---------- 点击导出 ---------- */
  async function onExportClick() {
    if (busy) return;

    if (Tracks.state.tracks.length === 0) {
      flashButton(I18n.t('export.noTracks'));
      return;
    }

    const mode = getMode();
    let duration;

    if (mode === 'duration') {
      duration = Math.max(1, Math.min(300, +expDur.value || 12));
    } else {
      duration = Tracks.computeIntervalDuration();
      if (duration <= 0) {
        flashButton(I18n.t('export.cannotCompute'));
        return;
      }
    }

    busy = true;
    expGo.disabled = true;
    expGo.textContent = I18n.t('export.rendering');

    try {
      AudioEngine.ensureAudio();
      const ac = AudioEngine.getCtx();
      if (ac.state === 'suspended') await ac.resume();

      const rendered = await renderOffline(duration);
      const wav = audioBufferToWav(rendered);
      const url = URL.createObjectURL(wav);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'steel-rhythm-' + duration.toFixed(1) + 's.wav';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);

      expGo.textContent = I18n.t('export.done', { n: duration.toFixed(1) });
      setTimeout(function () {
        expGo.textContent = I18n.t('export.go');
        expGo.disabled = false;
        busy = false;
      }, 1600);
    } catch (err) {
      console.error(err);
      expGo.textContent = I18n.t('export.failed');
      setTimeout(function () {
        expGo.textContent = I18n.t('export.go');
        expGo.disabled = false;
        busy = false;
      }, 1600);
    }
  }

  function flashButton(text) {
    if (busy) return;
    busy = true;
    const old = I18n.t('export.go');
    expGo.textContent = text;
    setTimeout(function () {
      expGo.textContent = old;
      busy = false;
    }, 1200);
  }

  /* ---------- 离线渲染 ---------- */
  async function renderOffline(duration) {
    const ac = AudioEngine.getCtx();
    const sr = ac.sampleRate;
    const frames = Math.ceil(sr * duration);

    const offCtx = new OfflineAudioContext(2, frames, sr);

    const mg = offCtx.createGain();
    mg.gain.value = +document.getElementById('master').value;

    const shaper = offCtx.createWaveShaper();
    shaper.curve = AudioEngine.makeSaturationCurve();
    shaper.oversample = '2x';

    const comp = offCtx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 14;
    comp.ratio.value = 8;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    mg.connect(shaper);
    shaper.connect(comp);
    comp.connect(offCtx.destination);

    const stepDur = 60 / Tracks.state.bpm / 4;
    const totalSteps = Math.ceil(duration / stepDur);

    for (let step = 0; step < totalSteps; step++) {
      const time = step * stepDur;
      for (const tr of Tracks.state.tracks) {
        if (tr.muted) continue;
        if (step % tr.interval !== 0) continue;

        const src = offCtx.createBufferSource();
        src.buffer = tr.buffer;
        src.playbackRate.value = tr.rate;

        const g = offCtx.createGain();
        g.gain.value = tr.volume;
        src.connect(g);

        const p = offCtx.createStereoPanner();
        p.pan.value = tr.pan;
        g.connect(p);
        p.connect(mg);

        src.start(time);
        const endTime = time + tr.buffer.duration / tr.rate;
        if (endTime < duration) src.stop(endTime + 0.02);
      }
    }

    return await offCtx.startRendering();
  }

  /* ---------- WAV 编码 ---------- */
  function audioBufferToWav(buffer) {
    const numCh = buffer.numberOfChannels;
    const sr    = buffer.sampleRate;
    const len   = buffer.length;
    const bps   = 2;
    const blockAlign = numCh * bps;
    const dataSize   = len * blockAlign;
    const arrBuf = new ArrayBuffer(44 + dataSize);
    const view   = new DataView(arrBuf);

    function writeStr(off, s) {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    }

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels = [];
    for (let i = 0; i < numCh; i++) channels.push(buffer.getChannelData(i));

    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let ch = 0; ch < numCh; ch++) {
        let s = channels[ch][i];
        s = Math.max(-1, Math.min(1, s));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }

    return new Blob([arrBuf], { type: 'audio/wav' });
  }

  global.Export = {
    init: init,
    refreshHint: refreshHint
  };

})(window);
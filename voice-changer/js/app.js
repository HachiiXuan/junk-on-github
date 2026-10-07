/* =====================================================================
   js/app.js — 主逻辑：上传 / 录音 / 参数 / 预设 / 处理 / 播放 / 拖拽 / 导出 / i18n
   ===================================================================== */
(function () {
  'use strict';

  const { audioCtx, pitchShiftBuffer, renderAudio, limitPeak, encodeWAV, encodeMP3 } = VoiceEngine;

  /* ================= 状态 ================= */
  let originalBuffer  = null;
  let processedBuffer = null;
  let viewBuffer      = null;
  let sourceFileName  = '';
  let isProcessing    = false;
  let pendingProcess  = false;
  let processTimer    = null;

  /* 实时预览：滑块拖动期间为 true，处理完成后回到 false */
  let isPreviewing    = false;

  let currentStatusKey  = 'statusWaiting';
  let currentStatusVars = null;
  let currentStatusBusy = false;

  // 播放
  let playSource   = null;
  let playStartCtx = 0;
  let progressTime = 0;
  let isPlaying    = false;
  let rafId        = null;

  // 拖拽
  let isDragging   = false;
  let dragProgress = null;

  // 导出格式
  let exportFormat = 'mp3';

  // 录音
  let isRecording     = false;
  let mediaRecorder   = null;
  let mediaStream     = null;
  let recordedChunks  = [];
  let recordStartTime = 0;
  let recordTimer     = null;
  let recordedMime    = '';

  /* ================= DOM ================= */
  const presetListEl = document.getElementById('presetList');
  const paramsEl     = document.getElementById('params');
  const dropZone     = document.getElementById('dropZone');
  const fileInput    = document.getElementById('fileInput');
  const statusEl     = document.getElementById('status');
  const statusText   = document.getElementById('statusText');
  const waveCanvas   = document.getElementById('wave');
  const downloadBtn  = document.getElementById('downloadBtn');
  const playProcBtn  = document.getElementById('playProcessedBtn');
  const playOrigBtn  = document.getElementById('playOriginalBtn');
  const stopBtn      = document.getElementById('stopBtn');
  const langBtn      = document.getElementById('langBtn');
  const langLabel    = document.getElementById('langLabel');
  const formatSeg    = document.getElementById('formatSeg');
  const timeDisplay  = document.getElementById('timeDisplay');
  const recordBtn    = document.getElementById('recordBtn');
  const recordLabel  = document.getElementById('recordLabel');
  const recordTimeEl = document.getElementById('recordTime');

  const sliderEls = {};
  let activePresetIdx = 0;

  /* ==================================================================
     工具函数
     ================================================================== */
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function fmtDur(sec) {
    if (!isFinite(sec)) return '—';
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return (m > 0 ? m + 'm ' : '') + s.toFixed(2) + 's';
  }

  function fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(2) + ' MB';
  }

  /* ==================================================================
     状态栏
     ================================================================== */
  function setStatus(key, vars, busy) {
    currentStatusKey  = key;
    currentStatusVars = vars || null;
    if (typeof busy === 'boolean') currentStatusBusy = busy;
    statusText.textContent = I18N.t(key, vars);
    statusEl.classList.toggle('busy', currentStatusBusy && !isRecording);
    statusEl.classList.toggle('recording', isRecording);
  }

  /* ==================================================================
     参数 UI
     ================================================================== */
  function buildParams() {
    paramsEl.innerHTML = '';
    PARAM_DEFS.forEach(d => {
      const row = document.createElement('div');
      row.className = 'param';
      row.innerHTML =
        '<div class="param-top">' +
          '<span class="param-label" id="lbl-' + d.key + '"></span>' +
          '<span class="param-val"   id="val-' + d.key + '"></span>' +
        '</div>' +
        '<input type="range" id="sl-' + d.key + '"' +
          ' min="' + d.min + '" max="' + d.max + '"' +
          ' step="' + d.step + '" value="' + d.def + '">';

      paramsEl.appendChild(row);

      const input = row.querySelector('input');
      sliderEls[d.key] = input;
      input.addEventListener('input', () => {
        updateValLabel(d);
        markPresetDirty();

        /* 进入实时预览状态：立即重绘波形，不等防抖 */
        if (originalBuffer) {
          isPreviewing = true;
          updateWaveProgress();
        }
        scheduleProcess();
      });
    });

    updateParamLabels();
    PARAM_DEFS.forEach(updateValLabel);
  }

  function updateParamLabels() {
    PARAM_DEFS.forEach(d => {
      const el = document.getElementById('lbl-' + d.key);
      if (el) el.textContent = d[I18N.lang] || d.en;
    });
  }

  function updateValLabel(d) {
    const input = sliderEls[d.key];
    if (!input) return;
    const v  = parseFloat(input.value);
    const el = document.getElementById('val-' + d.key);
    if (!el) return;

    let text;
    if (Number.isInteger(v)) text = String(v);
    else text = v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

    const unit = (I18N.lang === 'zh' ? d.unitZh : d.unitEn) || '';
    el.textContent = text + (unit ? ' ' + unit : '');
  }

  /* ==================================================================
     预设 UI
     ================================================================== */
  function renderPresets() {
    presetListEl.innerHTML = '';
    PRESETS.forEach((preset, idx) => {
      const el = document.createElement('div');
      el.className = 'preset' + (idx === activePresetIdx ? ' active' : '');
      const loc = preset[I18N.lang] || preset.en;
      el.innerHTML =
        '<span class="emoji">' + preset.emoji + '</span>' +
        '<span class="pinfo">' +
          '<span class="pname">' + loc.name + '</span>' +
          '<span class="pdesc">' + loc.desc + '</span>' +
        '</span>';
      el.addEventListener('click', () => applyPreset(idx));
      presetListEl.appendChild(el);
    });
  }

  function applyPreset(idx) {
    activePresetIdx = idx;
    [...presetListEl.children].forEach((c, i) =>
      c.classList.toggle('active', i === idx));

    const preset = PRESETS[idx];
    PARAM_DEFS.forEach(d => {
      const val = (preset.p[d.key] !== undefined) ? preset.p[d.key] : DEFAULTS[d.key];
      sliderEls[d.key].value = val;
      updateValLabel(d);
    });

    /* 切换预设也立即进入预览 */
    if (originalBuffer) {
      isPreviewing = true;
      updateWaveProgress();
    }
    scheduleProcess();
  }

  function markPresetDirty() {
    activePresetIdx = -1;
    [...presetListEl.children].forEach(c => c.classList.remove('active'));
  }

  /* ==================================================================
     参数收集 + 视觉预览参数
     ================================================================== */
  function collectParams() {
    const raw = {};
    PARAM_DEFS.forEach(d => { raw[d.key] = parseFloat(sliderEls[d.key].value); });
    return {
      pitch:       raw.pitch,
      highpass:    raw.highpass,
      lowpass:     raw.lowpass,
      thickness:   raw.thickness,
      brightness:  raw.brightness,
      distortion:  raw.distortion / 100,
      ring:        raw.ring / 100,
      ringFreq:    raw.ringFreq,
      vibrato:     raw.vibrato / 100,
      vibratoRate: raw.vibratoRate,
      echo:        raw.echo / 100,
      echoTime:    raw.echoTime,
      reverb:      raw.reverb / 100,
      gain:        raw.gain / 100,
    };
  }

  /* 视觉预览用的轻量参数（不是完整参数，只挑影响大的） */
  function getVisualParams() {
    const raw = {};
    PARAM_DEFS.forEach(d => { raw[d.key] = parseFloat(sliderEls[d.key].value); });
    return {
      gain:      raw.gain / 100,
      distort:   raw.distortion / 100,
      pitch:     raw.pitch,
      thickness: raw.thickness,
    };
  }

  /* ==================================================================
     处理调度
     ================================================================== */
  function scheduleProcess() {
    if (!originalBuffer) return;
    clearTimeout(processTimer);
    processTimer = setTimeout(processAudio, 320);
  }

  async function processAudio() {
    if (!originalBuffer) return;
    if (isProcessing) { pendingProcess = true; return; }

    isProcessing = true;
    setStatus('statusProcessing', null, true);
    await new Promise(r => setTimeout(r, 30));

    const t0 = performance.now();
    try {
      const p = collectParams();

      let base = originalBuffer;
      if (Math.abs(p.pitch) >= 0.5) {
        base = pitchShiftBuffer(originalBuffer, p.pitch);
      }

      let out = await renderAudio(base, p);
      out = limitPeak(out);

      processedBuffer = out;
      viewBuffer = processedBuffer;
      progressTime = 0;

      updateMeta();
      enableButtons(true);
      setStatus('statusDone', { ms: Math.round(performance.now() - t0) }, false);
    } catch (err) {
      console.error(err);
      setStatus('statusFailed', { msg: err.message }, false);
    } finally {
      isProcessing = false;

      /* 还有后续改动在排队 → 保持预览状态，等下一次处理 */
      if (pendingProcess) {
        pendingProcess = false;
        scheduleProcess();
      } else {
        /* 处理完成 → 退出预览，显示真实波形 */
        isPreviewing = false;
        updateWaveProgress();
      }
    }
  }

  /* ==================================================================
     文件上传
     ================================================================== */
  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('over');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
    fileInput.value = '';
  });

  async function handleFile(file) {
    if (!file.type.startsWith('audio/') &&
        !/\.(mp3|wav|ogg|m4a|flac|aac|opus|webm)$/i.test(file.name)) {
      setStatus('statusInvalidFile', null, false);
      return;
    }

    if (isRecording) cancelRecording();

    stopPlayback();
    setStatus('statusDecoding', null, true);
    sourceFileName = file.name;

    try {
      const arrayBuf = await file.arrayBuffer();
      const decoded  = await audioCtx.decodeAudioData(arrayBuf);
      await loadDecodedBuffer(decoded, file.name);
    } catch (err) {
      console.error(err);
      setStatus('statusDecodeFail', null, false);
    }
  }

  async function loadDecodedBuffer(decoded, name) {
    originalBuffer  = decoded;
    processedBuffer = null;
    viewBuffer      = originalBuffer;
    progressTime    = 0;
    isPreviewing    = false;
    sourceFileName  = name;

    updateMeta();
    updateWaveProgress();
    enableButtons(false);
    setStatus('statusLoaded', null, true);

    await processAudio();
  }

  function enableButtons(on) {
    downloadBtn.disabled = !on;
    playProcBtn.disabled = !on;
    playOrigBtn.disabled = !on;
    stopBtn.disabled     = !on;
  }

  /* ==================================================================
     麦克风录音
     ================================================================== */
  function pickMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    if (typeof MediaRecorder.isTypeSupported !== 'function') return null;

    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ];
    for (let i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return null;
  }

  function updateRecordUI(recording) {
    isRecording = recording;
    if (recording) {
      recordBtn.classList.add('recording');
      recordLabel.textContent = I18N.t('btnStopRecord');
      statusEl.classList.add('recording');
      statusEl.classList.remove('busy');
    } else {
      recordBtn.classList.remove('recording');
      recordLabel.textContent = I18N.t('btnRecord');
      statusEl.classList.remove('recording');
    }
  }

  function startRecordTimer() {
    recordStartTime = Date.now();
    updateRecordTimer();
    recordTimer = setInterval(updateRecordTimer, 200);
  }

  function updateRecordTimer() {
    const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    recordTimeEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
  }

  function stopRecordTimer() {
    if (recordTimer) {
      clearInterval(recordTimer);
      recordTimer = null;
    }
    recordTimeEl.textContent = '';
  }

  async function startRecording() {
    if (isRecording) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('statusRecordUnsupported', null, false);
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setStatus('statusRecordUnsupported', null, false);
      return;
    }

    stopPlayback();

    if (audioCtx.state === 'suspended') {
      try { await audioCtx.resume(); } catch (e) {}
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });
    } catch (err) {
      console.error(err);
      setStatus('statusMicDenied', null, false);
      mediaStream = null;
      return;
    }

    const mimeType = pickMimeType();
    try {
      mediaRecorder = mimeType
        ? new MediaRecorder(mediaStream, { mimeType })
        : new MediaRecorder(mediaStream);
    } catch (err) {
      try {
        mediaRecorder = new MediaRecorder(mediaStream);
      } catch (err2) {
        console.error(err2);
        setStatus('statusRecordFailed', { msg: err2.message }, false);
        if (mediaStream) {
          mediaStream.getTracks().forEach(t => t.stop());
          mediaStream = null;
        }
        return;
      }
    }

    recordedMime   = mediaRecorder.mimeType || mimeType || 'audio/webm';
    recordedChunks = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onerror = e => {
      console.error('MediaRecorder error', e);
      setStatus('statusRecordFailed', { msg: (e.error && e.error.message) || 'unknown' }, false);
      cancelRecording();
    };
    mediaRecorder.onstop = handleRecordingStop;

    try {
      mediaRecorder.start();
    } catch (err) {
      console.error(err);
      setStatus('statusRecordFailed', { msg: err.message }, false);
      cancelRecording();
      return;
    }

    updateRecordUI(true);
    startRecordTimer();
    setStatus('statusRecording', null, false);
  }

  function stopRecording() {
    if (!isRecording && !mediaRecorder) return;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch (e) {}
    }
    stopRecordTimer();
    updateRecordUI(false);
  }

  function cancelRecording() {
    stopRecordTimer();
    if (mediaRecorder) {
      mediaRecorder.onstop = null;
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onerror = null;
      if (mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch (e) {}
      }
      mediaRecorder = null;
    }
    releaseMicStream();
    recordedChunks = [];
    recordedMime = '';
    updateRecordUI(false);
  }

  function releaseMicStream() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
  }

  async function handleRecordingStop() {
    releaseMicStream();

    const chunks = recordedChunks.slice();
    const mime   = recordedMime || 'audio/webm';
    recordedChunks = [];
    recordedMime = '';

    if (mediaRecorder) {
      mediaRecorder.ondataavailable = null;
      mediaRecorder.onstop = null;
      mediaRecorder.onerror = null;
      mediaRecorder = null;
    }

    if (chunks.length === 0) {
      setStatus('statusRecordEmpty', null, false);
      return;
    }

    const blob = new Blob(chunks, { type: mime });
    const ext  = mime.indexOf('mp4') !== -1 ? 'm4a'
              : mime.indexOf('ogg') !== -1 ? 'ogg'
              : 'webm';

    const prefix = I18N.t('recordedName');
    const stamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name   = prefix + '-' + stamp + '.' + ext;

    setStatus('statusDecoding', null, true);

    try {
      const arrayBuf = await blob.arrayBuffer();
      const decoded  = await audioCtx.decodeAudioData(arrayBuf);
      await loadDecodedBuffer(decoded, name);
    } catch (err) {
      console.error(err);
      setStatus('statusDecodeFail', null, false);
    }
  }

  recordBtn.addEventListener('click', () => {
    if (isRecording) stopRecording();
    else startRecording();
  });

  /* ==================================================================
     元信息
     ================================================================== */
  function updateMeta() {
    document.getElementById('mName').textContent = sourceFileName || '—';

    if (!originalBuffer) {
      ['mDur', 'mRate', 'mCh', 'mSize'].forEach(id => {
        document.getElementById(id).textContent = '—';
      });
      return;
    }

    const target = processedBuffer || originalBuffer;

    document.getElementById('mDur').textContent  = fmtDur(target.duration);
    document.getElementById('mRate').textContent = target.sampleRate + ' Hz';
    document.getElementById('mCh').textContent   =
      target.numberOfChannels === 1 ? I18N.t('mono') : I18N.t('stereo');

    const bytes = target.length * target.numberOfChannels * 2 + 44;
    document.getElementById('mSize').textContent = fmtBytes(bytes);
  }

  /* ==================================================================
     波形绘制 + 进度 + 实时预览
     ================================================================== */
  function currentProgressFor(buf) {
    if (dragProgress !== null) return dragProgress;
    if (!buf || buf.duration <= 0) return 0;
    const p = progressTime / buf.duration;
    return Math.max(0, Math.min(1, p));
  }

  function updateWaveProgress() {
    if (isPreviewing && originalBuffer) {
      /* 预览模式：用原始波形 + 视觉变换，模拟参数效果 */
      Waveform.draw(
        waveCanvas,
        originalBuffer,
        currentProgressFor(originalBuffer),
        I18N.t('emptyWave'),
        getVisualParams()
      );
    } else {
      /* 真实模式：显示处理后的波形 */
      Waveform.draw(
        waveCanvas,
        viewBuffer,
        currentProgressFor(viewBuffer),
        I18N.t('emptyWave'),
        null
      );
    }
    updateTimeDisplay();
  }

  function updateTimeDisplay() {
    const buf = (isPreviewing && originalBuffer) ? originalBuffer : viewBuffer;
    if (!buf) {
      timeDisplay.textContent = '0:00 / 0:00';
      return;
    }
    let t = (dragProgress !== null) ? dragProgress * buf.duration : progressTime;
    t = Math.max(0, Math.min(t, buf.duration));
    timeDisplay.textContent = fmtTime(t) + ' / ' + fmtTime(buf.duration);
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateWaveProgress, 120);
  });

  /* ==================================================================
     播放控制
     ================================================================== */
  function stopProgressLoop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function stopPlayback() {
    if (playSource) {
      try {
        playSource.onended = null;
        playSource.stop();
      } catch (e) {}
      playSource = null;
    }
    isPlaying = false;
    stopProgressLoop();
  }

  function startProgressLoop() {
    stopProgressLoop();
    const tick = () => {
      if (!isPlaying || !viewBuffer) return;

      progressTime = Math.min(
        audioCtx.currentTime - playStartCtx,
        viewBuffer.duration
      );

      if (progressTime >= viewBuffer.duration - 0.001) {
        stopPlayback();
        progressTime = 0;
        updateWaveProgress();
        return;
      }
      updateWaveProgress();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function playBuffer(buf, offset) {
    if (!buf) return;
    stopPlayback();

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const startOffset = Math.max(0, Math.min(offset || 0, buf.duration));

    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.start(0, startOffset);

    playSource   = src;
    playStartCtx = audioCtx.currentTime - startOffset;
    progressTime = startOffset;
    isPlaying    = true;

    src.onended = () => {
      if (playSource === src) {
        stopPlayback();
        progressTime = 0;
        updateWaveProgress();
      }
    };

    startProgressLoop();
    updateWaveProgress();
  }

  function seekTo(time) {
    if (!viewBuffer) return;
    time = Math.max(0, Math.min(time, viewBuffer.duration));
    progressTime = time;

    if (isPlaying) {
      playBuffer(viewBuffer, time);
    } else {
      updateWaveProgress();
    }
  }

  playProcBtn.addEventListener('click', () => {
    if (!processedBuffer) return;
    isPreviewing = false;
    viewBuffer = processedBuffer;
    progressTime = 0;
    playBuffer(viewBuffer, 0);
  });

  playOrigBtn.addEventListener('click', () => {
    if (!originalBuffer) return;
    isPreviewing = false;
    viewBuffer = originalBuffer;
    progressTime = 0;
    playBuffer(viewBuffer, 0);
  });

  stopBtn.addEventListener('click', () => {
    stopPlayback();
    progressTime = 0;
    updateWaveProgress();
  });

  /* ==================================================================
     波形拖拽（进度条）
     ================================================================== */
  function ratioFromEvent(e) {
    const rect = waveCanvas.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    return x / rect.width;
  }

  waveCanvas.addEventListener('pointerdown', e => {
    if (!viewBuffer) return;
    e.preventDefault();
    /* 拖动进度条时退出预览，看到真实波形 */
    isPreviewing = false;
    isDragging = true;
    dragProgress = ratioFromEvent(e);
    try { waveCanvas.setPointerCapture(e.pointerId); } catch (err) {}
    updateWaveProgress();
  });

  waveCanvas.addEventListener('pointermove', e => {
    if (!isDragging) return;
    e.preventDefault();
    dragProgress = ratioFromEvent(e);
    updateWaveProgress();
  });

  function finishDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    const ratio = ratioFromEvent(e);
    dragProgress = null;
    try { waveCanvas.releasePointerCapture(e.pointerId); } catch (err) {}
    if (viewBuffer) seekTo(ratio * viewBuffer.duration);
    updateWaveProgress();
  }

  waveCanvas.addEventListener('pointerup', finishDrag);
  waveCanvas.addEventListener('pointercancel', e => {
    if (!isDragging) return;
    isDragging = false;
    dragProgress = null;
    try { waveCanvas.releasePointerCapture(e.pointerId); } catch (err) {}
    updateWaveProgress();
  });

  /* ==================================================================
     导出
     ================================================================== */
  formatSeg.addEventListener('click', e => {
    const btn = e.target.closest('.seg-item');
    if (!btn) return;
    exportFormat = btn.getAttribute('data-format');
    [...formatSeg.children].forEach(c =>
      c.classList.toggle('active', c === btn));
  });

  downloadBtn.addEventListener('click', async () => {
    if (!processedBuffer) return;
    downloadBtn.disabled = true;

    try {
      let blob, ext;

      if (exportFormat === 'mp3' && window.lamejs) {
        setStatus('statusEncodingMp3', null, true);
        await new Promise(r => setTimeout(r, 30));
        blob = encodeMP3(processedBuffer, 192);
        ext  = 'mp3';
      } else {
        if (exportFormat === 'mp3' && !window.lamejs) {
          setStatus('statusMp3Unavailable', null, true);
          await new Promise(r => setTimeout(r, 900));
        } else {
          setStatus('statusEncodingWav', null, true);
          await new Promise(r => setTimeout(r, 30));
        }
        blob = encodeWAV(processedBuffer);
        ext  = 'wav';
      }

      const url  = URL.createObjectURL(blob);
      const base = sourceFileName ? sourceFileName.replace(/\.[^.]+$/, '') : 'audio';
      const name = I18N.t('downloadName', { base }) + '.' + ext;

      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      setStatus('statusDownloadStart', null, false);
    } catch (err) {
      console.error(err);
      setStatus('statusFailed', { msg: err.message }, false);
    } finally {
      downloadBtn.disabled = !processedBuffer;
    }
  });

  /* ==================================================================
     语言切换
     ================================================================== */
  function applyLanguage(lang) {
    I18N.setLang(lang);
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = I18N.t(key);
    });

    langLabel.textContent = I18N.t('langName');

    renderPresets();
    updateParamLabels();
    PARAM_DEFS.forEach(updateValLabel);
    updateMeta();
    setStatus(currentStatusKey, currentStatusVars);
    updateWaveProgress();

    recordLabel.textContent = isRecording
      ? I18N.t('btnStopRecord')
      : I18N.t('btnRecord');

    try { localStorage.setItem('vc_lang', lang); } catch (e) {}
  }

  langBtn.addEventListener('click', () => {
    applyLanguage(I18N.lang === 'zh' ? 'en' : 'zh');
  });

  /* ==================================================================
     初始化
     ================================================================== */
  const initialLang = window.__INITIAL_LANG__ || 'en';
  I18N.setLang(initialLang);

  buildParams();
  renderPresets();
  applyLanguage(initialLang);

  updateMeta();
  updateWaveProgress();

  /* 首次交互时唤醒 AudioContext（浏览器自动播放策略） */
  ['click', 'keydown', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, function wake() {
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      window.removeEventListener(evt, wake);
    }, { passive: true });
  });

})();
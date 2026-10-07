/* ============================================================
   main.js  ——  启动 / 语言切换 / UI 绑定
   ============================================================ */
(function (global) {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  /* ---------- 语言按钮高亮 ---------- */
  function updateLangButtons() {
    const cur = I18n.get();
    document.querySelectorAll('#langSwitch button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === cur);
    });
  }

  /* ---------- 构建音效面板 ---------- */
  function buildPalette() {
    const wrap = document.getElementById('paletteBtns');
    wrap.innerHTML = '';
    Object.keys(AudioEngine.SFX).forEach(function (key) {
      const b = document.createElement('button');
      b.className = 'pal-btn';
      b.setAttribute('data-sfx', key);
      b.textContent = I18n.t('sfx.' + key);
      b.addEventListener('click', function () { Tracks.addTrack(key); });
      wrap.appendChild(b);
    });
  }

  function refreshPaletteNames() {
    document.querySelectorAll('.pal-btn').forEach(function (b) {
      const key = b.getAttribute('data-sfx');
      if (key) b.textContent = I18n.t('sfx.' + key);
    });
  }

  /* ---------- 顶部控件 ---------- */
  function bindControls() {
    const playBtn = document.getElementById('playBtn');
    playBtn.addEventListener('click', function () { Tracks.toggle(); });

    const bpmEl  = document.getElementById('bpm');
    const bpmVal = document.getElementById('bpmVal');
    bpmEl.addEventListener('input', function () {
      Tracks.state.bpm = +bpmEl.value;
      bpmVal.textContent = Tracks.state.bpm;
      Export.refreshHint();
    });

    const masterEl  = document.getElementById('master');
    const masterVal = document.getElementById('masterVal');
    masterEl.addEventListener('input', function () {
      const v = +masterEl.value;
      masterVal.textContent = Math.round(v * 100) + '%';
      const mg = AudioEngine.getMaster();
      const ac = AudioEngine.getCtx();
      if (mg && ac) mg.gain.setTargetAtTime(v, ac.currentTime, 0.01);
    });

    document.getElementById('presetBtn').addEventListener('click', function () {
      Tracks.loadPreset();
    });

    document.getElementById('clearBtn').addEventListener('click', function () {
      Tracks.clearAll();
    });

    /* 语言切换 */
    document.querySelectorAll('#langSwitch button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        I18n.set(btn.getAttribute('data-lang'));
        updateLangButtons();
      });
    });

    /* 快捷键：空格播放/停止 */
    document.addEventListener('keydown', function (e) {
      const panel = document.getElementById('exportPanel');
      const inPanel = panel && panel.contains(document.activeElement);
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && !inPanel) {
        e.preventDefault();
        Tracks.toggle();
      }
    });

    /* 窗口尺寸变化 —— 波形重绘 */
    let rzT = null;
    window.addEventListener('resize', function () {
      clearTimeout(rzT);
      rzT = setTimeout(function () {
        Tracks.redrawAll();
        Viz.resize();
      }, 120);
    });
  }

  /* ---------- 跨模块事件 ---------- */
  function bindCrossEvents() {
    /* 语言改变 —— 刷新动态文本 */
    document.addEventListener('langchange', function () {
      Tracks.refreshNames();
      Tracks.refreshPlayBtn();
      refreshPaletteNames();
      Export.refreshHint();
    });

    /* 音轨变化 —— 刷新导出提示 */
    document.addEventListener('trackschange', function () {
      Export.refreshHint();
    });
  }

  /* ============================================================
     启动
     ============================================================ */
  ready(function () {
    /* ---- 1. 本地化：先按 HTML 里写死的英文渲染 ---- */
    I18n.apply();
    updateLangButtons();

    /* ---- 2. 检测浏览器语言，若中文则自动切换一次 ---- */
    const detected = I18n.detect();
    if (detected !== 'en') {
      I18n.set(detected);
      updateLangButtons();
    }

    /* ---- 3. 构建 UI ---- */
    buildPalette();
    Viz.init();
    Export.init();
    bindControls();
    bindCrossEvents();

    /* ---- 4. 加载示例节拍（不播放） ---- */
    Tracks.loadPreset();
    Tracks.updateEmptyHint();
    Export.refreshHint();
  });

})(window);
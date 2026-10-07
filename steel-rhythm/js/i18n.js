/* ============================================================
   i18n.js  ——  本地化 (EN / ZH)
   默认英文；DOM 就绪后由 main.js 检测浏览器语言再切一次
   ============================================================ */
(function (global) {
  'use strict';

  const dict = {
    en: {
      /* --- header / controls --- */
      'btn.play':   'Play',
      'btn.stop':   'Stop',
      'btn.preset': 'Preset',
      'btn.clear':  'Clear',
      'btn.export': 'Export WAV',
      'label.bpm':   'BPM',
      'label.master':'Master',

      /* --- palette / tracks --- */
      'palette.add':  'Add Track →',
      'tracks.empty': 'No tracks yet · Click a sound on the left to start building your factory',

      'track.interval': 'Interval',
      'track.volume':   'Volume',
      'track.pitch':    'Pitch',
      'track.pan':      'Pan',
      'track.stepUnit': '{n} steps',
      'track.mute':     'Mute',
      'track.delete':   'Delete',

      /* --- export --- */
      'export.mode.fixed':    'Fixed length',
      'export.mode.interval': 'By interval',
      'export.unit.sec':      'sec',
      'export.go':            'Export WAV',
      'export.rendering':     'Rendering…',
      'export.noTracks':      'No tracks',
      'export.cannotCompute': 'Cannot compute',
      'export.failed':        'Export failed',
      'export.done':          '✓ Exported {n}s',
      'export.hint.range':    '~{n}s',
      'export.hint.none':     '(no tracks)',

      /* --- SFX names --- */
      'sfx.anvil':    'Anvil Strike',
      'sfx.steel':    'Steel Impact',
      'sfx.sub':      'Sub Rumble',
      'sfx.hammer':   'Hammer Smash',
      'sfx.chain':    'Chain Clatter',
      'sfx.steam':    'Steam Burst',
      'sfx.wrench':   'Pneumatic Wrench',
      'sfx.gate':     'Gate Slam',
      'sfx.snap':     'Cable Snap',
      'sfx.conveyor': 'Machine Hum',
      'sfx.spark':    'Spark Burst'
    },

    zh: {
      'btn.play':   '播放',
      'btn.stop':   '停止',
      'btn.preset': '示例节拍',
      'btn.clear':  '清空音轨',
      'btn.export': '导出 WAV',
      'label.bpm':   'BPM',
      'label.master':'总音量',

      'palette.add':  '添加音轨 →',
      'tracks.empty': '还没有音轨 · 点击左侧音效按钮开始搭建你的工厂',

      'track.interval': '间隔',
      'track.volume':   '音量',
      'track.pitch':    '音高',
      'track.pan':      '声像',
      'track.stepUnit': '{n}步',
      'track.mute':     '静音',
      'track.delete':   '删除',

      'export.mode.fixed':    '固定时长',
      'export.mode.interval': '按间隔',
      'export.unit.sec':      '秒',
      'export.go':            '导出 WAV',
      'export.rendering':     '渲染中…',
      'export.noTracks':      '没有音轨',
      'export.cannotCompute': '无法计算时长',
      'export.failed':        '导出失败',
      'export.done':          '✓ 已导出 {n}s',
      'export.hint.range':    '约 {n} 秒',
      'export.hint.none':     '（无音轨）',

      'sfx.anvil':    '铁砧重击',
      'sfx.steel':    '钢板撞击',
      'sfx.sub':      '低频轰鸣',
      'sfx.hammer':   '铁锤砸击',
      'sfx.chain':    '铁链哐当',
      'sfx.steam':    '蒸汽喷发',
      'sfx.wrench':   '气动扳手',
      'sfx.gate':     '铁门重闭',
      'sfx.snap':     '钢缆崩断',
      'sfx.conveyor': '机械底噪',
      'sfx.spark':    '火花迸溅'
    }
  };

  let current = 'en';

  /* ---- 检测浏览器首选语言 ---- */
  function detect() {
    const list = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : [navigator.language || navigator.userLanguage || 'en'];

    for (let i = 0; i < list.length; i++) {
      const s = String(list[i] || '').toLowerCase();
      if (s.indexOf('zh') === 0) return 'zh';
      if (s.indexOf('en') === 0) return 'en';
    }
    return 'en';
  }

  /* ---- 取翻译 ---- */
  function t(key, vars) {
    const d = dict[current] || dict.en;
    let s = d[key];
    if (s === undefined) s = dict.en[key];
    if (s === undefined) s = key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (_, k) {
        return vars[k] !== undefined ? String(vars[k]) : '';
      });
    }
    return s;
  }

  /* ---- 应用到带 data-i18n 属性的元素 ---- */
  function apply(root) {
    const r = root || document;

    r.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    r.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.title = t(el.getAttribute('data-i18n-title'));
    });

    document.documentElement.lang = (current === 'zh') ? 'zh-CN' : 'en';
  }

  /* ---- 切换语言 ---- */
  function set(lang) {
    if (lang !== 'zh' && lang !== 'en') lang = 'en';
    const changed = (current !== lang);
    current = lang;
    apply();
    if (changed) {
      document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
    }
  }

  function get() { return current; }

  global.I18n = {
    t: t,
    apply: apply,
    set: set,
    get: get,
    detect: detect,
    dict: dict
  };

})(window);
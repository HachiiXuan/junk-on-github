/* ==========================================================================
   render.topbar —— 顶部信息栏（地图名 / 在线人数 / 时间 / 天气 / 语言 / 面板）
   ========================================================================== */
(function (FS) {
  'use strict';

  var CFG = FS.data.config;
  var I18N = FS.core.i18n;
  var Clock = FS.core.clock;

  var refs = {};
  var world = null;
  var last = { online: -1, weather: null, minute: -1, day: -1 };

  var Topbar = {
    init: function (w) {
      world = w;
      refs.mapName = document.getElementById('mapName');
      refs.onlineBox = document.getElementById('onlineCount');
      refs.onlineVal = document.getElementById('onlineVal');
      refs.timeVal = document.getElementById('timeVal');
      refs.weatherBox = document.getElementById('weather');
      refs.weatherVal = document.getElementById('weatherVal');
      refs.langLabel = document.getElementById('langLabel');
      refs.langBtn = document.getElementById('langBtn');
      refs.panelToggle = document.getElementById('panelToggle');

      if (refs.mapName) refs.mapName.textContent = world.mapName;

      if (refs.langBtn) {
        refs.langBtn.addEventListener('click', function () {
          I18N.toggleLang();
        });
      }

      Topbar.applyLang();
      Topbar.render();
      return Topbar;
    },

    setWorld: function (w) {
      world = w;
      /* 换世界时必须让缓存失效，否则 render() 会认为"值没变"而什么都不画 ——
         导入快照后顶栏一直显示旧世界的在线数/时间/天气，就是这个原因。 */
      last.online = -1;
      last.weather = null;
      last.minute = -1;
      last.day = -1;
      Topbar.render();
      return Topbar;
    },

    /** 语言切换后更新静态标签 */
    applyLang: function () {
      if (!refs.langLabel) return;
      var lang = I18N.getLang();
      // 显示"另一个"语言，点一下切过去
      refs.langLabel.textContent = lang === 'en' ? 'ZH' : 'EN';
      refs.langBtn.title = I18N.t('ui.lang');
      var onlineLabel = document.getElementById('onlineLabel');
      if (onlineLabel) onlineLabel.textContent = I18N.t('ui.online');
      var weatherLabel = document.getElementById('weatherLabel');
      if (weatherLabel) weatherLabel.textContent = I18N.t('ui.weather');
      if (refs.langBtn) refs.langBtn.classList.toggle('on', lang === 'zh');
      var hint = document.getElementById('immersiveHintText');
      if (hint) hint.textContent = I18N.t('ui.immersiveHint');
      Topbar.syncToggleLabel();
      last.weather = null;    // 强制重画天气
      last.minute = -1;
    },

    /** 折叠按钮上的文字：收起 / 展开 */
    syncToggleLabel: function () {
      var cap = document.getElementById('panelToggleCap');
      var icon = document.getElementById('panelToggleIcon');
      var collapsed = Topbar.isPanelCollapsed();
      if (cap) cap.textContent = I18N.t(collapsed ? 'ui.panelShow' : 'ui.panelHide');
      if (icon) icon.textContent = collapsed ? '\u25c2' : '\u25c2';   // ◂ 始终指向右侧面板
      var btn = document.getElementById('panelToggle');
      if (btn) btn.title = I18N.t('ui.debug') + ' \u00b7 Ctrl+B';
    },

    render: function () {
      if (!world || !refs.onlineVal) return;
      var t = world.time;

      /* 在线人数：变化时高亮脉冲 */
      var n = world.online.length;
      if (n !== last.online) {
        refs.onlineVal.textContent = n + ' / ' + CFG.maxPlayers;
        refs.onlineBox.classList.toggle('alive', n > 0);
        refs.onlineBox.classList.remove('bump');
        // 触发重排以重启动画
        void refs.onlineBox.offsetWidth;
        refs.onlineBox.classList.add('bump');
        last.online = n;
      }

      /* 时间 */
      var hhmm = Clock.hhmm(t);
      if (t.minute !== last.minute || t.day !== last.day) {
        refs.timeVal.textContent = hhmm + '  ' + I18N.t('ui.day', { n: t.day });
        last.minute = t.minute;
        last.day = t.day;
      }

      /* 天气 */
      if (world.weather !== last.weather) {
        refs.weatherVal.textContent = I18N.tx('weather', world.weather);
        refs.weatherVal.classList.remove('flash');
        void refs.weatherVal.offsetWidth;
        refs.weatherVal.classList.add('flash');
        last.weather = world.weather;
      }
    },

    isPanelCollapsed: function () {
      var main = document.getElementById('main');
      return !!(main && main.classList.contains('panel-collapsed'));
    },

    /**
     * 展开/收起调试面板。
     * @param {boolean} collapsed
     * @param {boolean} [silent] true = 不记录"用户手动开过"（开机初始化用）
     */
    setPanelCollapsed: function (collapsed, silent) {
      var main = document.getElementById('main');
      if (!main) return;
      main.classList.toggle('panel-collapsed', !!collapsed);
      if (!silent) {
        /* 记在 sessionStorage 里：本次会话刷新后保留，关掉标签页就忘掉。
           长期偏好（localStorage）不参与初始状态 ——
           否则浏览器里残留的旧值会让"默认收起"永远失效。 */
        try {
          if (window.sessionStorage) {
            window.sessionStorage.setItem('fs.panelOpenThisSession',
              collapsed ? '0' : '1');
          }
        } catch (e) { /* 忽略 */ }
      }
      Topbar.syncToggleLabel();
      if (!collapsed) {
        // 展开时立刻刷新一次面板内容
        if (FS.render.panel) FS.render.panel.render();
      }
    },

    /* ---------------- 沉浸模式 ---------------- */

    isImmersive: function () {
      return document.body.classList.contains('immersive');
    },

    /** 隐藏顶栏与面板，只留控制台；任意键/再按一次退出 */
    setImmersive: function (on) {
      var body = document.body;
      if (!body) return;
      body.classList.toggle('immersive', !!on);
      try { window.localStorage.setItem('fs.immersive', on ? '1' : '0'); } catch (e) { /* 忽略 */ }
      // 沉浸模式下面板被隐藏，顺带把面板状态标成收起，避免回来时错位
      return on;
    },

    toggleImmersive: function () {
      return Topbar.setImmersive(!Topbar.isImmersive());
    },
  };

  FS.define('render.topbar', Topbar);
})(window.FS);

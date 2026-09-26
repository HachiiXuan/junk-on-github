/* ==========================================================================
   main —— 启动装配
   顺序：语言 → 世界与角色 → 渲染层 → 开机序列 → 快进历史 → 输入行 → 主循环
   ========================================================================== */
(function (FS) {
  'use strict';

  var CFG = FS.data.config;
  var U = FS.core.util;
  var I18N = FS.core.i18n;
  var Clock = FS.core.clock;
  var Store = FS.persist.store;

  /* ---------- 启动基准时间（真实时间只在这里取一次） ---------- */
  var bootNow = Date.now();
  FS.bootMs = bootNow;
  var bootDate = new Date(bootNow);
  FS.bootWallMinutes = bootDate.getHours() * 60 + bootDate.getMinutes();

  var App = {
    world: null,
    roster: null,
    meta: null,
    backfillInfo: null,
    started: false,

    init: function () {
      /* ---- 1. 语言：默认英文，浏览器是中文才切中文 ---- */
      I18N.addPack('en', FS.data.locale.en);
      I18N.addPack('zh', FS.data.locale.zh);
      I18N.init();
      document.title = CFG.mapName + ' \u00b7 server console';

      /* ---- 2. 世界与角色 ----
         每次打开都是**一场新世界**（第 1 天 06:00、0/32）。
         只有"上次离开的时刻"会被读出来，用来决定这次快进多少世界时间。 */
      var meta = Store.load();
      App.meta = meta;

      FS.core.rng.seed(CFG.seed);

      var rosterList = FS.state.agent.createRoster(FS.data.agents);
      App.roster = { list: rosterList, byId: {} };
      rosterList.forEach(function (a) { App.roster.byId[a.id] = a; });

      /* 角色昵称是运行时数据（32 个随机英文 ID），不写进语言包 ——
         真人昵称本来也不翻译。注册一个解析器让 name.<id> 能查到。 */
      I18N.resolver('name', function (agentId) {
        var a = App.roster && App.roster.byId[agentId];
        return a ? a.name : null;
      });
      /* console 是虚拟角色，昵称固定 */
      I18N.resolver('console', function (key) {
        return key === 'name' ? 'console' : null;
      });
      /* 小队名同样不进语言包：那是"玩家自己起的名"，
         不该跟着界面语言变（英文小队名在任何语言下都正常）。 */
      I18N.resolver('faction', function (factionId) {
        var list = (App.world && App.world.factions) || [];
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === factionId) return list[i].name;
        }
        /* 团体可能已经解散（人走光了），这时不该打 missing key 噪音 ——
           那是个正常的生命周期事件，不是翻译漏了。 */
        return factionId;
      });

      App.world = FS.state.world.create(bootNow);
      FS.state.world.syncRoster(App.world, App.roster);

      /* ---- 3. 渲染层 ---- */
      FS.render.log.init(App.roster);
      FS.render.topbar.init(App.world);
      FS.render.panel.init(App.world, App.roster);
      FS.render.panel.setWorld(App.world, App.roster);

      /* 调试面板的初始状态。
         ------------------------------------------------------------------
         需求是"每次进入页面都应该是收起的"。所以：
           · 持久化的偏好**不参与**初始状态判断（否则浏览器里残留的旧值
             会让面板一直是展开的 —— 这正是"改了但没用"的原因）
           · 只有"本次浏览器会话里手动开过"才在刷新后保留展开，
             用 sessionStorage 记，关掉标签页就忘掉
         需要长期展开时按 Ctrl+B，那是本次会话的临时状态。 */
      var sessionExpanded = false;
      try {
        sessionExpanded = window.sessionStorage
          && window.sessionStorage.getItem('fs.panelOpenThisSession') === '1';
      } catch (e) { sessionExpanded = false; }

      var collapsed = !sessionExpanded;
      var wasImmersive = !!Store.getPref('immersive', false);
      if (wasImmersive) {
        // 上次处于沉浸模式：先把面板标记为收起，再进沉浸
        collapsed = true;
      }
      FS.render.topbar.setPanelCollapsed(!!collapsed, true);
      if (wasImmersive) {
        FS.render.topbar.setImmersive(true);
      }
      bind(document.getElementById('panelToggle'), 'click', function () {
        FS.render.topbar.setPanelCollapsed(!FS.render.topbar.isPanelCollapsed());
      });
      bind(document.getElementById('panelStrip'), 'click', function () {
        FS.render.topbar.setPanelCollapsed(false);
      });
      bind(document.getElementById('immersiveHint'), 'click', function () {
        FS.render.topbar.setImmersive(false);
      });

      I18N.onLangChange(function () {
        App.applyStaticTexts();
        FS.render.topbar.applyLang();
        FS.render.log.rerender();
        FS.render.panel.rebuild(App.world, App.roster);
      });
      App.applyStaticTexts();

      /* ---- 4. 快进计划（关页期间世界继续跑） ---- */
      var plan = FS.backfill.plan(App.world, bootNow, meta.lastSeenMs);
      App.backfillPlan = plan;

      /* ---- 5. 直接进入运行状态（没有开机画面） ---- */
      App.becomeReady(plan);

      /* ---- 6. 快捷键 ---- */
      bind(window, 'keydown', App.onKeydown);

      /* ---- 7. 页面隐藏时暂停（回来后用 backfill 补时间） ---- */
      document.addEventListener('visibilitychange', App.onVisibility);

      window.addEventListener('beforeunload', App.save);
      FS.app = App;
      return App;
    },

    /* ---------------- 进入运行状态 ---------------- */
    /**
     * 没有开机画面：页面一打开就是"服务器已经在跑"。
     * 有历史（上次离开到现在）就先快进补上，快进期间渲染静音，
     * 完成后一次性把缓冲画到控制台。
     */
    becomeReady: function (plan) {
      if (plan && plan.needed) {
        var info = FS.backfill.run(App.world, App.roster, {
          elapsedMs: plan.elapsedMs,
          nowMs: bootNow,
        });
        App.backfillInfo = info;
        Clock.useRealTime();
        FS.state.world.syncTime(App.world, Date.now());
        // 面板的历史事件与日志一次性画出来
        FS.render.panel.rebuild(App.world, App.roster);

        if (CFG.debugLogs) {
          FS.render.log.push({
            key: 'log.boot.replay',
            vars: { n: Math.round(plan.elapsedMs / CFG.tickMs) },
            level: 'INFO',
            thread: 'server',
          });
        }
      } else {
        FS.render.panel.beginHistory();
      }

      FS.render.log.flush();
      FS.render.log.divider('ui.historyEnd');

      /* 空服务器提示：只有真的没有任何人在线时才提示 */
      if (!App.world.online.length) {
        FS.render.log.push({
          key: 'log.server.noPlayers',
          vars: {},
          level: 'INFO',
          thread: 'server',
        });
      }

      App.bindInput();
      App.applyStaticTexts();

      /* ---- 主循环 ---- */
      FS.core.tick.start();
      App.started = true;

      /* 记一次访问：只写"关于你"的元数据，不写世界状态。
         用开机时刻，避免把快进耗时算进 session。 */
      Store.setPref('panelCollapsed', FS.render.topbar.isPanelCollapsed());
      Store.setPref('lang', I18N.getLang());
      Store.markVisit(bootNow);
      App.meta = Store.load();
    },

    /* ---------------- 界面静态文字（语言切换时刷新） ---------------- */

    applyStaticTexts: function () {
      var input = document.getElementById('cmdInput');
      if (input) input.placeholder = I18N.t('ui.inputPlaceholder');
      var jump = document.getElementById('jumpLatestLabel');
      if (jump) jump.textContent = I18N.t('ui.jumpLatest');
      var strip = document.getElementById('panelStripLabel');
      if (strip) strip.textContent = I18N.t('ui.debug').toUpperCase();
      var title = document.getElementById('panelTitle');
      if (title) title.textContent = I18N.t('ui.debug');
    },

    /* ---------------- 输入行 ---------------- */

    bindInput: function () {
      var input = document.getElementById('cmdInput');
      var caret = document.getElementById('fakeCaret');
      var row = document.getElementById('inputRow');
      if (!input) return;
      FS.cmd.parser.loadHistory();

      var canvas = document.createElement('canvas');
      var c2d = canvas.getContext ? canvas.getContext('2d') : null;

      function syncCaret() {
        if (!caret) return;
        if (document.activeElement !== input || !input.value.length) {
          caret.style.display = 'none';
          return;
        }
        var cs = window.getComputedStyle(input);
        if (c2d) c2d.font = cs.fontSize + ' ' + cs.fontFamily;
        var w = c2d ? c2d.measureText(input.value).width : input.value.length * 8;
        var rect = input.getBoundingClientRect();
        var rowRect = row ? row.getBoundingClientRect() : rect;
        caret.style.display = 'block';
        caret.style.left = Math.round(rect.left - rowRect.left + w) + 'px';
        caret.style.top = Math.round(rect.top - rowRect.top + (input.offsetHeight - 15) / 2) + 'px';
      }

      input.addEventListener('input', syncCaret);
      input.addEventListener('focus', syncCaret);
      input.addEventListener('blur', function () {
        if (caret) caret.style.display = 'none';
      });

      /* 点空白处聚焦（终端习惯） */
      bind(document.getElementById('consoleWrap'), 'mousedown', function (e) {
        if (e.target && e.target.closest && e.target.closest('#panel')) return;
        if (window.getSelection && String(window.getSelection())) return;
        window.setTimeout(function () { if (input.focus) input.focus(); }, 0);
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var raw = input.value;
          input.value = '';
          syncCaret();
          if (raw.trim()) {
            FS.cmd.parser.pushHistory(raw);
            FS.cmd.parser.exec(raw);
          }
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          input.value = FS.cmd.parser.prev();
          syncCaret();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          input.value = FS.cmd.parser.next();
          syncCaret();
          return;
        }
        if (e.key === 'l' && e.ctrlKey) {
          e.preventDefault();
          FS.cmd.parser.exec('clear');
        }
      });

      if (input.focus) input.focus();
    },

    /* ---------------- 快捷键 ----------------
       Ctrl+B / F2  沉浸模式（隐藏顶栏与面板，只剩控制台）
       Ctrl+Shift+B 只折叠/展开右侧面板
       Esc          退出沉浸模式
       注意：输入框聚焦时，只有功能键与带修饰键的组合才生效，
             避免干扰打命令。 */
    onKeydown: function (e) {
      var key = e.key;
      var inInput = e.target && e.target.id === 'cmdInput';
      var immersive = FS.render.topbar.isImmersive();

      if (key === 'F2' || (key === 'b' && e.ctrlKey && !e.shiftKey)) {
        e.preventDefault();
        FS.render.topbar.toggleImmersive();
        return;
      }
      if (key === 'b' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        FS.render.topbar.setPanelCollapsed(!FS.render.topbar.isPanelCollapsed());
        return;
      }
      if (key === 'Escape' && immersive) {
        e.preventDefault();
        FS.render.topbar.setImmersive(false);
        return;
      }
      /* 沉浸模式下的"任意键"退出交给输入框以外的地方 */
      if (immersive && !inInput && key && key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        FS.render.topbar.setImmersive(false);
      }
    },

    /* ---------------- 页面可见性 ---------------- */

    onVisibility: function () {
      // forceHidden 供无浏览器测试注入（真实浏览器里恒为 undefined）
      var hidden = App.forceHidden != null ? App.forceHidden : document.hidden;
      if (hidden) {
        // 停掉主循环：后台期间不产生任何日志，回来时按真实经过时间补
        FS.core.tick.hide();
        // 记下"此刻"作为离开时刻。这里必须用当前时间，
        // 不能用开机时缓存的时间戳 —— 否则每次切回来都会被算成
        // "离开了 [本次会话时长]"，触发一次不必要的整屏重画。
        App.save();
        return;
      }
      /* 回到前台：把离开的这段时间用同一条 tick 路径补上 */
      var nowMs = App.forceNow != null ? App.forceNow : Date.now();
      App.meta = Store.load();
      var plan = FS.backfill.plan(App.world, nowMs, App.meta.lastSeenMs);
      App.lastPlan = {
        needed: plan.needed,
        elapsedMs: plan.elapsedMs,
        lastSeenMs: App.meta.lastSeenMs,
        nowMs: nowMs,
      };
      if (plan.needed) {
        var info = FS.backfill.run(App.world, App.roster, { elapsedMs: plan.elapsedMs, nowMs: nowMs });
        Clock.useRealTime();
        FS.state.world.syncTime(App.world, nowMs);
        App.backfillInfo = info;
        /* 快进期间渲染是静音的，历史都没进 DOM，这里按缓冲整屏重画一次。
           rerender 是"先清空再重建"，重复调用也不会产生重复行。 */
        FS.render.log.flush();
        FS.render.panel.rebuild(App.world, App.roster);
      } else {
        /* 离开时间很短：世界钟直接对齐，DOM 保持原样 */
        Clock.useRealTime();
        FS.state.world.syncTime(App.world, nowMs);
      }
      FS.core.tick.resume();
      App.save();
    },

    /* ---------------- 快进（调试面板） ----------------
       把"接下来 N 分钟真实时间会发生的事"一次性算完并打进控制台。
       用途：不想等的时候直接看后面几分钟的对话/进出/噪音。

       两个关键点：
         · 推进的是**真实的游玩时间轴**（时钟 + realPlayMs），
           所以加入调度、离开概率都按正常节奏走，不会失真
         · 算完把时钟恢复成真实时间：游戏内时间因此往前走了 2 分钟对应的
           世界时间（1 游戏小时 = 2 真实分钟 → 2 真实分钟 = 2 游戏小时），
           这与"真的等了 2 分钟"完全等价 */
    fastForward: function (realMinutes) {
      var mins = realMinutes || 2;
      var ticks = Math.round(mins * 60 * 1000 / CFG.tickMs);
      var stepMs = CFG.tickMs;
      var t0 = Date.now();
      var before = App.world.tick;
      var beforeOnline = App.world.online.length;

      var now = FS.core.clock.now();
      try {
        for (var i = 0; i < ticks; i++) {
          now += stepMs;
          FS.core.clock.setNow(now);
          FS.core.tick.step(true);
        }
      } catch (e) {
        FS.render.log.push({
          key: 'log.command.snapshotErr',
          vars: { error: String(e && e.message ? e.message : e) },
          level: 'ERROR',
          thread: 'server',
        });
        return null;
      }

      /* 把"世界纪元"整体前移这么多毫秒。
         为什么要动它：world.time 是由 syncTime 从
         (真实时钟 - worldStartMs) **推导**出来的，不自己累加。
         如果只是把时钟拨回去（useRealTime），推导结果又会回到动手前 ——
         快进就白跑了。把纪元前移等价于"这段时间真的过去了"。 */
      App.world.worldStartMs -= ticks * stepMs;

      FS.core.clock.useRealTime();
      FS.state.world.syncTime(App.world, Date.now());
      FS.render.log.flush();
      FS.render.panel.rebuild(App.world, App.roster);
      FS.render.topbar.render();
      FS.core.tick.noteFrame();

      var info = {
        minutes: mins,
        ticks: App.world.tick - before,
        ms: Date.now() - t0,
        onlineBefore: beforeOnline,
        onlineAfter: App.world.online.length,
      };
      FS.render.log.push({
        key: 'log.command.fastForward',
        vars: {
          min: mins,
          n: info.ticks,
          online: info.onlineAfter,
          ms: info.ms,
        },
        level: 'SYSTEM',
        thread: 'server',
      });
      FS.render.log.scrollToBottom();
      return info;
    },

    /* ---------------- 世界快照（v0.3） ----------------
       刷新 = 新世界；想让世界延续就导出文件，之后导入回来。 */

    exportSnapshot: function () {
      var snap = FS.persist.snapshot;
      if (!snap) return null;
      var res = snap.download(App.world, App.roster);
      if (res.ok) {
        FS.render.log.push({
          key: 'log.command.snapshotExported',
          vars: { name: res.name, kb: Math.max(1, Math.round(res.bytes / 1024)) },
          level: 'SYSTEM',
          thread: 'server',
        });
      } else {
        FS.render.log.push({
          key: 'log.command.snapshotErr',
          vars: { error: res.error || 'unknown' },
          level: 'ERROR',
          thread: 'server',
        });
      }
      return res;
    },

    importSnapshot: function () {
      var snap = FS.persist.snapshot;
      if (!snap) return;
      snap.pickAndImport(App, function (res) {
        App.onSnapshotResult(res);
      });
    },

    /** 导入结果统一在这里落地：成功就刷新界面，失败就打错误 */
    onSnapshotResult: function (res) {
      if (res && res.ok) {
        var info = res.info || {};
        FS.render.log.push({
          key: 'log.command.snapshotImported',
          vars: {
            day: info.day || 1,
            online: info.online || 0,
            traces: info.traces || 0,
          },
          level: 'SYSTEM',
          thread: 'server',
        });
        App.applyStaticTexts();
        return res;
      }
      FS.render.log.push({
        key: 'log.command.snapshotErr',
        vars: { error: (res && res.error) || 'unknown' },
        level: 'ERROR',
        thread: 'server',
      });
      return res;
    },

    /* ---------------- 轻量存档 ----------------
       只记录"关于你"的信息：离开时刻 + 界面偏好。
       世界状态一律不落盘（想让世界延续请用 v0.3 的快照导出/导入）。 */
    save: function () {
      Store.setPref('panelCollapsed', FS.render.topbar.isPanelCollapsed());
      Store.setPref('lang', I18N.getLang());
      Store.setPref('immersive', FS.render.topbar.isImmersive());
      App.meta = Store.touch();
      return App.meta;
    },
  };

  function bind(el, type, fn) {
    if (el && el.addEventListener) el.addEventListener(type, fn);
  }

  FS.app = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { App.init(); });
  } else {
    App.init();
  }
})(window.FS);

/* ==========================================================================
   core.tick —— 固定步长主循环
   两条硬性规则（见 docs/READMEv0.2.md §3）：
     · 逻辑一律按 tick 计数，不用 setTimeout 记游戏时间
     · tick 数由真实经过时间推算（elapsed / tickMs），因此隐藏标签页回来、
       或离线快进，都可以用同一个 run() 补上，行为完全一致
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }

  var running = false;
  var timerId = null;
  var lastMs = 0;
  var paused = false;
  var playtimeFrozen = false;      // 快进期间冻结游玩时间轴

  /* 统计（调试用） */
  var stats = {
    frames: 0,
    ticksTotal: 0,
    lastTicks: 0,
    maxTicks: 0,
    lastFrameMs: 0,
    maxFrameMs: 0,
  };

  /** 跑一个 tick。silent = true 时不产出可见日志（快进用） */
  function step(silent) {
    var app = FS.app;
    var world = app.world;
    var roster = app.roster;
    var nowMs = FS.core.clock.now();

    advancePlaytime(world, CFG().tickMs);

    /* 0. 世界钟（由真实时间推算，不累加，避免漂移） */
    world.tick += 1;
    FS.state.world.syncTime(world, nowMs);

    /* 1+2. 事件队列 → 世界更新（天气 / 资源 / 事件冷却 / 待加入角色） */
    var pending = FS.core.bus ? FS.core.bus.process(world, roster) : [];
    var worldLogs = FS.state.world.update(world, 1, nowMs);
    if (pending.length) worldLogs = pending.concat(worldLogs);
    if (worldLogs.length) pushLogs(worldLogs, silent);

    /* 2.5 底层噪音：世界安静够久时补一条环境日志。
       真实服务器的控制台永远不是安静的 —— 没有这层噪音，
       一眼就能看出这个页面"只在有人聊天时才动"。 */
    if (FS.state.noise) {
      if (worldLogs.length) FS.state.noise.markActivity(world, world.tick);
      var noiseLogs = FS.state.noise.run(world, roster, silent);
      if (noiseLogs.length) pushLogs(noiseLogs, silent);
    }

    /* 3. 每个在线角色决策 */
    if (FS.state.agentUpdate) {
      FS.state.agentUpdate.run(world, roster, silent, nowMs);
    }

    /* 4. 对话引擎推进 */
    if (FS.ai && FS.ai.dialogue) {
      FS.ai.dialogue.advance(world, roster, silent);
    }

    /* 4.5 小团体：从真实好感里长出"一伙人"（v1.1） */
    if (FS.state.faction) {
      var facLogs = FS.state.faction.update(world, roster, silent);
      if (facLogs && facLogs.length) pushLogs(facLogs, silent);
    }

    /* 5. 记忆裁剪 / 心情收束（低频） */
    if (world.tick % CFG().memorySweepTicks === 0 && FS.state.memory) {
      FS.state.memory.sweep(roster, world);
    }

    /* 6. 渲染（silent 时全部跳过，快进结束后一次性重画） */
    if (!silent) {
      /* 顶栏：时间/在线数/天气。以前这里漏了 topbar.render()，
         于是顶栏从开机起就停在初始值（06:00 / 0-32）再也不动 —— */
      if (FS.render.topbar && world.tick % CFG().topbarRefreshTicks === 0) {
        FS.render.topbar.render();
      }
      if (FS.render.panel && world.tick % CFG().panelRefreshTicks === 0) {
        FS.render.panel.render();
      }
    }
  }
  function pushLogs(entries, silent) {
    if (!entries || !entries.length) return;
    if (silent) {
      for (var i = 0; i < entries.length; i++) {
        FS.render.log.push(entries[i], true);
      }
    } else {
      FS.render.log.pushMany(entries);
      if (FS.render.panel) {
        for (var j = 0; j < entries.length; j++) {
          var e = entries[j];
          if (e.level === 'CHAT' || e.level === 'SYSTEM' || e.level === 'WARN') {
            FS.render.panel.renderEvent(
              FS.core.clock.logTime(FS.core.clock.now()).hhmm,
              shortEventText(e), e.level !== 'CHAT');
          }
        }
      }
    }
  }

  /** 推进"累计真实游玩时间"（加入调度的时间轴）。
   *  快进（离线期间）冻结不推进 —— 离线时没人在玩，
   *  所以"下一个玩家什么时候上线"不该被离线时长催熟。 */
  function advancePlaytime(world, ms) {
    if (playtimeFrozen) return world.realPlayMs || 0;
    world.realPlayMs = (world.realPlayMs || 0) + ms;
    if (world.realPlayMs > (world.maxPlayMs || 0)) world.maxPlayMs = world.realPlayMs;
    return world.realPlayMs;
  }

  /** 面板"最近事件"用的一句短描述 */
  function shortEventText(entry) {
    var text = FS.core.i18n.t(entry.key, FS.core.i18n.localizeVars(entry.vars));
    if (entry.raw != null) text = String(entry.raw).split('\n')[0];
    if (entry.level === 'CHAT' && entry.agentId) {
      text = FS.core.i18n.t('name.' + entry.agentId) + ': ' + text;
    }
    return text.length > 60 ? text.slice(0, 59) + '\u2026' : text;
  }

  var Tick = {
    /** 启动主循环 */
    start: function () {
      var app = FS.app;
      lastMs = Date.now();
      app.world.lastRealMs = lastMs;
      running = true;
      paused = false;
      timerId = window.setInterval(Tick.frame, CFG().tickMs);
      return Tick;
    },

    stop: function () {
      running = false;
      if (timerId) { window.clearInterval(timerId); timerId = null; }
    },

    isRunning: function () { return running; },

    /**
     * 一帧：按真实经过时间跑若干个逻辑 tick。
     * 为什么要循环而不是"一帧一 tick"：标签页被节流时定时器间隔会变成几秒，
     * 一帧一 tick 会让世界时间变慢；用 elapsed 补偿才能保持世界连续。
     */
    frame: function () {
      if (!running) return;
      /* 暂停时必须在这里直接返回。
         如果只设标志位、任由定时器继续跑，页面在后台的整段时间里
         每个 tick 都会照常打日志（天气/加入/聊天），用户切回来就会看到
         "凭空多出一堆文本"。 */
      if (paused) { lastMs = Date.now(); return; }
      var t0 = Date.now();
      var elapsed = t0 - lastMs;
      var stepMs = CFG().tickMs;
      var n = Math.floor(elapsed / stepMs);
      if (n < 1) return;

      var cap = CFG().maxCatchUpTicks;
      if (n > cap) n = cap;             // 太长的时间空洞交给 backfill 处理
      lastMs = t0 - (elapsed - n * stepMs);
      FS.app.world.lastRealMs = lastMs;

      for (var i = 0; i < n; i++) step(false);

      stats.frames++;
      stats.lastTicks = n;
      if (n > stats.maxTicks) stats.maxTicks = n;
      stats.ticksTotal += n;
      stats.lastFrameMs = Date.now() - t0;
      if (stats.lastFrameMs > stats.maxFrameMs) stats.maxFrameMs = stats.lastFrameMs;
    },

    /**
     * 跑 N 个 tick（实时与快进共用）。
     * 快进期间调用方会先 freezePlaytime(true)：离线时没人在玩，
     * 所以"下一个人什么时候上线"的时间轴不应该被离线时长催熟。
     * @param {number} n
     * @param {function} [onProgress] 每 2000 tick 回调一次 (done, total)
     */
    run: function (n, onProgress) {
      var CHUNK = 2000;
      var done = 0;
      while (done < n && !Tick._abortBackfill) {
        var take = Math.min(CHUNK, n - done);
        for (var i = 0; i < take; i++) step(true);
        done += take;
        if (onProgress) onProgress(done, n);
      }
      return done;
    },

    /** 暂停：停掉定时器（否则后台期间会持续"打印"） */
    pause: function () {
      paused = true;
      if (timerId) { window.clearInterval(timerId); timerId = null; }
    },

    resume: function () {
      if (!paused) return;
      paused = false;
      lastMs = Date.now();
      FS.app.world.lastRealMs = lastMs;
      if (running && !timerId) {
        timerId = window.setInterval(Tick.frame, CFG().tickMs);
      }
    },

    /** 停掉并解绑主循环（页面隐藏时用） */
    hide: function () {
      Tick.pause();
    },

    isPaused: function () { return paused; },

    /** 供 backfill 中止（页面关闭等） */
    _abortBackfill: false,

    /* 单个 tick（测试与工具用） */
    step: step,
    advancePlaytime: advancePlaytime,
    /**
     * 重设帧计时基准。
     * 手动推进过时钟之后（调试面板的"快进"）必须调一次，
     * 否则主循环下一帧会看到"elapsed = 2 分钟"，
     * 于是又补跑一遍 tick，日志会重复一次。
     */
    noteFrame: function () {
      lastMs = Date.now();
      if (FS.app && FS.app.world) FS.app.world.lastRealMs = lastMs;
      return lastMs;
    },
    /** 冻结/解冻游玩时间轴（离线快进时冻结） */
    freezePlaytime: function (on) { playtimeFrozen = !!on; },
    isPlaytimeFrozen: function () { return playtimeFrozen; },
    stats: stats,
    pushLogs: pushLogs,
    shortEventText: shortEventText,
  };

  FS.define('core.tick', Tick);
})(window.FS);

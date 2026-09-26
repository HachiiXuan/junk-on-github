/* ==========================================================================
   backfill —— 开页 / 离线快进
   设计要点（见 docs/READMEv0.2.md §11）：
     · 走完全相同的 tick 代码路径，只是渲染静音 —— 历史状态与实时状态必然自洽
     · 快进期间不产生可见聊天刷屏：日志进环形缓冲、最后只留最近 200 行
     · 用"分钟级大步 + tick 级细步"混合推进，兼顾时间正确与性能
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }
  var Clock = FS.core.clock;

  var Backfill = {
    /**
     * 执行一次快进。
     * @param {object} world
     * @param {object} roster
     * @param {object} opts { elapsedMs, nowMs, onProgress }
     * @returns {object} { ticks, elapsedMs, skippedMs, ms }
     */
    run: function (world, roster, opts) {
      var C = CFG();
      opts = opts || {};
      var nowMs = opts.nowMs || Clock.now();
      var startMs = world.worldStartMs;
      var elapsed = opts.elapsedMs != null ? opts.elapsedMs : (nowMs - startMs);

      // 1. 上限保护
      if (elapsed > C.maxBackfillMs) elapsed = C.maxBackfillMs;

      // 2. 起步：对齐到整分钟（分钟级大步用）
      var floorToMin = Math.floor(startMs / C.minuteTickMs) * C.minuteTickMs;
      var cursor = Math.max(floorToMin, startMs);
      var target = startMs + elapsed;
      var t0 = Date.now();

      var tick = FS.core.tick;
      tick._abortBackfill = false;
      /* 离线期间冻结游玩时间轴：世界钟照走（天气/日夜/资源），
         但"下一个玩家何时上线"的节奏不因你不在而提前。 */
      var playBefore = world.realPlayMs || 0;
      tick.freezePlaytime(true);

      // 面板进入"只记录不刷新"模式
      FS.render.panel.beginHistory();

      var minutes = 0;
      var ticksRun = 0;

      /* --- 阶段一：整分钟大步 --- */
      while (cursor + C.minuteTickMs <= target && !tick._abortBackfill) {
        cursor += C.minuteTickMs;
        Clock.setNow(cursor);

        world.tick += 1;
        FS.state.world.syncTime(world, cursor);
        // 分钟级更新：天气 / 资源 / 事件冷却 / 加入调度
        var logs = FS.state.world.update(world, C.minuteTicks, cursor);
        if (logs.length) tick.pushLogs(logs, true);

        minutes++;
        if (opts.onProgress && minutes % 30 === 0) {
          opts.onProgress((cursor - startMs) / elapsed, 'minute');
        }
      }

      FS.state.world.syncRoster(world, roster);

      /* --- 阶段二：剩余不足一分钟的部分，按真实 tick 细步 --- */
      var remainderTicks = Math.floor((target - cursor) / C.tickMs);
      if (remainderTicks > 0) {
        ticksRun = tick.run(remainderTicks, function (done, total) {
          if (opts.onProgress) opts.onProgress(done / total, 'tick');
        });
      }

      /* 收尾：解冻游玩时间轴，并把时间对齐到"现在" */
      tick.freezePlaytime(false);
      world.realPlayMs = playBefore;
      Clock.setNow(target);
      FS.state.world.syncTime(world, target);
      FS.state.world.syncRoster(world, roster);

      var elapsedReal = Date.now() - t0;

      return {
        ticks: minutes * C.minuteTicks + ticksRun,
        minutes: minutes,
        elapsedMs: elapsed,
        skippedMs: Math.max(0, (nowMs - startMs) - elapsed),
        ms: elapsedReal,
      };
    },

    /**
     * 判断这次开页需要快进多少。
     * @returns {object} { needed, elapsedMs, totalMs }
     */
    plan: function (world, nowMs, lastSeenMs) {
      if (!lastSeenMs) {
        return { needed: false, elapsedMs: 0, totalMs: 0 };
      }
      var total = Math.max(0, nowMs - lastSeenMs);
      var capped = Math.min(total, CFG().maxBackfillMs);
      return {
        needed: capped >= CFG().minBackfillMs,
        elapsedMs: capped,
        totalMs: total,
      };
    },
  };

  FS.define('backfill', Backfill);
})(window.FS);

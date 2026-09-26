/* ==========================================================================
   core.clock —— 双时钟换算
   设计要点（见 docs/READMEv0.2.md §1 修订 1）：
     · 真实钟（×1）：在线时长等"人累了"的判断
     · 世界钟（1 游戏小时 = 2 真实分钟）：昼夜、天气、时段条件
   两者由 worldStartMs / startDay / startHour 推导，不做累加，避免漂移。

   时间源统一走这里的 now()：实时是 Date.now()，
   快进期间由 backfill 用 setNow() 推进，这样"回放出来的历史日志"
   时间戳是真的，而不是全部堆在同一毫秒。
   ========================================================================== */
(function (FS) {
  'use strict';

  // 注意：core.* 在 data/config.js 之前加载，所以不能在模块顶层缓存配置
  function CFG() { return FS.data.config; }

  var nowMs = null;          // null = 跟随真实时间

  var Clock = {
    /** 当前时间源（实时 or 快进注入） */
    now: function () {
      return nowMs === null ? Date.now() : nowMs;
    },

    /** 快进：把时间源设到某个时刻 */
    setNow: function (ms) {
      nowMs = ms;
    },

    /** 回到真实时间 */
    useRealTime: function () {
      nowMs = null;
    },

    /** 在当前时间轴上推进 N 真实毫秒（快进分段用，不会真的 sleep） */
    addRealMs: function (ms) {
      nowMs = Clock.now() + ms;
      return nowMs;
    },

    /** 是否处于快进时间轴 */
    isVirtual: function () {
      return nowMs !== null;
    },

    /**
     * 由真实时间推导世界时间。
     * @param {number} ms
     * @param {object} world 需要 world.worldStartMs / startDay / startHour
     * @param {number} [speedMul] 时间倍率（默认取 world.speedMul）
     */
    worldOf: function (ms, world, speedMul) {
      var c = CFG();
      var mul = speedMul != null ? speedMul : (world.speedMul || 1);
      var elapsedMs = Math.max(0, ms - world.worldStartMs);
      var gameMinutes = (elapsedMs / c.realMsPerGameHour) * 60 * mul;
      gameMinutes += (world.startDay - 1) * c.dayLengthGameHours * 60;
      gameMinutes += (world.startHour || c.worldEpochHour) * 60;

      var day = Math.floor(gameMinutes / (c.dayLengthGameHours * 60)) + 1;
      var minOfDay = gameMinutes - (day - 1) * c.dayLengthGameHours * 60;

      return {
        day: day,
        gameMinutes: gameMinutes,
        hour: Math.floor(minOfDay / 60),
        minute: Math.floor(minOfDay % 60),
        minuteOfDay: minOfDay,
      };
    },

    /** 'HH:MM' */
    hhmm: function (t) {
      return pad2(t.hour) + ':' + pad2(t.minute);
    },

    /** 白天 / 夜晚 */
    timeOfDay: function (t) {
      return (t.hour >= 7 && t.hour < 19) ? 'day' : 'night';
    },

    /**
     * 控制台时间戳（带加速显示）。
     * 为什么加速：真实世界里"玩了两小时"的服务器，日志时间戳只跳两分钟会显得很怪；
     * 这里按 clockScale 让时间戳以"1 真实秒 = 1 日志分钟"前进（跨天/小时都正确）。
     */
    logTime: function (ms) {
      var t = ms == null ? Clock.now() : ms;
      var base = (typeof FS.bootWallMinutes === 'number') ? FS.bootWallMinutes : 0;
      var advanced = ((t - FS.bootMs) / 1000) * CFG().clockScale;
      var total = base * 60 + advanced;                       // 秒
      var day = Math.floor(total / 86400);
      var secOfDay = ((Math.floor(total) % 86400) + 86400) % 86400;
      var h = Math.floor(secOfDay / 3600);
      var m = Math.floor((secOfDay % 3600) / 60);
      var s = secOfDay % 60;
      return {
        text: pad2(h) + ':' + pad2(m) + ':' + pad2(s),
        hhmm: pad2(h) + ':' + pad2(m),
        seconds: s,
        dayOffset: day,
      };
    },
  };

  function pad2(n) {
    n = Math.floor(n);
    return (n < 10 ? '0' : '') + n;
  }

  Clock.pad2 = pad2;

  FS.define('core.clock', Clock);
})(window.FS);

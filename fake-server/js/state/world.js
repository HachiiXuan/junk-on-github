/* ==========================================================================
   state.world —— 世界状态与更新
   ========================================================================== */
(function (FS) {
  'use strict';

  var CFG = FS.data.config;
  var RNG = FS.core.rng;
  var Clock = FS.core.clock;
  var Agents = FS.state.agent;

  /* 天气转移矩阵：从 current 出发，各天气的转移概率 */
  var WEATHER_MATRIX = {
    clear:   { clear: 0.62, rain: 0.26, thunder: 0.02, fog: 0.10 },
    rain:    { clear: 0.42, rain: 0.40, thunder: 0.13, fog: 0.05 },
    thunder: { clear: 0.30, rain: 0.55, thunder: 0.10, fog: 0.05 },
    fog:     { clear: 0.45, rain: 0.20, thunder: 0.03, fog: 0.32 },
  };

  var World = {
    /** 由 places 数据生成资源点 */
    buildResources: function () {
      var out = [];
      FS.data.places.list.forEach(function (p) {
        if (!p.resource) return;
        out.push({
          place: p.id,
          kind: p.resource,
          amount: RNG.int(20, 60),
          max: 60,
        });
      });
      return out;
    },

    /**
     * 创建世界。**永远是一场新世界** —— 不接收也不恢复任何存档状态。
     * 游戏内时间从第 1 天的 06:00 开始；离线期间"世界继续跑"是靠
     * backfill 按真实经过时间快进，而不是靠把旧世界存下来。
     * @param {number} nowMs
     */
    create: function (nowMs) {
      var worldStartMs = nowMs;
      var weather = Weather.random();

      var world = {
        mapName: CFG.mapName,
        tick: 0,
        speedMul: 1,

        worldStartMs: worldStartMs,
        startDay: 1,
        startHour: CFG.worldEpochHour,
        realPlayMs: 0,          // 累计真实游玩时间（加入调度的时间轴）
        joinCount: 0,
        longTailAnchorMs: 0,

        /* 当前世界时间（每 tick 由 clock 刷新） */
        time: { day: 1, hour: CFG.worldEpochHour, minute: 0, gameMinutes: 0, minuteOfDay: 0 },

        weather: weather,
        weatherLeftTicks: Weather.durationTicks(),

        online: [],          // 在线角色 id（有序）
        offline: [],

        resources: World.buildResources(),

        eventCooldown: {},   // { eventType: ticksLeft }
        globalMemory: [],    // 最近大事，上限 globalMemoryLimit

        pendingJoins: [],    // 待加入时刻（相对累计游玩时间的间隔）
        nextJoinAtMs: 0,

        /* 小团体 / 派系（v1.1）：见 state/faction.js。
           结构：{ id, name, chiefId, memberIds:[], createdTick, mood } */
        factions: [],
        nextFactionSeq: 1,

        tickRateWarned: false,
        lastDayNotified: 1,

        /* 底层噪音的时间基准。
           必须是**具体数字**，不能留 undefined ——
           undefined 会让 noise.quietFor() 返回一个巨大值，
           于是 backfill 的第一个 tick 就立刻吐一条环境噪音，
           而那条噪音会出现在"当前没有玩家在线"之前（用户看到的"左上角多一条消息"）。
           初始化成 0 = "刚开机，先安静 noiseQuietGapTicks 个 tick 再说"。 */
        lastOutputTick: 0,
        bootTick: 0,
      };

      // 由 clock 立即推导一次时间
      World.syncTime(world, nowMs);

      // 建立"角色加入"时间表（开局永远是空服务器）
      if (FS.state.joins) FS.state.joins.init(world, nowMs);

      return world;
    },

    /** 把 wall clock 的时间同步进 world.time */
    syncTime: function (world, nowMs) {
      world.time = Clock.worldOf(nowMs, world, world.speedMul);
      return world.time;
    },

    /**
     * 每 tick 的世界更新：天气倒计时、资源回复、事件冷却。
     * 返回本 tick 产生的日志条目数组（key/vars/level 形态）。
     */
    update: function (world, dtTicks, nowMs) {
      var logs = [];

      /* --- 昼夜切换 --- */
      var t = world.time;
      if (t.day !== world.lastDayNotified) {
        world.lastDayNotified = t.day;
        logs.push({ key: 'log.server.dayChange', vars: { n: t.day }, level: 'INFO', thread: 'server' });
      }

      /* --- 天气倒计时 --- */
      world.weatherLeftTicks -= dtTicks;
      if (world.weatherLeftTicks <= 0) {
        var next = Weather.next(world.weather);
        if (next !== world.weather) {
          world.weather = next;
          logs.push({
            key: 'log.server.weather',
            vars: { weather: { tx: 'weather', id: next } },
            level: 'INFO',
            thread: 'server',
          });
          World.pushGlobalMemory(world, {
            key: 'log.server.weather',
            vars: { weather: { tx: 'weather', id: next } },
            importance: 0.15,
          });
        }
        world.weatherLeftTicks = Weather.durationTicks();
      }

      /* --- 资源回复（按游戏小时折算，dtTicks 是 tick 数） --- */
      var gameHours = (dtTicks * CFG.tickMs) / CFG.realMsPerGameHour * world.speedMul;
      for (var i = 0; i < world.resources.length; i++) {
        var r = world.resources[i];
        if (r.amount < r.max) {
          r.amount = Math.min(r.max, r.amount + r.max * CFG.resourceRegenPerGameHour * gameHours);
        }
      }

      /* --- 事件冷却递减 --- */
      for (var ev in world.eventCooldown) {
        if (!Object.prototype.hasOwnProperty.call(world.eventCooldown, ev)) continue;
        if (world.eventCooldown[ev] > 0) world.eventCooldown[ev] -= dtTicks;
      }

      /* --- 角色加入调度 --- */
      if (FS.state.joins) {
        var joinLogs = FS.state.joins.run(world, FS.app.roster, nowMs);
        if (joinLogs.length) logs = logs.concat(joinLogs);
      }

      return logs;
    },

    /* ---------------- 全局记忆 ---------------- */

    pushGlobalMemory: function (world, entry) {
      world.globalMemory.push({
        key: entry.key,
        vars: entry.vars || {},
        importance: entry.importance != null ? entry.importance : 0.3,
        tick: world.tick,
        gameMinutes: world.time.gameMinutes,
      });
      if (world.globalMemory.length > CFG.globalMemoryLimit) {
        world.globalMemory.splice(0, world.globalMemory.length - CFG.globalMemoryLimit);
      }
      return world.globalMemory[world.globalMemory.length - 1];
    },

    /** 最近 N 游戏小时内是否发生过高重要性大事 */
    hasRecentBigEvent: function (world, gameHours) {
      var from = world.time.gameMinutes - gameHours * 60;
      for (var i = world.globalMemory.length - 1; i >= 0; i--) {
        var m = world.globalMemory[i];
        if (m.gameMinutes < from) break;
        if (m.importance >= 0.6) return true;
      }
      return false;
    },

    /** 冷却是否就绪 */
    cooldownReady: function (world, type) {
      return !(world.eventCooldown[type] > 0);
    },

    setCooldown: function (world, type, ticks) {
      world.eventCooldown[type] = ticks;
    },

    /** 资源点当前余量比例（0~1），用于决策里的 worldFit */
    resourceRatio: function (world, place) {
      for (var i = 0; i < world.resources.length; i++) {
        if (world.resources[i].place === place) {
          return world.resources[i].amount / world.resources[i].max;
        }
      }
      return 0.5;   // 没有资源点的地点视为中性
    },

    /** 在线人数 */
    onlineCount: function (world) {
      return world.online.length;
    },

    /** 在线名单变化后同步 world.online / offline 数组 */
    syncRoster: function (world, roster) {
      world.online = Agents.onlineIds(roster);
      world.offline = roster.list.filter(function (a) { return !a.state.online; })
        .map(function (a) { return a.id; });
      return world;
    },
  };

  /* ---------------- 天气 ---------------- */
  var Weather = {
    all: ['clear', 'rain', 'thunder', 'fog'],

    random: function () {
      return RNG.weighted([
        { id: 'clear', w: 0.55 },
        { id: 'rain', w: 0.25 },
        { id: 'thunder', w: 0.08 },
        { id: 'fog', w: 0.12 },
      ]).id;
    },

    next: function (current) {
      var row = WEATHER_MATRIX[current] || WEATHER_MATRIX.clear;
      var items = [];
      for (var k in row) {
        if (Object.prototype.hasOwnProperty.call(row, k)) items.push({ id: k, w: row[k] });
      }
      return RNG.weighted(items).id;
    },

    /** 当前天气还能持续多少 tick */
    durationTicks: function () {
      var hours = RNG.range(CFG.weatherSwitchGameHours[0], CFG.weatherSwitchGameHours[1]);
      return Math.round((hours * CFG.realMsPerGameHour) / CFG.tickMs);
    },
  };

  World.Weather = Weather;
  FS.define('state.world', World);
})(window.FS);

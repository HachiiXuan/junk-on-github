/* ==========================================================================
   state.noise —— 「底层噪音」(v1.0)
   ==========================================================================
   为什么需要它：一个真实服务器的控制台**从来不是安静的**。
   即使没有人说话，也会有
     · 环境日志：怪物刷新、天气变化、区块加载、服务器例行提示
     · 玩家动作日志：谁挖到了什么、谁做好了什么、谁被打死了
   只有聊天行的控制台一眼就看出是"为聊天而生的假页面"。
   本模块负责在**世界静默时**补上这些背景噪音。

   两条铁律（否则会从"真实"变成"刷屏"）：
     1. 环境噪音只在**确实安静**的时候出现（距上一条世界日志超过 quietGapTicks）
     2. 每条噪音都有独立概率，且总体频率远低于聊天

   噪音是纯文本 + 变量，所以中英切换后历史也能跟着变。
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }
  var RNG = FS.core.rng;
  var U = FS.core.util;
  var Agents = FS.state.agent;

  var Noise = {
    /**
     * 记录"刚刚有过输出"，用来判断世界是否安静。
     * tick.step 每次推送日志后都会调一次。
     */
    markActivity: function (world, tick) {
      if (!world) return;
      world.lastOutputTick = (tick != null) ? tick : world.tick;
    },

    /** 距上次输出过了多少 tick */
    quietFor: function (world) {
      if (!world || world.lastOutputTick == null) return 1e9;
      return world.tick - world.lastOutputTick;
    },

    /**
     * 是不是还在"刚开机"的头几分钟里。
     *
     * 为什么要这条：backfill（离线快进）会在几毫秒内跑完几分钟的世界时间，
     * 那些 tick 全都被判定为"很安静"，于是刚开机就会吐环境噪音 ——
     * 而正常游玩时这些噪音要等 10 秒安静才会出现。
     * 结果就是"一打开页面，控制台最上面多一条凭空的噪音"。
     */
    warmingUp: function (world) {
      var C = CFG();
      if (!world) return true;
      var since = world.tick - (world.bootTick || 0);
      return since < (C.noiseBootQuietTicks || 240);
    },

    /**
     * 每 tick 调一次：安静够久就可能有环境噪音。
     * @returns {Array} 日志条目（通常为空数组）
     */
    run: function (world, roster, silent) {
      var C = CFG();
      if (!C.noiseEnabled) return [];
      /* 刚开机 / 快进期间不出环境噪音 */
      if (Noise.warmingUp(world)) return [];

      var quiet = Noise.quietFor(world);
      if (quiet < (C.noiseQuietGapTicks || 40)) return [];

      /* 频率：安静越久越容易出现，但给一个上限概率，避免"憋久了必爆" */
      var p = Math.min(C.noiseMaxChancePerTick || 0.02,
        (quiet - C.noiseQuietGapTicks) * (C.noiseChancePerQuietTick || 0.0006));
      if (!RNG.chance(p)) return [];

      var online = Agents.online(roster);
      /* 去重：同一类噪音在冷却期内不再出现。
         没有这条，"水和岩浆在洞穴相遇了" 和 "水和岩浆在矿区相遇了"
         会在几分钟内连着冒出来 —— 读起来就是程序在凑字数。 */
      var cd = C.noiseRepeatCooldownTicks || 600;
      var lastAt = world._noiseLastAt || (world._noiseLastAt = {});
      var pool = Noise.kinds(online).filter(function (k) {
        var t = lastAt[k.id];
        return t == null || (world.tick - t) >= cd;
      });
      if (!pool.length) return [];

      var kind = RNG.weighted(pool).id;
      lastAt[kind] = world.tick;
      return Noise.emit(kind, world, roster, online, silent);
    },

    /**
     * 可用的噪音种类。
     * 有些噪音需要前提（比如"有人受伤"要有血不满的人），这里先过滤掉。
     */
    kinds: function (online) {
      var list = [
        { id: 'mobSpawn', w: 18 },
        { id: 'mobSound', w: 16 },
        { id: 'weatherShift', w: 12 },
        { id: 'chunkLoad', w: 10 },
        { id: 'serverTick', w: 8 },
        { id: 'waterLava', w: 7 },
        { id: 'plantsGrow', w: 7 },
        { id: 'oreRespawn', w: 6 },
        { id: 'villager', w: 5 },
        { id: 'falcon', w: 5 },
      ];
      /* 有人的血量不满 → 可以说是"某人受伤/恢复" */
      var hurt = online.filter(function (a) { return a.state.hp < 100; });
      if (hurt.length) list.push({ id: 'playerHurt', w: 10, agent: RNG.pick(hurt) });
      return list;
    },

    /** 生成一条噪音日志 */
    emit: function (kind, world, roster, online, silent) {
      var C = CFG();
      var logs = [];
      var places = (FS.data.places && FS.data.places.list) || [];
      var placeId = places.length ? RNG.pick(places).id : 'camp';
      var itemId = null;
      var itemList = (FS.data.items && FS.data.items.list) || [];
      if (itemList.length) itemId = RNG.pick(itemList).id;

      var entry = null;
      switch (kind) {
        case 'mobSpawn':
          entry = { key: 'log.noise.mobSpawn', vars: {
            threat: { tx: 'threat', id: Noise.pickThreat() },
            place: { tx: 'place', id: placeId },
          } };
          break;
        case 'mobSound':
          entry = { key: 'log.noise.mobSound', vars: {
            threat: { tx: 'threat', id: Noise.pickThreat() },
          } };
          break;
        case 'weatherShift':
          entry = { key: 'log.noise.weatherShift', vars: {
            weather: { tx: 'weather', id: RNG.pick(FS.state.world.Weather.all) },
          } };
          break;
        case 'chunkLoad':
          entry = { key: 'log.noise.chunkLoad', vars: {
            place: { tx: 'place', id: placeId },
          } };
          break;
        case 'serverTick':
          entry = { key: 'log.noise.serverTick', vars: {
            n: RNG.int(1200, 9800),
          } };
          break;
        case 'waterLava':
          entry = { key: 'log.noise.waterLava', vars: {
            place: { tx: 'place', id: placeId },
          } };
          break;
        case 'plantsGrow':
          entry = { key: 'log.noise.plantsGrow', vars: {
            place: { tx: 'place', id: placeId },
          } };
          break;
        case 'oreRespawn':
          entry = { key: 'log.noise.oreRespawn', vars: {
            item: itemId ? { tx: 'item', id: itemId } : null,
            place: { tx: 'place', id: placeId },
          } };
          break;
        case 'villager':
          entry = { key: 'log.noise.villager', vars: {
            place: { tx: 'place', id: placeId },
          } };
          break;
        case 'falcon':
          entry = { key: 'log.noise.falcon', vars: {} };
          break;
        case 'playerHurt': {
          var hurt2 = online.filter(function (a) { return a.state.hp < 100; });
          if (!hurt2.length) return [];          // 没人受伤就不该说这句
          var a = RNG.pick(hurt2);
          entry = { key: 'log.noise.playerHurt', vars: {
            name: { tx: 'name', id: a.id },
            hp: a.state.hp,
          } };
          break;
        }
        default:
          return [];
      }

      entry.level = 'INFO';
      entry.thread = 'server';
      logs.push(entry);
      Noise.markActivity(world, world.tick);
      return logs;
    },

    /**
     * 能出现在"怪物"语境里的威胁 —— 只取 kind 为 creature / player 的。
     *
     * 为什么必须过滤：威胁池里还有 `fall` / `dark` / `lava` / `traps` 这些**环境危害**，
     * 它们是用来描述"怎么死的"。不过滤就会生成
     *   「已生成 摔落 x1（河边）」「附近传来黑暗的动静」
     * 这种一看就是程序在拼字符串的东西。
     */
    creaturePool: function () {
      var list = (FS.data.threats && FS.data.threats.list) || [];
      var out = list.filter(function (t) {
        return t.kind === 'creature' || t.kind === 'player';
      });
      return out.length ? out : list;
    },

    pickThreat: function () {
      var pool = Noise.creaturePool();
      if (!pool.length) return 'boar';       // 兜底：数据没了也不至于崩
      /* 按 weight 抽，别让稀有的熊和野猪一样常见 */
      return RNG.weighted(pool).id;
    },

    /* ---------------- 玩家动作日志 ---------------- */

    /**
     * 采集/制作成功：真实服务器会打"谁获得了什么"。
     * 这类日志**不受安静条件限制**（它就是玩家动作），但每个人有节流，
     * 否则 32 个人一起挖矿会把控制台刷爆。
     */
    actionGain: function (agent, itemId, n, world, silent) {
      var C = CFG();
      if (!C.noiseActionLogs) return [];
      var every = C.noiseActionLogEvery || 3;      // 每 N 次才打一条
      agent._gainCount = (agent._gainCount || 0) + 1;
      if (agent._gainCount % every !== 0) return [];
      /* 每人每天的这类日志也有上限，超了就静默 */
      agent._gainLogged = (agent._gainLogged || 0) + 1;
      if (agent._gainLogged > (C.noiseActionLogPerAgentCap || 40)) return [];

      return [{
        key: 'log.action.gain',
        vars: {
          name: { tx: 'name', id: agent.id },
          n: n || 1,
          item: { tx: 'item', id: itemId },
        },
        level: 'INFO',
        thread: 'server',
        agentId: agent.id,
      }];
    },

    /** 交易/拾取/制作的通用"获得"日志 */
    actionGeneric: function (key, vars, agent, world) {
      var C = CFG();
      if (!C.noiseActionLogs) return [];
      var e = {
        key: key,
        vars: vars || {},
        level: 'INFO',
        thread: 'server',
      };
      if (agent) e.agentId = agent.id;
      Noise.markActivity(world, world.tick);
      return [e];
    },
  };

  FS.define('state.noise', Noise);
})(window.FS);

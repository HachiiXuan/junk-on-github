/* ==========================================================================
   state.joins —— 角色加入调度
   规则（见 docs/READMEv0.2.md §12 与决策 6/7）：
     · 开局永远是空服务器：0/32
     · 前几名角色在开局后很快陆续加入（具体数值见 config，支持调试节奏）
     · 之后间隔拉长 —— 用户盯半小时大概只见一两次进出
   实现要点：
     · 加入时刻挂在"累计真实游玩时间"（realPlayMs）上，不是墙上时钟。
       离线期间这个时间轴冻结，所以"你不在的时候没人来"，
       不会一打开就发现所有人都在线。
     · 世界本身不存档（见 persist/store.js 的说明）：每次打开都是新世界，
       离线时长通过 backfill 快进世界时间，而不是恢复旧世界状态。
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }
  var RNG = FS.core.rng;

  /* 调试模式（config.debugJoins）下一律用快节奏的数值：
     方便反复调参时不用等 1 分半才见到第 3 个人。 */
  function scheduleList(C) {
    return (C.debugJoins && C.joinScheduleMsDebug) ? C.joinScheduleMsDebug : C.joinScheduleMs;
  }
  function jitterRange(C) {
    return (C.debugJoins && C.joinJitterMsDebug) ? C.joinJitterMsDebug : C.joinJitterMs;
  }
  function minGap(C) {
    return (C.debugJoins && C.joinMinGapMsDebug) ? C.joinMinGapMsDebug : C.joinMinGapMs;
  }
  function longTail(C) {
    return (C.debugJoins && C.joinLongTailMsDebug) ? C.joinLongTailMsDebug : C.joinLongTailMs;
  }

  var Joins = {
    /**
     * 建立加入时间表（每次打开页面都是全新的一张表）。
     * pendingJoins 元素形如 { gap }，gap = 距离"当前累计游玩时间"的毫秒数。
     */
    init: function (world, nowMs) {
      var C = CFG();
      var list = scheduleList(C);
      var jit = jitterRange(C);
      var gapMs = minGap(C);

      world.joinCount = 0;
      world.longTailAnchorMs = 0;
      if (world.realPlayMs == null) world.realPlayMs = 0;
      world.pendingJoins = [];
      world.rejoins = [];          // 指名回归队列（离开的人各自的时间）

      for (var i = 0; i < list.length; i++) {
        world.pendingJoins.push({
          gap: list[i] + RNG.range(jit[0], jit[1]) + (i > 0 ? gapMs * i : 0),
        });
      }
      world.pendingJoins.sort(function (a, b) { return a.gap - b.gap; });
      world.nextJoinAtMs = (world.realPlayMs || 0)
        + (world.pendingJoins.length ? world.pendingJoins[0].gap : 0);
      return world.pendingJoins;
    },

    /**
     * 每 tick 检查是否有角色加入。
     * @returns {Array} 本 tick 产生的日志条目
     */
    run: function (world, roster, nowMs) {
      var C = CFG();
      var logs = [];
      var guard = 0;
      if (world.realPlayMs == null) world.realPlayMs = 0;
      if (!world.rejoins) world.rejoins = [];

      /* 硬上限：任何加入路径都不能把在线人数顶过 maxPlayers。
         顶栏写的是 0/32，那就必须真的是 32 上限 ——
         以前 rejoins 与常规调度各走各的，能一起把人塞到 34。 */
      var cap = C.maxPlayers || 32;
      function room() { return FS.state.agent.online(roster).length < cap; }

      /* 先处理"指名回归"（离开的人到点回来），再处理"随便来一个人" */
      var due = Joins.takeDueRejoins(world);
      /* 没位置时把到点的人放回队列，等有空位再说（而不是丢掉） */
      var requeue = [];
      for (var d = 0; d < due.length; d++) {
        var back = due[d] ? roster.byId[due[d]] : null;
        if (!back || back.state.online || back.state.permanentDeath) continue;
        if (!room()) { requeue.push({ agentId: due[d], atPlayMs: (world.realPlayMs || 0) + 1000 }); continue; }
        FS.state.agent.join(roster, back, nowMs);
        logs.push({
          key: 'log.server.join',
          vars: { name: { tx: 'name', id: back.id } },
          level: 'INFO',
          thread: 'server',
          agentId: back.id,
        });
      }
      if (requeue.length) {
        world.rejoins = (world.rejoins || []).concat(requeue);
      }

      while (world.nextJoinAtMs && world.realPlayMs >= world.nextJoinAtMs && guard < 8) {
        guard++;

        if (!room()) {
          /* 人满了：把下一次加入推到稍后，别把调度器停掉 ——
             有人离开之后还要继续放人进来。 */
          world.nextJoinAtMs = world.realPlayMs + (C.joinFullRetryMs || 30000);
          break;
        }

        var agent = pickJoiner(roster, world);
        if (!agent) {
          world.nextJoinAtMs = 0;          // 没有可加入的角色了，停掉调度
          break;
        }

        agent.joinReasonKey = (world.joinCount === 0) ? 'join.first' : 'join.back';
        FS.state.agent.join(roster, agent, nowMs);

        logs.push({
          key: world.joinCount === 0 ? 'log.server.joinFirst' : 'log.server.join',
          vars: { name: { tx: 'name', id: agent.id } },
          level: 'INFO',
          thread: 'server',
          agentId: agent.id,
        });

        FS.state.world.pushGlobalMemory(world, {
          key: 'log.server.join',
          vars: { name: { tx: 'name', id: agent.id } },
          importance: 0.2,
        });

        world.joinCount++;
        /* 放进来一个人 → 整张表前移他的间隔：
           存的是相对间隔，所以走掉的那一段要"吃掉"，剩下的才对齐当前时间轴。 */
        var used = world.pendingJoins.shift();
        for (var p = 0; p < world.pendingJoins.length; p++) {
          world.pendingJoins[p].gap -= used.gap;
        }
        world.nextJoinAtMs = Joins.computeNextAt(world);

        /* 每次放人进来之后都检查一次：如果剩下的时刻已经过期
           （典型场景：离线很久回来），立刻把它们摊到未来，
           这样本 tick 不会继续连放。 */
        normalizePending(world);
      }

      FS.state.world.syncRoster(world, roster);
      return logs;
    },

    /**
     * 下一次加入时刻（基于累计真实游玩时间）。
     * pendingJoins 里存的是**相对当前游玩时间的间隔** { gap }，所以这里做一次换算。
     * 用 { gap } 而不是裸数字，是为了避免"相对间隔"和"绝对时刻"混进同一个数组 ——
     * 那正是之前 rejoin 被提前触发的根因。
     */
    computeNextAt: function (world) {
      var C = CFG();
      var play = world.realPlayMs || 0;
      if (world.pendingJoins.length) return play + world.pendingJoins[0].gap;

      var lt = longTail(C);
      var anchor = Math.max(world.longTailAnchorMs || 0, play);
      var gap = RNG.range(lt[0], lt[1]);
      world.longTailAnchorMs = anchor + gap;
      return world.longTailAnchorMs;
    },

    /** 距离下一次加入还有多少真实毫秒（面板显示用） */
    msToNext: function (world) {
      if (!world.nextJoinAtMs) return -1;
      return Math.max(0, world.nextJoinAtMs - (world.realPlayMs || 0));
    },

    /** 排队中的加入（v0.2 用它做"下线后再上线"） */
    queue: function (world, agentId, atMs) {
      world.pendingJoins.push(atMs);
      world.pendingJoins.sort(function (a, b) { return a - b; });
      if (!world.nextJoinAtMs || atMs < world.nextJoinAtMs) world.nextJoinAtMs = atMs;
      return world.pendingJoins;
    },

    /**
     * 安排"某个人过一会儿再上线"（离开规则用）。
     * 时间基准是**累计游玩时间**：离线期间它冻结，
     * 所以"他 20 分钟后回来"是相对你观察的时间轴，而不是墙上时钟。
     *
     * ⚠️ 存的是**绝对到点时刻**（atPlayMs），不是"间隔"。
     * 以前这里存 gap（间隔），而 takeDueRejoins 拿它跟 realPlayMs
     * （一个不断累加的绝对值）比较 —— 于是只要这一局玩得够久
     * （realPlayMs > gap），**任何刚下线的人都会立刻被判成"到点了"**，
     * 表现就是用户看到的"说了我先下了，然后人没走 / 马上又回来"。
     *
     * 同时是**指名**的：普通加入是"随便来一个人"，
     * 这里是"张三过一会儿回来"。不指名的话，pickJoiner 会把他立刻拉回来。
     */
    scheduleRejoin: function (world, gapMs, agentId) {
      var play = world.realPlayMs || 0;
      var gap = Math.max(1000, gapMs);
      if (!world.rejoins) world.rejoins = [];
      world.rejoins.push({ agentId: agentId || null, atPlayMs: play + gap });
      return gap;
    },

    /** 某个角色是否还在"等自己的回归时间"（决策/加入调度都要看它） */
    rejoinPending: function (world, agentId) {
      if (!world.rejoins || !agentId) return false;
      for (var i = 0; i < world.rejoins.length; i++) {
        if (world.rejoins[i].agentId === agentId) return true;
      }
      return false;
    },

    /**
     * 检查有没有"该回来的人"到点了。
     * @returns {Array} 本轮回来的人（按到点顺序）
     */
    takeDueRejoins: function (world) {
      if (!world.rejoins || !world.rejoins.length) return [];
      var play = world.realPlayMs || 0;
      var due = [];
      var rest = [];
      for (var i = 0; i < world.rejoins.length; i++) {
        var r = world.rejoins[i];
        /* 兼容旧格式（只有 gap）：换算成绝对时刻，
           这样读老快照时的行为与新代码一致。 */
        if (r.atPlayMs == null) r.atPlayMs = play + (r.gap || 0);
        if (play >= r.atPlayMs) due.push(r.agentId);
        else rest.push(r);
      }
      world.rejoins = rest;
      return due;
    },

    /* ---------------- v0.2 预留：离开 ---------------- */
    /** 让角色离开（v0.2 接上下线理由与在线时长目标） */
    leave: function (world, roster, agent, reasonKey, silent) {
      FS.state.agent.leave(roster, agent);
      FS.state.world.syncRoster(world, roster);
      return [{
        key: 'log.server.leave',
        vars: { name: { tx: 'name', id: agent.id }, reason: reasonKey || null },
        level: 'INFO',
        thread: 'server',
        agentId: agent.id,
      }];
    },
  };

  /**
   * 把"已经过期"的待加入时刻重排到未来。
   * 场景：离线很久回来，存档里记的下一次加入时刻早就过去了 ——
   * 如果不重排，调度器会在同一个 tick 里把剩下的人全放上线。
   * 重排后保持原本的先后顺序，最小间隔取 joinCatchUpCapMs 的一半。
   */
  function normalizePending(world) {
    var C = CFG();
    if (!world.pendingJoins || !world.pendingJoins.length) return;
    var play = world.realPlayMs || 0;
    if (world.nextJoinAtMs > play) return;                 // 还没到期，正常

    var base = Math.round(C.joinCatchUpCapMs / 2);
    var t = base;                                          // 第一个人也至少等 base
    world.pendingJoins = world.pendingJoins.map(function (entry) {
      t += Math.max(entry.gap, base);
      return { gap: t };
    });
    world.nextJoinAtMs = play + world.pendingJoins[0].gap;
  }

  /** 挑一个离线角色加入：跳过"还在等自己回归时间"的人 */
  /**
   * 挑一个加入者。
   *
   * 关键：**必须随机**，不能按名册顺序取第一个离线的人 ——
   * 那样 32 个人会严格按列表顺序一个个上线（mumbles、toadstool、starvin…），
   * 一看就知道是数组在遍历，真实服务器里当然是谁先开游戏谁先进。
   *
   * 用**加权随机**而不是均匀随机，让"刚离开不久的人"回来的概率低一些，
   * 也更倾向于让"从来没上线过的人"先来（新玩家进服比老玩家回归更常见）。
   */
  function pickJoiner(roster, world) {
    var nowTick = world ? world.tick : 0;
    var cands = roster.list.filter(function (a) {
      if (a.state.online || a.state.permanentDeath) return false;
      if (world && world.rejoins) {
        for (var i = 0; i < world.rejoins.length; i++) {
          if (world.rejoins[i].agentId === a.id) return false;   // 他还没到回来的点
        }
      }
      return true;
    });
    if (!cands.length) return null;
    if (cands.length === 1) return cands[0];

    var scored = cands.map(function (a) {
      var w = 1;
      /* 从没上过线的人：权重高一些（新玩家进服比老玩家回归更常见）。
         用 cameBackCount 判断 —— onlineSinceMs 在离线时是 0，判断不出来。 */
      if (!a.cameBackCount) w *= 3;
      /* 刚下线不久的人：权重低一些（他刚说去吃饭，不会立刻回来） */
      if (a.lastLeaveTick != null) {
        var ago = nowTick - a.lastLeaveTick;
        if (ago < 10 * 60 * 4) w *= 0.25;      // 10 真实分钟内
        else if (ago < 30 * 60 * 4) w *= 0.6;  // 30 真实分钟内
      }
      return { a: a, w: w };
    });
    var picked = RNG.weighted(scored, function (c) { return c.w; });
    return picked ? picked.a : RNG.pick(cands);
  }

  FS.define('state.joins', Joins);
})(window.FS);

/* ==========================================================================
   state.leave —— 角色离开规则（v0.2）
   设计要点（见 docs/READMEv0.2spec.md §2）：
     · 不设硬门槛。玩满阈值之后，概率按 t² 缓慢抬升，
       把大部分概率压在后期 —— 观感就是"玩了很久的人偶尔会下线"。
     · 离开前一定有征兆：先告别（单句 或 farewell 话题有来有回），
       过几秒才真正退出。这样用户能看懂"他要走了"。
     · 退出时写记忆（在场的人记得他走了），之后按 rejoinDelay 再上线。
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }
  var RNG = FS.core.rng;
  var U = FS.core.util;
  var Agents = FS.state.agent;

  /** 离线阈值（debugLeave 用调试值） */
  function threshold(key) {
    var C = CFG();
    if (C.debugLeave) {
      var dk = key + 'Debug';
      if (C[dk] != null) return C[dk];
    }
    return C[key] != null ? C[key] : Infinity;
  }

  var Leave = {
    /**
     * 每 tick 的离开判定。返回本 tick 产生的日志条目。
     * 只在"已经玩够 logoutAfterMs"之后才开始掷骰，且概率随进度平方抬升。
     */
    roll: function (agent, world, roster, nowMs, silent) {
      if (agent.leaving) return null;                  // 已经在走流程
      if (FS.ai.dialogue && FS.ai.dialogue.isBusy(agent)) return null;

      var C = CFG();
      var played = Agents.onlineMs(agent, nowMs);
      var base = threshold('logoutAfterMs');
      if (played < base) return null;

      var ramp = threshold('leaveRampMs');
      var progress = U.clamp((played - base) / (ramp > 0 ? ramp : 1), 0, 1);
      var peak = Leave.peakChance();
      var p = peak * progress * progress;
      if (!RNG.chance(p)) return null;

      return Leave.begin(agent, world, roster, nowMs, silent);
    },

    /**
     * 离开方式（config.leaveModes）
     *   quit  正常退出：先告别（可能是一个 farewell 话题），过几秒再退出
     *   timeout 连接超时：**突发事件** —— 不打招呼、不告别，直接断线。
     *          角色不可能预告自己掉线，所以这条路径绝不能出告别台词。
     */
    pickMode: function () {
      var C = CFG();
      var modes = C.leaveModes || [{ id: 'quit', w: 8 }, { id: 'timeout', w: 2 }];
      return RNG.weighted(modes).id;
    },

    /** 峰值概率（debugLeave 时用调试值，否则永远看不到下线） */
    peakChance: function () {
      var C = CFG();
      if (C.debugLeave) {
        return C.leaveMaxChancePerTickDebug != null
          ? C.leaveMaxChancePerTickDebug
          : C.leaveMaxChancePerTick;
      }
      return C.leaveMaxChancePerTick;
    },

    /** 告别到退出的延时（同样支持调试值） */
    delayTicks: function () {
      var C = CFG();
      if (C.debugLeave && C.leaveDelayTicksDebug) return C.leaveDelayTicksDebug;
      return C.leaveDelayTicks;
    },

    /**
     * 开始离开流程。
     * 正常退出：先说一句（单句或 farewell 话题），leaveDelayTicks 之后真正退出。
     * 连接超时：直接退出，没有征兆 —— 用 leaveDelayTicks 的三分之一当"网络抖动"，
     *          让日志和最后一条聊天之间有一点空隙。
     * @returns {Array} 日志条目
     */
    begin: function (agent, world, roster, nowMs, silent, forceMode) {
      var mode = forceMode || Leave.pickMode();
      var C = CFG();
      /* nowMs 允许省略：默认取当前时钟。省得调用方传错参数顺序
         （调试期间就踩过一次，atMs 变成了"delay * tickMs"这种小数字）。 */
      if (typeof nowMs !== 'number' || !isFinite(nowMs)) {
        nowMs = FS.core.clock.now();
      }
      var d = Leave.delayTicks();
      var delay = mode === 'timeout'
        ? Math.max(4, Math.round(RNG.int(d[0], d[1]) / 3))
        : RNG.int(d[0], d[1]);

      /* 具体缘由：掉线用 timeout，其余从日常缘由里抽一个 */
      var reasonKey = mode === 'timeout'
        ? 'timeout'
        : RNG.pick(Leave.reasonKeys());

      agent.leaving = {
        mode: mode,
        reasonKey: reasonKey,
        atMs: nowMs + delay * C.tickMs,
        announced: false,
      };
      agent.leaveReasonKey = reasonKey;

      if (mode === 'timeout') {
        /* 突发事件：不告别。清掉正在打的字，避免"死后还在说话" */
        agent.typing = null;
        if (FS.ai.dialogue) FS.ai.dialogue.endByAgent(world, roster, agent, silent);
        return [];                       // 退出日志交给 finish 统一产出
      }

      return Leave.announce(agent, world, roster, silent, reasonKey);
    },

    /** 正常退出时可以说出口的缘由（掉线不算） */
    reasonKeys: function () {
      return ['eat', 'sleep', 'work', 'errand'];
    },

    /**
     * 这次离开要过多久才回来（真实毫秒）。
     * 按理由查表：吃饭 10 分钟、睡觉 30 分钟、上班 20 分钟、有事 8 分钟、
     * 掉线 6 分钟；没配的落到 rejoinDelayMs 兜底。
     */
    rejoinGapFor: function (reasonKey, mode) {
      var C = CFG();
      if (C.debugLeave && C.rejoinDelayMsDebug) {
        return RNG.range(C.rejoinDelayMsDebug[0], C.rejoinDelayMsDebug[1]);
      }
      var key = reasonKey || (mode === 'timeout' ? 'timeout' : null);
      var table = C.rejoinDelayByReason || {};
      var range = (key && table[key]) ? table[key] : C.rejoinDelayMs;
      return RNG.range(range[0], range[1]);
    },

    /**
     * 征兆：优先用 farewell 话题（有人在场、命中概率、且不在话题里），
     * 否则直接说一句告别台词。
     */
    announce: function (agent, world, roster, silent, reasonKey) {
      var C = CFG();
      var others = Agents.online(roster).filter(function (a) { return a.id !== agent.id; });
      var canTopic = others.length > 0
        && C.farewellTopicChance > 0
        && RNG.chance(C.farewellTopicChance)
        && FS.ai.dialogue
        && !FS.ai.dialogue.isBusy(agent);

      if (canTopic) {
        var inst = FS.ai.dialogue.start(agent, world, roster, silent, null, {
          topicId: 'farewell',
          vars: {
            reason: { tx: 'leaveReason', id: reasonKey },
            name: { tx: 'name', id: others[0].id },
          },
        });
        agent.leaving.byTopic = !!inst;
      }

      if (!agent.leaving.byTopic) {
        // 直接说一句（不进入对话链）
        var key = 'chat.leave.' + reasonKey;
        var text = FS.core.i18n.t(key);
        FS.state.agentUpdate.startTyping(agent, key, {}, text);
        agent.leaving.byText = true;
      }

      agent.leaving.announced = true;
      return [];
    },

    /** 到点了：真正退出 */
    finish: function (agent, world, roster, silent, nowMs) {
      var lv = agent.leaving || {};
      var mode = lv.mode || 'quit';
      var reasonKey = lv.reasonKey || null;
      var here = agent.state.place;

      /* 结掉他还在进行的对话，避免别人对着空气说话 */
      if (FS.ai.dialogue) FS.ai.dialogue.endByAgent(world, roster, agent, silent);

      Agents.leave(roster, agent);
      FS.state.world.syncRoster(world, roster);

      /* 系统只区分两类：正常退出 / 连接超时。
         具体去干什么了是角色自己在聊天里说的，服务器不可能知道。 */
      var logs = [];
      logs.push({
        key: mode === 'timeout' ? 'log.server.timeout' : 'log.server.leave',
        vars: { name: { tx: 'name', id: agent.id } },
        level: 'INFO',
        thread: 'server',
      });

      /* 在场的人记得他下线了（记忆里保留具体缘由，供之后聊天引用） */
      var witnesses = Agents.online(roster).filter(function (a) {
        return !a.leaving && a.state.place === here;
      });
      if (!witnesses.length) {
        witnesses = Agents.online(roster).slice(0, 1);
      }
      if (FS.state.memory) {
        for (var i = 0; i < witnesses.length; i++) {
          if (!RNG.chance(0.7)) continue;
          FS.state.memory.add(witnesses[i], {
            type: 'observe',
            actors: [agent.id],
            key: 'mem.left',
            vars: {
              name: { tx: 'name', id: agent.id },
              reason: { tx: 'leaveReason', id: reasonKey },
            },
            affect: -1,
            importance: 0.3,
          }, world);
        }
      }

      /* 排下一次上线：按离开理由决定"多久回来" ——
         去吃饭 10 分钟、去睡觉 30 分钟，这比统一一个区间真实得多。 */
      var gap = Leave.rejoinGapFor(reasonKey, mode);
      agent.lastLeaveTick = world.tick;      // 加入调度用它避免"刚走就又来"
      FS.state.joins.scheduleRejoin(world, gap, agent.id);

      /* ⚠️ 约定：只返回日志，由调用方（agentUpdate → tick）统一 push。
         这里曾经又 push 又 return，导致"某人退出了游戏"打两遍。 */
      return logs;
    },

    /** 每 tick 推进所有"正在走"的角色。返回本 tick 产生的日志。 */
    update: function (world, roster, silent, nowMs) {
      var list = roster.list;
      var logs = [];
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (!a.leaving || !a.state.online) continue;
        if (nowMs >= a.leaving.atMs) {
          var out = Leave.finish(a, world, roster, silent, nowMs);
          if (out && out.length) logs = logs.concat(out);
        }
      }
      return logs;
    },

    /** 这个角色是不是正在准备走（决策层用它压制新话题） */
    isLeaving: function (agent) {
      return !!(agent && agent.leaving);
    },
  };

  FS.define('state.leave', Leave);
})(window.FS);

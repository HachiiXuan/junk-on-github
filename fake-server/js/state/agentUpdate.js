/* ==========================================================================
   state.agentUpdate —— 每个在线角色的每 tick 更新
   对应 docs/READMEv0.2.md §5 的第 3 步：
     打字倒计时 → 挂机 → 等待回应 → 目标维护 → 决策 → 执行
   本文件只负责"调度与倒计时"，具体决策与动作在执行器里（js/ai/*）。
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }

  var AgentUpdate = {
    run: function (world, roster, silent, nowMs) {
      /* 离开流程（v0.2）：先说告别，到点真正退出 */
      if (FS.state.leave) {
        var leaveLogs = FS.state.leave.update(world, roster, silent, nowMs);
        if (leaveLogs && leaveLogs.length) FS.core.tick.pushLogs(leaveLogs, silent);
      }
      /* 复活倒计时（v0.3） */
      if (FS.state.death) {
        var deathLogs = FS.state.death.update(world, roster, silent, nowMs);
        if (deathLogs && deathLogs.length) FS.core.tick.pushLogs(deathLogs, silent);
      }

      var list = roster.list;
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (!a.state.online) continue;          // 离线：不消耗任何倒计时
        if (a.state.permanentDeath) continue;
        if (a.dead) continue;                   // 死了：等复活，不决策
        updateOne(world, roster, a, silent, nowMs);
      }
    },
  };

  function updateOne(world, roster, a, silent, nowMs) {
    var C = CFG();

    /* --- 冷却递减 --- */
    if (a.cooldown.topic > 0) a.cooldown.topic--;
    if (a.cooldown.move > 0) a.cooldown.move--;
    if (a.cooldown.fight > 0) a.cooldown.fight--;

    /* --- 3.2 打字倒计时：归零则输出消息 --- */
    if (a.typing) {
      a.typing.remainingTicks--;
      if (a.typing.remainingTicks <= 0) {
        finishTyping(world, roster, a, silent);
      }
      return;                                  // 打字时不做别的
    }

    /* --- 3.3 挂机 --- */
    if (a.idleTicks > 0) {
      a.idleTicks--;
      return;
    }

    /* --- 3.3b 决策间隔 ---
       真人不会每 250ms 就重新考虑一次人生。做完一件事之后停一会儿再想，
       这是"像人"最关键的一条：动作之间有呼吸，而不是每帧都在行动。 */
    if (a.decisionCooldown > 0) {
      a.decisionCooldown--;
      return;
    }

    /* --- 3.4 等待回应：耐心递减，归零则放弃 --- */
    if (a.dialogue.awaitingReply) {
      a.dialogue.patience--;
      if (a.dialogue.patience <= 0) {
        if (FS.ai && FS.ai.dialogue) FS.ai.dialogue.giveUp(world, roster, a, silent);
      }
    }

    /* --- 3.4b 展示用：他现在在等谁回话 ---
       决策层会在这段时间里压制"再开一场"，面板拿它解释"为什么没说话"。 */
    a.waitingOnId = (a.dialogue && a.dialogue.awaitingReply)
      ? (a.dialogue.partner || null) : null;

    /* --- 3.5 目标维护 --- */
    if (FS.state.goal) {
      FS.state.goal.maintain(a, world, roster, nowMs);
    }

    /* --- 3.5b 玩累了就准备下线（v0.2，概率按 t² 抬升） --- */
    if (FS.state.leave && !a.leaving) {
      FS.state.leave.roll(a, world, roster, nowMs, silent);
    }

    /* --- 3.6 决策 --- */
    var chosen = null;
    if (FS.ai && FS.ai.decision) {
      chosen = FS.ai.decision.choose(a, world, roster, nowMs);
    }

    /* --- 3.7 执行 --- */
    if (chosen && FS.ai && FS.ai.actions) {
      FS.ai.actions.execute(chosen, a, world, roster, silent, nowMs);
    }

    /* --- 3.7b 动作之后停一会儿 --- */
    rollDecisionCooldown(a, chosen ? chosen.actionId : 'wait');

    /* --- 3.8 挂机判定（执行动作后仍可能发呆） --- */
    rollIdle(a);
  }

  /* ---------------- 打字 ---------------- */

  /** 让角色开始"打字"，延时按文本长度与性格抖动（体感的关键） */
  function startTyping(a, key, vars, text) {
    var C = CFG();
    var chars = String(text || '').length;
    var per = C.typingMsPerChar;
    var base = C.typingBaseMs;
    // 话多的人打字更快（更像熟手）
    var speed = 1 - (a.personality.chatty - 0.5) * 0.25;
    var ms = chars * FS.core.rng.range(per[0], per[1]) * speed;
    ms += FS.core.rng.range(base[0], base[1]);
    ms += FS.core.rng.range(C.typingJitterMs[0], C.typingJitterMs[1]);
    ms = FS.core.util.clamp(ms, C.typingMinMs, C.typingMaxMs);

    a.typing = {
      key: key,
      vars: vars || {},
      text: text,
      totalTicks: Math.max(1, Math.round(ms / C.tickMs)),
      remainingTicks: Math.max(1, Math.round(ms / C.tickMs)),
      startedTick: null,
    };
    return a.typing;
  }

  /** 打字结束：把消息推给对话引擎或直接输出 */
  function finishTyping(world, roster, a, silent) {
    var t = a.typing;
    a.typing = null;
    if (!t) return;

    if (FS.ai && FS.ai.dialogue) {
      FS.ai.dialogue.onMessageReady(world, roster, a, t, silent);
      return;
    }
    // 对话引擎还没接上时的兜底：直接作为聊天行输出
    FS.core.tick.pushLogs([{
      key: t.key,
      vars: t.vars,
      level: 'CHAT',
      thread: 'chat',
      agentId: a.id,
    }], silent);
  }

  /* ---------------- 决策间隔 ---------------- */

  /** 动作执行完后的停顿：让行为有节奏，而不是每 tick 都在动 */
  function rollDecisionCooldown(a, actionId) {
    var C = CFG();
    var r;
    switch (actionId) {
      case 'wait': r = C.waitCooldownTicks; break;
      case 'move': r = C.moveActionCooldownTicks; break;
      case 'trade': r = C.tradeActionCooldownTicks; break;
      case 'gather': r = C.gatherActionCooldownTicks; break;
      case 'fight': r = C.fightActionCooldownTicks; break;
      default: r = C.actionCooldownTicks; break;
    }
    // 话多的人节奏更快一点
    var speed = 1 - (a.personality.chatty - 0.5) * 0.2;
    a.decisionCooldown = Math.max(1, Math.round(FS.core.rng.int(r[0], r[1]) * speed));
    return a.decisionCooldown;
  }

  /* ---------------- 挂机 ---------------- */

  function rollIdle(a) {
    var C = CFG();
    // 胆小/好奇低的人更容易长挂机（像在犹豫或走神）
    var longP = C.longIdleChancePerTick * (0.6 + (1 - a.personality.curious) * 0.8);
    if (FS.core.rng.chance(longP)) {
      a.idleTicks = FS.core.rng.int(C.longIdleTicks[0], C.longIdleTicks[1]);
      return;
    }
    var p = C.idleChancePerTick * (0.7 + (1 - a.personality.chatty) * 0.6);
    if (FS.core.rng.chance(p)) {
      a.idleTicks = FS.core.rng.int(C.idleTicks[0], C.idleTicks[1]);
    }
  }

  AgentUpdate.startTyping = startTyping;
  AgentUpdate.finishTyping = finishTyping;
  AgentUpdate.rollDecisionCooldown = rollDecisionCooldown;

  FS.define('state.agentUpdate', AgentUpdate);
})(window.FS);

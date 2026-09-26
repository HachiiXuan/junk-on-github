/* ==========================================================================
   ai.decision —— 候选动作生成 + 打分 + 加权随机
   修订说明（见 docs/READMEv0.2.md §6.2）：
     原需求的纯乘性模型（base × 性格 × 世界 × 好感 × 目标）有一个致命问题：
     任一维为 0 会让该动作永久不可选，而且调参无法预期。
     这里改为：score = base × 各维系数 × 疲劳 × (1 + 目标相关) + 情境加成，
     并加下限保护。每个因子都记录在 outcome.factors 里，面板可展开查看。
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }
  var RNG = FS.core.rng;
  var U = FS.core.util;
  var Agents = FS.state.agent;

  var Decision = {
    /**
     * 为一个角色选一个动作。
     * @returns {object|null} outcome { actionId, target, place, itemId, score, factors }
     */
    choose: function (agent, world, roster, nowMs) {
      var outcomes = Decision.candidates(agent, world, roster, nowMs);
      if (!outcomes.length) {
        agent._lastScores = [];
        return null;
      }

      /* 打分 */
      var total = 0;
      for (var i = 0; i < outcomes.length; i++) {
        Decision.score(outcomes[i], agent, world, roster);
        total += outcomes[i].score;
      }
      outcomes.sort(function (a, b) { return b.score - a.score; });
      agent._lastScores = outcomes.map(function (o) {
        return {
          actionId: o.actionId,
          target: o.target,
          score: o.score,
          factors: o.factors,
        };
      });
      /* 记下这次决策发生在哪个 tick。面板要显示"这是什么时候的分数" ——
         分数只在真正决策的那一刻算一次，而打字/挂机期间不决策，
         所以面板上的分数可能和"当前目标"对不上（那属于正常，但必须说清楚）。 */
      agent._lastDecisionTick = world ? world.tick : 0;
      agent._lastDecisionGoal = (FS.state.goal && FS.state.goal.top(agent))
        ? FS.state.goal.top(agent).id : null;

      /* 加权随机（不是 total 最大值，保留意外性） */
      if (total <= 0) return outcomes[0];
      var r = RNG.float() * total;
      var acc = 0;
      for (var j = 0; j < outcomes.length; j++) {
        acc += outcomes[j].score;
        if (r <= acc) return outcomes[j];
      }
      return outcomes[outcomes.length - 1];
    },

    /* ---------------- 候选生成 ---------------- */

    candidates: function (agent, world, roster, nowMs) {
      var C = CFG();
      var out = [];
      var top = FS.state.goal.top(agent);

      /* 正在等人回应：优先接话 —— 由对话引擎提供待回应信息 */
      if (FS.ai && FS.ai.dialogue) {
        var pending = FS.ai.dialogue.pendingReplyFor(agent);
        if (pending) {
          out.push({ actionId: 'reply', target: pending.partnerId, instanceId: pending.instanceId });
          return out;   // 有人跟你说话时不再考虑别的
        }
      }

      var others = Agents.othersAtPlace(roster, agent);
      var online = Agents.online(roster);

      /* 正在准备离开的人：不再发起新话题（避免刚说"我先下了"又开一个话题） */
      var leaving = FS.state.leave && FS.state.leave.isLeaving(agent);

      /* 说话（话题由 dialogue 挑选） */
      if (!leaving && online.length >= 2 && agent.cooldown.topic <= 0) {
        out.push({ actionId: 'speak', target: null });
      }

      /* 移动 */
      if (agent.cooldown.move <= 0) {
        var neighbors = FS.data.places.links[agent.state.place] || [];
        for (var i = 0; i < neighbors.length; i++) {
          out.push({ actionId: 'move', place: neighbors[i] });
        }
      }

      /* 交易：同地点有人，且自己不是完全没东西 */
      for (var j = 0; j < others.length; j++) {
        out.push({ actionId: 'trade', target: others[j].id });
      }

      /* 采集：当前地点有资源点 */
      var res = null;
      for (var k = 0; k < world.resources.length; k++) {
        if (world.resources[k].place === agent.state.place) { res = world.resources[k]; break; }
      }
      if (res && res.amount > 1) out.push({ actionId: 'gather', place: agent.state.place });

      /* 攻击：同地点且好感很低（或好战性格撑起来） */
      for (var m = 0; m < others.length; m++) {
        var aff = Decision.affection(agent, others[m].id);
        if (aff < 60 || agent.personality.belligerent > 0.6) {
          out.push({ actionId: 'fight', target: others[m].id });
        }
      }

      /* 等待永远可选（呼吸） */
      out.push({ actionId: 'wait' });

      /* 目标相关度标记 */
      if (top && top.def && top.def.actions) {
        for (var n = 0; n < out.length; n++) {
          out[n].goalRelated = top.def.actions.indexOf(out[n].actionId) !== -1;
          out[n].goalId = top.id;
        }
      }
      for (var q = 0; q < out.length; q++) {
        if (out[q].goalRelated === undefined) out[q].goalRelated = false;
      }
      return out;
    },

    /* ---------------- 落地期（新人刚上线） ---------------- */

    /**
     * 这个角色是不是"刚上线、还在看"。
     *
     * 用**游戏内分钟**而不是真实毫秒：真实毫秒只在浏览器里前进，
     * 快进/模拟里不动，会导致同一个开关在两种运行方式下行为不一致
     * （实测：模拟里新人一进来就交易，因为真实时间只过了 5 毫秒）。
     */
    settlingIn: function (agent, world) {
      var C = CFG();
      if (!agent || !agent.state.online) return false;
      var needMin = C.settleInGameMinutes;
      if (C.debugSettle) needMin = C.settleInGameMinutesDebug || needMin;
      if (!needMin || !world) return false;
      var bornAt = agent.onlineSinceGameMinute;
      if (bornAt == null) return false;         // 没记录：按"老玩家"处理，不拦
      return (world.time.gameMinutes - bornAt) < needMin;
    },

    /** 落地期里被禁止的动作（其余动作照常，让人看得出他在"观察"） */
    isSettledOut: function (agent, actionId, world) {
      if (!Decision.settlingIn(agent, world)) return false;
      var blocked = CFG().settleInBlocked || [];
      return blocked.indexOf(actionId) !== -1;
    },

    /**
     * 加入后的"响应延迟"内：连话都先不搭。
     * 用户要求 20~40 秒 —— 否则会出现"一进来就跟人聊起来"，很假。
     * 和 settlingIn 的区别：settlingIn 管"能不能主动交易"，
     * 这个管"能不能开口说话"（更短，但更早生效）。
     */
    stillWarmingUp: function (agent, world) {
      if (!agent || !agent.state.online || !world) return false;
      /* 测试/调试可以整体关掉这段延迟，方便构造"马上就聊"的场景 */
      if (CFG().debugNoWarmup) return false;
      if (agent.respondAfterGameMinute == null) return false;
      return world.time.gameMinutes < agent.respondAfterGameMinute;
    },

    /* ---------------- 打分 ---------------- */

    score: function (o, agent, world, roster) {
      var C = CFG();
      var base = C.baseWeight[o.actionId] != null ? C.baseWeight[o.actionId] : 0.3;

      var f = {};
      f.pers = Decision.personalityBias(o, agent);
      f.world = Decision.worldFit(o, agent, world, roster);
      f.rel = Decision.relationMul(o, agent, roster);
      f.goal = o.goalRelated ? 1.7 : 1.0;
      f.fatigue = Decision.fatigue(agent, o.actionId);
      f.bonus = Decision.situational(o, agent, world, roster);

      var score = base * (1 + f.pers) * (0.6 + 0.8 * f.world) * f.rel * f.goal * (1 - f.fatigue) + f.bonus;

      /* 刚上线的人不会立刻跑去交易：他还不知道谁有货 */
      if (Decision.isSettledOut(agent, o.actionId, world)) {
        f.settle = true;
        score *= 0.05;
      }

      score = Math.max(C.decision.minScore, score);

      o.base = base;
      o.factors = f;
      o.score = score;
      return score;
    },

    /** 性格倾向：-0.7 ~ +0.7 左右 */
    personalityBias: function (o, agent) {
      var p = agent.personality;
      var W = CFG().personalityWeight;
      var strength = W[o.actionId] != null ? W[o.actionId] : 0.5;
      var v = 0;
      switch (o.actionId) {
        case 'speak': v = (p.chatty - 0.5) * 2; break;
        case 'reply': v = (p.chatty - 0.5) * 1.4; break;
        case 'trade': v = (p.generous - 0.5) * 1.6; break;
        case 'move': v = (p.curious - 0.5) * 1.6; break;
        case 'gather': v = (p.curious - 0.5) * 1.0 + (p.generous - 0.5) * 0.6; break;
        case 'fight': v = (p.belligerent - 0.5) * 2 - p.timid * 1.2; break;
        case 'wait': v = -(p.curious - 0.5) * 1.2; break;
        default: v = 0;
      }
      return U.clamp(v * strength * 0.5, -0.75, 0.75);
    },

    /** 世界契合度 0~1：地点资源、天气、时段、生命 */
    worldFit: function (o, agent, world, roster) {
      var fit = 0.55;
      var t = world.time;
      var tod = FS.core.clock.timeOfDay(t);
      var C = CFG();

      if (o.actionId === 'gather') {
        fit = 0.2 + 0.8 * FS.state.world.resourceRatio(world, agent.state.place);
      } else if (o.actionId === 'move') {
        var danger = FS.data.places.dangerOf(o.place);
        // 好奇的人愿意冒险；胆小的人避开危险地点
        fit = U.clamp(0.85 - danger * (0.4 + agent.personality.timid), 0.15, 1);
        if (world.weather === 'thunder') fit *= 0.8;
        if (tod === 'night') fit *= 0.85;
        fit = U.clamp(fit, 0.1, 1);
      } else if (o.actionId === 'explore') {
        fit = tod === 'day' ? 0.9 : 0.4;
      } else if (o.actionId === 'wait') {
        // 没事可做时更容易发呆：人少、夜里、天气差
        fit = 0.5 + (roster.list.filter(function (a) { return a.state.online; }).length < 2 ? 0.3 : 0);
        if (tod === 'night') fit += 0.1;
        fit = U.clamp(fit, 0, 1);
      } else if (o.actionId === 'fight') {
        // 血量低时不想打
        fit = U.clamp(agent.state.hp / 100, 0.1, 1);
      }
      return U.clamp(fit, 0, 1);
    },

    /** 好感度对动作的影响 */
    relationMul: function (o, agent, roster) {
      if (!o.target) return 1;
      var aff = Decision.affection(agent, o.target);
      var level = Decision.affectionLevel(aff);

      if (o.actionId === 'fight') {
        // 好感越低越想打（0 好感 → 1.6）
        return U.clamp(1.7 - aff / 110, 0.15, 1.7);
      }
      switch (level) {
        case 'hate': return 0.2;
        case 'cold': return 0.6;
        case 'neutral': return 1.0;
        case 'friendly': return 1.3;
        case 'close': return 1.6;
        default: return 1.0;
      }
    },

    /** 连续做同类动作的疲劳（防止复读机） */
    fatigue: function (agent, actionId) {
      var C = CFG().decision;
      var recent = agent.stats.recentActions;
      var n = 0;
      var from = Math.max(0, recent.length - C.fatigueWindow);
      for (var i = from; i < recent.length; i++) {
        if (recent[i] === actionId) n++;
      }
      return U.clamp(n * (C.fatigueStrength / C.fatigueWindow), 0, 0.75);
    },

    /** 加性情境奖励：制造"突发感" */
    situational: function (o, agent, world, roster) {
      var C = CFG().decision;
      var bonus = 0;

      if (o.target) {
        var aff = Decision.affection(agent, o.target);
        if (aff < 60) bonus += C.bonusLowAffectionNearby;
      }
      if (o.actionId === 'fight' && agent.state.hp < 40) {
        bonus += C.bonusLowHpNearThreat;
      }
      if (agent._recentCommand) {
        bonus += C.bonusJustCommanded;
      }
      if (FS.state.world.hasRecentBigEvent(world, C.bigWorldEventWindowGameHours)
          && (o.actionId === 'speak' || o.actionId === 'reply')) {
        bonus += C.bonusBigWorldEventRecent;
      }
      return bonus;
    },

    /* ---------------- 关系 ---------------- */

    affection: function (agent, otherId) {
      var v = agent.affection[otherId];
      return v === undefined ? Agents.NEUTRAL_AFFECTION : v;
    },

    affectionLevel: function (aff) {
      if (aff < 40) return 'hate';
      if (aff < 80) return 'cold';
      if (aff <= 120) return 'neutral';
      if (aff <= 160) return 'friendly';
      return 'close';
    },
  };

  FS.define('ai.decision', Decision);
})(window.FS);

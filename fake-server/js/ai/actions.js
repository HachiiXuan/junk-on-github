/* ==========================================================================
   ai.actions —— 动作执行器
   每个动作返回 { ok, line? }，并负责：
     · 改状态（位置 / 背包 / 生命 / 好感）
     · 写记忆（语义键 + 变量）
     · 必要时产出日志行（服务器口吻）
   注意：说话类动作不在这里产生日志 —— 台词由 ai.dialogue 负责。
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }
  var RNG = FS.core.rng;
  var U = FS.core.util;
  var Agents = FS.state.agent;
  var Decision = FS.ai.decision;

  var Actions = {
    /** 执行选中的动作 */
    execute: function (o, agent, world, roster, silent, nowMs) {
      var result = null;
      switch (o.actionId) {
        case 'move':   result = Actions.move(o, agent, world, roster, silent); break;
        case 'speak':  result = Actions.speak(o, agent, world, roster, silent, nowMs); break;
        case 'reply':  result = Actions.reply(o, agent, world, roster, silent); break;
        case 'trade':  result = Actions.trade(o, agent, world, roster, silent); break;
        case 'gather': result = Actions.gather(o, agent, world, roster, silent); break;
        case 'fight':  result = Actions.fight(o, agent, world, roster, silent); break;
        case 'logout': result = Actions.logout(o, agent, world, roster, silent, nowMs); break;
        case 'wait':   result = Actions.wait(o, agent, world, roster, silent); break;
        default: break;
      }

      /* 记录动作历史（疲劳判定与面板统计用） */
      var recent = agent.stats.recentActions;
      recent.push(o.actionId);
      if (recent.length > 12) recent.shift();
      agent.stats.lastActionId = o.actionId;

      return result;
    },

    /* ---------------- 移动 ---------------- */
    move: function (o, agent, world, roster, silent) {
      var C = CFG();
      agent.state.place = o.place;
      agent.cooldown.move = RNG.int(C.moveCooldownTicks[0], C.moveCooldownTicks[1]);
      agent.stats.moves++;

      if (FS.state.memory) {
        FS.state.memory.add(agent, {
          type: 'observe',
          actors: [],
          key: 'mem.moved',
          vars: { place: { tx: 'place', id: o.place } },
          affect: 0,
          importance: 0.12,
        }, world);
      }
      /* 移动不写系统日志：真实服务器不会因为玩家走两步就打一行，
         而且"暂时没什么动静"这种填充行会让控制台显得假。 */
      return { ok: true };
    },

    /* ---------------- 发起话题 ---------------- */
    speak: function (o, agent, world, roster, silent, nowMs) {
      if (!FS.ai.dialogue) return { ok: false };
      var D = FS.ai.dialogue;
      if (D.isBusy(agent)) return { ok: false };

      /* 对话节奏约束（v0.4）：满足任一条件就不开新话题，
         否则会出现"同一人的两句话之间夹着别人的回应"，读起来像答非所问。 */
      var C = CFG();
      var reason = null;
      if (Decision.stillWarmingUp(agent, world)) reason = 'warming';
      else if (Decision.isSettledOut(agent, 'speak', world)) reason = 'settle';
      else if (D.topicCooldown(agent, world)) reason = 'cooldown';
      else if (D.activeCount() >= (C.maxActiveTopics || 3)) reason = 'globalCap';
      else if (D.topicCountFor(agent) >= (C.maxTopicsPerAgent || 1)) reason = 'agentCap';

      if (reason) {
        agent._lastSpeakBlocked = reason;    // 面板用它解释"为什么没说话"
        return { ok: false, blocked: reason };
      }
      agent._lastSpeakBlocked = null;

      /* 等回应期间也想插话：大部分时候拦住他，让他先把这场说完 */
      if (agent.dialogue && agent.dialogue.awaitingReply
          && RNG.chance(C.denyTopicChanceWhileBusy || 0.85)) {
        agent._lastSpeakBlocked = 'awaiting';
        return { ok: false, blocked: 'awaiting' };
      }

      var started = D.start(agent, world, roster, silent, nowMs);
      return { ok: started };
    },

    /* ---------------- 接话 ---------------- */
    reply: function (o, agent, world, roster, silent) {
      // 真正的输出由对话引擎在打字结束后完成；这里只标记"决定回应"
      return { ok: true };
    },

    /* ---------------- 交易 ---------------- */
    trade: function (o, agent, world, roster, silent) {
      var partner = roster.byId[o.target];
      if (!partner || !partner.state.online) return { ok: false };

      var wantId = RNG.pick(FS.data.items.list).id;
      var aff = Decision.affection(agent, partner.id);
      var give = RNG.pick(FS.data.items.list).id;

      /* 愿意给的前提：有货 + 不是仇恨关系 */
      var partnerHas = (partner.inventory[wantId] || 0) > 0;
      var willing = partnerHas && aff >= 80 && RNG.chance(0.35 + partner.personality.generous * 0.5);

      var logs = [];

      if (willing) {
        partner.inventory[wantId] -= 1;
        if (partner.inventory[wantId] <= 0) delete partner.inventory[wantId];
        agent.inventory[wantId] = (agent.inventory[wantId] || 0) + 1;

        agent.affection[partner.id] = U.clamp(aff + 6, 0, 200);
        var back = Decision.affection(partner, agent.id);
        partner.affection[agent.id] = U.clamp(back + 3, 0, 200);
        agent.stats.trades++;
        partner.stats.trades++;

        if (FS.state.memory) {
          FS.state.memory.add(agent, {
            type: 'trade', actors: [partner.id], key: 'mem.tradeDone',
            vars: { name: { tx: 'name', id: partner.id }, item: { tx: 'item', id: wantId } },
            affect: 4, importance: 0.42,
          }, world);
          FS.state.memory.add(partner, {
            type: 'trade', actors: [agent.id], key: 'mem.tradeDone',
            vars: { name: { tx: 'name', id: agent.id }, item: { tx: 'item', id: wantId } },
            affect: 3, importance: 0.4,
          }, world);
        }

        logs.push({
          key: 'log.trade.done',
          vars: {
            from: { tx: 'name', id: agent.id },
            to: { tx: 'name', id: partner.id },
            item: { tx: 'item', id: wantId },
          },
          level: 'INFO',
          thread: 'server',
        });
      } else {
        partner.affection[agent.id] = U.clamp(Decision.affection(partner, agent.id) - 2, 0, 200);
        if (FS.state.memory) {
          FS.state.memory.add(partner, {
            type: 'trade', actors: [agent.id], key: 'mem.tradeRefused',
            vars: { name: { tx: 'name', id: agent.id } },
            affect: -2, importance: 0.22,
          }, world);
        }
      }

      if (logs.length) FS.core.tick.pushLogs(logs, silent);
      return { ok: true };
    },

    /* ---------------- 采集 ---------------- */
    gather: function (o, agent, world, roster, silent) {
      var res = null;
      for (var i = 0; i < world.resources.length; i++) {
        if (world.resources[i].place === agent.state.place) { res = world.resources[i]; break; }
      }
      if (!res || res.amount < 1) return { ok: false };

      var amount = RNG.int(1, 3);
      res.amount = Math.max(0, res.amount - amount);

      /* 资源点 kind 与物品表的对应（wood/ore/food/relic/crystal） */
      var itemId = Actions.resourceToItem(res.kind);
      if (itemId) {
        agent.inventory[itemId] = (agent.inventory[itemId] || 0) + amount;
      }
      agent.stats.gathered = (agent.stats.gathered || 0) + amount;

      /* 底层噪音：真实服务器会打"谁获得了什么"（有节流，不会刷屏） */
      if (itemId && FS.state.noise) {
        var gainLogs = FS.state.noise.actionGain(agent, itemId, amount, world, silent);
        if (gainLogs.length) FS.core.tick.pushLogs(gainLogs, silent);
      }
      return { ok: true };
    },

    /* ---------------- 战斗（v0.3：可能致命） ---------------- */
    fight: function (o, agent, world, roster, silent) {
      var partner = roster.byId[o.target];
      if (!partner || !partner.state.online || partner.dead) return { ok: false };
      var C = CFG();

      var dmg = RNG.int(4, 14);
      var back = RNG.int(2, 9);

      agent.affection[partner.id] = U.clamp(Decision.affection(agent, partner.id) - 25, 0, 200);
      partner.affection[agent.id] = U.clamp(Decision.affection(partner, agent.id) - 30, 0, 200);

      if (FS.state.memory) {
        FS.state.memory.add(partner, {
          type: 'fight', actors: [agent.id], key: 'mem.hurt',
          vars: { place: { tx: 'place', id: partner.state.place } },
          affect: -12, importance: 0.7,
        }, world);
        FS.state.memory.add(agent, {
          type: 'fight', actors: [partner.id], key: 'mem.hurt',
          vars: { place: { tx: 'place', id: partner.state.place } },
          affect: -6, importance: 0.5,
        }, world);
      }
      agent.cooldown.fight = RNG.int(200, 600);

      /* 小团体连带情绪：打了人家一伙里的一个，整伙人一起记恨 */
      if (FS.state.faction) {
        FS.state.faction.onMemberHurt(world, roster, partner, agent.id,
          CFG().factionGrudgeAmount, 'mem.factionGrudge');
      }

      /* 致命一击：小概率直接打到 0，走死亡流程（否则只掉血） */
      if (FS.state.death && RNG.chance(C.deathChancePerFight)) {
        FS.state.death.damage(partner, partner.state.hp, agent.id, world, roster, silent, 'pvp');
        return { ok: true, killed: true };
      }

      partner.state.hp = U.clamp(partner.state.hp - dmg, 1, 100);
      agent.state.hp = U.clamp(agent.state.hp - back, 1, 100);
      return { ok: true };
    },

    /* ---------------- 下线（v0.2） ---------------- */
    logout: function (o, agent, world, roster, silent, nowMs) {
      if (!FS.state.leave) return { ok: false };
      if (agent.leaving) return { ok: true };
      FS.state.leave.begin(agent, world, roster, nowMs, silent);
      return { ok: true };
    },

    /* ---------------- 等待 ---------------- */
    wait: function (o, agent, world, roster, silent) {
      // 什么都不做也是一种行为：让世界有呼吸感
      if (agent.state.hp < 100 && RNG.chance(0.25)) {
        agent.state.hp = U.clamp(agent.state.hp + RNG.int(1, 3), 0, 100);
      }
      return { ok: true };
    },

    /** 资源点类型 → 物品 id */
    resourceToItem: function (kind) {
      var map = {
        wood: 'wood',
        ore: 'iron',
        food: 'food',
        relic: 'relic',
        crystal: 'potion',
      };
      return map[kind] || null;
    },
  };

  FS.define('ai.actions', Actions);
})(window.FS);

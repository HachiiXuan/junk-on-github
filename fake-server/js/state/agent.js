/* ==========================================================================
   state.agent —— 角色状态与构造
   设计要点：affection / memory 都是"稀疏"的 —— 只给有过互动的对象建条目，
   读不到时返回默认值（好感 100 = 不认识），而不是给所有人预先建 100。
   ========================================================================== */
(function (FS) {
  'use strict';

  var RNG = FS.core.rng;

  var NEUTRAL_AFFECTION = 100;

  /** 用一个数据定义创建 Agent 实例 */
  function createAgent(def, index) {
    return {
      id: def.id,
      name: def.name || def.id,
      nameKey: 'name.' + def.id,
      colorIndex: index,
      style: def.style || 'lowercase',
      /* 性格原型（social / loner / raider …）：只是给人看的标签，
         面板用它一眼说明"这人大概是什么路数"。 */
      archetype: def.archetype || null,

      personality: {
        chatty: num(def.personality && def.personality.chatty, 0.5),
        generous: num(def.personality && def.personality.generous, 0.5),
        timid: num(def.personality && def.personality.timid, 0.5),
        belligerent: num(def.personality && def.personality.belligerent, 0.5),
        curious: num(def.personality && def.personality.curious, 0.5),
      },

      state: {
        online: false,
        hp: 100,
        place: def.startPlace || 'camp',
        mood: 'calm',
        permanentDeath: false,
      },
      /* 死亡与复活（v0.3）：dead=true 期间不决策、不聊天，倒计时结束自动复活 */
      dead: false,
      respawnTicks: 0,
      deathCount: 0,

      /* 稀疏好感表：{ otherId: 0~200 } */
      affection: {},

      /* 记忆条目，见 state.memory */
      memory: [],

      /* 目标，最多 3 个，按 priority 降序 */
      goals: [],

      dialogue: {
        instanceId: null,
        role: null,
        partner: null,
        awaitingReply: false,
        patience: 0,
      },

      typing: null,       // { key, vars, remainingTicks, message, varsForText }
      idleTicks: 0,
      decisionCooldown: 0,
      cooldown: { topic: 0, move: 0, fight: 0, chat: 0 },

      inventory: {},      // { itemId: count }
      onlineSinceMs: 0,
      joinReasonKey: null,

      /* --- 离开相关（v0.2） --- */
      leaving: null,       // { reasonKey, atMs } 正在走的流程；到点了真正退出
      leaveReasonKey: null,
      cameBackCount: 0,    // 回来过几次（影响加入理由文案）
      factionId: null,     // 所属小团体（v1.1，见 state/faction.js）
      lastLeaveTick: null, // 上次离开的 tick（加入调度用它避免"刚走就回来"）

      /* --- 运行时统计：调试面板与疲劳判定用 --- */
      stats: {
        spoken: 0,
        moves: 0,
        trades: 0,
        topicsStarted: 0,
        lastActionId: null,
        recentActions: [],   // 最近若干次动作 id，用于疲劳惩罚
        lastTopicId: null,
        lastTopicTick: -99999,
      },
    };
  }

  function num(v, d) {
    return typeof v === 'number' && isFinite(v) ? v : d;
  }

  function initInventory(agent) {
    // 极简背包：给每人生成一点初始物资，够话题条件判断即可
    var items = FS.data.items.list;
    var n = RNG.int(2, 4);
    for (var i = 0; i < n; i++) {
      var it = RNG.pick(items);
      agent.inventory[it.id] = (agent.inventory[it.id] || 0) + RNG.int(1, 6);
    }
    if (!Object.keys(agent.inventory).length) agent.inventory.wood = 2;
    return agent;
  }

  var Agents = {
    NEUTRAL_AFFECTION: NEUTRAL_AFFECTION,

    /** 由 data.agents 建立全部角色（含离线角色） */
    createRoster: function (defs) {
      return defs.map(function (def, i) {
        var a = createAgent(def, i);
        initInventory(a);
        return a;
      });
    },

    get: function (roster, id) {
      return roster.byId[id];
    },

    byName: function (roster, name) {
      var lower = String(name || '').toLowerCase();
      var list = roster.list;
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === lower || String(list[i].name).toLowerCase() === lower) return list[i];
      }
      return null;
    },

    online: function (roster) {
      return roster.list.filter(function (a) { return a.state.online; });
    },

    onlineIds: function (roster) {
      return Agents.online(roster).map(function (a) { return a.id; });
    },

    atPlace: function (roster, place) {
      return Agents.online(roster).filter(function (a) { return a.state.place === place; });
    },

    othersAtPlace: function (roster, agent) {
      return Agents.atPlace(roster, agent.state.place).filter(function (a) {
        return a.id !== agent.id;
      });
    },

    /** 是否有该 kind 的物品 */
    hasItemKind: function (agent, kind) {
      var items = FS.data.items.byId;
      for (var id in agent.inventory) {
        if (!Object.prototype.hasOwnProperty.call(agent.inventory, id)) continue;
        if (agent.inventory[id] > 0 && items[id] && items[id].kind === kind) return true;
      }
      return false;
    },

    /** 背包里物品数量总和 */
    itemCount: function (agent) {
      var n = 0;
      for (var id in agent.inventory) {
        if (Object.prototype.hasOwnProperty.call(agent.inventory, id)) n += agent.inventory[id] || 0;
      }
      return n;
    },

    /** 从背包里挑一个 kind 匹配的物品 id */
    pickItemOfKind: function (agent, kind) {
      var items = FS.data.items.byId;
      var candidates = [];
      for (var id in agent.inventory) {
        if (!Object.prototype.hasOwnProperty.call(agent.inventory, id)) continue;
        if (agent.inventory[id] > 0 && (!kind || (items[id] && items[id].kind === kind))) {
          candidates.push(id);
        }
      }
      return RNG.pick(candidates);
    },

    /** 让角色加入世界 */
    join: function (roster, agent, nowMs) {
      agent.state.online = true;
      agent.onlineSinceMs = nowMs;
      /* 记住"他是游戏内第几分钟上线的"。
         落地期判定用它（游戏内分钟），因为真实毫秒在模拟快进里根本不走，
         会让"新人不会立刻交易"这条规则在模拟里失效。 */
      var w = FS.app && FS.app.world;
      var gameMin = (w && w.time) ? w.time.gameMinutes : 0;
      agent.onlineSinceGameMinute = gameMin;

      /* 加入后的"响应延迟"：20~40 秒内不主动搭话、不接话。
         真人刚进服务器也是先看一圈，不会一上线就跟人聊起来。
         用**游戏内分钟**表达（真实毫秒在快进里不走）：
         20~40 真实秒 = 10~20 游戏分钟。 */
      var C0 = FS.data.config;
      var delay = C0.debugJoins
        ? (C0.joinRespondDelayMsDebug || [2000, 5000])
        : (C0.joinRespondDelayMs || [20000, 40000]);
      var ms = RNG.range(delay[0], delay[1]);
      var gameMinDelay = (ms / C0.realMsPerGameHour) * 60;
      agent.respondAfterGameMinute = gameMin + gameMinDelay;

      agent.topicCooldownUntilTick = 0;
      agent._lastSpeakBlocked = null;
      /* 小团体是跨会话的（离线再回来还在同一伙人里），
         所以 join 不重置 factionId；解散由 faction.evaluate 处理。 */
      agent.goals = [];            // 重新规划
      agent.idleTicks = 0;
      agent.decisionCooldown = 0;
      agent.leaving = null;
      agent.dialogue = {
        instanceId: null, role: null, partner: null,
        awaitingReply: false, patience: 0,
      };
    },

    /** 让角色离开世界（v0.2） */
    leave: function (roster, agent) {
      var hadSession = agent.onlineSinceMs > 0;
      agent.state.online = false;
      agent.onlineSinceMs = 0;
      agent.typing = null;
      agent.idleTicks = 0;
      agent.decisionCooldown = 0;
      agent.leaving = null;
      agent.goals = [];
      agent.cameBackCount = hadSession ? (agent.cameBackCount || 0) + 1 : (agent.cameBackCount || 0);
      agent.dialogue = {
        instanceId: null, role: null, partner: null,
        awaitingReply: false, patience: 0,
      };
    },

    /** 在线时长（真实毫秒） */
    onlineMs: function (agent, nowMs) {
      if (!agent.state.online || !agent.onlineSinceMs) return 0;
      return Math.max(0, nowMs - agent.onlineSinceMs);
    },

    create: initInventory,
  };

  FS.define('state.agent', Agents);
})(window.FS);

/* ==========================================================================
   state.goal —— 目标系统
   规则（见 docs/READMEv0.2.md §9）：
     · 同时最多 3 个目标，按 priority 降序（数字大 = 越紧急）
     · 过期即移除；被关键目标激活时（interrupt）可以打断当前计划
     · 每 tick 有小概率"想到一个新目标"，避免同时换目标显得抽风
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }
  var RNG = FS.core.rng;

  var MAX_GOALS = 3;
  var NEW_GOAL_CHANCE = 0.03;      // 每 tick 想到新目标的概率（约 8 秒一次尝试）

  /** 取"玩累了"的阈值，debugLeave 时用调试值 */
  function leaveThreshold(key) {
    var C = CFG();
    if (C.debugLeave) {
      var dk = key + 'Debug';
      if (C[dk] != null) return C[dk];
    }
    return C[key] != null ? C[key] : Infinity;
  }

  var Goal = {
    /** 每 tick 维护：过期 → 排序 → 补充 */
    maintain: function (agent, world, roster, nowMs) {
      var i;

      /* 1. 移除过期与已完成 */
      agent.goals = agent.goals.filter(function (g) {
        if (g.done) return false;
        if (world.tick >= g.expiresAtTick) return false;
        return true;
      });

      /* 2. 排序 */
      agent.goals.sort(function (a, b) { return b.priority - a.priority; });

      /* 3. 补充新目标 */
      if (agent.goals.length < MAX_GOALS && RNG.chance(NEW_GOAL_CHANCE)) {
        var pick = Goal.pickNew(agent, world, roster);
        if (pick) agent.goals.push(pick);
      }

      return agent.goals;
    },

    /** 当前最重要的目标（列表已排序） */
    top: function (agent) {
      return agent.goals.length ? agent.goals[0] : null;
    },

    /** 完成某个目标 */
    complete: function (agent, goal, world) {
      if (!goal) return;
      goal.done = true;
      agent.goals = agent.goals.filter(function (g) { return g !== goal; });
    },

    /**
     * 从目标池里挑一个可用目标。
     * 触发条件满足的权重会显著提高（例如血量低时"保命"几乎必出）。
     */
    pickNew: function (agent, world, roster) {
      var online = FS.state.agent.online(roster);
      var pool = FS.data.goals.list;
      var candidates = [];

      for (var i = 0; i < pool.length; i++) {
        var def = pool[i];
        if (!Goal.triggerOk(def, agent, world, online, roster)) continue;
        if (Goal.alreadyHas(agent, def.id)) continue;
        candidates.push({ def: def, weight: def.weight });
      }
      if (!candidates.length) return null;

      var chosen = RNG.weighted(candidates, function (c) { return c.weight; });
      return Goal.instantiate(chosen.def, agent, world, roster);
    },

    /** 触发条件判断 */
    triggerOk: function (def, agent, world, online, roster) {
      var req = def.require || {};
      var trg = def.trigger || {};

      if (req.minOnline != null && online.length < req.minOnline) return false;
      if (trg.hpBelow != null && agent.state.hp >= trg.hpBelow) return false;
      if (trg.hpAbove != null && agent.state.hp <= trg.hpAbove) return false;
      if (trg.mood && agent.state.mood !== trg.mood) return false;
      if (trg.memoryType) {
        if (!FS.state.memory || !FS.state.memory.recalls(agent, trg.memoryType)) return false;
      }
      /* playAboveMs：本次在线时长超过 config 里某个阈值（"玩累了"）
         例如 'eatAfterMs' / 'logoutAfterMs'。支持调试倍率（debugLeave）。 */
      if (trg.playAboveMs) {
        var need = leaveThreshold(trg.playAboveMs);
        var played = FS.state.agent.onlineMs(agent, FS.core.clock.now());
        if (played < need) return false;
      }
      // 触发型目标若没写 trigger 条件，视为普通目标
      return true;
    },

    alreadyHas: function (agent, goalId) {
      for (var i = 0; i < agent.goals.length; i++) {
        if (agent.goals[i].id === goalId) return true;
      }
      return false;
    },

    /** 生成目标实例（带上具体对象，如要交易的物品、要去的地点） */
    instantiate: function (def, agent, world, roster) {
      var d = def.durationTicks;
      var ttl = d ? RNG.int(d[0], d[1]) : 1200;
      var goal = {
        id: def.id,
        priority: def.priority,
        def: def,
        startedAtTick: world.tick,
        expiresAtTick: world.tick + ttl,
        params: {},
      };

      /* 为目标找点具体内容，让行为不像随机游走 */
      if (def.id === 'trade') {
        var me = FS.state.agent.pickItemOfKind(agent, null);
        var want = RNG.pick(FS.data.items.list).id;
        goal.params.itemId = me || want;
        goal.params.wantId = want;
      } else if (def.id === 'explore' || def.id === 'teamup') {
        goal.params.place = RNG.pick(FS.data.places.list).id;
      } else if (def.id === 'survive') {
        goal.params.place = 'camp';
      }
      return goal;
    },

    /** 调试面板用：目标的可读摘要 */
    describe: function (goal) {
      if (!goal) return '';
      var s = FS.core.i18n.tx('goal', goal.id);
      if (goal.params.place) s += ' \u2192 ' + FS.core.i18n.tx('place', goal.params.place);
      if (goal.params.itemId) s += ' (' + FS.core.i18n.tx('item', goal.params.itemId) + ')';
      return s;
    },
  };

  Goal.MAX_GOALS = MAX_GOALS;
  FS.define('state.goal', Goal);
})(window.FS);

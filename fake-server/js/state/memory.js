/* ==========================================================================
   state.memory —— 记忆条目
   修订说明（见 docs/READMEv0.2.md §1 修订 3）：
     原需求写"删最旧且重要性最低"，含义不明确，容易误删刚发生的重要记忆。
     这里改为 retention = importance × 0.5 ^ (ageGameHours / halfLife)。
   记忆里存的是语义键 + 变量，不是成句文本 —— 所以切语言也能正确重述。
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }

  var GAME_HOURS_PER_TICK = null;
  function gameHoursPerTick() {
    if (GAME_HOURS_PER_TICK === null) {
      var C = CFG();
      GAME_HOURS_PER_TICK = (C.tickMs / C.realMsPerGameHour);
    }
    return GAME_HOURS_PER_TICK;
  }

  var Memory = {
    /**
     * 写入一条记忆
     * @param {object} agent
     * @param {object} m { type, actors, key, vars, affect, importance }
     * @param {object} world
     */
    add: function (agent, m, world) {
      var entry = {
        id: FS.core.util.seq('m'),
        type: m.type || 'observe',
        actors: m.actors || [],
        key: m.key,
        vars: m.vars || {},
        affect: m.affect != null ? m.affect : 0,
        importance: FS.core.util.clamp(m.importance != null ? m.importance : 0.3, 0, 1),
        tick: world ? world.tick : 0,
        gameMinutes: world ? world.time.gameMinutes : 0,
      };
      agent.memory.push(entry);
      if (agent.memory.length > CFG().memoryLimit * 1.5) Memory.trim(agent, world);
      return entry;
    },

    /** 某个 agent 关于某人的记忆 */
    about: function (agent, actorId) {
      return agent.memory.filter(function (m) {
        return m.actors.indexOf(actorId) !== -1;
      });
    },

    /** 最近一次指定类型的记忆 */
    lastOfType: function (agent, type) {
      for (var i = agent.memory.length - 1; i >= 0; i--) {
        if (agent.memory[i].type === type) return agent.memory[i];
      }
      return null;
    },

    /** 是否记得某类事（可限定涉及者） */
    recalls: function (agent, type, actorId) {
      for (var i = agent.memory.length - 1; i >= 0; i--) {
        var m = agent.memory[i];
        if (m.type !== type) continue;
        if (!actorId || m.actors.indexOf(actorId) !== -1) return true;
      }
      return false;
    },

    /** 对某人的总体情感（用于心情与决策） */
    affectTowards: function (agent, actorId) {
      var sum = 0;
      var list = Memory.about(agent, actorId);
      for (var i = 0; i < list.length; i++) sum += list[i].affect;
      return sum;
    },

    /** retention = 重要性 × 时间衰减 */
    retention: function (m, world) {
      var C = CFG();
      var ageHours = Math.max(0, (world.time.gameMinutes - m.gameMinutes) / 60);
      var decay = Math.pow(0.5, ageHours / C.memoryHalfLifeGameHours);
      return m.importance * decay;
    },

    /** 裁剪到上限：删 retention 最低的 */
    trim: function (agent, world) {
      var limit = CFG().memoryLimit;
      if (agent.memory.length <= limit) return 0;
      var scored = agent.memory.map(function (m, i) {
        return { i: i, r: Memory.retention(m, world) };
      });
      scored.sort(function (a, b) { return a.r - b.r; });
      var removeCount = agent.memory.length - limit;
      var kill = {};
      for (var k = 0; k < removeCount; k++) kill[scored[k].i] = true;
      agent.memory = agent.memory.filter(function (m, i) { return !kill[i]; });
      return removeCount;
    },

    /** 每 N tick 对所有人做一次裁剪与心情收束 */
    sweep: function (roster, world) {
      for (var i = 0; i < roster.list.length; i++) {
        var a = roster.list[i];
        Memory.trim(a, world);
        Memory.updateMood(a, world);
      }
    },

    /**
     * 心情由最近记忆的情感总和决定（只影响行为倾向与面板显示）
     *   sum <= -6  → scared（如果胆小）否则 annoyed
     *   sum >= +6  → excited
     *   否则 calm
     */
    updateMood: function (agent, world) {
      var recent = agent.memory.slice(-8);
      var sum = 0;
      for (var i = 0; i < recent.length; i++) sum += recent[i].affect;

      var mood = 'calm';
      if (sum <= -6) mood = (agent.personality.timid > 0.55) ? 'scared' : 'annoyed';
      else if (sum >= 6) mood = 'excited';
      else if (sum <= -2) mood = 'annoyed';

      if (agent.state.mood !== mood) {
        agent.state.mood = mood;
      }
      return mood;
    },
  };

  FS.define('state.memory', Memory);
})(window.FS);

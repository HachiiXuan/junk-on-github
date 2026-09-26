/* ==========================================================================
   state.death —— 死亡、复活、永久死亡与"痕迹"（v0.3）
   规则（见 docs/READMEv0.3.md §2）：
     普通死亡
       · 生命归零 → 生成死亡事件（系统日志 + 在场者记忆）
       · respawnTicks 之后原地站起来，保留记忆
       · 对杀死自己的人好感 −30
     永久死亡
       · state.permanentDeath = true，从在线列表移除（不再上线）
       · 生成"痕迹"进入全局记忆：{ 名字, 死因, 死亡时间, 提及次数 }
       · 其他角色会提到他；提及次数累加，超过阈值变成"传说"
   痕迹与传说都只存语义键 + 变量，所以中英切换时历史文本也能跟着变。
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }
  var RNG = FS.core.rng;
  var U = FS.core.util;
  var Agents = FS.state.agent;

  var Death = {
    /** 复活倒计时区间（debugDeath 时用调试值；别忘了一并接上，否则调试开关是死的） */
    respawnRange: function () {
      var C = CFG();
      if (C.debugDeath && C.respawnTicksDebug) return C.respawnTicksDebug;
      return C.respawnTicks;
    },

    /**
     * 造成伤害。hp 归零时触发死亡。
     * @returns {Array} 本 tick 产生的日志条目
     */
    damage: function (target, amount, sourceId, world, roster, silent, causeKey) {
      if (!target || !target.state.online || target.dead) return [];
      target.state.hp = U.clamp(target.state.hp - amount, 0, 100);
      if (target.state.hp > 0) return [];
      return Death.kill(target, sourceId, world, roster, silent, causeKey);
    },

    /**
     * 让角色死亡。
     * @param {object} target
     * @param {string} sourceId  凶手 / 'console' / null（环境）
     * @param {boolean} [force]  true 时即使 target.dead 也重新走一遍
     *                          （kill 命令连续调用、或死亡状态卡住时用）
     */
    kill: function (target, sourceId, world, roster, silent, causeKey, force) {
      var C = CFG();
      if (target.dead && !force) return [];
      target.dead = true;
      target.state.hp = 0;
      target.deathCount = (target.deathCount || 0) + 1;

      /* 停下他正在做的事 */
      target.typing = null;
      target.idleTicks = 0;
      target.goals = [];
      if (FS.ai.dialogue) FS.ai.dialogue.endByAgent(world, roster, target, silent);

      var place = target.state.place;
      var killer = sourceId && sourceId !== 'console' ? roster.byId[sourceId] : null;
      var cause = causeKey || (sourceId === 'console' ? 'console' : (killer ? 'pvp' : 'env'));

      var logs = [];

      if (target.state.permanentDeath) {
        /* ---------- 永久死亡 ---------- */
        Agents.leave(roster, target);
        FS.state.world.syncRoster(world, roster);
        var trace = Death.addTrace(target, cause, world, roster, silent);
        if (trace && trace.logs && trace.logs.length) {
          logs = logs.concat(trace.logs);
        }

        logs.push({
          key: 'log.death.diedPermanent',
          vars: {
            name: { tx: 'name', id: target.id },
            place: { tx: 'place', id: place },
            cause: { tx: 'deathCause', id: cause },
          },
          level: 'ERROR',
          thread: 'server',
          agentId: target.id,
        });
      } else {
        /* ---------- 普通死亡：等待复活 ---------- */
        var range = Death.respawnRange();
        target.respawnTicks = RNG.int(range[0], range[1]);
        logs.push({
          key: 'log.death.died',
          vars: {
            name: { tx: 'name', id: target.id },
            place: { tx: 'place', id: place },
            cause: { tx: 'deathCause', id: cause },
          },
          level: 'WARN',
          thread: 'server',
          agentId: target.id,
        });
      }

      /* 被谁杀了 → 对凶手好感 −30，并记一条高重要性记忆 */
      if (killer) {
        var cur = FS.ai.decision.affection(target, killer.id);
        target.affection[killer.id] = U.clamp(cur - 30, 0, 200);
      }
      if (FS.state.memory) {
        FS.state.memory.add(target, {
          type: 'death',
          actors: sourceId ? [sourceId] : [],
          key: killer ? 'mem.killedBy' : 'mem.diedEnv',
          vars: {
            name: killer ? { tx: 'name', id: killer.id } : null,
            place: { tx: 'place', id: place },
            cause: { tx: 'deathCause', id: cause },
          },
          affect: -20,
          importance: 1,
        }, world);
      }

      /* 在场的人记得这件事（之后可能在对话里提起） */
      var witnesses = Agents.online(roster).filter(function (a) {
        return a.id !== target.id && !a.dead;
      });
      var noticed = 0;
      for (var i = 0; i < witnesses.length; i++) {
        if (!RNG.chance(0.8)) continue;
        noticed++;
        if (FS.state.memory) {
          FS.state.memory.add(witnesses[i], {
            type: 'death',
            actors: [target.id],
            key: 'mem.sawDeath',
            vars: {
              name: { tx: 'name', id: target.id },
              place: { tx: 'place', id: place },
              cause: { tx: 'deathCause', id: cause },
            },
            affect: -12,
            importance: 0.75,
          }, world);
        }
      }
      if (noticed) {
        logs.push({
          key: 'log.world.deathNoticed',
          vars: { name: { tx: 'name', id: target.id }, n: noticed },
          level: 'INFO',
          thread: 'server',
        });
      }

      /* 小团体连带情绪：谁动了我们的人，整伙人都会记恨（v1.1） */
      if (FS.state.faction) {
        var grudge = FS.state.faction.onMemberHurt(world, roster, target, sourceId,
          CFG().factionGrudgeAmount, 'mem.factionGrudge');
        if (grudge) {
          logs.push({
            key: 'log.faction.grudge',
            vars: {
              faction: { tx: 'faction', id: (FS.state.faction.of(world, target.id) || {}).id },
              name: { tx: 'name', id: target.id },
              n: grudge,
            },
            level: 'INFO',
            thread: 'server',
          });
        }
      }
      /* 护短：目击同伙被杀 → 挂"复仇"目标（复用 goal 系统） */
      if (FS.state.faction && !target.state.permanentDeath && sourceId) {
        FS.state.faction.onMemberKilled(world, roster, target, sourceId);
      }

      /* 全局记忆：最近发生的大事 */
      FS.state.world.pushGlobalMemory(world, {
        key: 'log.death.died',
        vars: {
          name: { tx: 'name', id: target.id },
          place: { tx: 'place', id: place },
          cause: { tx: 'deathCause', id: cause },
        },
        importance: 0.85,
      });

      /* ⚠️ 约定：本函数**只返回**日志条目，由调用方（bus → tick）统一 push。
         曾经这里自己 push 了一次、又把 logs 返回给调用方，于是同一条死亡日志
         被打了两遍（实测 buffer 里出现两条一模一样的死亡记录）。
         所有 state/* 模块统一：要么只返回、要么只 push，绝不两者都做。 */
      return logs;
    },

    /** 每 tick 推进复活倒计时。只返回日志，由 agentUpdate 统一 push。 */
    update: function (world, roster, silent, nowMs) {
      var list = roster.list;
      var logs = [];
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (!a.dead) continue;
        if (!a.state.online || a.state.permanentDeath) {
          /* 永久死亡 / 已离线：不该留一个倒计时在那儿 */
          a.dead = false;
          a.respawnTicks = 0;
          continue;
        }
        a.respawnTicks--;
        if (a.respawnTicks > 0) continue;

        a.dead = false;
        a.state.hp = CFG().respawnHp;
        a.respawnTicks = 0;
        logs.push({
          key: 'log.death.respawned',
          vars: { name: { tx: 'name', id: a.id }, place: { tx: 'place', id: a.state.place } },
          level: 'INFO',
          thread: 'server',
          agentId: a.id,
        });
      }
      return logs;
    },

    /* ---------------- 痕迹与传说 ---------------- */

    /**
     * 永久死亡后留下"痕迹"。痕迹存在 world.traces 里，并可被其他角色引用。
     */
    addTrace: function (agent, cause, world, roster, silent) {
      if (!world.traces) world.traces = [];
      var trace = {
        agentId: agent.id,
        nameKey: 'name.' + agent.id,
        cause: cause,
        place: agent.state.place,
        deathTick: world.tick,
        deathGameMinutes: world.time.gameMinutes,
        mentions: 0,          // 被提及次数
        legend: false,        // 提及超过阈值后变"传说"
      };
      world.traces.push(trace);

      /* 注意：pushGlobalMemory 挂在 state.world 上，不在 world 对象上 */
      FS.state.world.pushGlobalMemory(world, {
        key: 'log.world.traceLeft',
        vars: {
          name: { tx: 'name', id: agent.id },
          cause: { tx: 'deathCause', id: cause },
        },
        importance: 0.9,
      });

      /* 只收集日志，不自己 push（约定见 kill 的注释） */
      var traceLogs = [];
      if (!silent) {
        traceLogs.push({
          key: 'log.world.traceLeft',
          vars: {
            name: { tx: 'name', id: agent.id },
            cause: { tx: 'deathCause', id: cause },
          },
          level: 'ERROR',
          thread: 'server',
        });
      }
      trace.logs = traceLogs;
      return trace;
    },

    /** 谁能被提及：所有痕迹（传说优先） */
    traceCandidates: function (world) {
      if (!world.traces || !world.traces.length) return [];
      // 传说优先被提起，其次是提及次数多的
      return world.traces.slice().sort(function (a, b) {
        if (a.legend !== b.legend) return a.legend ? -1 : 1;
        return b.mentions - a.mentions;
      });
    },

    /** 随机挑一条痕迹（给对话用），没有则返回 null */
    randomTrace: function (world) {
      var list = Death.traceCandidates(world);
      if (!list.length) return null;
      // 前几条权重更高，让"传说"更容易被反复提起
      var pool = list.slice(0, 3);
      return RNG.pick(pool);
    },

    /**
     * 记一次提及。达到阈值就升级为"传说"。
     * @returns {object|null} 升级后的痕迹（若刚升级），否则 null。
     *   约定：日志挂在 `trace.pendingLogs` 上，由调用方 push（本函数不自己推送）。
     */
    mention: function (trace, world, roster, silent) {
      if (!trace) return null;
      trace.mentions++;
      var C = CFG();
      if (!trace.legend && trace.mentions >= C.legendMentions) {
        trace.legend = true;
        FS.state.world.pushGlobalMemory(world, {
          key: 'log.world.legend',
          vars: {
            name: { tx: 'name', id: trace.agentId },
            n: trace.mentions,
          },
          importance: 1,
        });
        trace.pendingLogs = [{
          key: 'log.world.legend',
          vars: { name: { tx: 'name', id: trace.agentId }, n: trace.mentions },
          level: 'SYSTEM',
          thread: 'server',
        }];
        return trace;
      }
      return null;
    },

    /** 取走并清空挂在痕迹上的待推送日志（调用方负责 push） */
    takePendingLogs: function (trace) {
      if (!trace || !trace.pendingLogs) return [];
      var out = trace.pendingLogs;
      trace.pendingLogs = null;
      return out;
    },
  };

  FS.define('state.death', Death);
})(window.FS);

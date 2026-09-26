/* ==========================================================================
   state.faction —— 小团体 / 派系（v1.1）
   ==========================================================================
   需求原文："角色之间会形成关系（好感度）、记忆、冲突、小团体。"

   好感度与记忆早就有了，但那只在**两个人之间**。这一版给它一个**实体**：
   一伙人。有了实体才有可能出现"我们"这种说法、才会互相护着、才会派系对立。

   --- 形成规则（不做"剧本"，让它自己长出来） ---
   每 factionEvalTicks 检查一次，对每个还没入伙的角色：
     1. 他对某个已有团体里**至少 2 人**有高好感（>= factionJoinAffection）
        → 加入那个团体
     2. 否则，如果他和另外**至少 1 人**互相高好感，且两人都没入伙
        → 一起成立一个新团体
   所以团体是"从真实关系里长出来的"，不是开局分配的。
   上限 factionMax 个，防止 32 个人裂成 20 个小圈子。

   --- 团体做了什么（不能只是标签） ---
     · 好感基线：同团成员之间有好感下限，不会因为一次冲突就翻脸
     · 连带情绪：谁打了我们的人，全体对那个人的好感都掉
     · 护短：目击同团成员被杀 → 生成"复仇"目标（复用已有 goal 系统）
     · 交易/组队偏好：同团的人优先被选为伙伴
     · 聊天用词：团体有名字，成员会提起它
     · 面板可见：能看出谁和谁是一伙的
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }
  var RNG = FS.core.rng;
  var U = FS.core.util;
  var Agents = FS.state.agent;

  var Faction = {
    /* ---------------- 查询 ---------------- */

    /** 角色所在的团体（没有返回 null） */
    of: function (world, agentId) {
      if (!world || !world.factions || !agentId) return null;
      for (var i = 0; i < world.factions.length; i++) {
        var f = world.factions[i];
        if (f.memberIds.indexOf(agentId) !== -1) return f;
      }
      return null;
    },

    /** 两个人是不是一伙的 */
    sameFaction: function (world, a, b) {
      if (!world || !a || !b || a === b) return false;
      var f = Faction.of(world, a);
      return !!(f && f.memberIds.indexOf(b) !== -1);
    },

    /** 团体成员（在线 + 离线都返回，调用方自己过滤） */
    members: function (world, faction, roster) {
      if (!faction) return [];
      return faction.memberIds.map(function (id) {
        return roster.byId[id];
      }).filter(Boolean);
    },

    /** 面板用：团体摘要 */
    summary: function (world) {
      if (!world || !world.factions) return [];
      return world.factions.map(function (f) {
        return { id: f.id, name: f.name, size: f.memberIds.length, chiefId: f.chiefId };
      });
    },

    /* ---------------- 形成与维护 ---------------- */

    /** 每 tick 调用；内部按 factionEvalTicks 节流 */
    update: function (world, roster, silent) {
      var C = CFG();
      if (!C.factionEnabled) return [];
      if (world.tick % (C.factionEvalTicks || 60) !== 0) return [];
      return Faction.evaluate(world, roster, silent);
    },

    /**
     * 重新评估团体构成。
     * @returns {Array} 日志条目（有人入伙/成立新团体时）
     */
    evaluate: function (world, roster, silent) {
      var C = CFG();
      if (!world.factions) world.factions = [];
      var logs = [];
      var maxF = C.factionMax || 6;

      /* 只考虑"玩过一会儿"的人：刚上线 5 秒的人不可能已经有小圈子 */
      var online = Agents.online(roster).filter(function (a) {
        if (!a.cameBackCount && a.onlineSinceMs && world.time.gameMinutes
            - (a.onlineSinceGameMinute || 0) < (C.factionMinTenureGameMinutes || 30)) {
          return false;
        }
        return true;
      });
      if (online.length < (C.factionMinSize || 3)) return [];

      /* 清掉人数不足的团体（人走了、永久死亡了） */
      world.factions = world.factions.filter(function (f) {
        f.memberIds = f.memberIds.filter(function (id) {
          var a = roster.byId[id];
          return a && !a.state.permanentDeath;
        });
        return f.memberIds.length >= (C.factionDissolveBelow || 2);
      });

      /* 1) 已有团体吸纳新人。
         ⚠️ 这一轮必须排在"建新团"**前面**，而且要跑两遍 ——
         否则两个刚互相认识的人会各自去建一个新团，
         结果是一堆 2 人小圈子，永远长不大（实测就是这样）。 */
      for (var pass = 0; pass < 2; pass++) {
        for (var i = 0; i < online.length; i++) {
          var a = online[i];
          if (Faction.of(world, a.id)) continue;
          var best = null;
          var bestScore = 0;
          for (var j = 0; j < world.factions.length; j++) {
            var f = world.factions[j];
            if (f.memberIds.length >= (C.factionMaxSize || 8)) continue;
            /* 越大越难进：一个已经 9 人的团体不该把剩下 20 个人全吸进来，
               否则世界只有"一伙人"，谈不上派系。
               每多一个人，门槛涨 factionJoinScalePerMember。 */
            var scale = (C.factionJoinScalePerMember || 9) * (f.memberIds.length - 1);
            var need = (C.factionJoinAffection || 108) + Math.max(0, scale);
            var close = 0;
            var sum = 0;
            for (var k = 0; k < f.memberIds.length; k++) {
              var aff = Faction.affection(a, f.memberIds[k]);
              sum += aff;
              if (aff >= need) close++;
            }
            /* 加入条件：跟团里至少 factionJoinNeeds 人达到该规模的门槛；
               单人大团则要求"几乎所有人都认可他" */
            var needCount = Math.min(C.factionJoinNeeds || 2, f.memberIds.length);
            var friendlyRatio = f.memberIds.length ? close / f.memberIds.length : 0;
            if (close < needCount && friendlyRatio < 0.7) continue;
            var score = close * 100 + sum;
            if (score > bestScore) { bestScore = score; best = f; }
          }
          if (best) {
            Faction.addMember(world, best, a, roster);
            logs.push(Faction.joinLog(best, a, false));
          }
        }
      }

      /* 2) 成立新团体。这里**故意难得多**：
         只有两个互相高度认可（p99 量级）、又确实没处可去的人才会自己拉一摊。
         太容易建团会让 factionMax 被一堆 2 人小组占满，之后没人再能入伙。 */
      var canFound = world.factions.length < maxF
        && world.time.gameMinutes >= (C.factionFoundAfterGameMinutes || 0);
      if (canFound) {
        for (var m = 0; m < online.length; m++) {
          var x = online[m];
          if (Faction.of(world, x.id)) continue;
          for (var n = m + 1; n < online.length; n++) {
            var y = online[n];
            if (Faction.of(world, y.id)) continue;
            var a1 = Faction.affection(x, y.id);
            var a2 = Faction.affection(y, x.id);
            if (a1 < (C.factionFoundAffection || 112)
                || a2 < (C.factionFoundAffection || 112)) continue;
            var nf = Faction.create(world, [x, y], roster);
            if (nf) {
              logs.push(Faction.joinLog(nf, x, true));
              logs.push(Faction.joinLog(nf, y, false));
            }
            break;
          }
          if (world.factions.length >= maxF) break;
        }
      }

      /* 3) 团体好感基线：同团的人不会互相太差 */
      Faction.applyAffinityFloor(world, roster);

      /* ⚠️ 约定：只返回日志，由 tick 统一 push（见 docs 的"日志约定守卫"）。
         这里曾经自己 push 了一次，被测试 7.13 当场抓住。 */
      return logs;
    },

    /** 对某人的好感（用 decide 的取值口径，缺省是中性值） */
    affection: function (agent, otherId) {
      if (FS.ai && FS.ai.decision) return FS.ai.decision.affection(agent, otherId);
      return (agent.affection && agent.affection[otherId]) || Agents.NEUTRAL_AFFECTION;
    },

    /** 创建一个团体 */
    create: function (world, members, roster) {
      if (!world.factions) world.factions = [];
      var seq = world.nextFactionSeq || 1;
      world.nextFactionSeq = seq + 1;
      var f = {
        id: 'f' + seq,
        name: Faction.makeName(world),
        nameKey: null,
        chiefId: members[0] ? members[0].id : null,
        memberIds: [],
        createdTick: world.tick,
        mood: 'calm',
      };
      world.factions.push(f);
      for (var i = 0; i < members.length; i++) {
        Faction.addMember(world, f, members[i], roster);
      }
      FS.state.world.pushGlobalMemory(world, {
        key: 'log.faction.founded',
        vars: { faction: { tx: 'faction', id: f.id }, n: f.memberIds.length },
        importance: 0.6,
      });
      return f;
    },

    addMember: function (world, faction, agent, roster) {
      if (!faction || !agent) return;
      if (faction.memberIds.indexOf(agent.id) === -1) faction.memberIds.push(agent.id);
      agent.factionId = faction.id;
      /* 入伙时把团体名字记进记忆，之后聊天里能提起 */
      if (FS.state.memory) {
        FS.state.memory.add(agent, {
          type: 'faction',
          actors: [],
          key: 'mem.joinedFaction',
          vars: { faction: { tx: 'faction', id: faction.id } },
          affect: 6,
          importance: 0.55,
        }, world);
      }
    },

    joinLog: function (faction, agent, isFounder) {
      return {
        key: isFounder ? 'log.faction.founded' : 'log.faction.joined',
        vars: {
          name: { tx: 'name', id: agent.id },
          faction: { tx: 'faction', id: faction.id },
          n: faction.memberIds.length,
        },
        level: 'INFO',
        thread: 'server',
        agentId: agent.id,
      };
    },

    /** 同团成员之间的好感下限：一次冲突不该让一伙人散架 */
    applyAffinityFloor: function (world, roster) {
      var C = CFG();
      var floor = C.factionAffinityFloor || 95;
      if (!wallowSafe(world)) return;
      for (var i = 0; i < world.factions.length; i++) {
        var f = world.factions[i];
        for (var j = 0; j < f.memberIds.length; j++) {
          var a = roster.byId[f.memberIds[j]];
          if (!a) continue;
          for (var k = 0; k < f.memberIds.length; k++) {
            if (j === k) continue;
            var id = f.memberIds[k];
            var cur = a.affection[id];
            if (cur == null || cur < floor) a.affection[id] = floor;
          }
        }
      }
    },

    /* ---------------- 连带情绪与护短 ---------------- */

    /**
     * 谁伤害了某个人，他的同伙也会记恨。
     * 由 state/death.js 与 ai/actions.fight 调用。
     */
    onMemberHurt: function (world, roster, victim, attackerId, amount, reasonKey) {
      if (!world || !victim || !attackerId) return 0;
      var f = Faction.of(world, victim.id);
      if (!f) return 0;
      var n = 0;
      for (var i = 0; i < f.memberIds.length; i++) {
        var id = f.memberIds[i];
        if (id === victim.id || id === attackerId) continue;
        var m = roster.byId[id];
        if (!m || !m.state.online) continue;
        /* 对凶手的连带恶感（比本人轻，但会让整伙人一起敌视他） */
        var cur = Faction.affection(m, attackerId);
        m.affection[attackerId] = U.clamp(cur - (amount || 10), 0, 200);
        n++;
        if (FS.state.memory) {
          FS.state.memory.add(m, {
            type: 'faction',
            actors: [attackerId, victim.id],
            key: reasonKey || 'mem.factionGrudge',
            vars: {
              name: { tx: 'name', id: victim.id },
              who: { tx: 'name', id: attackerId },
              faction: { tx: 'faction', id: f.id },
            },
            affect: -14,
            importance: 0.72,
          }, world);
        }
      }
      return n;
    },

    /**
     * 目击同伙被杀 → 给还活着的人挂一个"复仇"目标。
     * 复用已有的 goal 系统（data/goals.js 里的 revenge），
     * 所以不需要新写一套行为。
     */
    onMemberKilled: function (world, roster, victim, killerId) {
      if (!world || !victim || !killerId) return 0;
      var f = Faction.of(world, victim.id);
      if (!f) return 0;
      var goalDef = FS.data.goals.byId && FS.data.goals.byId['revenge'];
      if (!goalDef) return 0;
      var n = 0;
      for (var i = 0; i < f.memberIds.length; i++) {
        var id = f.memberIds[i];
        if (id === victim.id || id === killerId) continue;
        var m = roster.byId[id];
        if (!m || !m.state.online || m.dead) continue;
        if (FS.state.goal) {
          FS.state.goal.maintain(m, world, roster, FS.core.clock.now());
          if (FS.state.goal.alreadyHas && FS.state.goal.alreadyHas(m, 'revenge')) continue;
          var g = FS.state.goal.instantiate(goalDef, m, world, roster);
          if (g) {
            g.targetId = killerId;
            g.triggeredBy = 'faction';
            if (!m.goals) m.goals = [];
            m.goals.push(g);
            n++;
          }
        }
      }
      return n;
    },

    /** 交易/组队偏好：在候选人里给同伙加权 */
    partnerBias: function (world, agent, otherId) {
      if (!Faction.sameFaction(world, agent.id, otherId)) return 1;
      return CFG().factionPartnerBias || 2.2;
    },

    /**
     * 生成一个团体名字（英文，像玩家自己起的小队名）。
     * 名字存在 faction.name 上，所以**不走语言包**：
     * 小队名是玩家起的，不该跟着界面语言变。
     *
     * 去重是**按世界**记的（world.factionNamesUsed），不是全局 ——
     * 用全局变量会在刷新后继续累加，出现 "Cave Union 2 / the Early Birds 2"
     * 这种一看就是"名字不够用了"的结果。
     */
    makeName: function (world) {
      if (!world) return RNG.pick(FACTION_NAMES);
      if (!world.factionNamesUsed) world.factionNamesUsed = {};
      var used = world.factionNamesUsed;
      var free = FACTION_NAMES.filter(function (n) { return !used[n]; });
      if (free.length) {
        var pick = RNG.pick(free);
        used[pick] = 1;
        return pick;
      }
      /* 池子用完了（理论上不会，池子比 factionMax 大得多）：
         用"方位 + 名词"再拼，而不是加数字后缀 */
      var extra = ['South', 'East', 'West', 'Upper', 'Lower', 'Far', 'Old'];
      var nouns = ['Crew', 'Crowd', 'Bunch', 'Lot', 'Folk', 'Hands'];
      var n2 = RNG.pick(extra) + ' ' + RNG.pick(nouns);
      used[n2] = 1;
      return n2;
    },
  };

  function wallowSafe(world) { return !!(world && world.factions); }

  /* 小队名池：混几种真实玩家会起的风格 */
  var FACTION_NAMES = [
    'the Diggers', 'Night Watch', 'Iron Pact', 'Camp Rats', 'the Quiet Few',
    'Deep Crew', 'Stone Hand', 'Lantern Guild', 'River Band', 'the Regulars',
    'Ash Company', 'Moss Clan', 'the Late Shift', 'Cave Union', 'Torchbearers',
    'the Back Row', 'Gravel Gang', 'Ore Brothers', 'the Early Birds',
    'Shovel Club', 'Dirt Committee', 'the Long Walk', 'North Crew',
    'Sparrow Company', 'the Slow Ones', 'Iron Beetles', 'Dusk Patrol',
  ];

  FS.define('state.faction', Faction);
})(window.FS);

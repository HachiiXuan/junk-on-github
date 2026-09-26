/* ==========================================================================
   ai.dialogue —— 话题链对话引擎
   相对原型的关键改动（见 docs/READMEv0.2.md §7.1）：
     1. 原型用单个 `active` 变量，全局只能跑一组对话 → 这里改为实例 Map，支持并发
     2. 支持同一个发送者连续发言（一方发三条、另一方只回一条）
     3. 每条消息独立判断 condition，不满足则跳过该条而不是中断整条链
     4. results 在消息真正发出时才结算，保证好感变化与日志时序一致
     5. 所有文本只存语义键 + 变量，切换语言可整屏重译
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }
  var RNG = FS.core.rng;
  var U = FS.core.util;
  var I18N = FS.core.i18n;
  var Agents = FS.state.agent;

  var instances = {};        // instanceId -> instance
  var instanceCount = 0;

  /* 变量兜底池：话题里引用到但没在 vars 里声明、且没有明确对象的变量 */
  var FALLBACK = {
    reason: ['eat', 'sleep', 'work', 'errand'],   // 下线理由（farewell 用；掉线不算，那是突发事件）
    name: null,             // 特殊处理：取对方的显示名
    item: ['wood', 'stone', 'iron', 'food', 'torch'],
    item2: ['wood', 'stone', 'leather', 'iron'],
    place: ['camp', 'forest', 'mine', 'river', 'ruins', 'cave'],
    /* 兜底变量池：只在台词里出现、但 topic.vars 没声明时才用。
       取值都是**真实存在的数据 id**，写错了会在控制台看到 ‹threat.xxx›。 */
    threat: ['boar', 'wolves', 'spider', 'snake', 'bear', 'bandit'],
    weather: null,          // 特殊处理：取当前天气
  };

  var Dialogue = {
    /* ================= 对外接口 ================= */

    /**
     * 让角色发起一个话题；返回实例或 null。
     * @param {object} [opts] { topicId, vars } 用于强制指定话题（如告别）
     */
    start: function (agent, world, roster, silent, nowMs, opts) {
      if (agent.dialogue.instanceId) return null;
      opts = opts || {};
      var C0 = CFG();

      /* 自由发起的话题受对话节奏约束；显式传入 topicId 的（告别等）
         属于剧情需要，不受全局上限与冷却限制。 */
      if (!opts.topicId) {
        if (Dialogue.activeCount() >= (C0.maxActiveTopics || 3)) return null;
        if (Dialogue.topicCountFor(agent) >= (C0.maxTopicsPerAgent || 1)) return null;
        if (Dialogue.topicCooldown(agent, world)) return null;
      }

      var topic = opts.topicId
        ? FS.data.topicsById[opts.topicId]
        : Dialogue.pickTopic(agent, world, roster);
      if (!topic) return null;

      var partner = Dialogue.pickPartner(agent, world, roster);
      if (!partner) return null;

      var inst = {
        id: 'd' + (++instanceCount),
        topicId: topic.id,
        topic: topic,
        initiatorId: agent.id,
        responderId: partner.id,
        vars: {},
        msgIndex: 0,
        pendingMsg: null,
        pendingAtTick: 0,
        startedAtTick: world.tick,
        phase: 'opening',
        branchTaken: {},          // 互斥分支：{ 分支名: true }
        state: {},                // 本次对话的内部事实（如是否成交）
        timeoutTicks: (topic.endWhen && topic.endWhen.timeoutTicks) || 420,
      };

      // 变量池：先随机取值，再记住"who 对 who"，供台词里的 {name} 使用
      /* 变量来源优先级（后面的覆盖前面的）：
           1) topic.vars 随机取值
           2) 台词里出现但没声明的占位符 → 兜底变量池
           3) 调用方显式传入的 opts.vars（如告别理由）
           4) {name} = 对话里的另一个人（渲染时按发言人再算一次）
         注意第 3 步必须在第 2 步之后：否则兜底会盖掉调用方给的值。 */
      inst.vars = Dialogue.rollVars(topic, agent, partner, world, inst);
      if (opts.vars) {
        for (var vk in opts.vars) {
          if (Object.prototype.hasOwnProperty.call(opts.vars, vk)) inst.vars[vk] = opts.vars[vk];
        }
      }
      inst.vars.name = { tx: 'name', id: partner.id };

      instances[inst.id] = inst;

      agent.dialogue.instanceId = inst.id;
      agent.dialogue.role = 'initiator';
      agent.dialogue.partner = partner.id;
      agent.dialogue.awaitingReply = false;
      agent.dialogue.patience = 0;

      partner.dialogue.instanceId = inst.id;
      partner.dialogue.role = 'responder';
      partner.dialogue.partner = agent.id;
      partner.dialogue.awaitingReply = false;
      partner.dialogue.patience = 0;

      agent.stats.lastTopicId = topic.id;
      agent.stats.lastTopicTick = world.tick;
      agent.stats.topicsStarted++;

      // 首条立即排队（打字延时由 agentUpdate.startTyping 决定）
      Dialogue.scheduleNext(inst, world, 0);
      return inst;
    },

    /** 结束某个角色参与的所有话题（他下线了） */
    endByAgent: function (world, roster, agent, silent) {
      if (!agent) return 0;
      var ids = [];
      for (var k in instances) {
        if (!Object.prototype.hasOwnProperty.call(instances, k)) continue;
        var inst = instances[k];
        if (inst.initiatorId === agent.id || inst.responderId === agent.id) ids.push(k);
      }
      for (var i = 0; i < ids.length; i++) {
        /* 标记为"被打断"：不计入话题冷却，否则某人下线会让留下的人
           莫名其妙好几秒不能说话。 */
        if (instances[ids[i]]) instances[ids[i]].aborted = true;
        Dialogue.end(instances[ids[i]], world, roster, silent);
      }
      return ids.length;
    },

    /** 每 tick 推进所有实例 */
    advance: function (world, roster, silent) {
      /* 先自愈：任何路径漏掉 release 都会留下指向死实例的对话状态，
         那会让角色"以为自己还在聊"，从而永远不再开口。 */
      Dialogue.normalize(roster);
      for (var id in instances) {
        if (!Object.prototype.hasOwnProperty.call(instances, id)) continue;
        Dialogue.advanceOne(instances[id], world, roster, silent);
      }
    },

    /** 角色打字结束，把消息真正发出去 */
    onMessageReady: function (world, roster, agent, typing, silent) {
      var inst = agent.dialogue.instanceId ? instances[agent.dialogue.instanceId] : null;
      var msg = typing.message;

      /* 输出聊天行（平铺，不缩进、不合并） */
      FS.core.tick.pushLogs([{
        key: typing.key,
        vars: typing.vars,
        level: 'CHAT',
        thread: 'chat',
        agentId: agent.id,
        instanceId: inst ? inst.id : null,
      }], silent);

      if (msg) {
        Dialogue.applyResults(inst, msg, agent, world, roster, silent);
      }
      agent.stats.spoken++;

      if (!inst) {
        Dialogue.release(agent);
        return;
      }

      /* 本条说完了，安排下一条 */
      inst.pendingMsg = null;
      inst.msgIndex++;

      var other = roster.byId[agent.dialogue.partner];
      if (Dialogue.chainFinished(inst)) {
        Dialogue.replace(inst, world, roster, silent);
        return;
      }

      var next = inst.topic.messages[inst.msgIndex];
      if (!next) {
        Dialogue.replace(inst, world, roster, silent);
        return;
      }

      // 判断下一条该由谁发
      var speakerId = next.from === 'responder' ? inst.responderId : inst.initiatorId;
      if (speakerId !== agent.id) {
        // 换人发言：轮到对方，把"等待"标记交给当前发言者
        agent.dialogue.awaitingReply = false;
        if (other) {
          other.dialogue.awaitingReply = false;
        }
        Dialogue.scheduleNext(inst, world, 0);
      } else {
        // 同一个人继续发（允许连发）
        Dialogue.scheduleNext(inst, world, 0);
      }
    },

    /** 等待回应超时：放弃这个话题 */
    giveUp: function (world, roster, agent, silent) {
      var inst = agent.dialogue.instanceId ? instances[agent.dialogue.instanceId] : null;
      if (!inst) {
        Dialogue.release(agent);
        return;
      }
      inst.stale = true;                    // 下次轮到就换话题
      agent.dialogue.awaitingReply = false;
      if (inst.msgIndex >= inst.topic.messages.length - 1) {
        Dialogue.end(inst, world, roster, silent);
      }
    },

    /**
     * 谁在等这个角色回应？返回 { partnerId, instanceId } 或 null
     * decision 用它来判断是否该接话。
     */
    pendingReplyFor: function (agent) {
      if (!agent.dialogue.instanceId) return null;
      var inst = instances[agent.dialogue.instanceId];
      if (!inst) { Dialogue.release(agent); return null; }
      if (inst.pendingMsg && inst.pendingMsg.from === 'responder'
          && inst.pendingMsg.forAgentId === agent.id
          && !agent.typing) {
        return { partnerId: agent.dialogue.partner, instanceId: inst.id };
      }
      return null;
    },

    /** 当前并发的话题数量（status 命令与面板用） */
    activeCount: function () {
      var n = 0;
      for (var k in instances) {
        if (Object.prototype.hasOwnProperty.call(instances, k)) n++;
      }
      return n;
    },

    /** 清空所有话题实例（导入快照 / 重置世界后用，避免引用旧的 agent 对象） */
    reset: function () {
      for (var k in instances) {
        if (Object.prototype.hasOwnProperty.call(instances, k)) instances[k].aborted = true;
      }
      instances = {};
      instanceCount = 0;
      return 0;
    },

    /** 某个角色是否正在某个话题里 */
    isBusy: function (agent) {
      return !!(agent.dialogue.instanceId && instances[agent.dialogue.instanceId]);
    },

    /**
     * 这个角色当前参与了几个话题（作为发起者或回应者）。
     * 用于限制"同一个人同时开好几场"，那是话题链交叉的主要来源。
     */
    topicCountFor: function (agent) {
      var n = 0;
      for (var k in instances) {
        if (!Object.prototype.hasOwnProperty.call(instances, k)) continue;
        var inst = instances[k];
        if (inst.initiatorId === agent.id || inst.responderId === agent.id) n++;
      }
      return n;
    },

    /* ================= 内部实现 ================= */

    advanceOne: function (inst, world, roster, silent) {
      var initiator = roster.byId[inst.initiatorId];
      var responder = roster.byId[inst.responderId];
      if (!initiator || !responder || !initiator.state.online || !responder.state.online) {
        Dialogue.end(inst, world, roster, silent);
        return;
      }

      // 超时
      if (world.tick - inst.startedAtTick > inst.timeoutTicks || inst.stale) {
        Dialogue.end(inst, world, roster, silent);
        return;
      }

      if (!inst.pendingMsg) return;
      if (inst.pendingMsg.forAgentId && roster.byId[inst.pendingMsg.forAgentId].typing) return;
      if (world.tick < inst.pendingAtTick) return;

      // 到点了：让该发言的人开始打字
      var speaker = roster.byId[inst.pendingMsg.forAgentId];
      if (!speaker) { Dialogue.end(inst, world, roster, silent); return; }

      // {name} 的语义是"对话里的另一个人"，所以按发言人取
      var vars = inst.vars;
      var otherId = (speaker.id === inst.initiatorId) ? inst.responderId : inst.initiatorId;
      vars.name = { tx: 'name', id: otherId };

      var text = I18N.t(inst.pendingMsg.lineKey, I18N.localizeVars(vars));
      FS.state.agentUpdate.startTyping(speaker, inst.pendingMsg.lineKey, vars, text);

      // 记录"正在等谁"
      if (inst.pendingMsg.from === 'initiator') {
        inst.initiatorPending = true;
      }
    },

    /** 安排"下一条尚未发出的消息" */
    scheduleNext: function (inst, world, extraDelay) {
      var msgs = inst.topic.messages;

      while (inst.msgIndex < msgs.length) {
        var msg = msgs[inst.msgIndex];
        var speakerId = (msg.from === 'responder') ? inst.responderId : inst.initiatorId;
        var speaker = FS.app.roster.byId[speakerId];
        var partner = FS.app.roster.byId[(msg.from === 'responder') ? inst.initiatorId : inst.responderId];

        // branch：同一分支只允许一条被采用（例如"接受"与"拒绝"不能同时出现）
        if (msg.branch && inst.branchTaken[msg.branch]) {
          inst.msgIndex++;
          continue;
        }
        // when：依赖本次对话内部的事实（如"这次真的成交了"）
        if (msg.when && !Dialogue.whenOk(msg.when, inst)) {
          inst.msgIndex++;
          continue;
        }
        // chance：本条不发的概率
        if (msg.chance != null && !RNG.chance(msg.chance)) {
          inst.msgIndex++;
          continue;
        }
        // condition：不满足则跳过本条，继续下一条
        if (msg.condition && !Dialogue.conditionOk(msg.condition, speaker, partner, inst)) {
          inst.msgIndex++;
          continue;
        }
        if (msg.branch) inst.branchTaken[msg.branch] = true;

        var lineKey = Dialogue.pickLineKey(msg, inst);
        var d = msg.delayTicks || [6, 40];
        var delayTicks = (inst.msgIndex === 0) ? 0 : RNG.int(d[0], d[1]);
        delayTicks += extraDelay || 0;

        inst.pendingMsg = {
          from: msg.from,
          forAgentId: speakerId,
          lineKey: lineKey,
          msg: msg,
        };
        inst.pendingAtTick = world.tick + delayTicks;
        return;
      }
      inst.pendingMsg = null;
    },

    /** 消息链是否已经走完 */
    chainFinished: function (inst) {
      return inst.msgIndex >= inst.topic.messages.length;
    },

    /**
     * 取一条台词 key。
     * 支持两种写法：
     *   lines: 'topic.greet.opener'                    → key 是"池"，再随机取 .0 / .1 / .2
     *   lines: ['topic.greet.opener.0', ...]           → 直接随机取一条
     * 池规模按"当前语言里真实存在的条目数"决定，所以中英条目数允许不同。
     *
     * @param {object} msg
     * @param {object} [inst] 传了就做"同一场内不重复用同一条台词"的去重：
     *   有些话题的第二个发言者消息复用了同一个池（比如 danger 的 reply 用两次），
     *   不去重就会出现 "still stuck, hurry" 连着两遍这种明显是程序在说话的情况。
     */
    pickLineKey: function (msg, inst) {
      var lines = msg.lines;
      if (lines == null) return '';
      if (typeof lines === 'string') {
        var n = FS.core.i18n.poolSize(lines);
        if (n <= 0) return lines;
        if (!inst) return lines + '.' + RNG.int(0, n - 1);
        inst.usedLines = inst.usedLines || {};
        var used = inst.usedLines[lines] || {};
        /* 优先挑没用过的；整池都用过了才允许重复 */
        var fresh = [];
        for (var i = 0; i < n; i++) if (!used[i]) fresh.push(i);
        var pick = fresh.length ? RNG.pick(fresh) : RNG.int(0, n - 1);
        used[pick] = true;
        inst.usedLines[lines] = used;
        return lines + '.' + pick;
      }
      if (lines.length) {
        if (!inst) return RNG.pick(lines);
        inst.usedLines = inst.usedLines || {};
        var usedA = inst.usedLines['arr'] || {};
        var freshA = lines.filter(function (x, i2) { return !usedA[i2]; });
        var pickA = freshA.length ? RNG.pick(freshA) : RNG.pick(lines);
        usedA[lines.indexOf(pickA)] = true;
        inst.usedLines['arr'] = usedA;
        return pickA;
      }
      return '';
    },

    /** 数一下 topic.<id>.<段> 下面当前语言有多少条 */
    poolIndex: function (base) {
      var n = FS.core.i18n.poolSize(base);
      if (!n) return -1;
      return RNG.int(0, n - 1);
    },

    /**
     * 按话题结束后的处理：
     *  - 结尾说一句"我先走了"之类的收束语（有就用，没有就静默结束）
     *  - 之后进入冷却，避免同一对人立刻又开一场
     */
    replace: function (inst, world, roster, silent) {
      Dialogue.end(inst, world, roster, silent);
    },

    end: function (inst, world, roster, silent) {
      if (!inst) return;
      var wasNatural = !inst.aborted;          // 自然结束 vs 被打断/强制清场
      var wasLive = !!instances[inst.id];
      delete instances[inst.id];

      var a = roster.byId[inst.initiatorId];
      var b = roster.byId[inst.responderId];
      /* 只释放"确实属于这一场"的人。
         如果某人已经被另一场接手（理论上不该发生），这里不能把他的新状态清掉。 */
      if (!a || a.dialogue.instanceId === inst.id) Dialogue.release(a);
      if (!b || b.dialogue.instanceId === inst.id) Dialogue.release(b);

      /* 重复 end 同一实例时不再走后面的冷却/计数逻辑 */
      if (!wasLive) return;

      // 说完一轮话，冷却一下（人不会连着不停聊）
      var C = CFG();
      if (a) {
        a.cooldown.topic = RNG.int(C.chatCooldownTicks[0], C.chatCooldownTicks[1]);
        a.stats.lastTopicId = inst.topicId;
        a.stats.lastTopicTick = world.tick;
      }
      if (b) {
        b.cooldown.topic = RNG.int(C.chatCooldownTicks[0], C.chatCooldownTicks[1]);
      }

      /* 一场话题结束后给发起者一段"别马上又开一场"的时间。
         这是话题链交叉最直接的解药：以前他等回应等到一半就去开新话题，
         结果同一个人的两句话中间夹着别人的回应。 */
      if (wasNatural) {
        var cd = C.topicCooldownTicks || [120, 420];
        var until = world.tick + RNG.int(cd[0], cd[1]);
        if (a) a.topicCooldownUntilTick = Math.max(a.topicCooldownUntilTick || 0, until);
        if (b) b.topicCooldownUntilTick = Math.max(b.topicCooldownUntilTick || 0, until);
      }
    },

    /** 是否还在"刚聊完，先别急着开新话题"的冷却里 */
    topicCooldown: function (agent, world) {
      if (!agent || !agent.topicCooldownUntilTick) return false;
      return (world ? world.tick : 0) < agent.topicCooldownUntilTick;
    },

    /** 这个角色在显式等待着谁的回应（界面与调试都用它） */
    waitingOn: function (agent) {
      if (!agent || !agent.dialogue) return null;
      if (!agent.dialogue.awaitingReply) return null;
      return agent.dialogue.partner || null;
    },

    /** 清掉角色身上的对话状态 */
    release: function (agent) {
      if (!agent) return;
      agent.dialogue.instanceId = null;
      agent.dialogue.role = null;
      agent.dialogue.partner = null;
      agent.dialogue.awaitingReply = false;
      agent.dialogue.patience = 0;
    },

    /* ---------------- 条件与结果 ---------------- */

    /** 条件判断；支持 '>120' '<80' 这类字符串比较 */
    conditionOk: function (cond, speaker, partner, inst) {
      if (!speaker) return false;

      if (cond.hasItem != null) {
        var has = Agents.itemCount(speaker) > 0;
        if (cond.hasItem !== has) return false;
      }
      if (cond.hpBelow != null && speaker.state.hp >= cond.hpBelow) return false;
      if (cond.hpAbove != null && speaker.state.hp <= cond.hpAbove) return false;
      if (cond.mood && speaker.state.mood !== cond.mood) return false;
      if (cond.place && speaker.state.place !== cond.place) return false;

      if (cond.affection != null && partner) {
        var aff = FS.ai.decision.affection(speaker, partner.id);
        var want = String(cond.affection);
        var op = want.charAt(0);
        var num = parseFloat(want.slice(1));
        if (op === '>' && !(aff > num)) return false;
        if (op === '<' && !(aff < num)) return false;
        if (op === '=' && !(aff === num)) return false;
      }

      /* 自记忆条件：说话的人自己最近经历过某事（例如刚成交才说谢谢） */
      if (cond.selfMemory && FS.state.memory) {
        if (!Dialogue.hasMemory(speaker, cond.selfMemory, partner)) return false;
      }
      /* 对方记忆条件：对话对象刚经历过某事 */
      if (cond.partnerMemory && FS.state.memory) {
        if (!partner || !Dialogue.hasMemory(partner, cond.partnerMemory, speaker)) return false;
      }

      /* 对这个人有负面旧账（例如"上次那事儿还没算清呢"这种台词）。
         没有这条条件的话，那句台词会挂在一个根本不存在的"上次"上 —— */
      if (cond.badBloodWithPartner) {
        if (!partner || !Dialogue.hasBadBlood(speaker, partner)) return false;
      }
      /* 反过来：跟这个人从来没往来过（"谁啊"这类台词用） */
      if (cond.neverMetPartner) {
        if (!partner || Dialogue.hasBadBlood(speaker, partner)
            || (FS.state.memory && FS.state.memory.about(speaker, partner.id).length)) {
          return false;
        }
      }
      return true;
    },

    /** 某人最近是否留下了指定 key 的记忆（可限定与谁有关） */
    hasMemory: function (agent, spec, aboutAgent) {
      if (!agent || !agent.memory) return false;
      for (var i = agent.memory.length - 1; i >= 0; i--) {
        var m = agent.memory[i];
        if (spec.type && m.type !== spec.type) continue;
        if (spec.key && m.key !== spec.key) continue;
        if (aboutAgent && m.actors && m.actors.indexOf(aboutAgent.id) === -1) continue;
        return true;
      }
      return false;
    },

    /**
     * 消息级"本次对话事实"判断。
     * 为什么不复用记忆：记忆是长期的，上一场交易成功会让这一场的"道谢"凭空出现。
     * 凡是"只有这次成交才该说"的台词，一律用 when 判断。
     */
    whenOk: function (when, inst) {
      if (!when) return true;
      if (when.flag && !inst.state[when.flag]) return false;
      if (when.notFlag && inst.state[when.notFlag]) return false;
      return true;
    },

    /** 消息真正发出后结算好感 / 记忆 */
    applyResults: function (inst, msg, speaker, world, roster, silent) {
      if (!inst) return;

      /* 先记录"本次对话的事实"，供后续消息的 when 判断使用 */
      if (msg.sets) {
        for (var s in msg.sets) {
          if (Object.prototype.hasOwnProperty.call(msg.sets, s)) inst.state[s] = msg.sets[s];
        }
      }
      if (!msg.results) return;
      var partnerId = speaker.dialogue.partner;
      var partner = partnerId ? roster.byId[partnerId] : null;
      var r = msg.results;

      if (r.affection) {
        var cur = FS.ai.decision.affection(speaker, partnerId);
        speaker.affection[partnerId] = U.clamp(cur + r.affection, 0, 200);
        // 双向轻微联动：人对被接受/被拒绝是有感觉的
        if (partner && r.affection > 0) {
          var back = FS.ai.decision.affection(partner, speaker.id);
          partner.affection[speaker.id] = U.clamp(back + Math.round(r.affection / 2), 0, 200);
        }
      }

      if (r.memory && FS.state.memory) {
        var vars = {};
        for (var k in inst.vars) {
          if (Object.prototype.hasOwnProperty.call(inst.vars, k)) vars[k] = inst.vars[k];
        }
        FS.state.memory.add(speaker, {
          type: r.memory.type,
          actors: partnerId ? [partnerId] : [],
          key: r.memory.key,
          vars: vars,
          affect: r.memory.affect != null ? r.memory.affect : 0,
          importance: r.memory.importance != null ? r.memory.importance : 0.3,
        }, world);
      }
    },

    /* ---------------- 话题与对象选择 ---------------- */

    /** 按目标、世界状态、冷却挑一个话题 */
    pickTopic: function (agent, world, roster) {
      var top = FS.state.goal.top(agent);
      var map = FS.data.TOPIC_GOAL_MAP;
      var preferred = (top && map[top.id]) ? map[top.id] : null;

      var primary = [];
      var fallback = [];

      for (var i = 0; i < FS.data.topics.length; i++) {
        var t = FS.data.topics[i];
        if (!Dialogue.triggerOk(t, agent, world, roster)) continue;
        if (Dialogue.onCooldown(agent, t, world)) continue;
        var w = t.weight;
        /* 亲眼见过控制台动手的人，会更想跟人念叨这件事 ——
           没有这个加成，consoleTalk 在十几个话题里几乎抽不到。 */
        if (t.trigger && t.trigger.consoleMemory && Dialogue.consoleMemoryOf(agent)) {
          w *= (CFG().consoleTopicBoost || 3.5);
        }
        fallback.push({ def: t, weight: w });
        if (preferred && preferred.indexOf(t.id) !== -1) {
          primary.push({ def: t, weight: w * 2.5 });
        }
      }

      var pool = primary.length ? primary : fallback;
      if (!pool.length) return null;
      return RNG.weighted(pool, function (c) { return c.weight; }).def;
    },

    /** 说话的人是否记得跟对方有过节（负面情感的记忆） */
    hasBadBlood: function (speaker, partner) {
      if (!speaker || !partner || !FS.state.memory) return false;
      var list = FS.state.memory.about(speaker, partner.id);
      for (var i = 0; i < list.length; i++) {
        if (list[i].affect <= -5) return true;
      }
      return false;
    },

    triggerOk: function (topic, agent, world, roster) {
      var trg = topic.trigger || {};
      if (trg.minOnline != null && Agents.online(roster).length < trg.minOnline) return false;
      if (trg.weather && trg.weather.indexOf(world.weather) === -1) return false;
      if (trg.place && trg.place.indexOf(agent.state.place) === -1) return false;
      if (trg.timeOfDay) {
        var tod = FS.core.clock.timeOfDay(world.time);
        if (trg.timeOfDay.indexOf(tod) === -1) return false;
      }
      if (trg.hpBelow != null && agent.state.hp >= trg.hpBelow) return false;
      if (trg.mood && trg.mood.indexOf(agent.state.mood) === -1) return false;
      /* trace: true —— 世界上至少有一条"死者痕迹"（v0.3） */
      if (trg.trace && !(world.traces && world.traces.length)) return false;
      /* consoleMemory: true —— 这个角色自己记得控制台干过什么（v0.4）。
         必须是他**自己的**记忆，否则会出现"新来的人也知道刚才谁被踢了"。 */
      if (trg.consoleMemory) {
        if (!Dialogue.consoleMemoryOf(agent)) return false;
      }
      /* faction: true —— 说话的人自己有队伍（v1.1）。
         "我们那伙人"这种话只有真的入伙了才说得出来。 */
      if (trg.faction) {
        if (!FS.state.faction || !FS.state.faction.of(world, agent.id)) return false;
      }
      return true;
    },

    /**
     * 找出这个角色记得的、与控制台有关的最近一件事。
     * 返回 { key, cmd } 或 null。cmd 是语义 key（如 'kick'），台词里用 {cmd}。
     */
    consoleMemoryOf: function (agent) {
      if (!agent || !agent.memory) return null;
      for (var i = agent.memory.length - 1; i >= 0; i--) {
        var m = agent.memory[i];
        if (m.type !== 'command') continue;
        if (!m.actors || m.actors.indexOf('console') === -1) continue;
        return {
          key: m.key,
          cmd: (m.vars && m.vars.cmd) ? m.vars.cmd : 'help',
        };
      }
      return null;
    },

    /** 同一个话题不能老是重复聊（同时按"每个角色"和"全局"判断） */
    onCooldown: function (agent, topic, world) {
      var C = CFG();
      var window = C.topicRepeatPenaltyTicks;
      if (agent.stats.lastTopicId === topic.id
          && world.tick - agent.stats.lastTopicTick < window) return true;
      return false;
    },

    /**
     * 挑一个对话对象：优先同地点的人。
     * 会跳过"刚上线还在响应延迟里"的人 —— 否则等于对着一个不回答的人说话，
     * 那比不说话更假（真人刚进服务器也会先看一会儿）。
     */
    pickPartner: function (agent, world, roster) {
      function available(a) {
        return !a.dialogue.instanceId && !a.typing
          && !FS.ai.decision.stillWarmingUp(a, world);
      }
      var samePlace = Agents.othersAtPlace(roster, agent).filter(available);
      if (samePlace.length) {
        // 好感高的优先（朋友更可能搭话）；同伙再加一层权重
        var scored = samePlace.map(function (a) {
          var w = Math.max(0.2, FS.ai.decision.affection(agent, a.id) / 100);
          if (FS.state.faction) w *= FS.state.faction.partnerBias(world, agent, a.id);
          return { a: a, w: w };
        });
        return RNG.weighted(scored, function (c) { return c.w; }).a;
      }
      // 同地点没人：隔空喊话（对着全场说话）
      var others = Agents.online(roster).filter(function (a) {
        return a.id !== agent.id && available(a);
      });
      if (!others.length) return null;
      return RNG.pick(others);
    },

    /** 依据 topic.vars 掷出这次对话用到的所有变量 */
    rollVars: function (topic, agent, partner, world, inst) {
      var vars = {};
      var spec = topic.vars || {};
      for (var k in spec) {
        if (!Object.prototype.hasOwnProperty.call(spec, k)) continue;
        var s = spec[k];
        if (s && s.source) {
          var list = Dialogue.sourceList(s.source, agent, world);
          /* 已经用过的值不再抽 —— 否则会出现
             "想收药水，我这儿有药水"（requested == offered）这种自相矛盾的台词。 */
          var fresh = list.filter(function (id) {
            for (var used in vars) {
              if (!Object.prototype.hasOwnProperty.call(vars, used)) continue;
              var v = vars[used];
              if (v && v.id === id) return false;
            }
            return true;
          });
          var id2 = RNG.pick(fresh.length ? fresh : list);
          vars[k] = id2 ? { tx: Dialogue.sourceTx(s.source), id: id2 } : null;
        } else if (U.isArrayLike(s)) {
          var val = RNG.pick(s);
          var dup = false;
          for (var u2 in vars) {
            if (Object.prototype.hasOwnProperty.call(vars, u2) && vars[u2] === val) dup = true;
          }
          if (!dup) vars[k] = val;
          else {
            var other = s.filter(function (x) { return x !== val; });
            vars[k] = other.length ? RNG.pick(other) : val;
          }
        }
      }
      // 兜底：台词里用到但没声明的变量
      var tplParts = [];
      (topic.messages || []).forEach(function (m) {
        var l = m.lines;
        if (typeof l === 'string') {
          // lines 是"池"：把池里每一条都算进来，避免漏掉只在某一条里出现的变量
          var base = l.replace(/\.\d+$/, '');
          var n = FS.core.i18n.poolSize(base);
          if (n) {
            for (var i = 0; i < n; i++) tplParts.push(FS.core.i18n.raw(base + '.' + i) || '');
          } else {
            tplParts.push(FS.core.i18n.raw(base) || '');
          }
        } else if (U.isArrayLike(l)) {
          for (var j = 0; j < l.length; j++) tplParts.push(FS.core.i18n.raw(l[j]) || '');
        }
      });
      var used = U.placeholders(tplParts.join(' '));

      /* {cmd}：把"控制台干过什么"填进台词。
         取自说话者自己的记忆，所以只有经历过的人才说得出。 */
      if (used.indexOf('cmd') !== -1) {
        var cm = Dialogue.consoleMemoryOf(agent);
        if (cm) vars.cmd = { tx: 'cmd', id: cm.cmd };
        else vars.cmd = { tx: 'cmd', id: 'help' };
        used = used.filter(function (x) { return x !== 'cmd'; });
      }

      /* 提到死者的台词：从"死者痕迹"里挑一个（传说优先）。
         提到谁，就给他加一次提及计数，够了就升级成传说。 */
      if (used.indexOf('dead') !== -1) {
        var trace = FS.state.death ? FS.state.death.randomTrace(world) : null;
        if (trace) {
          vars.dead = { tx: 'name', id: trace.agentId };
          vars.cause = { tx: 'deathCause', id: trace.cause };
          vars.place = { tx: 'place', id: trace.place };
          if (inst && !inst.mentionCounted) {
            inst.mentionCounted = true;
            if (FS.state.death) {
              var up = FS.state.death.mention(trace, world, null, true);
              /* 升级为"传说"时的系统提示由这里推送（state 层不自己 push） */
              var pend = FS.state.death.takePendingLogs(trace);
              if (pend && pend.length) FS.core.tick.pushLogs(pend, true);
              if (up) { /* 升级了，日志已经在上面推送 */ }
            }
          }
        }
        used = used.filter(function (x) { return x !== 'dead' && x !== 'cause'; });
      }

      /* {faction} / {mate}：小队名与队友名（v1.1）。
         小队名由 i18n.resolver('faction') 解析，所以这里只给 id。 */
      if (used.indexOf('faction') !== -1) {
        var myFac = FS.state.faction ? FS.state.faction.of(world, agent.id) : null;
        if (myFac) {
          vars.faction = { tx: 'faction', id: myFac.id };
          /* 从同伙里挑一个当 {mate}（不能是自己） */
          var mates = myFac.memberIds.filter(function (id) { return id !== agent.id; });
          var mateId = mates.length ? RNG.pick(mates) : null;
          vars.mate = mateId ? { tx: 'name', id: mateId } : { tx: 'name', id: agent.id };
        }
        used = used.filter(function (x) { return x !== 'faction' && x !== 'mate'; });
      }
      for (var i = 0; i < used.length; i++) {
        var name = used[i];
        if (vars[name] !== undefined) continue;
        if (name === 'name') { vars.name = { tx: 'name', id: partner.id }; continue; }
        if (name === 'weather') { vars.weather = { tx: 'weather', id: world.weather }; continue; }
        var pool = FALLBACK[name];
        if (!pool) {
          /* 没有兜底来源的变量（如 farewell 的 {reason}，由调用方通过
             start(..., { vars }) 传入）—— 这里绝不写入，避免用空串盖掉真实值。 */
          continue;
        }
        var pid = RNG.pick(pool);
        vars[name] = { tx: Dialogue.txFor(name), id: pid };
      }
      return vars;
    },

    sourceList: function (source, agent, world) {
      switch (source) {
        case 'items': return FS.data.items.list.map(function (i) { return i.id; });
        case 'places': return FS.data.places.list.map(function (p) { return p.id; });
        case 'threats':
          /* 只取"生物/敌对玩家"：威胁池里还有 fall/dark/lava/traps 这类
             环境危害（用于描述死因），放进台词会变成
             "小心点，那一片有摔落"。 */
          return FS.data.threats.list.filter(function (t) {
            return t.kind === 'creature' || t.kind === 'player';
          }).map(function (t) { return t.id; });
        case 'weather': return [world.weather];
        case 'moods': return ['calm', 'annoyed', 'scared', 'excited'];
        default: return [];
      }
    },

    sourceTx: function (source) {
      switch (source) {
        case 'items': return 'item';
        case 'places': return 'place';
        case 'threats': return 'threat';
        case 'weather': return 'weather';
        case 'moods': return 'mood';
        default: return 'item';
      }
    },

    txFor: function (varName) {
      switch (varName) {
        case 'item':
        case 'item2': return 'item';
        case 'place': return 'place';
        case 'threat': return 'threat';
        case 'weather': return 'weather';
        case 'reason': return 'leaveReason';
        case 'dead': return 'name';
        case 'cause': return 'deathCause';
        case 'cmd': return 'cmd';
        default: return 'item';
      }
    },

    /* 调试用 */
    debugList: function () {
      var out = [];
      for (var k in instances) {
        if (!Object.prototype.hasOwnProperty.call(instances, k)) continue;
        var i = instances[k];
        out.push(i.id + ':' + i.topicId + ' (' + i.initiatorId + '\u2192' + i.responderId
          + ' #' + i.msgIndex + ')');
      }
      return out;
    },

    /**
     * 活跃实例的**对象**数组（debugList 返回的是字符串，测试里要判状态就得用这个）。
     * 顺带做一次不变量检查：每个角色的 dialogue.instanceId 必须指向真实存在的实例。
     */
    debugInstances: function () {
      var out = [];
      for (var k in instances) {
        if (Object.prototype.hasOwnProperty.call(instances, k)) out.push(instances[k]);
      }
      return out;
    },

    /** 校验"角色 ↔ 实例"的一致性，返回问题列表（空数组 = 一致） */
    audit: function (roster) {
      var problems = [];
      var live = {};
      var list = Dialogue.debugInstances();
      var seats = {};          // 每个角色参与了几场
      var i;

      for (i = 0; i < list.length; i++) {
        var inst = list[i];
        live[inst.id] = inst;
        var a = roster.byId[inst.initiatorId];
        var b = roster.byId[inst.responderId];
        if (!a || !b) { problems.push(inst.id + ': 参与者不存在'); continue; }
        if (a.dialogue.instanceId !== inst.id) {
          problems.push(inst.id + ': 发起者 ' + a.name + ' 的 instanceId 是 '
            + a.dialogue.instanceId);
        }
        if (b.dialogue.instanceId !== inst.id) {
          problems.push(inst.id + ': 回应者 ' + b.name + ' 的 instanceId 是 '
            + b.dialogue.instanceId);
        }
        seats[inst.initiatorId] = (seats[inst.initiatorId] || 0) + 1;
        seats[inst.responderId] = (seats[inst.responderId] || 0) + 1;
      }

      for (i = 0; i < list.length; i++) {
        var x = list[i];
        if (x.initiatorId === x.responderId) {
          problems.push(x.id + ': 自己和自己对话');
        }
      }
      Object.keys(seats).forEach(function (id) {
        if (seats[id] > 1) {
          var ag = roster.byId[id];
          problems.push((ag ? ag.name : id) + ' 同时在 ' + seats[id] + ' 场话题里');
        }
      });

      for (i = 0; i < roster.list.length; i++) {
        var a2 = roster.list[i];
        if (a2.dialogue.instanceId && !live[a2.dialogue.instanceId]) {
          problems.push(a2.name + ' 的 instanceId(' + a2.dialogue.instanceId + ') 指向不存在的实例');
        }
      }
      return problems;
    },

    /**
     * 自愈：把指向"已经不存在的实例"的对话状态清掉。
     * 每 tick 开头跑一次，保证任何路径漏掉 release 都不会留下僵尸状态。
     */
    normalize: function (roster) {
      var fixed = 0;
      for (var i = 0; i < roster.list.length; i++) {
        var a = roster.list[i];
        if (a.dialogue && a.dialogue.instanceId && !instances[a.dialogue.instanceId]) {
          Dialogue.release(a);
          fixed++;
        }
      }
      return fixed;
    },
  };

  FS.define('ai.dialogue', Dialogue);
})(window.FS);

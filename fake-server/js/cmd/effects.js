/* ==========================================================================
   cmd.effects —— 用户命令的作用效果（v0.2）
   链路（见 docs/READMEv0.2spec.md §3）：
     用户输入 → parser → Event 入队 → 下一 tick 由这里执行
       → 改状态 + 写高重要性记忆 + 对控制台好感变化 + 其他角色议论
   为什么走 Event 队列而不是直接改：需求要求"命令下一 tick 被 Agent 收到"，
   这样才能和其他事件一起被决策/记忆系统感知，也天然限流。
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }
  var RNG = FS.core.rng;
  var U = FS.core.util;
  var Agents = FS.state.agent;

  var CONSOLE = 'console';

  /** 对"控制台"的好感：控制台被当作一个虚拟对象存在好感表里 */
  function affectionToConsole(agent) {
    var v = agent.affection[CONSOLE];
    return v === undefined ? Agents.NEUTRAL_AFFECTION : v;
  }

  function addConsoleAffection(agent, delta) {
    var cur = affectionToConsole(agent);
    agent.affection[CONSOLE] = U.clamp(cur + delta, 0, 200);
    return agent.affection[CONSOLE];
  }

  /* 命令名 → 语义 key：记忆里只存**命令名**（kick / kill …），
     台词渲染时再按当前语言翻译成"踢人 / kick someone"，
     这样中英切换后连历史文本也跟着变。 */
  function cmdKey(raw) {
    var name = String(raw == null ? '' : raw).trim().split(/[\s:]/)[0].toLowerCase();
    return name || 'help';
  }

  /** 写一条"控制台干了什么"的记忆（cmd 一律经过 cmdKey 归一化） */
  function rememberCommand(agent, cmdName, importance, affect, targetName) {
    if (!agent || !FS.state.memory) return null;
    return FS.state.memory.add(agent, {
      type: 'command',
      actors: [CONSOLE],
      key: targetName ? 'mem.consoleWitness' : 'mem.wasCommanded',
      vars: {
        cmd: cmdKey(cmdName),
        name: targetName ? { tx: 'name', id: targetName } : null,
      },
      affect: affect != null ? affect : -8,
      importance: importance != null ? importance : 0.85,
    }, FS.app.world);
  }

  var Effects = {
    /** 暴露给测试与调试面板 */
    cmdKey: cmdKey,
    /** 需要一个真实在线的角色；找不到返回 null（调用方负责出错提示） */
    findTarget: function (name) {
      var roster = FS.app.roster;
      var agent = Agents.byName(roster, name);
      if (!agent || !agent.state.online) return null;
      return agent;
    },

    /* ================= 各命令 ================= */

    kick: function (args, ctx) {
      var roster = ctx.roster();
      var world = ctx.world();
      var name = args[0];
      if (!name) return [ctx.out('log.command.usage', { usage: 'kick <player> [reason]' }, 'ERROR')];
      var agent = Agents.byName(roster, name);
      if (!agent || !agent.state.online) return [ctx.out('log.command.notFound', {}, 'ERROR')];

      var reason = 'kicked';
      /* 立刻下线（不走"告别"流程：被踢就是被踢） */
      if (FS.ai.dialogue) FS.ai.dialogue.endByAgent(world, roster, agent, true);
      Agents.leave(roster, agent);
      FS.state.world.syncRoster(world, roster);

      /* 被踢的人记一条高重要性记忆 + 对控制台好感大跌 */
      var aff = addConsoleAffection(agent, -20);
      if (FS.state.memory) {
        FS.state.memory.add(agent, {
          type: 'command',
          actors: [CONSOLE],
          key: 'mem.wasCommanded',
          vars: { cmd: 'kick' },
          affect: -20,
          importance: 0.95,
        }, world);
      }

      var logs = [ctx.out('log.command.kicked', {
        name: { tx: 'name', id: agent.id },
      }, 'WARN')];

      /* 在场的人按概率记住"控制台踢了谁" */
      var witnesses = Agents.online(roster).filter(function (a) {
        return a.id !== agent.id && !a.leaving;
      });
      var n = 0;
      for (var i = 0; i < witnesses.length; i++) {
        if (!RNG.chance(0.75)) continue;
        n++;
        addConsoleAffection(witnesses[i], -6);
        rememberCommand(witnesses[i], 'kick', 0.7, -6, agent.id);
      }
      if (n) {
        logs.push(ctx.out('log.command.witnessed', {
          n: n, cmd: 'kick', name: { tx: 'name', id: agent.id },
        }, 'INFO'));
      }

      /* 把结果也回给用户（程序员视角） */
      logs.push(ctx.out('log.command.affection', {
        name: { tx: 'name', id: agent.id }, value: aff,
      }, 'DEBUG'));

      return logs;
    },

    kickall: function (args, ctx) {
      var roster = ctx.roster();
      var world = ctx.world();
      var online = Agents.online(roster).slice();
      var logs = [];
      for (var i = 0; i < online.length; i++) {
        var a = online[i];
        if (FS.ai.dialogue) FS.ai.dialogue.endByAgent(world, roster, a, true);
        Agents.leave(roster, a);
        addConsoleAffection(a, -20);
        if (FS.state.memory) {
          FS.state.memory.add(a, {
            type: 'command', actors: [CONSOLE], key: 'mem.wasCommanded',
            vars: { cmd: 'kickall' }, affect: -20, importance: 0.95,
          }, world);
        }
      }
      FS.state.world.syncRoster(world, roster);
      logs.push(ctx.out('log.command.kickAll', { n: online.length }, 'WARN'));
      return logs;
    },

    /* ---------------- 已移除的命令 ----------------
       say / whisper / give / heal 被移除：控制台发消息给角色，角色无法回应，
       观察者会觉得"AI 根本没听见"，反而破坏伪装。
       它们的效果要么无意义（喊话），要么没有回应（凭空给物品 / 治疗）。
       对应的实现与文案一并删除，避免留死代码。 */

    /**
     * kill <player>
     * 保留：它产生的是**可见的世界事件**（死亡 → 复活 / 痕迹 / 传说），
     * 角色会因此产生记忆与好感变化，不是"隔空喊话"。
     */
    kill: function (args, ctx) {
      var name = args[0];
      if (!name) return [ctx.out('log.command.usage', { usage: 'kill <player>' }, 'ERROR')];
      var target = Effects.findTarget(name);
      if (!target) return [ctx.out('log.command.notFound', {}, 'ERROR')];
      var world = ctx.world();
      var roster = ctx.roster();

      addConsoleAffection(target, -25);
      if (FS.state.memory) {
        FS.state.memory.add(target, {
          type: 'command', actors: [CONSOLE], key: 'mem.wasCommanded',
          vars: { cmd: 'kill' }, affect: -25, importance: 1,
        }, world);
      }

      /* v0.3：走真实死亡流程（普通死亡→等复活；永久死亡→留痕迹）。
         force=true：即使他已经在死亡状态也重新走一遍，避免命令"没反应"。 */
      if (FS.state.death) {
        return FS.state.death.kill(target, CONSOLE, world, roster, false, 'console', true) || [];
      }
      target.state.hp = 1;
      return [ctx.out('log.command.killed', { name: { tx: 'name', id: target.id } }, 'WARN')];
    },

    /**
     * permadeath <player> [on|off]
     * 开启后该角色一旦死亡就不再回来，并留下痕迹进入全局记忆，
     * 被反复提起会变成传说。
     */
    permadeath: function (args, ctx) {
      var name = args[0];
      if (!name) {
        return [ctx.out('log.command.usage', { usage: 'permadeath <player> [on|off]' }, 'ERROR')];
      }
      var roster = ctx.roster();
      var agent = Agents.byName(roster, name);
      if (!agent) return [ctx.out('log.command.notFound', {}, 'ERROR')];

      var want = String(args[1] || '').toLowerCase();
      var on = want === 'off' ? false : (want === 'on' ? true : !agent.state.permanentDeath);
      agent.state.permanentDeath = on;
      return [ctx.out(on ? 'log.command.permadeathOn' : 'log.command.permadeathOff',
        { name: { tx: 'name', id: agent.id } }, 'WARN')];
    },

    spawn: function (args, ctx) {
      var roster = ctx.roster();
      var world = ctx.world();
      var name = args[0];

      var agent = name
        ? Agents.byName(roster, name)
        : roster.list.filter(function (a) { return !a.state.online; })[0];
      if (!agent) return [ctx.out('log.command.noSpawn', {}, 'ERROR')];

      var already = agent.state.online;
      FS.state.agent.join(roster, agent, ctx.now());
      FS.state.world.syncRoster(world, roster);

      return [ctx.out(already ? 'log.command.alreadyOnline' : 'log.server.join', {
        name: { tx: 'name', id: agent.id },
      }, 'INFO')];
    },

    /**
     * time set <hh:mm>
     * 注意 key 必须等于命令名（bus 用 ev.data.cmd 直接查这张表），
     * 所以这里叫 time 而不是 setTime —— 之前叫 setTime 导致命令静默失效。
     */
    time: function (args, ctx) {
      var world = ctx.world();
      var sub = String(args[0] || '').toLowerCase();
      if (sub !== 'set') {
        return [ctx.out('log.command.usage', { usage: 'time set <hh:mm>' }, 'ERROR')];
      }
      var hhmm = String(args[1] || '').split(':');
      var h = parseInt(hhmm[0], 10);
      var m = hhmm.length > 1 ? parseInt(hhmm[1], 10) : 0;
      if (isNaN(h) || h < 0 || h > 23) {
        return [ctx.out('log.command.usage', { usage: 'time set <hh:mm>' }, 'ERROR')];
      }
      m = isNaN(m) ? 0 : U.clamp(m, 0, 59);

      /* 世界钟是"真实经过时间"的函数：gameMinutes = 起点分钟 + 已流逝时间折算。
         所以要设成 want，必须让 elapsed 等于 (want − 起点分钟) 的折算值。
         ★ 起点分钟 = (startDay−1)*24h + startHour*60，漏掉它就会差一整个 startHour
           （例如想要 03:30 却永远得到 09:30 = 3.5h + 6h 的起点偏移）。
         用绝对位置算，而不是按差值平移，任何时间源（真实 / 测试注入）都成立。 */
      var C = CFG();
      var day = world.time.day;
      var wantMinutes = (day - 1) * C.dayLengthGameHours * 60 + h * 60 + m;
      var originMinutes = (world.startDay - 1) * C.dayLengthGameHours * 60 + world.startHour * 60;
      /* 想设的时刻可能早于当前起点（世界从 06:00 起，要设 03:30）。
         把纪元挪到前一天同一个起点，差值就是正的，也不需要动 startDay/startHour。 */
      if (wantMinutes < originMinutes) originMinutes -= C.dayLengthGameHours * 60;
      var elapsedMs = (wantMinutes - originMinutes) / (60 * world.speedMul) * C.realMsPerGameHour;
      world.worldStartMs = ctx.now() - elapsedMs;
      FS.state.world.syncTime(world, ctx.now());

      return [ctx.out('log.command.timeSet', { time: FS.core.clock.hhmm(world.time) }, 'INFO')];
    },

    /** weather <clear|rain|thunder|fog> */
    weather: function (args, ctx) {
      var world = ctx.world();
      var w = String(args[0] || '').toLowerCase();
      if (FS.state.world.Weather.all.indexOf(w) === -1) {
        return [ctx.out('log.command.usage', { usage: 'weather <clear|rain|thunder|fog>' }, 'ERROR')];
      }
      world.weather = w;
      world.weatherLeftTicks = FS.state.world.Weather.durationTicks();
      FS.state.world.pushGlobalMemory(world, {
        key: 'log.server.weather',
        vars: { weather: { tx: 'weather', id: w } },
        importance: 0.3,
      });
      return [ctx.out('log.server.weather', { weather: { tx: 'weather', id: w } }, 'INFO')];
    },

    /** speed <x> */
    speed: function (args, ctx) {
      var world = ctx.world();
      var x = parseFloat(args[0]);
      if (isNaN(x) || x <= 0 || x > 100) {
        return [ctx.out('log.command.usage', { usage: 'speed <x>' }, 'ERROR')];
      }
      world.speedMul = x;
      FS.state.world.syncTime(world, ctx.now());
      return [ctx.out('log.command.speedSet', { x: x }, 'INFO')];
    },

    /** save：导出世界快照文件（v0.3） */
    save: function (args, ctx) {
      if (FS.app.exportSnapshot) FS.app.exportSnapshot();
      return [];
    },

    /** load：选择快照文件导入（v0.3） */
    load: function (args, ctx) {
      if (FS.app.importSnapshot) FS.app.importSnapshot();
      return [];
    },

    reset: function (args, ctx) {
      var world = ctx.world();
      var roster = ctx.roster();
      var now = ctx.now();
      /* 换一场新世界：与"刷新页面"等价 */
      if (FS.ai.dialogue) {
        roster.list.forEach(function (a) { FS.ai.dialogue.endByAgent(world, roster, a, true); });
      }
      var fresh = FS.state.world.create(now);
      FS.app.world = fresh;
      roster.list.forEach(function (a) {
        FS.state.agent.leave(roster, a);
        a.memory.length = 0;
        a.goals.length = 0;
        a.affection = {};
        a.leaving = null;
        a.stats.topicsStarted = 0;
        a.stats.spoken = 0;
        a.stats.moves = 0;
        a.stats.trades = 0;
      });
      FS.state.joins.init(fresh, now);
      FS.state.world.syncRoster(fresh, roster);
      FS.render.log.init(roster);
      FS.render.panel.setWorld(fresh, roster);
      FS.render.panel.rebuild(fresh, roster);
      FS.render.topbar.setWorld(fresh);
      return [ctx.out('log.command.reset', {}, 'WARN')];
    },
  };

  FS.define('cmd.effects', Effects);
})(window.FS);

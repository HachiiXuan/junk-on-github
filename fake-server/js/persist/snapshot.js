/* ==========================================================================
   persist.snapshot —— 世界快照的导出 / 导入（v0.3）
   ==========================================================================
   为什么需要它：本项目刻意**不把世界状态写进 localStorage**
   （见 docs/READMEv0.1.md §7.3：每次打开都是一场新世界）。
   想让世界真正延续，就必须由用户显式地"存一个文件、以后加载回来"。

   快照内容：
     meta      版本号、导出时间、地图、种子、世界纪元（相对基准）
     world     时间基准、天气、资源、全局记忆、痕迹、加入计划、指名回归队列
     agents    在线状态、位置、生命、心情、好感、记忆、目标、背包、统计
     traces    死者痕迹（提及次数 / 是否传说）

   设计要点：
     · 时间用"相对导出时刻的偏移"保存，导入时按当前时刻还原；
       这样离线几小时后再导入，世界不会突然跳到未来。
     · 导入前先校验（版本、结构、大小），失败就报错而不是把世界搞坏。
     · 导入后重建 roster 索引，并让对话/面板重新绑定。
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }
  var RNG = FS.core.rng;
  var U = FS.core.util;
  var Agents = FS.state.agent;

  var Snapshot = {
    /** 导出成普通对象（可直接 JSON.stringify） */
    export: function (world, roster) {
      var now = Date.now();
      var C = CFG();

      return {
        format: 'fake-server-snapshot',
        version: C.snapshotVersion,
        exportedAtMs: now,
        mapName: world.mapName,
        seed: RNG.getSeed(),
        world: {
          /* 时间基准用相对偏移保存：导入时换算回"当前时刻" */
          epochOffsetMs: world.worldStartMs - now,
          realPlayMs: world.realPlayMs || 0,
          startDay: world.startDay,
          startHour: world.startHour,
          speedMul: world.speedMul,
          tick: world.tick,
          weather: world.weather,
          weatherLeftTicks: world.weatherLeftTicks,
          resources: U.clone(world.resources),
          globalMemory: U.clone(world.globalMemory),
          eventCooldown: U.clone(world.eventCooldown),
          traces: U.clone(world.traces || []),
          joinCount: world.joinCount,
          longTailAnchorMs: world.longTailAnchorMs,
          pendingJoins: U.clone(world.pendingJoins || []),
          rejoins: U.clone(world.rejoins || []),
          nextJoinAtMs: world.nextJoinAtMs,
        },
        agents: roster.list.map(function (a) {
          return {
            id: a.id,
            name: a.name,
            colorIndex: a.colorIndex,
            style: a.style,
            personality: U.clone(a.personality),
            state: U.clone(a.state),
            dead: !!a.dead,
            respawnTicks: a.respawnTicks || 0,
            deathCount: a.deathCount || 0,
            affection: U.clone(a.affection),
            memory: U.clone(a.memory),
            goals: U.clone(a.goals),
            inventory: U.clone(a.inventory),
            stats: U.clone(a.stats),
            leaveReasonKey: a.leaveReasonKey,
            cameBackCount: a.cameBackCount || 0,
            /* 在线时长是"真实经过时间"，导入时整体平移，保留剩余时长 */
            onlineMsAtExport: a.state.online ? Agents.onlineMs(a, now) : 0,
          };
        }),
      };
    },

    /** 导出成 JSON 文本 */
    toJSON: function (world, roster) {
      return JSON.stringify(Snapshot.export(world, roster), null, 2);
    },

    /** 文件名校如 AURORA-01-snapshot-20260214-1530.json */
    fileName: function (world) {
      var d = new Date();
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      return (world.mapName || 'world') + '-snapshot-'
        + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
        + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
    },

    /**
     * 校验快照结构。
     * @returns {{ok:boolean, error?:string, data?:object}}
     */
    validate: function (raw) {
      var C = CFG();
      if (typeof raw === 'string') {
        if (raw.length > C.snapshotMaxBytes) {
          return { ok: false, error: 'file too large' };
        }
        try {
          raw = JSON.parse(raw);
        } catch (e) {
          return { ok: false, error: 'not valid JSON' };
        }
      }
      if (!raw || typeof raw !== 'object') return { ok: false, error: 'empty snapshot' };
      if (raw.format !== 'fake-server-snapshot') return { ok: false, error: 'not a snapshot file' };
      if (typeof raw.version !== 'number') return { ok: false, error: 'missing version' };
      if (raw.version > C.snapshotVersion) {
        return { ok: false, error: 'snapshot from a newer version (v' + raw.version + ')' };
      }
      if (!raw.world || !raw.agents || !U.isArrayLike(raw.agents)) {
        return { ok: false, error: 'snapshot is missing world/agents' };
      }
      /* 至少要有一个 agent 能对上当前的角色表 */
      var known = {};
      FS.data.agents.forEach(function (d) { known[d.id] = 1; });
      var hit = 0;
      for (var i = 0; i < raw.agents.length; i++) {
        if (known[raw.agents[i].id]) hit++;
      }
      if (!hit) return { ok: false, error: 'snapshot has no matching players' };
      return { ok: true, data: raw };
    },

    /**
     * 把快照应用到运行中的世界。
     * @param {object} data 已校验的快照
     * @returns {{ok:boolean, error?:string, info?:object}}
     */
    apply: function (data, app) {
      var now = Date.now();
      var world = app.world;
      var roster = app.roster;
      var sw = data.world;

      /* ---- 世界 ---- */
      world.worldStartMs = now + (sw.epochOffsetMs || 0);
      world.realPlayMs = sw.realPlayMs || 0;
      world.startDay = sw.startDay || 1;
      world.startHour = sw.startHour != null ? sw.startHour : CFG().worldEpochHour;
      world.speedMul = sw.speedMul || 1;
      world.tick = sw.tick || 0;
      world.weather = sw.weather || world.weather;
      world.weatherLeftTicks = sw.weatherLeftTicks || world.weatherLeftTicks;
      world.resources = U.clone(sw.resources) || world.resources;
      world.globalMemory = U.clone(sw.globalMemory) || [];
      world.eventCooldown = U.clone(sw.eventCooldown) || {};
      world.traces = U.clone(sw.traces) || [];
      world.joinCount = sw.joinCount || 0;
      world.longTailAnchorMs = sw.longTailAnchorMs || 0;
      world.pendingJoins = U.clone(sw.pendingJoins) || [];
      world.rejoins = U.clone(sw.rejoins) || [];
      world.nextJoinAtMs = sw.nextJoinAtMs || 0;

      /* ---- 角色 ---- */
      var byId = {};
      data.agents.forEach(function (s) { byId[s.id] = s; });

      roster.list.forEach(function (a) {
        var s = byId[a.id];
        if (!s) {
          /* 快照里没这个人：重置为初始状态，避免残留旧进度 */
          Agents.leave(roster, a);
          a.memory.length = 0;
          a.goals.length = 0;
          a.affection = {};
          a.dead = false;
          a.leaving = null;
          a.state.hp = 100;
          a.state.permanentDeath = false;
          return;
        }
        a.personality = U.clone(s.personality) || a.personality;
        a.state = U.clone(s.state);
        a.dead = !!s.dead;
        a.respawnTicks = s.respawnTicks || 0;
        a.deathCount = s.deathCount || 0;
        a.affection = U.clone(s.affection) || {};
        a.memory = U.clone(s.memory) || [];
        a.goals = U.clone(s.goals) || [];
        a.inventory = U.clone(s.inventory) || {};
        a.stats = U.clone(s.stats) || a.stats;
        a.leaveReasonKey = s.leaveReasonKey || null;
        a.cameBackCount = s.cameBackCount || 0;
        a.typing = null;          // 导入后不保留"正在打字"，避免半截消息
        a.idleTicks = 0;
        a.decisionCooldown = 0;
        a.leaving = null;
        /* 在线时长整体平移：保留"他已经玩了多久" */
        a.onlineSinceMs = s.state.online ? (now - (s.onlineMsAtExport || 0)) : 0;
      });

      if (data.seed != null) RNG.seed(data.seed);

      FS.state.world.syncTime(world, now);
      FS.state.world.syncRoster(world, roster);

      /* ---- 让依赖 roster / world 的模块重新绑定 ---- */
      if (FS.ai.dialogue) FS.ai.dialogue.reset();
      FS.render.log.init(roster);
      FS.render.panel.setWorld(world, roster);
      FS.render.panel.rebuild(world, roster);
      FS.render.topbar.setWorld(world);

      return {
        ok: true,
        info: {
          version: data.version,
          exportedAtMs: data.exportedAtMs,
          agents: data.agents.length,
          online: world.online.length,
          traces: (world.traces || []).length,
          day: world.time.day,
        },
      };
    },

    /* ---------------- 浏览器文件交互 ---------------- */

    /** 触发下载 */
    download: function (world, roster) {
      var text = Snapshot.toJSON(world, roster);
      var name = Snapshot.fileName(world);
      try {
        var blob = new Blob([text], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        return { ok: true, name: name, bytes: text.length };
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },

    /**
     * 弹出文件选择器并导入。
     * @param {function} done 回调 (result)
     */
    pickAndImport: function (app, done) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) { done && done({ ok: false, error: 'no file' }); return; }
        var reader = new FileReader();
        reader.onload = function () {
          var res = Snapshot.importText(String(reader.result), app);
          done && done(res);
        };
        reader.onerror = function () {
          done && done({ ok: false, error: 'read failed' });
        };
        reader.readAsText(file);
      });
      document.body.appendChild(input);
      input.click();
      /* 不立刻移除：某些浏览器需要元素在文档里才能触发选择器 */
      setTimeout(function () {
        if (input.parentNode) input.parentNode.removeChild(input);
      }, 60 * 1000);
    },

    /** 从 JSON 文本导入并应用 */
    importText: function (text, app) {
      var v = Snapshot.validate(text);
      if (!v.ok) return v;
      try {
        return Snapshot.apply(v.data, app);
      } catch (e) {
        return { ok: false, error: String(e && e.message ? e.message : e) };
      }
    },
  };

  FS.define('persist.snapshot', Snapshot);
})(window.FS);

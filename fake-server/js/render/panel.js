/* ==========================================================================
   render.panel —— 右侧调试面板
   面向开发者：信息密集、直接，不做美化。
   刷新频率由 config.panelRefreshTicks 控制（默认 1 秒），避免每 tick 重排。
   语言切换或历史重放时整块重建（rebuild）。
   ========================================================================== */
(function (FS) {
  'use strict';

  var CFG = FS.data.config;
  var U = FS.core.util;
  var I18N = FS.core.i18n;
  var Clock = FS.core.clock;
  var Log = FS.render.log;

  var refs = {};            // 需要每帧更新的节点
  var built = false;
  var selectedAgentId = null;
  var world = null, roster = null;

  /* ---------- 历史快照（快进期间面板不刷新，先把 HTML 存下来） ---------- */
  var history = { count: 0, lines: [], events: [], limit: 60 };

  var Panel = {
    init: function (w, r) {
      world = w;
      roster = r;
      built = false;
      selectedAgentId = null;
      Panel.rebuild(w, r);
      return Panel;
    },

    setWorld: function (w, r) {
      world = w;
      roster = r;
    },

    /* ---------------- 历史快照 ---------------- */

    beginHistory: function () {
      history.count = world ? world.tick : 0;
      history.lines = [];
      history.events = [];
    },

    /** 快进期间只记录，不建 DOM */
    recordHistoryLine: function (entry) {
      var r = Log.describe(entry);
      var html = Log.htmlOf(r);
      history.lines.push(html);
      if (history.lines.length > 200) history.lines.shift();
      return html;
    },

    recordHistoryEvent: function (text) {
      history.events.push(text);
      if (history.events.length > 30) history.events.shift();
    },

    historyInfo: function () {
      return { count: history.count, lines: history.lines, events: history.events };
    },

    /* ---------------- 整块重建 ---------------- */

    rebuild: function (w, r) {
      if (w) world = w;
      if (r) roster = r;
      if (!world || !roster) return;

      var body = document.getElementById('panelBody');
      if (!body) return;
      body.textContent = '';
      refs = {};

      /* --- 世界 --- */
      var wb = section(body, I18N.t('panel.world'));
      var kv = div(wb, 'kv');
      refs.map = kvRow(kv, I18N.t('panel.map'), world.mapName);
      refs.time = kvRow(kv, I18N.t('panel.time'), '');
      refs.weather = kvRow(kv, I18N.t('panel.weather'), '');
      refs.online = kvRow(kv, I18N.t('panel.online'), '');
      refs.tick = kvRow(kv, I18N.t('panel.tick'), '');
      refs.nextJoin = kvRow(kv, I18N.t('panel.nextJoin'), '');

      /* --- 最近事件（历史回放的内容先塞进去，之后清空避免重复） --- */
      var eb = section(body, I18N.t('panel.events'));
      var list = div(eb, 'plist');
      refs.eventsList = list;
      for (var i = history.events.length - 1; i >= 0; i--) {
        addEventRow(list, '', history.events[i], false);
      }
      history.events.length = 0;

      /* --- 角色列表 --- */
      var ab = section(body, I18N.t('panel.agents'));
      var alist = div(ab, 'agent-list');
      refs.agentsList = alist;
      refs.agentRows = {};
      refs.agentDetails = {};
      for (var j = 0; j < roster.list.length; j++) {
        buildAgentRow(alist, roster.list[j]);
      }

      /* --- 调参（v0.2）：改完立即生效，不用改代码 --- */
      var tb = section(body, I18N.t('panel.tuning'));
      var hint = div(tb, 'panel-foot');
      hint.textContent = I18N.t('panel.tuningHint');
      refs.tuningInputs = {};
      buildTunerGroups(tb);
      var reset = document.createElement('button');
      reset.className = 'chip';
      reset.textContent = I18N.t('panel.tuningReset');
      reset.addEventListener('click', function () {
        FS.data.config.debugJoins = false;
        FS.data.config.debugLeave = false;
        FS.render.panel.rebuild(world, roster);
      });
      tb.appendChild(reset);

      /* --- 世界快照（v0.3）：导出 / 导入文件 --- */
      var sb = section(body, I18N.t('panel.snapshot'));
      var sh = div(sb, 'panel-foot');
      sh.textContent = I18N.t('panel.snapshotHint');
      var srow = document.createElement('div');
      srow.style.display = 'flex';
      srow.style.gap = '6px';
      srow.style.marginTop = '4px';

      var exp = document.createElement('button');
      exp.className = 'chip';
      exp.textContent = I18N.t('panel.snapshotExport');
      exp.addEventListener('click', function () {
        FS.app.exportSnapshot();
      });

      var imp = document.createElement('button');
      imp.className = 'chip';
      imp.textContent = I18N.t('panel.snapshotImport');
      imp.addEventListener('click', function () {
        FS.app.importSnapshot();
      });

      srow.appendChild(exp);
      srow.appendChild(imp);
      sb.appendChild(srow);

      /* --- 快进（v1.2）：把"接下来 2 分钟真实时间"一次性算完 --- */
      var fb = section(body, I18N.t('panel.fastForward'));
      var fh = div(fb, 'panel-foot');
      fh.textContent = I18N.t('panel.fastForwardHint');
      var frow = document.createElement('div');
      frow.style.display = 'flex';
      frow.style.gap = '6px';
      frow.style.marginTop = '4px';
      frow.style.flexWrap = 'wrap';

      var FF_MINUTES = [1, 2, 5];
      for (var fi = 0; fi < FF_MINUTES.length; fi++) {
        (function (mins) {
          var b = document.createElement('button');
          b.className = 'chip';
          b.dataset.ff = String(mins);
          b.textContent = I18N.t('panel.fastForwardBtn', { n: mins });
          b.addEventListener('click', function () {
            FS.app.fastForward(mins);
          });
          frow.appendChild(b);
        })(FF_MINUTES[fi]);
      }
      fb.appendChild(frow);

      /* --- 底部说明 --- */
      var foot = div(body, 'panel-foot');
      foot.textContent = I18N.t('panel.foot');

      built = true;
      Panel.render();
      return Panel;
    },

    /* ---------------- 每秒刷新 ---------------- */

    render: function () {
      if (!built || !world || !roster) return;
      if (document.getElementById('main').classList.contains('panel-collapsed')) return;

      var t = world.time;

      setVal(refs.time, Clock.hhmm(t) + '  ' + I18N.t('ui.day', { n: t.day }));
      setVal(refs.weather, I18N.tx('weather', world.weather)
        + '  (' + I18N.t('panel.weatherLeft') + ' '
        + fmtTicksAsGameMinutes(world.weatherLeftTicks) + ')');
      var onlineN = world.online.length;
      setVal(refs.online, onlineN + ' / ' + CFG.maxPlayers);
      if (refs.online) {
        refs.online.className = 'v' + (onlineN > 0 ? ' hi' : '');
      }
      setVal(refs.tick, String(world.tick) + '   seed=' + FS.core.rng.getSeed());
      setVal(refs.nextJoin, nextJoinText());

      /* 角色行 */
      for (var i = 0; i < roster.list.length; i++) {
        updateAgentRow(roster.list[i]);
      }

      /* 角色详情：每帧全部清掉，只为当前选中的那一个重建。
         早先的写法是"从选中行的 nextSibling 找详情块再删"，
         依赖插入顺序，遇到详情插在 agent-list 之外就会漏删、越点越多。
         注意：childNodes 是实时 NodeList，没有 slice()，必须先拷成真数组。 */
      var list = refs.agentsList;
      var kids = [];
      for (var n = 0; n < list.childNodes.length; n++) kids.push(list.childNodes[n]);
      for (var k = 0; k < kids.length; k++) {
        var c = kids[k];
        if (c.classList && c.classList.contains('agent-detail')) list.removeChild(c);
      }
      if (selectedAgentId && refs.agentRows[selectedAgentId]) {
        renderDetail(refs.agentRows[selectedAgentId], roster.byId[selectedAgentId]);
      }
    },

    renderEvent: function (tsText, text, hot) {
      if (!refs.eventsList) return;
      addEventRow(refs.eventsList, tsText, text, hot);
    },

    toggleAgent: function (agentId) {
      selectedAgentId = (selectedAgentId === agentId) ? null : agentId;
      Panel.render();
    },

    getSelected: function () { return selectedAgentId; },
  };

  /* ---------------- DOM 小工具 ---------------- */

  function section(parent, title) {
    var b = document.createElement('div');
    b.className = 'pblock';
    var h = document.createElement('h4');
    h.textContent = title;
    b.appendChild(h);
    parent.appendChild(b);
    return b;
  }

  function div(parent, cls) {
    var d = document.createElement('div');
    if (cls) d.className = cls;
    parent.appendChild(d);
    return d;
  }

  function kvRow(parent, k, v) {
    var kd = document.createElement('div');
    kd.className = 'k';
    kd.textContent = k;
    var vd = document.createElement('div');
    vd.className = 'v';
    vd.textContent = v || '';
    parent.appendChild(kd);
    parent.appendChild(vd);
    return vd;
  }

  function setVal(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  function addEventRow(list, ts, text, hot) {
    var row = document.createElement('div');
    row.className = 'row' + (hot ? ' hot' : '');
    var t = document.createElement('span');
    t.className = 't tnum';
    t.textContent = ts || '';
    var d = document.createElement('span');
    d.className = 'd';
    d.textContent = text;
    row.appendChild(t);
    row.appendChild(d);
    list.insertBefore(row, list.firstChild);
    while (list.childNodes.length > CFG.panelEventLines) {
      list.removeChild(list.lastChild);
    }
  }

  /* ---------------- 角色行 ---------------- */

  function buildAgentRow(parent, agent) {
    var row = document.createElement('div');
    row.className = 'agent-row';
    row.dataset.agent = agent.id;

    var n = document.createElement('span');
    n.className = 'an';
    n.textContent = agent.name;
    n.style.color = FS.data.colors.agents[agent.colorIndex % FS.data.colors.agents.length];

    var st = document.createElement('span');
    st.className = 'st';

    var meta = document.createElement('span');
    meta.className = 'meta';

    var aff = document.createElement('span');
    aff.className = 'aff';

    row.appendChild(n);
    row.appendChild(st);
    row.appendChild(meta);
    row.appendChild(aff);

    row.addEventListener('click', function () {
      Panel.toggleAgent(agent.id);
    });

    parent.appendChild(row);
    refs.agentRows[agent.id] = row;
    refs.agentRows[agent.id]._cells = { st: st, meta: meta, aff: aff };
    return row;
  }

  function updateAgentRow(agent) {
    var row = refs.agentRows && refs.agentRows[agent.id];
    if (!row) return;
    var c = row._cells;
    var on = agent.state.online;

    row.classList.toggle('offline', !on);
    c.st.className = 'st' + (on ? ' on' : '');
    c.st.textContent = on ? '\u25cf' : '\u25cb';   // ● / ○

    if (on) {
      var goal = agent.goals.length ? I18N.tx('goal', agent.goals[0].id) : I18N.t('panel.none');
      var bits = [goal, I18N.tx('mood', agent.state.mood), I18N.tx('place', agent.state.place)];
      if (agent.dialogue.instanceId) bits.push('[' + I18N.t('panel.topic') + ']');
      else if (agent.typing) bits.push('[' + I18N.t('panel.typing') + ']');
      else if (agent.idleTicks > 0) bits.push('[' + I18N.t('panel.idle') + ']');
      c.meta.textContent = bits.join(' · ');
      // 好感：显示对该角色的最高好感对象
      c.aff.textContent = topAffectionText(agent);
    } else {
      c.meta.textContent = I18N.t('panel.none');
      c.aff.textContent = '';
    }
  }

  function topAffectionText(agent) {
    var best = null, bestV = -1;
    for (var id in agent.affection) {
      if (!Object.prototype.hasOwnProperty.call(agent.affection, id)) continue;
      if (agent.affection[id] > bestV) { bestV = agent.affection[id]; best = id; }
    }
    if (!best) return String(FS.state.agent.NEUTRAL_AFFECTION);
    return bestV + '';
  }

  /* ---------------- 角色详情 ---------------- */

  function renderDetail(row, agent) {
    /* 先无条件清掉这一行后面已经存在的详情块。
       顺序很重要：早先的写法是"没有 agent 就直接 return"，
       结果取消选中时旧详情永远不会被移除（表现为点第二次收不起来）。 */
    var next = row.nextSibling;
    while (next && next.classList && next.classList.contains('agent-detail')) {
      var kill = next;
      next = next.nextSibling;
      row.parentNode.removeChild(kill);
    }
    if (!agent) return;

    var d = document.createElement('div');
    d.className = 'agent-detail';

    detailRow(d, I18N.t('panel.hp'), agent.state.hp + ' / 100');
    detailRow(d, I18N.t('panel.place'), I18N.tx('place', agent.state.place));
    detailRow(d, I18N.t('panel.mood'), I18N.tx('mood', agent.state.mood));

    /* 小团体 / 原型：看得出这人扮演什么角色、和谁一伙（v1.1） */
    var fac = FS.state.faction ? FS.state.faction.of(world, agent.id) : null;
    if (fac) {
      var mates = fac.memberIds.length - 1;
      detailRow(d, I18N.t('panel.faction'),
        fac.name + '（' + I18N.t('panel.factionMates', { n: mates }) + '）');
    } else {
      detailRow(d, I18N.t('panel.faction'), I18N.t('panel.none'));
    }
    if (agent.archetype) {
      detailRow(d, I18N.t('panel.archetype'), I18N.t('panel.arch.' + agent.archetype));
    }

    detailRow(d, I18N.t('panel.uptime'), fmtDuration(FS.state.agent.onlineMs(agent, Date.now())));
    detailRow(d, I18N.t('panel.state'), (agent.typing ? I18N.t('panel.typing') : '')
      + (agent.idleTicks > 0 ? ' ' + I18N.t('panel.idle') + ' ' + agent.idleTicks : ''));

    /* 目标 */
    var goals = agent.goals.map(function (g) {
      return I18N.tx('goal', g.id) + '(' + g.priority + ')';
    }).join(', ');
    detailRow(d, I18N.t('panel.goal'), goals || I18N.t('panel.none'));

    /* 好感（全部） */
    var affParts = [];
    for (var id in agent.affection) {
      if (!Object.prototype.hasOwnProperty.call(agent.affection, id)) continue;
      affParts.push(I18N.t('name.' + id) + ' ' + agent.affection[id]);
    }
    detailRow(d, I18N.t('panel.affection'), affParts.join(', ') || I18N.t('panel.none'));

    /* 最近记忆 */
    var memBox = document.createElement('div');
    memBox.className = 'tags';
    var mems = agent.memory.slice(-5).reverse();
    for (var i = 0; i < mems.length; i++) {
      var m = mems[i];
      var tag = document.createElement('span');
      var imp = m.importance >= 0.6 ? ' r' : (m.importance >= 0.35 ? ' y' : '');
      tag.className = 'tag' + imp;
      tag.textContent = I18N.t(m.key, I18N.localizeVars(m.vars));
      memBox.appendChild(tag);
    }
    var mrow = document.createElement('div');
    mrow.className = 'row';
    var mk = document.createElement('span');
    mk.className = 'k';
    mk.textContent = I18N.t('panel.memories');
    mrow.appendChild(mk);
    var mv = document.createElement('span');
    mv.className = 'k2';
    mv.textContent = String(agent.memory.length);
    mrow.appendChild(mv);
    d.appendChild(mrow);
    d.appendChild(memBox);

    /* 累计统计 */
    var st = agent.stats;
    detailRow(d, I18N.t('panel.stats'),
      I18N.t('panel.statSpoken') + ' ' + st.spoken
      + ' · ' + I18N.t('panel.statTopics') + ' ' + st.topicsStarted
      + ' · ' + I18N.t('panel.statMoves') + ' ' + st.moves);

    /* 候选动作分数明细 —— 调参主要靠这个 */
    var sh = document.createElement('div');
    sh.className = 'row';
    var shk = document.createElement('span');
    shk.className = 'k';
    shk.textContent = I18N.t('panel.scores');
    sh.appendChild(shk);
    var shv = document.createElement('span');
    shv.className = 'k2';
    shv.textContent = agent._lastScores ? '' : I18N.t('panel.noScores');
    sh.appendChild(shv);
    d.appendChild(sh);

    if (agent._lastScores && agent._lastScores.length) {
      /* 分数是"上一次真正做决策时"算的。打字中 / 挂机中 / 等回应时不会重新决策，
         所以要标明时间与当时的目标，否则会看起来和当前状态对不上。 */
      var decidedTick = agent._lastDecisionTick || 0;
      var ageTicks = Math.max(0, world.tick - decidedTick);
      var ageSec = Math.round(ageTicks * CFG.tickMs / 1000);
      var busy = !!(agent.typing || agent.idleTicks > 0 || agent.dialogue.awaitingReply);
      var note = document.createElement('div');
      note.className = 'score-note';
      var goalTxt = agent._lastDecisionGoal
        ? I18N.tx('goal', agent._lastDecisionGoal) : I18N.t('panel.none');
      note.textContent = I18N.t('panel.scoresWhen', { s: ageSec, goal: goalTxt })
        + (busy ? '  ·  ' + I18N.t('panel.scoresStale') : '');
      d.appendChild(note);

      /* 为什么他最近没说话：等回应 / 刚聊完 / 落地期 / 并发上限。
         没有这行的话，面板只能显示"目标 --"，看不出是被节奏约束住了。 */
      if (agent._lastSpeakBlocked) {
        var br = document.createElement('div');
        br.className = 'score-note';
        br.textContent = I18N.t('panel.speakBlocked.' + agent._lastSpeakBlocked)
          + (agent.waitingOnId
            ? '（' + I18N.t('name.' + agent.waitingOnId) + '）' : '');
        d.appendChild(br);
      }

      var table = document.createElement('div');
      table.className = 'score-table';
      var hdr = document.createElement('div');
      hdr.className = 'hdr';
      hdr.innerHTML = '';
      var hn = document.createElement('span'); hn.textContent = 'action';
      var hs = document.createElement('span'); hs.textContent = 'score';
      hdr.appendChild(hn); hdr.appendChild(hs);
      table.appendChild(hdr);

      var best = -1;
      for (var k = 0; k < agent._lastScores.length; k++) {
        if (agent._lastScores[k].score > best) best = agent._lastScores[k].score;
      }
      for (var s = 0; s < agent._lastScores.length; s++) {
        var sc = agent._lastScores[s];
        var r = document.createElement('div');
        r.className = 'score-row' + (sc.score === best ? ' top' : '');
        var nn = document.createElement('span');
        nn.className = 'n';
        nn.textContent = sc.actionId + (sc.target ? ' \u2192 ' + I18N.t('name.' + sc.target) : '');
        var ss = document.createElement('span');
        ss.className = 's';
        ss.textContent = sc.score.toFixed(3);
        r.appendChild(nn);
        r.appendChild(ss);
        table.appendChild(r);

        if (sc.factors) {
          var f = document.createElement('div');
          f.className = 'factors';
          var parts = [];
          for (var fk in sc.factors) {
            if (Object.prototype.hasOwnProperty.call(sc.factors, fk)) {
              var fv = sc.factors[fk];
              /* settle 是布尔标记（落地期压制），显示成文字更好读 */
              parts.push(fv === true ? fk : fk + '=' + round2(fv));
            }
          }
          f.textContent = parts.join('  ');
          table.appendChild(f);
        }
      }
      d.appendChild(table);
    }

    row.parentNode.insertBefore(d, row.nextSibling);
  }

  function detailRow(parent, k, v) {
    var r = document.createElement('div');
    r.className = 'row';
    var kd = document.createElement('span');
    kd.className = 'k';
    kd.textContent = k;
    var vd = document.createElement('span');
    vd.className = 'k2';
    vd.textContent = v;
    r.appendChild(kd);
    r.appendChild(vd);
    parent.appendChild(r);
    return r;
  }

  /* ---------------- 实时调参（v0.2 / v0.4 扩展） ----------------
     改的是 FS.data.config 里的字段，引擎每个 tick 都会重新读，
     所以不需要重启世界。这是调"像不像真人"最快的路径。

     group 用来在面板上分组显示；path 支持点号路径（如 baseWeight.speak）。 */
  Panel.knobs = [
    /* 调试开关 */
    { key: 'debugJoins', type: 'bool', label: 'debugJoins', group: 'debug' },
    { key: 'debugLeave', type: 'bool', label: 'debugLeave', group: 'debug' },
    { key: 'debugSettle', type: 'bool', label: 'debugSettle', group: 'debug' },
    { key: 'debugLogs', type: 'bool', label: 'debugLogs', group: 'debug' },
    { key: 'tickMs', type: 'num', label: 'tickMs', min: 50, max: 2000, step: 50, group: 'debug' },

    /* 动作基础权重 —— 最影响"像不像真人"的一组 */
    { key: 'baseWeight.speak', type: 'num', label: 'speak', min: 0, max: 6, step: 0.05, group: 'weight' },
    { key: 'baseWeight.reply', type: 'num', label: 'reply', min: 0, max: 12, step: 0.1, group: 'weight' },
    { key: 'baseWeight.move', type: 'num', label: 'move', min: 0, max: 6, step: 0.05, group: 'weight' },
    { key: 'baseWeight.trade', type: 'num', label: 'trade', min: 0, max: 6, step: 0.05, group: 'weight' },
    { key: 'baseWeight.gather', type: 'num', label: 'gather', min: 0, max: 6, step: 0.05, group: 'weight' },
    { key: 'baseWeight.fight', type: 'num', label: 'fight', min: 0, max: 6, step: 0.05, group: 'weight' },
    { key: 'baseWeight.wait', type: 'num', label: 'wait', min: 0, max: 6, step: 0.05, group: 'weight' },

    /* 对话节奏 —— 调"会不会抢话 / 冷场" */
    { key: 'maxActiveTopics', type: 'num', label: 'maxActiveTopics', min: 1, max: 8, step: 1, group: 'talk' },
    { key: 'maxTopicsPerAgent', type: 'num', label: 'maxTopicsPerAgent', min: 1, max: 4, step: 1, group: 'talk' },
    { key: 'topicCooldownTicks.0', type: 'num', label: 'topicCooldown.min', min: 0, max: 1200, step: 10, group: 'talk' },
    { key: 'topicCooldownTicks.1', type: 'num', label: 'topicCooldown.max', min: 0, max: 2400, step: 10, group: 'talk' },
    { key: 'denyTopicChanceWhileBusy', type: 'num', label: 'denyWhileBusy', min: 0, max: 1, step: 0.05, group: 'talk' },
    { key: 'settleInGameMinutes', type: 'num', label: 'settleInGameMin', min: 0, max: 720, step: 5, group: 'talk' },

    /* 生死与离开 */
    { key: 'deathChancePerFight', type: 'num', label: 'deathChance', min: 0, max: 1, step: 0.02, group: 'life' },
    { key: 'legendMentions', type: 'num', label: 'legendMentions', min: 1, max: 10, step: 1, group: 'life' },
    { key: 'leaveMaxChancePerTick', type: 'num', label: 'leavePeak', min: 0, max: 0.05, step: 0.0005, group: 'life' },
    { key: 'logoutAfterMs', type: 'num', label: 'logoutAfterMin', min: 0.5, max: 240, step: 0.5, group: 'life', scale: 60000 },
  ];

  /** 支持 "baseWeight.speak"、"topicCooldownTicks.0" 这种点号路径 */
  function knobGet(path) {
    var parts = String(path).split('.');
    var cur = FS.data.config;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function knobSet(path, value) {
    var parts = String(path).split('.');
    var cur = FS.data.config;
    for (var i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null) return false;
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    return true;
  }

  /** 取显示值（leaveAfterMs 这类以毫秒存的，面板里用分钟更直观） */
  function knobDisplay(knob) {
    var v = knobGet(knob.key);
    if (knob.scale) return Math.round((v / knob.scale) * 100) / 100;
    return v;
  }

  function buildTuner(parent, knob) {
    var row = document.createElement('div');
    row.className = 'kv';
    var k = document.createElement('div');
    k.className = 'k';
    k.textContent = knob.label;
    row.appendChild(k);
    var v = document.createElement('div');
    v.className = 'v';
    row.appendChild(v);

    if (knob.type === 'bool') {
      var btn = document.createElement('button');
      btn.className = 'chip';
      btn.dataset.knob = knob.key;
      var sync = function () {
        var on = !!knobGet(knob.key);
        btn.textContent = on ? 'ON' : 'off';
        btn.classList.toggle('on', on);
      };
      btn.addEventListener('click', function () {
        knobSet(knob.key, !knobGet(knob.key));
        sync();
      });
      sync();
      v.appendChild(btn);
    } else {
      var input = document.createElement('input');
      input.type = 'number';
      input.dataset.knob = knob.key;
      input.min = knob.min;
      input.max = knob.max;
      input.step = knob.step;
      input.value = knobDisplay(knob);
      /* 样式统一放在 css/panel.css 里，别在这里写 inline（难维护也难改主题） */
      input.addEventListener('change', function () {
        var n = parseFloat(input.value);
        if (!isNaN(n)) {
          n = Math.max(knob.min, Math.min(knob.max, n));
          knobSet(knob.key, knob.scale ? n * knob.scale : n);
        }
        input.value = knobDisplay(knob);
      });
      v.appendChild(input);
    }
    parent.appendChild(row);
    if (refs.tuningInputs) refs.tuningInputs[knob.key] = v;
    return row;
  }

  /** 把旋钮按 group 分组渲染 */
  function buildTunerGroups(parent) {
    var groups = [
      { id: 'weight', title: I18N.t('panel.knobGroup.weight') },
      { id: 'talk', title: I18N.t('panel.knobGroup.talk') },
      { id: 'life', title: I18N.t('panel.knobGroup.life') },
      { id: 'debug', title: I18N.t('panel.knobGroup.debug') },
    ];
    var knobs = Panel.knobs || [];
    for (var g = 0; g < groups.length; g++) {
      var mine = knobs.filter(function (k) { return k.group === groups[g].id; });
      if (!mine.length) continue;
      var head = div(parent, 'tune-group');
      head.textContent = groups[g].title;
      for (var i = 0; i < mine.length; i++) buildTuner(parent, mine[i]);
    }
  }

  /* ---------------- 格式化 ---------------- */

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function fmtTicksAsGameMinutes(ticks) {
    var ms = ticks * CFG.tickMs;
    var gameMin = (ms / CFG.realMsPerGameHour) * 60;
    if (gameMin >= 60) return (gameMin / 60).toFixed(1) + 'h';
    return Math.max(0, Math.round(gameMin)) + 'm';
  }

  function fmtDuration(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    var h = Math.floor(m / 60);
    if (h > 0) return h + 'h ' + (m % 60) + 'm';
    if (m > 0) return m + 'm ' + (s % 60) + 's';
    return s + 's';
  }

  function nextJoinText() {
    var ms = FS.state.joins ? FS.state.joins.msToNext(world) : -1;
    if (ms < 0) return I18N.t('panel.none');
    if (ms < 1000) return '<1s';
    var s = Math.round(ms / 1000);
    if (s < 90) return s + 's';
    return Math.round(s / 60) + 'm';
  }

  FS.define('render.panel', Panel);
})(window.FS);

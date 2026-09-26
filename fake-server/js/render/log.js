/* ==========================================================================
   render.log —— 控制台日志：环形缓冲 + 增量 DOM 渲染
   两条硬性规则：
     1. 缓冲只保留最近 logBufferLines 行，DOM 节点数恒定
     2. 存的是 { key, vars }，不是成句文本 —— 所以切语言能整屏重渲染
   ========================================================================== */
(function (FS) {
  'use strict';

  var CFG = FS.data.config;
  var U = FS.core.util;
  var I18N = FS.core.i18n;
  var Colors = FS.data.colors;

  var el = null;            // #log
  var buffer = [];          // 日志条目数组（最新在末尾）
  var nodes = [];           // 与 buffer 一一对应的 DOM 节点
  var seq = 0;
  var autoScroll = true;
  var jumpBtn = null;
  var nameColors = {};      // agentId -> color
  /* 分隔行（历史 / 实时 分界）的位置：记录在"它前面那条日志的 seq"上，
     这样整屏重画时能把它放回原位，而不是丢掉或挪到末尾。 */
  var dividerAtSeq = null;
  var dividerKey = 'ui.historyEnd';

  /** 造一条分隔行（不参与语言切换的位置计算，但文本会跟着语言变） */
  function buildDivider(key) {
    if (!el) return null;
    return buildNode({ divider: true, text: I18N.t(key || dividerKey) });
  }

  /* ---------------- 颜色 ---------------- */

  function assignColors(roster) {
    nameColors = {};
    for (var i = 0; i < roster.list.length; i++) {
      var a = roster.list[i];
      nameColors[a.id] = Colors.agents[a.colorIndex % Colors.agents.length];
    }
    nameColors.console = Colors.console;
  }

  function colorOf(agentId) {
    return nameColors[agentId] || Colors.level.CHAT;
  }

  /* ---------------- 文本生成 ---------------- */

  /**
   * 把一条日志渲染成 { tsText, threadText, levelText, parts }
   * parts 是 [{text, cls}] 的序列，便于给角色名单独上色。
   */
  function renderLine(entry) {
    /* 用户命令回显（kind:'echo'）：整屏重画时也要还原 */
    if (entry.kind === 'echo') {
      return {
        echo: true,
        tsText: entry.tsText || FS.core.clock.logTime(FS.core.clock.now()).text,
        parts: [{ text: entry.text, cls: '' }],
      };
    }

    // raw = 已经拼好的多行文本（命令输出用，不参与语言切换）
    var text;
    if (entry.raw != null) {
      text = String(entry.raw);
    } else if (entry.key) {
      text = I18N.t(entry.key, I18N.localizeVars(entry.vars));
    } else {
      text = '';
    }
    var tsText = entry.tsText || FS.core.clock.logTime(FS.core.clock.now()).text;

    if (entry.level === 'CHAT') {
      var name = I18N.t('name.' + entry.agentId);      // 兜底：角色名 key 不存在时用 id
      if (name.indexOf('\u2039') === 0) name = entry.agentId;
      return {
        tsText: tsText,
        threadText: CFG.threads.chat,
        levelText: 'INFO',
        parts: [
          { text: '<', cls: 'bracket' },
          { text: name, cls: 'name', color: colorOf(entry.agentId) },
          { text: '> ', cls: 'bracket' },
          { text: text, cls: '' },
        ],
        chat: true,
        agentId: entry.agentId,
      };
    }

    var thread = entry.thread === 'chat' ? CFG.threads.chat
      : entry.thread === 'user' ? CFG.threads.user
        : CFG.threads.server;

    return {
      tsText: tsText,
      threadText: thread,
      levelText: entry.level || 'INFO',
      parts: [{ text: text, cls: 'msg' }],
      chat: false,
      agentId: entry.agentId,
    };
  }

  /** 用一条渲染描述创建 DOM 行 */
  function buildNode(r) {
    var line = document.createElement('div');
    line.className = 'logline'
      + (r.chat ? ' chat' : '')
      + (r.divider ? ' divider' : '')
      + (r.quiet ? ' quiet' : '')
      + (r.echo ? ' echo' : '')
      + (r.chat ? '' : ' lv-' + (r.levelText || 'INFO'));

    if (r.divider) {
      line.textContent = r.text;
      return line;
    }

    var ts = document.createElement('span');
    ts.className = 'ts tnum';
    ts.textContent = r.tsText;
    line.appendChild(ts);

    if (r.echo) {
      // 用户输入回显：不显示线程与级别
      var body0 = document.createElement('span');
      body0.className = 'body';
      body0.style.gridColumn = '2 / -1';
      for (var q = 0; q < r.parts.length; q++) {
        body0.appendChild(span(r.parts[q]));
      }
      line.appendChild(body0);
      return line;
    }

    var th = document.createElement('span');
    th.className = 'thread';
    th.textContent = r.threadText || '';
    line.appendChild(th);

    var body = document.createElement('span');
    body.className = 'body';

    var lv = document.createElement('span');
    lv.className = 'lv';
    lv.textContent = '[' + (r.levelText || 'INFO') + ']:';
    body.appendChild(lv);
    body.appendChild(document.createTextNode(' '));

    for (var i = 0; i < r.parts.length; i++) {
      body.appendChild(span(r.parts[i]));
    }
    line.appendChild(body);

    return line;
  }

  function span(p) {
    if (!p.cls) return document.createTextNode(p.text);
    var n = document.createElement('span');
    n.className = p.cls;
    if (p.cls === 'name') n.style.color = p.color || Colors.level.CHAT;
    n.textContent = p.text;
    return n;
  }

  /* ---------------- 公共 API ---------------- */

  var Log = {
    /** 绑定 DOM 并建立角色配色 */
    init: function (roster) {
      el = document.getElementById('log');
      jumpBtn = document.getElementById('jumpLatest');
      assignColors(roster);

      el.addEventListener('scroll', function () {
        var dist = el.scrollHeight - el.scrollTop - el.clientHeight;
        var atBottom = dist < 24;
        if (atBottom !== autoScroll) {
          autoScroll = atBottom;
          if (jumpBtn) jumpBtn.classList.toggle('show', !autoScroll && buffer.length > 0);
        }
      });

      if (jumpBtn) {
        jumpBtn.addEventListener('click', function () {
          Log.scrollToBottom();
        });
      }
      return Log;
    },

    /**
     * 追加一条日志。
     * @param {object} entry { key, vars, level, thread, agentId, tsText }
     * @param {boolean} [silent] true = 只入缓冲不建 DOM（快进时用）
     */
    push: function (entry, silent) {
      entry = entry || {};
      entry.seq = ++seq;
      if (entry.tsText == null) {
        entry.tsText = FS.core.clock.logTime(Date.now()).text;
      }
      buffer.push(entry);
      if (buffer.length > CFG.logBufferLines) {
        buffer.splice(0, buffer.length - CFG.logBufferLines);
        if (nodes.length) {
          var old = nodes.shift();
          if (old && old.parentNode) old.parentNode.removeChild(old);
        }
      }
      if (!silent) {
        var r = renderLine(entry);
        var node = buildNode(r);
        nodes.push(node);
        el.appendChild(node);
        if (autoScroll) Log.scrollToBottom();
      }
      return entry;
    },

    /** 批量追加（一个 tick 内产生的多条），减少重排次数 */
    pushMany: function (entries, silent) {
      if (!entries || !entries.length) return;
      for (var i = 0; i < entries.length; i++) Log.push(entries[i], silent);
    },

    /**
     * 用户输入的命令回显（> kill steve）。
     * ⚠️ 必须进**缓冲**，不能只往 DOM 里塞一行 ——
     * 否则切屏/切语言/导入快照后整屏重画时，用户敲过的命令会全部消失。
     * 用 kind:'echo' 标记，重画时同样渲染成回显样式。
     */
    echo: function (text) {
      return Log.push({
        kind: 'echo',
        text: String(text == null ? '' : text),
        tsText: FS.core.clock.logTime(Date.now()).text,
      });
    },

    /** 插入一条纯文本分隔行：位置记在"它前面那条日志"上，整屏重画时能复原 */
    divider: function (textKey) {
      dividerKey = textKey || dividerKey;
      dividerAtSeq = buffer.length ? buffer[buffer.length - 1].seq : 0;
      var node = buildDivider(dividerKey);
      if (node) el.appendChild(node);
      if (autoScroll) Log.scrollToBottom();
      return node;
    },

    /** 用户输入回显（> xxx） */
    /** 清空显示与缓冲 */
    clear: function () {
      buffer.length = 0;
      nodes.length = 0;
      dividerAtSeq = null;
      if (el) el.textContent = '';
    },

    /**
     * 整屏重画：**缓冲是唯一真相**，DOM 完全按缓冲重建。
     *
     * 这里修掉了一个隐蔽的 bug：早先的 rerender 里有一句
     * `if (!nodes.length) return;` —— 而 nodes 只在"非静音 push"时才增长。
     * 离线快进期间全是静音 push，nodes 一直是空的，于是 flush() 走到
     * rerender() 后**直接返回、什么都没画**，控制台看起来是空的，
     * 只有快进结束后的第一条实时日志才显示出来。
     * 现在不再依赖 nodes 的长度，永远按缓冲重建，并且保留分隔行。
     */
    rerender: function () {
      if (!el) return;
      el.textContent = '';
      nodes.length = 0;

      for (var i = 0; i < buffer.length; i++) {
        var node = buildNode(renderLine(buffer[i]));
        nodes.push(node);
        el.appendChild(node);
        // 分隔行固定插在"历史结束"的位置（历史 = 到 dividerAtSeq 为止）
        if (dividerAtSeq != null && buffer[i].seq === dividerAtSeq) {
          var d = buildDivider(dividerKey);
          if (d) el.appendChild(d);
        }
      }
      if (autoScroll) Log.scrollToBottom();
    },

    scrollToBottom: function () {
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      autoScroll = true;
      if (jumpBtn) jumpBtn.classList.remove('show');
    },

    /**
     * 离线快进之后调用：把缓冲里累积的历史一次画出来。
     * 因为 rerender 是"先清空再按缓冲重建"，重复调用也不会产生重复行。
     */
    flush: function () {
      if (!el) return;
      Log.rerender();
      Log.scrollToBottom();
    },

    /** 取一条日志的渲染描述（供面板的历史区复用） */
    describe: function (entry) {
      return renderLine(entry);
    },

    /** 生成一条日志的 HTML 字符串（已转义，供面板整块重渲染） */
    htmlLine: function (entry) {
      return buildHtml(renderLine(entry));
    },

    /** 把渲染描述转成 HTML 字符串（全部经过转义） */
    htmlOf: function (r) {
      return buildHtml(r);
    },

    getBuffer: function () { return buffer; },
    isAtBottom: function () { return autoScroll; },
  };

  /** 渲染描述 → HTML 字符串（转义走 U.escapeHtml，禁止裸拼接） */
  function buildHtml(r) {
    if (r.divider) {
      return '<div class="logline divider">' + U.escapeHtml(r.text) + '</div>';
    }
    if (r.echo) {
      var e = '<div class="logline echo">'
        + '<span class="ts tnum">' + U.escapeHtml(r.tsText) + '</span>';
      for (var q = 0; q < r.parts.length; q++) {
        e += U.escapeHtml(r.parts[q].text);
      }
      return e + '</div>';
    }
    var h = '<div class="logline' + (r.chat ? ' chat' : ' lv-' + (r.levelText || 'INFO')) + '">'
      + '<span class="ts tnum">' + U.escapeHtml(r.tsText) + '</span>'
      + '<span class="thread">' + U.escapeHtml(r.threadText || '') + '</span>'
      + '<span class="body">'
      + '<span class="lv">[' + U.escapeHtml(r.levelText || 'INFO') + ']:</span> ';
    for (var i = 0; i < r.parts.length; i++) {
      var p = r.parts[i];
      if (p.cls === 'name') {
        h += '<span class="name" style="color:' + U.escapeHtml(p.color || '')
          + '">' + U.escapeHtml(p.text) + '</span>';
      } else if (p.cls) {
        h += '<span class="' + U.escapeHtml(p.cls) + '">' + U.escapeHtml(p.text) + '</span>';
      } else {
        h += U.escapeHtml(p.text);
      }
    }
    return h + '</span></div>';
  }

  FS.define('render.log', Log);
})(window.FS);

/* ==========================================================================
   cmd.parser —— 命令行解析与执行
   v0.1 范围（见 docs/READMEv0.2.md §8）：
     · 只读命令真正生效：help / list / status / clear / lang
     · 已注册未启用的命令给出服务器风格提示
     · 未知命令报 Unknown command
   会改变世界的命令在 v0.2 接入 Event 队列。
   ========================================================================== */
(function (FS) {
  'use strict';

  var CFG = FS.data.config;
  var U = FS.core.util;
  var I18N = FS.core.i18n;
  var Clock = FS.core.clock;
  var Log = FS.render.log;

  var HISTORY_KEY = 'fs.cmdHistory';
  var history = [];
  var histIndex = -1;

  var ctx = {
    now: function () { return FS.core.clock.now(); },
    world: function () { return FS.app.world; },
    roster: function () { return FS.app.roster; },
    /** 产出一条日志条目（各命令实现用） */
    out: function (key, vars, level) {
      return { key: key, vars: vars || {}, level: level || 'INFO', thread: 'server' };
    },
    /** 直接输出多行文本 */
    raw: function (lines, level) {
      return { raw: lines.join('\n'), level: level || 'SYSTEM', thread: 'server' };
    },
  };

  /* ---------------- 输出辅助 ---------------- */

  function out(key, vars, level) {
    return { key: key, vars: vars || {}, level: level || 'INFO', thread: 'server' };
  }

  /**
   * 直接输出多行文本（命令回显用）。
   * raw 条目不走 i18n 查表 —— 文本在生成时就已按当前语言拼好。
   */
  function raw(lines, level) {
    return { raw: lines.join('\n'), level: level || 'SYSTEM', thread: 'server' };
  }

  /* ---------------- 命令实现 ---------------- */

  /*
    只读命令：立即执行，签名统一为 (c, args)，c 就是下面的 ctx。
    会改变世界的命令（kick/say/…）走 Event 队列，由 cmd.effects 在下一 tick 执行。
  */
  var impl = {
    cmdHelp: function () {
      var names = FS.cmd.names;
      var lines = [I18N.t('log.command.helpHeader')];
      for (var i = 0; i < names.length; i++) {
        var c = FS.cmd.commands[names[i]];
        // describeKey 是语义键，切语言后 help 输出也会跟着变
        lines.push('  ' + (c.enabled ? ' ' : '*') + c.usage + '   - ' + I18N.t(c.describeKey));
      }
      lines.push('  ' + I18N.t('log.command.helpNote'));
      return [raw(lines)];
    },

    cmdList: function (c) {
      /* 注意：这里不能再用标识符 ctx（见 ctx.list = cmdList 的注释） */
      var roster = c.roster();
      var online = FS.state.agent.online(roster);
      var lines = [
        I18N.t('log.command.listHeader', { online: online.length, max: CFG.maxPlayers }),
      ];
      for (var i = 0; i < online.length; i++) {
        lines.push(I18N.t('log.command.listLine', {
          name: I18N.t('name.' + online[i].id),
          place: I18N.tx('place', online[i].state.place),
        }));
      }
      if (!online.length) lines.push('  ' + I18N.t('log.server.noPlayers'));
      return [raw(lines, 'SYSTEM')];
    },

    cmdStatus: function (c) {
      var world = c.world();
      var t = world.time;
      var lines = [
        I18N.t('log.command.statusHeader'),
        I18N.t('log.command.statusLine', {
          map: world.mapName,
          time: Clock.hhmm(t) + ' ' + I18N.t('ui.day', { n: t.day }),
          weather: I18N.tx('weather', world.weather),
          online: world.online.length,
          max: CFG.maxPlayers,
          tick: world.tick,
        }),
        '  seed=' + FS.core.rng.getSeed() + '  lang=' + I18N.getLang()
        + '  topics=' + (FS.ai && FS.ai.dialogue ? FS.ai.dialogue.activeCount() : 0)
        + '  leaving=' + FS.state.agent.online(c.roster()).filter(function (a) {
          return a.leaving;
        }).length,
      ];
      return [raw(lines, 'SYSTEM')];
    },

    cmdClear: function () {
      Log.clear();
      return CATEGORY.SILENT;
    },

    cmdLang: function (c, args) {
      var want = String((args && args[0]) || '').toLowerCase();
      if (want !== 'en' && want !== 'zh') {
        return [out('log.command.langUsage', {}, 'ERROR')];
      }
      I18N.setLang(want);
      // 切换语言会重渲染整个控制台，这条回显要放在切换之后
      return [out('log.command.langSet', { lang: want === 'zh' ? '中文' : 'English' }, 'SYSTEM')];
    },
  };

  var CATEGORY = { SILENT: '__silent__' };

  /* 把只读命令实现挂到 ctx 上，供 cmd/commands.js 调用。
     ⚠️ 必须挂在 ctx.impl 这个子对象下面，不能直接写成 ctx.list = cmdList：
     写成 ctx.list 之后，"c.list()" 这种调用会让方法体的 this 变成 ctx，
     而在方法体里访问标识符 ctx 会被解析成 this.list —— 也就是函数自己，
     于是 ctx.roster 变成 undefined。这个坑排查了很久，别再踩。 */
  ctx.impl = {
    help: impl.cmdHelp,
    list: impl.cmdList,
    status: impl.cmdStatus,
    clear: impl.cmdClear,
    lang: impl.cmdLang,
  };

  /* ---------------- 执行 ---------------- */

  /**
   * 执行一行输入。
   * @param {string} raw 原始输入
   * @param {object} [opts] { echo:boolean 是否回显 '> xxx' }
   */
  function exec(raw, opts) {
    opts = opts || {};
    var silent = opts.silent === true;
    var text = U.sanitize(raw);
    Log.echo(text);

    var parts = text.split(/\s+/).filter(function (s) { return s.length; });
    var name = (parts[0] || '').toLowerCase();
    var args = parts.slice(1);

    if (!text) return [];

    var def = FS.cmd.commands[name];
    if (!def) {
      return emit([out('log.command.unknown', {}, 'ERROR')], silent);
    }
    if (def.needsTick) {
      /* 会改变世界的命令走 Event 队列：下一 tick 由 cmd.effects 执行。
         这也让"用户命令"和其他事件一样进入角色的感知范围。 */
      if (!silent) {
        FS.core.bus.push({
          type: 'command',
          from: 'console',
          data: { cmd: name, args: args, ctx: ctx },
        });
      }
      return [];
    }
    if (!def.run) {
      return emit([out('log.command.registered', { cmd: name }, 'WARN')], silent);
    }

    var result;
    try {
      result = def.run(ctx, args);
    } catch (e) {
      console.error(e);
      return emit([out('log.command.error', { msg: String(e && e.message ? e.message : e) }, 'ERROR')], silent);
    }

    if (result === CATEGORY.SILENT) return [];
    return emit(result || [], silent);
  }

  function emit(entries, silent) {
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i]) continue;
      if (!silent) Log.push(entries[i]);
    }
    return entries;
  }

  /* ---------------- 输入历史 ---------------- */

  var Parser = {
    exec: exec,
    CATEGORY: CATEGORY,

    loadHistory: function () {
      history = U.safeGetJSON(HISTORY_KEY, []);
      if (!Array.isArray(history)) history = [];
      histIndex = history.length;
      return history;
    },

    pushHistory: function (text) {
      text = String(text || '').trim();
      if (!text) return;
      if (history[history.length - 1] !== text) history.push(text);
      if (history.length > 100) history.shift();
      histIndex = history.length;
      U.safeSetJSON(HISTORY_KEY, history);
    },

    /** 上翻历史，返回命令文本（到顶则返回空） */
    prev: function () {
      if (!history.length) return '';
      histIndex = Math.max(0, histIndex - 1);
      return history[histIndex] || '';
    },

    next: function () {
      if (!history.length) return '';
      histIndex = Math.min(history.length, histIndex + 1);
      return histIndex >= history.length ? '' : (history[histIndex] || '');
    },
  };

  FS.define('cmd.parser', Parser);
})(window.FS);

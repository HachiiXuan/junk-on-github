/* ==========================================================================
   core.bus —— Event 队列
   所有跨对象的影响都走这里（说话 / 交易 / 加入 / 离开 / 用户命令 / 世界事件）。
   每 tick 处理一批（上限 32 条），防止一次性涌入时卡顿。
   v0.1：join 由 state.joins 调度；其余类型已能入队与发布，
         玩家侧命令在 v0.2 接入执行器。
   ========================================================================== */
(function (FS) {
  'use strict';

  function CFG() { return FS.data.config; }

  var queue = [];
  var seq = 0;
  var stats = { pushed: 0, processed: 0, maxBatch: 0 };

  var Bus = {
    /**
     * 入队一个事件
     * @param {object|string} typeOrEvent
     * @param {object} [data]
     */
    push: function (typeOrEvent, data) {
      var ev = (typeof typeOrEvent === 'string')
        ? { type: typeOrEvent, data: data || {} }
        : (typeOrEvent || {});
      ev.seq = ++seq;
      ev.type = ev.type || 'world';
      ev.from = ev.from || null;
      ev.to = ev.to || null;
      ev.data = ev.data || {};
      ev.atMs = ev.atMs != null ? ev.atMs : FS.core.clock.now();
      ev.atTick = ev.atTick != null ? ev.atTick : (FS.app && FS.app.world ? FS.app.world.tick : 0);
      queue.push(ev);
      stats.pushed++;
      return ev;
    },

    /**
     * 处理本 tick 的事件批次，返回需要输出的日志条目。
     * 注意：join / leave 由 state.joins 各自处理，这里只做分发与兜底。
     */
    process: function (world, roster) {
      var cap = CFG().busBatchLimit;
      var logs = [];
      var n = Math.min(cap, queue.length);
      if (n > stats.maxBatch) stats.maxBatch = n;

      for (var i = 0; i < n; i++) {
        var ev = queue.shift();
        stats.processed++;
        var out = Bus.handle(world, roster, ev);
        if (out && out.length) logs = logs.concat(out);
      }
      return logs;
    },

    /** 单个事件的处理入口 */
    handle: function (world, roster, ev) {
      switch (ev.type) {
        case 'command':
          /* 用户命令：由 cmd.effects 执行（改状态 + 记忆 + 好感）。
             ctx 由入队方（cmd.parser）带过来，避免命令上下文重复实现。 */
          if (FS.cmd && FS.cmd.effects) {
            var fn = FS.cmd.effects[ev.data.cmd];
            if (typeof fn === 'function') {
              try {
                return fn(ev.data.args || [], ev.data.ctx) || [];
              } catch (e) {
                console.error('[command] ' + ev.data.cmd + ' failed', e);
                return [{
                  key: 'log.command.error',
                  vars: { msg: String(e && e.message ? e.message : e) },
                  level: 'ERROR', thread: 'server',
                }];
              }
            }
          }
          return [];

        case 'join':
          // 已由 state.joins 在调度点直接处理（这里兜底，避免重复加入）
          return [];

        case 'leave':
          if (FS.state.joins) {
            var agent = roster.byId[ev.from];
            if (agent && agent.state.online) {
              return FS.state.joins.leave(world, roster, agent, ev.data.reason);
            }
          }
          return [];

        case 'world':
          return Bus.applyWorldEvent(world, ev);

        default:
          return [];
      }
    },

    /** 世界事件：目前只支持天气/资源类的直接干预（v0.2 命令会用到） */
    applyWorldEvent: function (world, ev) {
      var d = ev.data || {};
      if (d.weather && FS.state.world.Weather.all.indexOf(d.weather) !== -1) {
        world.weather = d.weather;
        world.weatherLeftTicks = FS.state.world.Weather.durationTicks();
        return [{
          key: 'log.server.weather',
          vars: { weather: { tx: 'weather', id: d.weather } },
          level: 'INFO',
          thread: 'server',
        }];
      }
      return [];
    },

    size: function () { return queue.length; },
    clear: function () { queue.length = 0; },
    stats: stats,

    /** 调试用：看一眼队列里都是什么类型 */
    peek: function (n) {
      return queue.slice(0, n || 10).map(function (e) {
        return e.type + '#' + e.seq;
      });
    },
  };

  FS.define('core.bus', Bus);
})(window.FS);

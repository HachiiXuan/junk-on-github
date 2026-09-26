/* ==========================================================================
   persist.store —— 轻量持久化（localStorage）
   ==========================================================================
   设计原则（很重要，别再走回头路）：

     · **世界状态不落盘。** 每次打开页面都是一场全新的世界：
       worldStartMs = 现在，游戏内时间从第 1 天 06:00 开始，角色全部离线。
       这样刷新不会让天数一直涨，也不会让加入计划被"上次的时间"吃掉。

     · 落盘的只有"关于你"的最小信息：
         lastSeenMs    上次离开的时刻 —— 决定这次要快进多少世界时间
         firstSeenMs   第一次来的时刻
         visitCount    访问次数
         lang / panelCollapsed / immersive   界面偏好

     · 想让世界真正延续（角色、记忆、好感、天数）必须走**快照导出/导入**，
       那是 v0.3 的功能：手动保存成文件、手动加载。

   为什么曾经写错过：为了让"离线期间世界继续跑"，我把 worldStartMs 和
   realPlayMs 也存了下来并在启动时恢复，结果世界永不重置 —— 刷新后时间
   接着上次算、天数一直涨，加入计划里"早已过去的时间"还让人一进来就全在线。
   快进本来不需要这些：它只需要"离开时刻"就够了。
   ========================================================================== */
(function (FS) {
  'use strict';

  var U = FS.core.util;
  var KEY = 'fs.meta.v0.1';

  /* 允许落盘的字段（白名单）。任何"世界状态"都不该出现在这里。 */
  var ALLOWED = {
    firstSeenMs: 1,
    lastSeenMs: 1,
    visitCount: 1,
    panelCollapsed: 1,
    lang: 1,
    immersive: 1,
  };

  var Store = {
    KEY: KEY,
    ALLOWED: ALLOWED,

    /** 读取元数据（永不为 null），并顺手剔除旧版本可能残留的世界状态字段 */
    load: function () {
      var raw = U.safeGetJSON(KEY, null);
      if (!raw || typeof raw !== 'object') return {};
      var meta = {};
      for (var k in raw) {
        if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
        if (ALLOWED[k]) meta[k] = raw[k];
      }
      return meta;
    },

    /** 写回元数据（同样只写白名单字段） */
    write: function (meta) {
      var clean = {};
      for (var k in meta) {
        if (!Object.prototype.hasOwnProperty.call(meta, k)) continue;
        if (ALLOWED[k]) clean[k] = meta[k];
      }
      return U.safeSetJSON(KEY, clean);
    },

    /** 只更新时间戳（页面隐藏 / 卸载 / 打开时用，代价最小） */
    touch: function (nowMs) {
      var meta = Store.load();
      var now = nowMs != null ? nowMs : Date.now();
      meta.lastSeenMs = now;
      meta.firstSeenMs = meta.firstSeenMs || now;
      Store.write(meta);
      return meta;
    },

    /** 记一次访问（lastSeenMs + 访问次数） */
    markVisit: function (nowMs) {
      var meta = Store.touch(nowMs);
      meta.visitCount = (meta.visitCount || 0) + 1;
      Store.write(meta);
      return meta;
    },

    /** 保存界面偏好（与游戏状态无关，可随时写） */
    setPref: function (key, value) {
      if (!ALLOWED[key]) return false;
      var meta = Store.load();
      meta[key] = value;
      return Store.write(meta);
    },

    getPref: function (key, fallback) {
      var meta = Store.load();
      return meta[key] === undefined ? fallback : meta[key];
    },

    /** 清掉存档（相当于"服务器重置"） */
    clear: function () {
      try { window.localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
    },
  };

  FS.define('persist.store', Store);
})(window.FS);

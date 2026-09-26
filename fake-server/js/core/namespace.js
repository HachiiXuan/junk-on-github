/* ==========================================================================
   fake-server · 全局命名空间
   所有模块都挂到 window.FS 下，用普通 <script> 顺序加载。
   不使用 ES Module / fetch，保证 file:// 双击 index.html 即可运行。
   ========================================================================== */
(function (global) {
  'use strict';

  var FS = global.FS || (global.FS = {});

  FS.version = 'v0.1';
  FS.build = 'dev';

  /** 按顺序保存模块，便于调试时在控制台里翻 */
  FS.modules = FS.modules || {};

  /**
   * 注册一个模块。
   * @param {string} path  如 'core.rng'
   * @param {*}      mod
   */
  FS.define = function (path, mod) {
    var parts = path.split('.');
    var node = FS;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      if (!node[key]) node[key] = {};
      node = node[key];
    }
    node[parts[parts.length - 1]] = mod;
    FS.modules[path] = mod;
    return mod;
  };

  FS.data = FS.data || {};
})(window);

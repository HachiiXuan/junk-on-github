/* ==========================================================================
   core.rng —— 可播种随机数
   为什么不用 Math.random()：出问题时需要能"复现同一场世界"。
   所有游戏逻辑随机都必须走这里（渲染层可用 Math.random）。
   ========================================================================== */
(function (FS) {
  'use strict';

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 把字符串散列成 32 位种子，便于用可读字符串做种子 */
  function hashSeed(str) {
    var h = 2166136261 >>> 0;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  var next = mulberry32(1);
  var currentSeed = 1;

  var RNG = {
    /** 重新播种（可在调试面板里做"换一个世界"） */
    seed: function (s) {
      currentSeed = typeof s === 'number' ? s >>> 0 : hashSeed(s);
      next = mulberry32(currentSeed);
      return currentSeed;
    },

    getSeed: function () {
      return currentSeed;
    },

    /** [0, 1) */
    float: function () {
      return next();
    },

    /** [min, max) 浮点 */
    range: function (min, max) {
      return min + next() * (max - min);
    },

    /** [min, max] 整数 */
    int: function (min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },

    /** 概率命中 */
    chance: function (p) {
      return next() < p;
    },

    /** 从数组里取一个 */
    pick: function (arr) {
      if (!arr || !arr.length) return undefined;
      return arr[Math.floor(next() * arr.length)];
    },

    /** 从 {a:[1,2]} 形态的变量池里，每个键取一个值 */
    pickVars: function (spec) {
      var out = {};
      if (!spec) return out;
      for (var k in spec) {
        if (Object.prototype.hasOwnProperty.call(spec, k)) out[k] = RNG.pick(spec[k]);
      }
      return out;
    },

    /**
     * 加权随机：items 形如 [{w:2,...}, ...] 或 [{weight:2,...}]
     * 返回被选中的元素；空数组返回 undefined。
     */
    weighted: function (items, weightOf) {
      if (!items || !items.length) return undefined;
      var get = weightOf || function (it) {
        return it.weight != null ? it.weight : (it.w != null ? it.w : 1);
      };
      var total = 0;
      var i;
      for (i = 0; i < items.length; i++) total += Math.max(0, get(items[i]));
      if (total <= 0) return items[items.length - 1];
      var r = next() * total;
      for (i = 0; i < items.length; i++) {
        r -= Math.max(0, get(items[i]));
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },

    /** 洗牌（返回新数组） */
    shuffle: function (arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(next() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },
  };

  FS.define('core.rng', RNG);
})(window.FS);

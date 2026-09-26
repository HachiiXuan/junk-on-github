/* ==========================================================================
   core.util —— 通用工具
   ========================================================================== */
(function (FS) {
  'use strict';

  var U = {
    clamp: function (v, min, max) {
      return v < min ? min : (v > max ? max : v);
    },

    /** 线性映射：把 v 从 [a1,a2] 映射到 [b1,b2]，并夹紧 */
    remap: function (v, a1, a2, b1, b2) {
      if (a2 === a1) return b1;
      var t = (v - a1) / (a2 - a1);
      return U.clamp(b1 + t * (b2 - b1), Math.min(b1, b2), Math.max(b1, b2));
    },

    /** 数值区间插值：lerp(0.5, [0,1], [0,2]) = 1 */
    lerp: function (t, from, to) {
      return from + (to - from) * t;
    },

    sum: function (arr, fn) {
      var s = 0;
      for (var i = 0; i < arr.length; i++) s += fn ? fn(arr[i], i) : arr[i];
      return s;
    },

    /** 自增 id 生成器 */
    seq: function (prefix) {
      var n = (U._counters[prefix] || 0) + 1;
      U._counters[prefix] = n;
      return prefix + n;
    },
    _counters: {},

    /**
     * 模板填充：fill('我需要{item}', {item:'木头'}) -> '我需要木头'
     * 缺失的变量保留原样并标出来，方便一眼看出内容漏配。
     */
    fill: function (tpl, vars) {
      if (tpl == null) return '';
      if (!vars) return String(tpl);
      return String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
        if (Object.prototype.hasOwnProperty.call(vars, k)) {
          var v = vars[k];
          return v == null ? m : String(v);
        }
        return m;
      });
    },

    /** 取出模板里的占位符名列表，用于内容自检 */
    placeholders: function (tpl) {
      var out = [];
      String(tpl).replace(/\{(\w+)\}/g, function (m, k) {
        if (out.indexOf(k) === -1) out.push(k);
        return m;
      });
      return out;
    },

    /**
     * 从对象里按 'a.b.c' 取深层值
     */
    get: function (obj, path, fallback) {
      var parts = String(path).split('.');
      var cur = obj;
      for (var i = 0; i < parts.length; i++) {
        if (cur == null || typeof cur !== 'object') return fallback;
        cur = cur[parts[i]];
      }
      return cur === undefined ? fallback : cur;
    },

    /** 深拷贝（只处理普通对象/数组/原始值） */
    clone: function (v) {
      if (v == null || typeof v !== 'object') return v;
      if (Array.isArray(v)) {
        var a = new Array(v.length);
        for (var i = 0; i < v.length; i++) a[i] = U.clone(v[i]);
        return a;
      }
      var o = {};
      for (var k in v) {
        if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = U.clone(v[k]);
      }
      return o;
    },

    /** 规范化用户/角色输入：去掉控制字符与换行，防止污染日志 */
    sanitize: function (s) {
      return String(s == null ? '' : s)
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
        .replace(/[\r\n]+/g, ' ')
        .trim();
    },

    /** HTML 转义（渲染层必须用它，禁止裸 innerHTML 拼接） */
    escapeHtml: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    /** 数组去重 */
    uniq: function (arr) {
      var seen = {}, out = [];
      for (var i = 0; i < arr.length; i++) {
        var k = String(arr[i]);
        if (!seen[k]) { seen[k] = 1; out.push(arr[i]); }
      }
      return out;
    },

    /**
     * 是否是数组 / 类数组。
     * 为什么不用 Array.isArray：本项目的开发测试会把代码放进不同的 realm
     * （Node vm 沙箱、未来的 worker），跨 realm 的 Array.isArray 会返回 false，
     * 导致"数组被当成普通对象"这类极难发现的 bug。这里用鸭子类型判断。
     */
    isArrayLike: function (v) {
      return !!v && typeof v === 'object' && typeof v.length === 'number' && v.nodeType === undefined;
    },

    /** 取"数组或对象"里的一个元素：数组按索引，对象按 key */
    pickAny: function (rng, container) {
      if (!container) return undefined;
      if (U.isArrayLike(container)) {
        return container.length ? container[Math.floor(rng.float() * container.length)] : undefined;
      }
      var keys = Object.keys(container);
      if (!keys.length) return undefined;
      return container[keys[Math.floor(rng.float() * keys.length)]];
    },

    /** 安全的 JSON 读写（localStorage 可能被禁用或写满） */
    safeGetJSON: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    safeSetJSON: function (key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        return false;
      }
    },
  };

  FS.define('core.util', U);
})(window.FS);

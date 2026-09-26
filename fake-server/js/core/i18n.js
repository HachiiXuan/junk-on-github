/* ==========================================================================
   core.i18n —— 语义键 → 文本
   设计要点（见 docs/READMEv0.2.md §1 修订 2）：
     · 状态与日志只存 { key, vars }，不存成句文本
     · 因此切换语言时可以重渲染历史日志，不会出现中英混杂
     · 缺 key 时回退：当前语言 → 英文 → 显示 key 本身（并标红）
   ========================================================================== */
(function (FS) {
  'use strict';

  var U = FS.core.util;

  var DEFAULT_LANG = 'en';
  var SUPPORTED = ['en', 'zh'];

  /* 已编译好的扁平表：{ en: { 'ui.online': 'online' }, zh: {...} } */
  var tables = {};
  var missing = {};       // 记录缺过的 key，便于自检输出
  var resolvers = {};     // 运行时 key 解析器：{ 'name': fn }
  var current = DEFAULT_LANG;
  var listeners = [];

  /** 把嵌套语言对象压平成点号键（数组会展开成 .0 .1 .2，便于按池随机取） */
  function flatten(obj, prefix, out) {
    out = out || {};
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var v = obj[k];
      var key = prefix ? prefix + '.' + k : k;
      // 注意：用 U.isArrayLike 而不是 Array.isArray —— 跨 realm 更安全
      if (v && typeof v === 'object' && !U.isArrayLike(v)) {
        flatten(v, key, out);
      } else if (U.isArrayLike(v)) {
        for (var i = 0; i < v.length; i++) out[key + '.' + i] = v[i];
      } else {
        out[key] = v;
      }
    }
    return out;
  }

  /** 某个 key 下是不是一个"台词池"（.0 .1 .2 …），返回池大小 */
  function poolSizeOf(base, lang) {
    var n = 0;
    while (I18N.has(base + '.' + n, lang)) n++;
    return n;
  }
  /** 编译一份语言包进 tables */
  function addPack(lang, pack) {
    tables[lang] = flatten(pack, '', {});
    return tables[lang];
  }

  /**
   * 检测首选语言：默认英文，浏览器是中文才切中文。
   * 用户手动选过语言则以用户选择为准。
   */
  function detectLang() {
    try {
      var saved = window.localStorage.getItem('fs.lang');
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    } catch (e) { /* localStorage 不可用时忽略 */ }
    // 元数据里也记了一份语言（与 fs.lang 冗余，便于整体存档迁移）
    if (FS.persist && FS.persist.store) {
      var meta = FS.persist.store.load();
      if (meta.lang && SUPPORTED.indexOf(meta.lang) !== -1) return meta.lang;
    }
    var nav = (window.navigator && (window.navigator.language || window.navigator.userLanguage)) || '';
    if (/^zh/i.test(nav)) return 'zh';
    return DEFAULT_LANG;
  }

  var I18N = {
    SUPPORTED: SUPPORTED,
    DEFAULT_LANG: DEFAULT_LANG,

    /** 注册语言包，如 addPack('zh', FS.data.locale.zh) */
    addPack: addPack,

    /** 初始化（在语言包注册之后调用） */
    init: function () {
      current = detectLang();
      document.documentElement.setAttribute('lang', current === 'zh' ? 'zh-CN' : 'en');
      document.documentElement.setAttribute('data-lang', current);
      return current;
    },

    getLang: function () {
      return current;
    },

    /**
     * 注册"运行时解析器"：某些 key 段的取值不来自语言包，而是运行时数据。
     *
     * 典型场景：角色昵称。32 个随机生成的英文 ID 不可能写进语言包，
     * 而且真人昵称本来就不翻译。所以 `name.<agentId>` 交给解析器去 roster 里查。
     * 解析器只在语言包里查不到时才会被调用，失败才报 missing key。
     *
     * @param {string} prefix 形如 'name'（会去匹配 'name.xxx'）
     * @param {function(string): (string|null)} fn 收到 prefix 后面的部分
     */
    resolver: function (prefix, fn) {
      resolvers[prefix] = fn;
      return I18N;
    },

    /**
     * 取文本。
     * @param {string} key 语义键
     * @param {object} [vars] 变量（值应当是"已翻译好的字符串"）
     */
    t: function (key, vars) {
      if (key == null) return '';
      var raw = tables[current] && tables[current][key];
      if (raw === undefined) raw = tables[DEFAULT_LANG] && tables[DEFAULT_LANG][key];
      if (raw === undefined) {
        /* 语言包里没有 → 问运行时解析器（角色昵称等） */
        var dot = key.indexOf('.');
        if (dot > 0) {
          var pre = key.slice(0, dot);
          var res = resolvers[pre];
          if (res) {
            var v = res(key.slice(dot + 1));
            if (v != null && v !== '') return String(v);
          }
        }
        if (!missing[key]) {
          missing[key] = true;
          // 立刻反馈出来，避免"漏翻"悄悄溜过去
          console.warn('[i18n] missing key: ' + key);
        }
        return '\u2039' + key + '\u203a';   // ‹key›
      }
      return vars ? U.fill(raw, vars) : String(raw);
    },

    /** 该 key 是否在当前语言里存在（自检用） */
    has: function (key, lang) {
      var l = lang || current;
      return !!(tables[l] && tables[l][key] !== undefined);
    },

    /** 取原始模板（不填变量），自检用 */
    raw: function (key, lang) {
      var l = lang || current;
      if (tables[l] && tables[l][key] !== undefined) return tables[l][key];
      return tables[DEFAULT_LANG] ? tables[DEFAULT_LANG][key] : undefined;
    },

    /** 某个语言包的全部 key */
    keysOf: function (lang) {
      return tables[lang] ? Object.keys(tables[lang]) : [];
    },

    /**
     * 台词池大小：topic.greet.opener 下面有几条（.0 .1 .2 …）
     * 中英条目数可以不同 —— 按各自语言的真实条数随机，取到的一定是合法 key。
     */
    poolSize: poolSizeOf,

    /** 取池里的一条 key（用种子随机的重载在 ai.dialogue 里，这里只做无种子版本） */
    poolKey: function (base) {
      var n = poolSizeOf(base);
      if (!n) return base;                       // 不是池，按普通 key 处理
      return base + '.' + Math.floor(Math.random() * n);
    },

    getMissingKeys: function () {
      return Object.keys(missing);
    },

    clearMissing: function () {
      missing = {};
    },

    /**
     * 翻译一个"变量值"，用于把数据 id 变成显示文本。
     * 例：tx('weather', 'rain') -> 'rain' / '下雨'
     */
    tx: function (group, id) {
      if (id == null) return '';
      return I18N.t(group + '.' + id);
    },

    /**
     * 批量翻译一组变量：{ weather:'rain', place:'mine' } -> { weather:'rain', place:'矿区' }
     * vars 的值可以是 { tx:'place', id:'mine' } 形式，指明该变量的翻译域。
     */
    localizeVars: function (vars) {
      if (!vars) return {};
      var out = {};
      for (var k in vars) {
        if (!Object.prototype.hasOwnProperty.call(vars, k)) continue;
        var v = vars[k];
        if (v && typeof v === 'object' && v.tx) {
          out[k] = I18N.t(v.tx + '.' + v.id);
        } else {
          out[k] = v;
        }
      }
      return out;
    },

    /** 切换语言：返回是否真的变了 */
    setLang: function (lang) {
      if (SUPPORTED.indexOf(lang) === -1) return false;
      if (lang === current) return false;
      current = lang;
      try { window.localStorage.setItem('fs.lang', lang); } catch (e) { /* 忽略 */ }
      document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
      document.documentElement.setAttribute('data-lang', lang);
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](lang); } catch (e) { console.error(e); }
      }
      return true;
    },

    toggleLang: function () {
      return I18N.setLang(current === 'en' ? 'zh' : 'en');
    },

    /** 注册语言切换回调（渲染层用它做重渲染） */
    onLangChange: function (fn) {
      listeners.push(fn);
    },
  };

  FS.define('core.i18n', I18N);
})(window.FS);

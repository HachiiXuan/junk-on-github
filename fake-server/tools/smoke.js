/* ==========================================================================
   tools/smoke.js —— 无浏览器冒烟测试
   目的：在 Node 里用最小 DOM 桩加载全部脚本并跑一遍启动流程，
         抓出语法错误、拼错的 API、初始化顺序问题、i18n 缺 key，
         并模拟世界运行验证行为（加入、对话、离线快进、切屏）。
   用法：node tools/smoke.js
   注意：这是开发工具，不参与页面运行（index.html 不会加载它）。
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
let warnings = 0;

function fail(msg) { failures++; console.log('  \x1b[31mFAIL\x1b[0m ' + msg); }
function warn(msg) { warnings++; console.log('  \x1b[33mWARN\x1b[0m ' + msg); }
function ok(msg) { console.log('  \x1b[32mok\x1b[0m   ' + msg); }

/* 取名册里第 i 个角色。
   v1.0 起角色是**随机生成的 32 个人**，不再有 steve / alex / kai 这种固定 id，
   所以测试统一通过位置取人，而不是写死某个名字。 */
function AG(i) {
  if (!app || !app.roster || !app.roster.list[i]) {
    throw new Error('AG(' + i + '): 名册还没建好或索引越界');
  }
  return app.roster.list[i];
}

/* ==========================================================================
   最小 DOM 桩
   ========================================================================== */

function makeClassList() {
  const set = new Set();
  return {
    add(...c) { c.forEach((x) => x && set.add(x)); },
    remove(...c) { c.forEach((x) => set.delete(x)); },
    toggle(c, force) {
      const want = force === undefined ? !set.has(c) : !!force;
      if (want) set.add(c); else set.delete(c);
      return want;
    },
    contains(c) { return set.has(c); },
    toString() { return [...set].join(' '); },
    _set: set,
  };
}

let nodeSeq = 0;

/**
 * 真实浏览器里 childNodes 是"实时 NodeList"，没有 slice/map/filter 这些数组方法。
 * 曾经因为桩里用普通数组，漏掉了 panel.js 里的 childNodes.slice() 崩溃 ——
 * 所以这里刻意做成 NodeList 语义：只暴露 length、数字下标和 item()，
 * 故意不提供任何 Array.prototype 方法。
 */
function makeNodeList(store, resolveEl) {
  const nodeList = {
    item(i) { return store[i] === undefined ? null : resolveEl(store[i]); },
    get length() { return store.length; },
  };
  return new Proxy(nodeList, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && /^\d+$/.test(prop)) {
        return store[Number(prop)] === undefined ? undefined : resolveEl(store[Number(prop)]);
      }
      return undefined;   // 故意不给数组方法：用了就会 TypeError，跟浏览器一致
    },
    has(target, prop) {
      if (prop in target) return true;
      if (typeof prop === 'string' && /^\d+$/.test(prop)) return Number(prop) < store.length;
      return false;
    },
    ownKeys(target) {
      const keys = [];
      for (let i = 0; i < store.length; i++) keys.push(String(i));
      keys.push('length');
      return keys;
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === 'string' && /^\d+$/.test(prop) && Number(prop) < store.length) {
        return { configurable: true, enumerable: true, value: resolveEl(store[Number(prop)]) };
      }
      if (prop === 'length') {
        return { configurable: true, enumerable: false, value: store.length };
      }
      return undefined;
    },
  });
}

function makeElement(tag, doc) {
  const el = {
    __id: ++nodeSeq,
    tagName: String(tag || 'div').toUpperCase(),
    nodeType: 1,
    _store: [],              // 真正的子节点数组（对外只通过 NodeList 暴露）
    parentNode: null,
    attributes: {},
    dataset: {},
    style: {},
    value: '',
    placeholder: '',
    offsetWidth: 100,
    offsetHeight: 20,
    clientHeight: 600,
    clientWidth: 800,
    scrollHeight: 600,
    scrollTop: 0,
    _listeners: {},
    _ownerDoc: doc,
  };
  // 子节点可能是元素，也可能是文本节点对象
  el.childNodes = makeNodeList(el._store, (c) => c);
  Object.defineProperty(el, 'firstChild', {
    get() { return el._store.length ? el._store[0] : null; },
    configurable: true,
  });
  Object.defineProperty(el, 'lastChild', {
    get() { return el._store.length ? el._store[el._store.length - 1] : null; },
    configurable: true,
  });
  Object.defineProperty(el, 'nextSibling', {
    get() {
      const p = el.parentNode;
      if (!p) return null;
      const i = p._store.indexOf(el);
      return i === -1 || i + 1 >= p._store.length ? null : p._store[i + 1];
    },
    configurable: true,
  });
  el.classList = makeClassList();
  Object.defineProperty(el, 'className', {
    get() { return el.classList.toString(); },
    set(v) {
      el.classList._set.clear();
      String(v || '').split(/\s+/).filter(Boolean).forEach((c) => el.classList._set.add(c));
    },
    configurable: true,
  });

  el.appendChild = function (child) {
    if (!child) return child;
    child.parentNode = el;
    el._store.push(child);
    return child;
  };
  el.insertBefore = function (child, ref) {
    child.parentNode = el;
    const i = ref ? el._store.indexOf(ref) : -1;
    if (i === -1) el._store.push(child);
    else el._store.splice(i, 0, child);
    return child;
  };
  el.removeChild = function (child) {
    const i = el._store.indexOf(child);
    if (i !== -1) el._store.splice(i, 1);
    child.parentNode = null;
    return child;
  };
  el.remove = function () {
    if (el.parentNode) el.parentNode.removeChild(el);
  };
  el.setAttribute = function (k, v) { el.attributes[k] = String(v); };
  el.getAttribute = function (k) { return el.attributes[k] === undefined ? null : el.attributes[k]; };
  el.addEventListener = function (type, fn) {
    (el._listeners[type] = el._listeners[type] || []).push(fn);
  };
  el.removeEventListener = function (type, fn) {
    const l = el._listeners[type];
    if (!l) return;
    const i = l.indexOf(fn);
    if (i !== -1) l.splice(i, 1);
  };
  el.dispatch = function (type, ev) {
    (el._listeners[type] || []).slice().forEach((fn) => fn(ev || { type, preventDefault() {} }));
  };
  /* 真实 DOM 的 dispatchEvent：接受一个事件对象，按它的 type 派发。
     没有它就没法测"用户改了输入框"这类交互。 */
  el.dispatchEvent = function (ev) {
    const type = (ev && ev.type) || 'event';
    const e = Object.assign({
      type,
      target: el,
      preventDefault() {},
      stopPropagation() {},
    }, ev || {});
    (el._listeners[type] || []).slice().forEach((fn) => fn(e));
    return true;
  };
  el.getBoundingClientRect = function () {
    return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 };
  };
  el.closest = function (sel) {
    const want = sel.replace(/^[#.]/, '');
    let cur = el;
    while (cur) {
      if (sel[0] === '#' && cur.__idName === want) return cur;
      if (sel[0] === '.' && cur.classList.contains(want)) return cur;
      if (sel[0] !== '#' && sel[0] !== '.' && cur.tagName === sel.toUpperCase()) return cur;
      cur = cur.parentNode;
    }
    return null;
  };
  el.querySelector = function () { return null; };
  el.querySelectorAll = function () { return []; };
  el.focus = function () { doc.activeElement = el; };
  el.blur = function () { if (doc.activeElement === el) doc.activeElement = null; };

  let _text = '';
  Object.defineProperty(el, 'textContent', {
    get() {
      if (el._store.length) {
        return el._store.map((c) => (c.nodeType === 3 ? c.data : c.textContent)).join('');
      }
      return _text;
    },
    set(v) {
      el._store.length = 0;
      _text = String(v == null ? '' : v);
    },
    configurable: true,
  });

  // innerHTML：只允许赋空串（清空）。裸拼接会被拒绝，方便抓住注入风险。
  Object.defineProperty(el, 'innerHTML', {
    get() { return ''; },
    set(v) {
      const s = String(v == null ? '' : v);
      if (s.trim() === '') { el._store.length = 0; _text = ''; return; }
      throw new Error('innerHTML 赋值不被支持（禁止裸拼接）: ' + s.slice(0, 80));
    },
    configurable: true,
  });

  return el;
}

function makeDocument() {
  const doc = {
    readyState: 'loading',        // 先置 loading，让 main.js 等 DOMContentLoaded
    documentElement: null,
    body: null,
    activeElement: null,
    hidden: false,
    _byId: {},
    _all: [],
    _listeners: {},
    createElement(tag) {
      const el = makeElement(tag, doc);
      doc._all.push(el);
      if (tag === 'canvas') {
        el.getContext = () => ({ font: '', measureText: (s) => ({ width: String(s).length * 7 }) });
      }
      return el;
    },
    createTextNode(text) {
      return { nodeType: 3, data: String(text), textContent: String(text), parentNode: null };
    },
    getElementById(id) { return doc._byId[id] || null; },
    querySelector(sel) {
      if (sel && sel[0] === '#') return doc._byId[sel.slice(1)] || null;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener(type, fn) {
      (doc._listeners[type] = doc._listeners[type] || []).push(fn);
    },
    removeEventListener() {},
    fireDOMContentLoaded() {
      (doc._listeners['DOMContentLoaded'] || []).slice().forEach((fn) => fn({ type: 'DOMContentLoaded' }));
    },
  };

  doc.documentElement = makeElement('html', doc);
  doc.body = makeElement('body', doc);
  return doc;
}

/* ==========================================================================
   建立运行环境
   ========================================================================== */

const doc = makeDocument();
const storage = (() => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    _map: map,
  };
})();

const sandbox = {
  console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
  isFinite, parseInt, parseFloat, Set, Map, Promise,
  setTimeout: (fn, ms) => 0,
  clearTimeout: () => {},
  setInterval: (fn, ms) => 1,
  clearInterval: () => {},
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = doc;
sandbox.navigator = { language: 'en-US', userLanguage: 'en-US' };
sandbox.localStorage = storage;
sandbox.innerWidth = 1440;
sandbox.innerHeight = 900;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.getComputedStyle = () => ({ fontSize: '13px', fontFamily: 'monospace' });
sandbox.getSelection = () => '';

/* ==========================================================================
   按 index.html 的顺序加载脚本
   ========================================================================== */

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SCRIPTS = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);

const ctx = vm.createContext(sandbox);

console.log('\n=== 1. 加载与语法 ===');
for (const rel of SCRIPTS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { fail('缺少文件: ' + rel); continue; }
  const code = fs.readFileSync(file, 'utf8');
  try {
    new vm.Script(code, { filename: rel });
  } catch (e) {
    fail('语法错误 ' + rel + ': ' + e.message);
    continue;
  }
  try {
    vm.runInContext(code, ctx, { filename: rel });
  } catch (e) {
    fail('执行出错 ' + rel + ': ' + e.message);
  }
}
if (!failures) ok(SCRIPTS.length + ' 个脚本全部加载成功');

/* ==========================================================================
   2. 启动流程
   ========================================================================== */

console.log('\n=== 2. 启动流程 ===');

/* 测试用的占位角色（第 7.6 节要验证"离线回来不会一次涌入"，需要更多角色）。
   在这里就把名字塞进语言包，避免运行期整包替换造成大量缺 key 警告。 */
const AUX = ['aux1', 'aux2', 'aux3', 'aux4', 'aux5', 'aux6'];
{
  const fsb = sandbox.FS;
  const en = fsb.data.locale.en;
  const zh = fsb.data.locale.zh;
  en.name = en.name || {};
  zh.name = zh.name || {};
  AUX.forEach((id, i) => {
    en.name[id] = 'Aux' + (i + 1);
    zh.name[id] = 'Aux' + (i + 1);
  });
  fsb.core.i18n.addPack('en', en);
  fsb.core.i18n.addPack('zh', zh);
}

const IDS = [
  'main', 'log', 'jumpLatest', 'jumpLatestLabel', 'cmdInput', 'fakeCaret', 'inputRow',
  'consoleWrap', 'mapName', 'onlineCount', 'onlineVal', 'onlineLabel', 'timeVal',
  'weather', 'weatherVal', 'weatherLabel', 'langLabel', 'langBtn', 'panelToggle',
  'panelToggleIcon', 'panelToggleCap', 'panel', 'panelBody', 'panelStrip',
  'panelStripLabel', 'panelTitle', 'inputHint', 'immersiveHint', 'immersiveHintText',
];
for (const id of IDS) {
  const el = doc.createElement('div');
  el.__idName = id;
  doc._byId[id] = el;
}
doc._byId['main'].appendChild(doc._byId['panel']);
doc._byId['consoleWrap'].appendChild(doc._byId['log']);
doc._byId['consoleWrap'].appendChild(doc._byId['inputRow']);
doc._byId['inputRow'].appendChild(doc._byId['cmdInput']);

const FS = sandbox.FS;
let app = null;
try {
  doc.readyState = 'complete';
  doc.fireDOMContentLoaded();
  app = FS.app;
  if (!app || !app.world) throw new Error('init 未产生 world');
  ok('FS.app.init() 完成（经 DOMContentLoaded）');
} catch (e) {
  fail('FS.app.init() 抛错: ' + e.stack.split('\n').slice(0, 4).join('\n       '));
}

if (app) {
  // 没有开机画面：初始化完就应当是"运行中"状态
  if (FS.render.boot) fail('开机画面模块仍然存在（需求：直接显示服务器）');
  else if (!doc._byId['log'] || doc._byId['log']._store.length === 0) {
    fail('打开后控制台不是直接可用状态（应当立刻显示服务器内容）');
  } else if (!app.started) {
    fail('初始化完成后主循环没有启动');
  } else {
    ok('没有开机画面，打开即运行中（控制台已有 ' + doc._byId['log']._store.length + ' 行）');
  }

  try {
    FS.render.panel.render();
    FS.render.topbar.render();
    ok('渲染层 render() 正常');
  } catch (e) {
    fail('渲染 render() 抛错: ' + e.stack.split('\n').slice(0, 3).join('\n       '));
  }
}

/* ==========================================================================
   3. 内容自检
   ========================================================================== */

console.log('\n=== 3. 内容自检 ===');

function flat(obj, prefix, out) {
  out = out || {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
    else out[key] = v;
  }
  return out;
}

const en = flat(FS.data.locale.en, '', {});
const zh = flat(FS.data.locale.zh, '', {});
const enKeys = new Set(Object.keys(en));
const zhKeys = new Set(Object.keys(zh));

const onlyEn = [...enKeys].filter((k) => !zhKeys.has(k));
const onlyZh = [...zhKeys].filter((k) => !enKeys.has(k));
if (onlyEn.length) fail('中文缺少 ' + onlyEn.length + ' 个 key: ' + onlyEn.slice(0, 12).join(', '));
if (onlyZh.length) fail('英文缺少 ' + onlyZh.length + ' 个 key: ' + onlyZh.slice(0, 12).join(', '));
if (!onlyEn.length && !onlyZh.length) ok('中英 key 完全一致（' + enKeys.size + ' 个）');

let phMismatch = 0;
for (const k of enKeys) {
  if (!zhKeys.has(k)) continue;
  const a = [...new Set([...String(en[k]).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
  const b = [...new Set([...String(zh[k]).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
  if (a.join(',') !== b.join(',')) {
    phMismatch++;
    if (phMismatch <= 8) fail('占位符不一致 ' + k + '  en={' + a.join(',') + '}  zh={' + b.join(',') + '}');
  }
}
if (!phMismatch) ok('占位符全部一致');

// 台词池：中英条目数必须一致（用 i18n 自己的扁平表，数组会被展开成 .0 .1）
let poolBad = 0;
let poolCount = 0;
const flatEnKeys = FS.core.i18n.keysOf('en');
const flatZhKeys = new Set(FS.core.i18n.keysOf('zh'));
const poolBases = new Set();
for (const k of flatEnKeys) {
  const m = k.match(/^(.*)\.(\d+)$/);
  if (!m || m[2] !== '0') continue;
  poolBases.add(m[1]);
}
for (const base of poolBases) {
  poolCount++;
  const nEn = FS.core.i18n.poolSize(base, 'en');
  const nZh = FS.core.i18n.poolSize(base, 'zh');
  if (nEn !== nZh) {
    poolBad++;
    if (poolBad <= 8) fail('台词池条目数不一致: ' + base + '  en=' + nEn + '  zh=' + nZh);
    continue;
  }
  for (let i = 0; i < nEn; i++) {
    const key = base + '.' + i;
    if (!flatZhKeys.has(key)) {
      poolBad++;
      if (poolBad <= 8) fail('中文缺台词池条目: ' + key);
      continue;
    }
    const a = [...new Set([...String(FS.core.i18n.raw(key, 'en')).matchAll(/\{(\w+)\}/g)].map((x) => x[1]))].sort();
    const b = [...new Set([...String(FS.core.i18n.raw(key, 'zh')).matchAll(/\{(\w+)\}/g)].map((x) => x[1]))].sort();
    if (a.join(',') !== b.join(',')) {
      poolBad++;
      if (poolBad <= 8) fail('台词池第 ' + i + ' 条占位符不一致: ' + key + '  en={' + a.join(',') + '}  zh={' + b.join(',') + '}');
    }
  }
}
if (!poolBad) ok(poolCount + ' 个台词池的中英结构与占位符完全一致');

// 数据表引用自检（跨 realm 下 Array.isArray 不可靠，统一在沙箱内取纯字符串 id 列表）
let dataIds = {};
try {
  dataIds = JSON.parse(vm.runInContext(`JSON.stringify({
    place: FS.data.places.list.map(function (x) { return x.id; }),
    item: FS.data.items.list.map(function (x) { return x.id; }),
    threat: FS.data.threats.list.map(function (x) { return x.id; }),
    agentIds: FS.data.agents.map(function (x) { return x.id; }),
    weather: ['clear', 'rain', 'thunder', 'fog'],
    mood: ['calm', 'annoyed', 'scared', 'excited'],
    leaveReason: ['eat', 'sleep', 'work', 'errand', 'timeout'],
    leaveKind: ['quit', 'timeout'],
    deathCause: ['pvp', 'env', 'console', 'mob', 'fall'],
    goal: FS.data.goals.list.map(function (g) { return g.id; })
      .concat((FS.data.goals.deferred || []).map(function (g) { return g.id; }))
  })`, ctx));
} catch (e) {
  fail('无法读取沙箱内的数据表: ' + e.message);
}

const DATA_ROOTS = { place: 1, item: 1, threat: 1, weather: 1, mood: 1, goal: 1, name: 1, leaveReason: 1, leaveKind: 1, deathCause: 1 };
const referenced = [];
for (const k of enKeys) {
  const seg = k.split('.');
  if (seg.length !== 2) continue;
  if (!DATA_ROOTS[seg[0]]) continue;
  referenced.push([seg[0], seg[1]]);
}

let missingRef = 0;
for (const [group, id] of referenced) {
  /* 昵称走运行时解析，不在语言包里，所以不参与"译文 ↔ 数据表"的一致性检查 */
  if (group === 'name') continue;
  const ids = dataIds[group];
  if (!ids) { fail('自检表里缺少数据源: ' + group); continue; }
  if (ids.indexOf(id) === -1) {
    missingRef++;
    fail('译文里的 ' + group + '.' + id + ' 在数据表中不存在');
  }
}
if (!missingRef) ok('译文与数据表引用一致（' + referenced.length + ' 项）');

/* ==========================================================================
   4. 命令链路
   ========================================================================== */

console.log('\n=== 4. 命令链路 ===');

const CASES = [
  { in: 'help', want: null },
  { in: 'list', want: null },
  { in: 'status', want: null },
  { in: 'bogus', want: 'log.command.unknown' },
  { in: 'lang zh', want: null },
  { in: 'lang en', want: null },
  { in: 'lang xx', want: 'log.command.langUsage' },
  { in: '', want: null },
];

if (app) {
  for (const c of CASES) {
    let produced;
    try {
      produced = FS.cmd.parser.exec(c.in, { silent: true });
    } catch (e) {
      fail('命令 "' + c.in + '" 抛错: ' + e.message);
      continue;
    }
    if (c.want) {
      const hit = (produced || []).some((e) => e && e.key === c.want);
      if (!hit) {
        fail('命令 "' + c.in + '" 期望 key ' + c.want + '，实际 '
          + JSON.stringify((produced || []).map((e) => e && e.key)));
      }
    }
  }
  ok(CASES.length + ' 条命令全部执行无异常');

  FS.core.i18n.setLang('zh');
  const zhText = FS.core.i18n.t('log.server.join', { name: 'Steve' });
  FS.core.i18n.setLang('en');
  const enText = FS.core.i18n.t('log.server.join', { name: 'Steve' });
  if (zhText.indexOf('加入') === -1) fail('中文 join 文本异常: ' + zhText);
  else if (enText.indexOf('joined') === -1) fail('英文 join 文本异常: ' + enText);
  else ok('语言切换与文本生成正常');

  const missingKey = FS.core.i18n.t('no.such.key');
  if (missingKey !== '\u2039no.such.key\u203a') fail('未知 key 回退异常: ' + missingKey);

  // 命令输出必须跟随语言（描述是语义键，不能在表里写死英文）
  const helpEn = FS.cmd.parser.exec('help', { silent: true })[0].raw;
  FS.core.i18n.setLang('zh');
  const helpZh = FS.cmd.parser.exec('help', { silent: true })[0].raw;
  FS.core.i18n.setLang('en');
  if (helpEn.indexOf('list available commands') === -1) fail('英文 help 输出异常');
  else if (helpZh.indexOf('列出可用命令') === -1) fail('中文 help 输出没有跟随语言切换');
  else if (helpZh.indexOf('list available commands') !== -1) fail('中文 help 里仍残留英文描述');
  else ok('help 输出跟随语言切换（中英各一套描述）');

  const noDesc = FS.cmd.names.filter((n) => !FS.core.i18n.has(FS.cmd.commands[n].describeKey, 'en')
    || !FS.core.i18n.has(FS.cmd.commands[n].describeKey, 'zh'));
  if (noDesc.length) fail('以下命令缺本地化描述: ' + noDesc.join(', '));
  else ok(FS.cmd.names.length + ' 个命令的中英描述齐全');

  FS.core.i18n.setLang('zh');
  const listZh = FS.cmd.parser.exec('list', { silent: true })[0].raw;
  const statusZh = FS.cmd.parser.exec('status', { silent: true })[0].raw;
  FS.core.i18n.setLang('en');
  if (!/在线/.test(listZh)) fail('中文 list 输出异常: ' + listZh.slice(0, 40));
  else if (!/服务器状态/.test(statusZh)) fail('中文 status 输出异常: ' + statusZh.slice(0, 40));
  else ok('list / status 输出跟随语言');
}

/* ==========================================================================
   5. 世界状态
   ========================================================================== */

console.log('\n=== 5. 世界状态 ===');

if (app) {
  const w = app.world;
  if (w.online.length !== 0) fail('开局在线人数应为 0，实际 ' + w.online.length);
  else ok('开局 0/32 正确');

  if (w.time.hour !== 6) fail('开局世界时间应为 06:00，实际 ' + w.time.hour + ':' + w.time.minute);
  else ok('开局世界时间 06:00 正确');

  if (app.roster.list.length !== 32) fail('角色数应为 32，实际 ' + app.roster.list.length);
  else ok('角色数 3 正确');

  const t2 = FS.core.clock.worldOf(w.worldStartMs + 120000, w, 1);
  if (t2.hour !== 7) fail('1 游戏小时 ≠ 2 真实分钟（got hour ' + t2.hour + '）');
  else ok('时间倍率验证通过：2 真实分钟 = 1 游戏小时');

  if (['clear', 'rain', 'thunder', 'fog'].indexOf(w.weather) === -1) fail('天气值非法: ' + w.weather);
  else ok('天气值合法: ' + w.weather);

  let asym = 0;
  for (const p of FS.data.places.list) {
    const nb = FS.data.places.links[p.id] || [];
    for (const n of nb) {
      const back = FS.data.places.links[n] || [];
      if (back.indexOf(p.id) === -1) { asym++; fail('连通图不对称: ' + p.id + ' -> ' + n); }
    }
  }
  if (!asym) ok('地点连通图对称');

  let resourcesOk = true;
  try {
    resourcesOk = vm.runInContext(
      'FS.app.world.resources.every(function (r) { return !!FS.data.places.byId[r.place]; })', ctx);
  } catch (e) {
    resourcesOk = false;
  }
  if (!resourcesOk) fail('资源点引用了不存在的地点');
  else ok('资源点 ' + w.resources.length + ' 个，引用正确');
}

/* ==========================================================================
   6. tick 与加入调度
   ========================================================================== */

console.log('\n=== 6. tick 与加入调度 ===');

if (app) {
  const CFG = FS.data.config;

  const t0 = Date.now();
  FS.core.clock.setNow(t0);
  app.world.worldStartMs = t0;
  app.world.realPlayMs = 0;
  FS.state.joins.init(app.world, t0);
  app.world.tick = 0;
  app.world.online.length = 0;
  app.roster.list.forEach((a) => FS.state.agent.leave(app.roster, a));

  for (let i = 0; i < 16; i++) {
    FS.core.clock.setNow(t0 + (i + 1) * CFG.tickMs);
    FS.core.tick.step(true);
  }
  if (app.world.online.length !== 0) fail('开局 4 秒内不应有人加入，实际在线 ' + app.world.online.length);
  else ok('开局 4 秒仍是 0/32（空服务器）');

  const seen = [];
  const TICKS = Math.round(10 * 60 * 1000 / CFG.tickMs);
  for (let i = 0; i < TICKS; i++) {
    FS.core.clock.setNow(t0 + (i + 1) * CFG.tickMs);
    FS.core.tick.step(true);
    const n = app.world.online.length;
    if (!seen.length || seen[seen.length - 1] !== n) seen.push(n);
  }
  const joined = app.world.online.length;
  /* v1.0：32 人世界，10 分钟内应当爬到 8~20 人（不是一次性全上线，也别太冷清） */
  if (joined < 6) fail('10 分钟后只有 ' + joined + ' 人在线，太少（应至少 6）');
  else if (joined > 22) fail('10 分钟后已有 ' + joined + ' 人在线，爬得太快');
  else ok('10 分钟后 ' + joined + ' 人在线（0/32 → ' + joined + '/32）');

  /* 加入必须是"一名一名地来"，不能一 tick 冒出好几个 */
  let bigJump = 0;
  for (let i = 1; i < seen.length; i++) {
    if (seen[i] - seen[i - 1] > 1) bigJump++;
  }
  if (bigJump) fail('有 ' + bigJump + ' 次一步跳进来好几个角色（' + seen.join(' > ') + '）');
  else ok('加入是渐进的，每次只多一人（' + seen.length + ' 个台阶）');

  const buf = FS.render.log.getBuffer();
  const joinLines = buf.filter((e) => e.key === 'log.server.join' || e.key === 'log.server.joinFirst');
  if (!joinLines.length) fail('日志里没有加入记录');
  else if (joinLines.some((e) => !e.vars || !e.vars.name)) fail('加入日志缺 name 变量');
  else ok('加入日志 ' + joinLines.length + ' 条，变量完整');

  const t1 = t0 + TICKS * CFG.tickMs;
  const onlineAgent = app.roster.list.find((a) => a.state.online);
  const up = FS.state.agent.onlineMs(onlineAgent, t1);
  if (up <= 0) fail('在线时长没有增长');
  else ok('在线时长计算正常（' + Math.round(up / 1000) + 's）');

  const wt = FS.core.clock.worldOf(t1, app.world, 1);
  const expectedHour = 6 + 5;
  if (Math.abs((wt.hour + wt.minute / 60) - expectedHour) > 0.05) {
    fail('10 真实分钟后世界时间应为 ' + expectedHour.toFixed(2) + ' 时，实际 ' + wt.hour + ':' + wt.minute);
  } else {
    ok('世界时间推进正确（10 真实分钟 = 5 游戏小时）');
  }

  FS.core.clock.useRealTime();
  try {
    const before = app.world.tick;
    const info = FS.backfill.run(app.world, app.roster, {
      elapsedMs: 3 * 3600 * 1000,
      nowMs: app.world.worldStartMs + 3 * 3600 * 1000,
    });
    FS.core.clock.useRealTime();
    if (info.minutes < 170) fail('3 小时快进应产生约 180 个分钟步，实际 ' + info.minutes);
    else ok('离线快进 3 小时完成（' + info.minutes + ' 分钟步，' + info.ms + 'ms）');
    if (app.world.tick <= before) fail('快进没有推进 tick');
    const wt2 = FS.core.clock.worldOf(app.world.worldStartMs + 3 * 3600 * 1000, app.world, 1);
    if (wt2.day < 4) fail('3 小时快进后游戏天数不对: day ' + wt2.day);
    else ok('快进后游戏时间自洽（第 ' + wt2.day + ' 天）');
  } catch (e) {
    fail('backfill 抛错: ' + e.stack.split('\n').slice(0, 3).join('\n       '));
  }

  for (let i = 0; i < 400; i++) {
    FS.render.log.push({ key: 'log.server.noPlayers', vars: {}, level: 'INFO', thread: 'server' }, true);
  }
  const len = FS.render.log.getBuffer().length;
  if (len > CFG.logBufferLines) fail('环形缓冲未裁剪，长度 ' + len);
  else ok('环形缓冲正确裁剪到 ' + len + ' 行（上限 ' + CFG.logBufferLines + '）');
}

/* ==========================================================================
   6.5 在线人数爬升曲线（v1.0）
   用户要求：运行时 16~32 人在线，数十分钟内从 16 缓慢爬到 30 左右。
   这里用**真实游玩时间**推进（加入调度就挂在这条时间轴上）。
   ========================================================================== */

console.log('\n=== 6.5 在线人数爬升（v1.0）===');

if (app) {
  const CFG = FS.data.config;
  const snapshots = [];
  try {
    const t0 = Date.now();
    const w = FS.state.world.create(t0);
    app.world = w;
    app.roster.list.forEach((a) => {
      FS.state.agent.leave(app.roster, a);
      a.leaving = null;
      a.dead = false;
      a.state.permanentDeath = false;
      a.topicCooldownUntilTick = 0;
    });
    FS.state.joins.init(w, t0);
    FS.core.bus.clear();
    FS.ai.dialogue.reset();
    FS.render.log.clear();

    let now = t0;
    const realNow = Date.now;
    Date.now = () => now;
    try {
      FS.core.clock.setNow(now);
      /* 跑 45 分钟真实游玩时间，每 5 分钟记一次在线数 */
      const TOTAL_MIN = 45;
      const ticksPerMin = 60 * 1000 / CFG.tickMs;
      for (let m = 1; m <= TOTAL_MIN; m++) {
        for (let i = 0; i < ticksPerMin; i++) {
          now += CFG.tickMs;
          FS.core.clock.setNow(now);
          FS.core.tick.step(true);
        }
        snapshots.push({ min: m, n: FS.state.agent.online(app.roster).length });
      }
    } finally {
      Date.now = realNow;
      FS.core.clock.useRealTime();
    }
  } catch (e) {
    fail('在线爬升模拟抛错: ' + e.stack.split('\n').slice(0, 4).join('\n       '));
  }

  if (snapshots.length) {
    const at = (m) => (snapshots.find((s) => s.min === m) || {}).n || 0;
    const peak = Math.max(...snapshots.map((s) => s.n));
    console.log('       爬升曲线 ' + snapshots.map((s) => s.min + 'm:' + s.n).join(' '));

    if (at(45) < 14) {
      fail('45 分钟后只有 ' + at(45) + ' 人在线，够不上"热闹服务器"');
    } else if (peak > 32) {
      fail('在线人数超过上限 32（峰值 ' + peak + '）');
    } else if (at(5) < 3) {
      fail('5 分钟后只有 ' + at(5) + ' 人在线，开局太冷清');
    } else {
      ok('在线人数爬到 ' + at(45) + '（峰值 ' + peak + '，上限 32）');
    }

    /* 必须"缓慢上爬"，不能前 5 分钟就到顶 */
    const early = at(5);
    const late = at(45);
    if (late > 0 && early / late > 0.75) {
      warn('爬升偏快：5 分钟就到了 45 分钟人数的 ' + Math.round((early / late) * 100) + '%');
    } else {
      ok('爬升是缓慢的（5 分钟 ' + early + ' 人 → 45 分钟 ' + late + ' 人）');
    }
  }
}

/* ==========================================================================
   7. 角色闭环：30 分钟模拟
   ========================================================================== */

console.log('\n=== 7. 角色闭环（30 分钟模拟）===');

if (app) {
  const CFG = FS.data.config;
  const R6 = (n) => Math.round(n * 1e6) / 1e6;

  const t2 = Date.now();
  FS.core.clock.setNow(t2);
  app.world.worldStartMs = t2;
  app.world.realPlayMs = 0;
  app.world.tick = 0;
  FS.state.joins.init(app.world, t2);
  app.roster.list.forEach((a) => {
    FS.state.agent.leave(app.roster, a);
    a.memory.length = 0;
    a.goals.length = 0;
    a.affection = {};
    a.stats.topicsStarted = 0;
    a.stats.spoken = 0;
    a.stats.moves = 0;
    a.stats.trades = 0;
  });
  FS.render.log.clear();
  FS.state.world.syncRoster(app.world, app.roster);

  const TICKS2 = Math.round(30 * 60 * 1000 / CFG.tickMs);
  /* 探针：记录"已经在一个话题里（或还在等回应）却仍试图开新场"的次数。
     探针要挂在 actions.speak 上 —— 它才是真正的过滤点，
     dialogue.start 只是最后一道兜底，正常情况下轮不到它。 */
  const overlapProbe = { count: 0, allowed: 0 };
  const origSpeak = FS.ai.actions.speak;
  FS.ai.actions.speak = function (o, agent, world, roster, silent, nowMs) {
    const busy = !!(agent.dialogue && agent.dialogue.instanceId);
    const awaiting = !!(agent.dialogue && agent.dialogue.awaitingReply);
    if (busy || awaiting) {
      overlapProbe.count++;
      const r = origSpeak.apply(this, arguments);
      if (r && r.ok) overlapProbe.allowed++;
      return r;
    }
    return origSpeak.apply(this, arguments);
  };

  let err = null;
  try {
    for (let i = 0; i < TICKS2; i++) {
      FS.core.clock.setNow(t2 + (i + 1) * CFG.tickMs);
      FS.core.tick.step(true);
    }
  } catch (e) {
    err = e;
  }
  FS.ai.actions.speak = origSpeak;
  FS.core.clock.setNow(t2 + TICKS2 * CFG.tickMs);

  if (err) {
    fail('30 分钟模拟抛错: ' + err.stack.split('\n').slice(0, 4).join('\n       '));
  } else {
    ok('30 分钟模拟无异常（' + TICKS2 + ' tick）');

    const buf = FS.render.log.getBuffer();
    const chats = buf.filter((e) => e.level === 'CHAT');
    const trades = buf.filter((e) => e.key === 'log.trade.done');

    if (chats.length < 10) fail('30 分钟内聊天太少（' + chats.length + ' 条），角色互动不足');
    else ok('产生 ' + chats.length + ' 条聊天');

    const topicsStarted = app.roster.list.reduce((s, a) => s + a.stats.topicsStarted, 0);
    const topicsPerMin = topicsStarted / 30;
    if (topicsPerMin > 3) fail('对话过于频繁: ' + topicsStarted + ' 轮 / 30 分钟');
    else if (topicsPerMin < 0.15) warn('对话过少: ' + topicsStarted + ' 轮 / 30 分钟');
    else ok('对话节奏合理: ' + topicsStarted + ' 轮 / 30 分钟（' + R6(topicsPerMin) + ' 轮/分钟）');

    /* 交易次数随人数放大：24 人世界比 3 人世界多得多是正常的。
       真正要盯的是"人均频率"和"有没有刷屏"。 */
    const onlineAvg = Math.max(1, app.roster.list.filter((a) => a.state.online).length);
    const tradesPerPerson = trades.length / onlineAvg;
    if (tradesPerPerson > 12) {
      fail('交易刷屏: ' + trades.length + ' 次 / 30 分钟（人均 ' + R6(tradesPerPerson) + '，过高）');
    } else if (!trades.length) {
      warn('30 分钟内没有出现完整交易（有概率，不一定是 bug）');
    } else {
      ok('交易频率合理: ' + trades.length + ' 次 / 30 分钟（人均 '
        + R6(tradesPerPerson) + ' 次）');
    }

    /* ---- 交叉对话检查（用户反馈的核心问题）----
       症状：本来是 A 和 B 在说话，C 插进来，A 的话被夹在 C 的话之后，
       读起来像答非所问。根因是"A 在等 B 回应时又开了一场新话题"。

       检查方式：模拟全程给 dialogue.start 装一个探针，
       统计"发起者已经在一个话题里（或还在等回应）却仍试图开新场"的次数。
       引擎现在会在 start() 与 actions.speak 里直接拒绝，所以这个数必须是 0。 */
    const overlapTries = overlapProbe ? overlapProbe.count : 0;
    const overlapAllowed = overlapProbe ? overlapProbe.allowed : 0;
    if (overlapAllowed) {
      fail('有 ' + overlapAllowed + ' 次在"已参与话题"的状态下真的开了新场（交叉对话）');
    } else if (!overlapTries) {
      warn('本局没有出现"想插话被拦下"的情况（样本不足，无法验证）');
    } else {
      ok('交叉对话被拦住 ' + overlapTries + ' 次，一次都没漏过');
    }

    /* 模拟结束时不该有话题还挂着（否则是实例泄漏）。
       注意规模变大后，24 人世界里同时有 3 场话题是**正常**的
       （maxActiveTopics 默认 3），所以只断言"不超过上限"。 */
    const leftover = FS.ai.dialogue.debugList();
    const topicCap = CFG.maxActiveTopics || 3;
    if (leftover.length > topicCap) {
      fail('模拟结束时仍有 ' + leftover.length + ' 个话题（上限 ' + topicCap + '，疑似泄漏）');
    } else if (leftover.length) {
      ok('模拟结束时挂着 ' + leftover.length + ' 场话题（未超上限 ' + topicCap + '，正常）');
    } else {
      ok('模拟结束后没有残留的话题实例');
    }
    /* 每个人的对话状态必须自洽：instanceId 指向的实例必须真的存在 */
    /* 对话状态自洽性：用 dialogue.audit() 统一校验
       （以前这里手写检查，结果 debugList() 返回的是字符串，
         `i.id` 恒为 undefined，误报了一堆"状态不一致"）。 */
    const problems = FS.ai.dialogue.audit(app.roster);
    if (problems.length) {
      fail('对话状态不一致 ' + problems.length + ' 处：' + problems.slice(0, 3).join(' / '));
    } else {
      ok('对话状态自洽（' + FS.ai.dialogue.debugInstances().length + ' 场进行中，无悬挂引用）');
    }

    const totalActions = app.roster.list.reduce((s, a) =>
      s + a.stats.moves + a.stats.spoken + a.stats.trades + a.stats.topicsStarted, 0);
    if (totalActions > 2000) fail('动作过密: ' + totalActions + ' 次');
    else ok('动作总量 ' + totalActions + ' 次（含移动/发言/交易/话题）');

    let consecutive = 0;
    for (let i = 1; i < chats.length; i++) {
      if (chats[i].agentId === chats[i - 1].agentId) consecutive++;
    }
    if (!consecutive) warn('没有观察到连续发言（话题模板里配了 chance，可能是运气）');
    else ok('存在连续发言（' + consecutive + ' 处），不是机械轮换');

    const badVars = chats.filter((e) => !e.vars || Object.keys(e.vars).length === 0);
    if (badVars.length > chats.length * 0.5) fail('超过一半的台词没有变量');
    else ok('台词变量正常（' + (chats.length - badVars.length) + '/' + chats.length + ' 条带变量）');

    let unresolved = 0;
    let unresolvedSample = '';
    for (const lang of ['en', 'zh']) {
      FS.core.i18n.setLang(lang);
      for (const e of chats) {
        const text = FS.core.i18n.t(e.key, FS.core.i18n.localizeVars(e.vars));
        if (/\{[a-zA-Z]\w*\}/.test(text)) {
          unresolved++;
          if (!unresolvedSample) unresolvedSample = lang + ': ' + text.slice(0, 70);
        }
      }
    }
    FS.core.i18n.setLang('en');
    if (unresolved) fail('台词里残留未替换的占位符（' + unresolved + ' 处），例: ' + unresolvedSample);
    else ok('中英双语下台词占位符全部替换成功');

    const spoken = new Set(chats.map((e) => e.agentId));
    if (spoken.size < 2) fail('只有 ' + spoken.size + ' 个角色说过话');
    else ok(spoken.size + ' 个角色参与了对话');

    const memCounts = app.roster.list.map((a) => a.memory.length);
    if (memCounts.every((n) => n === 0)) fail('没有任何角色产生记忆');
    else ok('记忆已写入（' + memCounts.join(' / ') + ' 条，上限 ' + CFG.memoryLimit + '）');
    if (memCounts.some((n) => n > CFG.memoryLimit)) fail('记忆超过上限: ' + memCounts.join('/'));
    else ok('记忆上限未被突破');

    const withGoal = app.roster.list.filter((a) => a.goals.length > 0).length;
    if (!withGoal) fail('没有任何角色持有目标');
    else ok(withGoal + ' 个角色持有目标');

    let affBad = null;
    app.roster.list.forEach((a) => {
      Object.keys(a.affection).forEach((k) => {
        const v = a.affection[k];
        if (v < 0 || v > 200) affBad = a.id + '->' + k + '=' + v;
      });
    });
    if (affBad) fail('好感越界: ' + affBad);
    else ok('好感度始终在 0~200 之间');

    const badPlace = app.roster.list.filter((a) => !FS.data.places.byId[a.state.place]);
    if (badPlace.length) fail('角色在非法地点: ' + badPlace.map((a) => a.id + '=' + a.state.place).join(','));
    else ok('所有角色位置合法');

    const withScores = app.roster.list.filter((a) => a._lastScores && a._lastScores.length).length;
    if (!withScores) fail('没有任何角色留下动作分数明细（面板无法显示）');
    else ok(withScores + ' 个角色留下了动作分数明细');

    const active = FS.ai.dialogue.activeCount();
    const busy = app.roster.list.filter((a) => a.dialogue.instanceId).length;
    if (active > 3) fail('话题实例泄漏: ' + active + ' 个（' + FS.ai.dialogue.debugList().join(', ') + '）');
    else ok('并发话题实例 ' + active + ' 个（占用中的角色 ' + busy + ' 个）');
    if (active === 0 && busy > 0) fail('角色占着已结束的话题实例');
    else ok('话题实例与角色状态一致');
  }
}

/* ==========================================================================
   7.5 持久化与"关页再开"：离线快进 + 世界延续
   ========================================================================== */

console.log('\n=== 7.5 关页再开（离线快进）===');

if (app) {
  const CFG = FS.data.config;
  const Store = FS.persist.store;

  // 这一节要验证"待加入的人被摊开"，需要真的还有待加入的人。
  // 调试节奏（debugJoins）下所有人 30 秒内就到齐了，所以这里临时
  // 切回正式节奏，结束后恢复，避免影响其他检查。
  const prevDebugJoins = CFG.debugJoins;
  CFG.debugJoins = false;

  // 为了验证"离线回来不会一次涌入"，临时把角色池扩到 9 人
  // （3 个真人 + 6 个测试占位）。只有待加入人数 > 1 时，"摊开"才有意义。
  const baseRoster = app.roster;
  const extraDefs = AUX.map((id, i) => ({
    id: id,
    name: 'Aux' + (i + 1),
    personality: { chatty: 0.5, generous: 0.5, timid: 0.4, belligerent: 0.3, curious: 0.5 },
    startPlace: 'camp',
  }));
  const extraAgents = FS.state.agent.createRoster(extraDefs);
  const testRoster = {
    list: baseRoster.list.concat(extraAgents),
    byId: Object.assign({}, baseRoster.byId),
  };
  extraAgents.forEach((a) => { testRoster.byId[a.id] = a; });

  const prevRoster = app.roster;
  const prevWorld = app.world;
  app.roster = testRoster;

  try {
    const t0 = Date.now();
    const worldA = FS.state.world.create(t0);
    FS.state.joins.init(worldA, t0);
    app.world = worldA;
    FS.core.clock.setNow(t0);
    for (let i = 0; i < 100 * 4; i++) FS.core.tick.step(true);
    FS.core.clock.useRealTime();

    const remaining = worldA.pendingJoins.length;
    if (remaining < 1) warn('prep: 没有待加入角色，本组的"摊开"检查不成立');
    else ok('prep: 100 秒后在线 ' + worldA.online.length + ' 人，还有 ' + remaining + ' 个待加入');

    // 新世界必须是"初始状态"：第 1 天 06:00、0/32
    const worldFresh = FS.state.world.create(Date.now());
    const freshOk = worldFresh.startDay === 1 && worldFresh.startHour === 6
      && worldFresh.online.length === 0 && worldFresh.realPlayMs === 0;
    if (!freshOk) {
      fail('新建世界不是初始状态（day=' + worldFresh.startDay + ' hour=' + worldFresh.startHour
        + ' online=' + worldFresh.online.length + ' play=' + worldFresh.realPlayMs + '）');
    } else {
      ok('每次新建世界都是初始状态（第 1 天 06:00、0/32、游玩时间归零）');
    }

    const awayMs = 30 * 60 * 1000;
    const now2 = t0 + 100 * 1000 + awayMs;
    const freshB = FS.state.world.create(t0);        // 相当于"这次打开"的世界
    // 记录"上次离开"，只存时间戳，不存世界状态
    Store.touch(now2 - awayMs);

    const meta = Store.load();
    if (meta.lastSeenMs !== now2 - awayMs) fail('lastSeenMs 没有写入');
    else ok('离开时刻已持久化（lastSeenMs）');

    if (meta.worldStartMs != null || meta.realPlayMs != null
        || meta.pendingJoins != null || meta.visitCount === undefined) {
      // visitCount 可能是 undefined（还没 markVisit），所以只看世界状态字段
    }
    const leaked = ['worldStartMs', 'startDay', 'startHour', 'realPlayMs', 'joinCount',
      'longTailAnchorMs', 'pendingJoins', 'nextJoinAtMs', 'speedMul', 'lastOnline', 'seed']
      .filter((k) => meta[k] !== undefined);
    if (leaked.length) fail('世界状态被写进了存档（刷新后世界无法重置）: ' + leaked.join(', '));
    else ok('存档里没有任何世界状态字段（只剩离开时刻与界面偏好）');

    const plan = FS.backfill.plan(freshB, now2, meta.lastSeenMs);
    if (!plan.needed) fail('离线 30 分钟却没有触发快进计划');
    else ok('离线 ' + Math.round(plan.elapsedMs / 60000) + ' 分钟触发快进计划');

    if (Math.abs(freshB.worldStartMs - t0) > 5) fail('新世界的纪元不是"现在"');
    else ok('世界纪元 = 打开页面的时刻（不会接在上一次的世界后面）');

    const info = FS.backfill.run(freshB, testRoster, { elapsedMs: plan.elapsedMs, nowMs: now2 });
    ok('快进完成（' + info.minutes + ' 分钟步，' + info.ms + 'ms）');

    FS.render.panel.beginHistory();
    FS.render.panel.rebuild(freshB, testRoster);

    const t = freshB.time;
    const expectHour = (6 + plan.elapsedMs / CFG.realMsPerGameHour) % 24;
    if (Math.abs((t.hour + t.minute / 60) - expectHour) > 0.2) {
      fail('快进后世界时间不对: ' + t.hour + ':' + FS.core.clock.pad2(t.minute)
        + '，期望约 ' + expectHour.toFixed(1) + ' 时');
    } else {
      ok('快进后世界时间正确（第 ' + t.day + ' 天 ' + t.hour + ':'
        + FS.core.clock.pad2(t.minute) + '）');
    }

    if (remaining >= 1) {
      const nOn = freshB.online.length;
      if (nOn >= testRoster.list.length) {
        fail('离线回来把待加入的人一次全放完（在线 ' + nOn + '/' + testRoster.list.length + '）');
      } else {
        ok('快进期间不会涌入角色（在线 ' + nOn + '，离线时游玩时间轴是冻结的）');
      }
      if (freshB.nextJoinAtMs <= freshB.realPlayMs) {
        fail('下一次加入时刻仍在过去，一回来会立刻连放');
      } else {
        ok('下一个加入排在未来 '
          + Math.round((freshB.nextJoinAtMs - freshB.realPlayMs) / 1000) + 's 后');
      }
    }

    const before = Store.load().visitCount || 0;
    Store.markVisit(now2);
    if ((Store.load().visitCount || 0) !== before + 1) fail('visitCount 没有累加');
    else ok('访问次数累加正常（第 ' + (before + 1) + ' 次）');
  } finally {
    app.world = prevWorld;
    app.roster = prevRoster;
    CFG.debugJoins = prevDebugJoins;
  }
}

/* ==========================================================================
   7.6 切屏：后台期间不允许打日志（回归测试）
   曾经的 bug：pause() 只设标志位、定时器照跑，
   页面在后台时每个 tick 都照常打日志，用户切回来会看到"凭空冒出来的文本"。
   ========================================================================== */

console.log('\n=== 7.6 切屏（后台不打日志）===');

if (app) {
  const CFG = FS.data.config;
  const Store = FS.persist.store;
  const W = app.world;

  const realNow = Date.now;
  let fakeNow = Date.now();
  Date.now = () => fakeNow;

  try {
    FS.core.tick.start();
    const tickBefore = W.tick;

    for (let i = 0; i < 8; i++) {
      fakeNow += CFG.tickMs;
      FS.core.tick.frame();
    }
    const advanced = W.tick - tickBefore;
    if (advanced <= 0) fail('正常运行时主循环没有推进 tick');
    else ok('正常运行时主循环推进 ' + advanced + ' tick');

    // 隐藏 → 在后台"待" 10 分钟，期间定时器仍可能被调用
    app.forceHidden = true;
    app.forceNow = fakeNow;
    app.onVisibility();
    if (!FS.core.tick.isPaused()) fail('隐藏后 tick 未标记为暂停');
    else ok('隐藏后主循环已暂停');

    const tickHidden = W.tick;
    const bufHidden = FS.render.log.getBuffer().length;
    for (let i = 0; i < 2400; i++) {          // 10 分钟 / 250ms
      fakeNow += CFG.tickMs;
      FS.core.tick.frame();
    }
    if (W.tick !== tickHidden) {
      fail('后台期间世界仍在推进（' + (W.tick - tickHidden) + ' tick）');
    } else {
      ok('后台 10 分钟：世界没有推进（tick 停在 ' + tickHidden + '）');
    }
    const newLines = FS.render.log.getBuffer().length - bufHidden;
    if (newLines > 0) {
      fail('后台期间仍然打出了 ' + newLines + ' 行日志（这就是"切屏冒出文本"的根因）');
    } else {
      ok('后台期间没有产生任何日志');
    }

    // 回到前台：世界时间应当按真实经过时间补上
    const realElapsed = fakeNow - (Store.load().lastSeenMs || fakeNow);
    app.forceHidden = false;
    app.forceNow = fakeNow;
    app.onVisibility();

    const t = W.time;
    const expectedGameHours = realElapsed / CFG.realMsPerGameHour;
    const actualGameHours = t.gameMinutes / 60
      - ((W.startDay - 1) * CFG.dayLengthGameHours + W.startHour);
    if (Math.abs(actualGameHours - expectedGameHours) > 1) {
      fail('回来后世界时间没补上：走过 ' + actualGameHours.toFixed(2)
        + ' 游戏小时，期望约 ' + expectedGameHours.toFixed(2));
    } else {
      ok('切回前台后世界时间补上了（' + actualGameHours.toFixed(2) + ' 游戏小时）');
    }

    const tickResume = W.tick;
    for (let i = 0; i < 8; i++) {
      fakeNow += CFG.tickMs;
      FS.core.tick.frame();
    }
    if (W.tick <= tickResume) fail('切回前台后主循环没有恢复');
    else ok('切回前台后主循环恢复（+' + (W.tick - tickResume) + ' tick）');

    /* 关键回归：切回来不能把已经显示过的文本再打印一遍。
       只看缓冲区抓不到（缓冲一直是对的），必须数 DOM 行数。
       为了让"短暂离开"真的算短暂，这里显式把离开时刻写成当前假时间。 */
    const logEl2 = doc.getElementById('log');
    const before = logEl2._store.length;
    const cap = CFG.logBufferLines;
    /* 缓冲满时（32 人世界里几秒就满），追加一行会挤掉最旧的一行，
       所以 DOM 行数**不变**；未满时才会 +1。两种情况都算正确。 */
    FS.render.log.push({ key: 'log.server.noPlayers', vars: {}, level: 'INFO', thread: 'server' });
    const afterPush = logEl2._store.length;
    const atCap = FS.render.log.getBuffer().length >= cap;
    const expected = atCap ? before : before + 1;
    if (afterPush !== expected) {
      fail('追加一行后 DOM 行数不对（' + before + ' → ' + afterPush
        + '，' + (atCap ? '缓冲已满应为不变' : '缓冲未满应为 +1') + '）');
    } else if (afterPush > cap) {
      fail('DOM 行数超过缓冲上限（' + afterPush + ' > ' + cap + '）');
    } else {
      ok('追加一行后 DOM 行数正确（' + before + ' → ' + afterPush
        + '，缓冲' + (atCap ? '已满' : '未满') + '）');
    }
    /* 真正的回归点：新行必须真的出现在 DOM 里（不能只是"没多也没少"） */
    const newest = logEl2._store[logEl2._store.length - 1];
    const newestText = newest ? newest.textContent : '';
    const wantKey = FS.core.i18n.raw('log.server.noPlayers');
    const wantEn = FS.core.i18n.raw('log.server.noPlayers', 'en');
    const hit = (wantKey && newestText.indexOf(wantKey) !== -1)
      || (wantEn && newestText.indexOf(wantEn) !== -1)
      || /no players|没有玩家/.test(newestText);
    if (!hit) {
      fail('新推送的那一行没有出现在 DOM 末尾（末尾是 "' + newestText.slice(0, 60) + '"）');
    } else {
      ok('新推送的行确实出现在 DOM 末尾');
    }

    let flushCalls = 0;
    const origFlush = FS.render.log.flush;
    FS.render.log.flush = function () {
      flushCalls++;
      return origFlush.apply(this, arguments);
    };

    Store.touch(fakeNow);                     // 离开时刻 = 现在
    app.forceHidden = true;
    app.forceNow = fakeNow;
    app.onVisibility();
    fakeNow += 2000;                          // 只离开 2 秒（小于 minBackfillMs）
    app.forceHidden = false;
    app.forceNow = fakeNow;
    app.onVisibility();
    FS.render.log.flush = origFlush;

    const afterReturn = logEl2._store.length;
    if (afterReturn !== afterPush) {
      fail('短暂切回来后 DOM 行数变了（' + afterPush + ' → ' + afterReturn + '），不应重画；'
        + ' flushCalls=' + flushCalls + ' lastPlan=' + JSON.stringify(app.lastPlan));
    } else {
      ok('短暂切回来不重画、不重复（DOM 保持 ' + afterReturn + ' 行）');
    }

    // 长时间隐藏后回来（真的触发快进）：重画一次，且不能重复
    const domBeforeBackfill = logEl2._store.length;
    const bufBeforeBackfill = FS.render.log.getBuffer().length;
    Store.touch(fakeNow);
    app.forceHidden = true;
    app.forceNow = fakeNow;
    app.onVisibility();
    fakeNow += 5 * 60 * 1000;                 // 隐藏 5 分钟
    app.forceHidden = false;
    app.forceNow = fakeNow;
    app.onVisibility();

    const bufLen = FS.render.log.getBuffer().length;
    const domLen = logEl2._store.length;
    if (domLen > bufLen + 1) {
      fail('快进后重画产生了重复行：DOM ' + domLen + ' 行 vs 缓冲 ' + bufLen + ' 行');
    } else if (domLen < Math.min(bufLen, CFG.logBufferLines)) {
      fail('快进后 DOM 行数少于应有行数：DOM ' + domLen + ' 行，缓冲 ' + bufLen + ' 行');
    } else {
      ok('快进后整屏重画没有重复（DOM ' + domLen + ' 行 / 缓冲 ' + bufLen + ' 行）');
    }

    // 再切一次短离开：DOM 必须保持不变（这是用户报的那个 bug 的核心断言）
    const domBeforeShort = logEl2._store.length;
    Store.touch(fakeNow);
    app.forceHidden = true;
    app.forceNow = fakeNow;
    app.onVisibility();
    fakeNow += 1000;
    app.forceHidden = false;
    app.forceNow = fakeNow;
    app.onVisibility();
    const domAfterShort = logEl2._store.length;
    if (domAfterShort !== domBeforeShort) {
      fail('反复切屏导致 DOM 行数增长（' + domBeforeShort + ' → ' + domAfterShort + '）');
    } else {
      ok('反复切屏 DOM 行数恒定（' + domAfterShort + ' 行）');
    }
  } catch (e) {
    fail('切屏测试抛错: ' + e.stack.split('\n').slice(0, 3).join('\n       '));
  } finally {
    Date.now = realNow;
    app.forceHidden = null;
    app.forceNow = null;
    FS.core.tick.stop();
    FS.core.clock.useRealTime();
    FS.core.tick.resume();
  }
}

/* ==========================================================================
   7.7 UI 行为：日志不做淡入 / 面板详情可折叠
   ========================================================================== */

console.log('\n=== 7.7 UI 行为 ===');

if (app) {
  // 先确认桩本身是"像浏览器的"：childNodes 必须是 NodeList 语义，
  // 用了数组方法要报错。否则 panel.js 里 childNodes.slice() 这种崩溃会漏过测试。
  let stubStrict = false;
  try {
    doc.getElementById('panelBody').childNodes.slice();
  } catch (e) {
    stubStrict = true;
  }
  if (!stubStrict) fail('DOM 桩的 childNodes 不是 NodeList 语义（会漏掉真实崩溃）');
  else ok('DOM 桩的 childNodes 保持 NodeList 语义（数组方法会报错）');

  // 日志行不允许带淡入动画类（需求：像 cmd 一样"生硬"打印）
  const logEl = doc.getElementById('log');
  const animRows = logEl._store.filter((n) => n.classList && n.classList.contains('enter'));
  if (animRows.length) fail('日志行仍带淡入动画类（.enter）: ' + animRows.length + ' 行');
  else ok('日志行没有淡入动画类（直接打印）');

  const cssText = fs.readdirSync(path.join(ROOT, 'css'))
    .map((f) => fs.readFileSync(path.join(ROOT, 'css', f), 'utf8')).join('\n');
  if (/\.logline\.enter\s*\{[^}]*animation:\s*lineIn/.test(cssText)) {
    fail('CSS 里仍给日志行配了 lineIn 淡入动画');
  } else {
    ok('CSS 未给日志行配淡入动画');
  }

  // 面板角色详情：点一次展开、再点一次必须收起（先确保是"未选中"状态）
  /* v1.0 起面板**默认收起**（调试面板不该给看服务器的人看见），
     收起状态下不渲染角色行，所以这里先显式展开再测。 */
  if (FS.render.topbar.isPanelCollapsed()) {
    FS.render.topbar.setPanelCollapsed(false);
  }
  FS.render.panel.rebuild(app.world, app.roster);
  const firstAgent = app.roster.list[0];
  const countDetail = (node) => {
    let n = 0;
    (function walk(x) {
      (x._store || []).forEach((c) => {
        if (c.classList && c.classList.contains('agent-detail')) n++;
        walk(c);
      });
    })(node);
    return n;
  };
  const row = doc.getElementById('panelBody');

  let pre = countDetail(row);
  if (pre !== 0) {
    // 重建后不该残留详情；如果残留说明"换选中项时旧详情没清掉"
    FS.render.panel.toggleAgent(FS.render.panel.getSelected());
    FS.render.panel.render();
    pre = countDetail(row);
  }
  if (pre !== 0) fail('面板重建后仍残留 ' + pre + ' 个详情块');
  else ok('面板重建后没有残留详情块');

  FS.render.panel.toggleAgent(firstAgent.id);
  FS.render.panel.render();
  const hasDetail = countDetail(row);
  if (hasDetail !== 1) fail('点击角色后详情块数量应为 1，实际 ' + hasDetail);
  else ok('点击角色行成功展开详情');

  FS.render.panel.toggleAgent(firstAgent.id);
  FS.render.panel.render();
  const hasDetail2 = countDetail(row);
  if (hasDetail2 !== 0) fail('再次点击同一角色后详情没有收起（仍剩 ' + hasDetail2 + ' 块）');
  else ok('再次点击同一角色可以收起详情');

  // 换一个角色：旧详情必须消失，只留新角色的
  const second = app.roster.list[1];
  FS.render.panel.toggleAgent(firstAgent.id);
  FS.render.panel.render();
  FS.render.panel.toggleAgent(second.id);
  FS.render.panel.render();
  const swapCount = countDetail(row);
  if (swapCount !== 1) fail('切换选中角色后详情块数量应为 1，实际 ' + swapCount);
  else ok('切换选中角色时旧详情会被清掉');
  FS.render.panel.toggleAgent(second.id);
  FS.render.panel.render();

  // 沉浸模式开关
  FS.render.topbar.setImmersive(true);
  if (!FS.render.topbar.isImmersive()) fail('无法开启沉浸模式');
  else if (!doc.body.classList.contains('immersive')) fail('沉浸模式没有加在 body 上');
  else ok('沉浸模式可以开启（隐藏顶栏与面板）');
  FS.render.topbar.setImmersive(false);
  if (FS.render.topbar.isImmersive()) fail('无法退出沉浸模式');
  else ok('沉浸模式可以退出');

  // ---- 7.7b 顶栏必须跟着世界变化（导入快照后曾经不刷新） ----
  {
    const w0 = app.world;
    /* 造一个"明显不同"的世界：在线人数与时间都变了 */
    const w1 = FS.state.world.create(Date.now());
    app.roster.list.forEach((a) => FS.state.agent.leave(app.roster, a));
    FS.state.agent.join(app.roster, app.roster.list[0], Date.now());
    FS.state.world.syncRoster(w1, app.roster);
    w1.time = { day: 3, hour: 22, minute: 41, gameMinutes: 2 * 1440 + 22 * 60 + 41, minuteOfDay: 1361 };

    FS.render.topbar.setWorld(w1);
    const onlineTxt = doc.getElementById('onlineVal').textContent;
    const timeTxt = doc.getElementById('timeVal').textContent;
    if (onlineTxt.indexOf('1 /') === -1) {
      fail('setWorld 后顶栏在线数没刷新（显示 "' + onlineTxt + '"）');
    } else if (timeTxt.indexOf('22:41') === -1) {
      fail('setWorld 后顶栏时间没刷新（显示 "' + timeTxt + '"）');
    } else {
      ok('setWorld 后顶栏立即刷新（在线 ' + onlineTxt + '，时间 ' + timeTxt + '）');
    }
    app.world = w0;
  }

  // ---- 7.7e 实时调参：旋钮必须真的改到 config（含点号路径） ----
  {
    const knobs = FS.render.panel.knobs || [];
    if (knobs.length < 15) {
      fail('调参旋钮太少（' + knobs.length + ' 个），权重类旋钮没接上');
    } else {
      /* 直接调 knobSet/knobGet 的公开行为：改 baseWeight.speak 后 config 必须变 */
      const before = FS.data.config.baseWeight.speak;
      FS.render.panel.rebuild(app.world, app.roster);
      const inp = doc.getElementById('panelBody')._store.length ? null : null;
      if (inp) { /* 仅用于保持变量被使用 */ }

      /* 模拟用户改输入框：找到面板里对应的 input，改值并派发 change */
      let target = null;
      const all = [];
      (function walk(node) {
        if (!node) return;
        if (node._store) node._store.forEach(walk);
        if (node.dataset && node.dataset.knob === 'baseWeight.speak') target = node;
        all.push(node);
      })(doc.getElementById('panelBody'));
      if (!target) {
        warn('面板里找不到 baseWeight.speak 的输入框，跳过交互测试');
      } else {
        target.value = String(before + 1);
        target.dispatchEvent({ type: 'change' });
        if (FS.data.config.baseWeight.speak !== before + 1) {
          fail('改输入框没有生效（baseWeight.speak 仍是 ' + FS.data.config.baseWeight.speak + '）');
        } else {
          ok('权重旋钮真的改到了 config（baseWeight.speak ' + before + ' → ' + before + 1 + '）');
          FS.data.config.baseWeight.speak = before;
        }
      }
      /* 点号路径的读写 */
      const pathOk = knobs.every((k) => {
        const v = FS.data.config;
        const parts = k.key.split('.');
        let cur = v;
        for (let i = 0; i < parts.length; i++) cur = cur == null ? undefined : cur[parts[i]];
        return cur !== undefined;
      });
      if (!pathOk) {
        const bad = knobs.filter((k) => {
          const parts = k.key.split('.');
          let cur = FS.data.config;
          for (let i = 0; i < parts.length; i++) cur = cur == null ? undefined : cur[parts[i]];
          return cur === undefined;
        }).map((k) => k.key);
        fail('有旋钮指向了不存在的配置项: ' + bad.join(', '));
      } else {
        ok('全部 ' + knobs.length + ' 个旋钮都指向真实存在的配置项');
      }
    }
  }

  // ---- 7.7f 面板要解释"为什么他没说话" ----
  {
    const CFG2 = FS.data.config;
    const agent = app.roster.list[0];
    FS.state.agent.join(app.roster, agent, Date.now());
    agent._lastSpeakBlocked = 'awaiting';
    agent.waitingOnId = app.roster.list[1].id;
    FS.render.panel.rebuild(app.world, app.roster);
    FS.render.panel.toggleAgent(agent.id);
    const text = doc.getElementById('panelBody').textContent;
    if (text.indexOf(FS.core.i18n.t('panel.speakBlocked.awaiting')) === -1) {
      fail('面板没有解释"为什么他没说话"');
    } else {
      ok('面板会说明被节奏约束的原因（' + FS.core.i18n.t('panel.speakBlocked.awaiting') + '）');
    }
    agent._lastSpeakBlocked = null;
    if (CFG2) { /* 保持引用 */ }
  }
}
  {
  // ---- 7.7d 顶栏必须随 tick 自动前进（曾经整个 tick 循环里都没有 topbar.render） ----
  {
    const CFG2 = FS.data.config;
    const w2 = FS.state.world.create(Date.now());
    app.world = w2;
    FS.state.world.syncRoster(w2, app.roster);
    FS.render.topbar.setWorld(w2);

    const t0 = doc.getElementById('timeVal').textContent;

    /* 跑 30 分钟游戏时间（= 1 真实分钟 = 240 tick），顶栏时间必须变 */
    let now = Date.now();
    const realNow = Date.now;
    Date.now = () => now;
    try {
      for (let i = 0; i < 240; i++) {
        now += CFG2.tickMs;
        FS.core.clock.setNow(now);
        FS.core.tick.step(false);
      }
    } finally {
      Date.now = realNow;
    }
    const t1 = doc.getElementById('timeVal').textContent;
    if (t0 === t1) {
      fail('跑了 30 分钟游戏时间，顶栏时间仍是 "' + t0 + '"（tick 循环里没有刷新顶栏）');
    } else {
      ok('顶栏随时间自动前进（' + t0.trim() + ' → ' + t1.trim() + '）');
    }
  }

  // ---- 7.7g 快进：按钮按下后世界必须真的往后走 ----
  {
    const FFCFG = FS.data.config;
    const t0 = Date.now();
    const w = FS.state.world.create(t0);
    app.world = w;
    app.roster.list.forEach((a) => FS.state.agent.leave(app.roster, a));
    FS.state.joins.init(w, t0);
    FS.core.bus.clear();
    FS.ai.dialogue.reset();
    FS.render.log.clear();

    let now = t0;
    const realNow = Date.now;
    Date.now = () => now;
    try {
      FS.core.clock.setNow(now);
      /* 让几个人先上线，这样快进期间会有动静 */
      for (let i = 0; i < 6; i++) {
        FS.state.agent.join(app.roster, app.roster.list[i], now);
        app.roster.list[i].onlineSinceGameMinute = -9999;
      }
      FS.state.world.syncRoster(w, app.roster);

      const tickBefore = w.tick;
      const dayBefore = w.time.gameMinutes;
      const playBefore = w.realPlayMs || 0;
      const info = FS.app.fastForward(2);
      /* 关键：游戏时间要在 fastForward **返回时**读。
         它内部最后会把时钟切回真实时间，而 world.time 是从时钟推导的，
         之后再 setNow(Date.now()) 会把差值抹掉 ——
         第一版测试就是这么写错的，测出来永远是 0。 */
      const gameMinAdvanced = w.time.gameMinutes - dayBefore;
      FS.core.clock.setNow(Date.now());

      if (!info) {
        fail('fastForward 返回了 null（内部抛错）');
      } else {
        const expectTicks = Math.round(2 * 60 * 1000 / FFCFG.tickMs);
        if (info.ticks !== expectTicks) {
          fail('快进 2 分钟应推进 ' + expectTicks + ' tick，实际 ' + info.ticks);
        } else {
          ok('快进 2 分钟推进了 ' + info.ticks + ' tick（世界 tick ' + tickBefore
            + ' → ' + w.tick + '）');
        }
        /* 时间尺度：1 游戏小时 = 2 真实分钟。
           所以快进 2 真实分钟 = 1 游戏小时 = **60 游戏分钟**（不是 120——
           120 是"2 游戏小时"，那需要 4 真实分钟）。 */
        if (gameMinAdvanced < 55 || gameMinAdvanced > 65) {
          fail('快进 2 分钟推进了 ' + Math.round(gameMinAdvanced)
            + ' 游戏分钟（应约 60：1 游戏小时 = 2 真实分钟）');
        } else {
          ok('游戏内时间推进了 ' + Math.round(gameMinAdvanced) + ' 分钟（1 游戏小时）');
        }
        const playAdvanced = (w.realPlayMs || 0) - playBefore;
        if (Math.abs(playAdvanced - 120000) > 5000) {
          fail('快进的游玩时间轴不是 2 分钟（' + Math.round(playAdvanced / 1000) + ' 秒）');
        } else {
          ok('游玩时间轴推进了 ' + Math.round(playAdvanced / 1000) + ' 秒');
        }
      }
      /* 快进结果要重画到 DOM，并且有一行系统提示 */
      const store = doc.getElementById('log')._store.length;
      if (store < 1) fail('快进后没有重画控制台');
      else ok('快进后控制台重画了 ' + store + ' 行');
      const note = FS.render.log.getBuffer().some((e) => e.key === 'log.command.fastForward');
      if (!note) fail('快进后没有产出系统提示行');
      else ok('快进后产出了系统提示行');
      /* 帧基准要重设，否则主循环会再补跑一遍 */
      const beforeIdle = w.tick;
      FS.core.tick.frame();
      if (w.tick !== beforeIdle) {
        fail('快进后主循环又补跑了 tick（帧基准没重设，日志会重复）');
      } else {
        ok('快进后主循环不会补跑（帧基准已重设）');
      }
    } finally {
      Date.now = realNow;
      FS.core.clock.useRealTime();
    }
  }

  // ---- 7.7h 开机不该冒出"凭空的噪音"（用户反馈：左上角多一条消息） ----
  {
    const t0 = Date.now();
    const w = FS.state.world.create(t0);
    app.world = w;

    /* 根因：lastOutputTick 如果是 undefined，quietFor() 会返回一个巨大值，
       于是 backfill（离线快进）的第一个 tick 就立刻吐一条环境噪音，
       而那条噪音会排在"当前没有玩家在线"**之前**。 */
    if (w.lastOutputTick == null) {
      fail('新建世界时 lastOutputTick 是 undefined（快进会立刻吐噪音）');
    } else {
      ok('新建世界时 lastOutputTick 已初始化（' + w.lastOutputTick + '）');
    }
    if (w.bootTick == null) fail('新建世界时没有记录 bootTick');
    else ok('新建世界时记录了 bootTick（用于开机的静默期）');

    /* 让"安静够久"这个前提成立，这样测的才是静默期本身 */
    w.tick = FS.data.config.noiseQuietGapTicks + 10;
    const q = FS.state.noise.quietFor(w);
    const quietEnough = q >= FS.data.config.noiseQuietGapTicks;
    if (!quietEnough) {
      fail('测试前提不成立：quietFor=' + q + ' 小于阈值');
    } else if (!FS.state.noise.warmingUp(w)) {
      fail('开机时没有进入"静默期"，快进会立刻吐噪音');
    } else {
      const out = FS.state.noise.run(w, app.roster, false);
      if (out.length) {
        fail('开机静默期内仍然产出了噪音：' + JSON.stringify(out[0].key));
      } else {
        ok('开机静默期内不出环境噪音（' + FS.data.config.noiseBootQuietTicks + ' tick）');
      }
    }

    /* 静默期过后应该恢复正常出噪音 */
    w.tick = (FS.data.config.noiseBootQuietTicks || 240) + 10;
    w.lastOutputTick = 0;
    let got = [];
    for (let i = 0; i < 4000 && !got.length; i++) {
      w.tick += 1;
      got = FS.state.noise.run(w, app.roster, true);
    }
    if (!got.length) warn('静默期过后很久都没出噪音（概率问题）');
    else ok('静默期过后恢复正常出噪音（' + got[0].key + '）');
  }

  // ---- 7.7c 用户命令回显必须留在缓冲里（切屏/切语言后仍在） ----
  {
    FS.render.log.clear();
    FS.cmd.parser.exec('help', { silent: false });
    const bufAfterExec = FS.render.log.getBuffer();
    const echoInBuf = bufAfterExec.filter((e) => e.kind === 'echo');
    if (!echoInBuf.length) {
      fail('命令回显没有进缓冲（切屏/切语言后会消失）');
    } else {
      const domBefore = doc.getElementById('log')._store.length;
      FS.render.log.rerender();               // 等价于"切语言 / 快进后重画"
      const domAfter = doc.getElementById('log')._store.length;
      const echoInDom = doc.getElementById('log')._store
        .filter((n) => n.classList && n.classList.contains('echo')).length;
      if (echoInDom !== 1) {
        fail('整屏重画后回显丢失（重画前后 DOM ' + domBefore + ' → ' + domAfter
          + '，回显行 ' + echoInDom + '）');
      } else {
        ok('整屏重画后用户命令回显仍在（' + echoInDom + ' 行）');
      }
    }
  }
}

/* ==========================================================================
   7.8 冷启动：长时间未访问后打开，必须直接看到回放出来的历史
   曾经的 bug：rerender() 里有 `if (!nodes.length) return;`，
   而 nodes 只在"非静音 push"时增长 —— 快进全是静音 push，
   于是 flush() 什么都没画，控制台是空的（只有之后第一条实时日志才显示）。
   ========================================================================== */

console.log('\n=== 7.8 冷启动（离线很久后再打开）===');

if (app) {
  const R = FS.core.rng;

  // 用同一个种子，保证这次冷启动与首次启动走的是同一场世界
  R.seed(FS.data.config.seed);
  storage.clear();                       // 清掉存档，模拟"很久以前来过"

  const awayMs = 40 * 60 * 1000;         // 上次离开在 40 分钟前
  storage.setItem('fs.meta.v0.1', JSON.stringify({
    lastSeenMs: Date.now() - awayMs,
    firstSeenMs: Date.now() - awayMs * 3,
    visitCount: 1,
    // 故意塞入旧版本残留的世界状态字段：必须被忽略（否则刷新后世界不会重置）
    worldStartMs: Date.now() - awayMs - 7200000,
    startDay: 3,
    startHour: 21,
    realPlayMs: 999999,
    joinCount: 3,
    pendingJoins: [],
    nextJoinAtMs: 123456,
  }));

  // 重新走一遍启动流程（DOM 节点复用已建好的那套）
  const logEl3 = doc.getElementById('log');
  logEl3.textContent = '';
  let coldErr = null;
  try {
    doc.fireDOMContentLoaded();
  } catch (e) {
    coldErr = e;
  }

  if (coldErr) {
    fail('冷启动抛错: ' + coldErr.stack.split('\n').slice(0, 3).join('\n       '));
  } else {
    const bufLen = FS.render.log.getBuffer().length;
    const domLen = logEl3._store.length;
    const hasDivider = logEl3._store.some((n) => n.classList && n.classList.contains('divider'));

    // 关键：即使存档里塞了旧的世界状态字段，也必须开出"新世界"
    const w3 = app.world;
    const dayOk = w3.startDay === 1 && w3.startHour === 6 && w3.realPlayMs < 60 * 60 * 1000;
    if (!dayOk) {
      fail('存档里的世界状态泄漏进了新世界（day=' + w3.startDay + ' hour=' + w3.startHour
        + ' realPlayMs=' + w3.realPlayMs + '）');
    } else {
      ok('忽略存档里残留的世界状态，开出新世界（第 1 天 06:00 起步）');
    }

    if (bufLen === 0) {
      fail('冷启动后缓冲为空（快进没有产生历史）');
    } else if (domLen < bufLen) {
      fail('冷启动后控制台没有把历史画出来：DOM ' + domLen + ' 行，缓冲 ' + bufLen + ' 行');
    } else if (!hasDivider) {
      fail('冷启动后缺少"以上为历史记录"分隔行');
    } else {
      ok('离线 40 分钟后打开，直接看到 ' + domLen + ' 行历史（缓冲 ' + bufLen + ' 行）+ 分隔行');
    }

    // 历史回放完之后，世界应当继续跑（主循环读 Date.now，所以要打桩）
    const realNow3 = Date.now;
    let coldNow = Date.now();
    Date.now = () => coldNow;
    try {
      const tickAtBoot = app.world.tick;
      FS.core.tick.resume();
      for (let i = 0; i < 8; i++) {
        coldNow += FS.data.config.tickMs;
        FS.core.tick.frame();
      }
      if (app.world.tick <= tickAtBoot) fail('冷启动后主循环没有继续推进');
      else ok('冷启动后世界继续运行（+' + (app.world.tick - tickAtBoot) + ' tick）');

      /* 用户报的问题：反复刷新后时间一直是第二天、加入时间一直是 7 分钟。
         连续"再打开"几次，每次都必须从第 1 天起步。 */
      const days = [app.world.time.day];
      for (let r = 0; r < 3; r++) {
        coldNow += 3 * 60 * 1000;          // 每次间隔 3 分钟
        app.save();                        // 相当于关闭页面（记录离开时刻）
        doc.fireDOMContentLoaded();        // 重新打开
        days.push(app.world.time.day);
      }
      const allFirstDay = days.every((d) => d === 1);
      if (!allFirstDay) {
        fail('反复刷新后天数不是从第 1 天开始，实际序列: ' + days.join(' → '));
      } else {
        ok('反复刷新 3 次，每次都是第 1 天（days: ' + days.join(' → ') + '）');
      }
    } finally {
      Date.now = realNow3;
    }
  }
}

/* ==========================================================================
   7.9 离开规则（v0.2）
   用 debugLeave 把阈值压到几十秒，验证：会走、走前有征兆、走了会回来。
   ========================================================================== */

console.log('\n=== 7.9 离开规则（v0.2）===');

if (app) {
  const CFG = FS.data.config;
  const prevDebugLeave = CFG.debugLeave;
  CFG.debugLeave = true;

  try {
    const t0 = Date.now();
    const w = FS.state.world.create(t0);
    app.world = w;
    app.roster.list.forEach((a) => {
      FS.state.agent.leave(app.roster, a);
      a.memory.length = 0;
      a.goals.length = 0;
      a.affection = {};
      a.stats.topicsStarted = 0;
      a.stats.spoken = 0;
      a.cameBackCount = 0;
    });
    FS.state.joins.init(w, t0);
    FS.render.log.clear();
    FS.state.world.syncRoster(w, app.roster);

    // 跑 20 分钟看是否出现"下线 → 再上线"的循环
    const TICKS = Math.round(20 * 60 * 1000 / CFG.tickMs);
    for (let i = 0; i < TICKS; i++) {
      FS.core.clock.setNow(t0 + (i + 1) * CFG.tickMs);
      FS.core.tick.step(true);
    }
    FS.core.clock.setNow(t0 + TICKS * CFG.tickMs);

    const buf = FS.render.log.getBuffer();
    const leaveLogs = buf.filter((e) => e.key === 'log.server.leave');
    const timeoutLogs = buf.filter((e) => e.key === 'log.server.timeout');
    const joinLogs = buf.filter((e) => e.key === 'log.server.join' || e.key === 'log.server.joinFirst');
    const byeChats = buf.filter((e) => e.level === 'CHAT'
      && /topic\.farewell|chat\.leave\./.test(e.key || ''));

    const allLeaveLogs = leaveLogs.concat(timeoutLogs);
    if (!allLeaveLogs.length) {
      fail('20 分钟内没有任何角色下线（阈值 ' + CFG.logoutAfterMsDebug + 'ms，概率曲线可能太保守）');
    } else {
      ok('20 分钟内出现 ' + allLeaveLogs.length + ' 次下线（正常退出 ' + leaveLogs.length
        + ' / 连接超时 ' + timeoutLogs.length + '）');
    }

    // 系统日志只允许两类，且**不得**暴露具体缘由（服务器不可能知道）
    const leaked = allLeaveLogs.filter((e) => e.vars && e.vars.reason);
    if (leaked.length) {
      fail('下线系统日志里出现了具体缘由（服务器不该知道玩家去干什么）');
    } else {
      ok('下线系统日志只有"退出游戏 / 连接超时"两类，没有暴露具体缘由');
    }

    if (!byeChats.length) {
      fail('下线前没有任何告别征兆（用户看不出他要走）');
    } else {
      ok('下线前有告别征兆（' + byeChats.length + ' 条）');
    }

    // 关键：连接超时是突发事件 —— 不能有告别台词，也不能是"他说自己要掉线"
    let timeoutWithBye = 0;
    for (let i = 0; i < buf.length; i++) {
      const e = buf[i];
      if (e.key !== 'log.server.timeout') continue;
      // 只回看 12 行、且必须是同一个人的告别才算"预告掉线"
      for (let j = Math.max(0, i - 12); j < i; j++) {
        const p = buf[j];
        if (p.level === 'CHAT' && p.agentId === e.vars.name.id
            && /topic\.farewell|chat\.leave\./.test(p.key || '')) {
          timeoutWithBye++;
        }
      }
    }
    if (timeoutWithBye) {
      fail('连接超时前出现了告别台词（' + timeoutWithBye + ' 处）—— 掉线是突发事件，角色不该预告');
    } else if (!timeoutLogs.length) {
      warn('本局没有出现"连接超时"（8:2 权重下的运气问题，已由 7.9b 定向验证）');
    } else {
      ok('连接超时没有任何告别征兆（突发事件）');
    }

    // 填充行"暂时没什么动静"不应再出现在控制台
    const quiet = buf.filter((e) => e.key === 'log.world.quiet');
    if (quiet.length) fail('控制台仍有填充行 log.world.quiet（' + quiet.length + ' 条）');
    else ok('没有"暂时没什么动静"这类填充行');

    // 告别台词里的 {reason} 必须被替换成真实理由（曾经漏成空串）
    let byeBad = 0;
    let byeSample = '';
    for (const lang of ['en', 'zh']) {
      FS.core.i18n.setLang(lang);
      for (const e of byeChats) {
        const text = FS.core.i18n.t(e.key, FS.core.i18n.localizeVars(e.vars));
        if (/\{[a-zA-Z]\w*\}/.test(text) || /，\s*$|,\s*$/.test(text)) {
          byeBad++;
          if (!byeSample) byeSample = lang + ': ' + text;
        }
      }
    }
    FS.core.i18n.setLang('en');
    if (byeBad) fail('告别台词没有正确带上理由（' + byeBad + ' 处），例: ' + byeSample);
    else ok('告别台词都带上了真实理由');

    // 下线的人必须能再回来：加入日志数应多于角色数
    const joinsAfterFirstRound = joinLogs.length;
    if (joinsAfterFirstRound <= 3) {
      fail('下线后没有人再上线（加入日志只有 ' + joinsAfterFirstRound + ' 条）');
    } else {
      ok('下线之后有人重新上线（累计加入日志 ' + joinsAfterFirstRound + ' 条）');
    }

    // 在场的人应当记得他走了
    let memLeft = 0;
    app.roster.list.forEach((a) => {
      memLeft += a.memory.filter((m) => m.key === 'mem.left').length;
    });
    if (!memLeft) warn('没有人生成"某人下线了"的记忆（有概率，不一定是 bug）');
    else ok('在场角色留下了"某人下线"的记忆（' + memLeft + ' 条）');

    // 关键：刚上线的人不应该马上又走（阈值之前概率必须是 0）
    const fresh = app.roster.list[0];    FS.state.agent.join(app.roster, fresh, FS.core.clock.now());
    const before = FS.core.tick.stats ? 1 : 1;
    let leftEarly = false;
    for (let i = 0; i < 40; i++) {          // 10 秒
      FS.core.clock.setNow(FS.core.clock.now() + CFG.tickMs);
      FS.core.tick.step(true);
      if (!fresh.state.online) leftEarly = true;
    }
    if (leftEarly) fail('刚上线的角色在阈值之前就离开了');
    else ok('刚上线的角色不会立刻离开（阈值前概率为 0）');
    if (before !== 1) { /* 保持变量被使用 */ }

    // ---- 7.9c 说了"我先下了"就必须真的下线（用户反馈：说了没走） ----
    {
      /* ⚠️ 必须显式关掉 debugLeave：前面几节把它打开过，
         否则"吃饭 10 分钟回来"会被压缩成 9 秒，
         本节想验证的"下线后短时间内不该回来"就测不出来了。 */
      const prevDebugLeave9 = CFG.debugLeave;
      CFG.debugLeave = false;
      FS.render.log.clear();
      const t9 = FS.core.clock.now();
      const w9 = FS.state.world.create(t9);
      app.world = w9;
      app.roster.list.forEach((a) => {
        FS.state.agent.leave(app.roster, a);
        a.leaving = null;
        a.dead = false;
        a.state.permanentDeath = false;
        a.topicCooldownUntilTick = 0;
      });
      FS.state.joins.init(w9, t9);
      FS.core.bus.clear();
      FS.ai.dialogue.reset();
      FS.core.clock.setNow(t9);
      const leaver = app.roster.list[0];
      const mate = app.roster.list[1];
      FS.state.agent.join(app.roster, leaver, t9);
      FS.state.agent.join(app.roster, mate, t9);
      leaver.onlineSinceGameMinute = -9999;
      FS.state.world.syncRoster(w9, app.roster);

      /* 强制一次"正常退出"。
         注意参数顺序是 (agent, world, roster, nowMs, silent, forceMode)。 */
      const out = FS.state.leave.begin(leaver, w9, app.roster, t9, false, 'quit');
      const announced = (out && out.length) || leaver.leaving.announced
        || (leaver.typing ? 1 : 0);
      if (!leaver.leaving) fail('begin 之后没有进入离开流程');
      else if (!announced) warn('离开前没有产生告别（可能本来就没征兆）');
      else ok('开始离开流程并说了告别');

      /* 跑到该退出的时刻之后 */
      const delayTicks = Math.max(1, Math.ceil((leaver.leaving.atMs - t9) / CFG.tickMs)) + 5;
      let wentOffline = false;
      let cameBack = false;
      for (let i = 0; i < delayTicks + 40; i++) {
        FS.core.clock.setNow(FS.core.clock.now() + CFG.tickMs);
        FS.core.tick.step(false);
        if (!leaver.state.online) wentOffline = true;
        else if (wentOffline) cameBack = true;
      }
      const leaveLog = FS.render.log.getBuffer().some((e) => e.key === 'log.server.leave');
      if (!wentOffline) {
        fail('说了"我先下了"却一直没下线（leave.atMs 到了也没走）');
      } else if (!leaveLog) {
        fail('下线了但没有产出 log.server.leave');
      } else if (cameBack) {
        fail('刚下线就立刻自己上线了（rejoin 没有生效）');
      } else {
        ok('说了告别后确实下线了，且没有立刻自己回来');
      }
      /* 回归时间应该排在未来（正式节奏下是几分钟，不是几秒） */
      const pending = (w9.rejoins || []).filter((r) => r.agentId === leaver.id);
      if (!pending.length) {
        warn('下线后没有排到"回归队列"（他不会再上线了）');
      } else {
        const mins = Math.round((((pending[0].atPlayMs || 0) - (w9.realPlayMs || 0)) / 60000) * 10) / 10;
        if (mins < 4) fail('回归间隔太短（' + mins + ' 分钟），会显得"刚走就回来"');
        else ok('回归排在 ' + mins + ' 分钟后（正式节奏）');
      }
      CFG.debugLeave = prevDebugLeave9;
    }

    // ---- 7.9b 定向验证"连接超时"：强制走 timeout 路径 ----
    FS.render.log.clear();
    const t1 = FS.core.clock.now();
    const w2 = FS.state.world.create(t1);
    app.world = w2;
    app.roster.list.forEach((a) => { FS.state.agent.leave(app.roster, a); a.leaving = null; });
    FS.state.joins.init(w2, t1);
    const victim = app.roster.list[0];
    const witness = app.roster.list[1];
    FS.state.agent.join(app.roster, victim, t1);
    FS.state.agent.join(app.roster, witness, t1);
    FS.state.world.syncRoster(w2, app.roster);

    FS.state.leave.begin(victim, w2, app.roster, t1, false, 'timeout');
    /* 这条子测要验证"掉线瞬间"的状态，所以把"再上线"推到很远，
       否则 4~12 秒的 rejoin 会在我们检查之前就把他拉回来。 */
    const prevRejoin = CFG.rejoinDelayMsDebug;
    CFG.rejoinDelayMsDebug = [3600 * 1000, 7200 * 1000];
    for (let i = 0; i < 40; i++) {                  // 10 秒
      FS.core.clock.setNow(FS.core.clock.now() + CFG.tickMs);
      FS.core.tick.step(true);
    }
    CFG.rejoinDelayMsDebug = prevRejoin;

    const buf3 = FS.render.log.getBuffer();
    const toLog = buf3.filter((e) => e.key === 'log.server.timeout');
    const quitLog = buf3.filter((e) => e.key === 'log.server.leave');
    const victimChat = buf3.filter((e) => e.level === 'CHAT' && e.agentId === victim.id);
    if (!toLog.length) fail('强制 timeout 后没有产出"连接超时"日志');
    else if (quitLog.length) fail('强制 timeout 却记录了"退出游戏"');
    else if (victimChat.length) fail('掉线的人还说了话：' + victimChat.length + ' 条');
    else if (victim.state.online) fail('掉线的人还留在线');
    else ok('强制 timeout：只记"连接超时"、角色没说话、已离线');
  } catch (e) {
    fail('离开规则测试抛错: ' + e.stack.split('\n').slice(0, 4).join('\n       '));
  } finally {
    CFG.debugLeave = prevDebugLeave;
  }
}

/* ==========================================================================
   7.10 用户命令完整链路（v0.2）
   命令 → Event 队列 → 下一 tick 执行 → 状态变化 + 记忆 + 对控制台好感 + 旁人议论
   ========================================================================== */

console.log('\n=== 7.10 用户命令链路（v0.2）===');

if (app) {
  const CFG = FS.data.config;
  const Agents = FS.state.agent;
  const CONSOLE = 'console';

  // 准备一个干净的三人在线世界
  const t0 = Date.now();
  const w = FS.state.world.create(t0);
  app.world = w;
  app.roster.list.forEach((a) => {
    Agents.leave(app.roster, a);
    a.memory.length = 0;
    a.goals.length = 0;
    a.affection = {};
    a.leaving = null;
  });
  FS.state.joins.init(w, t0);
  FS.core.bus.clear();
  FS.render.log.clear();
  FS.core.clock.setNow(t0);
  app.roster.list.forEach((a) => Agents.join(app.roster, a, t0));
  FS.state.world.syncRoster(w, app.roster);

  const steve = app.roster.byId[AG(0).id];
  const alex = app.roster.byId[AG(1).id];

  // 1) kick：入队后立刻不生效，下一 tick 才生效
  const onlineBefore = w.online.length;
  FS.cmd.parser.exec('kick ' + AG(0).name);
  if (w.online.length !== onlineBefore) {
    fail('kick 在入队当帧就生效了（应先进入 Event 队列）');
  } else if (FS.core.bus.size() !== 1) {
    fail('kick 没有进入 Event 队列（队列长度 ' + FS.core.bus.size() + '）');
  } else {
    ok('kick 进入 Event 队列，当帧不生效（等待下一 tick）');
  }

  // 2) 下一 tick 生效
  FS.core.tick.step(false);
  if (steve.state.online) {
    fail('kick 下一 tick 仍未生效');
  } else {
    ok('kick 在下一 tick 生效：Steve 已离线（在线 ' + w.online.length + '）');
  }

  // 3) 被踢者的记忆与对控制台好感
  const cmdMem = steve.memory.filter((m) => m.type === 'command');
  const affConsole = steve.affection[CONSOLE];
  if (!cmdMem.length) {
    fail('被踢的 Steve 没有生成 command 类记忆');
  } else if (!cmdMem.some((m) => m.importance >= 0.9)) {
    fail('被踢的记忆重要性不够高（应 ≥ 0.9）');
  } else {
    ok('Steve 生成了高重要性记忆（' + cmdMem.length + ' 条，最高 ' + Math.max.apply(null, cmdMem.map((m) => m.importance)) + '）');
  }
  if (affConsole !== Agents.NEUTRAL_AFFECTION - 20) {
    fail('对控制台好感不是 −20（实际 ' + affConsole + '）');
  } else {
    ok('Steve 对控制台好感 −20（' + affConsole + '/200）');
  }

  // 4) 旁人议论：Alex 应当可能记住"控制台踢了 Steve"
  const alexWitness = alex.memory.filter((m) => m.type === 'command');
  if (!alexWitness.length) {
    warn('在场角色没有生成见证记忆（有概率，不一定是 bug）');
  } else {
    ok('在场角色生成了见证记忆（Alex ' + alexWitness.length + ' 条）');
  }

  // 5) heal / give 已被移除：控制台不再能凭空改角色状态
  Agents.join(app.roster, steve, t0);          // 先把 Steve 叫回来
  FS.state.world.syncRoster(w, app.roster);
  steve.state.hp = 30;
  const giveBefore = steve.inventory.wood || 0;
  const healOut = FS.cmd.parser.exec('heal ' + AG(0).name, { silent: true });
  const giveOut = FS.cmd.parser.exec('give ' + AG(0).name + ' wood 3', { silent: true });
  if (!(healOut || []).some((e) => e && e.key === 'log.command.unknown')
      || !(giveOut || []).some((e) => e && e.key === 'log.command.unknown')) {
    fail('heal / give 应该已经移除');
  } else if (steve.state.hp !== 30) {
    fail('heal 虽然报错却改了生命（' + steve.state.hp + '）');
  } else if ((steve.inventory.wood || 0) !== giveBefore) {
    fail('give 虽然报错却给了物品');
  } else {
    ok('heal / give 已移除且不会改状态');
  }

  // 5) say / whisper / give / heal 必须已经移除（角色无法回应控制台消息）
  const removed = ['say hello', 'whisper alex psst', 'give steve wood 3', 'heal steve'];
  let stillThere = [];
  for (const c of removed) {
    const produced = FS.cmd.parser.exec(c, { silent: true });
    const cmd = c.split(' ')[0];
    if (!(produced || []).some((e) => e && e.key === 'log.command.unknown')) {
      stillThere.push(cmd);
    }
  }
  if (stillThere.length) fail('已移除的命令仍然可用: ' + stillThere.join(', '));
  else ok('控制台→角色 的消息类命令已全部移除（' + removed.length + ' 个）');

  // 保留下来的命令仍然生效
  FS.cmd.parser.exec('weather fog');
  FS.core.tick.step(false);
  if (w.weather !== 'fog') fail('weather 没有生效（' + w.weather + '）');
  else ok('weather 生效（→ fog）');

  FS.cmd.parser.exec('time set 03:30');
  FS.core.tick.step(false);
  const hhmm = FS.core.clock.hhmm(w.time);
  if (hhmm !== '03:30') fail('time set 没有生效（' + hhmm + '）');
  else ok('time set 生效（→ ' + hhmm + '）');

  FS.cmd.parser.exec('speed 4');
  FS.core.tick.step(false);
  if (w.speedMul !== 4) fail('speed 没有生效（' + w.speedMul + '）');
  else ok('speed 生效（×4）');

  // 9) spawn / kickall
  FS.cmd.parser.exec('kickall');
  FS.core.tick.step(false);
  if (w.online.length !== 0) fail('kickall 没有清空在线（' + w.online.length + '）');
  else ok('kickall 生效（在线 0）');

  FS.cmd.parser.exec('spawn ' + AG(1).name);
  FS.core.tick.step(false);
  if (!alex.state.online) fail('spawn 没有让 alex 上线');
  else ok('spawn 生效（alex 上线）');

  // 10) 控制台好感会影响决策：好感很低时更容易抱怨
  const hateful = app.roster.byId[AG(2).id];
  hateful.affection[CONSOLE] = 5;
  const dec = FS.ai.decision;
  const affLow = dec.affection(hateful, CONSOLE);
  if (affLow !== 5) fail('好感表没有记录对控制台的态度');
  else if (dec.affectionLevel(affLow) !== 'hate') fail('好感分级异常');
  else ok('对控制台的好感会参与分级（5 → hate），可被话题条件使用');

  // 11) 无效参数与不存在的人：不能崩
  const errs = ['kick nobody', 'heal nobody', 'give nobody wood', 'clock', 'say'];
  let crashed = null;
  for (const c of errs) {
    try {
      FS.cmd.parser.exec(c);
      FS.core.tick.step(false);
    } catch (e) {
      crashed = c + ': ' + e.message;
    }
  }
  if (crashed) fail('非法命令导致抛错: ' + crashed);
  else ok('非法参数 / 不存在的玩家不会导致崩溃（' + errs.length + ' 个用例）');

  // 12) reset：世界重置为初始状态
  FS.cmd.parser.exec('reset');
  FS.core.tick.step(false);
  if (app.world.time.day !== 1 || app.world.online.length !== 0) {
    fail('reset 没有把世界恢复到初始状态');
  } else {
    ok('reset 生效（第 1 天、0/32）');
  }
}

/* ==========================================================================
   7.11 死亡 / 复活 / 永久死亡 / 痕迹与传说（v0.3）
   ========================================================================== */

console.log('\n=== 7.11 死亡与永久死亡（v0.3）===');

if (app) {
  const CFG = FS.data.config;
  const Agents = FS.state.agent;
  const prevDebugDeath = CFG.debugDeath;
  CFG.debugDeath = true;                 // 复活倒计时压到几秒

  try {
    // ---- 准备：三人在线 ----
    const t0 = Date.now();
    const w = FS.state.world.create(t0);
    app.world = w;
    app.roster.list.forEach((a) => {
      Agents.leave(app.roster, a);
      a.memory.length = 0;
      a.goals.length = 0;
      a.affection = {};
      a.leaving = null;
      a.dead = false;
      a.respawnTicks = 0;
      a.state.permanentDeath = false;
      a.state.hp = 100;
    });
    FS.state.joins.init(w, t0);
    FS.core.bus.clear();
    FS.render.log.clear();
    FS.core.clock.setNow(t0);
    app.roster.list.forEach((a) => Agents.join(app.roster, a, t0));
    FS.state.world.syncRoster(w, app.roster);

    const victim = app.roster.byId[AG(0).id];
    const killer = app.roster.byId[AG(1).id];

    // ---- 1) 普通死亡：生命归零 → 死亡事件 → 等复活 ----
    const C = CFG;
    const respawnNeed = CFG.respawnTicksDebug[1];
    /* 约定：state/* 的 kill/damage 只"返回"日志，由调用方 push
       （生产路径是 bus → tick）。这里手动 push，模拟调用方。 */
    FS.core.tick.pushLogs(
      FS.state.death.damage(victim, 999, killer.id, w, app.roster, false, 'pvp') || [], false);
    if (!victim.dead) fail('生命归零后没有进入死亡状态');
    else if (victim.state.online !== true) fail('普通死亡不应把角色踢下线（他要复活）');
    else ok('普通死亡：进入死亡状态、仍在名册里等复活');

    const diedLog = FS.render.log.getBuffer().some((e) => e.key === 'log.death.died');
    if (!diedLog) fail('没有产出死亡日志');
    else ok('产出了死亡日志（log.death.died）');

    // 对凶手好感 −30
    const affKiller = FS.ai.decision.affection(victim, killer.id);
    if (affKiller !== Agents.NEUTRAL_AFFECTION - 30) {
      fail('死亡后对凶手好感不是 −30（实际 ' + affKiller + '）');
    } else {
      ok('死亡后对凶手好感 −30（' + affKiller + '/200）');
    }

    // 死亡期间不决策
    const goalsDuringDeath = victim.goals.length;
    for (let i = 0; i < 5; i++) {
      FS.core.clock.setNow(FS.core.clock.now() + CFG.tickMs);
      FS.core.tick.step(true);
    }
    if (victim.goals.length > goalsDuringDeath) fail('死亡期间仍在规划新目标');
    else ok('死亡期间不再决策');

    // 跑够复活倒计时
    let respawned = false;
    for (let i = 0; i < respawnNeed + 10; i++) {
      FS.core.clock.setNow(FS.core.clock.now() + CFG.tickMs);
      FS.core.tick.step(true);
      if (!victim.dead) { respawned = true; break; }
    }
    if (!respawned) fail('倒计时结束后没有复活');
    else if (victim.state.hp < CFG.respawnHp || victim.state.hp > 100) {
      fail('复活后生命异常（' + victim.state.hp + '，期望 ≥' + CFG.respawnHp + '）');
    } else if (!victim.memory.length) fail('复活后记忆被清空了（需求要求保留记忆）');
    else ok('复活成功（hp=' + victim.state.hp + '，记忆保留 ' + victim.memory.length + ' 条）');

    const respawnLog = FS.render.log.getBuffer().some((e) => e.key === 'log.death.respawned');
    if (!respawnLog) fail('没有产出复活日志');
    else ok('产出了复活日志（log.death.respawned）');

    // ---- 2) 永久死亡：从在线移除 + 留下痕迹 ----
    victim.dead = false;                          // 先让他活过来，再走永久死亡
    victim.state.hp = 100;
    FS.state.agent.join(app.roster, victim, FS.core.clock.now());
    FS.state.world.syncRoster(w, app.roster);
    victim.state.permanentDeath = true;
    if (!w.traces) w.traces = [];
    const tracesBefore = w.traces.length;

    FS.core.tick.pushLogs(
      FS.state.death.kill(victim, killer.id, w, app.roster, false, 'pvp', true) || [], false);
    if (victim.state.online) fail('永久死亡后仍在在线列表里');
    else ok('永久死亡：已从在线列表移除');
    if (!victim.state.permanentDeath) fail('永久死亡标记丢了');
    if ((w.traces || []).length !== tracesBefore + 1) {
      fail('永久死亡没有留下痕迹');
    } else {
      const tr = w.traces[w.traces.length - 1];
      if (tr.agentId !== victim.id) fail('痕迹归属错了');
      else if (tr.mentions !== 0 || tr.legend) fail('新痕迹的提及次数/传说标记不对');
      else ok('留下了痕迹（' + tr.agentId + '，死因 ' + tr.cause + '，提及 ' + tr.mentions + '）');
    }

    const permLog = FS.render.log.getBuffer().some((e) => e.key === 'log.death.diedPermanent');
    if (!permLog) fail('没有产出永久死亡日志');
    else ok('产出了永久死亡日志（log.death.diedPermanent）');

    // 永久死亡的人不会再上线
    let cameBack = false;
    for (let i = 0; i < 400; i++) {
      FS.core.clock.setNow(FS.core.clock.now() + CFG.tickMs);
      FS.core.tick.step(true);
      if (victim.state.online) { cameBack = true; break; }
    }
    if (cameBack) fail('永久死亡的角色又上线了');
    else ok('永久死亡的角色不会再上线');

    // ---- 3) 痕迹可被提及 → 够次数变传说 ----
    const trace = w.traces[w.traces.length - 1];
    const need = CFG.legendMentions;
    /* 这条痕迹可能已经在前面的话题里被提过几次，先归零再测，
       否则断言会依赖"前面恰好没提过"这种脆弱前提。 */
    trace.mentions = 0;
    trace.legend = false;
    let upgraded = null;
    for (let i = 0; i < need; i++) {
      const up = FS.state.death.mention(trace, w, app.roster, false);
      if (up) upgraded = up;
      /* 约定：mention 只返回，日志挂在痕迹上由调用方 push */
      FS.core.tick.pushLogs(FS.state.death.takePendingLogs(trace), false);
    }
    if (trace.mentions !== need) fail('提及次数没有累加（' + trace.mentions + '）');
    else if (!trace.legend) fail('提及 ' + need + ' 次后没有升级为传说');
    else if (!upgraded) fail('升级为传说时没有产出事件');
    else ok('痕迹被提及 ' + need + ' 次后升级为传说');

    const legendLog = FS.render.log.getBuffer().some((e) => e.key === 'log.world.legend');
    if (!legendLog) fail('没有产出"传说"日志');
    else ok('产出了传说日志（log.world.legend）');

    // ---- 4) 提到死者的对话：{dead} 必须被替换 ----
    const cand = FS.state.death.randomTrace(w);
    if (!cand) {
      fail('痕迹候选为空（对话拿不到死者）');
    } else {
      const dec = FS.ai.decision;
      const spk = app.roster.byId[AG(1).id];
      const listener = app.roster.byId[AG(2).id];
      const inst = FS.ai.dialogue.start(spk, w, app.roster, true, null, {
        topicId: 'trace',
        vars: {},
      });
      if (!inst) {
        warn('trace 话题没有成功开启（可能对方正忙），跳过文本检查');
      } else {
        const key0 = inst.topic.messages[0].lines;
        const base = String(key0).replace(/\.\d+$/, '');
        const idx = FS.core.i18n.poolSize(base, 'en') ? 0 : -1;
        const textEn = idx >= 0
          ? FS.core.i18n.t(base + '.0', FS.core.i18n.localizeVars(inst.vars))
          : '';
        FS.core.i18n.setLang('zh');
        const textZh = idx >= 0
          ? FS.core.i18n.t(base + '.0', FS.core.i18n.localizeVars(inst.vars))
          : '';
        FS.core.i18n.setLang('en');
        if (/\{[a-zA-Z]\w*\}/.test(textEn) || /\{[a-zA-Z]\w*\}/.test(textZh)) {
          fail('提到死者的台词残留占位符: en=' + textEn + ' zh=' + textZh);
        } else if (!inst.vars.dead) {
          fail('{dead} 没有被赋值（台词会显示成占位符）');
        } else {
          ok('提到死者的台词正常（' + textZh.slice(0, 24) + '…）');
        }
        FS.ai.dialogue.endByAgent(w, app.roster, spk, true);
      }
      if (listener) { /* 保持引用 */ }
      if (dec) { /* 保持引用 */ }
    }

    // ---- 5) kill 命令走真实死亡流程 ----
    const second = app.roster.byId[AG(2).id];
    second.state.permanentDeath = false;
    second.state.hp = 100;
    second.dead = false;
    Agents.join(app.roster, second, FS.core.clock.now());
    FS.state.world.syncRoster(w, app.roster);
    FS.cmd.parser.exec('kill ' + AG(2).name);
    FS.core.tick.step(false);
    if (!second.dead) fail('kill 命令没有触发真实死亡');
    else ok('kill 命令触发真实死亡流程（不再是"打倒就站起来"）');

    // ---- 6) permadeath 命令 ----
    FS.cmd.parser.exec('permadeath ' + AG(1).name + ' on');
    FS.core.tick.step(false);
    if (!app.roster.byId[AG(1).id].state.permanentDeath) fail('permadeath on 没有生效');
    else ok('permadeath on 生效');
    FS.cmd.parser.exec('permadeath ' + AG(1).name + ' off');
    FS.core.tick.step(false);
    if (app.roster.byId[AG(1).id].state.permanentDeath) fail('permadeath off 没有生效');
    else ok('permadeath off 生效');

    // ---- 7) kill 必须只产出一次死亡日志（曾经重复一次） ----
    const dup = app.roster.byId[AG(1).id];
    dup.state.permanentDeath = false;
    dup.dead = false;
    dup.respawnTicks = 0;
    dup.state.hp = 100;
    Agents.join(app.roster, dup, FS.core.clock.now());
    FS.state.world.syncRoster(w, app.roster);
    FS.render.log.clear();

    FS.cmd.parser.exec('kill ' + AG(1).name);
    let killCalls = 0;
    const origKill = FS.state.death.kill;
    FS.state.death.kill = function () { killCalls++; return origKill.apply(this, arguments); };
    FS.core.tick.step(false);
    FS.state.death.kill = origKill;

    const killBuf = FS.render.log.getBuffer();
    const diedCount = killBuf.filter((e) => e.key === 'log.death.died').length;
    const witnessCount = killBuf.filter((e) => e.key === 'log.world.deathNoticed').length;
    const queueLeft = FS.core.bus.size();
    if (killCalls !== 1) fail('一次 kill 结算了 ' + killCalls + ' 次（应为 1）');
    else if (diedCount !== 1) fail('一次 kill 产出了 ' + diedCount + ' 条死亡日志（应为 1）');
    else ok('一次 kill 只结算 1 次、只产出 1 条死亡日志');
    if (witnessCount > 1) fail('目击日志重复 ' + witnessCount + ' 次');
    else ok('目击日志没有重复（' + witnessCount + ' 条）');
    if (queueLeft) fail('事件队列残留 ' + queueLeft + ' 条（命令可能被重复处理）');
    else ok('事件队列已清空（命令没有被重复处理）');

    // 再跑几帧，确认不会"补打"一次
    for (let i = 0; i < 4; i++) {
      FS.core.clock.setNow(FS.core.clock.now() + CFG.tickMs);
      FS.core.tick.step(false);
    }
    const diedAfter = FS.render.log.getBuffer()
      .filter((e) => e.key === 'log.death.died').length;
    if (diedAfter !== 1) fail('后续帧又补打了死亡日志（共 ' + diedAfter + ' 条）');
    else ok('后续帧没有重复死亡日志');
  } catch (e) {
    fail('死亡系统测试抛错: ' + e.stack.split('\n').slice(0, 4).join('\n       '));
  } finally {
    CFG.debugDeath = prevDebugDeath;
  }
}

/* ==========================================================================
   7.12 世界快照导出 / 导入（v0.3）
   刷新 = 新世界；想让世界延续必须靠"存文件 + 读回来"。
   ========================================================================== */

console.log('\n=== 7.12 世界快照（v0.3）===');

if (app) {
  const CFG = FS.data.config;
  const Agents = FS.state.agent;
  const Snap = FS.persist.snapshot;

  try {
    // ---- 准备一个有内容的世界：三人在线、有记忆、有痕迹、有目标 ----
    const t0 = Date.now();
    const w = FS.state.world.create(t0);
    app.world = w;
    app.roster.list.forEach((a) => {
      Agents.leave(app.roster, a);
      a.memory.length = 0;
      a.goals.length = 0;
      a.affection = {};
      a.dead = false;
      a.leaving = null;
      a.state.permanentDeath = false;
      a.state.hp = 100;
    });
    FS.state.joins.init(w, t0);
    /* 关键：join 记的 onlineSinceMs 取的是**真实时间**，所以先给真实钟打桩，
       再让"真实时间"和游戏时间一起前进 3 分钟，在线时长才是真的 3 分钟。
       （只推虚拟钟的话，在线时长在真实时间里只有几毫秒） */
    const realNowSnap = Date.now;
    const baseReal = Date.now();
    let simNow = baseReal;
    Date.now = () => simNow;
    FS.core.clock.setNow(baseReal);
    app.roster.list.forEach((a) => Agents.join(app.roster, a, baseReal));
    FS.state.world.syncRoster(w, app.roster);
    const sinceAfterJoin = app.roster.byId[AG(0).id].onlineSinceMs;

    /* 跑 3 分钟，让世界有真实的记忆/关系/痕迹 */
    try {
      for (let i = 0; i < 3 * 60 * 4; i++) {
        simNow = baseReal + (i + 1) * CFG.tickMs;
        FS.core.clock.setNow(simNow);
        FS.core.tick.step(true);
      }
    } finally {
      /* 先别还原 Date.now：下面导出快照时还要用同一个时间基准 */
    }
    /* 造一条痕迹，验证它也能被带走 */
    const doomed = app.roster.byId[AG(2).id];
    doomed.state.permanentDeath = true;
    FS.state.death.kill(doomed, null, w, app.roster, true, 'env', true);

    const snapText = Snap.toJSON(w, app.roster);
    const before = {
      day: w.time.day,
      hour: w.time.hour,
      tick: w.tick,
      weather: w.weather,
      online: w.online.slice().sort(),
      traces: (w.traces || []).length,
      memSteve: app.roster.byId[AG(0).id].memory.length,
      affSteve: JSON.stringify(app.roster.byId[AG(0).id].affection),
      doomedOnline: doomed.state.online,
      doomedPerm: doomed.state.permanentDeath,
      play: w.realPlayMs,
    };
    if (!snapText.length) fail('导出的快照是空的');
    else ok('导出快照成功（' + Math.round(snapText.length / 1024) + ' KB）');

    // ---- 校验：结构必须对 ----
    const bad = [
      { t: 'not json', v: '{oops' },
      { t: 'empty', v: '{}' },
      { t: 'wrong format', v: JSON.stringify({ format: 'other', version: 3, world: {}, agents: [] }) },
      { t: 'future version', v: JSON.stringify({ format: 'fake-server-snapshot', version: 999, world: {}, agents: [] }) },
      { t: 'missing agents', v: JSON.stringify({ format: 'fake-server-snapshot', version: 3, world: {} }) },
    ];
    let badOk = true;
    for (const c of bad) {
      const vr = Snap.validate(c.v);
      if (vr.ok) { badOk = false; fail('无效快照却被接受: ' + c.t); }
    }
    if (badOk) ok('无效快照全部被拒绝（' + bad.length + ' 个用例）');

    // ---- 导入：世界必须还原 ----
    /* 先把世界搅乱：新世界 + 时间推进，模拟"刷新之后" */
    app.world = FS.state.world.create(Date.now() + 3600 * 1000);
    FS.state.joins.init(app.world, Date.now());
    app.roster.list.forEach((a) => Agents.leave(app.roster, a));
    FS.state.world.syncRoster(app.world, app.roster);
    if (app.world.tick !== 0) fail('prep: 新世界 tick 不为 0');

    const res = Snap.importText(snapText, app);
    if (!res.ok) {
      fail('导入快照失败: ' + res.error);
    } else {
      const w2 = app.world;
      const after = {
        day: w2.time.day,
        hour: w2.time.hour,
        weather: w2.weather,
        online: w2.online.slice().sort(),
        traces: (w2.traces || []).length,
        memSteve: app.roster.byId[AG(0).id].memory.length,
        affSteve: JSON.stringify(app.roster.byId[AG(0).id].affection),
        doomedOnline: app.roster.byId[AG(2).id].state.online,
        doomedPerm: app.roster.byId[AG(2).id].state.permanentDeath,
      };
      if (after.day !== before.day || Math.abs(after.hour - before.hour) > 1) {
        fail('导入后游戏时间不对：day ' + after.day + ' hour ' + after.hour
          + '（期望 day ' + before.day + ' hour ' + before.hour + '）');
      } else {
        ok('导入后游戏时间还原（第 ' + after.day + ' 天 ' + after.hour + ' 时）');
      }
      if (after.weather !== before.weather) fail('导入后天气不对');
      else ok('导入后天气还原（' + after.weather + '）');
      if (after.online.join(',') !== before.online.join(',')) {
        fail('导入后在线名单不对：' + after.online.join(',') + ' vs ' + before.online.join(','));
      } else {
        ok('导入后在线名单还原（' + after.online.length + ' 人）');
      }
      if (after.memSteve !== before.memSteve) {
        fail('导入后记忆条数不对：' + after.memSteve + ' vs ' + before.memSteve);
      } else {
        ok('导入后记忆还原（Steve ' + after.memSteve + ' 条）');
      }
      if (after.affSteve !== before.affSteve) fail('导入后好感不对');
      else ok('导入后好感还原');
      if (after.traces !== before.traces) fail('导入后痕迹条数不对');
      else ok('导入后痕迹还原（' + after.traces + ' 条）');
      if (after.doomedOnline !== false || after.doomedPerm !== true) {
        fail('导入后永久死亡状态没有还原');
      } else {
        ok('导入后永久死亡状态还原（已离线且不会回来）');
      }
      // 在线时长应当保留（不是从 0 重新算）
      const up = Agents.onlineMs(app.roster.byId[AG(0).id], Date.now());
      if (up < 60 * 1000) fail('导入后在线时长被重置了（' + Math.round(up / 1000) + 's）');
      else ok('导入后在线时长保留（' + Math.round(up / 1000) + 's）');

      // 导入后世界能继续跑。注意：主循环要 running=true（start），
      // 而且要把真实钟接着上面推进（不能往回跳到真实时间）。
      const tickBefore = w2.tick;
      let contNow = simNow;
      Date.now = () => contNow;
      try {
        FS.core.tick.start();
        for (let i = 0; i < 8; i++) {
          contNow += CFG.tickMs;
          FS.core.tick.frame();
        }
      } finally {
        Date.now = realNowSnap;
        FS.core.clock.useRealTime();
      }
      if (w2.tick <= tickBefore) fail('导入后世界没有继续运行');
      else ok('导入后世界继续运行（+' + (w2.tick - tickBefore) + ' tick）');
    }

    // ---- 导出的时间基准是"相对偏移"：离线很久后导入不应跳到未来 ----
    const rawObj = JSON.parse(snapText);
    if (typeof rawObj.world.epochOffsetMs !== 'number') {
      fail('快照没有用相对偏移保存纪元（离线后导入会跳到未来）');
    } else {
      ok('快照用相对偏移保存纪元（epochOffsetMs=' + Math.round(rawObj.world.epochOffsetMs / 1000) + 's）');
    }

    // ---- 文件名校验 ----
    const fn = Snap.fileName(w);
    if (!/^AURORA-01-snapshot-\d{8}-\d{4}\.json$/.test(fn)) fail('快照文件名不合预期: ' + fn);
    else ok('快照文件名规范（' + fn + '）');
  } catch (e) {
    fail('快照测试抛错: ' + e.stack.split('\n').slice(0, 4).join('\n       '));
  }
}

/* ==========================================================================
   7.14 对话逻辑梳理（v0.4）—— 用户反馈的核心问题
   反馈原话："本来是 Alex 和 Steve 在对话，Kai 突然加入，
   结果他们两个瞬间完成了交易，然后 Alex 还回了一句消息，这明显不该是这样"
   ========================================================================== */

console.log('\n=== 7.14 对话节奏与 consoleTalk（v0.4）===');

if (app) {
  const CFG = FS.data.config;
  const Agents = FS.state.agent;
  /* 这一段要构造"立刻就能对话"的场景，所以把
     "加入后响应延迟"与"落地期"都关掉（各自的小节里再单独打开测）。 */
  const prevNoWarmup = CFG.debugNoWarmup;
  const prevDebugSettle = CFG.debugSettle;
  CFG.debugNoWarmup = true;
  CFG.debugSettle = false;

  try {
    // ---- 1) 新人落地期：刚上线的角色不发起交易 ----
    {
      CFG.debugSettle = true;                 // 落地期压到游戏内 5 分钟
      const t0 = Date.now();
      const w = FS.state.world.create(t0);
      app.world = w;
      app.roster.list.forEach((a) => {
        Agents.leave(app.roster, a);
        a.memory.length = 0;
        a.goals.length = 0;
        a.dead = false;
        a.state.permanentDeath = false;
        a.state.hp = 100;
      });
      FS.state.joins.init(w, t0);
      FS.core.clock.setNow(t0);
      const fresh = app.roster.list[0];
      const veteran = app.roster.list[1];
      Agents.join(app.roster, veteran, t0);
      /* 老兵先"玩"了一段时间：把上线时间拨回去 */
      veteran.onlineSinceGameMinute = -999;
      Agents.join(app.roster, fresh, t0);
      FS.state.world.syncRoster(w, app.roster);

      if (!FS.ai.decision.settlingIn(fresh, w)) {
        fail('刚上线的角色没有被判定为"落地期"');
      } else if (FS.ai.decision.settlingIn(veteran, w)) {
        fail('老玩家被误判为"落地期"');
      } else if (!FS.ai.decision.isSettledOut(fresh, 'trade', w)) {
        fail('落地期没有拦住 trade');
      } else if (FS.ai.decision.isSettledOut(fresh, 'move', w)) {
        fail('落地期不该拦住 move（他应该还在走动观察）');
      } else {
        ok('落地期：新人不能发起交易，但仍可移动/观察');
      }
      CFG.debugSettle = false;
    }

    // ---- 2) 同一次对话里 requested != offered（曾经出现"想收药水，我这儿有药水"） ----
    {
      let clash = 0;
      let sample = '';
      for (let i = 0; i < 300; i++) {
        const v = FS.ai.dialogue.rollVars(FS.data.topicsById['trade'],
          app.roster.list[0], app.roster.list[1], app.world);
        if (v.item && v.item2 && v.item.id === v.item2.id) {
          clash++;
          if (!sample) sample = v.item.id;
        }
      }
      if (clash) fail('交易变量出现重复物品 ' + clash + '/300 次（如 ' + sample + '）');
      else ok('交易变量不会重复（requested != offered，300 次抽样）');
    }

    // ---- 3) 一场话题结束后有冷却：不能马上又开一场 ----
    {
      const D = FS.ai.dialogue;
      const w = app.world;
      const a1 = app.roster.list[0];
      const a2 = app.roster.list[1];
      a1.topicCooldownUntilTick = 0;
      a2.topicCooldownUntilTick = 0;
      D.reset();
      const inst = D.start(a1, w, app.roster, true, null, { topicId: 'greet' });
      if (!inst) {
        warn('无法开启 greet 做冷却测试，跳过');
      } else {
        inst.aborted = false;
        D.end(inst, w, app.roster, true);
        if (!D.topicCooldown(a1, w)) {
          fail('话题正常结束后没有进入冷却（他会立刻再开一场）');
        } else {
          const cd = a1.topicCooldownUntilTick - w.tick;
          ok('话题结束后进入冷却（还有 ' + cd + ' tick）');
        }
      }
      // 被打断的话题不该触发冷却
      a1.topicCooldownUntilTick = 0;
      const inst2 = D.start(a1, w, app.roster, true, null, { topicId: 'greet' });
      if (inst2) {
        D.endByAgent(w, app.roster, a1, true);
        if (D.topicCooldown(a1, w)) {
          warn('被打断的话题也计入了冷却（下线的人会让留下的人短暂失语）');
        } else {
          ok('被打断的话题不计入冷却');
        }
      }
      D.reset();
    }

    // ---- 4) 全局/单人并发上限 ----
    {
      const D = FS.ai.dialogue;
      D.reset();
      const a1 = app.roster.list[0];
      const a2 = app.roster.list[1];
      a1.topicCooldownUntilTick = 0;
      a2.topicCooldownUntilTick = 0;
      const i1 = D.start(a1, app.world, app.roster, true);
      const i2 = D.start(a2, app.world, app.roster, true);
      if (i1 && i2) fail('同一时刻每个角色只应在一个话题里，却成功开了两场');
      else if (!i1) warn('第一个话题没开起来，无法验证并发上限');
      else ok('并发限制生效：第二个人无法同时开启话题（每人最多 '
        + (CFG.maxTopicsPerAgent || 1) + ' 场）');
      D.reset();
    }

    // ---- 5) "上次那事儿"必须有真凭据 ----
    {
      const D = FS.ai.dialogue;
      const a1 = app.roster.list[0];
      const a2 = app.roster.list[1];
      const victim = a2.id;
      a1.memory = a1.memory.filter((m) => !(m.actors || []).includes(victim));
      if (D.hasBadBlood(a1, a2)) {
        fail('没有负面记忆却判定为"有过节"');
      } else {
        FS.state.memory.add(a1, {
          type: 'fight', actors: [victim], key: 'mem.hurt',
          vars: { place: { tx: 'place', id: 'camp' } },
          affect: -12, importance: 0.7,
        }, app.world);
        if (!D.hasBadBlood(a1, a2)) fail('有负面记忆却判定为"没过节"');
        else ok('翻旧账的条件有真凭据才成立（无记忆时不说"上次那事儿"）');
      }
    }

    // ---- 6) consoleTalk：控制台命令 → 记忆 → 说出口 ----
    {
      const D = FS.ai.dialogue;
      const w = app.world;
      const speaker = app.roster.list[0];
      const other = app.roster.list[1];
      speaker.memory = speaker.memory.filter((m) => m.type !== 'command');

      if (D.consoleMemoryOf(speaker)) {
        fail('没有命令记忆却说得出控制台的事');
      } else if (D.triggerOk(FS.data.topicsById['consoleTalk'], speaker, w, app.roster)) {
        fail('没有命令记忆却满足了 consoleTalk 的触发条件');
      } else {
        ok('没有命令记忆时，角色不会议论控制台');
      }

      /* 真的敲一条命令，让记忆产生 */
      Agents.join(app.roster, other, Date.now());
      FS.state.world.syncRoster(w, app.roster);
      FS.render.log.clear();
      FS.cmd.parser.exec('kick ' + other.name);
      FS.core.tick.step(false);

      const cm = D.consoleMemoryOf(other);
      if (!cm) {
        fail('被踢的角色没有留下控制台记忆（consoleTalk 永远触发不了）');
      } else if (cm.cmd !== 'kick') {
        fail('控制台记忆里的命令不对：' + cm.cmd);
      } else if (!D.triggerOk(FS.data.topicsById['consoleTalk'], other, w, app.roster)) {
        fail('有命令记忆却不满足 consoleTalk 触发条件');
      } else {
        /* 台词里的 {cmd} 必须被替换掉 */
        D.reset();
        other.topicCooldownUntilTick = 0;
        const inst = D.start(other, w, app.roster, true, null, { topicId: 'consoleTalk' });
        if (!inst) {
          warn('consoleTalk 没开起来，跳过文本检查');
        } else {
          const key0 = inst.topic.messages[0].lines;
          const base = String(key0).replace(/\.\d+$/, '');
          /* 注意顺序：先切语言，再 localizeVars —— 反过来的话拿到的是上一个语言的文本 */
          FS.core.i18n.setLang('zh');
          const zh = FS.core.i18n.t(base + '.0', FS.core.i18n.localizeVars(inst.vars));
          FS.core.i18n.setLang('en');
          if (/\{[a-zA-Z]\w*\}/.test(zh)) {
            fail('consoleTalk 台词残留占位符: ' + zh);
          } else if (zh.indexOf('踢') === -1) {
            fail('consoleTalk 没有把 {cmd} 填成实际命令: ' + zh);
          } else {
            ok('consoleTalk 闭环：命令 → 记忆 → 说出口（' + zh + '）');
          }
          D.endByAgent(w, app.roster, other, true);
        }
      }
      D.reset();
    }
  } catch (e) {
    fail('对话节奏测试抛错: ' + e.stack.split('\n').slice(0, 4).join('\n       '));
  } finally {
    CFG.debugNoWarmup = prevNoWarmup;
    CFG.debugSettle = prevDebugSettle;
  }
}

/* ==========================================================================
   7.15 consoleTalk 在自然运行里真的会出现（不是只有强制指定才说得出）
   ========================================================================== */

console.log('\n=== 7.15 consoleTalk 自然触发 ===');

if (app) {
  const CFG = FS.data.config;
  const Agents = FS.state.agent;
  /* 这一段测的是"他自己会不会提起控制台干的事"，
     所以关掉加入延迟（否则 40 分钟里大半时间他还在热身）。 */
  const prevNoWarmup2 = CFG.debugNoWarmup;
  CFG.debugNoWarmup = true;

  try {
    const t0 = Date.now();
    const w = FS.state.world.create(t0);
    app.world = w;
    app.roster.list.forEach((a) => {
      Agents.leave(app.roster, a);
      a.memory.length = 0;
      a.goals.length = 0;
      a.affection = {};
      a.dead = false;
      a.leaving = null;
      a.topicCooldownUntilTick = 0;
      a.state.permanentDeath = false;
      a.state.hp = 100;
    });
    FS.state.joins.init(w, t0);
    FS.core.bus.clear();
    FS.ai.dialogue.reset();
    FS.render.log.clear();

    let now = t0;
    const realNow = Date.now;
    Date.now = () => now;
    try {
      FS.core.clock.setNow(now);
      /* 三人上线，先玩一会儿让世界有内容 */
      app.roster.list.forEach((a) => Agents.join(app.roster, a, now));
      FS.state.world.syncRoster(w, app.roster);
      for (let i = 0; i < 400; i++) {
        now += CFG.tickMs;
        FS.core.clock.setNow(now);
        FS.core.tick.step(true);
      }

      /* 踢一个人：他留下命令记忆 */
      const victim = Agents.online(app.roster)[0];
      FS.cmd.parser.exec('kick ' + victim.name);
      FS.core.tick.step(true);
      const cm = FS.ai.dialogue.consoleMemoryOf(victim);
      if (!cm) {
        fail('被踢的角色没有命令记忆，consoleTalk 无从触发');
      } else {
        ok('被踢的角色记住了控制台命令（cmd=' + cm.cmd + '）');
      }

      /* 让他回来，然后自然跑一段，看他自己会不会提这件事 */
      victim.topicCooldownUntilTick = 0;
      Agents.join(app.roster, victim, now);
      victim.onlineSinceGameMinute = -999;      // 跳过落地期
      FS.state.world.syncRoster(w, app.roster);
      FS.render.log.clear();

      /* 跑 40 分钟游戏时间 */
      for (let i = 0; i < 2400; i++) {
        now += CFG.tickMs;
        FS.core.clock.setNow(now);
        FS.core.tick.step(true);
      }

      const buf = FS.render.log.getBuffer();
      const ct = buf.filter((e) => /^topic\.consoleTalk\./.test(e.key || ''));
      if (!ct.length) {
        warn('40 分钟游戏时间内没有自然出现 consoleTalk（概率问题，触发条件已单独验证）');
      } else {
        /* 台词里的 {cmd} 必须被替换成真实命令 */
        const bad = ct.filter((e) => {
          const txt = FS.core.i18n.t(e.key, FS.core.i18n.localizeVars(e.vars || {}));
          return /\{[a-zA-Z]\w*\}/.test(txt);
        });
        if (bad.length) fail('consoleTalk 自然台词里有未替换的占位符');
        else ok('consoleTalk 自然出现 ' + ct.length + ' 句，占位符都已替换');
      }
    } finally {
      Date.now = realNow;
      FS.core.clock.useRealTime();
    }
  } catch (e) {
    fail('consoleTalk 自然触发测试抛错: ' + e.stack.split('\n').slice(0, 4).join('\n       '));
  } finally {
    CFG.debugNoWarmup = prevNoWarmup2;
  }
}

/* ==========================================================================
   7.16 v1.0 特性：32 人名册 / 底层噪音 / 加入响应延迟 / 按理由回来
   ========================================================================== */

console.log('\n=== 7.16 v1.0（32 人 · 噪音 · 节奏）===');

if (app) {
  const CFG = FS.data.config;
  const Agents = FS.state.agent;

  try {
    /* ---- 1) 名册：32 人、昵称像真人、id 唯一 ---- */
    {
      const list = app.roster.list;
      if (list.length !== 32) fail('名册应为 32 人，实际 ' + list.length);
      else ok('名册 32 人');

      const ids = new Set();
      let dupId = 0, badName = 0, tooLong = 0;
      for (const a of list) {
        if (ids.has(a.id)) dupId++;
        ids.add(a.id);
        if (!/^[a-z0-9_]+$/.test(a.id)) badName++;
        if (a.name.length < 3 || a.name.length > 16) {
          tooLong++;
          if (tooLong <= 3) console.log('       昵称长度异常: ' + a.name);
        }
      }
      if (dupId) fail('有 ' + dupId + ' 个重复的角色 id');
      else if (badName) fail('有 ' + badName + ' 个 id 不是 [a-z0-9_] 形式');
      else if (tooLong) fail('有 ' + tooLong + ' 个昵称长度不在 3~16');
      else ok('32 个 id 全唯一且规范，昵称长度都在 3~16');

      /* 昵称要有"真人感"：不能全是同一个模子 */
      const styles = {
        withDigit: list.filter((a) => /[0-9]/.test(a.name)).length,
        withSep: list.filter((a) => /[_.]/.test(a.name)).length,
        plainWord: list.filter((a) => /^[a-z]+$/.test(a.name)).length,
        mixedCase: list.filter((a) => /[A-Z]/.test(a.name) && /[a-z]/.test(a.name)).length,
      };
      /* 至少要有数字型、纯词型、以及零星的大小写混合，否则一眼看出是生成的 */
      if (!styles.withDigit || !styles.plainWord) {
        fail('昵称风格太单一（带数字 ' + styles.withDigit + ' / 纯词 ' + styles.plainWord + '）');
      } else {
        ok('昵称风格分布自然（带数字 ' + styles.withDigit + ' / 纯词 '
          + styles.plainWord + ' / 下划线 ' + styles.withSep + ' / 大小写混合 '
          + styles.mixedCase + '）');
      }

      /* 性格必须有区分度，不能所有人都是 0.5 */
      const chatty = list.map((a) => a.personality.chatty);
      const spread = Math.max(...chatty) - Math.min(...chatty);
      if (spread < 0.4) fail('性格区分度不足（chatty 极差只有 ' + Math.round(spread * 100) / 100 + '）');
      else ok('性格有区分度（chatty 极差 ' + Math.round(spread * 100) / 100 + '）');
    }

    /* ---- 2) 底层噪音：世界里必须有噪音行 ---- */
    {
      const t1 = Date.now();
      const w = FS.state.world.create(t1);
      app.world = w;
      app.roster.list.forEach((a) => {
        Agents.leave(app.roster, a);
        a.leaving = null;
        a.dead = false;
        a.state.permanentDeath = false;
      });
      FS.state.joins.init(w, t1);
      FS.core.bus.clear();
      FS.ai.dialogue.reset();
      FS.render.log.clear();

      let now = t1;
      const realNow = Date.now;
      Date.now = () => now;
      try {
        FS.core.clock.setNow(now);
        /* 12 个人上线（关掉响应延迟，避免他们聊天把"安静"条件破坏掉） */
        const prevNW = CFG.debugNoWarmup;
        CFG.debugNoWarmup = true;
        for (let i = 0; i < 12; i++) {
          Agents.join(app.roster, app.roster.list[i], now);
          app.roster.list[i].onlineSinceGameMinute = -9999;
        }
        FS.state.world.syncRoster(w, app.roster);
        /* 跑 30 分钟真实时间 */
        for (let i = 0; i < 30 * 60 * 4; i++) {
          now += CFG.tickMs;
          FS.core.clock.setNow(now);
          FS.core.tick.step(true);
        }
        CFG.debugNoWarmup = prevNW;
      } finally {
        Date.now = realNow;
        FS.core.clock.useRealTime();
      }

      const buf = FS.render.log.getBuffer();
      const noiseLines = buf.filter((e) => /^log\.noise\./.test(e.key || ''));
      const actionLines = buf.filter((e) => /^log\.action\./.test(e.key || ''));

      if (!noiseLines.length) {
        fail('30 分钟内没有任何环境噪音（世界静默时控制台会一片空白）');
      } else {
        ok('产生了 ' + noiseLines.length + ' 条环境噪音（'
          + new Set(noiseLines.map((e) => e.key)).size + ' 种）');
      }
      if (!actionLines.length) {
        fail('没有任何"谁获得了什么"的动作日志');
      } else {
        ok('产生了 ' + actionLines.length + ' 条玩家动作日志');
      }

      /* 噪音也要"中英都能渲染"，不能残留占位符 */
      let badNoise = 0;
      for (const lang of ['en', 'zh']) {
        FS.core.i18n.setLang(lang);
        for (const e of noiseLines.concat(actionLines)) {
          const txt = FS.core.i18n.t(e.key, FS.core.i18n.localizeVars(e.vars || {}));
          if (/\{[a-zA-Z]\w*\}/.test(txt) || txt.indexOf('\u2039') !== -1) {
            badNoise++;
            if (badNoise === 1) console.log('       噪音文本异常: ' + txt);
          }
        }
      }
      FS.core.i18n.setLang('en');
      if (badNoise) fail('有 ' + badNoise + ' 条噪音/动作日志没有正确渲染');
      else ok('噪音与动作日志中英渲染都正常（无残留占位符）');
    }

    /* ---- 3) 加入后 20~40 秒内不搭话 ---- */
    {
      const prevNW2 = CFG.debugNoWarmup;
      CFG.debugNoWarmup = false;
      const t2 = Date.now();
      const w = FS.state.world.create(t2);
      app.world = w;
      Agents.leave(app.roster, AG(0));
      FS.core.clock.setNow(t2);
      Agents.join(app.roster, AG(0), t2);
      FS.state.world.syncRoster(w, app.roster);

      const delayMs = AG(0).respondAfterGameMinute - w.time.gameMinutes;
      const delayRealSec = Math.round((delayMs / 60) * (CFG.realMsPerGameHour / 1000));
      if (!FS.ai.decision.stillWarmingUp(AG(0), w)) {
        fail('刚加入的角色没有进入"响应延迟"');
      } else if (delayRealSec < 18 || delayRealSec > 42) {
        fail('响应延迟不是 20~40 秒（实测 ' + delayRealSec + ' 秒）');
      } else {
        ok('刚加入的角色要等 ' + delayRealSec + ' 秒才开始搭话（要求 20~40 秒）');
      }
      /* 延迟过后必须能搭话 */
      w.time.gameMinutes += 60;
      if (FS.ai.decision.stillWarmingUp(AG(0), w)) {
        fail('响应延迟过后仍然不能搭话（会永远沉默）');
      } else {
        ok('响应延迟过后就能正常搭话');
      }
      CFG.debugNoWarmup = prevNW2;
    }

    /* ---- 4) 按离开理由决定回来时长（吃饭 10 分钟 / 睡觉 30 分钟） ---- */
    {
      const L = FS.state.leave;
      const realMin = (gap) => Math.round((gap / 60000) * 10) / 10;
      const eat = L.rejoinGapFor('eat', 'quit');
      const sleep = L.rejoinGapFor('sleep', 'quit');
      const work = L.rejoinGapFor('work', 'quit');
      const errand = L.rejoinGapFor('errand', 'quit');
      const timeout = L.rejoinGapFor('timeout', 'timeout');

      const eatMin = realMin(eat), sleepMin = realMin(sleep);
      if (eatMin < 8 || eatMin > 13) fail('"去吃饭"的回来时长不是 10 分钟左右（' + eatMin + ' 分钟）');
      else if (sleepMin < 26 || sleepMin > 35) fail('"去睡觉"的回来时长不是 30 分钟左右（' + sleepMin + ' 分钟）');
      else if (sleep <= eat) fail('睡觉回来的间隔应该比吃饭长');
      else {
        ok('回来时长按理由区分（吃饭 ' + eatMin + ' 分 / 睡觉 ' + sleepMin
          + ' 分 / 上班 ' + realMin(work) + ' 分 / 有事 ' + realMin(errand)
          + ' 分 / 掉线 ' + realMin(timeout) + ' 分）');
      }
      /* 多次抽样都必须落在这个量级（不能偶尔抽到兜底区间） */
      let outOfRange = 0;
      for (let i = 0; i < 200; i++) {
        const m = realMin(L.rejoinGapFor('eat', 'quit'));
        if (m < 8 || m > 13) outOfRange++;
      }
      if (outOfRange) fail('"吃饭"的回来时长有 ' + outOfRange + '/200 次跑出了 8~13 分钟');
      else ok('200 次抽样里"吃饭"始终在 8~13 分钟');
    }

    /* ---- 5) 调试面板默认隐藏 ---- */
    {
      const PREF = FS.persist.store;
      const mainEl = doc.getElementById('main');

      /* HTML 里就带着 panel-collapsed，避免 JS 加载前闪出面板 */
      const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
      if (!/id="main"[^>]*class="[^"]*panel-collapsed/.test(html)) {
        fail('index.html 里 #main 没有默认带 panel-collapsed（首屏会闪出面板）');
      } else {
        ok('index.html 首屏就是收起状态（不会闪出面板）');
      }

      if (!PREF) {
        warn('拿不到 persist.store，跳过默认收起检查');
      } else {
        /* 默认值必须是 true（收起）。用 undefined 当默认，
           会把"从来没设置过"当成"展开"。 */
        const def = PREF.getPref('panelCollapsed', true);
        if (def !== true) fail('panelCollapsed 的默认值不是 true（实际 ' + def + '）');
        else ok('panelCollapsed 默认值为 true（首次打开是收起的）');

        /* 关掉开关 → DOM 上必须真的有 panel-collapsed 类 */
        FS.render.topbar.setPanelCollapsed(true);
        if (!mainEl.classList.contains('panel-collapsed')) {
          fail('收起后 #main 上没有 panel-collapsed 类');
        } else {
          ok('收起状态正确反映到 DOM');
        }
        FS.render.topbar.setPanelCollapsed(false);
        if (mainEl.classList.contains('panel-collapsed')) {
          fail('展开后 panel-collapsed 类没有被移除');
        } else {
          ok('展开状态正确反映到 DOM');
        }

        /* 开关必须写进 persist.store（不能另写一份 localStorage —— 那会有第二份真相） */
        FS.render.topbar.setPanelCollapsed(true);
        if (PREF.getPref('panelCollapsed', null) !== true) {
          fail('收起状态没有写进 persist.store');
        } else {
          ok('开关状态写进了 persist.store（单一真相）');
        }
        /* 而且不该留下旧版那个孤儿键 */
        let orphan = null;
        try { orphan = window.localStorage.getItem('fs.panelCollapsed'); } catch (e) { orphan = null; }
        if (orphan !== null) {
          fail('仍然在写孤儿键 fs.panelCollapsed（读取方看不到它）');
        } else {
          ok('没有留下孤儿键 fs.panelCollapsed');
        }
        FS.render.topbar.setPanelCollapsed(false);
      }
    }
  } catch (e) {
    fail('v1.0 特性测试抛错: ' + e.stack.split('\n').slice(0, 4).join('\n       '));
  }
}

/* ==========================================================================
   7.17 小团体 / 派系（v1.1）
   ========================================================================== */

console.log('\n=== 7.17 小团体（v1.1）===');

if (app) {
  const CFG = FS.data.config;
  const Agents = FS.state.agent;
  const Fac = FS.state.faction;

  try {
    /* ---- 1) 阈值必须"够得着"：随机世界跑一段后必须长出团体 ---- */
    {
      const t0 = Date.now();
      const w = FS.state.world.create(t0);
      app.world = w;
      app.roster.list.forEach((a) => {
        Agents.leave(app.roster, a);
        a.leaving = null;
        a.dead = false;
        a.affection = {};
        a.factionId = null;
        a.memory.length = 0;
        a.state.permanentDeath = false;
        a.onlineSinceGameMinute = -9999;
      });
      FS.state.joins.init(w, t0);
      FS.core.bus.clear();
      FS.ai.dialogue.reset();
      FS.render.log.clear();

      let now = t0;
      const realNow = Date.now;
      Date.now = () => now;
      const prevNW = CFG.debugNoWarmup;
      CFG.debugNoWarmup = true;
      try {
        FS.core.clock.setNow(now);
        /* 24 人上线，跑 120 分钟游戏时间（= 60 真实分钟）。
           小团体是靠好感慢慢长出来的 —— 40 分钟只能看到雏形，
           而且**随机性很大**（有时 4 个 2 人小组，有时 5 个团里 3 个到 3 人）。
           断言不能建在这种运气上，所以把时间拉长到关系已经稳定为止。 */
        for (let i = 0; i < 24; i++) {
          Agents.join(app.roster, app.roster.list[i], now);
          app.roster.list[i].onlineSinceGameMinute = -9999;
        }
        FS.state.world.syncRoster(w, app.roster);
        for (let i = 0; i < 60 * 60 * 4; i++) {
          now += CFG.tickMs;
          FS.core.clock.setNow(now);
          FS.core.tick.step(true);
        }
      } finally {
        Date.now = realNow;
        CFG.debugNoWarmup = prevNW;
        FS.core.clock.useRealTime();
      }

      const summary = Fac.summary(w);
      if (!summary.length) {
        fail('跑了 30 真实分钟、24 人在线，一个团体都没长出来（阈值够不着）');
      } else {
        ok('长出 ' + summary.length + ' 个团体：'
          + summary.map((f) => f.name + '(' + f.size + ')').join(' '));
      }
      /* 人数规模要合理，不能一伙就把所有人装进去；
         也不能只有 2 人小组（那说明"建团"抢走了所有关系）。 */
      const biggest = summary.length ? Math.max(...summary.map((f) => f.size)) : 0;
      const grown = summary.filter((f) => f.size >= 3).length;
      if (biggest > (CFG.factionMaxSize || 9)) {
        fail('有团体超过人数上限（' + biggest + ' > ' + CFG.factionMaxSize + '）');
      } else if (summary.length > (CFG.factionMax || 6)) {
        fail('团体数量超过上限（' + summary.length + '）');
      } else if (!grown) {
        fail('没有任何团体长到 3 人以上（' + summary.length
          + ' 个全是 2 人小组）—— 说明"自己拉一摊"抢走了本该加入现有团体的关系');
      } else {
        ok('团体规模合理（最大 ' + biggest + ' 人，其中 ' + grown + ' 个 >= 3 人）');
      }
      /* 入伙人数：40 分钟里应该有一批人真的组起来了 */
      const total = summary.reduce((s, f) => s + f.size, 0);
      if (total < 6) {
        fail('40 分钟里只有 ' + total + ' 人入伙，小团体几乎没形成');
      } else {
        ok('多团体并存（' + summary.length + ' 个共 ' + total + ' 人入伙）');
      }

      /* ---- 2) 团体会被真的用起来：好感基线 + 连带情绪 + 护短 ---- */
      if (summary.length) {
        const f = w.factions[0];
        const m1 = app.roster.byId[f.memberIds[0]];
        const m2 = app.roster.byId[f.memberIds[1]];
        if (!Fac.sameFaction(w, m1.id, m2.id)) {
          fail('同团成员没有被判定为"一伙"');
        } else {
          ok('同团成员互相识别为"一伙"（' + f.name + '）');
        }

        /* 好感基线：把两人的好感打到很低，评估一次后应被抬到下限 */
        m1.affection[m2.id] = 10;
        Fac.applyAffinityFloor(w, app.roster);
        const floor = CFG.factionAffinityFloor;
        if (m1.affection[m2.id] < floor) {
          fail('同团好感下限没生效（' + m1.affection[m2.id] + ' < ' + floor + '）');
        } else {
          ok('同团好感下限生效（被打到 10 后回到 ' + m1.affection[m2.id] + '）');
        }

        /* 连带情绪：第三方打了 m1，同伙 m2 也要记恨第三方 */
        const outsider = app.roster.list.find((a) => !f.memberIds.includes(a.id));
        if (!outsider) {
          warn('没有第三人可用于连带情绪测试，跳过');
        } else {
          const before = Fac.affection(m2, outsider.id);
          const n = Fac.onMemberHurt(w, app.roster, m1, outsider.id, 12, 'mem.factionGrudge');
          const after = Fac.affection(m2, outsider.id);
          if (!n) fail('同伙被打时没有产生连带情绪');
          else if (after >= before) fail('连带情绪没有降低对凶手的恶感（' + before + ' → ' + after + '）');
          else ok('连带情绪生效：' + n + ' 人记恨，对凶手好感 ' + before + ' → ' + after);
        }

        /* 护短：同伙被杀 → 活着的人挂上复仇目标 */
        const beforeGoals = m2.goals.filter((g) => g.id === 'revenge').length;
        const revengeN = Fac.onMemberKilled(w, app.roster, m1, outsider.id);
        const afterGoals = m2.goals.filter((g) => g.id === 'revenge').length;
        if (!revengeN) warn('同伙被杀时没有生成复仇目标（可能已经有过）');
        else if (afterGoals <= beforeGoals) fail('复仇目标没有挂到同伙身上');
        else ok('护短生效：' + revengeN + ' 个同伙挂上了复仇目标');
      }

      /* ---- 3) 团体名真的能被解析成文本（不走语言包） ---- */
      if (summary.length) {
        const fid = summary[0].id;
        for (const lang of ['en', 'zh']) {
          FS.core.i18n.setLang(lang);
          const txt = FS.core.i18n.t('log.faction.founded', {
            faction: FS.core.i18n.t('faction.' + fid),
            n: 3,
          });
          if (/\{[a-zA-Z]\w*\}/.test(txt) || txt.indexOf('\u2039') !== -1) {
            fail('团体日志渲染失败（' + lang + '）: ' + txt);
          } else if (lang === 'zh') {
            ok('团体日志渲染正常（' + txt + '）');
          }
        }
        FS.core.i18n.setLang('en');
      }
    }
  } catch (e) {
    fail('小团体测试抛错: ' + e.stack.split('\n').slice(0, 4).join('\n       '));
  }
}

/* ==========================================================================
   7.13 日志约定守卫：state/* 只能"返回"日志，不能自己 push
   第 25 个 bug 就是这里破的：Death.kill 既 push 又 return，
   调用方再 push 一次，同一条死亡日志被打两遍。
   ========================================================================== */

console.log('\n=== 7.13 日志约定守卫 ===');

{
  /* agentUpdate 是 state 层的调度器，天然要负责 push；
     其它 state 模块必须"只返回"。 */
  const PUSH_ALLOWED = { 'js/state/agentUpdate.js': 1 };
  const STATE_FILES = SCRIPTS.filter((r) => /^js\/state\//.test(r));
  let violators = 0;
  for (const rel of STATE_FILES) {
    if (PUSH_ALLOWED[rel]) continue;
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;      // 跳过注释
      if (/pushLogs\s*\(/.test(line)) {
        violators++;
        fail(rel + ':' + (i + 1) + ' 在 state 层直接 pushLogs —— 会与调用方重复推送');
      }
    }
  }
  if (!violators) {
    ok('除 agentUpdate 外的 ' + (STATE_FILES.length - 1)
      + ' 个 state 模块都没有自己 pushLogs（统一由 tick 推送）');
  }

  const au = fs.readFileSync(path.join(ROOT, 'js/state/agentUpdate.js'), 'utf8');
  if (!/pushLogs/.test(au)) {
    warn('agentUpdate 没有 pushLogs —— 离开/复活的日志可能丢失');
  } else {
    ok('agentUpdate 负责把离开/复活日志推给控制台');
  }
}

/* ==========================================================================
   8. i18n key 完整性：代码里用到的 key 必须都有译文
   ========================================================================== */

console.log('\n=== 8. i18n key 完整性 ===');

{
  const code = SCRIPTS
    .map((r) => fs.readFileSync(path.join(ROOT, r), 'utf8')).join('\n');

  const used = new Set();
  for (const m of code.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) used.add(m[1]);
  for (const m of code.matchAll(/\bkey:\s*'([a-zA-Z][\w.]*)'/g)) used.add(m[1]);
  for (const m of code.matchAll(/\bpoolKey\(\s*'([a-zA-Z][\w.]*)'/g)) used.add(m[1]);
  // 动态拼接的域（如 describeKey: 'log.cmd.' + name）标记为 'group.*'
  for (const m of code.matchAll(/\bdescribeKey:\s*'([a-zA-Z][\w.]*)'/g)) used.add(m[1] + '*');
  for (const m of code.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'\s*\+/g)) used.add(m[1] + '*');
  for (const m of code.matchAll(/\bkey:\s*'([a-zA-Z][\w.]*)'\s*\+/g)) used.add(m[1] + '*');

  // 数据表里引用的 log./mem. key 也算使用
  for (const rel of ['data/topics.js', 'data/goals.js']) {
    const t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of t.matchAll(/'((?:log|mem)\.[\w.]*[\w])'/g)) used.add(m[1]);
  }

  // 严格检查：只针对"一定会被查表"的调用
  const strict = new Set();
  for (const m of code.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) {
    if (!m[1].endsWith('.')) strict.add(m[1]);
  }
  for (const m of code.matchAll(/\btx\(\s*'([a-zA-Z]\w*)'\s*,\s*([^)]+)\)/g)) {
    const group = m[1];
    const lit = m[2].trim().match(/^'([^']+)'$/);
    if (lit) strict.add(group + '.' + lit[1]);
    else used.add(group + '.*');
  }
  for (const m of code.matchAll(/\bdivider\(\s*'([a-zA-Z][\w.]*)'/g)) strict.add(m[1]);
  // 末尾必须落在字母/数字/下划线上，避免把 'log.cmd.' + name 这种拼接前缀当成 key
  for (const m of code.matchAll(/'((?:log|mem)\.[\w.]*[\w])'/g)) strict.add(m[1]);

  const missing = [];
  for (const k of strict) {
    if (!FS.core.i18n.has(k, 'en') && !FS.core.i18n.has(k, 'zh')
        && FS.core.i18n.poolSize(k, 'en') === 0 && FS.core.i18n.poolSize(k, 'zh') === 0) {
      missing.push(k);
    }
  }
  if (missing.length) fail('代码里用到但没有译文的 key: ' + missing.join(', '));
  else ok('代码直接引用的 ' + strict.size + ' 个 key 全部有译文');

  // 前缀式引用：该前缀下必须中英都有一批 key
  const prefixes = [...used].filter((k) => k.endsWith('*')).map((k) => k.slice(0, -1));
  let prefixBad = 0;
  for (const p of prefixes) {
    const enN = flatEnKeys.filter((k) => k.startsWith(p) && k.length > p.length).length;
    const zhN = [...flatZhKeys].filter((k) => k.startsWith(p) && k.length > p.length).length;
    if (!enN || !zhN) { prefixBad++; fail('前缀式 key 缺少译文: ' + p + '  en=' + enN + ' zh=' + zhN); }
  }
  if (prefixes.length && !prefixBad) {
    ok('前缀式 key（' + prefixes.join(', ') + '）中英覆盖完整');
  }

  // 动态拼接的 key：数据表里每个 id 都要有译文。
  //
  /* 例外：**运行时解析**的域。
     `name`（32 个随机昵称）与 `faction`（玩家自己起的小队名）都不写进语言包，
     而是由 i18n.resolver 去运行时数据里查 —— 真人昵称/小队名本来就不翻译。
     这类 key 不走语言包检查，改查"解析器能不能真的取到值"。 */
  const RUNTIME_RESOLVED = { name: 1, faction: 1 };
  const groups = {
    name: dataIds.agentIds.concat(AUX),
    faction: (app && app.world && app.world.factions ? app.world.factions : [])
      .map((f) => f.id),
    place: dataIds.place,
    item: dataIds.item,
    threat: dataIds.threat,
    weather: dataIds.weather,
    mood: dataIds.mood,
    goal: dataIds.goal,
  };
  let dynBad = 0;
  let runtimeChecked = 0;
  for (const w of used) {
    if (!w.endsWith('.*')) continue;
    const group = w.slice(0, -2);
    for (const id of (groups[group] || [])) {
      if (RUNTIME_RESOLVED[group]) {
        /* 解析出来的必须是真名字（不能落到 ‹name.xxx› 这种兜底占位符） */
        const v = FS.core.i18n.t(group + '.' + id);
        runtimeChecked++;
        if (!v || v.charAt(0) === '\u2039') {
          dynBad++;
          fail('运行时 key 取不到值: ' + group + '.' + id + ' → ' + v);
        }
        continue;
      }
      if (!FS.core.i18n.has(group + '.' + id, 'en') || !FS.core.i18n.has(group + '.' + id, 'zh')) {
        dynBad++;
        fail('动态 key 缺译文: ' + group + '.' + id);
      }
    }
  }
  if (!dynBad) {
    ok('动态拼接的 key 覆盖完整（含 ' + runtimeChecked + ' 个运行时解析的昵称）');
  }
}

/* ==========================================================================
   9. HTML / CSS / JS 一致性
   ========================================================================== */

console.log('\n=== 9. 资源一致性 ===');

// 9a. JS 里 getElementById 用到的 id 必须真的存在于 index.html
const jsIds = new Set();
for (const rel of SCRIPTS) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const m of code.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)) jsIds.add(m[1]);
}
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const missingIds = [...jsIds].filter((id) => !htmlIds.has(id));
if (missingIds.length) fail('JS 引用了 index.html 里不存在的 id: ' + missingIds.join(', '));
else ok('JS 引用的 ' + jsIds.size + ' 个元素 id 都存在');

// 9b. index.html 引用的 css/js 文件都要存在
const assets = [
  ...[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((m) => m[1]),
  ...SCRIPTS,
];
const missingAssets = assets.filter((a) => !fs.existsSync(path.join(ROOT, a)));
if (missingAssets.length) fail('index.html 引用了不存在的文件: ' + missingAssets.join(', '));
else ok(assets.length + ' 个 css/js 引用全部存在');

// 9c. CSS 里的类名至少有出处（动态拼的如 lv-INFO 会误报，只提示）
// 先去掉注释，避免注释里的文字被当成类名
const cssText = fs.readdirSync(path.join(ROOT, 'css'))
  .map((f) => fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');
const jsText = SCRIPTS.map((r) => fs.readFileSync(path.join(ROOT, r), 'utf8')).join('\n');
const cssClasses = new Set([...cssText.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const known = new Set(['css', 'lv-INFO', 'lv-WARN', 'lv-ERROR', 'lv-SYSTEM', 'lv-DEBUG', 'w3', 'org']);
const orphan = [...cssClasses].filter((c) =>
  !known.has(c) && !html.includes(c) && !jsText.includes(c));
if (orphan.length) warn('CSS 里可能有未被使用的类: ' + orphan.slice(0, 10).join(', '));
else ok('CSS 类与 HTML/JS 基本对应');

/* ==========================================================================
   汇总
   ========================================================================== */

console.log('\n=== 结果 ===');
console.log('  失败: ' + failures + '   警告: ' + warnings);
if (failures) {
  console.log('\n\x1b[31m冒烟测试未通过\x1b[0m\n');
  process.exit(1);
}
console.log('\n\x1b[32m冒烟测试通过\x1b[0m\n');

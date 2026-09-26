/* ==========================================================================
   tools/calibrate-faction.js —— 用实测好感分布来定小团体的阈值
   --------------------------------------------------------------------------
   为什么要这个脚本：faction 的加入/建团阈值必须贴着**真实的好感分布**定。
   凭直觉定过两次都错了（120/125 一个团都长不出来；105/112 只长出一个 2 人小组）。

   用法：node tools/calibrate-faction.js [真实分钟数]
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const MINUTES = parseInt(process.argv[2], 10) || 30;
const ONLINE = 24;

/* ---- 复用 smoke.js 的最小 DOM 桩思路，但要独立跑，所以这里精简一份 ---- */
const sandbox = {
  console: { log: () => {}, warn: () => {}, error: () => {} },
  Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  navigator: { userAgent: 'node', language: 'en' },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

function makeEl(tag) {
  const el = {
    nodeType: 1, tagName: tag, _store: [], style: {}, dataset: {}, attributes: {},
    _listeners: {},
    appendChild(c) { this._store.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this._store.indexOf(c); if (i >= 0) this._store.splice(i, 1); return c; },
    insertBefore(c) { this._store.unshift(c); c.parentNode = this; return c; },
    addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
    removeEventListener() {},
    dispatchEvent() { return true; },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k] === undefined ? null : this.attributes[k]; },
    getBoundingClientRect() { return { width: 200, height: 100, top: 0, left: 0 }; },
    get firstChild() { return this._store[0] || null; },
    get lastChild() { return this._store[this._store.length - 1] || null; },
    get childNodes() { return this._store; },
    get offsetWidth() { return 200; },
    get offsetHeight() { return 100; },
    focus() {}, click() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  };
  const cls = new Set();
  el.classList = {
    add: (...c) => c.forEach((x) => cls.add(x)),
    remove: (...c) => c.forEach((x) => cls.delete(x)),
    toggle: (c, on) => { if (on === undefined) on = !cls.has(c); on ? cls.add(c) : cls.delete(c); },
    contains: (c) => cls.has(c),
  };
  let text = '';
  Object.defineProperty(el, 'textContent', {
    get() {
      if (this._store.length) {
        return this._store.map((c) => (c.nodeType === 3 ? c.data : c.textContent)).join('');
      }
      return text;
    },
    set(v) { text = String(v); this._store.length = 0; },
  });
  Object.defineProperty(el, 'innerHTML', { get() { return text; }, set(v) { text = String(v); } });
  Object.defineProperty(el, 'value', { get() { return el._value || ''; }, set(v) { el._value = v; } });
  return el;
}

const byId = {};
sandbox.document = {
  body: makeEl('body'), documentElement: makeEl('html'), _listeners: {},
  createElement: makeEl, createTextNode: (t) => ({ nodeType: 3, data: String(t) }),
  createDocumentFragment: () => makeEl('frag'),
  getElementById: (id) => byId[id] || (byId[id] = makeEl('div')),
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); },
  removeEventListener() {}, readyState: 'complete', hidden: false, visibilityState: 'visible',
};
sandbox.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] === undefined ? null : this._d[k]; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
  clear() { this._d = {}; },
};
sandbox.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
sandbox.Blob = function () {};
sandbox.FileReader = function () {};
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};

vm.createContext(sandbox);

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SCRIPTS = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
for (const rel of SCRIPTS) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
}

const FS = sandbox.FS;
const CFG = FS.data.config;
FS.data.config.debugLogs = false;
doc_ready(sandbox);

function doc_ready(sb) {
  sb.document.readyState = 'complete';
  (sb.document._listeners['DOMContentLoaded'] || []).slice().forEach((fn) => fn({ type: 'DOMContentLoaded' }));
}

const app = FS.app;
const t0 = Date.now();
let now = t0;
const realNow = Date.now;
Date.now = () => now;
FS.core.clock.setNow(now);

/* 24 人上线 */
CFG.debugNoWarmup = true;
app.world.worldStartMs = now;
app.world.tick = 0;
FS.state.joins.init(app.world, now);
for (let i = 0; i < ONLINE; i++) {
  FS.state.agent.join(app.roster, app.roster.list[i], now);
  app.roster.list[i].onlineSinceGameMinute = -9999;
}
FS.state.world.syncRoster(app.world, app.roster);

/* 跑 MINUTES 真实分钟，定期采样好感分布 */
const TICKS = MINUTES * 60 * 4;
const samples = [];
for (let i = 0; i < TICKS; i++) {
  now += CFG.tickMs;
  FS.core.clock.setNow(now);
  FS.core.tick.step(true);
  if (i % (4 * 60 * 5) === (4 * 60 * 5 - 1)) {     // 每 5 真实分钟
    samples.push({ min: (i + 1) / (4 * 60), dist: sampleDist() });
  }
}
Date.now = realNow;

function sampleDist() {
  const online = FS.state.agent.online(app.roster);
  const vals = [];
  for (let i = 0; i < online.length; i++) {
    for (let j = i + 1; j < online.length; j++) {
      vals.push(FS.ai.decision.affection(online[i], online[j].id));
    }
  }
  vals.sort((a, b) => a - b);
  const q = (p) => vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * p))] : 0;
  return {
    n: vals.length,
    max: vals.length ? vals[vals.length - 1] : 0,
    p50: q(0.5), p75: q(0.75), p85: q(0.85), p90: q(0.9), p95: q(0.95), p99: q(0.99),
  };
}

console.log('好感分布（' + ONLINE + ' 人在线，' + MINUTES + ' 真实分钟）');
console.log('  时间   对数   max  p50  p75  p85  p90  p95  p99');
samples.forEach((s) => {
  const d = s.dist;
  console.log('  ' + String(Math.round(s.min)).padStart(3) + 'm  '
    + String(d.n).padStart(5) + '  '
    + String(d.max).padStart(4) + '  '
    + [d.p50, d.p75, d.p85, d.p90, d.p95, d.p99].map((v) => String(v).padStart(4)).join('  '));
});

/* 依据分布给建议：加入线取 ~p85，建团线取 ~p93 */
const last = samples.length ? samples[samples.length - 1].dist : null;
if (last) {
  const suggestedJoin = Math.round((last.p85 + last.p90) / 2);
  const suggestedFound = Math.round((last.p90 + last.p95) / 2);
  console.log('');
  console.log('建议阈值（贴着实测分位数，不要凭直觉）：');
  console.log('  factionJoinAffection      ≈ ' + suggestedJoin + '  （p85~p90）');
  console.log('  factionFoundAffection     ≈ ' + suggestedFound + '  （p90~p95，要比加入线高）');
  console.log('');
  const summary = FS.state.faction.summary(app.world);
  console.log('当前配置下的团体：'
    + (summary.length ? summary.map((f) => f.name + '(' + f.size + ')').join(' ') : '（无）'));
  console.log('当前阈值：加入 ' + CFG.factionJoinAffection
    + ' / 建团 ' + CFG.factionFoundAffection
    + ' / 每多一人 +' + CFG.factionJoinScalePerMember);
}

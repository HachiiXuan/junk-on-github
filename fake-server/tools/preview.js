/* ==========================================================================
   tools/preview.js —— 把模拟出的控制台内容打到终端，用来"读"效果
   用法：
     node tools/preview.js                 # 英文，15 分钟
     node tools/preview.js 30 zh           # 30 分钟，中文
     node tools/preview.js 15 en 80        # 只看最后 80 行
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const minutes = parseInt(process.argv[2] || '15', 10);
const wantLang = (process.argv[3] || 'en') === 'zh' ? 'zh' : 'en';
const tail = parseInt(process.argv[4] || '60', 10);

/* ---------- 复用 smoke.js 的 DOM 桩思路：这里只需要最小可用版本 ---------- */
function makeClassList() {
  const set = new Set();
  return {
    add(...c) { c.forEach((x) => x && set.add(x)); },
    remove(...c) { c.forEach((x) => set.delete(x)); },
    toggle(c, f) { const w = f === undefined ? !set.has(c) : !!f; w ? set.add(c) : set.delete(c); return w; },
    contains(c) { return set.has(c); },
    toString() { return [...set].join(' '); },
    _set: set,
  };
}
function makeEl(tag, doc) {
  const el = { tagName: tag.toUpperCase(), nodeType: 1, childNodes: [], parentNode: null, style: {}, dataset: {}, value: '', attributes: {}, offsetWidth: 100, offsetHeight: 20, clientHeight: 600, scrollHeight: 600, scrollTop: 0 };
  el.classList = makeClassList();
  Object.defineProperty(el, 'className', {
    get() { return el.classList.toString(); },
    set(v) { el.classList._set.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach((c) => el.classList._set.add(c)); },
  });
  el.appendChild = (c) => { c.parentNode = el; el.childNodes.push(c); return c; };
  el.insertBefore = (c) => { c.parentNode = el; el.childNodes.push(c); return c; };
  el.removeChild = (c) => { const i = el.childNodes.indexOf(c); if (i >= 0) el.childNodes.splice(i, 1); return c; };
  el.remove = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  el.setAttribute = (k, v) => { el.attributes[k] = String(v); };
  el.getAttribute = (k) => (el.attributes[k] === undefined ? null : el.attributes[k]);
  el.addEventListener = () => {};
  el.removeEventListener = () => {};
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  el.closest = () => null;
  el.querySelector = () => null;
  el.querySelectorAll = () => [];
  el.focus = () => {};
  let _text = '';
  Object.defineProperty(el, 'textContent', {
    get() { return el.childNodes.length ? el.childNodes.map((c) => (c.nodeType === 3 ? c.data : c.textContent)).join('') : _text; },
    set(v) { el.childNodes.length = 0; _text = String(v == null ? '' : v); },
  });
  Object.defineProperty(el, 'innerHTML', {
    get() { return ''; },
    set(v) { if (String(v).trim() === '') { el.childNodes.length = 0; _text = ''; } },
  });
  return el;
}
const doc = {
  readyState: 'loading', documentElement: null, body: null, activeElement: null, hidden: false,
  _byId: {}, _listeners: {},
  createElement(t) { const e = makeEl(t, doc); if (t === 'canvas') e.getContext = () => ({ font: '', measureText: (s) => ({ width: String(s).length * 7 }) }); return e; },
  createTextNode(t) { return { nodeType: 3, data: String(t), textContent: String(t), parentNode: null }; },
  getElementById(id) { return doc._byId[id] || null; },
  querySelector(s) { return s && s[0] === '#' ? (doc._byId[s.slice(1)] || null) : null; },
  querySelectorAll() { return []; },
  addEventListener(type, fn) { (doc._listeners[type] = doc._listeners[type] || []).push(fn); },
  removeEventListener() {},
};
doc.documentElement = makeEl('html', doc);
doc.body = makeEl('body', doc);

const store = new Map();
const sandbox = {
  console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error,
  isFinite, parseInt, parseFloat, Set, Map, Promise,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
};
sandbox.window = sandbox;
sandbox.document = doc;
sandbox.navigator = { language: wantLang === 'zh' ? 'zh-CN' : 'en-US' };
sandbox.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
sandbox.innerWidth = 1440;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.getComputedStyle = () => ({ fontSize: '13px', fontFamily: 'monospace' });
sandbox.getSelection = () => '';

const ctx = vm.createContext(sandbox);

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SCRIPTS = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);

for (const rel of SCRIPTS) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
}

// 关键 DOM 节点
for (const id of ['main', 'log', 'jumpLatest', 'jumpLatestLabel', 'cmdInput', 'fakeCaret',
  'inputRow', 'consoleWrap', 'mapName', 'onlineCount', 'onlineVal', 'onlineLabel',
  'timeVal', 'weather', 'weatherVal', 'weatherLabel', 'langLabel', 'langBtn',
  'panelToggle', 'panelToggleIcon', 'panelToggleCap', 'panel', 'panelBody', 'panelStrip',
  'panelStripLabel', 'panelTitle', 'inputHint', 'immersiveHint', 'immersiveHintText']) {
  const el = makeEl('div', doc);
  doc._byId[id] = el;
}
doc._byId.main.appendChild(doc._byId.panel);
doc._byId.consoleWrap.appendChild(doc._byId.log);

const FS = sandbox.FS;
FS.data.config.debugLogs = false;
/* 传 --leave 可以看到快速的"下线 / 再上线"循环（调试节奏） */
if (process.argv.includes('--leave')) FS.data.config.debugLeave = true;
doc.readyState = 'complete';
(doc._listeners['DOMContentLoaded'] || []).slice().forEach((fn) => fn({ type: 'DOMContentLoaded' }));

const CFG = FS.data.config;
const app = FS.app;

/* ---------- --boot：只看"页面刚打开时"控制台里有什么 ----------
   用来排查"每次打开左上角会多出一条消息"这类问题：
   打印 boot 完成瞬间缓冲区的前若干行，以及分隔行的位置。 */
if (process.argv.includes('--boot')) {
  const buf = FS.render.log.getBuffer();
  console.log('boot 后缓冲区 ' + buf.length + ' 行：');
  buf.slice(0, 12).forEach((e, i) => {
    console.log('  ' + (i + 1) + '. [' + e.tsText + '] ' + (e.key || e.kind || '?')
      + (e.vars && e.vars.name ? '  name=' + JSON.stringify(e.vars.name) : ''));
  });
  const store = doc._byId.log._store || [];
  console.log('DOM 行数 ' + store.length + '：');
  store.slice(0, 12).forEach((n, i) => {
    const t = (n.textContent || '').replace(/\s+/g, ' ').slice(0, 70);
    console.log('  ' + (i + 1) + '. ' + t);
  });
  console.log('世界 tick=' + app.world.tick + '  在线=' + app.world.online.length);
  console.log('lastOutputTick=' + app.world.lastOutputTick
    + '  quietFor=' + FS.state.noise.quietFor(app.world)
    + '  noiseQuietGapTicks=' + CFG.noiseQuietGapTicks);
  console.log('backfillPlan=' + JSON.stringify(FS.app.backfillPlan || null));
  process.exit(0);
}

const t0 = Date.now();
FS.core.clock.setNow(t0);
app.world.worldStartMs = t0;
app.world.tick = 0;
FS.state.joins.init(app.world, t0);

const TICKS = Math.round(minutes * 60 * 1000 / CFG.tickMs);
const tStart = Date.now();
for (let i = 0; i < TICKS; i++) {
  FS.core.clock.setNow(t0 + (i + 1) * CFG.tickMs);
  FS.core.tick.step(true);
}
const elapsed = Date.now() - tStart;
FS.core.clock.setNow(t0 + TICKS * CFG.tickMs);
FS.core.i18n.setLang(wantLang);

/* ---------- 输出 ---------- */
const buffer = FS.render.log.getBuffer();
const lines = [];
for (const e of buffer) {
  const r = FS.render.log.describe(e);
  let s;
  if (r.divider) s = r.text;
  else if (r.chat) s = r.tsText + '  ' + '[' + r.threadText + '/INFO]: ' + r.parts.map((p) => p.text).join('');
  else s = r.tsText + '  [' + r.threadText + '/' + r.levelText + ']: ' + r.parts.map((p) => p.text).join('');
  lines.push(s);
}

console.log('\n' + '='.repeat(100));
console.log(`  ${minutes} 分钟模拟 · 语言 ${wantLang} · ${TICKS} tick · 耗时 ${elapsed}ms · 缓冲 ${lines.length} 行`);
console.log('='.repeat(100) + '\n');

/* ---------- 日志构成统计（--stats） ----------
   用来回答"控制台看起来像不像真服务器"：
   聊天 / 加入离开 / 底层噪音 / 玩家动作 / 死亡交易 各占多少。 */
if (process.argv.includes('--stats')) {
  const buckets = {
    chat: 0, joinLeave: 0, noise: 0, action: 0,
    death: 0, trade: 0, weather: 0, command: 0, other: 0,
  };
  const topicCount = {};
  for (const e of buffer) {
    const k = e.key || '';
    if (e.level === 'CHAT') {
      buckets.chat++;
      const m = k.match(/^topic\.([a-zA-Z]+)\./);
      if (m) topicCount[m[1]] = (topicCount[m[1]] || 0) + 1;
    } else if (/^log\.noise\./.test(k)) buckets.noise++;
    else if (/^log\.action\./.test(k)) buckets.action++;
    else if (/^log\.(server|serverDied)\.(join|joinFirst|leave|timeout)/.test(k)) buckets.joinLeave++;
    else if (/^log\.death\./.test(k)) buckets.death++;
    else if (/^log\.trade\./.test(k)) buckets.trade++;
    else if (/^log\.(server|world)\.weather/.test(k)) buckets.weather++;
    else if (/^log\.command\./.test(k)) buckets.command++;
    else buckets.other++;
  }
  const total = buffer.length || 1;
  console.log('  ---- 日志构成（共 ' + buffer.length + ' 行）----');
  Object.keys(buckets).sort((a, b) => buckets[b] - buckets[a]).forEach((b) => {
    if (!buckets[b] && b === 'other') return;
    const pct = Math.round((buckets[b] / total) * 1000) / 10;
    console.log('    ' + b.padEnd(12) + String(buckets[b]).padStart(5)
      + '  ' + String(pct).padStart(5) + '%');
  });
  const topics = Object.keys(topicCount).sort((a, b) => topicCount[b] - topicCount[a]);
  console.log('    ---- 出现的话题（' + topics.length + ' 种）----');
  console.log('    ' + topics.map((t) => t + ':' + topicCount[t]).join('  '));
  const online = FS.state.agent.online(app.roster).length;
  console.log('    ---- 规模 ----');
  console.log('    在线 ' + online + '/32　'
    + '世界第 ' + app.world.time.day + ' 天 ' + app.world.time.hour + ' 时');
  const chatsPerMin = buckets.chat / minutes;
  console.log('    聊天 ' + (Math.round(chatsPerMin * 10) / 10) + ' 行/分钟　'
    + '噪音 ' + (Math.round((buckets.noise / minutes) * 10) / 10) + ' 行/分钟　'
    + '动作 ' + (Math.round((buckets.action / minutes) * 10) / 10) + ' 行/分钟');

  /* 小团体状态：到底有没有长出来 */
  const factions = FS.state.faction ? FS.state.faction.summary(app.world) : [];
  console.log('    ---- 小团体 ----');
  if (!factions.length) {
    console.log('    （还没有形成任何团体）');
  } else {
    factions.forEach((f) => {
      const members = FS.state.faction.members(app.world, { memberIds: [], id: f.id }, app.roster);
      console.log('    ' + f.name + '  ' + f.size + ' 人');
    });
  }
  /* 好感分布：解释为什么没形成 */
  const all = FS.state.agent.online(app.roster);
  const affs = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      affs.push(FS.ai.decision.affection(all[i], all[j].id));
    }
  }
  if (affs.length) {
    affs.sort((a, b) => b - a);
    const near = affs.filter((v) => v >= (CFG.factionJoinAffection || 125)).length;
    const found = affs.filter((v) => v >= (CFG.factionFoundAffection || 120)).length;
    console.log('    好感：最高 ' + affs[0] + '　中位 ' + affs[Math.floor(affs.length / 2)]
      + '　>=加入线(' + CFG.factionJoinAffection + ') ' + near + ' 对'
      + '　>=建团线(' + CFG.factionFoundAffection + ') ' + found + ' 对'
      + '　共 ' + affs.length + ' 对');
  }
  console.log('');
}

console.log(lines.slice(-tail).join('\n'));

/* ---------- 可选：按对话实例分组，检查话题链是否连贯 ---------- */
if (process.argv[5] === 'trace') {
  console.log('\n' + '-'.repeat(100));
  console.log('  对话链追踪（按话题实例分组，检查是否有串台/断链）');
  console.log('-'.repeat(100));
  const byInst = new Map();
  for (const e of buffer) {
    if (e.level !== 'CHAT' || !e.instanceId) continue;
    if (!byInst.has(e.instanceId)) byInst.set(e.instanceId, []);
    byInst.get(e.instanceId).push(e);
  }
  for (const [id, list] of byInst) {
    const who = list.map((e) => e.agentId);
    console.log(`\n  [${id}] ${list.length} 条  (${[...new Set(who)].join(' / ')})`);
    for (const e of list) {
      const text = FS.core.i18n.t(e.key, FS.core.i18n.localizeVars(e.vars));
      console.log(`      ${e.agentId.padEnd(6)} ${e.key.padEnd(26)} ${text}`);
    }
  }
}

console.log('\n' + '-'.repeat(100));
console.log('  角色快照（面板会显示这些）');
console.log('-'.repeat(100));
for (const a of app.roster.list) {
  const on = a.state.online ? '在线' : '离线';
  const goals = a.goals.map((g) => FS.state.goal.describe(g)).join(', ') || '-';
  const top = a._lastScores && a._lastScores.length
    ? a._lastScores.slice(0, 3).map((s) => s.actionId + '=' + s.score.toFixed(2)).join('  ')
    : '-';
  console.log(`  ${FS.core.i18n.t('name.' + a.id).padEnd(8)} ${on}  ${FS.core.i18n.tx('place', a.state.place).padEnd(6)} `
    + `${FS.core.i18n.tx('mood', a.state.mood).padEnd(6)} 目标: ${goals}`);
  console.log(`           记忆 ${String(a.memory.length).padStart(2)} 条   发言 ${a.stats.spoken}  话题 ${a.stats.topicsStarted}  移动 ${a.stats.moves}  交易 ${a.stats.trades}`);
  console.log(`           候选动作前三: ${top}`);
}
console.log('');

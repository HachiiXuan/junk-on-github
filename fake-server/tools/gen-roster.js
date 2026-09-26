/* ==========================================================================
   tools/gen-roster.js —— 一次性生成 data/agents.js 的 32 人名册
   --------------------------------------------------------------------------
   为什么要脚本生成而不是手写：
     · 32 个角色 × 5 维性格 × 起始地点，手写既枯燥又容易出现"性格都一样"
     · 用项目自己的 seeded RNG 生成，结果可复现，改参数重新跑一次即可
   生成结果是**静态文件**（data/agents.js），运行时不依赖这个脚本。
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COUNT = 32;
const SEED = 20260416;          // 固定种子：换它就能换一整套人

/* ---- 1) 在最小沙箱里加载 rng + names，拿到确定性的名册 ---- */
const sandbox = { window: null, console, Math, Date, Object, Array, String, Number, JSON };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const vm = require('vm');
vm.createContext(sandbox);

/* 项目的 define 机制 */
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core/namespace.js'), 'utf8'), sandbox,
  { filename: 'namespace.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/core/rng.js'), 'utf8'), sandbox,
  { filename: 'rng.js' });

const RNG = sandbox.FS.core.rng;
RNG.seed(SEED);

vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/names.js'), 'utf8'), sandbox,
  { filename: 'names.js' });

const roster = sandbox.FS.data.names.roster(COUNT);

/* ---- 2) 生成 32 组性格 ----
   做法：先随机一个"原型"（archetype），再在原型基准上抖动。
   纯随机会得到一堆平均值，看起来所有人都差不多；
   原型 + 抖动才能既有明显个性，又不会千人一面。 */
const ARCHETYPES = [
  // id            chatty generous timid belligerent curious   标签（英文，仅注释用）
  ['social',        0.90, 0.70, 0.20, 0.15, 0.50],   // 话痨、爱搭话
  ['helper',        0.60, 0.95, 0.25, 0.10, 0.45],   // 老好人，有求必应
  ['loner',         0.20, 0.35, 0.55, 0.25, 0.60],   // 独来独往，话少
  ['raider',        0.45, 0.25, 0.15, 0.90, 0.55],   // 好战，先动手
  ['explorer',      0.35, 0.40, 0.35, 0.20, 0.95],   // 满地图乱跑
  ['trader',        0.70, 0.55, 0.30, 0.10, 0.55],   // 见谁都想换东西
  ['builder',       0.40, 0.60, 0.40, 0.15, 0.50],   // 宅在营地盖房子
  ['coward',        0.30, 0.50, 0.95, 0.05, 0.35],   // 一有风吹草动就跑
  ['gossip',        0.85, 0.45, 0.35, 0.30, 0.75],   // 什么都知道，爱传话
  ['veteran',       0.55, 0.65, 0.20, 0.55, 0.60],   // 老玩家，稳
  ['newbie',        0.65, 0.75, 0.60, 0.10, 0.80],   // 新人，什么都问
  ['grump',         0.25, 0.30, 0.30, 0.50, 0.30],   // 脾气差，爱抱怨
];

/* 起始地点：按"人多的地方多分人"来分，营地/森林/矿区是主要聚集地 */
const PLACE_MIX = [
  'camp', 'camp', 'camp', 'camp', 'camp', 'camp', 'camp',
  'forest', 'forest', 'forest', 'forest', 'forest', 'forest',
  'mine', 'mine', 'mine', 'mine', 'mine',
  'river', 'river', 'river',
  'ruins', 'ruins', 'ruins',
  'cave', 'cave',
];

/* 说话风格：真实玩家打字习惯的分布 */
const STYLES = [
  { id: 'lowercase', w: 55 },   // 全小写、不打标点（最常见）
  { id: 'normal', w: 25 },      // 大小写规范
  { id: 'terse', w: 12 },       // 极简，几个词
  { id: 'shouty', w: 8 },       // 全大写 / 感叹号多
];

function jitter(base, amount) {
  const v = base + (RNG.float() * 2 - 1) * amount;
  return Math.round(Math.max(0.02, Math.min(0.98, v)) * 100) / 100;
}

function pickStyle() {
  return RNG.weighted(STYLES).id;
}

/* ---- 3) 组装 ---- */
const lines = [];
lines.push('/* ==========================================================================');
lines.push('   data.agents —— 角色定义（32 人，v1.0）');
lines.push('   --------------------------------------------------------------------------');
lines.push('   ⚠️ 本文件由 tools/gen-roster.js 生成，不要手改 ——');
lines.push('      要调整名册（人数 / 种子 / 性格原型 / 地点分布），改脚本后重新运行：');
lines.push('        node tools/gen-roster.js');
lines.push('');
lines.push('   性格 5 维（0~1）：chatty 话多 / generous 慷慨 / timid 胆小 /');
lines.push('                     belligerent 好战 / curious 好奇');
lines.push('   style：说话习惯，影响文本风格（lowercase 全小写 / normal 规范 /');
lines.push('          terse 极简 / shouty 全大写）');
lines.push('   name：随机英文昵称，风格贴近真实玩家 ID（见 data/names.js）');
lines.push('   ========================================================================== */');
lines.push('(function (FS) {');
lines.push("  'use strict';");
lines.push('');
lines.push('  FS.data.agents = [');

const usedArch = {};
/* 原型按固定顺序铺开，保证 12 个原型每个至少出现 2 次（32 = 12×2 + 8） */
const archOrder = ARCHETYPES.map((a) => a);
/* 用 RNG 打乱一份"原型队列"，再按队列取，取完一轮重新打乱 */
let archQueue = [];
function nextArch() {
  if (!archQueue.length) {
    archQueue = archOrder.slice();
    /* Fisher-Yates，用项目自己的 RNG 保证可复现 */
    for (let i = archQueue.length - 1; i > 0; i--) {
      const j = RNG.int(0, i);
      const t = archQueue[i]; archQueue[i] = archQueue[j]; archQueue[j] = t;
    }
  }
  return archQueue.pop();
}

roster.forEach((entry, i) => {
  const arch = nextArch();
  usedArch[arch[0]] = (usedArch[arch[0]] || 0) + 1;
  const [, c, g, t, b, cu] = arch;

  const amt = 0.16;
  const place = PLACE_MIX[i % PLACE_MIX.length];
  const style = pickStyle();

  lines.push('    {');
  lines.push("      id: '" + entry.id + "',");
  lines.push("      name: '" + entry.name + "',");
  lines.push('      personality: { chatty: ' + jitter(c, amt)
    + ', generous: ' + jitter(g, amt)
    + ', timid: ' + jitter(t, amt)
    + ', belligerent: ' + jitter(b, amt)
    + ', curious: ' + jitter(cu, amt) + ' },');
  lines.push("      startPlace: '" + place + "',");
  lines.push("      style: '" + style + "',");
  lines.push("      archetype: '" + arch[0] + "',");
  lines.push('    },');
});

lines.push('  ];');
lines.push('');
lines.push('  /* 原型使用统计（生成时写入，方便确认分布）：');
Object.keys(usedArch).sort().forEach((k) => {
  lines.push('     ' + k + ': ' + usedArch[k]);
});
lines.push('  */');
lines.push('})(window.FS);');
lines.push('');

const outPath = path.join(ROOT, 'data/agents.js');
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');

console.log('已生成 ' + outPath);
console.log('角色数: ' + roster.length + '（种子 ' + SEED + '）');
console.log('原型分布: ' + Object.keys(usedArch).sort()
  .map((k) => k + '=' + usedArch[k]).join(', '));
console.log('前 8 个昵称: ' + roster.slice(0, 8).map((r) => r.name).join(', '));
console.log('昵称长度范围: '
  + Math.min(...roster.map((r) => r.name.length)) + '~'
  + Math.max(...roster.map((r) => r.name.length)));

/**
 * 轻量本地化：中文 / English
 *   · 默认英语
 *   · 首次访问检测浏览器语言，若为中文则自动切到中文
 *   · 用户手动切换后写入 localStorage，下次优先用用户的选择
 */
const STORE_KEY = 'mf.lang';
export const LANGS = ['en', 'zh'];

function safeGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k, v) {
  try { localStorage.setItem(k, v); } catch { /* 隐私模式忽略 */ }
}

export const DICT = {
  en: {
    'brand.title': 'ARCANE FOUNDRY',
    'brand.sub': 'MAGIC WORKSHOP',

    'sec.complexity': 'COMPLEXITY',
    'sec.complexityHint': 'circle slots',
    'sec.core': 'SPELL CORE',
    'sec.coreHint': 'pick 1 · shapes everything',
    'sec.methods': 'RELEASE METHOD',
    'sec.methodsHint': 'repeatable · shapes damage',
    'sec.circle': 'MAGIC CIRCLE',
    'sec.circleHint': 'click a slot to remove',
    'sec.overload': 'OVERLOAD CORE',
    'sec.overloadHint': '30 slots · no need to fill',
    'sec.uncapped': 'UNCAPPED',
    'sec.uncappedHint': 'drop budget & count limits',

    'cx.1': 'Faint', 'cx.2': 'Novice', 'cx.3': 'Adept', 'cx.4': 'Greater', 'cx.5': 'Forbidden',
    'cx.overload': 'OVERLOAD',

    'btn.craft': '✦ INSCRIBE ✦',
    'btn.crafted': '✦ INSCRIBED ✦',
    'btn.random': 'Random build',
    'btn.help': 'Codex',
    'btn.clear': 'Clear circle',
    'btn.hide': 'Hide panel',
    'btn.show': 'Show panel',
    'btn.lang': 'Switch language',
    'btn.sound': 'Sound on / off',
    'btn.muted': 'Muted — click to unmute',
    'chk.auto': 'Auto-inscribe when full',

    'slots.core': 'CORE',
    'slots.method': 'MODE',
    'slots.empty': '—',

    'hud.none': 'NOT INSCRIBED',
    'hud.idleSub': 'Forge a spell on the left panel',
    'hud.tag': '{core} core · complexity {n} · {tag}',
    'hud.tagOverload': '{core} core · OVERLOAD · {used} modes · {tag}',

    'stats.castDmg': 'Cast damage',
    'stats.peak': 'Peak',
    'stats.slain': 'Slain',
    'stats.alive': 'Alive',
    'stats.casts': 'Casts',
    'stats.fps': 'FPS',

    'hint.idle': '<b>Left click</b> to cast · forge a spell first',
    'hint.idleTouch': '<b>Tap</b> to cast · forge a spell first. <b>Drag</b> to orbit',
    'hint.ready': '<b>Left click</b> to cast “{name}” · <b>hold Space + drag</b> to orbit · <b>wheel</b> to zoom',
    'hint.touch': '<b>Tap</b> to cast “{name}” · <b>drag</b> to orbit',

    'toast.full': 'Circle is full ({n} release methods max)',
    'toast.noSpell': 'No spell inscribed yet — forge one on the left',
    'toast.inscribed': 'Inscribed: {name}',
    'toast.needCore': 'Pick a spell core first',
    'toast.needMethods': 'Some release method slots are still empty',
    'toast.lang': 'Language: English',
    'toast.overloadOn': 'OVERLOAD CORE enabled — up to 30 slots, cast anytime',
    'toast.overloadOff': 'OVERLOAD CORE disabled',
    'toast.uncappedOn': 'Performance limits removed — full brute force',
    'toast.uncappedOff': 'Performance limits restored',
    'toast.soundOn': 'Sound on',
    'toast.soundOff': 'Sound muted',

    'res.sub': '{core} core · {tag} · complexity {n}',
    'res.subOverload': '{core} core · {tag} · OVERLOAD ({used}/29 modes)',
    'res.circle': 'Circle',
    'res.none': 'none (core pulse)',
    'res.core': 'Core',
    'res.release': 'Release',
    'res.syn': 'COMBINATION LAWS',
    'res.noSyn': 'A lone configuration — no extra combinations',
    'res.score': 'Score {n}',
    'res.stat': 'dmg ~{dmg} · radius {radius}',

    'line.orb': '{n} seeking orb(s)',
    'line.beam': '{n} piercing lance(s)',
    'line.barrage': '{w} wave(s) × {m} meteor(s)',
    'line.chain': 'arc jumps {n} times',
    'line.field': 'field radius ×{k}',
    'line.orbit': '{n} orbiting satellite(s)',
    'line.rune': '{n} delayed sigil(s)',
    'line.burst': 'burst radius ×{k}',
    'line.pulse': 'the core pulses on its own',

    'help.title': 'CODEX OF COMBINATION',
    'help.intro': 'A spell = <b>1 spell core</b> (global) + <b>several release methods</b> (how damage is dealt). Methods may repeat — repeating stacks them. Different methods wired together trigger each other automatically.',
    'help.ops': 'CONTROLS',
    'help.op1': '<b>Left click the scene</b> — cast at that spot (hold to repeat). The target locks the instant you press.',
    'help.op2': '<b>Hold Space + drag left button</b> — orbit the camera (middle drag works too)',
    'help.op3': '<b>Wheel</b> — zoom',
    'help.op4': 'The ring on the ground previews the current burst radius',
    'help.op5': '<b>Enter</b> — inscribe · <b>Esc</b> — close this page · <b>H</b> — hide/show panel',
    'help.opTouch': 'On touch screens: <b>tap</b> to cast, <b>drag</b> to orbit.',
    'help.cores': 'SPELL CORES · GLOBAL EFFECT',
    'help.methods': 'RELEASE METHODS · HOW DAMAGE HAPPENS',
    'help.stack': 'SAME-NAME STACKING',
    'help.stackText': 'Putting the same release method in several slots empowers it: more and bigger homing orbs, wider and more numerous lances, extra meteor waves, larger burst radius with chained detonations, doubled arc jumps, bigger and longer fields, more and faster satellites, denser sigils. Overload mode tightens these caps by default to keep the frame rate; switch on <b>UNCAPPED</b> to lift the spawn budget, entity counts, recursion depth and damage scaling all at once.',
    'help.pairs': 'PAIRWISE TRIGGERS',
    'help.triples': 'THREE-WAY COMBINATIONS',
    'help.why': 'WHY IT WORKS THIS WAY',
    'help.whyText': 'Every “hit” is an event. All equipped release methods receive it and each decides whether to spawn something new. With Orb + Lance, an orb impact broadcasts a hit event, the lance picks it up and bursts into lances around the impact point — nobody hard-coded “split lance”, it grows on its own. Spawning is bounded by a <b>budget</b> and a <b>recursion depth</b>, so even absurd builds cannot blow the frame up.',
    'help.close': 'CLOSE',

    'dmg.kill': '✦ DOWN',
  },

  zh: {
    'brand.title': '魔 法 工 坊',
    'brand.sub': 'ARCANE FOUNDRY',

    'sec.complexity': '复杂度',
    'sec.complexityHint': '法阵槽位数',
    'sec.core': '法术核心',
    'sec.coreHint': '必选 1 个 · 决定全局',
    'sec.methods': '释放方式',
    'sec.methodsHint': '可重复 · 决定伤害形式',
    'sec.circle': '法阵',
    'sec.circleHint': '点击槽位可移除',
    'sec.overload': '过载核心模式',
    'sec.overloadHint': '30 槽位 · 无需点满',
    'sec.uncapped': '解除性能限制',
    'sec.uncappedHint': '放开预算与数量上限',

    'cx.1': '微末', 'cx.2': '初阶', 'cx.3': '中阶', 'cx.4': '高阶', 'cx.5': '禁咒',
    'cx.overload': '过载',

    'btn.craft': '✦ 合 成 ✦',
    'btn.crafted': '✦ 已 刻 印 ✦',
    'btn.random': '随机一套法术',
    'btn.help': '组合法则',
    'btn.clear': '清空法阵',
    'btn.hide': '隐藏面板',
    'btn.show': '显示面板',
    'btn.lang': '切换语言',
    'btn.sound': '音效开关',
    'btn.muted': '已静音 —— 点击开启',
    'chk.auto': '填满后自动刻印',

    'slots.core': '核心',
    'slots.method': '方式',
    'slots.empty': '空',

    'hud.none': '未 刻 印',
    'hud.idleSub': '在左侧面板合成一道法术',
    'hud.tag': '{core}核 · 复杂度 {n} · {tag}',
    'hud.tagOverload': '{core}核 · 过载 · {used} 个方式 · {tag}',

    'stats.castDmg': '本次伤害',
    'stats.peak': '峰值伤害',
    'stats.slain': '击倒',
    'stats.alive': '存活',
    'stats.casts': '施法次数',
    'stats.fps': 'FPS',

    'hint.idle': '<b>左键</b> 施法 · 先在左侧合成一道法术',
    'hint.idleTouch': '<b>轻点</b> 施法 · <b>拖动</b> 旋转视角 · 先在左侧合成一道法术',
    'hint.ready': '<b>左键点击场景</b> 释放“{name}”　·　<b>按住空格+拖动</b> 旋转视角　·　<b>滚轮</b> 缩放',
    'hint.touch': '<b>轻点</b> 释放“{name}”　·　<b>拖动</b> 旋转视角',

    'toast.full': '法阵已满（最多 {n} 个释放方式）',
    'toast.noSpell': '还没有刻印法术 —— 先在左侧合成一道',
    'toast.inscribed': '已刻印：{name}',
    'toast.needCore': '请先选择一个法术核心',
    'toast.needMethods': '释放方式槽位还有空缺',
    'toast.lang': '语言：中文',
    'toast.overloadOn': '已开启过载核心 —— 最多 30 槽位，随时可释放',
    'toast.overloadOff': '已关闭过载核心',
    'toast.uncappedOn': '已解除性能限制 —— 火力全开',
    'toast.uncappedOff': '已恢复性能限制',
    'toast.soundOn': '音效已开启',
    'toast.soundOff': '音效已静音',

    'res.sub': '{core}核 · {tag} · 复杂度 {n}',
    'res.subOverload': '{core}核 · {tag} · 过载（{used}/29 个方式）',
    'res.circle': '法阵',
    'res.none': '无（核心脉冲）',
    'res.core': '核心',
    'res.release': '释放',
    'res.syn': '组 合 法 则',
    'res.noSyn': '单一配置，没有额外的组合效果',
    'res.score': '威力 {n}',
    'res.stat': '伤害 ~{dmg} · 半径 {radius}',

    'line.orb': '抛出 {n} 颗光球',
    'line.beam': '{n} 道光矛贯穿',
    'line.barrage': '{w} 波 × {m} 颗陨星',
    'line.chain': '电弧跳跃 {n} 次',
    'line.field': '领域半径 ×{k}',
    'line.orbit': '{n} 颗环绕卫星',
    'line.rune': '{n} 枚延时符文',
    'line.burst': '爆裂半径 ×{k}',
    'line.pulse': '核心自行迸发能量',

    'help.title': '组 合 法 则',
    'help.intro': '法术 = <b>1 个法术核心</b>（决定全局）+ <b>若干释放方式</b>（决定如何造成伤害）。方式可以重复，重复即叠加；不同方式叠在一起会自动互相触发。',
    'help.ops': '操 作',
    'help.op1': '<b>左键点击场景</b> —— 直接向该位置释放法术（按住可连发）。落点在你按下的瞬间就锁定了。',
    'help.op2': '<b>按住空格 + 左键拖动</b> —— 旋转视角（中键拖动也可以）',
    'help.op3': '<b>滚轮</b> —— 缩放',
    'help.op4': '地面上的圆环是当前法术的爆裂半径预览',
    'help.op5': '<b>Enter</b> —— 合成 / 重新刻印 · <b>Esc</b> —— 关闭本页 · <b>H</b> —— 隐藏 / 显示面板',
    'help.opTouch': '触摸屏：<b>轻点</b>施法，<b>拖动</b>旋转视角。',
    'help.cores': '法 术 核 心（全局影响）',
    'help.methods': '释 放 方 式（决定伤害形式）',
    'help.stack': '同 名 叠 加',
    'help.stackText': '同一种释放方式占多个槽位时会强化自身：球体更多更大会追踪、射线更宽更多、轰击波次更多、爆裂半径与连锁更大、雷链跳数翻倍、领域更大更持久、卫星更多射速更快、符文更多更密。过载模式默认会收紧这些上限保证帧率；打开 <b>解除性能限制</b> 会一次性放开派生预算、实体数量、递归深度与数值缩放。',
    'help.pairs': '相 互 触 发（两两组合）',
    'help.triples': '三 连 组 合',
    'help.why': '为 什 么 会 这 样',
    'help.whyText': '每次「命中」都是一个事件：所有已装配的释放方式都会收到这个事件，并各自决定要不要派生新的效果。例如「球体＋射线」时，光球命中会广播一次命中事件，射线接管后便从落点向四周迸出光矛 —— 没人硬编码“分裂光矛”，它是自然长出来的。派生有<b>预算</b>与<b>递归深度</b>限制，所以再离谱的组合也不会把画面炸穿。',
    'help.close': '关 闭',

    'dmg.kill': '✦ 击倒',
  },
};

export const I18n = {
  lang: 'en',
  _listeners: [],

  /** 默认英语；浏览器语言是中文才切中文 */
  detect() {
    const saved = safeGet(STORE_KEY);
    if (saved && LANGS.includes(saved)) return saved;
    const list = (navigator.languages && navigator.languages.length)
      ? navigator.languages
      : [navigator.language || 'en'];
    for (const l of list) if (/^zh/i.test(l)) return 'zh';
    return 'en';
  },

  init() {
    this.lang = this.detect();
    this._apply();
    return this.lang;
  },

  set(lang, persist = true) {
    if (!LANGS.includes(lang) || lang === this.lang) return;
    this.lang = lang;
    if (persist) safeSet(STORE_KEY, lang);
    this._apply();
    for (const fn of this._listeners) { try { fn(lang); } catch { /* ignore */ } }
  },

  toggle() { this.set(this.lang === 'en' ? 'zh' : 'en'); },

  onChange(fn) { this._listeners.push(fn); },

  /** 取词：支持 {name} 占位符 */
  t(key, vars) {
    let s = DICT[this.lang]?.[key] ?? DICT.en[key] ?? key;
    if (vars) {
      for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(vars[k]);
    }
    return s;
  },

  /** 从 { zh, en } 对象里取当前语言 */
  L(obj) {
    if (obj == null) return '';
    if (typeof obj === 'string' || typeof obj === 'number') return obj;
    return obj[this.lang] ?? obj.en ?? obj.zh ?? '';
  },

  _apply() {
    document.documentElement.lang = this.lang === 'zh' ? 'zh-CN' : 'en';
    for (const el of document.querySelectorAll('[data-i18n]')) {
      el.textContent = this.t(el.dataset.i18n);
    }
    for (const el of document.querySelectorAll('[data-i18n-title]')) {
      el.title = this.t(el.dataset.i18nTitle);
    }
    for (const el of document.querySelectorAll('[data-i18n-html]')) {
      el.innerHTML = this.t(el.dataset.i18nHtml);
    }
  },
};

export const t = (k, v) => I18n.t(k, v);
export const L = o => I18n.L(o);

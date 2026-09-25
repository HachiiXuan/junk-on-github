import { CORE_LIST, coreName, coreTag, corePassive } from '../magic/cores.js';
import { METHOD_LIST, METHODS, methodName, methodTag, methodDesc, methodStack } from '../magic/methods.js';
import { compileSpell, describeSpell, SYNERGY_PAIRS, SYNERGY_TRIPLES } from '../magic/spell.js';
import { Engine } from '../magic/engine.js';
import { Stage } from '../render/stage.js';
import { Hud } from './hud.js';
import { I18n, t, L } from '../i18n.js';
import { Settings } from '../settings.js';
import { Audio } from '../audio.js';
import { hex, pick, randInt } from '../util.js';

const OVERLOAD_METHODS = 29;   // 30 个槽位 = 1 核心 + 29 方式
const OVERLOAD_SLOTS = 30;

function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch { /* 隐私模式忽略 */ }
  return null;
}

export const Panel = {
  state: {
    complexity: 3,
    overload: false,
    core: null,
    methods: [],
    spell: null,
    stale: true,
    auto: true,
    open: true,
  },
  el: {},

  init() {
    const $ = id => document.getElementById(id);
    Object.assign(this.el, {
      panel: $('panel'),
      showBtn: $('showPanelBtn'),
      langBtn: $('langBtn'),
      soundBtn: $('soundBtn'),
      hidePanelBtn: $('hidePanelBtn'),
      complexitySec: $('complexitySec'),
      complexityRow: $('complexityRow'),
      overloadChk: $('overloadChk'),
      uncappedSec: $('uncappedSec'),
      uncappedChk: $('uncappedChk'),
      coreRow: $('coreRow'),
      methodRow: $('methodRow'),
      slotRow: $('slotRow'),
      craftBtn: $('craftBtn'),
      randomBtn: $('randomBtn'),
      clearBtn: $('clearBtn'),
      helpBtn: $('helpBtn'),
      autoChk: $('autoChk'),
      result: $('result'),
      help: $('help'),
      helpBody: $('helpBody'),
      helpClose: $('helpClose'),
    });

    /* 恢复用户上次的选择；窄屏首次访问默认收起面板，先看到场景 */
    this.state.auto = store('mf.auto') !== '0';
    this.el.autoChk.checked = this.state.auto;
    const openSaved = store('mf.panel');
    this.state.open = openSaved === null ? (innerWidth > 900) : openSaved !== '0';

    I18n.init();
    this._buildComplexity();
    this._buildCores();
    this._buildMethods();
    this._buildHelp();
    this._bind();
    this.setPanelVisible(this.state.open, true);
    this.refresh();
    this._syncLangBtn();
    this._syncSoundBtn();

    return this;
  },

  /* ------------------------------------------------------------ 构建 */

  _buildComplexity() {
    this.el.complexityRow.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.complexity = i;
      b.innerHTML = `<span class="cnum">${i}</span><span class="sub" data-cx="${i}"></span>`;
      b.onclick = () => { Audio.ui('click'); this.setComplexity(i); };
      this.el.complexityRow.appendChild(b);
    }
  },

  _buildCores() {
    this.el.coreRow.innerHTML = '';
    for (const c of CORE_LIST) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.core = c.key;
      b.innerHTML = `<span class="dot" style="background:${hex(c.color)};color:${hex(c.color)}"></span><span class="cname"></span>`;
      b.onclick = () => { Audio.ui('click'); this.setCore(c.key); };
      this.el.coreRow.appendChild(b);
    }
    this._syncCoreLabels();
  },

  _syncCoreLabels() {
    for (const b of this.el.coreRow.children) {
      const c = CORE_LIST.find(x => x.key === b.dataset.core);
      b.querySelector('.cname').textContent = coreName(c);
      b.title = `${coreName(c)} · ${coreTag(c)}\n${corePassive(c)}`;
    }
  },

  _buildMethods() {
    this.el.methodRow.innerHTML = '';
    for (const m of METHOD_LIST) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.method = m.key;
      b.innerHTML = `<span class="dot" style="background:${hex(m.color)};color:${hex(m.color)}"></span><span class="cname"></span>`;
      b.onclick = () => { Audio.ui('click'); this.addMethod(m.key); };
      this.el.methodRow.appendChild(b);
    }
    this._syncMethodLabels();
  },

  _syncMethodLabels() {
    for (const b of this.el.methodRow.children) {
      const m = METHODS[b.dataset.method];
      b.querySelector('.cname').textContent = methodName(m);
      b.title = `${methodName(m)} · ${methodTag(m)}\n${methodDesc(m)}`;
    }
  },

  _buildHelp() {
    const coreRows = CORE_LIST.map(c =>
      `<div><i style="color:${hex(c.color)}">${coreName(c)}</i> · ${coreTag(c)}<br>${corePassive(c)}</div>`).join('');
    const methodRows = METHOD_LIST.map(m =>
      `<div><i style="color:${hex(m.color)}">${methodName(m)}</i> · ${methodTag(m)}<br>${methodDesc(m)}</div>`).join('');
    const pairRows = SYNERGY_PAIRS.map(p =>
      `<div><i style="color:${hex(METHODS[p.b].color)}">${methodName(METHODS[p.a])} + ${methodName(METHODS[p.b])}</i> → <b>${L(p.name)}</b><br>${L(p.desc)}</div>`).join('');
    const tripleRows = SYNERGY_TRIPLES.map(tr =>
      `<div><i style="color:#ffd166">${tr.keys.map(k => methodName(METHODS[k])).join(' + ')}</i> → <b>${L(tr.name)}</b><br>${L(tr.desc)}</div>`).join('');

    this.el.helpBody.innerHTML = `
      <h2>${t('help.title')}</h2>
      <p>${t('help.intro')}</p>

      <h3>${t('help.ops')}</h3>
      <ul>
        <li>${t('help.op1')}</li>
        <li>${t('help.op2')}</li>
        <li>${t('help.op3')}</li>
        <li>${t('help.op4')}</li>
        <li>${t('help.op5')}</li>
        <li>${t('help.opTouch')}</li>
      </ul>

      <h3>${t('help.cores')}</h3>
      <div class="kv">${coreRows}</div>

      <h3>${t('help.methods')}</h3>
      <div class="kv">${methodRows}</div>

      <h3>${t('help.stack')}</h3>
      <p>${t('help.stackText')}</p>

      <h3>${t('help.pairs')}</h3>
      <div class="kv">${pairRows}</div>

      <h3>${t('help.triples')}</h3>
      <div class="kv">${tripleRows}</div>

      <h3>${t('help.why')}</h3>
      <p>${t('help.whyText')}</p>
    `;
  },

  _bind() {
    this.el.craftBtn.onclick = () => this.craft(true);
    this.el.clearBtn.onclick = () => {
      Audio.ui('click');
      this.state.core = null;
      this.state.methods = [];
      this.state.spell = null;
      this.state.stale = true;
      this.applySpell(null);
      this.refresh();
    };
    this.el.randomBtn.onclick = () => { Audio.ui('click'); this.randomize(); };
    this.el.helpBtn.onclick = () => { Audio.ui('open'); this.el.help.classList.remove('hidden'); };
    this.el.helpClose.onclick = () => { Audio.ui('click'); this.el.help.classList.add('hidden'); };
    this.el.help.onclick = e => { if (e.target === this.el.help) this.el.help.classList.add('hidden'); };

    this.el.autoChk.onchange = () => {
      Audio.ui('toggle');
      this.state.auto = this.el.autoChk.checked;
      store('mf.auto', this.state.auto ? '1' : '0');
      this.refresh();
    };

    this.el.overloadChk.onchange = () => this.setOverload(this.el.overloadChk.checked);
    this.el.uncappedChk.onchange = () => this.setUncapped(this.el.uncappedChk.checked);
    this.el.langBtn.onclick = () => { Audio.ui('click'); I18n.toggle(); Hud.toast(t('toast.lang')); };
    this.el.soundBtn.onclick = () => this.toggleSound();
    this.el.hidePanelBtn.onclick = () => { Audio.ui('click'); this.setPanelVisible(false); };
    this.el.showBtn.onclick = () => { Audio.ui('open'); this.setPanelVisible(true); };

    /* 语言切换后需要重排所有由 JS 生成的文案 */
    I18n.onChange(() => this._onLangChange());

    addEventListener('keydown', e => {
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        this.el.help.classList.add('hidden');
        if (!this.el.craftBtn.disabled) this.craft(true);
      } else if (e.code === 'Escape') {
        this.el.help.classList.add('hidden');
      } else if (e.code === 'KeyH') {
        Audio.ui('click');
        this.setPanelVisible(!this.state.open);
      }
    });
  },

  /** 音效开关 */
  toggleSound() {
    const on = !Settings.sfx;
    Audio.setEnabled(on);
    this._syncSoundBtn();
    if (on) Audio.ui('toggle');
    Hud.toast(t(on ? 'toast.soundOn' : 'toast.soundOff'));
  },

  _syncSoundBtn() {
    const on = Settings.sfx;
    this.el.soundBtn.textContent = on ? '🔊' : '🔇';
    this.el.soundBtn.classList.toggle('off', !on);
    this.el.soundBtn.title = t(on ? 'btn.sound' : 'btn.muted');
  },

  _onLangChange() {
    this._syncLangBtn();
    this._syncSoundBtn();
    this._syncCoreLabels();
    this._syncMethodLabels();
    this._buildHelp();
    if (this.state.spell) {
      const sp = compileSpell(this.state.core, this.state.methods, { overload: this.state.overload });
      this.state.spell = sp;
      this.state.stale = false;
      this.applySpell(sp);
      this._renderResult(sp);
    }
    this.refresh();
  },

  _syncLangBtn() {
    /* 显示「点一下会切到哪种语言」 */
    this.el.langBtn.textContent = I18n.lang === 'en' ? '中' : 'EN';
    this.el.langBtn.classList.toggle('active', I18n.lang === 'zh');
  },

  /* ------------------------------------------------------------ 面板显隐 */

  setPanelVisible(v, silent) {
    this.state.open = !!v;
    this.el.panel.classList.toggle('hidden', !this.state.open);
    this.el.showBtn.classList.toggle('hidden', this.state.open);
    document.body.classList.toggle('panel-open', this.state.open);
    Stage.setPanelVisible(this.state.open);
    if (!silent) store('mf.panel', this.state.open ? '1' : '0');
  },

  /* ------------------------------------------------------------ 状态 */

  capacity() {
    return this.state.overload ? OVERLOAD_METHODS : Math.max(0, this.state.complexity - 1);
  },

  slotCount() {
    return this.state.overload ? OVERLOAD_SLOTS : this.state.complexity;
  },

  setComplexity(n) {
    if (this.state.overload) {
      this.state.overload = false;
      this.el.overloadChk.checked = false;
    }
    this.state.complexity = n;
    const cap = this.capacity();
    if (this.state.methods.length > cap) this.state.methods.length = cap;
    this.state.stale = true;
    this.refresh();
  },

  setOverload(on) {
    Audio.ui('toggle');
    this.state.overload = !!on;
    if (!this.state.overload) {
      const cap = this.capacity();
      if (this.state.methods.length > cap) this.state.methods.length = cap;
    }
    this.state.stale = true;
    this.refresh();
    Hud.toast(t(this.state.overload ? 'toast.overloadOn' : 'toast.overloadOff'));
  },

  /** 解除过载模式的性能限制（放开预算 / 数量 / 深度 / 数值） */
  setUncapped(on) {
    Audio.ui('toggle');
    Settings.set('uncapped', !!on);
    this.state.stale = true;
    this.refresh();
    Hud.toast(t(on ? 'toast.uncappedOn' : 'toast.uncappedOff'));
  },

  setCore(key) {
    this.state.core = this.state.core === key ? null : key;
    this.state.stale = true;
    this.refresh();
  },

  addMethod(key) {
    if (this.state.methods.length >= this.capacity()) {
      this._deny(key);
      return;
    }
    this.state.methods.push(key);
    this.state.stale = true;
    this.refresh();
  },

  removeAt(index) {
    if (index === 0) this.state.core = null;
    else this.state.methods.splice(index - 1, 1);
    this.state.stale = true;
    this.refresh();
  },

  _deny(key) {
    Audio.ui('deny');
    const chip = this.el.methodRow.querySelector(`[data-method="${key}"]`);
    if (chip) {
      chip.classList.remove('denied');
      void chip.offsetWidth;
      chip.classList.add('denied');
    }
    Hud.toast(t('toast.full', { n: this.capacity() }));
  },

  randomize() {
    this.state.core = pick(CORE_LIST).key;
    const cap = this.capacity();
    const count = this.state.overload ? randInt(4, 10) : cap;
    this.state.methods = [];
    for (let i = 0; i < count; i++) this.state.methods.push(pick(METHOD_LIST).key);
    this.state.stale = true;
    this.refresh();
    this.craft(false);
  },

  /* ------------------------------------------------------------ 合成 */

  isValid() {
    /* 过载模式：只要选了核心就能放，不必点满 */
    if (this.state.overload) return !!this.state.core;
    return !!this.state.core && this.state.methods.length === this.capacity();
  },

  craft(manual) {
    if (!this.isValid()) {
      if (manual) Hud.toast(t(this.state.core ? 'toast.needMethods' : 'toast.needCore'));
      return;
    }
    if (!this.state.stale && this.state.spell) return;

    const spell = compileSpell(this.state.core, this.state.methods, { overload: this.state.overload });
    this.state.spell = spell;
    this.state.stale = false;
    this.applySpell(spell);
    this._renderResult(spell);
    if (manual) {
      Audio.ui('craft');
      Hud.toast(t('toast.inscribed', { name: spell.name }));
    }
    this.el.craftBtn.blur();
    this.refresh();
  },

  applySpell(spell) {
    Engine.setSpell(spell);
    Hud.setSpell(spell);
    Hud.resetCastStats();
    Hud.peak = 0;
    if (!spell) {
      this.el.result.classList.remove('show');
      Hud.setHint(t(Hud.isTouch ? 'hint.idleTouch' : 'hint.idle'));
    } else if (Hud.isTouch) {
      Hud.setHint(t('hint.touch', { name: spell.name }));
    } else {
      Hud.setHint(t('hint.ready', { name: spell.name }));
    }
  },

  _renderResult(spell) {
    const d = describeSpell(spell);
    const core = d.core;
    const parts = d.parts.length
      ? d.parts.map(p => `<span style="color:${hex(p.color)}">${p.name}×${p.count}</span>`).join(' ＋ ')
      : `<span style="color:#6f6299">${t('res.none')}</span>`;

    const syn = d.synergies.length
      ? d.synergies.map(s => `<div class="syn" style="color:${hex(s.color)}">
            <b>${s.name}</b> <span>— ${s.desc}</span></div>`).join('')
      : `<div class="res-line" style="color:#6f6299">${t('res.noSyn')}</div>`;

    const sub = d.overload
      ? t('res.subOverload', { core: d.coreName, tag: d.coreTag, used: d.used })
      : t('res.sub', { core: d.coreName, tag: d.coreTag, n: d.complexity });

    this.el.result.innerHTML = `
      <div class="res-title" style="color:${hex(core.color)}">${d.name}</div>
      <div class="res-sub">${sub}</div>
      <div class="res-line">${t('res.circle')}：${parts}</div>
      <div class="res-line">${t('res.core')}：${d.corePassive}</div>
      <div class="res-line">${t('res.release')}：${d.lines.join(' · ')}</div>
      <div class="res-syn"><div class="t">${t('res.syn')}</div>${syn}</div>
      <div class="res-power">
        <span>${t('res.score', { n: d.score })}</span>
        <span>${t('res.stat', { dmg: d.damage, radius: d.radius.toFixed(1) })}</span>
      </div>
    `;
    this.el.result.classList.add('show');
  },

  /* ------------------------------------------------------------ 刷新 */

  refresh() {
    const st = this.state;

    /* 复杂度 */
    for (const b of this.el.complexityRow.children) {
      const n = +b.dataset.complexity;
      b.classList.toggle('active', !st.overload && n === st.complexity);
      const sub = b.querySelector('.sub');
      if (sub) sub.textContent = t('cx.' + n);
    }
    this.el.complexitySec.classList.toggle('dim', st.overload);
    this.el.overloadChk.checked = st.overload;
    /* 解除限制只在过载模式下才有意义 */
    this.el.uncappedSec.classList.toggle('off', !st.overload);
    this.el.uncappedChk.checked = Settings.uncapped;

    /* 核心 */
    for (const b of this.el.coreRow.children) {
      b.classList.toggle('active', st.core === b.dataset.core);
    }

    /* 释放方式计数 */
    const counts = {};
    for (const k of st.methods) counts[k] = (counts[k] || 0) + 1;
    for (const b of this.el.methodRow.children) {
      const k = b.dataset.method;
      const c = counts[k] || 0;
      b.classList.toggle('active', c > 0);
      b.querySelector('.cnt')?.remove();
      if (c > 0) {
        const sp = document.createElement('span');
        sp.className = 'cnt';
        sp.textContent = '×' + c;
        b.appendChild(sp);
      }
    }

    /* 槽位 */
    const slots = this.el.slotRow;
    slots.innerHTML = '';
    const total = this.slotCount();
    slots.classList.toggle('grid30', st.overload);

    const mkSlot = (i, entry) => {
      const d = document.createElement('div');
      d.className = 'slot';
      const tag = document.createElement('span');
      tag.className = 'k';
      tag.textContent = i === 0 ? t('slots.core') : t('slots.method');
      const label = document.createElement('span');
      label.className = 'v';

      if (entry) {
        d.classList.add('filled');
        d.style.borderColor = hex(entry.color);
        d.style.background = hex(entry.color) + '22';
        d.style.boxShadow = `0 0 16px ${hex(entry.color)}55, inset 0 0 12px ${hex(entry.color)}22`;
        label.textContent = entry.name;
        d.title = entry.name;
        d.onclick = () => this.removeAt(i);
      } else {
        label.textContent = t('slots.empty');
      }
      d.append(tag, label);
      return d;
    };

    if (st.core) {
      const c = CORE_LIST.find(x => x.key === st.core);
      slots.appendChild(mkSlot(0, { name: coreName(c), color: c.color }));
    } else {
      slots.appendChild(mkSlot(0, null));
    }
    for (let i = 1; i < total; i++) {
      const k = st.methods[i - 1];
      slots.appendChild(k ? mkSlot(i, { name: methodName(METHODS[k]), color: METHODS[k].color }) : mkSlot(i, null));
    }

    /* 已填满时自动刻印（过载模式只要选了核心就自动刻印，随时可释放） */
    if (st.auto && this.isValid() && st.stale) this.craft(false);

    /* 合成按钮 */
    const valid = this.isValid();
    const btn = this.el.craftBtn;
    if (!valid) {
      btn.disabled = true;
      btn.textContent = t('btn.craft');
      btn.classList.remove('pulse');
    } else if (st.stale) {
      btn.disabled = false;
      btn.textContent = t('btn.craft');
      btn.classList.add('pulse');
    } else {
      btn.disabled = true;
      btn.textContent = t('btn.crafted');
      btn.classList.remove('pulse');
    }

    if (!valid) {
      this.el.result.classList.remove('show');
      this.applySpell(null);
    }
  },
};

import { CORE_LIST } from '../magic/cores.js';
import { METHOD_LIST, METHODS } from '../magic/methods.js';
import { compileSpell, describeSpell, SYNERGY_PAIRS, SYNERGY_TRIPLES } from '../magic/spell.js';
import { Engine } from '../magic/engine.js';
import { Hud } from './hud.js';
import { hex, pick } from '../util.js';

const COMPLEXITY_NAMES = ['', '微末', '初阶', '中阶', '高阶', '禁咒'];

export const Panel = {
  state: {
    complexity: 3,
    core: null,
    methods: [],
    spell: null,
    stale: true,
    auto: true,
  },
  el: {},

  init() {
    const $ = id => document.getElementById(id);
    Object.assign(this.el, {
      complexityRow: $('complexityRow'),
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

    this._buildComplexity();
    this._buildCores();
    this._buildMethods();
    this._buildHelp();
    this._bind();
    this.refresh();
    return this;
  },

  /* ------------------------------------------------------------ 构建 */

  _buildComplexity() {
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.complexity = i;
      b.innerHTML = `${i}<span class="sub">${COMPLEXITY_NAMES[i]}</span>`;
      b.onclick = () => this.setComplexity(i);
      this.el.complexityRow.appendChild(b);
    }
  },

  _buildCores() {
    for (const c of CORE_LIST) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.core = c.key;
      b.title = `${c.name} · ${c.tag}\n${c.passive}`;
      b.innerHTML = `<span class="dot" style="background:${hex(c.color)};color:${hex(c.color)}"></span>${c.name}`;
      b.onclick = () => this.setCore(c.key);
      this.el.coreRow.appendChild(b);
    }
  },

  _buildMethods() {
    for (const m of METHOD_LIST) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.method = m.key;
      b.title = `${m.name} · ${m.tag}\n${m.desc}`;
      b.innerHTML = `<span class="dot" style="background:${hex(m.color)};color:${hex(m.color)}"></span>${m.name}`;
      b.onclick = () => this.addMethod(m.key);
      this.el.methodRow.appendChild(b);
    }
  },

  _buildHelp() {
    const coreRows = CORE_LIST.map(c =>
      `<div><i style="color:${hex(c.color)}">${c.name}</i> · ${c.tag}<br>${c.passive}</div>`).join('');
    const methodRows = METHOD_LIST.map(m =>
      `<div><i style="color:${hex(m.color)}">${m.name}</i> · ${m.tag}<br>${m.desc}</div>`).join('');
    const pairRows = SYNERGY_PAIRS.map(p =>
      `<div><i style="color:${hex(METHODS[p.b].color)}">${METHODS[p.a].name}＋${METHODS[p.b].name}</i> → <b>${p.name}</b><br>${p.desc}</div>`).join('');
    const tripleRows = SYNERGY_TRIPLES.map(t =>
      `<div><i style="color:#ffd166">${t.keys.map(k => METHODS[k].name).join('＋')}</i> → <b>${t.name}</b><br>${t.desc}</div>`).join('');

    this.el.helpBody.innerHTML = `
      <h2>组 合 法 则</h2>
      <p>法术 = <b>1 个法术核心</b>（决定全局）+ <b>若干释放方式</b>（决定如何造成伤害）。
      方式可以重复，重复即叠加；不同方式叠在一起会自动互相触发。</p>

      <h3>操 作</h3>
      <ul>
        <li><b>左键点击场景</b> —— 直接向该位置释放法术（按住可连发）</li>
        <li><b>按住空格 + 左键拖动</b> —— 旋转视角（中键拖动也可以）</li>
        <li><b>滚轮</b> —— 缩放</li>
        <li>地面上的圆环是当前法术的爆裂半径预览</li>
        <li><b>Enter</b> —— 合成 / 重新刻印；<b>Esc</b> —— 关闭本页</li>
      </ul>

      <h3>法 术 核 心（全局影响）</h3>
      <div class="kv">${coreRows}</div>

      <h3>释 放 方 式（决定伤害形式）</h3>
      <div class="kv">${methodRows}</div>

      <h3>同 名 叠 加</h3>
      <p>同一种释放方式占多个槽位时会强化自身：
      球体更多更大会追踪、射线更宽更多、轰击波次更多、爆裂半径与连锁更大、
      雷链跳数翻倍、领域更大更持久、卫星更多射速更快、符文更多更密。</p>

      <h3>相 互 触 发（两两组合）</h3>
      <div class="kv">${pairRows}</div>

      <h3>三 连 组 合</h3>
      <div class="kv">${tripleRows}</div>

      <h3>为 什 么 会 这 样</h3>
      <p>每次「命中」都是一个事件：所有已装配的释放方式都会收到这个事件，
      并各自决定要不要派生新的效果。例如「球体＋射线」时，光球命中会广播一次命中事件，
      射线接管后便从落点向四周迸出光矛——没人硬编码"分裂光矛"，它是自然长出来的。
      派生有<b>预算</b>与<b>递归深度</b>限制，所以再离谱的组合也不会把画面炸穿。</p>
    `;
  },

  _bind() {
    this.el.craftBtn.onclick = () => this.craft(true);
    this.el.clearBtn.onclick = () => {
      this.state.core = null;
      this.state.methods = [];
      this.state.spell = null;
      this.state.stale = true;
      this.applySpell(null);
      this.refresh();
    };
    this.el.randomBtn.onclick = () => this.randomize();
    this.el.helpBtn.onclick = () => this.el.help.classList.remove('hidden');
    this.el.helpClose.onclick = () => this.el.help.classList.add('hidden');
    this.el.help.onclick = e => { if (e.target === this.el.help) this.el.help.classList.add('hidden'); };
    this.el.autoChk.onchange = () => {
      this.state.auto = this.el.autoChk.checked;
      this.refresh();
    };
    addEventListener('keydown', e => {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        this.el.help.classList.add('hidden');
        if (!this.el.craftBtn.disabled) this.craft(true);
      }
      if (e.code === 'Escape') this.el.help.classList.add('hidden');
    });
  },

  /* ------------------------------------------------------------ 状态 */

  capacity() { return Math.max(0, this.state.complexity - 1); },

  setComplexity(n) {
    this.state.complexity = n;
    const cap = this.capacity();
    if (this.state.methods.length > cap) this.state.methods.length = cap;
    this.state.stale = true;
    this.refresh();
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
    const chip = this.el.methodRow.querySelector(`[data-method="${key}"]`);
    if (!chip) return;
    chip.classList.remove('denied');
    void chip.offsetWidth;
    chip.classList.add('denied');
    Hud.toast(`法阵已满（复杂度 ${this.state.complexity} → ${this.capacity()} 个释放方式）`);
  },

  randomize() {
    this.state.core = pick(CORE_LIST).key;
    const cap = this.capacity();
    this.state.methods = [];
    for (let i = 0; i < cap; i++) this.state.methods.push(pick(METHOD_LIST).key);
    this.state.stale = true;
    this.refresh();
    this.craft(false);
  },

  /* ------------------------------------------------------------ 合成 */

  isValid() {
    return !!this.state.core && this.state.methods.length === this.capacity();
  },

  craft(manual) {
    if (!this.isValid()) {
      if (manual) Hud.toast(this.state.core ? '释放方式槽位还有空缺' : '请先选择一个法术核心');
      return;
    }
    if (!this.state.stale && this.state.spell) return;

    const spell = compileSpell(this.state.core, this.state.methods);
    this.state.spell = spell;
    this.state.stale = false;
    this.applySpell(spell);
    this._renderResult(spell);
    if (manual) Hud.toast(`已刻印：${spell.name}`);
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
      Hud.setHint('<b>左键</b> 施法 · 先在左侧合成一道法术');
    } else {
      Hud.setHint(`<b>左键点击场景</b> 释放「${spell.name}」　·　<b>按住空格+拖动</b> 旋转视角　·　<b>滚轮</b> 缩放`);
    }
  },

  _renderResult(spell) {
    const d = describeSpell(spell);
    const core = d.core;
    const parts = d.parts.length
      ? d.parts.map(p => `<span style="color:${hex(p.color)}">${p.name}×${p.count}</span>`).join(' ＋ ')
      : '<span style="color:#6f6299">无（核心脉冲）</span>';

    const syn = d.synergies.length
      ? d.synergies.map(s => `<div class="syn" style="color:${hex(s.color)}">
            <b>${s.name}</b> <span>— ${s.desc}</span></div>`).join('')
      : '<div class="res-line" style="color:#6f6299">单一配置，没有额外的组合效果</div>';

    this.el.result.innerHTML = `
      <div class="res-title" style="color:${hex(core.color)}">${d.name}</div>
      <div class="res-sub">${core.name}核 · ${core.tag} · 复杂度 ${d.complexity} / 5</div>
      <div class="res-line">法阵：${parts}</div>
      <div class="res-line">核心：${core.passive}</div>
      <div class="res-line">释放：${d.lines.join(' · ')}</div>
      <div class="res-syn"><div class="t">组 合 法 则</div>${syn}</div>
      <div class="res-power">
        <span>威力 ${d.score}</span>
        <span>伤害 ~${d.damage} · 半径 ${d.radius.toFixed(1)}</span>
      </div>
    `;
    this.el.result.classList.add('show');
  },

  /* ------------------------------------------------------------ 刷新 */

  refresh() {
    const st = this.state;

    /* 复杂度 */
    for (const b of this.el.complexityRow.children) {
      b.classList.toggle('active', +b.dataset.complexity === st.complexity);
    }

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
    const total = st.complexity;
    for (let i = 0; i < total; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      if (i === 0) {
        if (st.core) {
          const c = CORE_LIST.find(x => x.key === st.core);
          d.classList.add('filled');
          d.style.borderColor = hex(c.color);
          d.style.background = hex(c.color) + '22';
          d.style.boxShadow = `0 0 16px ${hex(c.color)}55, inset 0 0 12px ${hex(c.color)}22`;
          d.innerHTML = `<span class="k">核心</span>${c.name}`;
          d.title = '点击移除';
          d.onclick = () => this.removeAt(0);
        } else {
          d.innerHTML = `<span class="k">核心</span>空`;
        }
      } else {
        const k = st.methods[i - 1];
        if (k) {
          const m = METHODS[k];
          d.classList.add('filled');
          d.style.borderColor = hex(m.color);
          d.style.background = hex(m.color) + '22';
          d.style.boxShadow = `0 0 16px ${hex(m.color)}55, inset 0 0 12px ${hex(m.color)}22`;
          d.innerHTML = `<span class="k">方式</span>${m.name}`;
          d.title = '点击移除';
          d.onclick = () => this.removeAt(i);
        } else {
          d.innerHTML = `<span class="k">方式</span>空`;
        }
      }
      slots.appendChild(d);
    }

    /* 已填满时自动刻印 */
    if (st.auto && this.isValid() && st.stale) this.craft(false);

    /* 合成按钮 */
    const valid = this.isValid();
    const btn = this.el.craftBtn;
    if (!valid) {
      btn.disabled = true;
      btn.textContent = '✦ 合 成 ✦';
      btn.classList.remove('pulse');
    } else if (st.stale) {
      btn.disabled = false;
      btn.textContent = '✦ 合 成 ✦';
      btn.classList.add('pulse');
    } else {
      btn.disabled = true;
      btn.textContent = '✦ 已 刻 印 ✦';
      btn.classList.remove('pulse');
    }

    if (!valid) {
      this.el.result.classList.remove('show');
      this.applySpell(null);
    }
  },
};

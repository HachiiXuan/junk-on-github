import * as THREE from '../../lib/three.module.js';
import { clamp, hex } from '../util.js';
import { Engine } from '../magic/engine.js';
import { CONFIG } from '../config.js';
import { glowMat, RING_FLAT, DISC_FLAT } from '../render/fx.js';
import { t } from '../i18n.js';
import { coreName, coreTag } from '../magic/cores.js';

const MAX_DMG = 56;

export const Hud = {
  el: {},
  /** 触摸设备：没有 hover 准星，轻点即为施法 */
  isTouch: (typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches)
    || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0),
  dmg: [],
  _cursor: { x: innerWidth / 2, y: innerHeight / 2 },
  _v: new THREE.Vector3(),
  _toastTimer: 0,
  castStats: { hits: 0, kills: 0, damage: 0 },
  totalKills: 0,
  peak: 0,

  init() {
    const $ = id => document.getElementById(id);
    this.el = {
      spellName: $('spellName'),
      spellTags: $('spellTags'),
      statDmg: $('statDmg'),
      statPeak: $('statPeak'),
      statKills: $('statKills'),
      statAlive: $('statAlive'),
      statCasts: $('statCasts'),
      statFps: $('statFps'),
      reticle: $('reticle'),
      dmgLayer: $('dmgLayer'),
      toast: $('toast'),
      hint: $('hint'),
    };

    addEventListener('pointermove', e => {
      this._cursor.x = e.clientX;
      this._cursor.y = e.clientY;
    });
    return this;
  },

  /** 场景中的落点预览圈 */
  buildScene(scene, camera) {
    this.camera = camera;
    const g = new THREE.Group();
    g.visible = false;

    this.previewRing = new THREE.Mesh(RING_FLAT, glowMat(0xffffff, 0.5));
    this.previewInner = new THREE.Mesh(RING_FLAT, glowMat(0xffffff, 0.28));
    this.previewDot = new THREE.Mesh(DISC_FLAT, glowMat(0xffffff, 0.5));
    this.previewDot.scale.setScalar(0.16);
    g.add(this.previewRing, this.previewInner, this.previewDot);
    scene.add(g);
    this.preview = g;
    return this;
  },

  setSpell(spell) {
    this.spell = spell;
    if (!spell) {
      this.el.spellName.textContent = t('hud.none');
      this.el.spellName.classList.add('empty');
      this.el.spellName.style.color = '';
      this.el.spellTags.textContent = t('hud.idleSub');
      this.preview.visible = false;
      return;
    }
    const c = spell.coreDef.color;
    this.el.spellName.textContent = spell.name;
    this.el.spellName.classList.remove('empty');
    this.el.spellName.style.color = hex(c);
    this.el.spellTags.textContent = spell.overload
      ? t('hud.tagOverload', { core: coreName(spell.coreDef), used: spell.methods.length, tag: coreTag(spell.coreDef) })
      : t('hud.tag', { core: coreName(spell.coreDef), n: spell.complexity, tag: coreTag(spell.coreDef) });
    this.preview.visible = true;
    for (const m of [this.previewRing, this.previewInner, this.previewDot]) m.material.color.setHex(c);
  },

  setCastStats(s) {
    this.castStats = s;
    this.peak = Math.max(this.peak, s.damage);
    this._refreshStats();
  },

  resetCastStats() {
    this.castStats = { hits: 0, kills: 0, damage: 0 };
    this._refreshStats();
  },

  _refreshStats() {
    const e = this.el;
    if (!e.statDmg) return;
    e.statDmg.textContent = Math.round(this.castStats.damage);
    e.statPeak.textContent = Math.round(this.peak);
  },

  tickStats(figures, fps, casts) {
    const e = this.el;
    if (!e.statDmg) return;
    e.statDmg.textContent = Math.round(this.castStats.damage);
    e.statPeak.textContent = Math.round(this.peak);
    e.statKills.textContent = figures.kills;
    e.statAlive.textContent = figures.aliveCount();
    e.statCasts.textContent = casts;
    e.statFps.textContent = fps.toFixed(0);
  },

  /** 世界坐标处弹出伤害数字 */
  addDamage(worldPos, amount, kind = 'hit') {
    if (this.dmg.length >= MAX_DMG) {
      const old = this.dmg.shift();
      old.el.remove();
    }
    const el = document.createElement('div');
    el.className = 'dmg' + (kind === 'kill' ? ' kill' : amount >= 55 ? ' crit' : '');
    el.textContent = kind === 'kill' ? t('dmg.kill') : Math.round(amount);
    const color = kind === 'kill' ? '#ffd166' : amount >= 55 ? '#ffb45c' : '#ffe9c0';
    el.style.color = color;
    this.el.dmgLayer.appendChild(el);

    const item = {
      el,
      pos: new THREE.Vector3(worldPos.x + (Math.random() - 0.5) * 0.4, worldPos.y + 0.9, worldPos.z),
      vy: kind === 'kill' ? 0.7 : 1.5 + Math.random() * 0.6,
      vx: (Math.random() - 0.5) * 0.5,
      t: 0,
      life: kind === 'kill' ? 1.4 : 0.95,
    };
    this.dmg.push(item);
  },

  toast(msg, dur = 1.6) {
    const e = this.el.toast;
    e.textContent = msg;
    e.classList.add('on');
    this._toastTimer = dur;
  },

  setHint(html) {
    if (this.el.hint) this.el.hint.innerHTML = html;
  },

  setReticleVisible(on) {
    this.el.reticle.classList.toggle('on', on);
  },

  update(dt, camera, spell) {
    /* 准星 */
    const r = this.el.reticle;
    r.style.left = this._cursor.x + 'px';
    r.style.top = this._cursor.y + 'px';

    const total = spell ? CONFIG.crystal.cooldown + 0.05 * spell.complexity : 0.3;
    const ready = clamp(1 - Engine.cooldown / total, 0, 1);
    r.style.setProperty('--cd', `${(1 - ready) * 360}deg`);
    r.classList.toggle('charging', Engine.cooldown > 0);

    /* 落点预览 */
    if (this.preview && this.preview.visible && spell) {
      const rad = spell.radiusAt(0);
      const t = performance.now() / 1000;
      this.previewRing.scale.set(rad, 1, rad);
      this.previewInner.scale.set(rad * 1.55, 1, rad * 1.55);
      this.previewRing.material.opacity = 0.45 + Math.sin(t * 3) * 0.12;
      this.previewInner.material.opacity = 0.18 + Math.sin(t * 2.2) * 0.07;
      this.previewInner.rotation.y += dt * 0.7;
      this.previewDot.material.opacity = 0.4 + Math.sin(t * 4) * 0.15;
    }

    /* 伤害数字 */
    for (let i = this.dmg.length - 1; i >= 0; i--) {
      const d = this.dmg[i];
      d.t += dt;
      if (d.t >= d.life) {
        d.el.remove();
        this.dmg.splice(i, 1);
        continue;
      }
      d.pos.y += d.vy * dt;
      d.pos.x += d.vx * dt;
      const k = d.t / d.life;

      this._v.copy(d.pos).project(camera);
      if (this._v.z > 1) { d.el.style.opacity = '0'; continue; }
      const x = (this._v.x * 0.5 + 0.5) * innerWidth;
      const y = (-this._v.y * 0.5 + 0.5) * innerHeight;
      const scale = 1 + k * 0.25;
      d.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${scale.toFixed(3)})`;
      d.el.style.opacity = String(clamp(1 - Math.pow(k, 2.2), 0, 1));
    }

    /* 提示气泡 */
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) this.el.toast.classList.remove('on');
    }
  },

  movePreview(point) {
    if (!this.preview) return;
    this.preview.position.set(point.x, 0.06, point.z);
  },
};

import * as THREE from '../../lib/three.module.js';
import { CONFIG } from '../config.js';
import { softParticleTexture, flareTexture, clamp, rand, TAU, mixHex, easeOutCubic, easeOutQuint } from '../util.js';

/* ============================================================
 *  特效调度器 —— 所有短命特效都注册成 fn(dt,time)=>done
 * ============================================================ */

const _effects = [];
let _scene = null;
let _clock = 0;

export const FX = {
  time: 0,
  scene: null,
  shakeOffset: new THREE.Vector3(),
  shakeRoll: 0,

  init(scene) {
    _scene = scene;
    FX.scene = scene;
    _sparks = new SparkPool(scene, CONFIG.quality.sparkBudget);
  },

  add(fn) { _effects.push(fn); return fn; },

  get count() { return _effects.length; },

  clear() {
    for (const e of _effects) e.dispose && e.dispose();
    _effects.length = 0;
    if (_sparks) _sparks.reset();
  },

  shake(amount) {
    _shake.amp = Math.min(1.6, _shake.amp + amount);
  },

  update(dt) {
    _clock += dt;
    FX.time = _clock;
    for (let i = _effects.length - 1; i >= 0; i--) {
      if (_effects[i](dt, _clock)) _effects.splice(i, 1);
    }
    if (_sparks) _sparks.update(dt);

    /* 屏幕震动衰减 */
    _shake.amp *= Math.pow(0.0016, dt);
    if (_shake.amp < 0.0008) _shake.amp = 0;
    const a = _shake.amp;
    FX.shakeOffset.set(rand(-a, a) * 0.55, rand(-a, a) * 0.4, rand(-a, a) * 0.55);
    FX.shakeRoll = rand(-a, a) * 0.02;
  },
};

const _shake = { amp: 0 };

/* ============================================================
 *  共享几何 / 材质工具
 * ============================================================ */

const SPHERE = new THREE.SphereGeometry(1, 18, 14);
const SPHERE_LO = new THREE.SphereGeometry(1, 10, 8);
const RING_FLAT = new THREE.RingGeometry(0.86, 1, 72);
RING_FLAT.rotateX(-Math.PI / 2);
const RING_UPRIGHT = new THREE.RingGeometry(0.9, 1, 64);
const DISC_FLAT = new THREE.CircleGeometry(1, 48);
DISC_FLAT.rotateX(-Math.PI / 2);
const PLANE = new THREE.PlaneGeometry(2, 2);
const SHARED = new Set([SPHERE, SPHERE_LO, RING_FLAT, RING_UPRIGHT, DISC_FLAT, PLANE]);

let _soft = null, _flare = null;
const softTex = () => (_soft ||= softParticleTexture());
const flareTex = () => (_flare ||= flareTexture(128));

export function disposeMesh(m) {
  if (!m) return;
  if (m.parent) m.parent.remove(m);
  m.traverse(o => {
    /* Sprite 共用同一份内置几何，绝不能被 dispose */
    if (o.geometry && !o.isSprite && !SHARED.has(o.geometry)) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const mat of mats) mat.dispose();
  });
}

/** 加法混合材质 */
export function glowMat(color, opacity = 1, map = null) {
  return new THREE.MeshBasicMaterial({
    color, map, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}

/** 自发光精灵（永远面向相机） */
export function sprite(color, size = 1, opacity = 1, map = null) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    color, map: map || softTex(), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
  }));
  sp.scale.setScalar(size);
  return sp;
}

/* ============================================================
 *  基础特效
 * ============================================================ */

/** 命中闪光：扩张的加法球 + 星芒 */
export function flash(pos, color, size = 1.2, dur = 0.3) {
  const core = new THREE.Mesh(SPHERE_LO, glowMat(mixHex(color, 0xffffff, 0.5), 1));
  core.position.copy(pos);
  const halo = sprite(color, size * 1.6, 0.95, flareTex());
  halo.position.copy(pos);
  _scene.add(core, halo);

  let t = 0;
  FX.add(dt => {
    t += dt;
    const k = clamp(t / dur, 0, 1);
    if (k >= 1) { disposeMesh(core); disposeMesh(halo); return true; }
    const s = size * (0.28 + easeOutQuint(k) * 1.5);
    core.scale.setScalar(s * 0.5);
    core.material.opacity = Math.pow(1 - k, 2.2);
    halo.scale.setScalar(size * (0.9 + easeOutCubic(k) * 0.7));
    halo.material.opacity = Math.pow(1 - k, 2.2) * 0.55;
    return false;
  });
}

/** 地面冲击波环（贴地扩张的环 + 尘埃） */
export function shockwave(pos, color, radius = 3, dur = 0.62, width = 0.14) {
  const m = new THREE.Mesh(RING_FLAT, glowMat(color, 0.9));
  m.position.set(pos.x, 0.07, pos.z);
  _scene.add(m);
  const dust = sprite(color, radius * 0.9, 0.5);
  dust.position.set(pos.x, 0.5, pos.z);
  dust.material.rotation = rand(Math.PI);
  _scene.add(dust);

  let t = 0;
  FX.add(dt => {
    t += dt;
    const k = clamp(t / dur, 0, 1);
    if (k >= 1) { disposeMesh(m); disposeMesh(dust); return true; }
    const e = easeOutQuint(k);
    const s = 0.25 + e * radius;
    m.scale.set(s, 1, s);
    m.material.opacity = 0.9 * Math.pow(1 - k, 1.7);
    dust.scale.set(radius * (0.6 + e * 1.2), radius * (0.4 + e * 0.7), 1);
    dust.material.opacity = 0.45 * (1 - k);
    return false;
  });
  /* 环形碎石火花 */
  sparksAlongRing(pos, radius, color, Math.round(8 + radius * 2.2));
}

/** 空中冲击环（默认近水平，带一点随机倾斜；也可传入 quat 指定朝向） */
export function airRing(pos, color, radius = 2.4, dur = 0.5, quat = null) {
  const m = new THREE.Mesh(RING_UPRIGHT, glowMat(color, 0.6));
  m.position.copy(pos);
  if (quat) m.quaternion.copy(quat);
  else m.rotation.set(-Math.PI / 2 + rand(-0.26, 0.26), 0, rand(-0.3, 0.3));
  m.scale.setScalar(0.2);
  _scene.add(m);
  let t = 0;
  FX.add(dt => {
    t += dt;
    const k = clamp(t / dur, 0, 1);
    if (k >= 1) { disposeMesh(m); return true; }
    const s = 0.2 + easeOutQuint(k) * radius;
    m.scale.set(s, s, s);
    m.material.opacity = 0.6 * Math.pow(1 - k, 2.2);
    return false;
  });
}

/** 爆裂球：向外膨胀的能量球 + 内层白热核 */
export function burstSphere(pos, color, radius = 3.2, dur = 0.55) {
  const outer = new THREE.Mesh(SPHERE, glowMat(color, 0.42));
  const inner = new THREE.Mesh(SPHERE_LO, glowMat(mixHex(color, 0xffffff, 0.45), 0.4));
  outer.position.copy(pos); inner.position.copy(pos);
  _scene.add(outer, inner);
  let t = 0;
  FX.add(dt => {
    t += dt;
    const k = clamp(t / dur, 0, 1);
    if (k >= 1) { disposeMesh(outer); disposeMesh(inner); return true; }
    const e = easeOutCubic(k);
    const s = 0.15 + e * radius;
    outer.scale.setScalar(s);
    outer.material.opacity = 0.42 * Math.pow(1 - k, 1.6);
    inner.scale.setScalar(s * 0.5);
    inner.material.opacity = 0.4 * Math.pow(1 - k, 3.4);
    return false;
  });
  airRing(pos, color, radius * 0.85, dur * 0.8);
}

/** 拖尾光点 */
export function trailDot(pos, color, size = 0.3, dur = 0.34, shrink = 0.7) {
  const m = new THREE.Mesh(SPHERE_LO, glowMat(color, 0.6));
  m.position.copy(pos);
  m.scale.setScalar(size);
  _scene.add(m);
  let t = 0;
  FX.add(dt => {
    t += dt;
    const k = clamp(t / dur, 0, 1);
    if (k >= 1) { disposeMesh(m); return true; }
    m.material.opacity = 0.6 * (1 - k);
    m.scale.setScalar(size * (1 - k * shrink));
    return false;
  });
}

/** 光矛 / 射线：锥形柱 + 白热内芯 + 落点星芒 */
export function beam(from, to, color, radius = 0.12, dur = 0.26, opt = {}) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  if (len < 0.02) return;
  dir.normalize();

  const outerGeo = new THREE.CylinderGeometry(radius * 0.22, radius, len, 10, 1, true);
  outerGeo.translate(0, len / 2, 0);
  const innerGeo = new THREE.CylinderGeometry(radius * 0.1, radius * 0.42, len, 6, 1, true);
  innerGeo.translate(0, len / 2, 0);

  const outer = new THREE.Mesh(outerGeo, glowMat(color, 0.95));
  const inner = new THREE.Mesh(innerGeo, glowMat(0xffffff, 0.9));
  for (const m of [outer, inner]) {
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    _scene.add(m);
  }
  const tip = sprite(color, radius * 8, 1, flareTex());
  tip.position.copy(to);
  _scene.add(tip);

  let t = 0;
  FX.add(dt => {
    t += dt;
    const k = clamp(t / dur, 0, 1);
    if (k >= 1) { disposeMesh(outer); disposeMesh(inner); disposeMesh(tip); return true; }
    const fade = Math.pow(1 - k, 1.6);
    outer.material.opacity = 0.95 * fade;
    inner.material.opacity = 0.9 * fade;
    const w = 1 + k * 0.8;
    outer.scale.set(w, 1, w);
    inner.scale.set(w, 1, w);
    tip.material.opacity = fade * (opt.tip ?? 1);
    tip.scale.setScalar(radius * 8 * (1 + k * 1.6));
    return false;
  });
  return { dir, len };
}

/** 锯齿闪电（管状折线），返回终点 */
export function lightning(from, to, color, opt = {}) {
  const { jag = 1.0, radius = 0.055, dur = 0.24, segments = 16 } = opt;
  const pts = [];
  const d = new THREE.Vector3().subVectors(to, from);
  const len = d.length();
  const side = new THREE.Vector3(1, 0, 0).cross(d).normalize();
  if (!isFinite(side.x)) side.set(0, 0, 1);
  const up = new THREE.Vector3().crossVectors(d, side).normalize();

  for (let i = 0; i <= segments; i++) {
    const k = i / segments;
    const p = new THREE.Vector3().lerpVectors(from, to, k);
    const env = Math.sin(k * Math.PI);
    const amp = len * 0.06 * jag * env;
    p.addScaledVector(side, rand(-amp, amp));
    p.addScaledVector(up, rand(-amp, amp));
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, segments, radius, 5, false);
  const m = new THREE.Mesh(geo, glowMat(color, 1));
  _scene.add(m);
  const core = new THREE.Mesh(geo, glowMat(0xffffff, 0.85));
  core.scale.setScalar(0.45);
  _scene.add(core);
  const end = sprite(color, radius * 26, 1, flareTex());
  end.position.copy(to);
  _scene.add(end);

  let t = 0;
  FX.add(dt => {
    t += dt;
    const k = clamp(t / dur, 0, 1);
    if (k >= 1) { disposeMesh(m); disposeMesh(core); disposeMesh(end); return true; }
    const f = Math.pow(1 - k, 1.4);
    /* 高频闪烁，像真的电弧 */
    const flick = 0.62 + 0.38 * Math.sin(k * 46 + t * 30);
    m.material.opacity = f * flick;
    core.material.opacity = f * flick * 0.85;
    end.material.opacity = f;
    end.scale.setScalar(radius * 26 * (1 + k * 2));
    return false;
  });
}

/* ============================================================
 *  火花粒子池
 * ============================================================ */

export function sparks(pos, count, color, opt = {}) {
  _sparks && _sparks.burst(pos, count, color, opt);
}

export function sparksAlongRing(pos, radius, color, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const p = new THREE.Vector3(pos.x + Math.cos(a) * radius * 0.8, 0.15, pos.z + Math.sin(a) * radius * 0.8);
    sparks(p, 2, color, {
      speed: rand(2, 7), up: rand(2, 6), size: rand(0.07, 0.16),
      life: rand(0.4, 0.9), gravity: 14,
    });
  }
}

export function sparkTrail(pos, color, size = 0.1, spread = 0.4, count = 2) {
  sparks(pos, count, color, {
    speed: spread, up: spread, size, life: rand(0.25, 0.55), gravity: -0.6, drag: 2.4,
  });
}

class SparkPool {
  constructor(scene, max) {
    this.max = max;
    this.cursor = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.base = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: softTex() },
        uPixelRatio: { value: 1 },
      },
      vertexShader: /* glsl */`
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float uPixelRatio;
        void main(){
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (420.0 / max(0.001, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          float a = texture2D(uMap, gl_PointCoord).a;
          float o = a * vAlpha;
          if (o < 0.004) discard;
          gl_FragColor = vec4(vColor * o, o);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });

    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.geo = g;
    for (let i = 0; i < max; i++) this.alpha[i] = 0;
  }

  burst(pos, count, color, opt = {}) {
    const {
      speed = 6, up = 3, size = 0.12, life = 0.7, gravity = 10, drag = 1.2, dir = null, spread = 1,
    } = opt;
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const i3 = idx * 3;
      this.pos[i3] = pos.x; this.pos[i3 + 1] = pos.y; this.pos[i3 + 2] = pos.z;

      let vx, vy, vz;
      if (dir) {
        vx = dir.x * speed + rand(-spread, spread) * speed * 0.4;
        vy = dir.y * speed + rand(-spread, spread) * speed * 0.4;
        vz = dir.z * speed + rand(-spread, spread) * speed * 0.4;
      } else {
        const a = Math.random() * Math.PI * 2;
        const e = Math.acos(rand(-1, 1));
        const s = Math.sin(e);
        vx = Math.cos(a) * s * speed;
        vy = Math.cos(e) * speed * 0.6 + up;
        vz = Math.sin(a) * s * speed;
      }
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
      this.base[idx] = size * rand(0.65, 1.5);
      this.size[idx] = this.base[idx];
      this.alpha[idx] = 1;
      this.maxLife[idx] = life * rand(0.7, 1.3);
      this.life[idx] = this.maxLife[idx];
      this.grav[idx] = gravity;
      this.drag[idx] = drag;
    }
  }

  reset() {
    for (let i = 0; i < this.max; i++) this.alpha[i] = 0;
    this.cursor = 0;
  }

  setPixelRatio(pr) { this.mat.uniforms.uPixelRatio.value = pr; }

  update(dt) {
    const { pos, vel, alpha, life, maxLife, grav, drag, size, base } = this;
    let active = false;
    for (let i = 0; i < this.max; i++) {
      if (alpha[i] <= 0) continue;
      active = true;
      const i3 = i * 3;
      life[i] -= dt;
      if (life[i] <= 0) { alpha[i] = 0; size[i] = 0; continue; }
      const d = Math.max(0, 1 - drag[i] * dt);
      vel[i3] *= d; vel[i3 + 2] *= d;
      vel[i3 + 1] = vel[i3 + 1] * d - grav[i] * dt;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.03) { pos[i3 + 1] = 0.03; vel[i3 + 1] *= -0.32; vel[i3] *= 0.6; vel[i3 + 2] *= 0.6; }
      const k = life[i] / maxLife[i];
      alpha[i] = Math.pow(k, 0.85);
      size[i] = base[i] * (0.35 + k * 0.75);
    }
    if (active) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aSize.needsUpdate = true;
      this.geo.attributes.aAlpha.needsUpdate = true;
      this.geo.attributes.aColor.needsUpdate = true;
    }
    this._active = active;
  }
}

let _sparks = null;

/* ============================================================
 *  充能汇聚粒子（水晶蓄力）
 * ============================================================ */

export function chargeGather(center, color, radius = 5, dur = 0.45, count = 26) {
  const group = new THREE.Group();
  const list = [];
  for (let i = 0; i < count; i++) {
    const sp = sprite(color, rand(0.25, 0.6), 0.9);
    const a = Math.random() * Math.PI * 2;
    const e = rand(-1, 1);
    const r = radius * rand(0.5, 1.2);
    const p0 = new THREE.Vector3(
      center.x + Math.cos(a) * Math.sqrt(1 - e * e) * r,
      center.y + e * r * 0.7,
      center.z + Math.sin(a) * Math.sqrt(1 - e * e) * r,
    );
    sp.position.copy(p0);
    group.add(sp);
    list.push({ sp, p0, delay: Math.random() * 0.35, dur: rand(0.25, 0.5) });
  }
  _scene.add(group);
  FX.add((dt, time) => {
    let alive = false;
    for (const it of list) {
      if (it.done) continue;
      it.delay -= dt;
      if (it.delay > 0) { alive = true; continue; }
      alive = true;
      it.t = (it.t || 0) + dt;
      const k = clamp(it.t / it.dur, 0, 1);
      const e = easeOutQuint(k);
      it.sp.position.lerpVectors(it.p0, center, e);
      it.sp.material.opacity = 0.9 * (1 - k * 0.35);
      if (k >= 1) { it.done = true; it.sp.material.opacity = 0; }
    }
    if (!alive) { disposeMesh(group); return true; }
    return false;
  });
}

/** 从中心向外喷发的光带（施法瞬间水晶的表现） */
export function castingFlare(center, color, radius = 1.6) {
  flash(center, color, radius * 0.85, 0.3);
  airRing(center, color, radius * 1.15, 0.38);
  sparks(center, 24, color, { speed: 9, up: 4, size: 0.16, life: 0.7, gravity: 3 });
  FX.shake(0.05);
}

export { SPHERE, SPHERE_LO, RING_FLAT, RING_UPRIGHT, DISC_FLAT, PLANE, softTex, flareTex };

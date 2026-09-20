import * as THREE from '../../lib/three.module.js';
import { CONFIG } from '../config.js';
import { rand, randInt, clamp, TAU, damp, mixHex, easeInQuad } from '../util.js';
import { glowMat, sparks } from '../render/fx.js';

const WHITE = new THREE.Color(0xffffff);
const _paintColor = new THREE.Color();

/* ============================================================
 *  共享几何
 * ============================================================ */
const GEO = {
  leg: new THREE.CapsuleGeometry(0.052, 0.28, 4, 8),
  arm: new THREE.CapsuleGeometry(0.044, 0.24, 4, 6),
  body: new THREE.CapsuleGeometry(0.165, 0.30, 6, 14),
  skirt: new THREE.ConeGeometry(0.33, 0.52, 14, 1, true),
  head: new THREE.SphereGeometry(0.152, 20, 14),
  hatCone: new THREE.ConeGeometry(0.215, 0.46, 14),
  hatBrim: new THREE.CylinderGeometry(0.33, 0.35, 0.035, 18),
  hood: new THREE.SphereGeometry(0.19, 16, 12, 0, TAU, 0, Math.PI * 0.62),
  staff: new THREE.CylinderGeometry(0.017, 0.021, 1.3, 6),
  orb: new THREE.SphereGeometry(0.075, 10, 8),
  barBg: new THREE.PlaneGeometry(1, 1),
  barFg: new THREE.PlaneGeometry(1, 1),
};

/* 面部贴图（共享一张即可） */
function faceTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f6e2cd';
  ctx.fillRect(0, 0, 128, 64);
  /* 眼睛 */
  ctx.fillStyle = '#2b2233';
  for (const x of [44, 84]) {
    ctx.beginPath();
    ctx.ellipse(x, 34, 6.5, 8.5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const x of [46, 86]) {
    ctx.beginPath();
    ctx.arc(x, 31, 2.2, 0, TAU);
    ctx.fill();
  }
  /* 腮红 */
  ctx.fillStyle = 'rgba(240,150,150,0.35)';
  for (const x of [30, 98]) {
    ctx.beginPath();
    ctx.ellipse(x, 45, 8, 5, 0, 0, TAU);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let _faceTex = null;

/* ============================================================
 *  状态效果
 * ============================================================ */
export const STATUS = {
  burn: { name: '灼烧', color: 0xff6a2a, dps: 14, dur: 3.2, tint: 0xff5a1e },
  wet: { name: '濡湿', color: 0x2fa8ff, slow: 0.45, dur: 4.5, tint: 0x2fa8ff, shockBonus: 1.3 },
  root: { name: '禁锢', color: 0xc98a3c, immobile: true, dur: 1.2, tint: 0xc98a3c },
  mark: { name: '圣印', color: 0xffe9a8, taken: 1.28, dur: 5, tint: 0xffe9a8 },
  curse: { name: '诅咒', color: 0xa24bff, taken: 1.45, dur: 6, tint: 0xa24bff },
  gust: { name: '卷扬', color: 0x5ef2c4, float: true, dur: 1.6, tint: 0x5ef2c4 },
  shock: { name: '麻痹', color: 0x8fd4ff, immobile: true, taken: 1.15, dur: 1.0, tint: 0x8fd4ff },
};

/* ============================================================
 *  小人
 * ============================================================ */
export const Figures = {
  list: [],
  kills: 0,
  totalDamage: 0,
  _scene: null,
  _field: CONFIG.arena.radius,

  build(scene) {
    this._scene = scene;
    _faceTex ||= faceTexture();
    const n = CONFIG.arena.figureCount;
    for (let i = 0; i < n; i++) this._make();
    return this;
  },

  _make() {
    const g = new THREE.Group();
    const hue = rand(0, 1);
    const robeBase = new THREE.Color().setHSL(hue, rand(0.35, 0.62), rand(0.42, 0.62));
    const accent = new THREE.Color().setHSL((hue + rand(0.15, 0.5)) % 1, 0.6, 0.68);

    const robeMat = new THREE.MeshStandardMaterial({
      color: robeBase, emissive: robeBase.clone().multiplyScalar(0.14),
      roughness: 0.62, metalness: 0.08,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: accent, emissive: accent.clone().multiplyScalar(0.2), roughness: 0.5, metalness: 0.15,
    });
    const skinMat = new THREE.MeshStandardMaterial({ map: _faceTex, roughness: 0.8, metalness: 0 });

    const bodyPivot = new THREE.Group();
    g.add(bodyPivot);

    /* 裙摆 */
    const skirt = new THREE.Mesh(GEO.skirt, robeMat);
    skirt.position.y = 0.30;
    bodyPivot.add(skirt);

    /* 躯干 */
    const body = new THREE.Mesh(GEO.body, robeMat);
    body.position.y = 0.66;
    if (CONFIG.quality.shadows) body.castShadow = true;
    bodyPivot.add(body);

    /* 头 */
    const headPivot = new THREE.Group();
    headPivot.position.y = 0.94;
    bodyPivot.add(headPivot);
    const head = new THREE.Mesh(GEO.head, skinMat);
    head.position.y = 0.13;
    if (CONFIG.quality.shadows) head.castShadow = true;
    headPivot.add(head);

    /* 头饰：3 种 */
    const hatKind = randInt(0, 2);
    if (hatKind === 0) {
      const brim = new THREE.Mesh(GEO.hatBrim, accentMat);
      brim.position.y = 0.24;
      const cone = new THREE.Mesh(GEO.hatCone, accentMat);
      cone.position.y = 0.44;
      headPivot.add(brim, cone);
    } else if (hatKind === 1) {
      const hood = new THREE.Mesh(GEO.hood, robeMat);
      hood.position.y = 0.14;
      hood.rotation.x = -0.15;
      headPivot.add(hood);
    } else {
      const hornGeo = new THREE.ConeGeometry(0.045, 0.17, 6);
      for (const sx of [-1, 1]) {
        const horn = new THREE.Mesh(hornGeo, accentMat);
        horn.position.set(sx * 0.1, 0.26, 0);
        horn.rotation.z = sx * 0.4;
        headPivot.add(horn);
      }
    }

    /* 手臂（髋/肩枢轴，便于摆动） */
    const mkArm = side => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.185, 0.80, 0);
      const arm = new THREE.Mesh(GEO.arm, robeMat);
      arm.position.y = -0.16;
      pivot.add(arm);
      const hand = new THREE.Mesh(GEO.orb, skinMat);
      hand.scale.setScalar(0.95);
      hand.position.y = -0.31;
      pivot.add(hand);
      bodyPivot.add(pivot);
      return pivot;
    };
    const armL = mkArm(-1);
    const armR = mkArm(1);

    /* 法杖 */
    let staffOrb = null;
    if (Math.random() < 0.62) {
      const staffPivot = new THREE.Group();
      staffPivot.position.set(0, -0.30, 0.02);
      const shaft = new THREE.Mesh(GEO.staff, accentMat);
      shaft.position.y = 0.30;
      shaft.rotation.z = 0.22;
      staffPivot.add(shaft);
      staffOrb = new THREE.Mesh(GEO.orb, new THREE.MeshStandardMaterial({
        color: accent, emissive: accent, emissiveIntensity: 1.9, roughness: 0.3,
      }));
      staffOrb.scale.setScalar(1.5);
      staffOrb.position.set(-Math.sin(0.22) * 0.65, 0.30 + Math.cos(0.22) * 0.65, 0.02);
      staffPivot.add(staffOrb);
      staffPivot.rotation.x = 0.12;
      armR.add(staffPivot);
      armR.rotation.x = -0.25;
    }

    /* 腿（髋枢轴） */
    const mkLeg = side => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.085, 0.36, 0);
      const leg = new THREE.Mesh(GEO.leg, accentMat);
      leg.position.y = -0.15;
      pivot.add(leg);
      g.add(pivot);
      return pivot;
    };
    const legL = mkLeg(-1);
    const legR = mkLeg(1);

    /* 血条（受伤后短暂显示；挂在场景上以便始终面向相机） */
    const bar = new THREE.Group();
    bar.visible = false;
    const barBg = new THREE.Mesh(GEO.barBg, new THREE.MeshBasicMaterial({
      color: 0x120c22, transparent: true, opacity: 0.75, depthWrite: false, depthTest: false,
    }));
    const barFg = new THREE.Mesh(GEO.barFg, new THREE.MeshBasicMaterial({
      color: 0xff5b7a, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false,
    }));
    barBg.scale.set(0.62, 0.075, 1);
    barFg.scale.set(0.58, 0.05, 1);
    barFg.position.z = 0.001;
    bar.add(barBg, barFg);
    bar.renderOrder = 20;
    this._scene.add(bar);

    /* 状态光环 */
    const statusRing = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.36, 24).rotateX(-Math.PI / 2),
      glowMat(0xffffff, 0.0),
    );
    statusRing.position.y = 0.035;
    g.add(statusRing);

    const scale = rand(0.86, 1.14);
    g.scale.setScalar(scale);

    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * this._field * 0.95;
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.rotation.y = Math.random() * TAU;
    this._scene.add(g);

    const f = {
      g, bodyPivot, headPivot, legL, legR, armL, armR, bar, barFg, statusRing,
      staffOrb, robeMat, accentMat, skinMat,
      hp: CONFIG.figure.maxHp, maxHp: CONFIG.figure.maxHp,
      speed: rand(0.75, 1.5) * (0.9 + scale * 0.1),
      scale,
      target: new THREE.Vector3(),
      knock: new THREE.Vector3(),
      hop: 0, hopV: 0, down: 0, flash: 0, flashColor: 0xffffff, flashOn: false,
      walk: Math.random() * 10,
      statuses: new Map(),
      alarm: 0,
      alertPos: new THREE.Vector3(),
      barTimer: 0,
      dead: false, respawn: 0, deathT: 0, deathDur: 0.34,
      phase: Math.random() * TAU,
      baseEmissive: robeBase.clone().multiplyScalar(0.14),
      accentEmissive: accent.clone().multiplyScalar(0.2),
      skinEmissive: new THREE.Color(0x000000),
    };
    this._pickTarget(f);
    this.list.push(f);
    return f;
  },

  _pickTarget(f) {
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * this._field * 0.92;
    f.target.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  },

  /* ------------------------------------------------------------------ */
  /** 计算某点半径内的存活小人 */
  inRadius(point, radius) {
    const out = [];
    for (const f of this.list) {
      if (f.dead) continue;
      const p = f.g.position;
      const d = Math.hypot(p.x - point.x, p.z - point.z);
      if (d <= radius) out.push({ f, d });
    }
    return out;
  },

  nearest(point, maxDist = 999, exclude = null) {
    let best = null, bd = maxDist * maxDist;
    for (const f of this.list) {
      if (f.dead || (exclude && exclude.has(f))) continue;
      const p = f.g.position;
      const dx = p.x - point.x, dz = p.z - point.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; best = f; }
    }
    return best;
  },

  aliveCount() {
    let n = 0;
    for (const f of this.list) if (!f.dead) n++;
    return n;
  },

  applyStatus(f, key, durMul = 1) {
    const def = STATUS[key];
    if (!def || f.dead) return;
    const cur = f.statuses.get(key);
    const t = (def.dur || 2) * durMul;
    f.statuses.set(key, { t: Math.max(cur ? cur.t : 0, t), tick: 0 });
  },

  /**
   * 范围伤害
   * @returns {{hits:number, kills:number, damage:number}}
   */
  hurt(point, radius, damage, opts = {}) {
    const {
      status = null, statusDur = 1, knock = 1, falloff = true, lift = 0,
      onHit = null, color = 0xffffff, minFactor = 0.35, source = null,
    } = opts;

    let hits = 0, kills = 0, total = 0;
    for (const f of this.list) {
      if (f.dead) continue;
      const p = f.g.position;
      const dx = p.x - point.x, dz = p.z - point.z;
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;

      const k = falloff ? clamp(1 - (d / radius) * 0.85, minFactor, 1) : 1;

      /* 受伤加成（圣印 / 诅咒 / 麻痹 / 濡湿 + 雷） */
      let mul = 1;
      for (const [key, st] of f.statuses) {
        if (st.t <= 0) continue;
        const def = STATUS[key];
        if (!def) continue;
        if (def.taken) mul *= def.taken;
        if (def.shockBonus && status === 'shock') mul *= def.shockBonus;
      }

      const dmg = damage * k * mul;
      f.hp -= dmg;
      total += dmg;
      hits++;

      if (status) this.applyStatus(f, status, statusDur);

      /* 击退 */
      const nx = d > 0.02 ? dx / d : rand(-1, 1);
      const nz = d > 0.02 ? dz / d : rand(-1, 1);
      const force = damage * 0.012 * knock * (0.5 + k);
      f.knock.x += nx * force * 12;
      f.knock.z += nz * force * 12;
      f.hopV += force * 9 + lift;
      f.down = Math.max(f.down, (1.4 * k + 0.4) * clamp(knock, 0.4, 2));
      f.flash = 1;
      f.flashColor = status === 'burn' ? STATUS.burn.color : color;
      f.barTimer = 3.2;
      this.totalDamage += dmg;

      /* 受惊 → 逃跑 */
      f.alarm = Math.max(f.alarm, 1.5 + Math.random());
      f.alertPos.set(point.x, 0, point.z);
      if (source) f.alertPos.copy(source);

      if (onHit) onHit(f, dmg, p);
    }

    for (const f of this.list) {
      if (!f.dead && f.hp <= 0) { this._kill(f, color); kills++; }
    }
    return { hits, kills, damage: total };
  },

  /**
   * 给整个人刷一层自发光（受击 / 倒下时用）。
   * 直接在原有材质上加白光，而不是往身上套一个光球。
   */
  _paint(f, amount, color, intensity = 1) {
    if (amount <= 0) {
      if (!f.flashOn) return;
      f.flashOn = false;
      f.robeMat.emissive.copy(f.baseEmissive);
      f.accentMat.emissive.copy(f.accentEmissive);
      f.skinMat.emissive.copy(f.skinEmissive);
      f.robeMat.emissiveIntensity = 1;
      f.accentMat.emissiveIntensity = 1;
      f.skinMat.emissiveIntensity = 1;
      return;
    }
    f.flashOn = true;
    const c = color.isColor ? color : _paintColor.setHex(color);
    f.robeMat.emissive.copy(f.baseEmissive).lerp(c, amount);
    f.accentMat.emissive.copy(f.accentEmissive).lerp(c, amount);
    f.skinMat.emissive.copy(f.skinEmissive).lerp(c, amount * 0.95);
    f.robeMat.emissiveIntensity = intensity;
    f.accentMat.emissiveIntensity = intensity;
    f.skinMat.emissiveIntensity = intensity;
  },

  _kill(f, color) {
    f.dead = true;
    f.hp = 0;
    f.respawn = CONFIG.figure.respawn;
    f.deathT = f.deathDur;
    const p = f.g.position.clone().setY(0.7);
    sparks(p, 24, mixHex(color, 0xffffff, 0.4), { speed: 7, up: 5, size: 0.17, life: 1.0, gravity: 9 });
    sparks(p, 12, f.robeMat.color.getHex(), { speed: 4, up: 3, size: 0.13, life: 0.9, gravity: 8 });
    this.kills++;
    f.bar.visible = false;
    f.statuses.clear();
    f.g.rotation.z = 0;
  },

  _respawn(f) {
    const a = Math.random() * TAU;
    const r = this._field * rand(0.93, 1.0);
    f.g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    f.hp = f.maxHp;
    f.dead = false;
    f.deathT = 0;
    f.knock.set(0, 0, 0);
    f.hop = 0; f.hopV = 0; f.down = 0; f.flash = 0;
    f.statuses.clear();
    this._paint(f, 0, WHITE, 0);
    f.g.visible = true;
    f.g.scale.setScalar(0.001);
    f.g.rotation.set(0, Math.random() * TAU, 0);
    this._pickTarget(f);
    sparks(f.g.position.clone().setY(0.5), 16, 0x9fe8ff, { speed: 3, up: 3, size: 0.12, life: 0.7, gravity: 4 });
  },

  /* ------------------------------------------------------------------ */
  update(dt, time) {
    const dampV = Math.pow(0.02, dt);

    for (const f of this.list) {
      if (f.dead) {
        /* 击倒动画：整个人覆上一层白光，迅速缩小消失（不套球体） */
        if (f.deathT > 0) {
          f.deathT -= dt;
          const k = clamp(1 - f.deathT / f.deathDur, 0, 1);
          this._paint(f, 1, WHITE, 1.7);
          const s = f.scale * (1 - easeInQuad(k)) + 0.001;
          f.g.scale.setScalar(s);
          if (f.deathT <= 0) {
            f.g.visible = false;
            f.g.scale.setScalar(0.001);
            this._paint(f, 0, WHITE, 0);
          }
        }
        f.respawn -= dt;
        if (f.respawn <= 0) this._respawn(f);
        continue;
      }
      const g = f.g;

      /* 出生放大 */
      if (g.scale.x < f.scale) {
        const s = Math.min(f.scale, g.scale.x + dt * f.scale * 4.5);
        g.scale.setScalar(s);
      }

      /* ------- 状态 ------- */
      let slow = 1, immobile = false, floating = false, dot = 0;
      let ringColor = null, ringAlpha = 0;
      for (const [key, st] of f.statuses) {
        st.t -= dt;
        const def = STATUS[key];
        if (!def) continue;
        if (def.slow) slow *= def.slow;
        if (def.immobile) immobile = true;
        if (def.float) floating = true;
        if (def.dps) dot += def.dps;
        if (st.t > 0 && def.color !== undefined) {
          ringColor = def.color;
          ringAlpha = clamp(st.t, 0, 1) * 0.75;
        }
      }
      for (const [key, st] of [...f.statuses]) if (st.t <= 0) f.statuses.delete(key);

      if (dot > 0) {
        f.hp -= dot * dt;
        this.totalDamage += dot * dt;
        f.flash = Math.max(f.flash, 0.35);
        f.flashColor = STATUS.burn.color;
        if (Math.random() < dt * 12) {
          sparks(g.position.clone().setY(rand(0.3, 1.1)), 1, STATUS.burn.color,
            { speed: 1.4, up: 2.4, size: 0.1, life: 0.55, gravity: -1.6, drag: 1.4 });
        }
        if (f.hp <= 0) { this._kill(f, STATUS.burn.color); continue; }
      }

      /* ------- 击退惯性 ------- */
      g.position.x += f.knock.x * dt;
      g.position.z += f.knock.z * dt;
      f.knock.multiplyScalar(dampV);

      /* ------- 垂直 ------- */
      f.hopV -= 26 * dt;
      f.hop += f.hopV * dt;
      if (f.hop < 0) { f.hop = 0; f.hopV = 0; }
      if (floating) f.hop = Math.max(f.hop, 0.7 + Math.sin(time * 3 + f.phase) * 0.2);

      /* ------- 边界 ------- */
      const rr = Math.hypot(g.position.x, g.position.z);
      if (rr > this._field) {
        g.position.x *= this._field / rr;
        g.position.z *= this._field / rr;
        f.knock.multiplyScalar(0.35);
        this._pickTarget(f);
      }

      /* ------- 行为 ------- */
      let bob = 0;
      const canMove = !immobile && f.down <= 0 && !floating;

      if (f.down > 0) {
        f.down -= dt;
        const k = damp(dt, 0.0006);
        g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, -1.25, k);
        g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, rand(-0.6, 0.6), k * 0.2);
        f.legL.rotation.x = THREE.MathUtils.lerp(f.legL.rotation.x, 0.9, k);
        f.legR.rotation.x = THREE.MathUtils.lerp(f.legR.rotation.x, -0.5, k);
      } else {
        const k = damp(dt, 0.0008);
        g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0, k);
        g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, 0, k);

        if (canMove) {
          /* 警报中 → 逃离冲击点 */
          if (f.alarm > 0) {
            f.alarm -= dt;
            const dx = g.position.x - f.alertPos.x;
            const dz = g.position.z - f.alertPos.z;
            const d = Math.hypot(dx, dz) || 1;
            f.target.set(
              clamp(g.position.x + (dx / d) * 4, -this._field, this._field), 0,
              clamp(g.position.z + (dz / d) * 4, -this._field, this._field),
            );
          }

          const dx = f.target.x - g.position.x, dz = f.target.z - g.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.6) {
            const nx = dx / dist, nz = dz / dist;
            const sp = f.speed * slow * (f.alarm > 0 ? 1.75 : 1);
            g.position.x += nx * sp * dt;
            g.position.z += nz * sp * dt;
            const want = Math.atan2(nx, nz);
            let diff = want - g.rotation.y;
            while (diff > Math.PI) diff -= TAU;
            while (diff < -Math.PI) diff += TAU;
            g.rotation.y += diff * Math.min(1, dt * 7);
            f.walk += dt * sp * 8.5;
            bob = Math.abs(Math.sin(f.walk)) * 0.05;
            f.legL.rotation.x = Math.sin(f.walk) * 0.62;
            f.legR.rotation.x = -Math.sin(f.walk) * 0.62;
            f.armL.rotation.x = -Math.sin(f.walk) * 0.42;
            if (!f.staffOrb) f.armR.rotation.x = Math.sin(f.walk) * 0.42;
          } else {
            /* 待在原地：轻微摇摆 */
            f.walk += dt * 1.2;
            const idle = Math.sin(f.walk * 0.9) * 0.08;
            f.legL.rotation.x = idle;
            f.legR.rotation.x = -idle;
            f.armL.rotation.x = idle * 0.6;
            if (Math.random() < dt * 0.35) this._pickTarget(f);
          }
        } else {
          f.legL.rotation.x = THREE.MathUtils.lerp(f.legL.rotation.x, 0.2, damp(dt, 0.01));
          f.legR.rotation.x = THREE.MathUtils.lerp(f.legR.rotation.x, -0.2, damp(dt, 0.01));
        }
      }

      /* 看向最近的骚动（受击 / 有法术时抬头） */
      if (f.alarm > 0) {
        f.headPivot.rotation.x = THREE.MathUtils.lerp(f.headPivot.rotation.x, -0.35, damp(dt, 0.02));
      } else {
        f.headPivot.rotation.x = THREE.MathUtils.lerp(f.headPivot.rotation.x, 0, damp(dt, 0.05));
      }
      f.headPivot.rotation.y = Math.sin(time * 0.7 + f.phase) * 0.12;

      g.position.y = f.hop + bob;

      /* ------- 受击闪光：整个人覆一层白光 ------- */
      if (f.flash > 0) {
        f.flash = Math.max(0, f.flash - dt * 2.6);
        this._paint(f, f.flash, f.flashColor, 1 + f.flash * 0.6);
      } else if (f.flashOn) {
        this._paint(f, 0, WHITE, 0);
      }

      /* ------- 状态光环 ------- */
      if (ringColor !== null) {
        f.statusRing.material.color.setHex(ringColor);
        f.statusRing.material.opacity = ringAlpha;
        f.statusRing.rotation.y += dt * 1.4;     // 贴地光环绕 Y 轴自转
        f.statusRing.scale.setScalar(1 + Math.sin(time * 4 + f.phase) * 0.08);
      } else if (f.statusRing.material.opacity > 0) {
        f.statusRing.material.opacity = Math.max(0, f.statusRing.material.opacity - dt * 2);
      }

      /* 法杖宝珠脉动 */
      if (f.staffOrb) {
        f.staffOrb.material.emissiveIntensity = 1.5 + Math.sin(time * 2.4 + f.phase) * 0.6 + f.flash * 3;
      }

      /* ------- 血条 ------- */
      f.barTimer = Math.max(0, f.barTimer - dt);
      const showBar = f.barTimer > 0 && f.hp < f.maxHp;
      f.bar.visible = showBar;
      if (showBar) {
        const ratio = clamp(f.hp / f.maxHp, 0, 1);
        f.barFg.scale.x = 0.58 * ratio;
        f.barFg.position.x = -0.29 * (1 - ratio);
        f.barFg.material.color.setHSL(0.02 + ratio * 0.32, 0.85, 0.58);
        f.bar.position.set(g.position.x, f.hop + 1.62 * f.scale, g.position.z);
        f.bar.quaternion.copy(this._cam.quaternion);
        const d = f.bar.position.distanceTo(this._cam.position);
        f.bar.scale.setScalar(clamp(d * 0.028, 0.5, 1.8));
      }
    }
  },

  setCamera(cam) { this._cam = cam; },
};

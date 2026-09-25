import * as THREE from '../../lib/three.module.js';
import { rand, clamp, TAU, mixHex, easeOutQuint } from '../util.js';
import {
  FX, flash, shockwave, airRing, burstSphere, beam as beamFx, lightning, trailDot,
  sparks, sparkTrail, sprite, glowMat, disposeMesh, SPHERE_LO, DISC_FLAT, flareTex, chargeGather,
} from '../render/fx.js';
import { runeTexture, meteorTexture } from '../render/textures.js';
import { Figures } from '../world/figures.js';
import { capOf } from './methods.js';
import { Settings } from '../settings.js';
import { Audio } from '../audio.js';

/** 默认封顶；解除性能限制时按原值返回。
 *  普通模式下每种方式最多 4 个、都低于各自上限，所以这里放开不会影响普通玩法。 */
const capIf = (v, cap) => (Settings.uncapped ? v : Math.min(v, cap));

/* 只在同步流程里使用的临时向量。任何会被延迟闭包读到的向量都必须各自 clone，
   否则会被这期间运行的其它法术覆盖。 */
const _a = new THREE.Vector3();

/* ---------------------------------------------------------------- 工具 */

/** 点到线段（XZ 平面）的最短距离 */
function distXZ(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** 延迟执行（挂在特效循环上，随页面暂停自动停） */
export function later(sec, fn) {
  let t = 0;
  FX.add(dt => {
    t += dt;
    if (t >= sec) { fn(); return true; }
    return false;
  });
}

/* ---------------------------------------------------------------- 投射物 */

function launchProjectile(opts) {
  const {
    from, to, color, size = 0.3, speed = 18, arc = 0,
    homing = null, onHit, spin = 8, trail = true, lifetime = 6,
  } = opts;

  const scene = FX.scene;
  const g = new THREE.Group();
  const core = new THREE.Mesh(SPHERE_LO, glowMat(0xffffff, 1));
  core.scale.setScalar(size * 0.6);
  const halo = sprite(color, size * 7, 0.9, flareTex());
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(size * 1.35, size * 0.09, 6, 22),
    glowMat(color, 0.85),
  );
  ring.rotation.x = Math.PI / 2;
  g.add(core, halo, ring);
  g.position.copy(from);
  scene.add(g);

  const p0 = from.clone();
  const p1 = to.clone();
  let travelled = 0, age = 0, alive = true;

  FX.add(dt => {
    age += dt;
    if (alive && homing && !homing.dead) p1.copy(homing.g.position).setY(0.62);

    const total = Math.max(0.001, p0.distanceTo(p1));
    travelled += speed * dt;
    const k = clamp(travelled / total, 0, 1);

    _a.lerpVectors(p0, p1, k);
    _a.y += Math.sin(k * Math.PI) * arc;
    g.position.copy(_a);
    g.rotation.y += dt * spin;
    g.rotation.x += dt * spin * 0.6;
    ring.rotation.z += dt * spin * 2;

    if (trail && age > 0.016) {
      age = 0;
      sparkTrail(_a, color, size * 0.6, 0.5, 2);
      trailDot(_a, color, size * 0.5, 0.26);
    }

    const done = k >= 1 || travelled / speed > lifetime;
    if (done && alive) {
      alive = false;
      disposeMesh(g);
      onHit && onHit(_a.clone());
      return true;
    }
    return false;
  });
}

/* ---------------------------------------------------------------- 球体 */

export function deliverOrbs(ctx, target, n) {
  n = capOf('orb', n);
  const origin = ctx.origin;
  const core = ctx.core;
  /* 层数越多，落点附近铺开的范围越大（有上限，免得丢到场地外面去）。
     体积 / 弹速 / 弧度同样封一下，不然 29 颗会变成一坨巨型流星。 */
  const spread = n > 1 ? Math.min(1.2 + n * 0.30, 6.0) : 0;
  const speed = 15 * core.speed * (1 + 0.05 * Math.min(n, 12));
  const size = 0.26 + Math.min(n, 10) * 0.05;
  const arc = 3.0 + Math.min(n, 10) * 0.15;
  const VOL = 2;   // 每次齐射 2 颗

  /* 为每颗球找一个不同的目标 */
  const pool = Figures.list
    .filter(f => !f.dead && f.g.position.distanceTo(target) < 11)
    .sort((a, b) => a.g.position.distanceTo(target) - b.g.position.distanceTo(target));

  for (let i = 0; i < n; i++) {
    if (!ctx.spend()) break;
    const ang = (i / n) * TAU + rand(-0.3, 0.3);
    const tgt = target.clone().add(new THREE.Vector3(Math.cos(ang) * spread, 0, Math.sin(ang) * spread));
    const homing = pool[i % Math.max(1, pool.length)] || null;
    later(Math.floor(i / VOL) * 0.075 + (i % VOL) * 0.03, () => {
      launchProjectile({
        from: origin.clone(),
        to: tgt,
        color: ctx.colors.orb,
        size, speed, arc,
        homing: n >= 2 ? homing : null,
        onHit: p => {
          flash(p, ctx.colors.core, size * 4.5, 0.24);
          sparks(p, 8, ctx.colors.orb, { speed: 5, up: 2, size: 0.12, life: 0.5, gravity: 8 });
          ctx.impact(p, 0, true);
        },
      });
    });
  }
}

/* ---------------------------------------------------------------- 射线 */

export function fireBeams(ctx, target, n) {
  n = capOf('beam', n);
  const origin = ctx.origin;
  const core = ctx.core;
  const PER_VOLLEY = 3;
  const volleys = Math.max(1, Math.ceil(n / PER_VOLLEY));

  /* 全部打向落点本身，只在落点周围散开：层数越多 → 覆盖范围越大 + 齐射轮次越多，
     而不是排成一条横扫全场的扇形。
     注意这里必须用独立的 Vector3：延迟发射的闭包是之后才读值的，
     用模块级共享临时向量会被这期间其它法术覆盖（表现为后半段射线射歪/射没了）。 */
  const flat = new THREE.Vector3(target.x - origin.x, 0, target.z - origin.z);
  if (flat.lengthSq() < 1e-4) flat.set(0, 0, 1);   // 从正上方打时方向退化，兜底
  flat.normalize();
  const right = new THREE.Vector3(-flat.z, 0, flat.x);

  const spread = volleys > 1 ? Math.min(0.7 + 0.22 * n, 6.5) : 0;
  const width = (0.5 + 0.10 * Math.min(n, 12)) * core.radius;
  const dmg = ctx.damageAt(0) * 0.85;

  /* 每一轮齐射一个落点，先算好（用的是新对象，不共享） */
  const spots = [];
  for (let v = 0; v < volleys; v++) {
    const a = Math.random() * TAU;
    const r = spread > 0 ? Math.sqrt(Math.random()) * spread : 0;
    spots.push(target.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)));
  }

  for (let i = 0; i < n; i++) {
    if (!ctx.spend()) break;
    const volley = Math.floor(i / PER_VOLLEY);
    const slot = i % PER_VOLLEY;
    later(volley * 0.085 + slot * 0.02, () => {
      const to = spots[volley].clone();
      const from = origin.clone().addScaledVector(right, (slot - 1) * width * 1.1);

      /* 视觉：主光矛 + 细的伴生光线 */
      beamFx(from, to, ctx.colors.beam, width * 0.34, 0.3);
      Audio.beam(core.key);
      if (slot !== 1) {
        beamFx(from.clone().addScaledVector(right, width * 0.4),
          to.clone().addScaledVector(right, width * 0.7),
          ctx.colors.core, width * 0.11, 0.22);
      }

      /* 贯穿：路径上的所有目标 */
      const hits = [];
      for (const f of Figures.list) {
        if (f.dead) continue;
        const p = f.g.position;
        if (distXZ(p.x, p.z, from.x, from.z, to.x, to.z) <= width) hits.push(f);
      }
      if (hits.length) {
        for (const f of hits) {
          const hp = f.g.position.clone().setY(0.75);
          flash(hp, ctx.colors.core, 1.0, 0.22);
          sparks(hp, 6, ctx.colors.beam, { speed: 4, up: 2, size: 0.1, life: 0.4, gravity: 6 });
        }
        ctx.hurt(to, width + 1.2, dmg, {
          status: ctx.core.status, knock: 0.6, color: ctx.colors.core, onHit: ctx.onHit,
        });
      } else {
        sparks(to, 8, ctx.colors.beam, { speed: 5, up: 2.5, size: 0.12, life: 0.45, gravity: 9 });
      }
      ctx.impact(to, 0, true);
    });
  }
}

/* ---------------------------------------------------------------- 轰击 */

function makeMeteor(size, color) {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(size, 0),
    new THREE.MeshStandardMaterial({
      map: meteorTexture(Math.random() * 100 | 0),
      color: 0x6b5a55, emissive: color, emissiveIntensity: 0.55,
      roughness: 0.95, metalness: 0.1, flatShading: true,
    }),
  );
  const glow = sprite(color, size * 7, 0.9, flareTex());
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(size * 1.7, size * 0.1, 6, 18),
    glowMat(color, 0.7),
  );
  ring.rotation.x = Math.PI / 2;
  g.add(rock, glow, ring);
  return { g, ring };
}

export function callMeteors(ctx, target, waves, perWave, depth, spread = 3.6) {
  waves = capOf('barrage', waves);
  perWave = capIf(perWave, 4);
  /* 散布半径必须封顶：层数一多，按线性算会散到 25 单位开外
     （场地半径只有 15.5），陨星全砸在场地外面，表现就是"打到后半段没伤害"。 */
  spread = Math.min(spread, 9.5);
  const color = ctx.colors.barrage;
  const size = 0.32 + 0.06 * Math.min(waves, 8);

  /* 一次性把预算预约掉。
     原来的写法是"延迟到落地前才 spend"，后半段的陨星要生成时预算早被前面的
     命中派生吃光了，表现就是"前半段满天陨石、后半段不掉了"。 */
  const want = waves * perWave;
  let reserved = 0;
  for (let k = 0; k < want; k++) {
    if (!ctx.spend()) break;
    reserved++;
  }
  if (reserved <= 0) return;

  for (let idx = 0; idx < reserved; idx++) {
    const w = Math.floor(idx / perWave);
    const i = idx % perWave;
    const p = target.clone().add(new THREE.Vector3(
      rand(-spread, spread), 0, rand(-spread, spread),
    ));
    const startH = 19 + rand(0, 5);
    later(0.12 + w * 0.26 + i * 0.06, () => {
        const { g, ring } = makeMeteor(size, color);
        Audio.meteor(size);
        const start = p.clone().setY(startH);
        g.position.copy(start);
        FX.scene.add(g);

        const dur = 0.42;
        let t = 0;
        /* 预警圈 */
        const warn = new THREE.Mesh(DISC_FLAT, glowMat(color, 0.35));
        warn.scale.setScalar(1.6);
        warn.position.set(p.x, 0.06, p.z);
        FX.scene.add(warn);

        FX.add(dt => {
          t += dt;
          const k = clamp(t / dur, 0, 1);
          const e = k * k;
          g.position.set(
            start.x + (p.x - start.x) * e,
            start.y + (p.y - start.y) * e,
            start.z + (p.z - start.z) * e,
          );
          g.rotation.x += dt * 4;
          g.rotation.y += dt * 2.5;
          ring.rotation.z += dt * 9;
          warn.material.opacity = 0.35 * (1 - k) + 0.1;
          warn.scale.setScalar(1.6 + k * 1.4);
          if (Math.random() < 0.7) sparkTrail(g.position, color, 0.16, 0.7, 2);

          if (k >= 1) {
            disposeMesh(g); disposeMesh(warn);
            ctx.impact(p, depth, true);
            return true;
          }
          return false;
        });
    });
  }
}

/* ---------------------------------------------------------------- 爆裂 */

export function detonateBurst(ctx, point, count, depth) {
  count = capOf('burst', count);
  const radius = ctx.radiusAt(depth);
  burstSphere(point, ctx.colors.core, radius * 0.62, 0.45);
  airRing(point.clone().setY(0.5), ctx.colors.burst, radius * 1.0, 0.42);
  shocksFor(ctx, point, radius);
  FX.shake(0.05 * clamp(count, 1, 4) + 0.03);

  /* 连锁引爆：在爆心周围再炸 count-1 次 */
  const chainN = capIf(count - 1, 6);
  for (let i = 0; i < chainN; i++) {
    if (!ctx.spend()) return;
    const a = Math.random() * TAU;
    const r = radius * rand(0.7, 1.7);
    const p = point.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    later(0.11 + i * 0.08, () => {
      ctx.impact(p, depth + 1, true);
    });
  }
}

function shocksFor(ctx, point, radius) {
  shockwave(point, ctx.colors.core, radius * 1.15, 0.6);
  shockwave(point, ctx.colors.burst, radius * 1.7, 0.75);
}

/* ---------------------------------------------------------------- 雷链 */

export function arcChain(ctx, point, count, depth) {
  count = capOf('chain', count);
  const color = ctx.colors.chain;
  const jumps = 1 + 2 * count + (ctx.core.key === 'thunder' ? 1 : 0);
  const maxDist = 6.5 + (count - 1) * 2.3;
  const dmg = ctx.damageAt(depth) * 0.55;
  const visited = new Set();
  Audio.chain(jumps);

  let cursor = point.clone().setY(0.8);
  for (let i = 0; i < jumps; i++) {
    if (!ctx.spend()) break;
    const fig = Figures.nearest(cursor, maxDist, visited);
    if (!fig) break;
    visited.add(fig);
    const to = fig.g.position.clone().setY(0.8);
    /* 每个电弧要有自己的起点：cursor 是会被下一轮改写的变量，
       直接闭包引用的话所有电弧最后都从同一个点发出。 */
    const src = cursor.clone();

    later(i * 0.06, () => {
      lightning(src, to, color, { jag: 1.1, radius: 0.06 + count * 0.012, dur: 0.22, segments: 14 });
      flash(to, mixHex(color, 0xffffff, 0.4), 1.1, 0.24);
      ctx.hurt(to, 1.9, dmg, {
        status: ctx.core.status, knock: 0.5, color, onHit: ctx.onHit,
      });
      sparks(to, 8, color, { speed: 6, up: 3, size: 0.12, life: 0.45, gravity: 6 });
    });
    cursor = to;
  }
}

/* ---------------------------------------------------------------- 领域 */

export function placeField(ctx, point, count) {
  count = capOf('field', count);
  const core = ctx.core;
  const color = ctx.colors.field;
  /* 锁死落点：point 可能来自调用方的复用向量 */
  const center = point.clone();
  const radius = 3.0 * core.radius * (1 + 0.26 * (count - 1));
  const dur = 4 + 1.6 * count;
  const interval = 0.55 / (1 + 0.2 * (count - 1));
  const dmg = ctx.damageAt(0) * 0.26 * (1 + 0.12 * count);

  const scene = FX.scene;
  const grp = new THREE.Group();
  grp.position.set(center.x, 0.05, center.z);

  const tex = runeTexture('#' + color.toString(16).padStart(6, '0'), 3, Math.random() * 999 | 0, 512, 20);
  const disc = new THREE.Mesh(DISC_FLAT, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  disc.scale.setScalar(radius);
  grp.add(disc);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI * 0.5),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  dome.scale.set(radius, radius * 0.75, radius);
  grp.add(dome);

  const rimGeo = new THREE.RingGeometry(radius * 0.93, radius, 72);
  rimGeo.rotateX(-Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, glowMat(color, 0.8));
  grp.add(rim);

  scene.add(grp);
  Audio.field(core.key, dur);

  let t = 0, tick = interval, retract = 0;
  FX.add(dt => {
    t += dt;
    const left = dur - t;
    if (left <= 0) { disposeMesh(grp); return true; }

    const fadeIn = clamp(t / 0.25, 0, 1);
    const fadeOut = clamp(left / 0.6, 0, 1);
    const alpha = fadeIn * fadeOut;
    const grow = easeOutQuint(clamp(t / 0.3, 0, 1));
    disc.scale.setScalar(radius * (0.3 + grow * 0.7));
    disc.rotation.y -= dt * 0.5;
    disc.material.opacity = 0.5 * alpha;

    const pulse = 1 + Math.sin(t * 5.5) * 0.05 + retract * 0.4;
    dome.scale.set(radius * pulse, radius * 0.72 * pulse, radius * pulse);
    dome.material.opacity = 0.1 * alpha + retract * 0.22;
    rim.material.opacity = (0.55 + 0.3 * Math.sin(t * 4)) * alpha;
    rim.rotation.y += dt * 0.8;

    /* 上升的能量尘 */
    if (Math.random() < dt * 26) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * radius;
      sparks(new THREE.Vector3(center.x + Math.cos(a) * r, 0.06, center.z + Math.sin(a) * r), 1, color,
        { speed: 0.3, up: rand(2.4, 4.6), size: rand(0.08, 0.16), life: rand(0.5, 1.0), gravity: -2.2, drag: 0.5 });
    }

    retract = Math.max(0, retract - dt * 3);

    /* 周期性伤害 + 牵引 */
    tick -= dt;
    if (tick <= 0 && t > 0.2) {
      tick = interval;
      retract = 1;
      const res = ctx.hurt(center, radius, dmg, {
        status: core.status, knock: 0.25, color, onHit: ctx.onHit, falloff: false,
      });
      for (const f of Figures.list) {
        if (f.dead) continue;
        const p = f.g.position;
        const dx = center.x - p.x, dz = center.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > radius || d < 0.05) continue;
        const pull = 4.2 * (1 - d / radius) / Math.max(0.4, d);
        f.knock.x += dx * pull;
        f.knock.z += dz * pull;
      }
      shockwave(center, color, radius * (0.85 + Math.random() * 0.2), 0.5);
      if (res.hits) sparks(center, 6, color, { speed: 6, up: 3, size: 0.12, life: 0.5, gravity: 8 });
    }
    return false;
  });
}

/* ---------------------------------------------------------------- 环绕卫星 */

export function summonSatellites(ctx, count) {
  count = capOf('orbit', count);
  const color = ctx.colors.orbit;
  const dur = 5 + count * 1.1;
  const interval = 1.15 / (1 + 0.28 * (count - 1));
  const dmg = ctx.damageAt(0) * 0.42 * (1 + 0.1 * count);
  const scene = FX.scene;

  const sats = [];
  for (let i = 0; i < count; i++) {
    if (!ctx.spend()) break;
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 2.0, roughness: 0.25, metalness: 0.2, flatShading: true,
    });
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), mat);
    const halo = sprite(color, 2.2, 0.85, flareTex());
    const g = new THREE.Group();
    g.add(mesh, halo);
    scene.add(g);
    sats.push({
      g, mesh, halo,
      a: (i / count) * TAU,
      r: 3.4 + (i % 3) * 0.6,
      y: 1.4 + (i % 4) * 0.8,
      timer: 0.3 + i * 0.12,
      spin: rand(1.4, 3) * (i % 2 ? 1 : -1),
    });
    flash(g.position, color, 1.2, 0.3);
  }
  if (!sats.length) return;

  let t = 0;
  FX.add(dt => {
    t += dt;
    const left = dur - t;
    if (left <= 0) {
      for (const s of sats) disposeMesh(s.g);
      return true;
    }
    const fade = clamp(left / 0.8, 0, 1);

    for (const s of sats) {
      s.a += dt * 0.85;
      const c = ctx.origin;
      s.g.position.set(
        c.x + Math.cos(s.a) * s.r,
        c.y + s.y + Math.sin(t * 1.6 + s.a) * 0.25,
        c.z + Math.sin(s.a) * s.r,
      );
      s.mesh.rotation.y += dt * s.spin;
      s.mesh.rotation.x += dt * s.spin * 0.6;
      s.halo.material.opacity = 0.55 * fade + 0.25 * Math.sin(t * 6 + s.a) * 0.2;
      s.halo.scale.setScalar(2.0 + Math.sin(t * 5 + s.a) * 0.25);

      s.timer -= dt;
      if (s.timer <= 0) {
        s.timer = interval;
        const fig = Figures.nearest(s.g.position, 18);
        if (fig) {
          const to = fig.g.position.clone().setY(0.7);
          beamFx(s.g.position.clone(), to, color, 0.075, 0.2);
          Audio.orbit();
          flash(to, color, 0.85, 0.2);
          ctx.hurt(to, 1.5, dmg, { status: ctx.core.status, knock: 0.3, color, onHit: ctx.onHit });
          sparks(to, 5, color, { speed: 4, up: 2, size: 0.1, life: 0.4, gravity: 6 });
        }
      }
    }
    return false;
  });
}

/* ---------------------------------------------------------------- 符文 */

export function placeRunes(ctx, point, count, depth) {
  count = capOf('rune', count);
  const color = ctx.colors.rune;
  const core = ctx.core;
  const center = point.clone();          // 锁死落点
  const radius = 2.6 * core.radius * (1 + 0.24 * (count - 1));
  const spread = 2.0 + count * 0.55;
  const dmg = ctx.damageAt(Math.min(depth + 1, 3)) * 1.1;
  const scene = FX.scene;

  const runes = [];
  const tex = runeTexture('#' + color.toString(16).padStart(6, '0'), 2, Math.random() * 999 | 0, 512, 12);

  for (let i = 0; i < count; i++) {
    if (!ctx.spend()) break;
    const a = (i / count) * TAU + rand(-0.25, 0.25);
    const p = center.clone().add(new THREE.Vector3(Math.cos(a) * spread, 0, Math.sin(a) * spread));
    const m = new THREE.Mesh(DISC_FLAT, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.position.set(p.x, 0.07, p.z);
    m.scale.setScalar(radius * 0.55);
    scene.add(m);
    const fuse = 0.5 + i * (0.34 - Math.min(0.18, count * 0.03));
    if (i < 3) Audio.rune(fuse);
    runes.push({ m, p, t: 0, fuse, done: false });
  }

  if (!runes.length) return;

  FX.add(dt => {
    let alive = false;
    for (const r of runes) {
      if (r.done) continue;
      alive = true;
      r.t += dt;
      const k = clamp(r.t / r.fuse, 0, 1);
      r.m.material.opacity = 0.18 + 0.34 * k + Math.sin(r.t * 18) * 0.08 * k;
      r.m.rotation.y += dt * (0.5 + k * 2.2);   // 贴地圆盘要绕 Y 轴自转
      r.m.scale.setScalar(radius * (0.55 + k * 0.35 + Math.sin(r.t * 12) * 0.03));

      if (Math.random() < dt * 10 * k) {
        sparks(r.p.clone().setY(0.1), 1, color, { speed: 0.4, up: rand(1.6, 3), size: 0.09, life: 0.5, gravity: -1.6 });
      }

      if (k >= 1) {
        r.done = true;
        disposeMesh(r.m);
        flash(r.p, color, radius * 0.9, 0.3);
        airRing(r.p.clone().setY(0.6), mixHex(color, 0xffffff, 0.3), radius * 1.4, 0.4);
        ctx.hurt(r.p, radius, dmg, {
          status: core.status, knock: 0.9, color, onHit: ctx.onHit,
        });
        ctx.impact(r.p, Math.min(depth + 1, 3), true);
      }
    }
    if (!alive) return true;
    return false;
  });
}

/* ---------------------------------------------------------------- 命中后派生 */

/** 命中后向四周散裂出光球（二次投送） */
export function scatterOrbs(ctx, from, count, depth) {
  const k = capIf(count, 4);
  /* from 会被延迟闭包读到，先拷一份，避免被后续法术改写 */
  const src = from.clone().setY(0.7);
  for (let i = 0; i < k; i++) {
    if (!ctx.spend()) return;
    const a = (i / k) * TAU + rand(-0.4, 0.4);
    const r = 1.8 + rand(0, 2.2);
    const p = from.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    later(0.04 + i * 0.055, () => {
      launchProjectile({
        from: src.clone(),
        to: p,
        color: ctx.colors.orb,
        size: 0.22,
        speed: 13,
        arc: 2.4,
        onHit: hit => {
          flash(hit, ctx.colors.core, 1.0, 0.22);
          ctx.impact(hit, Math.min(depth + 1, 3), true);
        },
      });
    });
  }
}

/** 命中后向四周迸出光矛 */
export function radialBeams(ctx, point, count, depth) {
  const k = capIf(count + 1, 7);
  const dmg = ctx.damageAt(depth) * 0.5;
  const center = point.clone();      // 同样先拷贝，闭包之后才读
  for (let i = 0; i < k; i++) {
    if (!ctx.spend()) return;
    const a = (i / k) * TAU + rand(-0.3, 0.3);
    const len = 3.4 + rand(0, 2.6);
    const to = center.clone().add(new THREE.Vector3(Math.cos(a) * len, 0, Math.sin(a) * len));
    later(0.05 + i * 0.04, () => {
      const from = center.clone().setY(0.6);
      beamFx(from, to, ctx.colors.beam, 0.075, 0.22);
      ctx.hurt(to, 1.6, dmg, {
        status: ctx.core.status, knock: 0.5, color: ctx.colors.beam, onHit: ctx.onHit,
      });
      ctx.impact(to, Math.min(depth + 1, 3), true);
    });
  }
}

/* ---------------------------------------------------------------- 核心特效 */

export const CORE_FX = {
  /** 冰：霜环 + 冰晶碎片向外迸射 */
  ice(ctx, point, radius) {
    const c = ctx.colors.core;
    const grp = new THREE.Group();
    const geo = new THREE.OctahedronGeometry(0.17, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: c, emissive: c, emissiveIntensity: 2.0,
      roughness: 0.15, metalness: 0.1, flatShading: true,
      transparent: true, opacity: 0.95,
    });
    const shards = [];
    const N = 8;
    for (let i = 0; i < N; i++) {
      const m = new THREE.Mesh(geo, mat);
      const a = (i / N) * TAU + rand(-0.2, 0.2);
      m.position.copy(point).setY(0.5);
      m.scale.set(1, 1.6, 1);
      m.userData = {
        dir: new THREE.Vector3(Math.cos(a) * rand(0.8, 1.3), rand(0.7, 1.8), Math.sin(a) * rand(0.8, 1.3)),
        spin: rand(4, 10),
      };
      grp.add(m);
      shards.push(m);
    }
    FX.scene.add(grp);

    const ring = new THREE.Mesh(DISC_FLAT, glowMat(c, 0.45));
    ring.position.set(point.x, 0.09, point.z);
    ring.scale.setScalar(radius * 0.5);
    FX.scene.add(ring);

    sparks(point, 18, 0xffffff, { speed: 7, up: 4, size: 0.13, life: 0.7, gravity: 11 });
    sparks(point, 10, c, { speed: 4, up: 3, size: 0.16, life: 0.6, gravity: 6 });

    let t = 0;
    FX.add(dt => {
      t += dt;
      const k = clamp(t / 0.6, 0, 1);
      if (k >= 1) { disposeMesh(grp); disposeMesh(ring); return true; }
      for (let i = 0; i < shards.length; i++) {
        const m = shards[i];
        const d = m.userData.dir;
        m.position.addScaledVector(d, dt * 7.5 * (1 - k * 0.65));
        d.y -= dt * 5.5;
        m.rotation.x += dt * m.userData.spin;
        m.rotation.y += dt * m.userData.spin * 0.7;
        m.scale.set(1 - k * 0.6, (1 - k * 0.6) * 1.6, 1 - k * 0.6);
      }
      mat.opacity = 0.95 * (1 - k);
      ring.scale.setScalar(radius * (0.5 + k * 1.3));
      ring.material.opacity = 0.45 * (1 - k);
      ring.rotation.y += dt * 2.5;
      return false;
    });
  },

  fire(ctx, point, radius) {
    const c = ctx.colors.core;
    const ring = new THREE.Mesh(DISC_FLAT, glowMat(c, 0.5));
    ring.position.set(point.x, 0.09, point.z);
    ring.scale.setScalar(radius * 0.6);
    FX.scene.add(ring);
    let t = 0;
    FX.add(dt => {
      t += dt;
      const k = clamp(t / 0.5, 0, 1);
      if (k >= 1) { disposeMesh(ring); return true; }
      ring.scale.setScalar(radius * (0.6 + k * 1.2));
      ring.material.opacity = 0.5 * (1 - k);
      ring.rotation.y += dt * 3;
      return false;
    });
    sparks(point, 16, c, { speed: 7, up: 4, size: 0.16, life: 0.8, gravity: 7 });
  },

  water(ctx, point, radius) {
    const c = ctx.colors.core;
    for (const f of Figures.list) {
      if (f.dead) continue;
      const p = f.g.position;
      const dx = point.x - p.x, dz = point.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > radius * 1.35 || d < 0.05) continue;
      const pull = 9 * (1 - Math.min(1, d / (radius * 1.35))) / Math.max(0.5, d);
      f.knock.x += dx * pull;
      f.knock.z += dz * pull;
    }
    for (let i = 0; i < 3; i++) {
      later(i * 0.06, () => shockwave(point, c, radius * (0.9 + i * 0.35), 0.55));
    }
    sparks(point, 22, c, { speed: 6, up: 6, size: 0.14, life: 0.9, gravity: 12 });
  },

  earth(ctx, point, radius) {
    const c = ctx.colors.core;
    later(0.12, () => {
      shockwave(point, c, radius * 1.5, 0.8);
      shockwave(point, 0xffd8a0, radius * 0.9, 0.6);
      FX.shake(0.1);
    });
    /* 碎石 */
    sparks(point, 20, 0xa07850, { speed: 8, up: 9, size: 0.2, life: 0.9, gravity: 20 });
    sparks(point, 10, c, { speed: 5, up: 4, size: 0.14, life: 0.7, gravity: 14 });
  },

  light(ctx, point, radius) {
    const c = ctx.colors.core;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.2;
      const to = point.clone().add(new THREE.Vector3(Math.cos(a) * radius * 1.6, rand(0.4, 1.6), Math.sin(a) * radius * 1.6));
      beamFx(point.clone().setY(0.6), to, c, 0.06, 0.24);
    }
    airRing(point.clone().setY(0.5), c, radius * 1.6, 0.42);
    sparks(point, 14, 0xfff6dd, { speed: 7, up: 3, size: 0.13, life: 0.6, gravity: 3 });
  },

  dark(ctx, point, radius) {
    const c = ctx.colors.core;
    const m = new THREE.Mesh(SPHERE_LO, new THREE.MeshBasicMaterial({
      color: 0x08030f, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    m.position.copy(point).setY(0.7);
    FX.scene.add(m);
    let t = 0;
    FX.add(dt => {
      t += dt;
      const k = clamp(t / 0.6, 0, 1);
      if (k >= 1) { disposeMesh(m); return true; }
      m.scale.setScalar(radius * (0.2 + easeOutQuint(k) * 0.8));
      m.material.opacity = 0.85 * (1 - k);
      if (Math.random() < 0.6) {
        const a = Math.random() * TAU;
        const r = radius * k;
        sparks(new THREE.Vector3(point.x + Math.cos(a) * r, 0.1, point.z + Math.sin(a) * r), 1, c,
          { speed: 1, up: 3, size: 0.13, life: 0.6, gravity: -2 });
      }
      return false;
    });
    airRing(point.clone().setY(0.6), c, radius * 0.85, 0.45);
  },

  wind(ctx, point, radius) {
    const c = ctx.colors.core;
    for (const f of Figures.list) {
      if (f.dead) continue;
      const p = f.g.position;
      const dx = p.x - point.x, dz = p.z - point.z;
      const d = Math.hypot(dx, dz);
      if (d > radius * 1.5) continue;
      const push = 10 * (1 - Math.min(1, d / (radius * 1.5)));
      const nx = d > 0.1 ? dx / d : rand(-1, 1), nz = d > 0.1 ? dz / d : rand(-1, 1);
      f.knock.x += nx * push;
      f.knock.z += nz * push;
      f.hopV += push * 0.9;
    }
    for (let i = 0; i < 3; i++) {
      later(i * 0.07, () => airRing(point.clone().setY(0.3 + i * 0.13), c, radius * (0.7 + i * 0.25), 0.45));
    }
    sparks(point, 26, c, { speed: 8, up: 2, size: 0.13, life: 0.7, gravity: 1, drag: 0.7 });
  },

  thunder(ctx, point, radius) {
    const c = ctx.colors.core;
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * TAU;
      const to = point.clone().add(new THREE.Vector3(Math.cos(a) * radius * 1.4, 0.5, Math.sin(a) * radius * 1.4));
      lightning(point.clone().setY(0.6), to, c, { jag: 1.4, radius: 0.06, dur: 0.2, segments: 12 });
    }
    flash(point, c, radius * 0.9, 0.24);
    sparks(point, 18, 0xfff3a0, { speed: 10, up: 4, size: 0.14, life: 0.5, gravity: 8 });
  },
};

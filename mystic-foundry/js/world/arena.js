import * as THREE from '../../lib/three.module.js';
import { CONFIG } from '../config.js';
import { rand, randInt, TAU, makeRng, softParticleTexture } from '../util.js';
import { groundTexture, runeTexture } from '../render/textures.js';
import { glowMat, DISC_FLAT } from '../render/fx.js';

export const Arena = {
  group: null,
  ringGroup: null,
  rings: [],
  pillars: [],
  rocks: [],
  motes: null,
  _moteData: null,

  build(scene) {
    const g = new THREE.Group();
    this.group = g;
    scene.add(g);

    const R = CONFIG.arena.groundRadius;

    /* ---------------- 地面 ---------------- */
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(R, 96),
      new THREE.MeshStandardMaterial({
        map: groundTexture(1024, R),
        roughness: 0.9, metalness: 0.15,
        color: 0xffffff,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = CONFIG.quality.shadows;
    g.add(ground);

    /* 地面外圈发光边 */
    const rimGeo = new THREE.RingGeometry(R * 0.965, R * 1.005, 128);
    rimGeo.rotateX(-Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, glowMat(0x8f6bff, 0.55));
    rim.position.y = 0.03;
    g.add(rim);

    /* ---------------- 旋转符文环 ---------------- */
    this.ringGroup = new THREE.Group();
    this.ringGroup.position.y = 0.05;
    g.add(this.ringGroup);

    const ringDefs = [
      { r: 4.6, color: 0x8f6bff, speed: 0.10, opacity: 0.5, spokes: 12 },
      { r: 9.5, color: 0x49e6ff, speed: -0.07, opacity: 0.38, spokes: 20 },
      { r: 14.2, color: 0xb06bff, speed: 0.05, opacity: 0.3, spokes: 28 },
    ];
    for (let i = 0; i < ringDefs.length; i++) {
      const d = ringDefs[i];
      const tex = runeTexture('#' + d.color.toString(16).padStart(6, '0'), 3, 11 + i, 512, d.spokes);
      const size = d.r * 2.02;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({
          map: tex, transparent: true, opacity: d.opacity,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.userData = { speed: d.speed, base: d.opacity };
      this.ringGroup.add(m);
      this.rings.push(m);
    }

    /* 中央聚焦圈（水晶正下方） */
    const focus = new THREE.Mesh(DISC_FLAT, new THREE.MeshBasicMaterial({
      map: runeTexture('#ffd88a', 2, 21, 512, 16),
      transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    focus.scale.setScalar(3.4);
    focus.position.y = 0.08;
    g.add(focus);
    this.focus = focus;

    /* 施法半径边界线 */
    const boundGeo = new THREE.RingGeometry(CONFIG.arena.castRadius - 0.06, CONFIG.arena.castRadius, 128);
    boundGeo.rotateX(-Math.PI / 2);
    const bound = new THREE.Mesh(boundGeo, glowMat(0xffcc77, 0.22));
    bound.position.y = 0.05;
    g.add(bound);

    /* ---------------- 立柱 ---------------- */
    const rng = makeRng(1337);
    const pillarCount = 12;
    for (let i = 0; i < pillarCount; i++) {
      const a = (i / pillarCount) * TAU + rng() * 0.06;
      const r = 19.5 + rng() * 3.4;
      const h = 3.6 + rng() * 4.2;

      const pg = new THREE.Group();
      pg.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      pg.rotation.y = -a + rand(-0.2, 0.2);

      const stone = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34 + rng() * 0.16, 0.7 + rng() * 0.2, h, 6, 1),
        new THREE.MeshStandardMaterial({ color: 0x2a2140, roughness: 0.85, metalness: 0.2 }),
      );
      stone.position.y = h / 2;
      if (CONFIG.quality.shadows) stone.castShadow = true;
      pg.add(stone);

      /* 顶部悬浮晶体 */
      const col = [0x8f6bff, 0x49e6ff, 0xff9a5c, 0x5cffb0][randInt(0, 3)];
      const tip = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.34 + rng() * 0.2, 0),
        new THREE.MeshStandardMaterial({
          color: col, emissive: col, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.1,
        }),
      );
      tip.position.y = h + 0.6;
      pg.add(tip);

      const halo = new THREE.Mesh(DISC_FLAT, glowMat(col, 0.3));
      halo.scale.setScalar(1.5);
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = h + 0.6;
      pg.add(halo);

      g.add(pg);
      this.pillars.push({ g: pg, tip, halo, base: h + 0.6, phase: rng() * TAU, y0: pg.position.y });
    }

    /* ---------------- 悬浮碎石 ---------------- */
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x241c3a, roughness: 0.95, metalness: 0.12 });
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * TAU;
      const r = 17 + Math.random() * 15;
      const s = 0.28 + Math.random() * 0.85;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat);
      rock.position.set(Math.cos(a) * r, rand(6.5, 19), Math.sin(a) * r);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      if (CONFIG.quality.shadows) rock.castShadow = true;
      g.add(rock);
      this.rocks.push({
        m: rock,
        y0: rock.position.y,
        amp: rand(0.25, 0.9),
        phase: Math.random() * TAU,
        spin: new THREE.Vector3(rand(-0.2, 0.2), rand(-0.25, 0.25), rand(-0.2, 0.2)),
      });
    }

    /* ---------------- 星空 ---------------- */
    const starCount = 900;
    const sp = new Float32Array(starCount * 3);
    const sc = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const a = Math.random() * TAU;
      const e = Math.acos(rand(-0.25, 1));
      const r = 70 + Math.random() * 90;
      sp[i * 3] = Math.cos(a) * Math.sin(e) * r;
      sp[i * 3 + 1] = Math.cos(e) * r + 8;
      sp[i * 3 + 2] = Math.sin(a) * Math.sin(e) * r;
      const t = Math.random();
      const c = new THREE.Color().setHSL(0.6 + t * 0.18, 0.5, 0.72);
      sc[i * 3] = c.r; sc[i * 3 + 1] = c.g; sc[i * 3 + 2] = c.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      size: 1.1, vertexColors: true, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, map: softParticleTexture(),
    }));
    stars.frustumCulled = false;
    scene.add(stars);
    this.stars = stars;

    /* ---------------- 浮尘 ---------------- */
    const moteCount = 420;
    const mp = new Float32Array(moteCount * 3);
    const mv = new Float32Array(moteCount);
    for (let i = 0; i < moteCount; i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * 24;
      mp[i * 3] = Math.cos(a) * r;
      mp[i * 3 + 1] = Math.random() * 16;
      mp[i * 3 + 2] = Math.sin(a) * r;
      mv[i] = rand(0.15, 0.65);
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    this.motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
      color: 0xb9a3ff, size: 0.22, map: softParticleTexture(), transparent: true,
      opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    }));
    this.motes.frustumCulled = false;
    this._moteData = { pos: mp, vel: mv, count: moteCount, geo: moteGeo };
    scene.add(this.motes);

    return this;
  },

  update(dt, time) {
    for (const m of this.rings) {
      m.rotation.z += m.userData.speed * dt;
      m.material.opacity = m.userData.base * (0.72 + 0.28 * Math.sin(time * 0.9 + m.userData.speed * 40));
    }
    if (this.focus) {
      this.focus.rotation.y -= dt * 0.16;      // 贴地圆盘绕 Y 轴自转
      this.focus.material.opacity = 0.4 + 0.2 * Math.sin(time * 1.6);
    }
    for (const p of this.pillars) {
      const y = p.base + Math.sin(time * 0.8 + p.phase) * 0.15;
      p.tip.position.y = y;
      p.tip.rotation.y += dt * 0.7;
      p.tip.rotation.x += dt * 0.35;
      p.halo.position.y = y;
      p.halo.material.opacity = 0.2 + 0.14 * Math.sin(time * 1.4 + p.phase);
    }
    for (const r of this.rocks) {
      r.m.position.y = r.y0 + Math.sin(time * 0.6 + r.phase) * r.amp;
      r.m.rotation.x += r.spin.x * dt;
      r.m.rotation.y += r.spin.y * dt;
      r.m.rotation.z += r.spin.z * dt;
    }
    if (this.stars) this.stars.rotation.y += dt * 0.006;

    /* 浮尘上升 */
    const d = this._moteData;
    if (d) {
      for (let i = 0; i < d.count; i++) {
        const i3 = i * 3;
        d.pos[i3 + 1] += d.vel[i] * dt;
        d.pos[i3] += Math.sin(time * 0.5 + i) * dt * 0.25;
        if (d.pos[i3 + 1] > 16) d.pos[i3 + 1] = 0;
      }
      d.geo.attributes.position.needsUpdate = true;
    }
  },
};

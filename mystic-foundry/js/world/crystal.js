import * as THREE from '../../lib/three.module.js';
import { CONFIG } from '../config.js';
import { rand, TAU, clamp, damp, easeOutCubic } from '../util.js';
import { sprite, flareTex, airRing, sparks, flash, FX } from '../render/fx.js';

/**
 * 场景正上方的魔法水晶 —— 所有法术的释放原点
 */
export const Crystal = {
  group: null,
  position: new THREE.Vector3(0, CONFIG.crystal.height, 0),
  color: new THREE.Color(0xb18cff),
  targetColor: new THREE.Color(0xb18cff),
  charge: 0,
  chargeRate: 0,
  spinBoost: 0,
  recoil: 0,
  _aim: new THREE.Vector3(0, 0, 10),
  _aimCur: new THREE.Vector3(0, 0, 10),

  build(scene) {
    const g = new THREE.Group();
    g.position.copy(this.position);
    this.group = g;
    scene.add(g);

    /* ---------------- 内核晶体 ---------------- */
    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xb18cff, emissiveIntensity: 2.4,
      roughness: 0.12, metalness: 0.05,
      transparent: true, opacity: 0.96, flatShading: true,
    });
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.86, 0), this.coreMat);
    this.core.scale.set(1, 1.55, 1);
    if (CONFIG.quality.shadows) this.core.castShadow = true;
    g.add(this.core);

    /* 外壳（棱面、加法混合） */
    this.shellMat = new THREE.MeshBasicMaterial({
      color: 0xb18cff, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.42, 1), this.shellMat);
    this.shell.scale.set(1, 1.5, 1);
    g.add(this.shell);

    /* 内芯白热光晕 */
    this.glow = sprite(0xffffff, 4.2, 0.85, flareTex());
    g.add(this.glow);

    /* ---------------- 旋转法环 ---------------- */
    this.rings = [];
    const ringDefs = [
      { r: 1.9, tube: 0.035, tilt: [Math.PI / 2, 0, 0], speed: 0.9 },
      { r: 2.35, tube: 0.028, tilt: [Math.PI / 2.6, 0.5, 0.3], speed: -0.65 },
      { r: 2.9, tube: 0.022, tilt: [Math.PI / 1.8, -0.7, 0.2], speed: 0.42 },
    ];
    for (const d of ringDefs) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xb18cff, transparent: true, opacity: 0.75,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const m = new THREE.Mesh(new THREE.TorusGeometry(d.r, d.tube, 8, 96), mat);
      m.rotation.set(d.tilt[0], d.tilt[1], d.tilt[2]);
      m.userData = { speed: d.speed, mat, r: d.r };
      g.add(m);
      this.rings.push(m);
    }

    /* ---------------- 环绕碎晶 ---------------- */
    this.shards = [];
    this.shardMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xb18cff, emissiveIntensity: 1.8,
      roughness: 0.2, metalness: 0.2, flatShading: true,
    });
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.17 + Math.random() * 0.1, 0), this.shardMat);
      m.userData = {
        a: (i / 7) * TAU,
        r: 2.1 + Math.random() * 1.5,
        y: rand(-0.7, 0.7),
        speed: rand(0.4, 0.9) * (Math.random() > 0.5 ? 1 : -1),
        spin: rand(1, 3),
      };
      g.add(m);
      this.shards.push(m);
    }

    /* ---------------- 向下的光柱 ---------------- */
    this.shaftMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xb18cff) },
        uOpacity: { value: 0.22 },
      },
      vertexShader: /* glsl */`
        varying float vY;
        void main(){
          vY = uv.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying float vY;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main(){
          float fade = pow(vY, 1.6);
          gl_FragColor = vec4(uColor * fade * uOpacity, fade * uOpacity);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const shaftH = CONFIG.crystal.height - 0.1;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 2.7, shaftH, 28, 1, true),
      this.shaftMat,
    );
    /* CylinderGeometry 的 uv.y：1 在顶端 → 顶端最亮，符合"水晶向下洒光" */
    shaft.position.y = -shaftH / 2;
    shaft.renderOrder = 2;
    g.add(shaft);
    this.shaft = shaft;

    /* ---------------- 光源 ---------------- */
    this.light = new THREE.PointLight(0xb18cff, 34, 40, 2);
    g.add(this.light);
    this.light2 = new THREE.PointLight(0xffffff, 11, 18, 2);
    g.add(this.light2);

    return this;
  },

  setColor(hexColor) {
    this.targetColor.setHex(hexColor);
  },

  /** 蓄力：dur 秒内从 0 涨到 1 */
  startCharge(dur = CONFIG.crystal.chargeTime) {
    this.chargeRate = 1 / dur;
    this._charging = true;
  },

  /** 释放瞬间 */
  fire() {
    this._charging = false;
    this.charge = 0;
    this.spinBoost = 1.6;
    this.recoil = 1;
    const c = this.color.getHex();
    flash(this.group.position, c, 1.6, 0.32);
    airRing(this.group.position, c, 2.6, 0.42);
    sparks(this.group.position, 34, c, { speed: 12, up: 3, size: 0.2, life: 0.8, gravity: 1.2 });
    FX.shake(0.12);
  },

  aimAt(point) {
    this._aim.copy(point);
  },

  update(dt, time) {
    const g = this.group;

    /* 颜色缓动 */
    const k = damp(dt, 0.002);
    this.color.lerp(this.targetColor, k);
    this.coreMat.emissive.copy(this.color);
    this.shellMat.color.copy(this.color);
    this.shardMat.emissive.copy(this.color);
    this.shaftMat.uniforms.uColor.value.copy(this.color);
    this.light.color.copy(this.color);
    this.light2.color.copy(this.color).lerp(new THREE.Color(0xffffff), 0.5);
    for (const r of this.rings) r.userData.mat.color.copy(this.color);

    /* 蓄力进度 */
    if (this._charging) {
      this.charge = clamp(this.charge + this.chargeRate * dt, 0, 1);
    } else {
      this.charge = Math.max(0, this.charge - dt * 4.5);
    }
    this.spinBoost = Math.max(0, this.spinBoost - dt * 2.4);
    this.recoil = Math.max(0, this.recoil - dt * 3.6);

    const ch = easeOutCubic(this.charge);
    const pulse = 1 + Math.sin(time * 2.1) * 0.03 + ch * 0.22;

    /* 悬浮 + 呼吸 */
    g.position.y = this.position.y + Math.sin(time * 1.05) * 0.16 - this.recoil * 0.22;
    g.rotation.y += dt * (0.22 + this.spinBoost * 1.6);

    /* 朝目标轻微倾斜 */
    this._aimCur.lerp(this._aim, damp(dt, 0.04));
    const dir = this._aimCur.clone().sub(g.position);
    const tilt = clamp(dir.length() * 0.012, 0, 0.22);
    dir.normalize();
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, dir.z * tilt, damp(dt, 0.05));
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, -dir.x * tilt, damp(dt, 0.05));

    this.core.scale.set(pulse, pulse * 1.55, pulse);
    this.core.rotation.y -= dt * 0.5;
    this.shell.scale.set(1 + ch * 0.16, 1.5 + ch * 0.2, 1 + ch * 0.16);
    this.shell.rotation.y += dt * 0.32;
    this.shell.rotation.x -= dt * 0.18;
    this.shellMat.opacity = 0.2 + ch * 0.4 + Math.sin(time * 3.3) * 0.04;

    const glowScale = 2.6 + ch * 1.4 + Math.sin(time * 1.7) * 0.22 + this.recoil * 1.6;
    this.glow.scale.setScalar(glowScale);
    this.glow.material.opacity = 0.5 + ch * 0.3;

    for (const r of this.rings) {
      r.rotation.z += dt * r.userData.speed * (1 + this.spinBoost * 3 + ch * 4);
      r.rotation.x += dt * 0.12 * (1 + ch * 2);
      r.userData.mat.opacity = 0.45 + ch * 0.5;
    }

    for (const s of this.shards) {
      const u = s.userData;
      u.a += dt * u.speed * (1 + this.spinBoost * 3 + ch * 3);
      const rr = u.r * (1 - ch * 0.4);
      s.position.set(Math.cos(u.a) * rr, u.y + Math.sin(time * 1.6 + u.a) * 0.16, Math.sin(u.a) * rr);
      s.rotation.x += dt * u.spin;
      s.rotation.y += dt * u.spin * 0.7;
    }

    this.light.intensity = 20 + Math.sin(time * 1.8) * 5 + ch * 44 + this.recoil * 34;
    this.light2.intensity = 7 + ch * 20 + this.recoil * 20;
    this.shaftMat.uniforms.uOpacity.value = 0.16 + ch * 0.28 + Math.sin(time * 0.9) * 0.03 + this.recoil * 0.25;
  },
};

import * as THREE from '../lib/three.module.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[(Math.random() * arr.length) | 0];
export const TAU = Math.PI * 2;

/** 帧率无关的阻尼插值系数 */
export const damp = (dt, k) => 1 - Math.pow(k, dt);

export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeOutQuint = t => 1 - Math.pow(1 - t, 5);
export const easeInQuad = t => t * t;
export const easeOutBack = t => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const hex = c => '#' + c.toString(16).padStart(6, '0');
export const cssColor = c => `rgb(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255})`;
export const rgba = (c, a) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

const _ca = new THREE.Color(), _cb = new THREE.Color();
/** 两个十六进制颜色按 t 混合，返回 THREE.Color */
export function mix(a, b, t) {
  _ca.setHex(typeof a === 'number' ? a : a.getHex());
  _cb.setHex(typeof b === 'number' ? b : b.getHex());
  return _ca.clone().lerp(_cb, t);
}

/** 混合后返回十六进制数字 */
export function mixHex(a, b, t) {
  return mix(a, b, t).getHex();
}

/** 提亮 / 压暗一个颜色 */
export function shade(c, k) {
  const col = new THREE.Color(typeof c === 'number' ? c : c.getHex());
  if (k >= 1) col.lerp(new THREE.Color(0xffffff), k - 1);
  else col.multiplyScalar(k);
  return col;
}

/** 生成径向渐变贴图（用于光晕、软粒子、地面） */
export function radialTexture(size = 128, stops = null, power = 2.2) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  if (stops) {
    for (const [p, c] of stops) g.addColorStop(p, c);
  } else {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      g.addColorStop(t, `rgba(255,255,255,${Math.pow(1 - t, power).toFixed(4)})`);
    }
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 四芒星光晕贴图 */
export function flareTexture(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const h = size / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  /* 十字光芒 */
  ctx.globalCompositeOperation = 'lighter';
  for (const rot of [0, Math.PI / 2]) {
    ctx.save();
    ctx.translate(h, h);
    ctx.rotate(rot);
    const lg = ctx.createLinearGradient(-h, 0, h, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(-h, -size * 0.012, size, size * 0.024);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 圆形软粒子贴图（火花用） */
let _softTex = null;
export function softParticleTexture() {
  if (!_softTex) {
    _softTex = radialTexture(64, [
      [0.0, 'rgba(255,255,255,1)'],
      [0.25, 'rgba(255,255,255,0.85)'],
      [0.6, 'rgba(255,255,255,0.22)'],
      [1.0, 'rgba(255,255,255,0)'],
    ]);
  }
  return _softTex;
}

/** 简易确定性随机（按 seed），用于地面花纹等 */
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

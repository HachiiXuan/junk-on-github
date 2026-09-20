import * as THREE from '../../lib/three.module.js';
import { makeRng } from '../util.js';

/** 竞技场地面贴图：径向渐变 + 网格 + 环形刻痕 */
export function groundTexture(size = 1024, radius = 26) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const h = size / 2;
  const rng = makeRng(7);

  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0.00, '#1b1334');
  g.addColorStop(0.35, '#130d26');
  g.addColorStop(0.72, '#0c0819');
  g.addColorStop(1.00, '#05030b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  /* 细网格 */
  ctx.strokeStyle = 'rgba(120,96,220,0.10)';
  ctx.lineWidth = 1;
  const cell = size / 44;
  for (let i = 0; i <= 44; i++) {
    ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell); ctx.stroke();
  }

  /* 同心环刻痕 */
  for (let i = 1; i <= 7; i++) {
    const r = (radius / 26) * h * (i / 7.4) * 0.92;
    ctx.beginPath();
    ctx.arc(h, h, r, 0, Math.PI * 2);
    ctx.strokeStyle = i % 2 ? 'rgba(150,118,255,0.16)' : 'rgba(90,220,255,0.10)';
    ctx.lineWidth = i % 3 === 0 ? 2.4 : 1.2;
    ctx.stroke();
  }

  /* 放射短线 */
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const r0 = h * 0.30, r1 = h * (0.32 + rng() * 0.5);
    ctx.beginPath();
    ctx.moveTo(h + Math.cos(a) * r0, h + Math.sin(a) * r0);
    ctx.lineTo(h + Math.cos(a) * r1, h + Math.sin(a) * r1);
    ctx.strokeStyle = 'rgba(140,110,240,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * 符文圆盘贴图（用于法术领域 / 地面法阵）
 * @param {string} color 主色 css
 * @param {number} rings 环数
 * @param {number} seed  随机种子
 */
export function runeTexture(color = '#7fe6ff', rings = 3, seed = 3, size = 512, spokes = 24) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const h = size / 2;
  const rng = makeRng(seed);
  ctx.clearRect(0, 0, size, size);

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.03;

  for (let i = 0; i < rings; i++) {
    const r = h * (0.34 + 0.62 * (i / Math.max(1, rings - 1 || 1)));
    ctx.beginPath();
    ctx.arc(h, h, Math.min(r, h * 0.95), 0, Math.PI * 2);
    ctx.lineWidth = size * (i === 0 ? 0.012 : 0.006);
    ctx.globalAlpha = 0.9 - i * 0.14;
    ctx.stroke();
  }

  /* 放射线 */
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = size * 0.004;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + rng() * 0.02;
    const r0 = h * 0.34, r1 = h * (0.60 + rng() * 0.3);
    ctx.beginPath();
    ctx.moveTo(h + Math.cos(a) * r0, h + Math.sin(a) * r0);
    ctx.lineTo(h + Math.cos(a) * r1, h + Math.sin(a) * r1);
    ctx.stroke();
  }

  /* 符文小方块 */
  ctx.globalAlpha = 0.75;
  const glyphs = 18;
  for (let i = 0; i < glyphs; i++) {
    const a = (i / glyphs) * Math.PI * 2 + 0.1;
    const r = h * (0.44 + rng() * 0.34);
    const x = h + Math.cos(a) * r, y = h + Math.sin(a) * r;
    const s = size * (0.012 + rng() * 0.016);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.lineWidth = size * 0.005;
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    if (rng() > 0.5) {
      ctx.beginPath();
      ctx.moveTo(-s / 2, 0); ctx.lineTo(s / 2, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 陨石表面贴图：暗色岩石 + 发光裂纹 */
export function meteorTexture(seed = 5, size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const rng = makeRng(seed);
  ctx.fillStyle = '#1b1420';
  ctx.fillRect(0, 0, size, size);
  /* 岩石斑块 */
  for (let i = 0; i < 220; i++) {
    const v = 20 + rng() * 45;
    ctx.fillStyle = `rgb(${v + 12},${v},${v + 14})`;
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, 3 + rng() * 16, 0, Math.PI * 2);
    ctx.fill();
  }
  /* 发光裂纹 */
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 10; i++) {
    ctx.strokeStyle = `rgba(255,${120 + rng() * 90 | 0},60,0.85)`;
    ctx.lineWidth = 1 + rng() * 2.4;
    let x = rng() * size, y = rng() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += (rng() - 0.5) * 70; y += (rng() - 0.5) * 70;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 天空穹顶渐变贴图 */
export function skyTexture(size = 512) {
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0.00, '#05040c');
  g.addColorStop(0.36, '#0b0820');
  g.addColorStop(0.62, '#171038');
  g.addColorStop(0.84, '#2a1a52');
  g.addColorStop(1.00, '#3b2560');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

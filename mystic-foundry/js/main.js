import * as THREE from '../lib/three.module.js';
import { CONFIG } from './config.js';
import { Stage } from './render/stage.js';
import { FX } from './render/fx.js';
import { Arena } from './world/arena.js';
import { Crystal } from './world/crystal.js';
import { Figures } from './world/figures.js';
import { Engine } from './magic/engine.js';
import { Panel } from './ui/panel.js';
import { Hud } from './ui/hud.js';
import { t } from './i18n.js';
import { Audio } from './audio.js';
import { Settings } from './settings.js';

/* ============================================================
 *  启动
 * ============================================================ */
const canvas = document.getElementById('scene');

Stage.init(canvas);
Arena.build(Stage.scene);
Crystal.build(Stage.scene);
Figures.build(Stage.scene).setCamera(Stage.camera);
Hud.init().buildScene(Stage.scene, Stage.camera);
Panel.init();

Engine.onDamage = (fig, dmg, pos) => Hud.addDamage(pos, dmg);
Engine.onStats = s => Hud.setCastStats(s);

/* ============================================================
 *  输入：左键直接施法
 * ============================================================ */
const tmp = new THREE.Vector3();
const lastGround = new THREE.Vector3(0, 0, 8);
let holding = false;
let casts = 0;

function helpOpen() {
  return !Panel.el.help.classList.contains('hidden');
}

function tryCast(cx, cy) {
  if (helpOpen()) return;
  const p = Stage.pickGround(cx, cy, tmp);
  if (!p) return;
  lastGround.copy(p);
  const res = Engine.cast(p);
  if (res.ok) {
    casts++;
    Hud.resetCastStats();
    alertFigures(p);
  } else if (res.reason === 'empty') {
    Hud.toast(t('toast.noSpell'));
  }
}

/** 让附近的小人注意到施法 */
function alertFigures(point) {
  for (const f of Figures.list) {
    if (f.dead) continue;
    const d = f.g.position.distanceTo(point);
    if (d < 9) {
      f.alarm = Math.max(f.alarm, 1.1);
      f.alertPos.copy(point);
    }
  }
}

/* ------------------------------------------------------------------
 *  输入
 *   桌面：左键按下即施法（按住连发）；空格/中键拖动旋转视角
 *   触摸：拖动旋转视角，轻点施法（按下时不打，抬手时看位移决定）
 * ------------------------------------------------------------------ */
let touchStart = null;

/* 音频上下文必须在用户手势里创建 / 恢复（浏览器自动播放策略） */
for (const ev of ['pointerdown', 'keydown']) {
  addEventListener(ev, () => Audio.unlock(), { capture: true, passive: true });
}

function reticleAllowed() {
  return !helpOpen() && !Stage.spaceHeld && !Hud.isTouch;
}

canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') {
    touchStart = { x: e.clientX, y: e.clientY };
    return;
  }
  if (e.button !== 0) return;
  if (Stage.spaceHeld) return;          // 空格 + 左键 = 旋转视角，不施法
  holding = true;
  tryCast(e.clientX, e.clientY);
});

addEventListener('pointerup', e => {
  holding = false;
  if (touchStart && e.pointerType === 'touch') {
    const moved = Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y);
    touchStart = null;
    if (moved < 14 && !helpOpen()) tryCast(e.clientX, e.clientY);   // 轻点 = 施法
  }
});
addEventListener('blur', () => { holding = false; touchStart = null; });
addEventListener('pointercancel', () => { holding = false; touchStart = null; });

canvas.addEventListener('pointermove', e => {
  /* 拖动中不更新落点预览，免得视角旋转时预览乱跳 */
  if (e.pointerType === 'touch' && Stage._dragging && Stage.dragDist > 14) return;
  const p = Stage.pickGround(e.clientX, e.clientY, tmp);
  if (!p) {
    Hud.setReticleVisible(false);
    if (Hud.preview) Hud.preview.visible = false;
    return;
  }
  lastGround.copy(p);
  Crystal.aimAt(p);
  Hud.movePreview(p);
  if (e.pointerType === 'touch') Hud.preview.visible = true;
  Hud.setReticleVisible(reticleAllowed());
});

canvas.addEventListener('pointerleave', () => Hud.setReticleVisible(false));
canvas.addEventListener('pointerenter', () => { if (reticleAllowed()) Hud.setReticleVisible(true); });

addEventListener('resize', () => Stage.resize());

/* ============================================================
 *  主循环
 * ============================================================ */
let last = performance.now();
let fps = 60;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const time = now / 1000;
  fps += ((1 / Math.max(dt, 1e-4)) - fps) * 0.08;

  Engine.update(dt);

  /* 按住左键连发 */
  if (holding && !Stage.spaceHeld && Engine.ready) tryCast(Hud._cursor.x, Hud._cursor.y);

  Figures.update(dt, time);
  Arena.update(dt, time);
  Crystal.update(dt, time);
  FX.update(dt);

  Stage.updateCamera(dt, time);
  Hud.update(dt, Stage.camera, Engine.spell);
  Hud.tickStats(Figures, fps, casts);

  Stage.render();
}

requestAnimationFrame(frame);

/* 调试钩子（headless 测试用） */
window.__foundry = { Stage, Arena, Crystal, Figures, Engine, Panel, Hud, FX, CONFIG, Audio, Settings };

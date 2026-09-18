/**
 * 特效系统
 * 伤害飘字 / 冲击波 / 粒子 / 碎片 / 屏幕闪光 / 镜头震动
 * 所有视觉半径均以「攻击范围 R」为基准，保证所见即所得
 */
const Effects = (function () {
  'use strict';

  const $container = () => document.getElementById('game-container');
  const $ground = () => document.getElementById('ground');

  // ============================================================
  //  伤害飘字
  // ============================================================
  function showDamageText(x, y, info) {
    const el = document.createElement('div');
    el.classList.add('damage-text');
    el.textContent = info.damage.toLocaleString();
    el.style.color = info.color;
    if (info.isPurple) el.classList.add('purple');

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.visibility = 'hidden';
    $container().appendChild(el);

    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 12;
    const halfW = w / 2;
    const halfH = h / 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 随机偏移：±180 水平 / ±120 垂直
    const dx = (Math.random() - 0.5) * 360;
    const dy = (Math.random() - 0.5) * 240;

    const tx = Math.min(Math.max(x + dx, halfW + margin), vw - halfW - margin);
    const ty = Math.min(Math.max(y + dy, halfH + margin), vh - halfH - margin);

    el.style.left = `${tx}px`;
    el.style.top = `${ty}px`;
    el.style.visibility = 'visible';
    el.classList.add('appear');

    setTimeout(() => {
      el.classList.add('fading');
      setTimeout(() => el.remove(), 950);
    }, 400);
  }

  // ============================================================
  //  冲击波环
  //  endDiameter 是元素最终尺寸，从 scale(0) 长到 scale(1)，
  //  因此最终外径 = endDiameter，半径 = endDiameter / 2
  // ============================================================
  function ring(x, y, opts) {
    const o = Object.assign({
      endDiameter: 200,
      color: 'rgba(255,255,255,0.85)',
      width: 4,
      duration: 550
    }, opts);

    const el = document.createElement('div');
    el.className = 'shockwave';
    el.style.width  = `${o.endDiameter}px`;
    el.style.height = `${o.endDiameter}px`;
    el.style.left   = `${x - o.endDiameter / 2}px`;
    el.style.top    = `${y - o.endDiameter / 2}px`;
    el.style.border = `${o.width}px solid ${o.color}`;
    el.style.animationDuration = `${o.duration}ms`;

    $container().appendChild(el);
    setTimeout(() => el.remove(), o.duration + 80);
  }

  // ============================================================
  //  屏幕闪光
  // ============================================================
  function screenFlash(x, y, radius) {
    const flashRadius = radius * 1.8;
    const el = document.createElement('div');
    el.className = 'screen-flash';
    el.style.background = `radial-gradient(circle ${flashRadius}px at ${x}px ${y}px,
      rgba(255, 255, 255, 0.55) 0%,
      rgba(255, 220, 150, 0.18) 35%,
      rgba(255, 120,  60, 0.05) 55%,
      transparent 75%)`;
    $container().appendChild(el);
    setTimeout(() => el.remove(), 380);
  }

  // ============================================================
  //  镜头震动
  // ============================================================
  function containerShake() {
    const c = $container();
    c.classList.remove('shaking');
    void c.offsetWidth;
    c.classList.add('shaking');
    setTimeout(() => c.classList.remove('shaking'), 420);
  }

  // ============================================================
  //  粒子（距离随半径缩放）
  // ============================================================
  function particles(x, y, radius) {
    const COUNT = 60;
    const minDist = radius * 0.3;
    const maxDist = radius * 1.8;

    for (let i = 0; i < COUNT; i++) {
      const p = document.createElement('div');
      p.className = 'particle';

      const r = Math.random();
      if (r < 0.40)      p.classList.add('fire');
      else if (r < 0.75) p.classList.add('spark');
      else               p.classList.add('dust');

      const angle = Math.random() * Math.PI * 2;
      const dist  = minDist + Math.random() * (maxDist - minDist);
      const ox = Math.cos(angle) * dist;
      const oy = Math.sin(angle) * dist;

      const size = 4 + Math.random() * 8;

      p.style.left = `${x}px`;
      p.style.top  = `${y}px`;
      p.style.width  = `${size}px`;
      p.style.height = `${size}px`;
      p.style.marginLeft = `${-size / 2}px`;
      p.style.marginTop  = `${-size / 2}px`;
      p.style.setProperty('--x', `${ox}px`);
      p.style.setProperty('--y', `${oy}px`);

      const dur = 400 + Math.random() * 400;
      p.style.animationDuration = `${dur}ms`;

      $container().appendChild(p);
      setTimeout(() => p.remove(), dur + 80);
    }
  }

  // ============================================================
  //  放射碎片（距离随半径缩放）
  // ============================================================
  function debris(x, y, radius) {
    const COUNT = 14;
    const minDist = radius * 1.0;
    const maxDist = radius * 2.0;

    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const dist  = minDist + Math.random() * (maxDist - minDist);

      const d = document.createElement('div');
      d.className = 'debris';
      d.style.left = `${x}px`;
      d.style.top  = `${y}px`;
      d.style.setProperty('--rot',  `${angle * 180 / Math.PI}deg`);
      d.style.setProperty('--dist', `${dist}px`);

      const dur = 500 + Math.random() * 250;
      d.style.animationDuration = `${dur}ms`;

      $container().appendChild(d);
      setTimeout(() => d.remove(), dur + 80);
    }
  }

  // ============================================================
  //  一次震地的全部特效
  //  @param radius  攻击范围半径，所有视觉尺寸以此为基准
  // ============================================================
  function slamImpact(x, y, radius) {
    screenFlash(x, y, radius);
    containerShake();

    // 三重错峰冲击波：外圈对齐攻击范围，内圈逐层收窄
    ring(x, y, {
      endDiameter: radius * 2.2,
      color: 'rgba(255,255,255,0.95)',
      width: 5,
      duration: 500
    });
    setTimeout(() => ring(x, y, {
      endDiameter: radius * 1.7,
      color: 'rgba(255,180,70,0.9)',
      width: 3,
      duration: 600
    }), 55);
    setTimeout(() => ring(x, y, {
      endDiameter: radius * 1.2,
      color: 'rgba(255,80,80,0.6)',
      width: 2,
      duration: 700
    }), 110);

    particles(x, y, radius);
    debris(x, y, radius);
  }

  // 兼容旧接口
  function shakeGround() {
    const g = $ground();
    g.style.animation = 'shake 0.5s ease-out';
    setTimeout(() => { g.style.animation = ''; }, 500);
  }

  return {
    showDamageText,
    slamImpact,
    shakeGround,
    screenFlash,
    containerShake,
    ring,
    particles,
    debris
  };
})();
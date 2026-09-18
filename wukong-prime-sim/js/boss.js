/**
 * BOSS 系统
 * 触发 / 漂浮 / 受击 / 三阶段变色 / 死亡爆炸
 */
const BossSystem = (function () {
  'use strict';

  // 基础血量（tier 1 时）
  const BASE_HEALTH = {
    normal: 30_000_000,   // 3000 万
    steel:  100_000_000   // 1 亿
  };

  let el, healthBarEl, healthBarInnerEl;
  let active = false;
  let health = 0;
  let maxHealth = 0;
  let currentMode = 'normal';
  let onDefeatCallback = null;

  function init() {
    el              = document.getElementById('boss');
    healthBarEl     = document.getElementById('boss-health-bar');
    healthBarInnerEl = document.getElementById('boss-health-bar-inner');
  }

  function setMode(mode) {
    currentMode = mode;
  }

  /**
   * 生成 BOSS
   * @param {number} tier 第几次触发（1、2、3...），血量按 tier 线性放大
   */
  function spawn(tier) {
    if (active) return;
    active = true;

    const base = BASE_HEALTH[currentMode] || BASE_HEALTH.normal;
    maxHealth = base * Math.max(1, tier);
    health = maxHealth;

    el.style.display = 'block';
    el.classList.remove('defeated', 'hit', 'phase-1', 'phase-2', 'phase-3');
    el.classList.add('phase-1');

    healthBarEl.style.display = 'block';
    updateHealthBar();
  }

  function updateHealthBar() {
    const pct = Math.max(0, (health / maxHealth) * 100);
    healthBarInnerEl.style.width = `${pct}%`;
  }

  function updatePhase() {
    const pct = health / maxHealth;
    el.classList.remove('phase-1', 'phase-2', 'phase-3');
    if (pct > 0.66)      el.classList.add('phase-1');
    else if (pct > 0.33) el.classList.add('phase-2');
    else                 el.classList.add('phase-3');
  }

  /**
   * 尝试命中 BOSS
   * @returns {{x:number, y:number}|null} 命中返回中心点，未命中返回 null
   */
  function tryHit(x, y, range) {
    if (!active) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const bossRadius = Math.max(r.width, r.height) / 2;
    const dist = Math.hypot(cx - x, cy - y);

    return dist < range + bossRadius ? { x: cx, y: cy } : null;
  }

  function takeDamage(info) {
    if (!active) return;
    health -= info.damage;
    updateHealthBar();
    updatePhase();

    // 受击闪白
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');

    if (health <= 0) defeat();
  }

  function defeat() {
    active = false;
    el.classList.add('defeated');

    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    if (onDefeatCallback) onDefeatCallback({ x: cx, y: cy });

    setTimeout(() => {
      el.style.display = 'none';
      el.classList.remove('defeated', 'hit', 'phase-1', 'phase-2', 'phase-3');
      healthBarEl.style.display = 'none';
    }, 550);
  }

  function isActive() { return active; }
  function onDefeat(fn) { onDefeatCallback = fn; }
  function getMaxHealth() { return maxHealth; }
  function getHealth() { return health; }

  return {
    init, setMode, spawn,
    tryHit, takeDamage, isActive, onDefeat,
    getMaxHealth, getHealth
  };
})();
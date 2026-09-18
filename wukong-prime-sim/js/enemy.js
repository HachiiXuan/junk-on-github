/**
 * 敌人系统
 * 刷怪 + 怪物管理 + 击杀计数 + BOSS 触发信号
 */
const EnemySystem = (function () {
  'use strict';

  const MODES = {
    normal: { spawnInterval: 1000, maxMonsters: 50,  label: '普通模式：1 秒 / 只 · 上限 50' },
    steel:  { spawnInterval: 500,  maxMonsters: 100, label: '钢铁之路：0.5 秒 / 只 · 上限 100' }
  };

  const MONSTER_IMAGES = [
    'images/monster1.png',
    'images/monster2.png',
    'images/monster3.png'
  ];

  const BOSS_THRESHOLD = 50;

  let monsters = [];
  let spawnTimer = null;
  let killCount = 0;
  let lastBossTier = 0;

  let onKillCallback = null;
  let onBossTriggerCallback = null;

  let config = { ...MODES.normal };

  const ground = () => document.getElementById('ground');

  function spawn() {
    if (monsters.length >= config.maxMonsters) return;

    const m = document.createElement('div');
    m.classList.add('monster');

    const img = MONSTER_IMAGES[Math.floor(Math.random() * MONSTER_IMAGES.length)];
    m.style.backgroundImage = `url('${img}')`;
    m.style.setProperty('--x', Math.random());

    const g = ground();
    const h = g.offsetHeight;
    const bottom = h * 0.55 + Math.random() * h * 0.35;
    m.style.bottom = `${bottom}px`;

    g.appendChild(m);
    monsters.push(m);
  }

  function removeMonster(m) {
    if (m.parentNode) m.parentNode.removeChild(m);
    monsters = monsters.filter(item => item !== m);
  }

  function getMonstersInRange(x, y, range) {
    const hit = [];
    for (const m of monsters) {
      const r = m.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist < range) hit.push({ monster: m, x: cx, y: cy });
    }
    return hit;
  }

  /** 随机取一只存活怪物（分身用） */
  function getRandomMonster() {
    if (monsters.length === 0) return null;
    return monsters[Math.floor(Math.random() * monsters.length)];
  }

  function killMonster(m) {
    removeMonster(m);
    killCount++;
    if (onKillCallback) onKillCallback(killCount);

    const tier = Math.floor(killCount / BOSS_THRESHOLD);
    if (tier > lastBossTier) {
      lastBossTier = tier;
      if (onBossTriggerCallback) onBossTriggerCallback(tier);
    }
  }

  function startTimer() {
    clearInterval(spawnTimer);
    spawnTimer = setInterval(spawn, config.spawnInterval);
  }

  function start() {
    if (spawnTimer) return;
    startTimer();
  }

  function stop() {
    clearInterval(spawnTimer);
    spawnTimer = null;
  }

  function setMode(mode) {
    const preset = MODES[mode] || MODES.normal;
    config = { ...preset };
    if (spawnTimer) startTimer();
    while (monsters.length > config.maxMonsters) {
      removeMonster(monsters[0]);
    }
  }

  function getModeInfo(mode) {
    return MODES[mode] || MODES.normal;
  }

  function onKill(fn) { onKillCallback = fn; }
  function onBossTrigger(fn) { onBossTriggerCallback = fn; }
  function getKillCount() { return killCount; }
  function getConfig() { return { ...config }; }

  return {
    start, stop, spawn,
    setMode, getModeInfo, getConfig,
    getMonstersInRange, getRandomMonster, killMonster,
    getKillCount, onKill, onBossTrigger,
    BOSS_THRESHOLD
  };
})();
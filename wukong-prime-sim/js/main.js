/**
 * 主入口：初始化 / 事件绑定 / 震地流程编排 / 设置面板 / BOSS / 分身 / 国际化
 */
(function () {
  'use strict';

  // 玩家猴子时序
  const MONKEY_FALL_MS  = 500;
  const AFTER_IMPACT_MS = 500;
  const MONKEY_RISE_MS  = 500;

  // 分身时序
  const CLONE_FALL_MS         = 500;
  const CLONE_AFTER_IMPACT_MS = 300;
  const CLONE_RISE_MS         = 500;
  const CLONE_ATTACK_INTERVAL = 1500; // 每次动作结束后，再等这么久才发起下一次

  // DOM
  const monkey       = document.getElementById('monkey');
  const cloneMonkey  = document.getElementById('monkey-clone');
  const killCounter  = document.getElementById('kill-counter');
  const landingSound = document.getElementById('landing-sound');
  const risingSound  = document.getElementById('rising-sound');

  // 设置控件
  const purpleCard     = document.getElementById('purple-card');
  const summonClone    = document.getElementById('summon-clone');
  const attackRange    = document.getElementById('attack-range');
  const attackRangeVal = document.getElementById('attack-range-value');
  const steelPath      = document.getElementById('steel-path');
  const modeHint       = document.getElementById('mode-hint');
  const langToggle     = document.getElementById('lang-toggle');

  const panelToggle = document.getElementById('settings-toggle');

  // 状态
  let isMonkeyActive   = false;
  let cloneActive      = false;
  let cloneBusy        = false;
  let cloneTimer       = null;
  let currentKillCount = 0;

  function getAttackRange() {
    return parseInt(attackRange.value, 10) || 200;
  }

  function playSound(audio) {
    if (!audio) return;
    try {
      const node = audio.cloneNode();
      node.volume = audio.volume;
      const p = node.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  // ============================================================
  //  国际化：把翻译应用到界面
  // ============================================================
  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = I18n.t(el.getAttribute('data-i18n'));
    });

    killCounter.textContent = I18n.t('kills', { n: currentKillCount });
    modeHint.textContent    = I18n.t(steelPath.checked ? 'modeSteel' : 'modeNormal');
    langToggle.textContent  = I18n.t('langButton');
  }

  // ============================================================
  //  玩家震地
  // ============================================================
  function slam(x, y) {
    if (isMonkeyActive) return;
    isMonkeyActive = true;

    const R = getAttackRange();

    monkey.style.display = 'block';
    monkey.style.left = `${x}px`;
    monkey.style.top = '-150px';
    void monkey.offsetWidth;

    monkey.style.top = `${y}px`;

    setTimeout(() => {
      playSound(landingSound);
      Effects.slamImpact(x, y, R);
      applyDamage(x, y, R);

      setTimeout(() => {
        monkey.style.top = '-150px';
        playSound(risingSound);

        setTimeout(() => {
          monkey.style.display = 'none';
          isMonkeyActive = false;
        }, MONKEY_RISE_MS);
      }, AFTER_IMPACT_MS);
    }, MONKEY_FALL_MS);
  }

  // ============================================================
  //  伤害判定：先打 BOSS，再清怪
  // ============================================================
  function applyDamage(x, y, range) {
    const isPurple = purpleCard.checked;

    if (BossSystem.isActive()) {
      const hit = BossSystem.tryHit(x, y, range);
      if (hit) {
        const info = DamageSystem.roll(isPurple);
        Effects.showDamageText(hit.x, hit.y, info);
        BossSystem.takeDamage(info);
      }
    }

    const hits = EnemySystem.getMonstersInRange(x, y, range);
    for (const { monster, x: mx, y: my } of hits) {
      const info = DamageSystem.roll(isPurple);
      Effects.showDamageText(mx, my, info);
      EnemySystem.killMonster(monster);
    }
  }

  // ============================================================
  //  分身系统
  // ============================================================
  function getCloneTarget() {
    if (BossSystem.isActive()) {
      const bossEl = document.getElementById('boss');
      const r = bossEl.getBoundingClientRect();
      if (r.width > 0) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    const m = EnemySystem.getRandomMonster();
    if (m && m.isConnected) {
      const r = m.getBoundingClientRect();
      if (r.width > 0) {
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  }

  /**
   * 分身一次震地
   * 攻击范围 / 紫卡模式全部跟随设置面板
   * 落地有音效，起飞无音效
   * 动作完成后自动调度下一次（递归 setTimeout，避免 setInterval 错拍）
   */
  function cloneSlam() {
    if (cloneBusy || !cloneActive) return;

    const target = getCloneTarget();
    if (!target) {
      // 场上无目标：稍后再试
      if (cloneActive) cloneTimer = setTimeout(cloneSlam, CLONE_ATTACK_INTERVAL);
      return;
    }

    cloneBusy = true;
    const R = getAttackRange();

    cloneMonkey.style.display = 'block';
    cloneMonkey.style.left = `${target.x}px`;
    cloneMonkey.style.top = '-150px';
    void cloneMonkey.offsetWidth;

    cloneMonkey.style.top = `${target.y}px`;

    setTimeout(() => {
      playSound(landingSound);            // 分身落地音效
      Effects.slamImpact(target.x, target.y, R);
      applyDamage(target.x, target.y, R);

      setTimeout(() => {
        cloneMonkey.style.top = '-150px'; // 分身起飞：无音效

        setTimeout(() => {
          cloneMonkey.style.display = 'none';
          cloneBusy = false;

          // 动作全部结束后，再等一个间隔调度下一次
          if (cloneActive) {
            cloneTimer = setTimeout(cloneSlam, CLONE_ATTACK_INTERVAL);
          }
        }, CLONE_RISE_MS);
      }, CLONE_AFTER_IMPACT_MS);
    }, CLONE_FALL_MS);
  }

  function startClone() {
    if (cloneActive) return;
    cloneActive = true;
    // 首次攻击延迟 400ms，避免和玩家同时落地
    cloneTimer = setTimeout(cloneSlam, 400);
  }

  function stopClone() {
    cloneActive = false;
    cloneBusy = false;
    clearTimeout(cloneTimer);
    cloneTimer = null;
    cloneMonkey.style.display = 'none';
    cloneMonkey.style.top = '-150px';
  }

  // ============================================================
  //  事件
  // ============================================================
  function onClick(e) {
    if (e.target.closest('#settings-panel')) return;
    if (e.target.closest('#settings-toggle')) return;
    slam(e.clientX, e.clientY);
  }

  function initSettings() {
    // 语言切换
    langToggle.addEventListener('click', () => {
      I18n.toggle();
    });

    // 攻击范围
    attackRangeVal.textContent = attackRange.value;
    attackRange.addEventListener('input', () => {
      attackRangeVal.textContent = attackRange.value;
    });

    // 召唤分身
    summonClone.addEventListener('change', () => {
      if (summonClone.checked) startClone();
      else stopClone();
    });

    // 钢铁之路
    steelPath.addEventListener('change', () => {
      const mode = steelPath.checked ? 'steel' : 'normal';
      EnemySystem.setMode(mode);
      BossSystem.setMode(mode);
      modeHint.textContent = I18n.t(steelPath.checked ? 'modeSteel' : 'modeNormal');
    });

    // 面板开合
    panelToggle.addEventListener('click', () => {
      document.body.classList.toggle('panel-open');
    });
  }

  function init() {
    // 1. 先注册语言变化回调，再初始化 i18n
    I18n.onChange(applyTranslations);
    I18n.init();

    BossSystem.init();
    BossSystem.setMode('normal');

    document.addEventListener('click', onClick);
    initSettings();

    EnemySystem.onKill((count) => {
      currentKillCount = count;
      killCounter.textContent = I18n.t('kills', { n: count });
    });

    EnemySystem.onBossTrigger((tier) => {
      EnemySystem.stop();
      BossSystem.spawn(tier);
    });

    BossSystem.onDefeat(({ x, y }) => {
      Effects.slamImpact(x, y, 260);
      setTimeout(() => Effects.slamImpact(x, y, 200), 130);
      setTimeout(() => Effects.slamImpact(x, y, 140), 260);
      setTimeout(() => EnemySystem.start(), 400);
    });

    EnemySystem.start();

    // 2. 首次应用翻译
    applyTranslations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
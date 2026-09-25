import { CONFIG } from '../config.js';
import { clamp } from '../util.js';
import { FX, flash, shockwave, airRing, burstSphere, sparks, chargeGather, castingFlare } from '../render/fx.js';
import { Figures } from '../world/figures.js';
import { Crystal } from '../world/crystal.js';
import { Settings } from '../settings.js';
import { Audio } from '../audio.js';
import { CORE_FX, later, deliverOrbs, fireBeams, callMeteors, detonateBurst, arcChain,
  placeField, placeRunes, summonSatellites, scatterOrbs, radialBeams } from './effects.js';

const MAX_DEPTH = 3;
const MAX_DEPTH_BRUTE = 4;

/**
 * 施法引擎
 *   法术核心  → 全局属性
 *   释放方式  → 投送 / 铺场 / 附着
 * 每次「命中」都会广播给所有释放方式，由它们自行决定是否继续派生，
 * 于是组合效果是"涌现"出来的，而不是硬编码的配对表。
 */
export const Engine = {
  spell: null,
  cooldown: 0,
  onDamage: null,
  onStats: null,
  history: [],

  setSpell(spell) {
    this.spell = spell;
    if (spell) Crystal.setColor(spell.coreDef.color);
  },

  get ready() { return !!this.spell && this.cooldown <= 0; },

  update(dt) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
  },

  /** 释放；返回 {ok, reason} */
  cast(target) {
    const spell = this.spell;
    if (!spell) return { ok: false, reason: 'empty' };
    if (this.cooldown > 0) return { ok: false, reason: 'cooldown' };

    /* 关键：立刻把落点拷成独立向量。
       调用方传进来的往往是复用的临时向量（每帧随鼠标改写），
       若不拷贝，施法前摇结束后读到的会是"松手时鼠标的位置"。 */
    const aim = target.clone();

    const chargeTime = CONFIG.crystal.chargeTime + 0.05 * spell.complexity;
    this.cooldown = CONFIG.crystal.cooldown + 0.05 * spell.complexity;

    /* 解除性能限制：放开派生预算、特效数上限与递归深度。
       只在过载模式下生效（开关也只在过载模式里显示），普通模式行为不变。 */
    const brute = Settings.uncapped && !!spell.overload;

    const ctx = {
      spell,
      core: spell.coreDef,
      counts: spell.counts,
      colors: spell.colors,
      origin: Crystal.group.position,
      target: aim.clone(),
      maxDepth: brute ? MAX_DEPTH_BRUTE : MAX_DEPTH,
      /* 派生预算：过载模式（最多 30 槽）会算出很大的复杂度，默认封顶保护帧率 */
      budget: brute ? (34 + 18 * spell.complexity) : Math.min(150, 34 + 18 * spell.complexity),
      spent: 0,
      impacts: 0,
      afterBudget: 0,     // 预算耗尽之后仍然结算的命中数
      maxSpread: 0,
      trace: [],
      stats: { hits: 0, kills: 0, damage: 0 },
      onHit: this.onDamage,
      onStats: this.onStats,
      damageAt: d => spell.damageAt(d),
      radiusAt: d => spell.radiusAt(d),
      /** 统一伤害入口：所有释放方式都从这里结算，统计才不会漏 */
      hurt(point, radius, damage, opts) {
        const res = Figures.hurt(point, radius, damage, opts);
        this.stats.hits += res.hits;
        this.stats.kills += res.kills;
        this.stats.damage += res.damage;
        if (this.onStats) this.onStats(this.stats);
        return res;
      },
      spend(n = 1) {
        if (this.budget < n) { this.trace.push('no-budget'); return false; }
        /* 画面里已有大量特效时停止继续派生（解除限制后不再拦） */
        if (!brute && FX.count > 240) { this.trace.push('fx-limit'); return false; }
        this.budget -= n;
        this.spent += n;
        return true;
      },
      impact(p, d, full = true) { impact(ctx, p, clamp(d | 0, 0, ctx.maxDepth), full); },
    };

    Crystal.aimAt(aim);
    Crystal.startCharge(chargeTime);
    chargeGather(Crystal.group.position, spell.colors.core, 6.5, chargeTime, 30);
    Audio.unlock();
    Audio.charge(spell.core, chargeTime);

    this.lastCtx = ctx;   // 调试用

    later(chargeTime, () => {
      Crystal.fire();
      Audio.fire(spell.core);
      castingFlare(Crystal.group.position, spell.colors.core, 2.4);
      dispatch(ctx, aim);
    });

    this.history.unshift({ name: spell.name, color: spell.coreDef.color, t: performance.now() });
    if (this.history.length > 6) this.history.pop();

    return { ok: true };
  },
};

/* ============================================================ */

function dispatch(ctx, target) {
  const c = ctx.counts;
  let delivered = false;
  ctx.trace.push('dispatch:' + JSON.stringify(c));

  /* ---- 铺场类：先在地面布下持续区域 ---- */
  if (c.field) { placeField(ctx, target, c.field); delivered = true; }
  if (c.rune) { placeRunes(ctx, target, c.rune, 0); delivered = true; }

  /* ---- 纯爆裂：原地引爆 ---- */
  if (c.burst && !c.orb && !c.beam && !c.barrage) {
    later(0.2, () => ctx.impact(target, 0, true));
    delivered = true;
  }

  /* ---- 召唤类 ---- */
  if (c.orbit) { summonSatellites(ctx, c.orbit); delivered = true; }

  /* ---- 投送类 ---- */
  if (c.barrage) {
    callMeteors(ctx, target, c.barrage, 1 + Math.floor(c.barrage / 2), 0, 3.2 + c.barrage * 0.75);
    delivered = true;
  }
  if (c.beam) { fireBeams(ctx, target, c.beam); delivered = true; }
  if (c.orb) { deliverOrbs(ctx, target, c.orb); delivered = true; }

  /* ---- 只有核心 / 只有 meta 方式：核心脉冲 ---- */
  if (!delivered) {
    later(0.14, () => ctx.impact(target, 0, true));
  }
}

/* ============================================================
 *  命中 —— 组合涌现的核心
 * ============================================================ */

function impact(ctx, point, depth, full) {
  /* 预算只用来限制"继续派生"，绝不能拿来卡伤害与特效 ——
     否则 29 个同方式瞬间吃光预算后，后半段落地的东西会全部变成空响。 */
  const canSpawn = ctx.budget > 0;
  if (canSpawn) ctx.budget -= 1;
  else ctx.afterBudget += 1;
  ctx.impacts += 1;
  /* 记录"主投送"命中点离锁定落点最远有多远（用于验证射线不会横扫场地） */
  if (depth === 0) {
    const spreadD = Math.hypot(point.x - ctx.target.x, point.z - ctx.target.z);
    if (spreadD > (ctx.maxSpread || 0)) ctx.maxSpread = spreadD;
  }

  const core = ctx.core;
  const radius = ctx.radiusAt(depth);
  const damage = ctx.damageAt(depth);

  /* ---------------- 视觉分级：越深层的派生越"轻"，避免画面糊掉 ------------- */
  const heavy = full && depth === 0;
  const medium = full && depth === 1;

  if (heavy) {
    flash(point, ctx.colors.core, radius * 0.42, 0.28);
    shockwave(point, ctx.colors.core, radius, 0.55);
    burstSphere(point, ctx.colors.core, radius * 0.42, 0.36);
    airRing(point.clone().setY(0.55), ctx.colors.core, radius * 0.7, 0.38);
  } else if (medium) {
    flash(point, ctx.colors.core, radius * 0.3, 0.24);
    shockwave(point, ctx.colors.core, radius * 0.8, 0.45);
  } else {
    sparks(point, 7, ctx.colors.core, { speed: 6, up: 3, size: 0.13, life: 0.45, gravity: 9 });
  }

  if (depth <= 1) {
    const coreFx = CORE_FX[core.key];
    if (coreFx) coreFx(ctx, point, radius);
  } else {
    sparks(point, 5, ctx.colors.core, { speed: 5, up: 3, size: 0.1, life: 0.4, gravity: 8 });
  }

  /* ---------------- 结算 ---------------- */
  ctx.hurt(point, radius, damage, {
    status: core.status,
    knock: full ? 1 : 0.6,
    color: ctx.colors.core,
    onHit: ctx.onHit,
    minFactor: 0.45,
  });

  Audio.impact(core.key, radius);

  FX.shake((heavy ? 0.03 : 0.012) + Math.min(0.09, radius * 0.011));

  /* ---------------- 派生（只有「完整命中」才继续触发） ---------------- */
  if (!full || depth > ctx.maxDepth - 2 || !canSpawn) return;

  const c = ctx.counts;
  const deep = depth === 0;      // 第一层派生保留全量，第二层减半

  /* 爆裂 → 连锁引爆 */
  if (c.burst && ctx.spend()) detonateBurst(ctx, point, deep ? c.burst : 1, depth);

  /* 雷链 → 电弧跳跃 */
  if (c.chain && ctx.spend()) arcChain(ctx, point, deep ? c.chain : Math.max(1, c.chain - 1), depth);

  /* 领域 → 留下持续区域 */
  if (c.field && depth === 0 && ctx.spend()) placeField(ctx, point, c.field);

  /* 符文 → 刻下延时符文 */
  if (c.rune && depth === 0 && ctx.spend()) placeRunes(ctx, point, c.rune, depth);

  /* 轰击 → 落点召来陨星 */
  if (c.barrage && ctx.spend()) {
    const waves = deep ? c.barrage : Math.max(1, Math.ceil(c.barrage / 2));
    callMeteors(ctx, point, waves, deep ? 1 + Math.floor(c.barrage / 2) : 1,
      depth + 1, 2.4 + c.barrage * 0.55);
  }

  /* 球体 → 散裂出追踪光球 */
  if (c.orb && ctx.spend()) scatterOrbs(ctx, point, deep ? c.orb : Math.min(c.orb, 2), depth);

  /* 射线 → 向四周迸出光矛 */
  if (c.beam && ctx.spend()) radialBeams(ctx, point, deep ? c.beam : 1, depth);

  /* 环绕 → 命中会短暂强化卫星 */
  if (c.orbit) {
    sparks(point, 6, ctx.colors.orbit, { speed: 6, up: 3, size: 0.11, life: 0.5, gravity: 6 });
  }
}

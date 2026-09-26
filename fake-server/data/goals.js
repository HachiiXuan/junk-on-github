/* ==========================================================================
   data.goals —— 目标池
   扩充方式：加一条，并在 js/ai/actions.js 的 ACTIONS 里确认有对应动作。
   触发条件（trigger）支持的字段：
     hpBelow        生命低于
     hpAbove        生命高于
     minOnline      至少多少人在线
     memoryType     最近记忆里出现过某类型（如 death）
     mood           当前心情
   ========================================================================== */
(function (FS) {
  'use strict';

  FS.data.goals = {
    list: [
      {
        id: 'explore',
        priority: 1,
        weight: 0.30,
        durationTicks: [1200, 2600],      // 5 ~ 11 真实分钟
        actions: ['move', 'gather'],
        describe: 'walk around and see what is out there',
      },
      {
        id: 'trade',
        priority: 2,
        weight: 0.28,
        durationTicks: [900, 2000],
        actions: ['speak', 'trade', 'move'],
        require: { minOnline: 2 },
      },
      {
        id: 'teamup',
        priority: 2,
        weight: 0.18,
        durationTicks: [1200, 2400],
        actions: ['speak', 'move'],
        require: { minOnline: 2 },
      },
      {
        id: 'survive',
        priority: 4,
        weight: 0.95,
        durationTicks: [400, 1200],
        actions: ['move', 'wait', 'fight'],
        interrupt: true,
        trigger: { hpBelow: 45 },
      },
      {
        id: 'idle',
        priority: 1,
        weight: 0.10,
        durationTicks: [600, 1500],
        actions: ['wait', 'move'],
      },

      /* ---------------- v0.2：离开相关 ---------------- */
      {
        id: 'eat',
        priority: 3,
        weight: 0.85,
        durationTicks: [600, 1800],       // 吃饭/休息 2.5 ~ 7.5 分钟
        actions: ['move', 'wait', 'speak'],
        trigger: { playAboveMs: 'eatAfterMs' },
      },
      {
        id: 'logout',
        priority: 4,
        weight: 0.95,
        durationTicks: [400, 1200],
        actions: ['logout', 'speak', 'wait'],
        trigger: { playAboveMs: 'logoutAfterMs' },
      },
    ],
    byId: {},
  };

  /* ==========================================================================
     不由"随机抽目标"产生、而是**被事件触发**的目标。
     ⚠️ 它们必须也进 byId —— 事件触发方（如 faction.onMemberKilled 的"护短复仇"）
     要按 id 取定义，只放在 deferred 数组里会取不到，
     结果就是"复仇"这个功能从 v0.3 声明到 v1.1 一直没真正生效过。
     ========================================================================== */
  FS.data.goals.deferred = [
    {
      id: 'revenge',
      priority: 3,
      durationTicks: [1500, 4000],
      triggered: true,          // 标记：只能被事件挂上，不参与随机抽取
      note: '触发条件：同伙被杀 / 自己被杀的仇恨记忆',
    },
  ];

  /* byId 要覆盖 list + deferred 两部分：
     前者给随机抽目标用，后者给事件触发用。 */
  FS.data.goals.list.forEach(function (g) {
    FS.data.goals.byId[g.id] = g;
  });
  FS.data.goals.deferred.forEach(function (g) {
    FS.data.goals.byId[g.id] = g;
  });
})(window.FS);

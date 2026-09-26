/* ==========================================================================
   data.topics —— 话题模板
   --- 扩充方式（不需要改任何引擎代码） ---

   1) 加一个新话题：复制下面任意一个块，改 id，然后在 topics/index.js 里加一行。
   2) 加台词：往对应数组里加字符串即可（越多越不容易重复）。
   3) 加变量取值：改 vars 里的 source，或直接写数组。
        source 可选：items / places / threats / weather / moods / roles
   4) 让某个目标更容易开场某个话题：改 TOPIC_GOAL_MAP。

   --- 字段说明 ---
   id           话题 id（locale 里的 topic.<id>.* 必须同名）
   weight       被抽中的基础权重
   trigger:
     minOnline  至少多少人在线
     weather    允许的天气（空 = 任意）
     place      允许的地点（空 = 任意）
     timeOfDay  'day' / 'night'
     goal       哪些目标下优先（配合 TOPIC_GOAL_MAP）
   vars         变量池，{ 名: { source:'items' } } 或 { 名: ['a','b'] }
   messages     消息序列，见下
   endWhen      { timeoutTicks } 实例最长存活时间

   --- messages 里每条消息的字段 ---
   from         'initiator' | 'responder'   （由谁发）
   lines        ['topic.<id>.<段>']          台词池的 key（随机取一条）
   chance       0~1，本 tick 是否发的概率（默认 1）
   delayTicks   发下一条前的等待 [min,max]；initiator 的首条会被忽略（立即发）
   condition    角色自身条件，不满足则跳过本条：
                  affection  '>120' / '<80' 等，针对对方
                  hasItem    true / false
                  hpBelow / hpAbove / mood / place
   results      本条真正发出去时才结算：
                  affection 对对方的好感变化（数字）
                  memory    { type, key, importance, affect }

   允许同一个 from 连续出现多条 —— 输出时是平铺的，不需要轮换。
   ========================================================================== */
(function (FS) {
  'use strict';

  FS.data.topics = [
    /* ---------------- 打招呼 ---------------- */
    {
      id: 'greet',
      weight: 1.0,
      trigger: { minOnline: 2, goal: ['idle', 'explore'] },
      vars: {},
      messages: [
        { from: 'initiator', lines: 'topic.greet.opener', delayTicks: [6, 30] },
        {
          from: 'initiator',
          lines: 'topic.greet.openerFollow',
          chance: 0.35,
          delayTicks: [20, 60],
        },
        {
          from: 'responder',
          lines: 'topic.greet.reply',
          delayTicks: [10, 55],
        },
        {
          from: 'responder',
          lines: 'topic.greet.replyFollow',
          chance: 0.4,
          delayTicks: [16, 50],
        },
        {
          from: 'initiator',
          lines: 'topic.greet.ack',
          chance: 0.3,
          delayTicks: [18, 55],
        },
      ],
      endWhen: { timeoutTicks: 420 },
    },

    /* ---------------- 聊天气 ---------------- */
    {
      id: 'weather',
      weight: 0.9,
      trigger: { minOnline: 2, weather: ['rain', 'thunder', 'fog'] },
      vars: {},
      messages: [
        { from: 'initiator', lines: 'topic.weather.opener', delayTicks: [6, 30] },
        { from: 'responder', lines: 'topic.weather.reply', delayTicks: [10, 60] },
        {
          from: 'initiator',
          lines: 'topic.weather.followup',
          chance: 0.5,
          delayTicks: [20, 70],
        },
        {
          from: 'responder',
          lines: 'topic.weather.reply',
          chance: 0.25,
          delayTicks: [18, 60],
        },
      ],
      endWhen: { timeoutTicks: 400 },
    },

    /* ---------------- 交易（最复杂，带好感分支） ----------------
       weight 决定"这场对话是不是交易"。它同时也是交易日志的来源，
       所以它的权重实际决定了"X 和 Y 交易了 Z"在控制台占多大比例。
       1.05 → 0.45：32 人世界里原来的权重会让交易行占掉近三成日志。 */
    {
      id: 'trade',
      weight: 0.45,
      trigger: { minOnline: 2, goal: ['trade'] },
      vars: {
        item: { source: 'items' },
        item2: { source: 'items' },
      },
      messages: [
        // 1) 发起者开口求物
        { from: 'initiator', lines: 'topic.trade.opener', delayTicks: [6, 30] },

        // 2) 回应者给答复：带 branch 标记，整条链里同一 branch 只会采用一条
        {
          from: 'responder',
          lines: 'topic.trade.accept',
          branch: 'answer',
          delayTicks: [12, 60],
          condition: { hasItem: true, affection: '>115' },
          sets: { traded: true },
          results: {
            affection: 4,
            memory: { type: 'trade', key: 'mem.tradeDone', importance: 0.4, affect: 3 },
          },
        },
        {
          from: 'responder',
          lines: 'topic.trade.refuse',
          branch: 'answer',
          delayTicks: [12, 60],
          results: {
            affection: -3,
            memory: { type: 'trade', key: 'mem.tradeRefused', importance: 0.35, affect: -3 },
          },
        },
        /* 翻旧账式的拒绝：**必须有真凭据**才说。
           "上次那事儿还没算清呢"如果无条件出现，就指向一个不存在的"上次" ——
           观众会觉得角色在胡言乱语。 */
        {
          from: 'responder',
          lines: 'topic.trade.refuseHard',
          branch: 'answer',
          condition: { badBloodWithPartner: true },
          delayTicks: [12, 60],
          results: {
            affection: -6,
            memory: { type: 'trade', key: 'mem.tradeRefused', importance: 0.45, affect: -5 },
          },
        },

        // 3) 成了就约地点（同一个人连发第二句）
        {
          from: 'responder',
          lines: 'topic.trade.meet',
          chance: 0.6,
          delayTicks: [18, 55],
          when: { flag: 'traded' },
        },

        // 4) 发起者道谢 —— 只有这一场真的成交才会出现
        {
          from: 'initiator',
          lines: 'topic.trade.thanks',
          chance: 0.6,
          delayTicks: [16, 60],
          when: { flag: 'traded' },
        },
      ],
      endWhen: { timeoutTicks: 520 },
    },

    /* ---------------- 闲聊 ---------------- */
    {
      id: 'smalltalk',
      /* 从 0.85 降到 0.60：它的台词池最大、条件最松（只要 2 人在线），
         权重高的时候会一个人占掉三成以上的对话（实测 37/68 条）。
         压下来之后新增的话题才有出场机会。 */
      weight: 0.60,
      trigger: { minOnline: 2 },
      vars: {
        place: { source: 'places' },
        item: { source: 'items' },
      },
      messages: [
        { from: 'initiator', lines: 'topic.smalltalk.opener', delayTicks: [6, 34] },
        { from: 'responder', lines: 'topic.smalltalk.reply', delayTicks: [12, 65] },
        {
          from: 'initiator',
          lines: 'topic.smalltalk.followup',
          chance: 0.55,
          delayTicks: [20, 70],
        },
        {
          from: 'responder',
          lines: 'topic.smalltalk.followup',
          chance: 0.3,
          delayTicks: [18, 60],
        },
      ],
      endWhen: { timeoutTicks: 480 },
    },

    /* ---------------- 抱怨 ---------------- */
    {
      id: 'complain',
      weight: 0.8,
      trigger: { minOnline: 2, mood: ['annoyed', 'scared'] },
      vars: {
        place: { source: 'places' },
        threat: { source: 'threats' },
      },
      messages: [
        { from: 'initiator', lines: 'topic.complain.opener', delayTicks: [6, 30] },
        { from: 'responder', lines: 'topic.complain.reply', delayTicks: [12, 60] },
        {
          from: 'responder',
          lines: 'topic.complain.reply',
          chance: 0.3,
          delayTicks: [18, 60],
        },
        {
          from: 'initiator',
          lines: 'topic.complain.followup',
          chance: 0.5,
          delayTicks: [20, 70],
        },
      ],
      endWhen: { timeoutTicks: 460 },
    },

    /* ---------------- 求助 ---------------- */
    {
      id: 'help',
      weight: 0.75,
      trigger: { minOnline: 2, hpBelow: 75 },
      vars: {
        place: { source: 'places' },
        item: { source: 'items' },
        threat: { source: 'threats' },
      },
      messages: [
        { from: 'initiator', lines: 'topic.help.opener', delayTicks: [6, 26] },
        { from: 'responder', lines: 'topic.help.reply', delayTicks: [10, 50] },
        {
          from: 'responder',
          lines: 'topic.help.reply',
          chance: 0.25,
          delayTicks: [16, 50],
        },
        {
          from: 'initiator',
          lines: 'topic.help.followup',
          chance: 0.55,
          delayTicks: [18, 60],
          results: {
            affection: 6,
            memory: { type: 'dialogue', key: 'mem.talk', importance: 0.45, affect: 4 },
          },
        },
      ],
      endWhen: { timeoutTicks: 500 },
    },

    /* ---------------- 提起死者 / 传说（v0.3） ----------------
       触发条件里用 trace: true 表示"世界上至少有一条痕迹"。
       台词里的 {dead} 是死者名字，{cause} 是死因，都由痕迹带出。 */
    {
      id: 'trace',
      weight: 0.55,
      trigger: { minOnline: 2, trace: true },
      vars: {},
      messages: [
        { from: 'initiator', lines: 'topic.trace.opener', delayTicks: [6, 30] },
        { from: 'responder', lines: 'topic.trace.reply', delayTicks: [12, 55] },
        {
          from: 'initiator',
          lines: 'topic.trace.followup',
          chance: 0.5,
          delayTicks: [18, 60],
          results: { affection: 2 },
        },
        {
          from: 'responder',
          lines: 'topic.trace.reply',
          chance: 0.25,
          delayTicks: [18, 60],
        },
      ],
      endWhen: { timeoutTicks: 460 },
    },

    /* ---------------- 议论控制台（v0.4） ----------------
       闭环：控制台敲了命令 → 角色留下高重要性记忆 → 这里把记忆说出来。
       触发条件 `consoleMemory: true` 表示"这个角色自己记得控制台干过什么"。
       台词里的 {cmd} 是他记得的那次命令。 */
    {
      id: 'consoleTalk',
      weight: 0.9,
      /* minOnline: 1 —— 被控制台踢过的人上线后发现场上只剩别人，
         只有一个人在线的场景也需要能说出口。 */
      trigger: { minOnline: 1, consoleMemory: true },
      vars: {},
      messages: [
        {
          from: 'initiator',
          lines: 'topic.consoleTalk.opener',
          delayTicks: [6, 30],
        },
        {
          from: 'responder',
          lines: 'topic.consoleTalk.doubt',
          chance: 0.55,
          delayTicks: [12, 55],
        },
        {
          from: 'responder',
          lines: 'topic.consoleTalk.agree',
          chance: 0.45,
          delayTicks: [12, 55],
        },
        {
          from: 'initiator',
          lines: 'topic.consoleTalk.followup',
          chance: 0.5,
          delayTicks: [18, 60],
          results: { affection: 3 },
        },
      ],
      endWhen: { timeoutTicks: 460 },
    },

    /* ---------------- 装备闲聊（v1.0） ---------------- */
    {
      id: 'gear',
      weight: 0.8,
      trigger: { minOnline: 2 },
      vars: {
        item: { source: 'items' },
        item2: { source: 'items' },
      },
      messages: [
        { from: 'initiator', lines: 'topic.gear.opener', delayTicks: [6, 28] },
        { from: 'responder', lines: 'topic.gear.reply', delayTicks: [12, 55] },
        {
          from: 'initiator',
          lines: 'topic.gear.followup',
          chance: 0.55,
          delayTicks: [18, 60],
          results: { affection: 2 },
        },
        {
          from: 'responder',
          lines: 'topic.gear.reply',
          chance: 0.3,
          delayTicks: [18, 60],
        },
      ],
      endWhen: { timeoutTicks: 440 },
    },

    /* ---------------- 饿了 / 找吃的（v1.0） ---------------- */
    {
      id: 'food',
      weight: 0.85,
      trigger: { minOnline: 2, goal: ['eat', 'survive'] },
      vars: {
        item: { source: 'items' },
        place: { source: 'places' },
      },
      messages: [
        { from: 'initiator', lines: 'topic.food.opener', delayTicks: [6, 26] },
        { from: 'responder', lines: 'topic.food.reply', delayTicks: [10, 50] },
        {
          from: 'initiator',
          lines: 'topic.food.followup',
          chance: 0.5,
          delayTicks: [16, 55],
          results: { affection: 3 },
        },
      ],
      endWhen: { timeoutTicks: 400 },
    },

    /* ---------------- 问路（v1.0） ---------------- */
    {
      id: 'directions',
      weight: 0.7,
      trigger: { minOnline: 2, goal: ['explore'] },
      vars: {
        place: { source: 'places' },
        place2: { source: 'places' },
      },
      messages: [
        { from: 'initiator', lines: 'topic.directions.opener', delayTicks: [6, 30] },
        { from: 'responder', lines: 'topic.directions.reply', delayTicks: [12, 55] },
        {
          from: 'initiator',
          lines: 'topic.directions.thanks',
          chance: 0.7,
          delayTicks: [16, 50],
          results: { affection: 3 },
        },
      ],
      endWhen: { timeoutTicks: 400 },
    },

    /* ---------------- 天黑了（v1.0，只在夜里） ---------------- */
    {
      id: 'night',
      weight: 0.9,
      trigger: { minOnline: 2, timeOfDay: ['night'] },
      vars: {
        place: { source: 'places' },
        threat: { source: 'threats' },
      },
      messages: [
        { from: 'initiator', lines: 'topic.night.opener', delayTicks: [6, 28] },
        { from: 'responder', lines: 'topic.night.reply', delayTicks: [12, 55] },
        {
          from: 'responder',
          lines: 'topic.night.reply',
          chance: 0.25,
          delayTicks: [18, 60],
        },
        {
          from: 'initiator',
          lines: 'topic.night.followup',
          chance: 0.5,
          delayTicks: [20, 65],
        },
      ],
      endWhen: { timeoutTicks: 440 },
    },

    /* ---------------- 怪物警告（v1.0） ---------------- */
    {
      id: 'danger',
      weight: 0.95,
      /* 危险话题在三类前提下都可能出现：血量低 / 天气差 / 在危险地点 */
      trigger: { minOnline: 2, hpBelow: 85 },
      vars: {
        threat: { source: 'threats' },
        place: { source: 'places' },
      },
      messages: [
        { from: 'initiator', lines: 'topic.danger.opener', delayTicks: [4, 18] },
        { from: 'responder', lines: 'topic.danger.reply', delayTicks: [8, 40] },
        {
          from: 'initiator',
          lines: 'topic.danger.followup',
          chance: 0.55,
          delayTicks: [14, 50],
          results: { affection: 4 },
        },
      ],
      endWhen: { timeoutTicks: 360 },
    },

    /* ---------------- 问对方接下来干嘛（v1.0） ---------------- */
    {
      id: 'plans',
      weight: 0.75,
      trigger: { minOnline: 2 },
      vars: {
        place: { source: 'places' },
        item: { source: 'items' },
      },
      messages: [
        { from: 'initiator', lines: 'topic.plans.opener', delayTicks: [6, 30] },
        { from: 'responder', lines: 'topic.plans.reply', delayTicks: [12, 55] },
        {
          from: 'initiator',
          lines: 'topic.plans.followup',
          chance: 0.6,
          delayTicks: [16, 55],
          results: { affection: 2 },
        },
        {
          from: 'responder',
          lines: 'topic.plans.reply',
          chance: 0.3,
          delayTicks: [18, 60],
        },
      ],
      endWhen: { timeoutTicks: 440 },
    },

    /* ---------------- 小团体 / 派系（v1.1） ----------------
       只有真的入了伙的人才会聊这些。台词里的 {faction} 是他的队伍名，
       {mate} 是另一个队友，{place} 是他们常待的地方。 */
    {
      id: 'faction',
      weight: 0.85,
      trigger: { minOnline: 2, faction: true },
      vars: {
        place: { source: 'places' },
        item: { source: 'items' },
      },
      messages: [
        { from: 'initiator', lines: 'topic.faction.opener', delayTicks: [6, 28] },
        { from: 'responder', lines: 'topic.faction.reply', delayTicks: [12, 55] },
        {
          from: 'initiator',
          lines: 'topic.faction.followup',
          chance: 0.55,
          delayTicks: [18, 60],
          results: { affection: 4 },
        },
        {
          from: 'responder',
          lines: 'topic.faction.recruit',
          chance: 0.3,
          delayTicks: [20, 65],
          results: { affection: 3 },
        },
      ],
      endWhen: { timeoutTicks: 460 },
    },

    /* ==================================================================
       v1.2 新增 10 个话题（用户要求"加 10 个对话"）。
       每个都是完整的一来一回，加台词只需往 locale 的对应数组里加字符串。
       ================================================================== */

    /* 11 合成 / 做东西 */
    {
      id: 'crafting',
      weight: 0.75,
      trigger: { minOnline: 2 },
      vars: { item: { source: 'items' }, item2: { source: 'items' } },
      messages: [
        { from: 'initiator', lines: 'topic.crafting.opener', delayTicks: [6, 28] },
        { from: 'responder', lines: 'topic.crafting.reply', delayTicks: [12, 55] },
        {
          from: 'initiator',
          lines: 'topic.crafting.followup',
          chance: 0.55,
          delayTicks: [18, 60],
          results: { affection: 2 },
        },
      ],
      endWhen: { timeoutTicks: 440 },
    },

    /* 12 装备耐久 / 损耗 */
    {
      id: 'durability',
      weight: 0.7,
      trigger: { minOnline: 2 },
      vars: { item: { source: 'items' } },
      messages: [
        { from: 'initiator', lines: 'topic.durability.opener', delayTicks: [6, 28] },
        { from: 'responder', lines: 'topic.durability.reply', delayTicks: [12, 55] },
        {
          from: 'responder',
          lines: 'topic.durability.reply',
          chance: 0.3,
          delayTicks: [18, 60],
        },
        {
          from: 'initiator',
          lines: 'topic.durability.followup',
          chance: 0.5,
          delayTicks: [20, 60],
        },
      ],
      endWhen: { timeoutTicks: 440 },
    },

    /* 13 战斗复盘 */
    {
      id: 'fightTalk',
      weight: 0.85,
      trigger: { minOnline: 2, hpBelow: 92 },
      vars: { threat: { source: 'threats' }, place: { source: 'places' } },
      messages: [
        { from: 'initiator', lines: 'topic.fightTalk.opener', delayTicks: [5, 24] },
        { from: 'responder', lines: 'topic.fightTalk.reply', delayTicks: [10, 45] },
        {
          from: 'initiator',
          lines: 'topic.fightTalk.followup',
          chance: 0.6,
          delayTicks: [16, 55],
          results: { affection: 3 },
        },
      ],
      endWhen: { timeoutTicks: 420 },
    },

    /* 14 累了 / 想休息 */
    {
      id: 'tired',
      weight: 0.8,
      trigger: { minOnline: 2, timeOfDay: ['night'] },
      vars: { place: { source: 'places' }, item: { source: 'items' } },
      messages: [
        { from: 'initiator', lines: 'topic.tired.opener', delayTicks: [6, 30] },
        { from: 'responder', lines: 'topic.tired.reply', delayTicks: [12, 55] },
        {
          from: 'responder',
          lines: 'topic.tired.reply',
          chance: 0.25,
          delayTicks: [18, 60],
        },
        {
          from: 'initiator',
          lines: 'topic.tired.followup',
          chance: 0.5,
          delayTicks: [20, 65],
        },
      ],
      endWhen: { timeoutTicks: 460 },
    },

    /* 15 营地 / 落脚点。
       注意不要写 `place: ['camp']` —— 那是"说话的人必须在营地"，
       而 32 人世界里大部分人在矿区/森林，这个条件实际上让话题永远抽不到。
       用 goal 之外的方式表达"和营地有关"：台词里提营地就够了。 */
    {
      id: 'base',
      weight: 0.8,
      trigger: { minOnline: 2 },
      vars: { item: { source: 'items' }, place: { source: 'places' } },
      messages: [
        { from: 'initiator', lines: 'topic.base.opener', delayTicks: [6, 28] },
        { from: 'responder', lines: 'topic.base.reply', delayTicks: [12, 55] },
        {
          from: 'initiator',
          lines: 'topic.base.followup',
          chance: 0.55,
          delayTicks: [18, 60],
          results: { affection: 3 },
        },
      ],
      endWhen: { timeoutTicks: 440 },
    },

    /* 16 交易市价 / 值不值 */
    {
      id: 'price',
      weight: 0.75,
      trigger: { minOnline: 2 },
      vars: { item: { source: 'items' }, item2: { source: 'items' } },
      messages: [
        { from: 'initiator', lines: 'topic.price.opener', delayTicks: [6, 28] },
        { from: 'responder', lines: 'topic.price.reply', delayTicks: [12, 55] },
        {
          from: 'responder',
          lines: 'topic.price.reply',
          chance: 0.3,
          delayTicks: [18, 60],
        },
        {
          from: 'initiator',
          lines: 'topic.price.followup',
          chance: 0.5,
          delayTicks: [20, 60],
          results: { affection: 2 },
        },
      ],
      endWhen: { timeoutTicks: 460 },
    },

    /* 17 分享发现 / 找到了什么 */
    {
      id: 'found',
      weight: 0.85,
      trigger: { minOnline: 2 },
      vars: { item: { source: 'items' }, place: { source: 'places' } },
      messages: [
        { from: 'initiator', lines: 'topic.found.opener', delayTicks: [5, 26] },
        { from: 'responder', lines: 'topic.found.reply', delayTicks: [10, 50] },
        {
          from: 'initiator',
          lines: 'topic.found.followup',
          chance: 0.55,
          delayTicks: [16, 55],
          results: { affection: 3 },
        },
      ],
      endWhen: { timeoutTicks: 440 },
    },

    /* 18 地图 / 边界（问"那外面有什么"） */
    {
      id: 'worldEdge',
      weight: 0.6,
      trigger: { minOnline: 2 },
      vars: { place: { source: 'places' } },
      messages: [
        { from: 'initiator', lines: 'topic.worldEdge.opener', delayTicks: [6, 30] },
        { from: 'responder', lines: 'topic.worldEdge.reply', delayTicks: [12, 55] },
        {
          from: 'initiator',
          lines: 'topic.worldEdge.followup',
          chance: 0.5,
          delayTicks: [18, 60],
        },
      ],
      endWhen: { timeoutTicks: 440 },
    },

    /* 19 抱怨延迟 / 卡 */
    {
      id: 'lag',
      weight: 0.6,
      trigger: { minOnline: 2 },
      vars: {},
      messages: [
        { from: 'initiator', lines: 'topic.lag.opener', delayTicks: [4, 20] },
        { from: 'responder', lines: 'topic.lag.reply', delayTicks: [8, 40] },
        {
          from: 'responder',
          lines: 'topic.lag.reply',
          chance: 0.3,
          delayTicks: [14, 50],
        },
        {
          from: 'initiator',
          lines: 'topic.lag.followup',
          chance: 0.45,
          delayTicks: [18, 55],
        },
      ],
      endWhen: { timeoutTicks: 400 },
    },

    /* 20 日常闲聊 / 天气之外的那种 */
    {
      id: 'smalltalk2',
      weight: 0.7,
      trigger: { minOnline: 2 },
      vars: { item: { source: 'items' } },
      messages: [
        { from: 'initiator', lines: 'topic.smalltalk2.opener', delayTicks: [6, 30] },
        { from: 'responder', lines: 'topic.smalltalk2.reply', delayTicks: [12, 55] },
        {
          from: 'initiator',
          lines: 'topic.smalltalk2.followup',
          chance: 0.5,
          delayTicks: [18, 60],
          results: { affection: 2 },
        },
        {
          from: 'responder',
          lines: 'topic.smalltalk2.reply',
          chance: 0.3,
          delayTicks: [20, 60],
        },
      ],
      endWhen: { timeoutTicks: 460 },
    },

    /* ---------------- 告别（下线前用，v0.2） ---------------- */
    {
      id: 'farewell',
      weight: 0.6,
      trigger: { minOnline: 2 },
      vars: {},
      messages: [
        { from: 'initiator', lines: 'topic.farewell.opener', delayTicks: [4, 16] },
        { from: 'responder', lines: 'topic.farewell.reply', delayTicks: [10, 45] },
        {
          from: 'initiator',
          lines: 'topic.farewell.thanks',
          chance: 0.7,
          delayTicks: [14, 45],
          results: {
            affection: 2,
          },
        },
        {
          from: 'responder',
          lines: 'topic.farewell.reply',
          chance: 0.25,
          delayTicks: [16, 45],
        },
      ],
      endWhen: { timeoutTicks: 400 },
    },

    /* ---------------- 组队 ---------------- */
    {
      id: 'teamup',
      weight: 0.7,
      trigger: { minOnline: 2, goal: ['teamup', 'explore'] },
      vars: { place: { source: 'places' } },
      messages: [
        { from: 'initiator', lines: 'topic.teamup.opener', delayTicks: [6, 30] },
        { from: 'responder', lines: 'topic.teamup.reply', delayTicks: [12, 60] },
        {
          from: 'initiator',
          lines: 'topic.teamup.followup',
          chance: 0.6,
          delayTicks: [20, 60],
          results: { affection: 5 },
        },
      ],
      endWhen: { timeoutTicks: 440 },
    },
  ];

  /* 目标 → 优先话题（没有匹配时回退到全部话题，保证永远有话可说） */
  FS.data.TOPIC_GOAL_MAP = {
    trade: ['trade', 'smalltalk'],
    teamup: ['teamup', 'greet', 'smalltalk'],
    explore: ['weather', 'smalltalk', 'greet'],
    survive: ['help', 'complain'],
    idle: ['greet', 'smalltalk', 'weather', 'complain'],
    revenge: ['complain'],
  };

  /* 话题索引 */
  FS.data.topicsById = {};
  FS.data.topics.forEach(function (t) { FS.data.topicsById[t.id] = t; });
})(window.FS);

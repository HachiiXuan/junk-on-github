/* ==========================================================================
   data.config —— 全局参数（手感旋钮集中在这里）
   想调"像不像真人"，基本只需要动这个文件。
   ========================================================================== */
(function (FS) {
  'use strict';

  FS.data.config = {
    /* ---------- 身份 ---------- */
    version: 'v0.1',
    seed: 20260214,               // 世界随机种子（固定 = 可复现）

    /* ---------- 时间 ---------- */
    tickMs: 250,                  // 逻辑 tick 固定步长（4 Hz）
    realMsPerGameHour: 120000,    // 游戏内 1 小时 = 2 真实分钟
    worldEpochHour: 6,            // 服务器创建时刻 = 游戏内 06:00
    clockScale: 60,               // 日志时间戳加速显示倍率（1 真实秒 = 1 日志分钟）
    maxBackfillMs: 6 * 3600 * 1000, // 离线快进上限 6 小时
    maxBackfillTicks: 90000,      // 快进硬上限（安全阀，防止极长离线卡住）
    minBackfillMs: 3000,          // 少于 3 秒的离开不生成历史
    minuteTickMs: 60000,          // 快进的"大跨步"粒度：1 真实分钟
    minuteTicks: 240,             // 1 真实分钟 = 多少逻辑 tick（60000 / tickMs）
    maxCatchUpTicks: 40,          // 单帧最多补 40 tick（10 秒），更多交给 backfill
    memorySweepTicks: 200,        // 记忆裁剪与心情收束的频率
    busBatchLimit: 32,            // 每 tick 最多处理多少条事件
    dayLengthGameHours: 24,

    /* ---------- 世界 ---------- */
    mapName: 'AURORA-01',
    maxPlayers: 32,               // 顶部显示 0/32
    weatherSwitchGameHours: [0.5, 3.0], // 天气持续时长区间（游戏小时）
    resourceRegenPerGameHour: 0.35,      // 资源点每小时回复比例

    /* ---------- 渲染 ---------- */
    logBufferLines: 200,          // 控制台环形缓冲行数
    panelEventLines: 12,          // 面板"最近事件"条数
    panelRefreshTicks: 4,         // 面板刷新频率（每 4 tick = 1 秒）
    topbarRefreshTicks: 4,        // 顶栏刷新频率（时间显示到分钟，4 tick 足够）
    debugLogs: false,             // true 时把"回放了多少 tick"也打进控制台

    /* ---------- 角色手感 ---------- */
    typingMsPerChar: [70, 115],   // 每个字符耗时
    typingBaseMs: [500, 1200],    // 打字基础耗时
    typingJitterMs: [200, 900],   // 额外抖动
    typingMinMs: 800,             // 单条最短打字时间
    typingMaxMs: 14000,           // 单条最长打字时间（防止长句变十几秒）
    chatCooldownTicks: [40, 110], // 说完话的冷却（10s ~ 27s）
    idleChancePerTick: 0.06,      // 进入短挂机的概率
    idleTicks: [8, 60],           // 短挂机时长（2s ~ 15s）
    longIdleChancePerTick: 0.004, // 进入长挂机的概率
    longIdleTicks: [80, 400],     // 长挂机时长（20s ~ 100s）
    patienceTicks: 60,            // 等对方回应的耐心（15s）
    topicRepeatPenaltyTicks: 900, // 同一话题重复的抑制窗口（3.75 分钟）
    moveCooldownTicks: [20, 60],  // 移动冷却

    /* ---------- 决策 ---------- */
    decision: {
      minScore: 0.001,            // 分数下限保护，永不归零
      fatigueWindow: 6,           // 连续同类动作的统计窗口
      fatigueStrength: 0.5,       // 疲劳惩罚强度
      // 加性情境奖励，用来制造"突发感"
      bonusLowAffectionNearby: 0.30,
      bonusBigWorldEventRecent: 0.20,
      bonusJustCommanded: 0.50,
      bonusLowHpNearThreat: 0.40,
      bigWorldEventWindowGameHours: 1,
    },
    /* ---- 动作节奏（tick 数；4 tick = 1 秒）----
       这一组是"像不像真人"的核心：动作之间必须有停顿与呼吸。 */
    actionCooldownTicks: [8, 30],       // 说话后的停顿 2 ~ 7.5 秒
    waitCooldownTicks: [20, 90],        // 发呆 5 ~ 22 秒
    moveActionCooldownTicks: [12, 45],  // 走到一个地方后 3 ~ 11 秒
    tradeActionCooldownTicks: [60, 220],// 交易后 15 ~ 55 秒
    gatherActionCooldownTicks: [40, 140],
    fightActionCooldownTicks: [80, 300],

    personalityWeight: {          // 性格对动作的影响强度
      speak: 1.40, reply: 1.00, trade: 1.20,
      fight: 1.50, move: 0.90, gather: 0.60, wait: 0.50,
    },
    baseWeight: {
      /* 32 人世界里"说话"要更主动一些：0.95 → 1.20。
         否则交易/采集这类系统日志会把聊天挤到次要位置，
         而聊天才是"像有人在玩"的主要证据。 */
      move: 0.55, speak: 1.20, reply: 3.00,
      trade: 0.14, fight: 0.12, gather: 0.40, wait: 0.85,
    },

    /* ---------- 记忆 ---------- */
    memoryLimit: 50,              // 每角色记忆上限
    memoryHalfLifeGameHours: 4,   // 记忆权重半衰期（游戏小时）
    globalMemoryLimit: 30,        // 全局大事上限

    /* ---------- 死亡与复活（v0.3） ----------
       需求原文："生命归零 → 生成死亡事件 → 3 tick 后复活 → 保留记忆"。
       3 tick 只有 0.75 秒，观察者根本来不及看到"他死了"，
       所以这里放到 48~160 tick（12~40 秒）：能看清死亡提示，
       又不至于让人等太久。想要原文的即时复活就把这两个数改成 [3, 3]。 */
    respawnTicks: [48, 160],
    respawnHp: 60,                // 复活后的生命（不是满血，更像"刚爬起来"）
    legendMentions: 3,            // 被提及多少次后变成"传说"
    deathChancePerFight: 0.18,    // 每次战斗结算造成致命伤的概率（其余只掉血）
    /* 调试：把复活倒计时压到几秒，方便看流程 */
    debugDeath: false,
    respawnTicksDebug: [6, 16],

    /* ---------- 世界快照（v0.3） ---------- */
    snapshotVersion: 3,           // 快照格式版本；导入时用来做兼容判断
    snapshotMaxBytes: 8 * 1024 * 1024,  // 导入文件大小上限（防止误选大文件）

    /* ---------- 新人的"落地期" ----------
       刚上线的角色不可能立刻知道谁在哪儿、谁手上有什么，
       所以刚进来的一段时间里**不主动开话题、不发起交易**，只打招呼与观察。
       这段窗口就是老玩家眼里的"他刚上线，还在看"。
       单位是**游戏内分钟**（1 游戏分钟 = 2 真实秒），
       这样浏览器实时运行与模拟快进的行为完全一致。 */
    settleInGameMinutes: 60,      // 游戏内 1 小时 = 真实 2 分钟
    settleInGameMinutesDebug: 5,  // 调试：游戏内 5 分钟
    debugSettle: false,           // true 时用调试值
    /* 落地期内被禁止的动作（其余动作正常，让人看得出他在"看"） */
    settleInBlocked: ['trade'],

    /* ---------- 小团体 / 派系（v1.1） ----------
       需求原文："角色之间会形成关系（好感度）、记忆、冲突、小团体。"
       团体是从**真实好感**里长出来的，不是开局分配的：
       每 factionEvalTicks 检查一次，对没入伙的人看
         · 他对某个已有团体里 >= factionJoinNeeds 人有高好感 → 加入
         · 否则和另一个互相高好感的人一起成立新团体
       上限 factionMax 个，避免 32 个人裂成 20 个小圈子。 */
    factionEnabled: true,
    factionEvalTicks: 240,             // 每 60 真实秒评估一次
    factionMax: 6,                     // 最多几个团体
    factionMaxSize: 9,                 // 单个团体的最大人数
    factionMinSize: 3,                 // 在线人数少于这个就不组队
    /* 阈值是**实测标定**出来的，不是拍脑袋 —— 见 tools/calibrate-faction.js。
       实测分布（24 人在线、40 真实分钟、496 对关系）：
         时间    max  p50  p85  p90  p95  p99
          5m     106  100  100  100  100  106
         20m     118  100  104  106  106  112
         40m     121  100  106  107  110  115
       也就是说：25 分钟才刚有 p95 到 106，40 分钟 p95 才 110。
       所以：
         加入线 105（约 p85~p90）—— 25 分钟左右开始有人够得着
         建团线 107（约 p90~p95）—— 比加入线高，鼓励"先入伙"而不是"自己拉摊"
       曾经定过 120/125（一个团都长不出来）和 108/116（只长出一个 2 人小组）。 */
    factionJoinAffection: 105,         // 加入已有团体的门槛
    factionJoinNeeds: 2,               // 至少和团里几个人达到该门槛
    /* 团体越大越难进：每多一个成员，门槛涨这么多。
       没有这条，最大的那个团会把所有人吸进去（实测 9 人 vs 其余 0），
       世界只剩"一伙人"，就谈不上派系了。 */
    factionJoinScalePerMember: 4,
    /* 自己拉一摊的门槛。**必须明显高于加入线**，否则两个刚认识的人就各拉一摊，
       factionMax 很快被 2 人小组占满，之后就再也没有人入伙了 ——
       实测结果就是"6 个团体、每个 2 人"，完全没有派系感。
       用 p99 量级（40 分钟才 115）当日门槛，等于"真的一起出生入死过"才建团。 */
    factionFoundAffection: 113,
    /* 开局一段时间内不许建立新团体：先让"入伙"这条路走通 */
    factionFoundAfterGameMinutes: 480,
    factionDissolveBelow: 2,           // 人数掉到这个以下就解散
    /* 同团成员之间的好感下限。
       ⚠️ 这个值必须**大于等于 factionJoinAffection**，否则会出现
       一个非常隐蔽的死锁：入伙时关系是 105，入伙后被"下限 100"拉回 100，
       于是这个团再也没有人够得着 105 的门槛，永远停在 2 人。
       （这个 bug 实测卡了整整一轮调试。） */
    factionAffinityFloor: 106,
    factionMinTenureGameMinutes: 60,   // 至少玩过这么久才可能已经有小圈子
    factionPartnerBias: 2.2,           // 同伙被选为交易/组队伙伴的权重加成
    factionGrudgeAmount: 12,           // 同伙被打时，连带恶感

    /* ---------- 对话节奏（v0.4 梳理） ----------
       之前的问题：发起者在等回应时又开了新话题，于是同一个人的两句话
       中间夹着别人的回应，看起来像答非所问。这里把节奏约束住。 */
    awaitReplyMaxTicks: 260,      // 等回应最长多久超时（超过就放弃等待）
    /* 一场话题结束后隔多久才允许再开新话题。
       太长会让人觉得"这局没什么人说话"，太短就回到交叉的老问题。
       60~240 tick = 15~60 秒真实时间，配合"每个角色同时只在一场话题里"，
       既不会交叉，也不会冷场。 */
    topicCooldownTicks: [60, 240],
    maxActiveTopics: 3,           // 全局同时进行的话题上限（3 人世界够用）
    maxTopicsPerAgent: 1,         // 同一时刻每个角色只能在一个话题里
    denyTopicChanceWhileBusy: 0.85,  // 等回应期间试图开新话题时被拦下的概率
    /* 亲眼见过控制台动手的人，念叨这件事的权重加成（见 dialogue.pickTopic） */
    consoleTopicBoost: 3.5,

    /* ---------- 底层噪音（v1.0） ----------
       真实服务器的控制台从不安静：怪物刷新、区块加载、例行提示、
       谁挖到了什么。没有这层噪音，一眼就看出页面只在有人聊天时才动。 */
    noiseEnabled: true,
    noiseQuietGapTicks: 40,        // 安静至少这么多 tick 才可能出环境噪音（10 秒）
    /* 刚开机（含离线快进）的这段时间内**不出**环境噪音。
       没有这条，backfill 会在几毫秒里跑完几分钟的世界时间，
       那些 tick 全被判定为"很安静"，于是页面刚打开就吐一条凭空的噪音，
       而且它出现在"当前没有玩家在线"之前 —— 就是那个"左上角多一条消息"。 */
    noiseBootQuietTicks: 240,      // 60 秒真实时间
    noiseMaxChancePerTick: 0.020,  // 每 tick 出现环境噪音的概率上限
    noiseChancePerQuietTick: 0.0006, // 安静越久越容易出现
    /* 同一类噪音的冷却：防止"水和岩浆在洞穴相遇了"几分钟内又冒一条
       "水和岩浆在矿区相遇了"。600 tick = 150 秒真实时间。 */
    noiseRepeatCooldownTicks: 600,
    /* 玩家动作日志（谁获得了什么 / 谁杀了谁），不受安静条件限制 */
    noiseActionLogs: true,
    noiseActionLogEvery: 4,        // 每 N 次采集才打一条，避免 32 人刷屏
    noiseActionLogPerAgentCap: 30, // 每人每天的这类日志上限

    /* ---------- 加入 / 离开（v1.0：32 人世界） ----------
       目标节奏（用户要求）：几十秒内先聚起十几个人，几十分钟内缓慢爬到 30 左右。
       两条时间轴都挂在"累计真实游玩时间"上，所以离线期间不会催熟。 */
    debugJoins: false,
    /* 前 18 个人的"目标间隔"（真实毫秒）。init 会再叠加 joinMinGapMs*i 的错位量，
       所以实际到齐比这里累加的更晚。实测目标曲线：
         1 分钟 5 人 / 5 分钟 12 人 / 15 分钟 18 人 / 45 分钟 30 人左右。 */
    joinScheduleMs: [
      5000, 12000, 22000, 35000, 50000, 70000, 95000,
      120000, 150000, 185000, 220000, 260000, 300000,
      340000, 380000, 420000, 460000, 500000,
    ],
    joinScheduleMsDebug: [5000, 12000, 25000], // 调试：5s / 12s / 25s
    joinJitterMs: [8000, 28000],            // 目标时刻的抖动（让加入顺序对人来说随机）
    joinJitterMsDebug: [1000, 3000],
    joinMinGapMs: 16000,          // 两次加入之间的最小间隔
    joinMinGapMsDebug: 4000,
    /* 之后每次加入的间隔：把人数从 18 慢慢推到 30 左右。
       1.5~5.5 分钟一个 → 之后 25 分钟能再加 10 人上下。 */
    joinLongTailMs: [90000, 330000],
    joinLongTailMsDebug: [20000, 60000],  // 调试：20 ~ 60 秒
    joinCatchUpCapMs: 120000,     // 离线回来时，最多让下一个人 2 分钟后再来（避免同时涌进）
    joinFullRetryMs: 45000,       // 人满时的重试间隔（有人走了再放人）

    /* 加入后先"看一圈"再开始响应：
       用户要求 20~40 秒。否则会出现"一进来就跟人聊起来"，很假。
       和 settleInGameMinutes 的区别：这个是**响应延迟**（能不能搭话），
       settleInGameMinutes 是**落地期**（能不能主动交易）。 */
    joinRespondDelayMs: [20000, 40000],
    joinRespondDelayMsDebug: [2000, 5000],
    /* 测试用：整体关掉"加入后响应延迟"与"落地期"，方便构造马上就聊的场景 */
    debugNoWarmup: false,

    /* ---------- 离开（v0.2 / v1.0 调整） ----------
       需求：用户盯半小时可能才见到一次退出。所以不用硬门槛，
       而是"到点之后概率按 t² 缓慢抬升"，把大部分概率压在后期。

       v1.0 按用户要求把**回来的时长**改成正常量级：
         · 去吃饭   → 现实 10 分钟后回来
         · 去睡觉   → 现实 30 分钟后回来
         · 去上班   → 现实 20 分钟后回来
         · 有事走开 → 现实 8 分钟后回来
         · 连接超时 → 现实 6 分钟后回来
       原来统一的 rejoinDelayMs(5~25 分钟) 没法表达"吃饭比睡觉短"这件事。 */
    eatAfterMs: 60 * 60 * 1000,       // 玩满 1 小时后开始想吃饭/休息
    logoutAfterMs: 120 * 60 * 1000,   // 玩满 2 小时后开始想下线
    leaveRampMs: 45 * 60 * 1000,      // 概率从 0 抬到峰值所用的时长
    leaveMaxChancePerTick: 0.0016,    // 峰值概率（约每 3 分钟一次机会）
    leaveDelayTicks: [30, 90],        // 说完"我先下了"到真正退出（7.5 ~ 22 秒）
    signOffChance: 0.8,               // 退出前主动打招呼告别的概率
    farewellTopicChance: 0.45,        // 用 farewell 话题（有来有回）而不是单句的概率
    /* 每种离开理由对应的"多久回来"（真实毫秒） */
    rejoinDelayByReason: {
      eat:     [9 * 60 * 1000, 12 * 60 * 1000],   // 现实 10 分钟左右
      sleep:   [27 * 60 * 1000, 34 * 60 * 1000],  // 现实 30 分钟左右
      work:    [18 * 60 * 1000, 24 * 60 * 1000],  // 现实 20 分钟左右
      errand:  [6 * 60 * 1000, 11 * 60 * 1000],   // 现实 8 分钟左右
      timeout: [4 * 60 * 1000, 8 * 60 * 1000],    // 现实 6 分钟左右
    },
    rejoinDelayMs: [5 * 60 * 1000, 25 * 60 * 1000], // 兜底（没有按理由配的）
    /* 离开方式：正常退出 vs 连接超时。
       超时是突发事件 —— 不打招呼、不告别，直接断线（角色不可能预告自己掉线）。
       权重 7:3，正常退出占多数，同时让"连接超时"有足够机会被观察到。 */
    leaveModes: [
      { id: 'quit', w: 7 },
      { id: 'timeout', w: 3 },
    ],
    /* 调试模式：阈值压到几十秒，并且把概率放大到"看得见" */
    debugLeave: false,
    eatAfterMsDebug: 25 * 1000,
    logoutAfterMsDebug: 50 * 1000,
    leaveRampMsDebug: 30 * 1000,
    leaveMaxChancePerTickDebug: 0.06,   // 约每 4 秒一次机会
    leaveDelayTicksDebug: [12, 30],     // 说完"我先下了"3~7 秒后退出
    rejoinDelayMsDebug: [4000, 12000],  // 下线后 4 ~ 12 秒就回来
    offlineFirstGapMs: [90000, 240000],   // 新角色加入前的最小间隔

    /* ---------- 日志 ---------- */
    threads: {
      server: 'Server thread',
      chat: 'Async Chat Thread - #0',
      user: 'User thread',
    },
  };
})(window.FS);

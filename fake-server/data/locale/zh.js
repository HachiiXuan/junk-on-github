/* ==========================================================================
   data.locale.zh —— 中文文本包
   规则（见 docs/READMEv0.2.md §10）：
     · 与 en.js 的 key 必须一一对应，但句式各写各的，不做逐字翻译
     · 聊天台词要自然口语，不要机翻腔
     · 服务器日志保留 [INFO]/[WARN] 级别标签，只中文化正文
     · 新增内容时同时改 en.js 与 zh.js，并跑一次 FS.checkContent()
   ========================================================================== */
(function (FS) {
  'use strict';

  FS.data.locale = FS.data.locale || {};

  FS.data.locale.zh = {
    /* ---------------- 界面 ---------------- */
    ui: {
      online: '在线',
      weather: '天气',
      lang: '语言',
      debug: '调试',
      panelShow: '展开',
      panelHide: '收起',
      immersiveHint: 'Ctrl+B / F2 退出沉浸模式',
      inputPlaceholder: '输入命令，或输入 help',
      jumpLatest: '回到最新',
      historyEnd: '--- 以上为历史记录 ---',
      day: '第 {n} 天',
    },

    /* ---------------- 服务器日志 ---------------- */
    log: {
      boot: {
        replay: '你不在的时候回放了 {n} tick 的历史',
      },
      server: {
        join: '{name} 加入了游戏',
        joinFirst: '{name} 首次加入了游戏',
        leave: '{name} 退出了游戏',
        timeout: '{name} 连接超时',
        weather: '天气转为{weather}',
        lag: '服务器运行迟缓，已落后 {n}ms，是否负载过高？',
        saveStart: '正在保存世界（可能需要一点时间）',
        saveDone: '世界已保存',
        dayChange: '现在是第 {n} 天',
        tick: 'Tick {n}',
        noPlayers: '当前没有玩家在线',
      },
      world: {
        resourceRegen: '{place}：{kind} 正在恢复（{amount}）',
        quiet: '暂时没什么动静',
        deathNoticed: '有 {n} 人目击了 {name} 的死亡',
        traceLeft: '{name} 死了（{cause}），赛道上留下了他的痕迹',
        legend: '{name} 已经成了一个传说（被提起 {n} 次）',
      },
      /* 小团体 / 派系（v1.1）。小队名是玩家自己起的英文名，不进语言包 */
      faction: {
        founded: '{faction} 成立（{n} 人）',
        joined: '{name} 加入了 {faction}（{n} 人）',
        grudge: '{faction} 记住了这件事（{n} 人记恨）',
        rallied: '{faction} 的人开始报复',
      },

      /* 底层噪音：世界安静时的环境日志（v1.0） */
      noise: {
        mobSpawn: '已生成 {threat} x1（{place}）',
        mobSound: '附近传来{threat}的动静',
        weatherShift: '云层变化，可能转为{weather}',
        chunkLoad: '已加载区块（{place}）',
        serverTick: '服务器运行正常，本次心跳 {n} ms',
        waterLava: '水和岩浆在{place}相遇了',
        plantsGrow: '{place}的作物生长了',
        oreRespawn: '{place}的{item}已重新生成',
        villager: '村民在{place}附近发出声音',
        falcon: '一只猎鹰在头顶盘旋',
        playerHurt: '{name} 的生命值降到 {hp}',
      },

      /* 玩家动作日志（谁获得了什么，v1.0） */
      action: {
        gain: '{name} 获得了 {item} x{n}',
        craft: '{name} 制作了 {item}',
        pickup: '{name} 捡起了 {item}',
      },

      /* 死亡 / 复活（v0.3） */
      death: {
        died: '{name} 在{place}死亡（{cause}）',
        diedPermanent: '{name} 在{place}永久死亡（{cause}），不会再来',
        respawned: '{name} 在{place}复活了',
      },
      trade: {
        done: '{from} 和 {to} 交易了{item}',
      },
      command: {
        echo: '> {text}',
        unknown: '未知命令。输入 "help" 查看可用命令。',
        registered: '命令 "{cmd}" 已注册，但当前版本尚未启用。',
        helpHeader: '可用命令：',
        helpNote: '带 * 的命令在当前版本为只读。',
        listHeader: '当前在线 {online} 人，上限 {max} 人：',
        listLine: '  {name}（{place}）',
        statusHeader: '服务器状态：',
        statusLine: '  地图={map}  时间={time}  天气={weather}  在线={online}/{max}  tick={tick}',
        cleared: '控制台已清空。',
        langSet: '语言已切换为{lang}。',
        langUsage: '用法：lang <en|zh>',
        speedSet: '时间倍率已设为 {x}x。',
        notFound: '该玩家当前不在线。',
        error: '命令执行失败：{msg}',
        /* --- v0.2：会改变世界的命令 --- */
        usage: '用法：{usage}',
        noItem: '没有这个物品：{item}',
        kicked: '{name} 被管理员踢出了服务器',
        kickAll: '已踢出 {n} 名玩家',
        witnessed: '有 {n} 名玩家注意到控制台对 {name} 执行了“{cmd}”',
        affection: '{name} 对控制台的好感现在是 {value}/200',
        heard: '有 {n} 名玩家听到了',
        sayLine: '[服务器] {text}',
        whisper: '[服务器 → {name}] {text}',
        gave: '给了 {name} {n} 个{item}',
        healed: '{name} 已恢复（{from} → {to}）',
        killed: '{name} 被控制台打倒了',
        permadeathOn: '{name} 已设为永久死亡（再死一次就不会回来了）',
        permadeathOff: '{name} 的永久死亡已关闭',
        noSpawn: '没有可上线的离线玩家',
        alreadyOnline: '{name} 已经在线了',
        timeSet: '世界时间已设为 {time}',
        saved: '世界已保存',
        snapshotExported: '已导出快照 {name}（{kb} KB）',
        snapshotImported: '已导入快照：第 {day} 天，在线 {online} 人，痕迹 {traces} 条',
        snapshotErr: '快照操作失败：{error}',
        fastForward: '已快进 {min} 分钟真实时间（{n} tick，在线 {online} 人，耗时 {ms}ms）',
        needSnapshot: '用 save 导出快照、load 导入快照',
        reset: '世界已重置为初始状态',
      },
            cmdDesc: {
        help: '列出可用命令',
        list: '列出在线玩家',
        status: '输出服务器状态',
        clear: '清空控制台输出',
        lang: '切换界面语言',
        kick: '把玩家踢下线',
        kickall: '把所有玩家踢下线',
        kill: '杀死一个玩家（会产生死亡/痕迹/传说）',
        permadeath: '开关某个玩家的永久死亡',
        spawn: '让一个离线玩家立刻上线',        time: '设置世界时间',
        weather: '设置世界天气',
        speed: '设置时间倍率',
        save: '保存世界',
        load: '读取存档',
        reset: '重置世界',
      },
    },

    /* ---------------- 聊天行 ---------------- */
    chat: {
      line: '<{name}> {text}',
      typed: '{name} 正在输入…',
      // 下线前角色自己说的那句（可以提到去做什么，这是角色的话而不是系统的话）
      leave: {
        eat: '我去吃点东西，一会儿回来',
        sleep: '这边很晚了，睡了，晚安',
        work: '明天还要上班，先下了',
        errand: '临时有点事，先走一步',
      },
    },

    /* ---------------- 离开分类（系统提示用） ----------------
       刻意只有两类：服务器只能看到"正常退出"和"连接断了"，
       不可能知道玩家是去吃饭还是去睡觉 —— 那是角色自己在聊天里说的。
       掉线也是突发事件，角色不会提前打招呼。 */
    leaveKind: {
      quit: 'exited the game',
      timeout: 'connection timed out',
    },

    /* 离开的具体缘由：只用于角色台词与记忆措辞，不进系统日志 */
    leaveReason: {
      eat: '去吃饭了',
      sleep: '去睡觉了',
      work: '去上班了',
      errand: '有事走开了',
      timeout: '连接超时',
    },

    /* ---------------- 控制台动作的口语说法 ----------------
       角色议论控制台时用（topic.consoleTalk 的 {cmd}）。
       写成**动词短语**，放在"控制台……了"里读得通。 */
    cmd: {
      kick: '踢人',
      kickall: '清场',
      kill: '杀人',
      spawn: '塞人进来',
      time: '改时间',
      weather: '改天气',
      speed: '调速度',
      reset: '重置世界',
      help: '打字',
      list: '查在线名单',
      status: '看服务器状态',
      clear: '清屏',
      lang: '换语言',
      save: '存档',
      load: '读档',
      permadeath: '给人上永久死亡',
    },

    /* 死因分类（系统提示用，只有服务器能判定出来的几类） */
    deathCause: {
      pvp: '被其他玩家杀死',
      env: '意外死亡',
      console: '被控制台处决',
      mob: '被怪物杀死',
      fall: '摔死',
    },

    /* ---------------- 对话台词：话题 ---------------- */
    topic: {
      greet: {
        opener: [
          '有人吗',
          '我回来了',
          '早',
          '在吗在吗',
          '嗨',
        ],
        openerFollow: [
          '今天服务器挺冷清啊',
          '最近有人去矿区吗',
        ],
        reply: [
          '在',
          '嘿 {name}',
          '早啊',
          '来了来了',
          '我一直都在',
        ],
        replyFollow: [
          '没干嘛，随便转转',
          '挖了一整天矿',
        ],
        // 发起者的收尾：陈述句，避免和回应者的"在/来了"重复
        ack: [
          '好',
          '行',
          '知道了',
          '那就这样',
        ],
      },

      weather: {
        opener: [
          '又{weather}了',
          '这{weather}什么时候能停',
          '{weather}成这样，什么都看不见',
          '有人也因为{weather}被困住了吗',
        ],
        reply: [
          '是啊，烦死了',
          '别提了',
          '我还挺喜欢这种天气的',
          '我在{place}躲着，等停了再走',
        ],
        followup: [
          '我先回{place}了',
          '估计一会儿就停了',
        ],
      },

      trade: {
        opener: [
          '谁有多余的{item}',
          '求{item}，可以拿东西换',
          '{item}不够用了，有人能匀点吗',
          '想收{item}，我这儿有{item2}',
        ],
        ask: [
          '还要吗',
          '你在哪儿，我在{place}附近',
        ],
        accept: [
          '我这儿有一些，不过我想要点{item2}',
          '行，你来{place}，我给你',
          '能匀你一点',
        ],
        meet: [
          '你在哪儿，我在{place}附近',
          '我一会儿到{place}',
          '{place}见',
        ],
        refuse: [
          '自己想办法吧',
          '不行，我自己也要用',
          '这个我暂时不换',
        ],
        /* 翻旧账式拒绝：只在真的有过节时才说（见 data/topics.js 的条件） */
        refuseHard: [
          '上次那事儿还没算清呢',
          '你先说说上次的事',
          '跟你没什么好换的',
        ],
        thanks: [
          '谢了，欠你一次',
          '多谢',
          '太好了，帮大忙了',
        ],
        done: [
          '成交',
          '合作愉快',
          '还要的话再来找我',
        ],
      },

      smalltalk: {
        opener: [
          '大家都在忙什么',
          '这图是真大啊',
          '有点无聊说实话',
          '今天有人挖到好东西吗',
        ],
        reply: [
          '在{place}盖房子呢',
          '一直在{place}这边转',
          '没什么有意思的',
          '在找{item}',
        ],
        followup: [
          '我也一样',
          '一会儿可能去{place}看看',
          '祝你好运',
        ],
      },

      complain: {
        opener: [
          '又在{place}被弄死了',
          '东西全让{threat}爆了',
          '现在{threat}到处都是',
          '谁老把{place}的东西全扫走',
        ],
        reply: [
          '我看见了',
          '太惨了',
          '{place}现在确实凶',
          '还是待在营地附近吧',
        ],
        followup: [
          '我最近不打算再去了',
          '准备在{place}重新搞起',
        ],
      },

      help: {
        opener: [
          '有人在{place}附近吗，需要帮忙',
          '我在{place}卡住了，血不多了',
          '谁能把{item}送到{place}来',
        ],
        reply: [
          '马上来',
          '我这就过去，等我一下',
          '小心点，那一片有{threat}',
          '现在过不去，抱歉',
        ],
        followup: [
          '谢了，我欠你的',
          '出来了，没事了',
          '还被卡着，快点',
        ],
      },

      teamup: {
        opener: [
          '一起去{place}吗',
          '有人想去{place}吗',
          '外面太危险了，还是结伴走吧',
        ],
        reply: [
          '行，{place}见',
          '算我一个',
          '走着',
          '晚点吧',
        ],
        followup: [
          '我这就过去',
          '在{place}等我',
        ],
      },

      farewell: {
        opener: [
          '我先下了，{reason}',
          '撤了，{reason}',
          '今天到这儿，{reason}',
          '不玩了，{reason}',
        ],
        reply: [
          '拜拜',
          '回头见',
          '晚安',
          '行，慢走',
          '明天见',
        ],
        thanks: [
          '各位回见',
          '晚安',
          '一会儿再来',
        ],
      },

      /* 议论控制台：控制台敲过的命令会被角色说出来 */
      consoleTalk: {
        opener: [
          '刚才控制台是不是{cmd}了',
          '我好像看见控制台{cmd}',
          '控制台又{cmd}了，你们看见没',
        ],
        doubt: [
          '你眼花了吧',
          '别瞎说',
          '谁会用控制台干这个',
        ],
        agree: [
          '我也看见了',
          '对，日志里有',
          '不是第一次了',
        ],
        followup: [
          '反正别惹它',
          '希望别轮到我',
          '就当没看见吧',
        ],
      },

      /* ---------------- v1.0 新增 6 个话题 ---------------- */
      /* ============ v1.2 新增 10 个话题 ============ */

      crafting: {
        opener: [
          '想合个{item}，材料还差一点',
          '刚做出来一个{item}，还行',
          '谁知道{item}怎么合',
          '做{item}太费材料了',
        ],
        reply: [
          '得先有{item2}才行',
          '我这儿有多的{item}',
          '做那个不划算',
          '我一般直接捡现成的',
        ],
        followup: [
          '那我拿{item2}跟你换',
          '算了，先凑合',
          '回头教我一下',
        ],
      },

      durability: {
        opener: [
          '我的{item}快碎了',
          '这{item}真不经用',
          '{item}又坏了一把',
          '得再备一个{item}',
        ],
        reply: [
          '多带两把就好了',
          '{item}就是这么费',
          '我那个也快了',
          '省着点用吧',
        ],
        followup: [
          '回去再修一下',
          '下次多做几个',
          '先将就着',
        ],
      },

      fightTalk: {
        opener: [
          '刚才被{threat}围了，差点没跑掉',
          '{place}那边{threat}太多了',
          '我血还没回满',
          '刚打退一只{threat}',
        ],
        reply: [
          '你别一个人去那儿',
          '我上次也差点交代了',
          '先回{place}补一下',
          '那群东西不好惹',
        ],
        followup: [
          '现在不敢硬碰了',
          '还是结伴走吧',
          '回头一起去',
        ],
      },

      tired: {
        opener: [
          '有点困了',
          '今天挖得够多了',
          '{place}太远，跑一趟累死',
          '想回营地待着',
        ],
        reply: [
          '我也差不多',
          '再干一会儿就下',
          '天黑就别乱跑了',
          '回去把{item}放下再说',
        ],
        followup: [
          '那我先回去了',
          '明天再来',
          '你也早点歇',
        ],
      },

      base: {
        opener: [
          '营地这边东西快堆满了',
          '我把{item}都放营地了',
          '要不要在营地盖个东西',
          '营地那个箱子谁开的',
        ],
        reply: [
          '随便拿，别全拿完就行',
          '我那儿也一堆{item}',
          '先有地方放就不错',
          '回头一起收拾',
        ],
        followup: [
          '那我放你旁边',
          '分开放，免得乱',
          '缺什么跟我说',
        ],
      },

      price: {
        opener: [
          '{item}现在什么价',
          '拿{item}换{item2}划算吗',
          '这东西也太贵了',
          '谁那儿还有{item}',
        ],
        reply: [
          '差不多就行，别太计较',
          '我上次是两个换一个',
          '{item}现在不多',
          '你要是急就先拿去',
        ],
        followup: [
          '那还行，成交',
          '再想想',
          '我回头凑一下',
        ],
      },

      found: {
        opener: [
          '我在{place}挖到{item}了',
          '刚发现一个地方，全是{item}',
          '{place}那边有个洞',
          '这趟收获还行，都是{item}',
        ],
        reply: [
          '在哪儿，带我一个',
          '那种地方小心点',
          '我早去过了',
          '{place}我还没去过',
        ],
        followup: [
          '下次带你',
          '等我再去一趟',
          '我把位置记下了',
        ],
      },

      worldEdge: {
        opener: [
          '地图外面是什么',
          '有人走到过边界吗',
          '再往外还有地方吗',
          '一直往北会到哪',
        ],
        reply: [
          '走到头就是空的',
          '别走太远，回不来',
          '我试过，什么都没有',
          '说不定还有',
        ],
        followup: [
          '那算了，不去了',
          '改天试试',
          '还是在这附近安全',
        ],
      },

      lag: {
        opener: [
          '有点卡',
          '刚才那下是不是延迟了',
          '我这边画面一顿一顿的',
          '服务器今天有点不稳',
        ],
        reply: [
          '我也感觉到了',
          '还好吧',
          '过一会儿就好了',
          '你网的问题吧',
        ],
        followup: [
          '行，先这样',
          '重启一下试试',
          '能玩就行',
        ],
      },

      smalltalk2: {
        opener: [
          '你们玩这服多久了',
          '这服开多久了',
          '平时什么时候人多',
          '你一般都挖什么',
        ],
        reply: [
          '没多久，才来几天',
          '晚上人多一点',
          '随便挖，看运气',
          '我主要弄{item}',
        ],
        followup: [
          '那以后常见',
          '我也是刚来',
          '回头一起',
        ],
      },

      /* 小团体 / 派系（v1.1）：只有入伙的人才会说这些 */
      faction: {
        /* 注意：每个下标上的占位符必须与 en.js 完全一致（有测试在查） */
        opener: [
          '我们{faction}这趟去{place}',
          '我这边还有{faction}的人，一起吗',
          '和{mate}约好了去{place}',
          '我这边有{faction}的人，你那边几个',
        ],
        reply: [
          '我这边就我一个',
          '算我一个',
          '你们那人多吗',
          '我一个人也能挖',
          '那我去找你们',
        ],
        followup: [
          '人多好办事',
          '缺人手就喊{mate}',
          '回头把我们那摊子收拾一下',
          '一起走安全点',
        ],
        recruit: [
          '你要不要一起',
          '有兴趣就加进来',
          '一个人太费劲了',
        ],
      },

      gear: {
        opener: [
          '我的{item}快坏了',
          '刚做了一把{item}，还挺好用',
          '{item}有人要吗，我多做了',
          '你们都用什么{item}',
        ],
        reply: [
          '我一直用{item}',
          '{item}不经用，两天就没了',
          '够用就行',
          '我还没凑齐材料',
          '有富余的话给我留一个',
        ],
        followup: [
          '回头我拿{item2}跟你换',
          '材料太难搞了',
          '先凑合着用吧',
          '你那儿还有多的吗',
        ],
      },

      food: {
        opener: [
          '有点饿了，{place}有吃的吗',
          '谁有{item}，我拿东西换',
          '一整天没吃东西了',
          '背包里就剩点{item}了',
        ],
        reply: [
          '我这儿有{item}，来{place}拿',
          '刚吃完，没了',
          '去{place}看看，那边有',
          '自己想办法吧',
        ],
        followup: [
          '谢了，回头还你',
          '那我去{place}转转',
          '饿着也能撑一会儿',
        ],
      },

      directions: {
        opener: [
          '{place}怎么走',
          '我在找{place}',
          '从这儿去{place}要多久',
          '这附近有{place}吗',
        ],
        reply: [
          '往{place2}那边走',
          '我也不太认路',
          '跟着矿道走就到了',
          '有点远，路上小心',
          '刚去过，就在{place2}边上',
        ],
        thanks: [
          '好，谢了',
          '那我过去看看',
          '明白，走了',
        ],
      },

      night: {
        opener: [
          '天黑了，别乱跑',
          '晚上{place}那边全是{threat}',
          '我这没火把了，天太黑',
          '夜里视野太差了',
        ],
        reply: [
          '我就在营地待着',
          '确实，刚才还听见{threat}叫',
          '要不一起走',
          '黑着也能挖',
          '早点下吧',
        ],
        followup: [
          '等天亮再说',
          '我把火把插在门口了',
          '夜里{place}特别危险',
        ],
      },

      danger: {
        opener: [
          '{place}有{threat}，小心点',
          '我刚被{threat}打了',
          '别往{place}去，血不多了',
          '有人吗，{place}这边出事了',
        ],
        reply: [
          '我马上过去',
          '你先撤，别硬撑',
          '离{threat}远点',
          '我也快没血了',
          '撑住，我这就来',
        ],
        followup: [
          '谢了，差点交代在那儿',
          '先把血补上再说',
          '那地方以后不去了',
        ],
      },

      plans: {
        opener: [
          '接下来去哪儿',
          '你打算干嘛',
          '一起去{place}吗',
          '我这趟准备弄点{item}',
        ],
        reply: [
          '我准备去{place}',
          '挖点{item}就下',
          '还没想好',
          '先在营地歇会儿',
          '随便转转',
        ],
        followup: [
          '那就{place}见',
          '有需要喊我',
          '行，我先过去了',
          '路上碰到一起走',
        ],
      },

      trace: {
        opener: [
          '还记得{dead}吗',
          '有人知道{dead}后来怎么样了吗',
          '又路过{place}，想起{dead}了',
          '这儿以前死过人吧',
        ],
        reply: [
          '记得，{cause}',
          '别提了，那天我也在',
          '那事儿过去挺久了',
          '谁啊',
        ],
        followup: [
          '反正我是不敢去{place}了',
          '听说后来又出过事',
          '算了，别聊这个了',
          '希望他没事',
        ],
      },
    },

    /* ---------------- 记忆短语（面板 / 调试用） ---------------- */
    mem: {
      tradeDone: '和 {name} 交易了{item}',
      tradeRefused: '{name} 拒绝了交易',
      talk: '和 {name} 聊了几句',
      moved: '移动到了{place}',
      hurt: '在{place}受伤了',
      sawWeather: '天气转成了{weather}',
      command: '控制台对我执行了“{cmd}”',
      commandWitness: '控制台对 {name} 执行了“{cmd}”',
      death: '{name} 死在了{place}',
      legend: '还能听到关于 {name} 的传闻',
      left: '{name} 下线了（{reason}）',
      killedBy: '被 {name} 杀死了',
      diedEnv: '在{place}意外死了（{cause}）',
      sawDeath: '亲眼看到 {name} 死在{place}',
      sawConsole: '控制台执行了“{cmd}”',
      joinedFaction: '入伙了 {faction}',
      factionGrudge: '{name} 被 {who} 打了，这笔账记下了',
      wasCommanded: '控制台对我执行了“{cmd}”',
      consoleWitness: '控制台对 {name} 执行了“{cmd}”',
    },

    /* ---------------- 调试面板 ---------------- */
    panel: {
      world: '世界',
      events: '最近事件',
      agents: '角色列表',
      map: '地图',
      time: '时间',
      weather: '天气',
      online: '在线',
      tick: 'tick',
      nextJoin: '下一次加入',
      none: '--',
      colName: '名字',
      colGoal: '目标',
      colMood: '心情',
      colPlace: '位置',
      colAff: '好感',
      goal: '目标',
      mood: '心情',
      place: '位置',
      hp: '生命',
      affection: '好感',
      memories: '记忆',
      scores: '动作分数',
      scoresHint: '点击角色查看明细',
      scoresWhen: '{s} 秒前的决策（当时目标：{goal}）',
      scoresStale: '正在打字/挂机，尚未重新决策',
      speakBlocked: {
        awaiting: '正在等对方回话，先不插新话题',
        cooldown: '刚聊完一场，冷却中',
        settle: '刚上线，还在观察',
        warming: '刚进服务器，还没开始搭话',
        globalCap: '同时进行的话题已满',
        agentCap: '他已经在一个话题里了',
      },
      noScores: '暂无分数',
      state: '状态',
      faction: '团体',
      factionMates: '另外 {n} 人',
      archetype: '类型',
      /* 12 种性格原型的可读名称（数据里是英文 id） */
      arch: {
        social: '话痨', helper: '老好人', loner: '独行', raider: '好战',
        explorer: '探险', trader: '商人', builder: '宅家', coward: '胆小',
        gossip: '消息灵通', veteran: '老手', newbie: '新手', grump: '脾气差',
      },
      uptime: '在线时长',
      topic: '话题',
      typing: '打字中',
      idle: '挂机',
      recentMem: '最近记忆',
      foot: '开发者面板 · 点击角色行查看明细',
      weatherLeft: '剩余',
      stats: '累计',
      statSpoken: '发言',
      statTopics: '话题',
      statMoves: '移动',
      tuning: '实时调参',
      tuningHint: '改完立即作用于运行中的世界',
      tuningReset: '恢复调试开关',
      knobGroup: {
        weight: '动作权重',
        talk: '对话节奏',
        life: '生死与离开',
        debug: '调试开关',
      },
      tuningScale: '时间倍率',
      snapshot: '世界快照',
      snapshotHint: '刷新页面 = 新世界；想让世界延续就导出快照，之后导入回来',
      snapshotExport: '导出快照',
      snapshotImport: '导入快照',
      snapshotExportOk: '已导出 {name}（{kb} KB）',
      snapshotImportOk: '已导入：第 {day} 天，在线 {online} 人，痕迹 {traces} 条',
      snapshotErr: '导入失败：{error}',
      fastForward: '快进',
      fastForwardHint: '把"接下来 N 分钟真实时间"一次性算完并打进控制台',
      fastForwardBtn: '快进 {n} 分钟',
    },

    /* ---------------- 数据表译文 ---------------- */
    weather: { clear: '晴', rain: '下雨', thunder: '雷雨', fog: '起雾' },
    place: { camp: '营地', forest: '森林', mine: '矿区', river: '河边', ruins: '废墟', cave: '洞穴' },
    item: {
      wood: '木头', stone: '石头', iron: '铁', food: '食物', torch: '火把',
      rope: '绳子', potion: '药水', leather: '皮革', relic: '遗物',
    },
    /* 威胁池刻意不用有版权辨识度的标志性生物名，
       改用真实世界的野兽与劫匪（见 data/threats.js 顶部说明） */
    threat: {
      boar: '野猪', wolves: '狼群', spider: '蜘蛛', snake: '蛇', bear: '熊',
      mob: '一群野兽', bats: '蝙蝠',
      bandit: '劫匪', raider: '掠夺者',
      traps: '陷阱', fall: '摔落', dark: '黑暗', lava: '岩浆',
    },
    mood: { calm: '平静', annoyed: '烦躁', scared: '害怕', excited: '兴奋' },
    goal: {
      trade: '交易', teamup: '组队', explore: '探索',
      survive: '保命', revenge: '复仇', eat: '吃饭', logout: '下线',
      idle: '闲逛',
    },
    /* 角色昵称**不在这里** —— 32 个随机英文 ID 由 i18n.resolver('name', …)
       在运行时从名册里查（真人昵称本来也不翻译）。 */
    console: { name: '控制台' },
  };
})(window.FS);

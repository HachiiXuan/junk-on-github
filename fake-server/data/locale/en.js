/* ==========================================================================
   data.locale.en —— 英文文本包
   规则（见 docs/READMEv0.2.md §10）：
     · 中英各写一套，禁止逐字翻译；占位符名必须两边一致，词序可变
     · 聊天台词用小写、无句号收尾 —— 像真人快速打字
     · 服务器日志保持真实服务端腔调
     · 新增内容时同时改 en.js 与 zh.js，并跑一次 FS.checkContent()
   ========================================================================== */
(function (FS) {
  'use strict';

  FS.data.locale = FS.data.locale || {};

  FS.data.locale.en = {
    /* ---------------- 界面 ---------------- */
    ui: {
      online: 'online',
      weather: 'weather',
      lang: 'LANG',
      debug: 'DEBUG',
      panelShow: 'show',
      panelHide: 'hide',
      immersiveHint: 'Ctrl+B / F2 to exit',
      inputPlaceholder: 'type a command, or "help"',
      jumpLatest: 'jump to latest',
      historyEnd: '--- end of history ---',
      day: 'day {n}',
    },

    /* ---------------- 服务器日志 ---------------- */
    log: {
      boot: {
        replay: 'Replayed {n} ticks of history while you were away',
      },
      server: {
        join: '{name} joined the game',
        joinFirst: '{name} joined the game for the first time',
        leave: '{name} left the game',
        timeout: '{name} lost connection',
        weather: 'Weather changed to {weather}',
        lag: "Can't keep up! Is the server overloaded? Running {n}ms behind",
        saveStart: 'Saving the game (this may take a moment!)',
        saveDone: 'Saved the game',
        dayChange: 'It is now day {n}',
        tick: 'Tick {n}',
        noPlayers: 'No players online',
      },
      world: {
        resourceRegen: '{place}: {kind} regenerating ({amount})',
        quiet: 'nothing much happening',
        deathNoticed: '{n} player(s) witnessed the death of {name}',
        traceLeft: '{name} died ({cause}); a trace is left behind',
        legend: '{name} has become a legend (mentioned {n} times)',
      },
      /* 小团体 / 派系（v1.1）。小队名是玩家自己起的英文名，不进语言包 */
      faction: {
        founded: '{faction} formed ({n} members)',
        joined: '{name} joined {faction} ({n} members)',
        grudge: '{faction} will remember that ({n} holding a grudge)',
        rallied: '{faction} is out for payback',
      },

      /* 底层噪音：世界安静时的环境日志（v1.0） */
      noise: {
        /* 英文里不能写 "You hear bear nearby" —— 这些词单复数不一，
           用 "You hear ___ in the distance" 对单数/复数/短语都通顺 */
        mobSpawn: 'Spawned {threat} x1 ({place})',
        mobSound: 'You hear {threat} in the distance',
        weatherShift: 'Clouds shifting, {weather} incoming',
        chunkLoad: 'Chunk loaded ({place})',
        serverTick: 'Server running normally, tick took {n} ms',
        waterLava: 'Water met lava at {place}',
        plantsGrow: 'Crops grew at {place}',
        oreRespawn: '{item} regenerated at {place}',
        villager: 'A villager mumbles nearby ({place})',
        falcon: 'A falcon is circling overhead',
        playerHurt: '{name} is down to {hp} health',
      },

      /* 玩家动作日志（谁获得了什么，v1.0） */
      action: {
        gain: '{name} got {item} x{n}',
        craft: '{name} crafted {item}',
        pickup: '{name} picked up {item}',
      },

      /* 死亡 / 复活（v0.3） */
      death: {
        died: '{name} died at {place} ({cause})',
        diedPermanent: '{name} died permanently at {place} ({cause}) and will not return',
        respawned: '{name} respawned at {place}',
      },
      trade: {
        done: '{from} traded {item} with {to}',
      },
      command: {
        echo: '> {text}',
        unknown: 'Unknown command. Type "help" for help.',
        registered: "Command '{cmd}' is registered but not enabled in this build.",
        helpHeader: 'Available commands:',
        helpNote: 'Commands marked * are read-only in this build.',
        listHeader: 'There are {online} of a max of {max} players online:',
        listLine: '  {name}  ({place})',
        statusHeader: 'Server status:',
        statusLine: '  map={map}  time={time}  weather={weather}  online={online}/{max}  tick={tick}',
        cleared: 'Console cleared.',
        langSet: 'Language set to {lang}.',
        langUsage: 'Usage: lang <en|zh>',
        speedSet: 'Time scale set to {x}x.',
        notFound: 'That player is not online.',
        error: 'Command failed: {msg}',
        /* --- v0.2：会改变世界的命令 --- */
        usage: 'Usage: {usage}',
        noItem: 'No such item: {item}',
        kicked: '{name} was kicked from the server',
        kickAll: 'Kicked {n} player(s)',
        witnessed: '{n} player(s) noticed the console ran "{cmd}" on {name}',
        affection: '{name} now feels {value}/200 toward the console',
        heard: '{n} player(s) heard it',
        sayLine: '[Server] {text}',
        whisper: '[Server -> {name}] {text}',
        gave: 'Gave {n}x {item} to {name}',
        healed: 'Healed {name} ({from} -> {to})',
        killed: '{name} was struck down by the console',
        permadeathOn: '{name} is now on permanent death (next death is final)',
        permadeathOff: 'Permanent death disabled for {name}',
        noSpawn: 'No offline player to bring online',
        alreadyOnline: '{name} is already online',
        timeSet: 'World time set to {time}',
        saved: 'Game saved',
        snapshotExported: 'Exported snapshot {name} ({kb} KB)',
        snapshotImported: 'Imported snapshot: day {day}, {online} online, {traces} trace(s)',
        snapshotErr: 'Snapshot failed: {error}',
        fastForward: 'Skipped {min} real minutes ({n} ticks, {online} online, took {ms}ms)',
        needSnapshot: 'use save to export a snapshot, load to import one',
        reset: 'World reset to a fresh state',
      },
            cmdDesc: {
        help: 'list available commands',
        list: 'list online players',
        status: 'print world status',
        clear: 'clear the console output',
        lang: 'switch interface language',
        kick: 'disconnect a player',
        kickall: 'disconnect everyone',
        kill: 'kill a player (creates death/trace/legend)',
        permadeath: 'toggle permanent death for a player',
        spawn: 'bring an offline player online',        time: 'set the world time',
        weather: 'set the world weather',
        speed: 'set the time scale',
        save: 'save the world',
        load: 'load a saved world',
        reset: 'reset the world',
      },
    },

    /* ---------------- 聊天行 ---------------- */
    chat: {
      line: '<{name}> {text}',
      typed: '{name} is typing...',   // 调试面板用，控制台不显示
      // 下线前角色自己说的那句（可以提到去做什么，这是角色的话而不是系统的话）
      leave: {
        eat: 'im gonna go eat something, back later',
        sleep: 'its late here, going to sleep. night',
        work: 'gotta work tomorrow, logging off',
        errand: 'something came up, heading out',
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
      eat: 'went to eat',
      sleep: 'went to sleep',
      work: 'off to work',
      errand: 'had something to do',
      timeout: 'connection dropped',
    },

    /* ---------------- 控制台动作的口语说法（roleplay: 角色议论控制台时用） ---------------- */
    cmd: {
      kick: 'kick someone',
      kickall: 'kick everyone',
      kill: 'kill someone',
      spawn: 'force someone online',
      time: 'change the time',
      weather: 'change the weather',
      speed: 'change the speed',
      reset: 'reset the world',
      help: 'type commands',
      list: 'list players',
      status: 'check the status',
      clear: 'clear the screen',
      lang: 'switch language',
      save: 'save the world',
      load: 'load a save',
      permadeath: 'mark someone for permanent death',
    },

    /* 死因分类（系统提示用，只有服务器能判定出来的几类） */
    deathCause: {
      pvp: 'killed by another player',
      env: 'died in an accident',
      console: 'executed by the console',
      mob: 'killed by a mob',
      fall: 'fell to their death',
    },

    /* ---------------- 对话台词：话题 ---------------- */
    // v0.1 内容量：7 个话题。扩充时往对应数组里加字符串即可。
    topic: {
      greet: {
        opener: [
          'morning',
          'anyone around',
          'hey',
          'im back',
          'o/',
        ],
        openerFollow: [
          'server seems quiet today',
          'anyone been to the mines lately',
        ],
        reply: [
          'yo',
          'hey {name}',
          'morning',
          'sup',
          'im here',
        ],
        replyFollow: [
          'not much, just running around',
          'been mining all day honestly',
        ],
        // 发起者的收尾：陈述句，避免和回应者的"在/来了"重复
        ack: [
          'nice',
          'cool',
          'good to know',
          'alright',
        ],
      },

      weather: {
        opener: [
          '{weather} again',
          'this {weather} is getting old',
          'cant see anything in this {weather}',
          'anyone else stuck inside because of the {weather}',
        ],
        reply: [
          'yeah it sucks',
          'tell me about it',
          'i kinda like it',
          'staying in {place} until it stops',
        ],
        followup: [
          'gonna head back to {place}',
          'should clear up in a bit',
        ],
      },

      trade: {
        opener: [
          'anyone got spare {item}',
          'need {item}, will trade for it',
          'running low on {item}, anyone?',
          'looking for {item}, got {item2} to trade',
        ],
        ask: [
          'still need it?',
          'where do you want it, im near {place}',
        ],
        accept: [
          'i got some. need {item2} in return tho',
          'sure, come to {place} and ill drop it',
          'yeah i can spare a bit',
        ],
        meet: [
          'where are you, im near {place}',
          'ill be at {place} in a bit',
          'meet me at {place}',
        ],
        refuse: [
          'figure it out yourself',
          'nope, need mine',
          'not trading that right now',
        ],
        /* 翻旧账式拒绝：只在真的有过节时才说（见 data/topics.js 的条件） */
        refuseHard: [
          'not after what happened last time',
          'explain last time first',
          'nothing to trade with you',
        ],
        thanks: [
          'thanks, owe you one',
          'appreciate it',
          'nice, thats a big help',
        ],
        done: [
          'deal',
          'good trade',
          'come find me if you need more',
        ],
      },

      smalltalk: {
        opener: [
          'whats everyone working on',
          'this map is huge',
          'kinda bored ngl',
          'anyone found anything good today',
        ],
        reply: [
          'just building stuff at {place}',
          'been wandering around {place}',
          'nothing interesting',
          'trying to find {item}',
        ],
        followup: [
          'same honestly',
          'might go check {place} later',
          'good luck with that',
        ],
      },

      complain: {
        opener: [
          'got killed at {place} again',
          'lost all my stuff to a {threat}',
          'this {threat} is everywhere now',
          'who keeps taking everything from {place}',
        ],
        reply: [
          'saw that happen',
          'that sucks man',
          'yeah {place} is rough right now',
          'should stay near camp',
        ],
        followup: [
          'im not going back there for a while',
          'gonna rebuild at {place}',
        ],
      },

      help: {
        opener: [
          'anyone near {place}? need a hand',
          'stuck at {place}, low on health',
          'can someone bring {item} to {place}',
        ],
        reply: [
          'omw',
          'on my way, give me a minute',
          'careful, theres a {threat} around there',
          'cant right now sorry',
        ],
        followup: [
          'thanks, i owe you',
          'made it out, all good',
          'still stuck, hurry',
        ],
      },

      teamup: {
        opener: [
          'want to head to {place} together',
          'anyone up for {place}',
          'we should stick together out there',
        ],
        reply: [
          'sure, meet you at {place}',
          'im in',
          'yeah lets go',
          'maybe later',
        ],
        followup: [
          'heading over now',
          'wait for me at {place}',
        ],
      },

      farewell: {
        opener: [
          'im heading off, {reason}',
          'gonna log off, {reason}',
          'calling it here, {reason}',
          'ok im out, {reason}',
        ],
        reply: [
          'cya',
          'later',
          'o7',
          'alright, take care',
          'see you tomorrow',
        ],
        thanks: [
          'later guys',
          'night',
          'back in a bit',
        ],
      },

      /* 议论控制台：控制台敲过的命令会被角色说出来 */
      consoleTalk: {
        opener: [
          'did someone just use the console to {cmd}',
          'i think i saw the console {cmd}',
          'console {cmd} again, anyone else see that',
        ],
        doubt: [
          'youre seeing things',
          'dont make stuff up',
          'who would even do that',
        ],
        agree: [
          'i saw it too',
          'yeah its in the logs',
          'not the first time',
        ],
        followup: [
          'just dont get on its bad side',
          'hope its not my turn',
          'lets pretend we didnt see it',
        ],
      },

      /* ---------------- v1.0 新增 6 个话题 ---------------- */
      /* ============ v1.2 新增 10 个话题 ============ */

      crafting: {
        opener: [
          'tryna craft a {item}, short on mats',
          'just made a {item}, not bad',
          'anyone know how to craft {item}',
          '{item} eats so many materials',
        ],
        reply: [
          'you need {item2} first',
          'i got spare {item}',
          'not worth crafting that',
          'i just pick them up',
        ],
        followup: [
          'ill trade you {item2} for it',
          'whatever, ill make do',
          'show me how sometime',
        ],
      },

      durability: {
        opener: [
          'my {item} is about to break',
          'this {item} doesnt last at all',
          'broke another {item}',
          'need to bring a spare {item}',
        ],
        reply: [
          'carry two of them',
          '{item} is just like that',
          'mine is nearly done too',
          'go easy on it',
        ],
        followup: [
          'ill fix it back at base',
          'ill make a few next time',
          'itll hold for now',
        ],
      },

      fightTalk: {
        opener: [
          'got swarmed by {threat}, barely got out',
          'too many {threat} around {place}',
          'my health isnt back yet',
          'just fought off a {threat}',
        ],
        reply: [
          'dont go there alone',
          'i nearly died there too',
          'go heal up at {place} first',
          'those things dont mess around',
        ],
        followup: [
          'not picking that fight again',
          'we should travel together',
          'lets go together sometime',
        ],
      },

      tired: {
        opener: [
          'getting sleepy',
          'dug enough for today',
          '{place} is too far, wore me out',
          'wanna just sit at camp',
        ],
        reply: [
          'same here honestly',
          'one more run then im off',
          'dont wander once its dark',
          'drop your {item} off first',
        ],
        followup: [
          'im heading back then',
          'tomorrow again',
          'get some rest too',
        ],
      },

      base: {
        opener: [
          'camp is getting cluttered',
          'i dumped all my {item} at camp',
          'should we build something at camp',
          'who opened the chest at camp',
        ],
        reply: [
          'take what you need, leave some',
          'i got a pile of {item} too',
          'at least we have somewhere',
          'lets sort it out later',
        ],
        followup: [
          'ill put mine next to yours',
          'keep them separate, less mess',
          'tell me if youre short',
        ],
      },

      price: {
        opener: [
          'whats {item} going for',
          'is {item} for {item2} a fair trade',
          'that is way too expensive',
          'who still has {item}',
        ],
        reply: [
          'close enough, dont sweat it',
          'i did two for one last time',
          '{item} is scarce right now',
          'take it if youre in a hurry',
        ],
        followup: [
          'fine, deal',
          'let me think about it',
          'ill gather some first',
        ],
      },

      found: {
        opener: [
          'i dug up {item} at {place}',
          'found a spot, nothing but {item}',
          'theres a hole over at {place}',
          'decent haul this run, all {item}',
        ],
        reply: [
          'where, take me along',
          'be careful in places like that',
          'been there already',
          'i havent been to {place} yet',
        ],
        followup: [
          'ill show you next time',
          'let me go back once more',
          'i marked the spot',
        ],
      },

      worldEdge: {
        opener: [
          'whats past the edge of the map',
          'anyone made it to the border',
          'is there anything further out',
          'where do you end up going north',
        ],
        reply: [
          'its just empty out there',
          'dont go too far, you wont get back',
          'i tried, theres nothing',
          'maybe theres more',
        ],
        followup: [
          'forget it then',
          'ill try another day',
          'safer around here anyway',
        ],
      },

      lag: {
        opener: [
          'bit laggy',
          'did that just rubber band',
          'my screen keeps stuttering',
          'server feels unstable today',
        ],
        reply: [
          'i felt it too',
          'seems alright to me',
          'itll settle in a bit',
          'probably your connection',
        ],
        followup: [
          'alright, whatever',
          'try restarting',
          'playable at least',
        ],
      },

      smalltalk2: {
        opener: [
          'how long have you played here',
          'how old is this server',
          'when is it usually busy',
          'what do you usually mine',
        ],
        reply: [
          'not long, few days',
          'busier at night',
          'whatever i run into',
          'mostly {item}',
        ],
        followup: [
          'see you around then',
          'im new here too',
          'lets team up sometime',
        ],
      },

      /* 小团体 / 派系（v1.1）：只有入伙的人才会说这些 */
      faction: {
        /* 注意：每个下标上的占位符必须与 zh.js 完全一致（有测试在查） */
        opener: [
          '{faction} is heading to {place}',
          '{faction} is with me, coming',
          'meeting {mate} at {place}',
          'i got {faction} with me, how many on your side',
        ],
        reply: [
          'its just me on this side',
          'count me in',
          'how many of you are there',
          'i can mine solo fine',
          'ill come find you',
        ],
        followup: [
          'more hands is better',
          'shout {mate} if you need help',
          'we should sort our stash out',
          'safer if we travel together',
        ],
        recruit: [
          'you want in',
          'join us if youre interested',
          'solo is too slow',
        ],
      },

      gear: {
        opener: [
          'my {item} is about to break',
          'just made a {item}, works great',
          'anyone want a {item}, i made extra',
          'what {item} do you all use',
        ],
        reply: [
          'i still use a {item}',
          '{item} doesnt last, two days tops',
          'good enough is good enough',
          'still missing the materials',
          'save me one if you have spare',
        ],
        followup: [
          'ill trade you {item2} for it later',
          'materials are such a pain',
          'ill make do for now',
          'you got any spare',
        ],
      },

      food: {
        opener: [
          'getting hungry, any food at {place}',
          'anyone got {item}, ill trade',
          'havent eaten all day',
          'all i have left is some {item}',
        ],
        reply: [
          'i got {item}, come to {place}',
          'just ate, all out',
          'check {place}, they had some',
          'figure something out',
        ],
        followup: [
          'thanks, ill pay you back',
          'ill go check {place} then',
          'i can hold out a bit longer',
        ],
      },

      directions: {
        opener: [
          'how do i get to {place}',
          'im looking for {place}',
          'how long to {place} from here',
          'is there a {place} near here',
        ],
        reply: [
          'head past {place2}',
          'im not great with directions either',
          'follow the mine shafts',
          'its a walk, be careful',
          'just went, its next to {place2}',
        ],
        thanks: [
          'ok thanks',
          'ill go take a look',
          'got it, heading out',
        ],
      },

      night: {
        opener: [
          'its dark, dont wander off',
          '{place} is crawling with {threat} at night',
          'out of torches and i cant see a thing',
          'visibility is awful at night',
        ],
        reply: [
          'im staying at camp',
          'yeah i just heard a {threat}',
          'want to travel together',
          'you can mine in the dark',
          'log off early',
        ],
        followup: [
          'wait for daylight',
          'i put torches by the door',
          '{place} is rough at night',
        ],
      },

      danger: {
        opener: [
          '{threat} at {place}, watch out',
          'i just got hit by a {threat}',
          'stay away from {place}, im low',
          'anyone there, something happened at {place}',
        ],
        reply: [
          'on my way',
          'fall back, dont push it',
          'stay clear of the {threat}',
          'im nearly dead too',
          'hold on, coming',
        ],
        followup: [
          'thanks, almost lost it there',
          'healing up first',
          'not going back there',
        ],
      },

      plans: {
        opener: [
          'where to next',
          'what are you up to',
          'want to head to {place} together',
          'im going for some {item}',
        ],
        reply: [
          'im heading to {place}',
          'gonna mine some {item} and log off',
          'havent decided',
          'resting at camp for a bit',
          'just wandering',
        ],
        followup: [
          'meet you at {place} then',
          'shout if you need help',
          'ok, heading over',
          'ill join if i run into you',
        ],
      },

      trace: {
        opener: [
          'anyone remember {dead}',
          'what ever happened to {dead}',
          'walked past {place} again, thought about {dead}',
          'someone died around here before right',
        ],
        reply: [
          'yeah, {cause}',
          'dont remind me, i was there',
          'that was a while ago',
          'who',
        ],
        followup: [
          'im not going back to {place}',
          'heard there was more after that',
          'anyway, lets drop it',
          'hope theyre ok',
        ],
      },
    },

    /* ---------------- 记忆短语（面板 / 调试用） ---------------- */
    mem: {
      tradeDone: 'traded {item} with {name}',
      tradeRefused: '{name} refused to trade',
      talk: 'talked with {name}',
      moved: 'moved to {place}',
      hurt: 'got hurt at {place}',
      sawWeather: 'weather turned to {weather}',
      command: 'the console ran "{cmd}" on me',
      commandWitness: 'the console ran "{cmd}" on {name}',
      death: '{name} died at {place}',
      legend: 'still hear about {name}',
      left: '{name} logged off ({reason})',
      killedBy: 'was killed by {name}',
      diedEnv: 'died at {place} ({cause})',
      sawDeath: 'watched {name} die at {place}',
      sawConsole: 'the console ran "{cmd}"',
      joinedFaction: 'joined {faction}',
      factionGrudge: '{who} hurt {name}, not forgetting that',
      wasCommanded: 'the console ran "{cmd}" on me',
      consoleWitness: 'the console ran "{cmd}" on {name}',
    },

    /* ---------------- 调试面板 ---------------- */
    panel: {
      world: 'world',
      events: 'recent events',
      agents: 'players',
      map: 'map',
      time: 'time',
      weather: 'weather',
      online: 'online',
      tick: 'tick',
      nextJoin: 'next join',
      none: '--',
      colName: 'name',
      colGoal: 'goal',
      colMood: 'mood',
      colPlace: 'place',
      colAff: 'aff',
      goal: 'goal',
      mood: 'mood',
      place: 'place',
      hp: 'hp',
      affection: 'affection',
      memories: 'memories',
      scores: 'action scores',
      scoresHint: 'click a player to inspect',
      scoresWhen: 'decided {s}s ago (goal then: {goal})',
      scoresStale: 'typing/idle, not re-decided yet',
      speakBlocked: {
        awaiting: 'waiting for a reply, holding new topics',
        cooldown: 'just finished a topic, cooling down',
        settle: 'just joined, still looking around',
        warming: 'just connected, not talking yet',
        globalCap: 'too many topics in flight',
        agentCap: 'already in a topic',
      },
      noScores: 'no scores yet',
      state: 'state',
      faction: 'faction',
      factionMates: '{n} others',
      archetype: 'type',
      /* 12 种性格原型的可读名称（数据里是英文 id） */
      arch: {
        social: 'talkative', helper: 'helpful', loner: 'loner', raider: 'aggressive',
        explorer: 'explorer', trader: 'trader', builder: 'builder', coward: 'skittish',
        gossip: 'gossip', veteran: 'veteran', newbie: 'newbie', grump: 'grumpy',
      },
      uptime: 'uptime',
      topic: 'topic',
      typing: 'typing',
      idle: 'idle',
      recentMem: 'recent memory',
      foot: 'dev panel · click rows for detail',
      weatherLeft: 'left',
      stats: 'lifetime',
      statSpoken: 'said',
      statTopics: 'topics',
      statMoves: 'moves',
      tuning: 'tuning (live)',
      tuningHint: 'changes apply immediately to the running world',
      tuningReset: 'reset debug switches',
      knobGroup: {
        weight: 'action weights',
        talk: 'conversation pacing',
        life: 'life & leaving',
        debug: 'debug switches',
      },
      tuningScale: 'time scale',
      snapshot: 'world snapshot',
      snapshotHint: 'refreshing starts a new world; export a snapshot to keep this one',
      snapshotExport: 'export snapshot',
      snapshotImport: 'import snapshot',
      snapshotExportOk: 'Exported {name} ({kb} KB)',
      snapshotImportOk: 'Imported: day {day}, {online} online, {traces} trace(s)',
      snapshotErr: 'Import failed: {error}',
      fastForward: 'fast forward',
      fastForwardHint: 'simulate the next N minutes of real time and print it at once',
      fastForwardBtn: 'skip {n} min',
    },

    /* ---------------- 数据表译文 ---------------- */
    weather: { clear: 'clear', rain: 'rain', thunder: 'thunder', fog: 'fog' },
    place: { camp: 'camp', forest: 'forest', mine: 'mines', river: 'river', ruins: 'ruins', cave: 'cave' },
    item: {
      wood: 'wood', stone: 'stone', iron: 'iron', food: 'food', torch: 'torch',
      rope: 'rope', potion: 'potion', leather: 'leather', relic: 'relic',
    },
    threat: {
      boar: 'boar', wolves: 'wolves', spider: 'spider', snake: 'snake', bear: 'bear',
      mob: 'something feral', bats: 'bats',
      bandit: 'bandit', raider: 'raider',
      traps: 'traps', fall: 'a fall', dark: 'the dark', lava: 'lava',
    },
    mood: { calm: 'calm', annoyed: 'annoyed', scared: 'scared', excited: 'excited' },
    goal: {
      trade: 'trading', teamup: 'teaming up', explore: 'exploring',
      survive: 'surviving', revenge: 'revenge', eat: 'eating', logout: 'logging off',
      idle: 'idling around',
    },
    /* 角色昵称**不在这里** —— 32 个随机英文 ID 由 i18n.resolver('name', …)
       在运行时从名册里查（真人昵称本来也不翻译）。 */
    console: { name: 'CONSOLE' },
  };
})(window.FS);

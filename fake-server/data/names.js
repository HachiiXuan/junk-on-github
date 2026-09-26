/* ==========================================================================
   data.names —— 真人玩家风格的英文昵称生成器
   ==========================================================================
   为什么不用"Steve / Alex"这种名字：真实服务器里的 ID 是玩家自己起的，
   典型特征是
     · 全小写，或偶尔全大写 / 首字母大写
     · 词 + 数字（pvp 玩家的最爱）：shadowfox88、lone_wolf、k1ng
     · 下划线 / 点连接：silent_watcher、m.river
     · 无意义的短词拼接：zapdoot、krimbo、snorf
     · 偶尔的 leet 替换：d4rk、n1ght、sk8er
   所以这里做的是**批量生成**，不是从固定池子里挑 —— 池子一眼就看出是编的。

   生成是**确定性**的（用项目自己的 seeded RNG），
   同一台机器上每次打开都得到同一批昵称，方便调试与测试。
   ========================================================================== */
(function (FS) {
  'use strict';

  var RNG = FS.core.rng;

  /* 普通英文词：一半是具象名词，一半是形容词/动词，混着用才像真人 */
  var WORDS = [
    'shadow', 'frost', 'ember', 'raven', 'wolf', 'fox', 'hawk', 'stone',
    'iron', 'ash', 'dusk', 'dawn', 'storm', 'river', 'moss', 'flint',
    'quartz', 'onyx', 'jade', 'cobalt', 'amber', 'copper', 'slate', 'birch',
    'cedar', 'hollow', 'ridge', 'vale', 'marsh', 'peak', 'creek', 'grove',
    'silent', 'quiet', 'swift', 'grim', 'lone', 'wild', 'lost', 'idle',
    'bitter', 'clever', 'crooked', 'dusty', 'frozen', 'golden', 'hollowed',
    'humble', 'jagged', 'lucky', 'mad', 'noble', 'pale', 'restless', 'rough',
    'shady', 'sly', 'stray', 'tired', 'wandering', 'weary', 'wired', 'young',
    'night', 'winter', 'summer', 'harvest', 'lantern', 'anchor', 'compass',
    'hammer', 'anvil', 'arrow', 'shield', 'torch', 'bucket', 'ladder', 'rope',
    'pickaxe', 'shovel', 'cauldron', 'banner', 'crown', 'coin', 'map', 'key',
    'wander', 'roam', 'drift', 'hunt', 'gather', 'build', 'dig', 'mine',
    'haul', 'forge', 'brew', 'craft', 'guard', 'watch', 'scout', 'chase',
  ];

  /* 短音节：用来拼"没意义但很像 ID"的词（zapdoot / krimbo）。
     刻意只留"一个辅音丛开头 + 一个能收尾的音节"，避免拼出 jaxppet / mubndle
     这种根本念不出来的东西 —— 真人 ID 再怪也是能读的。 */
  var SYL_A = ['za', 'kri', 'sno', 'gru', 'bli', 'dro', 'fwe', 'glo', 'hob',
    'jib', 'klo', 'lur', 'nog', 'pif', 'quo', 'rin', 'sab', 'tob',
    'vul', 'wob', 'yar', 'zeb', 'flo', 'gri', 'hux', 'jax', 'kel',
    'mug', 'nib', 'pog', 'rud', 'skr', 'tib', 'vog', 'wug', 'zil'];
  var SYL_B = ['poot', 'mbo', 'rfle', 'skit', 'zzle', 'mpa', 'nkus',
    'rble', 'fton', 'ggin', 'zzik', 'rnak', 'mble', 'sket', 'doot',
    'wump', 'nix', 'zog', 'fizz', 'bop', 'nip', 'tuk', 'do', 'ka',
    'mo', 'po', 'zo', 'bo', 'go', 'lo'];

  /* 常见的"玩家味"前后缀 */
  var PREFIX = ['x', 'xx', 'the', 'its', 'mr', 'sir', 'not', 'real', 'just',
    'only', 'some', 'that', 'lil', 'big', 'old'];
  var SUFFIX = ['x', 'xx', 'xxx', 'xd', 'ttv', 'yt', 'tv', 'irl', 'btw',
    'uwu', 'owo', 'gg', 'ez', 'pro', 'noob', 'gaming', 'plays', 'here'];

  var LEET = { a: '4', e: '3', i: '1', o: '0', s: '5', t: '7', g: '9' };

  /* ------------------------------------------------------------------------
     精选昵称池 —— 32 人从这里面取（用项目 RNG 打乱后取前 N 个）。

     挑选标准：像"一个人会给自己起的 ID"，而不是"一个程序会生成的名字"。
     故意混入几种真实流派：
       · 词 + 数字（最常见）：shadowfox88 / birch608
       · 双词拼接：lanternwolf / quiet_restless
       · 短音节乱拼：zapdoot / krimbo / snorf
       · leet 替换：d4rk / n1ght / sk8er
       · 语法不通但很真实：notmypickaxe / why_me / itsfine
       · 全大写或首字母大写：NOODLE / Roam
     换种子（tools/gen-roster.js 顶部）就会换一整套人。
     ------------------------------------------------------------------------ */
  var CURATED = [
    'shadowfox88', 'birch608', 'lanternwolf', 'quiet_restless', 'notmypickaxe',
    'zapdoot', 'krimbo', 'snorfly', 'd4rkwater', 'n1ghtshift', 'sk8erboi',
    'why_me', 'itsfine', 'who_took_my', 'justdigging', 'barely_awake',
    'thirdcoffee', 'backagain_sry', 'wilson', 'greghouse', 'toast',
    'NOODLE', 'Roam', 'ezpickin', 'mossbrain', 'boarhugger', 'trustme',
    'notafk', 'afk_sry', 'onemoreore', 'shinytool', 'stonks',
    'pumpkinlord', 'bucketlord', 'laddergoblin', 'rope_enjoyer', 'brickz',
    'dirt_enjoyer', 'gravel_man', 'torchburner', 'coal4life', 'iron_will',
    'cave_gremlin', 'dripstone', 'deepslate_dad', 'spawn_camper',
    'wandering_dave', 'sleepy_knight', 'tinytim', 'big_bad_barry',
    'friendlyfire', 'oops_sorry', 'lootgoblin', 'shifty_steve', 'calm_downs',
    'grumbles', 'mumbles', 'jitters', 'nibbles', 'wobbles',
    'twitchy', 'grumpkin', 'dozy', 'drowsy', 'bumbling',
    'clumsy_carl', 'soggy_biscuit', 'beanz', 'mash', 'gravy',
    'crisps', 'biscuit89', 'bready', 'cheesed', 'pickled',
    'tarnished', 'rusted', 'bentnail', 'loose_screw', 'ducks',
    'goose_honk', 'pigeonpal', 'frogman', 'newt', 'toadstool',
    'mushy', 'fungal', 'spore_lord', 'moldy', 'damp_sock',
    'wet_blanket', 'cold_beans', 'sad_lamp', 'flat_tyre', 'punctured',
    'out_of_iron', 'no_wood', 'need_food', 'hungry_boy', 'starvin',
    'hungryhungry', 'feed_me', 'snack_thief', 'crumbz', 'leftovers',
  ];

  /* 单独一个词就太不像 ID 的（"mine"/"key"/"map" 当昵称很像占位符）。
     它们仍可以用在 word+数字 / 拼接里。 */
  var TOO_BLAND_ALONE = {
    mine: 1, key: 1, map: 1, coin: 1, rope: 1, mad: 1, sly: 1, pale: 1,
    idle: 1, lost: 1, ash: 1, wild: 1, young: 1, rough: 1, tired: 1,
    weary: 1, wired: 1, lucky: 1, noble: 1, humble: 1, quiet: 1, silent: 1,
  };

  /** 随机一个 1~4 位的数字（真实 ID 里数字很少是整齐的 000 结尾） */
  function digits(lo, hi) {
    return String(RNG.int(lo || 1, hi || 9999));
  }

  function leetize(word) {
    var out = '';
    for (var i = 0; i < word.length; i++) {
      var c = word.charAt(i);
      var sub = LEET[c];
      out += (sub && RNG.chance(0.55)) ? sub : c;
    }
    return out;
  }

  /** 首字母大写（有些玩家的 ID 是这样的） */
  function titleCase(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /**
   * 生成一个候选昵称。风格按真实分布加权：
   * 词+数字 最常见，纯词次之，短音节拼接与下划线再少一点。
   * @param {object} [avoid] { words: {word:1} } 已经用过的词，尽量别再用
   *                        （否则会出现 silent_restless / youngsilent / wildmine
   *                          这种"同一批词反复拼"的假名字）
   */
  function candidate(avoid) {
    /* 真实分布里"词+数字"和"纯词"占大头，双词拼接其实不多 ——
       而且双词拼接最容易看出是生成的，所以权重压到最低。 */
    var style = RNG.weighted([
      { id: 'wordnum', w: 34 },
      { id: 'word', w: 22 },
      { id: 'leet', w: 8 },
      { id: 'prefixed', w: 7 },
      { id: 'suffixed', w: 7 },
      { id: 'syllable', w: 10 },
      { id: 'pair', w: 5 },
      { id: 'space', w: 4 },
    ]).id;

    var usedW = (avoid && avoid.words) || {};
    /* 优先挑没用过的词；都用过了就退回全表 */
    function pickWord() {
      var fresh = WORDS.filter(function (w) { return !usedW[w]; });
      return RNG.pick(fresh.length ? fresh : WORDS);
    }

    var w1 = pickWord();
    var w2 = pickWord();
    /* 两个词不能相同（shadowsilent 可以，shadowshadow 不行） */
    var guard = 0;
    while (w2 === w1 && guard++ < 20) w2 = pickWord();

    var name;

    switch (style) {
      case 'wordnum':
        name = w1 + digits();
        break;
      case 'word':
        name = w1;
        break;
      case 'pair':
        name = w1 + w2;
        break;
      case 'space':
        name = w1 + '_' + w2;
        break;
      case 'leet':
        name = leetize(w1) + digits(1, 99);
        break;
      case 'syllable':
        name = RNG.pick(SYL_A) + RNG.pick(SYL_B);
        if (RNG.chance(0.4)) name += digits(1, 99);
        break;
      case 'prefixed':
        name = RNG.pick(PREFIX) + w1;
        break;
      case 'suffixed':
        name = w1 + RNG.pick(SUFFIX);
        break;
      default:
        name = w1;
    }

    /* 偶尔套一层大小写风格 */
    var r = RNG.float();
    if (r < 0.06) name = titleCase(name);
    else if (r < 0.10) name = name.toUpperCase();

    /* 纯词形态且这个词太没辨识度 → 补个数字，别让它看起来像占位符 */
    if (style === 'word' && TOO_BLAND_ALONE[w1]) name = w1 + digits(1, 99);

    return { name: name, words: [w1, w2] };
  }

  var Names = {
    /** 生成 count 个互不相同的昵称（尽量不重复使用同一个词） */
    generate: function (count) {
      var used = {};
      var avoid = { words: {} };
      var out = [];
      var guard = 0;
      while (out.length < count && guard < count * 300) {
        guard++;
        var c = candidate(avoid);
        var n = c.name;
        /* 长度限制：真实服务器的 ID 上限通常在 16 字符左右 */
        if (n.length < 3 || n.length > 16) continue;
        var key = n.toLowerCase();
        if (used[key]) continue;
        used[key] = 1;
        out.push(n);
        /* 记下用过的词，让后面的名字换一批词 */
        c.words.forEach(function (w) { if (w) avoid.words[w] = 1; });
        /* 词用掉太多了就重置，避免后期只能从"全表"里挑而开始重复 */
        if (Object.keys(avoid.words).length > WORDS.length * 0.7) {
          avoid.words = {};
        }
      }
      /* 兜底：极端情况下（随机源被固定）补足数量 */
      var i = 1;
      while (out.length < count) out.push('player_' + (i++));
      return out;
    },

    /**
     * 昵称 → 稳定的角色 id。
     * 用昵称本身派生，这样名字和 id 一一对应，不用额外维护映射表。
     */
    toId: function (name) {
      var id = String(name).toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      /* id 不能以数字开头（有些地方当选择器/键名用） */
      if (/^[0-9]/.test(id)) id = 'p' + id;
      return id || 'player';
    },

    /**
     * 生成 count 组 { id, name }。
     *
     * 策略：**优先从精选池里取**，不够再用生成器补。
     * 原因很实际 —— 纯程序生成总会漏出 `mine` / `anchor` / `frost` 这种
     * "一看就是占位符"的单词。玩家真实 ID 是有人味的，池子能保证下限，
     * 生成器负责上限与可扩展性（以后要 200 个人也够）。
     */
    roster: function (count) {
      var picked = [];
      var used = {};
      var pool = CURATED.slice();
      /* 用项目 RNG 打乱池子顺序，这样换种子就能换一整套人 */
      for (var i = pool.length - 1; i > 0; i--) {
        var j = RNG.int(0, i);
        var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
      }
      for (var p = 0; p < pool.length && picked.length < count; p++) {
        var key = pool[p].toLowerCase();
        if (used[key]) continue;
        used[key] = 1;
        picked.push(pool[p]);
      }

      /* 不够就用生成器补 */
      if (picked.length < count) {
        var extra = Names.generate(count - picked.length + 8);
        for (var e = 0; e < extra.length && picked.length < count; e++) {
          var k2 = extra[e].toLowerCase();
          if (used[k2]) continue;
          used[k2] = 1;
          picked.push(extra[e]);
        }
      }

      var seen = {};
      return picked.map(function (n) {
        var id = Names.toId(n);
        while (seen[id]) id = id + '_';        // 理论上不会撞，保险
        seen[id] = 1;
        return { id: id, name: n };
      });
    },

    /** 兼容旧接口 */
    take: function (used) {
      used = used || [];
      var guard = 0;
      while (guard < 500) {
        guard++;
        var n = candidate().name;
        if (used.indexOf(n) === -1) return n;
      }
      return 'player' + (used.length + 1);
    },
  };

  FS.data.names = Names;
  /* 保留词表，方便以后做"ID 风格"调参或测试 */
  FS.data.names.wordLists = {
    words: WORDS, sylA: SYL_A, sylB: SYL_B,
    prefix: PREFIX, suffix: SUFFIX,
  };
})(window.FS);

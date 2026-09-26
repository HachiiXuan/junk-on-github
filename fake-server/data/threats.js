/* ==========================================================================
   data.threats —— 威胁池（野兽 / 劫匪 / 环境危害）
   --------------------------------------------------------------------------
   ⚠️ 刻意**不用**那些有版权辨识度的标志性生物名（僵尸 / 末影人 / 苦力怕…）。
   用真实世界的野兽与劫匪，既自然又不会让人一眼认出"这是抄哪个游戏的"：
     野兽：野猪 狼 蜘蛛 蛇 熊
     人：  劫匪 掠夺者
     环境：陷阱 摔落 黑暗 岩浆

   kind 决定它能不能出现在"怪物"语境里：
     creature  野兽    → 可以说"已生成 X"、"附近传来 X 的动静"
     player    敌对的人 → 同上，但语气不同
     env       环境危害 → **不能**当生物说（"已生成 摔落" 是错的）
   环境噪音（state/noise）与台词取值都会按 kind 过滤，
   见 noise.creaturePool() 与 dialogue.sourceList('threats')。
   ========================================================================== */
(function (FS) {
  'use strict';

  FS.data.threats = {
    list: [
      /* --- 野兽（可以作为噪音里的"怪物"出现） --- */
      { id: 'boar', kind: 'creature', weight: 4 },
      { id: 'wolves', kind: 'creature', weight: 3 },
      { id: 'spider', kind: 'creature', weight: 2 },
      { id: 'snake', kind: 'creature', weight: 2 },
      { id: 'bear', kind: 'creature', weight: 1 },
      { id: 'mob', kind: 'creature', weight: 2 },      // "一群不知什么东西"
      { id: 'bats', kind: 'creature', weight: 1 },
      /* --- 敌对的人（比野兽稀有：真人来捣乱是"事件"） --- */
      { id: 'bandit', kind: 'player', weight: 2 },
      { id: 'raider', kind: 'player', weight: 1 },
      /* --- 环境危害（只在"死因/危险提示"里出现） --- */
      { id: 'traps', kind: 'env', weight: 2 },
      { id: 'fall', kind: 'env', weight: 1 },
      { id: 'dark', kind: 'env', weight: 1 },
      { id: 'lava', kind: 'env', weight: 1 },
    ],
    byId: {},
  };

  FS.data.threats.list.forEach(function (t) {
    FS.data.threats.byId[t.id] = t;
  });
})(window.FS);

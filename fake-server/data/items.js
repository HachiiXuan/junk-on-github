/* ==========================================================================
   data.items —— 物品池
   kind 用来给话题的 condition 做判断（如"有食物"）。
   ========================================================================== */
(function (FS) {
  'use strict';

  FS.data.items = {
    list: [
      { id: 'wood',    kind: 'material', weight: 3 },
      { id: 'stone',   kind: 'material', weight: 3 },
      { id: 'iron',    kind: 'material', weight: 2 },
      { id: 'food',    kind: 'consume',  weight: 3 },
      { id: 'torch',   kind: 'tool',     weight: 2 },
      { id: 'rope',    kind: 'tool',     weight: 1 },
      { id: 'potion',  kind: 'consume',  weight: 1 },
      { id: 'leather', kind: 'material', weight: 2 },
      { id: 'relic',   kind: 'rare',     weight: 1 },
    ],
    byId: {},
    /** 按 kind 取一组 id */
    ofKind: function (kind) {
      return FS.data.items.list.filter(function (i) { return i.kind === kind; })
        .map(function (i) { return i.id; });
    },
  };

  FS.data.items.list.forEach(function (i) {
    FS.data.items.byId[i.id] = i;
  });
})(window.FS);

/* ==========================================================================
   data.places —— 地点池 + 连通关系
   扩充方式：加一条 places，再在 links 里加对称的邻居，并补两条译文
   （locale 里的 place.<id>）。自检工具会检查连通图对称性与孤岛。
   ========================================================================== */
(function (FS) {
  'use strict';

  FS.data.places = {
    list: [
      { id: 'camp',   kind: 'base',   safe: 0.95, resource: null },
      { id: 'forest', kind: 'wild',   safe: 0.70, resource: 'wood' },
      { id: 'mine',   kind: 'wild',   safe: 0.45, resource: 'ore' },
      { id: 'river',  kind: 'wild',   safe: 0.65, resource: 'food' },
      { id: 'ruins',  kind: 'danger', safe: 0.25, resource: 'relic' },
      { id: 'cave',   kind: 'danger', safe: 0.30, resource: 'crystal' },
    ],

    /* 地图连通（无向图，必须对称） */
    links: {
      camp:   ['forest', 'river'],
      forest: ['camp', 'mine', 'river'],
      mine:   ['forest', 'ruins'],
      river:  ['camp', 'forest', 'cave'],
      ruins:  ['mine', 'cave'],
      cave:   ['river', 'ruins'],
    },

    /* 地点危险性（用于决策与话题变量），直接读 list 里的 safe */
    dangerOf: function (id) {
      var p = FS.data.places.byId[id];
      return p ? 1 - p.safe : 0.5;
    },

    byId: {},
  };

  // 建立索引
  FS.data.places.list.forEach(function (p) {
    FS.data.places.byId[p.id] = p;
  });
})(window.FS);

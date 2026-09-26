/* ==========================================================================
   data.agents —— 角色定义（32 人，v1.0）
   --------------------------------------------------------------------------
   ⚠️ 本文件由 tools/gen-roster.js 生成，不要手改 ——
      要调整名册（人数 / 种子 / 性格原型 / 地点分布），改脚本后重新运行：
        node tools/gen-roster.js

   性格 5 维（0~1）：chatty 话多 / generous 慷慨 / timid 胆小 /
                     belligerent 好战 / curious 好奇
   style：说话习惯，影响文本风格（lowercase 全小写 / normal 规范 /
          terse 极简 / shouty 全大写）
   name：随机英文昵称，风格贴近真实玩家 ID（见 data/names.js）
   ========================================================================== */
(function (FS) {
  'use strict';

  FS.data.agents = [
    {
      id: 'mumbles',
      name: 'mumbles',
      personality: { chatty: 0.17, generous: 0.22, timid: 0.53, belligerent: 0.23, curious: 0.47 },
      startPlace: 'camp',
      style: 'normal',
      archetype: 'loner',
    },
    {
      id: 'toadstool',
      name: 'toadstool',
      personality: { chatty: 0.67, generous: 0.69, timid: 0.61, belligerent: 0.13, curious: 0.94 },
      startPlace: 'camp',
      style: 'normal',
      archetype: 'newbie',
    },
    {
      id: 'starvin',
      name: 'starvin',
      personality: { chatty: 0.32, generous: 0.7, timid: 0.44, belligerent: 0.14, curious: 0.34 },
      startPlace: 'camp',
      style: 'normal',
      archetype: 'builder',
    },
    {
      id: 'sk8erboi',
      name: 'sk8erboi',
      personality: { chatty: 0.75, generous: 0.75, timid: 0.17, belligerent: 0.04, curious: 0.45 },
      startPlace: 'camp',
      style: 'lowercase',
      archetype: 'social',
    },
    {
      id: 'need_food',
      name: 'need_food',
      personality: { chatty: 0.27, generous: 0.26, timid: 0.48, belligerent: 0.19, curious: 0.98 },
      startPlace: 'camp',
      style: 'lowercase',
      archetype: 'explorer',
    },
    {
      id: 'brickz',
      name: 'brickz',
      personality: { chatty: 0.65, generous: 0.98, timid: 0.24, belligerent: 0.22, curious: 0.54 },
      startPlace: 'camp',
      style: 'lowercase',
      archetype: 'helper',
    },
    {
      id: 'trustme',
      name: 'trustme',
      personality: { chatty: 0.59, generous: 0.69, timid: 0.32, belligerent: 0.02, curious: 0.64 },
      startPlace: 'camp',
      style: 'lowercase',
      archetype: 'trader',
    },
    {
      id: 'dozy',
      name: 'dozy',
      personality: { chatty: 0.71, generous: 0.54, timid: 0.51, belligerent: 0.36, curious: 0.63 },
      startPlace: 'forest',
      style: 'lowercase',
      archetype: 'gossip',
    },
    {
      id: 'toast',
      name: 'toast',
      personality: { chatty: 0.52, generous: 0.4, timid: 0.25, belligerent: 0.91, curious: 0.5 },
      startPlace: 'forest',
      style: 'lowercase',
      archetype: 'raider',
    },
    {
      id: 'newt',
      name: 'newt',
      personality: { chatty: 0.67, generous: 0.67, timid: 0.13, belligerent: 0.64, curious: 0.65 },
      startPlace: 'forest',
      style: 'terse',
      archetype: 'veteran',
    },
    {
      id: 'afk_sry',
      name: 'afk_sry',
      personality: { chatty: 0.31, generous: 0.6, timid: 0.94, belligerent: 0.02, curious: 0.31 },
      startPlace: 'forest',
      style: 'normal',
      archetype: 'coward',
    },
    {
      id: 'wobbles',
      name: 'wobbles',
      personality: { chatty: 0.36, generous: 0.38, timid: 0.44, belligerent: 0.45, curious: 0.45 },
      startPlace: 'forest',
      style: 'normal',
      archetype: 'grump',
    },
    {
      id: 'moldy',
      name: 'moldy',
      personality: { chatty: 0.27, generous: 0.54, timid: 0.45, belligerent: 0.14, curious: 0.86 },
      startPlace: 'forest',
      style: 'normal',
      archetype: 'explorer',
    },
    {
      id: 'ducks',
      name: 'ducks',
      personality: { chatty: 0.34, generous: 0.49, timid: 0.98, belligerent: 0.11, curious: 0.28 },
      startPlace: 'mine',
      style: 'lowercase',
      archetype: 'coward',
    },
    {
      id: 'cold_beans',
      name: 'cold_beans',
      personality: { chatty: 0.4, generous: 0.31, timid: 0.2, belligerent: 0.83, curious: 0.56 },
      startPlace: 'mine',
      style: 'shouty',
      archetype: 'raider',
    },
    {
      id: 'crisps',
      name: 'crisps',
      personality: { chatty: 0.34, generous: 0.5, timid: 0.51, belligerent: 0.33, curious: 0.74 },
      startPlace: 'mine',
      style: 'lowercase',
      archetype: 'loner',
    },
    {
      id: 'calm_downs',
      name: 'calm_downs',
      personality: { chatty: 0.93, generous: 0.63, timid: 0.24, belligerent: 0.04, curious: 0.48 },
      startPlace: 'mine',
      style: 'lowercase',
      archetype: 'social',
    },
    {
      id: 'krimbo',
      name: 'krimbo',
      personality: { chatty: 0.97, generous: 0.5, timid: 0.29, belligerent: 0.22, curious: 0.68 },
      startPlace: 'mine',
      style: 'terse',
      archetype: 'gossip',
    },
    {
      id: 'leftovers',
      name: 'leftovers',
      personality: { chatty: 0.56, generous: 0.4, timid: 0.43, belligerent: 0.04, curious: 0.64 },
      startPlace: 'river',
      style: 'lowercase',
      archetype: 'trader',
    },
    {
      id: 'rusted',
      name: 'rusted',
      personality: { chatty: 0.66, generous: 0.54, timid: 0.16, belligerent: 0.69, curious: 0.49 },
      startPlace: 'river',
      style: 'lowercase',
      archetype: 'veteran',
    },
    {
      id: 'birch608',
      name: 'birch608',
      personality: { chatty: 0.48, generous: 0.56, timid: 0.42, belligerent: 0.14, curious: 0.46 },
      startPlace: 'river',
      style: 'lowercase',
      archetype: 'builder',
    },
    {
      id: 'crumbz',
      name: 'crumbz',
      personality: { chatty: 0.71, generous: 0.98, timid: 0.32, belligerent: 0.02, curious: 0.34 },
      startPlace: 'ruins',
      style: 'lowercase',
      archetype: 'helper',
    },
    {
      id: 'stonks',
      name: 'stonks',
      personality: { chatty: 0.29, generous: 0.37, timid: 0.22, belligerent: 0.63, curious: 0.15 },
      startPlace: 'ruins',
      style: 'terse',
      archetype: 'grump',
    },
    {
      id: 'notmypickaxe',
      name: 'notmypickaxe',
      personality: { chatty: 0.68, generous: 0.78, timid: 0.65, belligerent: 0.24, curious: 0.72 },
      startPlace: 'ruins',
      style: 'terse',
      archetype: 'newbie',
    },
    {
      id: 'iron_will',
      name: 'iron_will',
      personality: { chatty: 0.46, generous: 0.61, timid: 0.55, belligerent: 0.11, curious: 0.6 },
      startPlace: 'cave',
      style: 'lowercase',
      archetype: 'builder',
    },
    {
      id: 'nibbles',
      name: 'nibbles',
      personality: { chatty: 0.71, generous: 0.92, timid: 0.38, belligerent: 0.1, curious: 0.32 },
      startPlace: 'cave',
      style: 'normal',
      archetype: 'helper',
    },
    {
      id: 'pigeonpal',
      name: 'pigeonpal',
      personality: { chatty: 0.72, generous: 0.85, timid: 0.74, belligerent: 0.1, curious: 0.93 },
      startPlace: 'camp',
      style: 'lowercase',
      archetype: 'newbie',
    },
    {
      id: 'grumpkin',
      name: 'grumpkin',
      personality: { chatty: 0.33, generous: 0.58, timid: 0.98, belligerent: 0.02, curious: 0.49 },
      startPlace: 'camp',
      style: 'lowercase',
      archetype: 'coward',
    },
    {
      id: 'noodle',
      name: 'NOODLE',
      personality: { chatty: 0.41, generous: 0.49, timid: 0.33, belligerent: 0.66, curious: 0.74 },
      startPlace: 'camp',
      style: 'lowercase',
      archetype: 'veteran',
    },
    {
      id: 'boarhugger',
      name: 'boarhugger',
      personality: { chatty: 0.39, generous: 0.54, timid: 0.28, belligerent: 0.3, curious: 0.98 },
      startPlace: 'camp',
      style: 'normal',
      archetype: 'explorer',
    },
    {
      id: 'bumbling',
      name: 'bumbling',
      personality: { chatty: 0.73, generous: 0.53, timid: 0.39, belligerent: 0.02, curious: 0.6 },
      startPlace: 'camp',
      style: 'lowercase',
      archetype: 'trader',
    },
    {
      id: 'sad_lamp',
      name: 'sad_lamp',
      personality: { chatty: 0.84, generous: 0.61, timid: 0.25, belligerent: 0.24, curious: 0.77 },
      startPlace: 'camp',
      style: 'lowercase',
      archetype: 'gossip',
    },
  ];

  /* 原型使用统计（生成时写入，方便确认分布）：
     builder: 3
     coward: 3
     explorer: 3
     gossip: 3
     grump: 2
     helper: 3
     loner: 2
     newbie: 3
     raider: 2
     social: 2
     trader: 3
     veteran: 3
  */
})(window.FS);

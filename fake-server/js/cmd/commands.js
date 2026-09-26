/* ==========================================================================
   cmd.commands —— 命令白名单表
   v0.1：只启用只读命令（help / list / status / clear / lang）+ 未知命令报错。
         会改变世界状态的命令（kick/say/give/...）先在表里登记，
         执行时回一条"已注册但未启用"，等 v0.2 接上执行器。

   本地化：describe 存的是**语义键**（log.cmd.<name>），不是成句文本 ——
           help 输出时才查表，所以切语言能正确显示。
   ========================================================================== */
(function (FS) {
  'use strict';

  FS.cmd = FS.cmd || {};

  /** 所有命令的用法串（语言中立，命令名与参数不翻译） */
  var USAGE = {
    help: 'help',
    list: 'list',
    status: 'status',
    clear: 'clear',
    lang: 'lang <en|zh>',
    kick: 'kick <player> [reason]',
    kickall: 'kickall',
    kill: 'kill <player>',
    permadeath: 'permadeath <player> [on|off]',
    spawn: 'spawn [name]',
    time: 'time set <hh:mm>',
    weather: 'weather <clear|rain|thunder|fog>',
    speed: 'speed <x>',
    save: 'save',
    load: 'load',
    reset: 'reset',
  };

  /*
     被移除的命令（v0.3 之后的调整）：
       say / whisper —— 控制台对角色发消息，但角色**无法回应**，
                        只会让观察者觉得"AI 没听见"，反而破坏伪装。
       give / heal   —— 无因由地改变角色状态，同样没有回应。
       kill / permadeath —— 保留：它们产生的是可见的世界事件
                            （死亡、痕迹、传说），角色会对此产生记忆与反应。
     需要这些效果时请直接改数据或走快照，而不是让控制台"隔空喊话"。
  */
  var READONLY = { help: 1, list: 1, status: 1, clear: 1, lang: 1 };
  var TICK = {
    kick: 1, kickall: 1, kill: 1, permadeath: 1, spawn: 1,
    time: 1, weather: 1, speed: 1,
    save: 1, load: 1, reset: 1,
  };

  FS.cmd.commands = {};

  Object.keys(USAGE).forEach(function (name) {
    FS.cmd.commands[name] = {
      usage: USAGE[name],
      enabled: !!(READONLY[name] || TICK[name]),
      /* 语义键：渲染时用 I18N.t() 查表 */
      /* 注意 key 的空间划分：log.cmdDesc.<name> 是 help 里的**命令说明**，
         cmd.<name> 是角色议论控制台时的**口语说法**（topic.consoleTalk 用）。
         两者曾经都叫 log.cmd.*，翻平之后互相遮蔽。 */
      describeKey: 'log.cmdDesc.' + name,
      /* true = 入队等下一 tick（玩家视角是"有延迟"，正好符合"服务器处理"的感觉） */
      needsTick: !!TICK[name],
    };
  });

  /* 只读命令挂上执行器（实现在 cmd/parser.js 的 impl 上，通过 ctx.impl 暴露） */
  FS.cmd.commands.help.run = function (c) { return c.impl.help(); };
  FS.cmd.commands.list.run = function (c) { return c.impl.list(c); };
  FS.cmd.commands.status.run = function (c) { return c.impl.status(c); };
  FS.cmd.commands.clear.run = function (c) { return c.impl.clear(); };
  FS.cmd.commands.lang.run = function (c, args) { return c.impl.lang(c, args); };

  /** 命令名列表（稳定顺序，便于 help 输出） */
  FS.cmd.names = Object.keys(USAGE);
})(window.FS);

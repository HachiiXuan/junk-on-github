/* =====================================================================
   js/presets.js — 参数定义 + 预设库（中英双语）
   ===================================================================== */

/* ---------------- 可调参数定义 ---------------- */
const PARAM_DEFS = [
  { key:'pitch',       zh:'音高',     en:'Pitch',      min:-12,  max:12,    step:1,    def:0,     unitZh:'半音', unitEn:'st' },
  { key:'highpass',    zh:'高通滤波', en:'High Pass',  min:20,   max:2000,  step:10,   def:20,    unitZh:'Hz',   unitEn:'Hz' },
  { key:'lowpass',     zh:'低通滤波', en:'Low Pass',   min:500,  max:16000, step:100,  def:16000, unitZh:'Hz',   unitEn:'Hz' },
  { key:'thickness',   zh:'低频厚度', en:'Low Boost',  min:-12,  max:12,    step:0.5,  def:0,     unitZh:'dB',   unitEn:'dB' },
  { key:'brightness',  zh:'高频亮度', en:'High Boost', min:-12,  max:12,    step:0.5,  def:0,     unitZh:'dB',   unitEn:'dB' },
  { key:'distortion',  zh:'失真强度', en:'Distortion', min:0,    max:100,   step:1,    def:0,     unitZh:'%',    unitEn:'%'  },
  { key:'ring',        zh:'环形调制', en:'Ring Mod',   min:0,    max:100,   step:1,    def:0,     unitZh:'%',    unitEn:'%'  },
  { key:'ringFreq',    zh:'调制频率', en:'Mod Freq',   min:10,   max:400,   step:1,    def:60,    unitZh:'Hz',   unitEn:'Hz' },
  { key:'vibrato',     zh:'颤音深度', en:'Vibrato',    min:0,    max:100,   step:1,    def:0,     unitZh:'%',    unitEn:'%'  },
  { key:'vibratoRate', zh:'颤音速率', en:'Vib Rate',   min:0.5,  max:20,    step:0.5,  def:6,     unitZh:'Hz',   unitEn:'Hz' },
  { key:'echo',        zh:'回声强度', en:'Echo',       min:0,    max:100,   step:1,    def:0,     unitZh:'%',    unitEn:'%'  },
  { key:'echoTime',    zh:'回声延迟', en:'Echo Delay', min:0.05, max:1,     step:0.01, def:0.25,  unitZh:'秒',   unitEn:'s'  },
  { key:'reverb',      zh:'混响强度', en:'Reverb',     min:0,    max:100,   step:1,    def:0,     unitZh:'%',    unitEn:'%'  },
  { key:'gain',        zh:'音量',     en:'Volume',     min:0,    max:200,   step:1,    def:100,   unitZh:'%',    unitEn:'%'  },
];

/* 默认值（自动生成） */
const DEFAULTS = {};
PARAM_DEFS.forEach(d => { DEFAULTS[d.key] = d.def; });

/* ---------------- 预设库 ---------------- */
const PRESETS = [
  { id:'original', emoji:'🎤',
    zh:{ name:'原声',       desc:'不做任何修改' },
    en:{ name:'Original',   desc:'No modification' },
    p:{} },

  { id:'girl', emoji:'👧',
    zh:{ name:'少女音',     desc:'升调 + 提亮' },
    en:{ name:'Young Girl', desc:'Higher + brighter' },
    p:{ pitch:4, brightness:5, thickness:-4, highpass:80 } },

  { id:'lady', emoji:'💃',
    zh:{ name:'御姐音',     desc:'微升 + 厚实' },
    en:{ name:'Mature Lady',desc:'Slight rise + warm' },
    p:{ pitch:2, thickness:3, brightness:2, highpass:60 } },

  { id:'uncle', emoji:'🧔',
    zh:{ name:'大叔音',     desc:'降调 + 低沉' },
    en:{ name:'Uncle',      desc:'Lower + deeper' },
    p:{ pitch:-5, thickness:6, brightness:-3, lowpass:9000 } },

  { id:'chipmunk', emoji:'🐿️',
    zh:{ name:'花栗鼠',     desc:'极速升调' },
    en:{ name:'Chipmunk',   desc:'Extreme pitch up' },
    p:{ pitch:9, highpass:200, lowpass:12000, gain:110 } },

  { id:'helium', emoji:'🎈',
    zh:{ name:'氦气',       desc:'单纯高音' },
    en:{ name:'Helium',     desc:'Pure high pitch' },
    p:{ pitch:7, gain:105 } },

  { id:'minion', emoji:'🍌',
    zh:{ name:'小黄人',     desc:'高音 + 失真' },
    en:{ name:'Minion',     desc:'High + distorted' },
    p:{ pitch:8, distortion:20, brightness:4, highpass:150 } },

  { id:'demon', emoji:'👹',
    zh:{ name:'大魔王',     desc:'低沉 + 混响' },
    en:{ name:'Demon Lord', desc:'Deep + reverb' },
    p:{ pitch:-9, thickness:8, distortion:20, reverb:35, lowpass:5000 } },

  { id:'monster', emoji:'🦖',
    zh:{ name:'怪兽巨怪',   desc:'超低 + 破音' },
    en:{ name:'Monster',    desc:'Ultra low + growl' },
    p:{ pitch:-12, thickness:10, distortion:35, lowpass:4000 } },

  { id:'robot', emoji:'🤖',
    zh:{ name:'机器人',     desc:'环形调制' },
    en:{ name:'Robot',      desc:'Ring modulation' },
    p:{ ring:70, ringFreq:50, pitch:-1, lowpass:6000, highpass:150 } },

  { id:'ai', emoji:'🛸',
    zh:{ name:'未来 AI',    desc:'金属 + 空灵' },
    en:{ name:'Future AI',  desc:'Metallic + airy' },
    p:{ ring:35, ringFreq:90, pitch:2, brightness:6, reverb:20 } },

  { id:'alien', emoji:'👽',
    zh:{ name:'外星人',     desc:'调制 + 颤音' },
    en:{ name:'Alien',      desc:'Modulated + vibrato' },
    p:{ pitch:6, ring:40, ringFreq:140, vibrato:50, vibratoRate:8 } },

  { id:'ghost', emoji:'👻',
    zh:{ name:'幽灵',       desc:'空旷低语' },
    en:{ name:'Ghost',      desc:'Hollow whisper' },
    p:{ pitch:-4, reverb:60, vibrato:60, vibratoRate:3, lowpass:7000 } },

  { id:'horror', emoji:'🕷️',
    zh:{ name:'恐怖惊悚',   desc:'阴森低频' },
    en:{ name:'Horror',     desc:'Eerie low tone' },
    p:{ pitch:-7, ring:25, ringFreq:30, reverb:50, vibrato:40, vibratoRate:4 } },

  { id:'phone', emoji:'☎️',
    zh:{ name:'电话听筒',   desc:'窄带 + 失真' },
    en:{ name:'Telephone',  desc:'Narrowband + grit' },
    p:{ highpass:400, lowpass:3400, distortion:15, gain:130 } },

  { id:'megaphone', emoji:'📢',
    zh:{ name:'广播喇叭',   desc:'大声公质感' },
    en:{ name:'Megaphone',  desc:'PA speaker tone' },
    p:{ highpass:500, lowpass:3000, distortion:40, gain:140 } },

  { id:'gramophone', emoji:'📻',
    zh:{ name:'老式留声机', desc:'复古沙沙' },
    en:{ name:'Gramophone', desc:'Vintage crackle' },
    p:{ highpass:250, lowpass:5000, distortion:25, gain:90 } },

  { id:'underwater', emoji:'🌊',
    zh:{ name:'水下',       desc:'闷闷的水声' },
    en:{ name:'Underwater', desc:'Muffled & deep' },
    p:{ lowpass:700, highpass:100, pitch:-2, reverb:30 } },

  { id:'church', emoji:'⛪',
    zh:{ name:'教堂混响',   desc:'宽广空间' },
    en:{ name:'Church',     desc:'Wide hall reverb' },
    p:{ reverb:80, lowpass:12000 } },

  { id:'valley', emoji:'🏔️',
    zh:{ name:'山谷回声',   desc:'多次反射' },
    en:{ name:'Valley',     desc:'Multi-tap echo' },
    p:{ echo:60, echoTime:0.35, reverb:25 } },

  { id:'tape', emoji:'📼',
    zh:{ name:'磁带抖动',   desc:'老磁带晃音' },
    en:{ name:'Tape Wobble',desc:'Warped cassette' },
    p:{ vibrato:70, vibratoRate:2, pitch:-1, lowpass:8000 } },

  { id:'console', emoji:'🕹️',
    zh:{ name:'8位游戏机',  desc:'复古电子' },
    en:{ name:'8-bit Console', desc:'Retro chip' },
    p:{ distortion:60, highpass:300, lowpass:5000, pitch:3 } },

  { id:'bee', emoji:'🐝',
    zh:{ name:'小蜜蜂',     desc:'高频嗡鸣' },
    en:{ name:'Buzzing Bee',desc:'High frequency buzz' },
    p:{ ring:60, ringFreq:180, pitch:3 } },

  { id:'host', emoji:'🎧',
    zh:{ name:'电台主持',   desc:'磁性人声' },
    en:{ name:'Radio Host', desc:'Warm magnetic voice' },
    p:{ thickness:5, brightness:3, distortion:8, gain:110 } },
];
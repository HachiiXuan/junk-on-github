/**
 * 国际化
 * - 默认英文
 * - 加载时检测浏览器语言：中文浏览器 → 中文，其余 → 英文
 * - 支持手动切换
 */
const I18n = (function () {
  'use strict';

  const translations = {
    en: {
      settingsTitle: 'Settings',
      language: 'Language',
      langButton: '中文',
      purpleCard: 'Riven Mode',
      summonClone: 'Summon Clone',
      attackRange: 'Attack Range',
      steelPath: 'Steel Path Mode',
      modeNormal: 'Normal: 1s / spawn · Max 50',
      modeSteel: 'Steel Path: 0.5s / spawn · Max 100',
      kills: 'Kills: {n}'
    },
    zh: {
      settingsTitle: '个性化设置',
      language: '语言',
      langButton: 'English',
      purpleCard: '紫卡模式',
      summonClone: '召唤分身',
      attackRange: '攻击范围',
      steelPath: '钢铁之路模式',
      modeNormal: '普通模式：1 秒 / 只 · 上限 50',
      modeSteel: '钢铁之路：0.5 秒 / 只 · 上限 100',
      kills: '杀敌数: {n}'
    }
  };

  let current = 'en';
  const listeners = [];

  /** 检测浏览器首选语言，中文 → 'zh'，其他 → 'en' */
  function detectLang() {
    const raw = (navigator.languages && navigator.languages[0])
             || navigator.language
             || navigator.userLanguage
             || 'en';
    return String(raw).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  function t(key, params) {
    const pack = translations[current] || translations.en;
    let str = Object.prototype.hasOwnProperty.call(pack, key)
      ? pack[key]
      : (translations.en[key] || key);
    if (params && typeof str === 'string') {
      for (const k in params) {
        if (Object.prototype.hasOwnProperty.call(params, k)) {
          str = str.split(`{${k}}`).join(params[k]);
        }
      }
    }
    return str;
  }

  function getLang() { return current; }

  function setLang(lang) {
    if (lang !== 'en' && lang !== 'zh') lang = 'en';
    if (lang === current) return;
    current = lang;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    listeners.forEach(fn => {
      try { fn(current); } catch (e) { /* ignore */ }
    });
  }

  function toggle() {
    setLang(current === 'en' ? 'zh' : 'en');
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  /** 初始化：默认英文；检测到中文浏览器再切中文 */
  function init() {
    document.documentElement.lang = 'en';
    const detected = detectLang();
    if (detected === 'zh') setLang('zh');
  }

  return { t, getLang, setLang, toggle, onChange, init, detectLang };
})();
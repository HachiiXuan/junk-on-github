/* =====================================================================
   js/i18n.js — 国际化
   对外暴露：window.I18N
   ===================================================================== */
(function (global) {
  'use strict';

  const TRANSLATIONS = {
    en: {
      appTitle: '🎙️ Voice Changer · Presets',
      appSubtitle: 'Click any preset to apply',

      sectionUpload: '1 · Upload Audio',
      sectionExport: '2 · Preview & Export',
      sectionData:   '3 · Audio Info',
      sectionWave:   '4 · Waveform',

      dropTitle:    'Click to choose, or drop an audio file here',
      dropSubtitle: 'Supports MP3 / WAV / OGG / M4A / FLAC',

      orText:        'or',
      btnRecord:     'Record',
      btnStopRecord: 'Stop Recording',

      btnDownload:      '⬇️ Export',
      btnPlayProcessed: '▶️ Play Processed',
      btnPlayOriginal:  '▶️ Play Original',
      btnStop:          '⏹ Stop',

      metaFile:       'File: ',
      metaDuration:   'Duration: ',
      metaSampleRate: 'Sample Rate: ',
      metaChannels:   'Channels: ',
      metaSize:       'Output Size: ',

      legendPlayed:    'Played',
      legendRemaining: 'Remaining',

      mono:   'Mono',
      stereo: 'Stereo',

      statusWaiting:        'Waiting for audio…',
      statusDecoding:       'Decoding audio…',
      statusLoaded:         'Audio loaded, processing…',
      statusProcessing:     'Processing audio…',
      statusDone:           'Done · {ms} ms',
      statusFailed:         'Failed: {msg}',
      statusInvalidFile:    '⚠️ Please select an audio file',
      statusDecodeFail:     '❌ Cannot decode this audio file',
      statusDownloadStart:  '✅ Download started',
      statusEncodingMp3:    '⏳ Encoding MP3…',
      statusEncodingWav:    '⏳ Encoding WAV…',
      statusMp3Unavailable: 'MP3 encoder unavailable — exporting WAV instead',

      statusRecording:          'Recording…',
      statusMicDenied:          '❌ Microphone access denied',
      statusRecordUnsupported:  '⚠️ Recording is not supported in this browser',
      statusRecordEmpty:        '⚠️ Nothing recorded',
      statusRecordFailed:       'Recording failed: {msg}',

      emptyWave:    'No audio loaded',
      exportFormat: 'Format',
      downloadName: '{base}_voice',
      recordedName: 'recording',
      langName:     'EN'
    },

    zh: {
      appTitle: '🎙️ 变声器 · 预设库',
      appSubtitle: '点击任意预设立即应用',

      sectionUpload: '1 · 上传音频',
      sectionExport: '2 · 试听与导出',
      sectionData:   '3 · 具体数据',
      sectionWave:   '4 · 波形图',

      dropTitle:    '点击选择，或将音频文件拖到此处',
      dropSubtitle: '支持 MP3 / WAV / OGG / M4A / FLAC 等格式',

      orText:        '或',
      btnRecord:     '录音',
      btnStopRecord: '停止录音',

      btnDownload:      '⬇️ 导出',
      btnPlayProcessed: '▶️ 试听处理后',
      btnPlayOriginal:  '▶️ 试听原声',
      btnStop:          '⏹ 停止',

      metaFile:       '文件：',
      metaDuration:   '时长：',
      metaSampleRate: '采样率：',
      metaChannels:   '声道：',
      metaSize:       '输出大小：',

      legendPlayed:    '已播放',
      legendRemaining: '未播放',

      mono:   '单声道',
      stereo: '立体声',

      statusWaiting:        '等待上传音频…',
      statusDecoding:       '正在解码音频…',
      statusLoaded:         '音频已加载，正在处理…',
      statusProcessing:     '正在处理音频…',
      statusDone:           '完成 · 耗时 {ms} 毫秒',
      statusFailed:         '处理失败：{msg}',
      statusInvalidFile:    '⚠️ 请选择音频文件',
      statusDecodeFail:     '❌ 无法解码该音频文件',
      statusDownloadStart:  '✅ 已开始下载',
      statusEncodingMp3:    '⏳ 正在编码 MP3…',
      statusEncodingWav:    '⏳ 正在编码 WAV…',
      statusMp3Unavailable: 'MP3 编码器不可用，改为导出 WAV',

      statusRecording:          '正在录音…',
      statusMicDenied:          '❌ 麦克风权限被拒绝',
      statusRecordUnsupported:  '⚠️ 当前浏览器不支持录音',
      statusRecordEmpty:        '⚠️ 没有录到内容',
      statusRecordFailed:       '录音失败：{msg}',

      emptyWave:    '尚未加载音频',
      exportFormat: '格式',
      downloadName: '{base}_变声',
      recordedName: '录音',
      langName:     '中文'
    }
  };

  global.I18N = {
    _lang: 'en',

    get lang() { return this._lang; },

    setLang(lang) {
      this._lang = (lang === 'zh') ? 'zh' : 'en';
    },

    t(key, vars) {
      const table = TRANSLATIONS[this._lang] || TRANSLATIONS.en;
      let str = table[key];
      if (str === undefined) str = TRANSLATIONS.en[key];
      if (str === undefined) return key;

      if (vars) {
        Object.keys(vars).forEach(k => {
          str = str.split('{' + k + '}').join(vars[k]);
        });
      }
      return str;
    }
  };

})(window);
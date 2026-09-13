// sounds.js — случайный звук клика через Web Audio API
(function() {
  'use strict';

  var ctx = null;
  var isMuted = false;
  var MAX_CONCURRENT = 5;
  var activeCount = 0;
  var MASTER_VOLUME = 0.35;

  // ВАЖНО: A??.m4a — не имя файла (символ ? запрещён).
  // Если у тебя реально называется по-другому — поменяй здесь.
  var SOUND_SOURCES = [
    'A3.m4a',
    'Aikakoi.m4a',
    'Aimolodca.m4a',
    'Awhopizdih.m4a',
    'Dada.m4a',
    'Dadadada.m4a',
    'Gavnotapi.m4a',
    'Grahou.m4a',
    'Ihmatoov.m4a',
    'Iwhopotom.m4a',
    'ZakrivaiSVO.m4a'
  ];

  var buffers = new Array(SOUND_SOURCES.length);
  var loadedCount = 0;
  var failedList = [];

  function log(t) { try { console.log('[Sounds] ' + t); } catch(e) {} }
  function warn(t) { try { console.warn('[Sounds] ' + t); } catch(e) {} }

  function getCtx() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { warn('Web Audio API не поддерживается'); return null; }
      ctx = new AC();
      log('AudioContext создан, state=' + ctx.state);
    } catch(e) { warn('Ошибка создания AudioContext: ' + e.message); return null; }
    return ctx;
  }

  function loadOne(url, index) {
    var c = getCtx();
    if (!c) return;

    fetch(url)
      .then(function(resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.arrayBuffer();
      })
      .then(function(arrayBuffer) {
        // Пробуем Promise-версию (совр. браузеры)
        var p = c.decodeAudioData(arrayBuffer);
        if (p && typeof p.then === 'function') {
          return p;
        }
        // Fallback для старых браузеров — оборачиваем колбэки в Promise
        return new Promise(function(resolve, reject) {
          c.decodeAudioData(arrayBuffer, resolve, reject);
        });
      })
      .then(function(buf) {
        buffers[index] = buf;
        loadedCount++;
        log('OK ' + url + ' (' + buf.duration.toFixed(2) + 'с) — загружено ' + loadedCount + '/' + SOUND_SOURCES.length);
      })
      .catch(function(err) {
        failedList.push(url + ' (' + (err && err.message ? err.message : 'fail') + ')');
        warn('FAIL ' + url + ' — ' + (err && err.message ? err.message : err));
      });
  }

  function init() {
    var c = getCtx();
    if (!c) return;
    log('Начинаю загрузку ' + SOUND_SOURCES.length + ' звуков...');
    for (var i = 0; i < SOUND_SOURCES.length; i++) {
      loadOne(SOUND_SOURCES[i], i);
    }
  }

  function unlock() {
    var c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') {
      c.resume().then(function() {
        log('AudioContext разблокирован, state=' + c.state);
      }).catch(function(){});
    }
  }

  function hasAnyBuffer() {
    for (var i = 0; i < buffers.length; i++) {
      if (buffers[i]) return true;
    }
    return false;
  }

  function playRandom() {
    if (isMuted) return false;
    if (!hasAnyBuffer()) return false;
    if (activeCount >= MAX_CONCURRENT) return false;

    var c = getCtx();
    if (!c) return false;
    // Всегда пытаемся разбудить контекст
    if (c.state === 'suspended') c.resume().catch(function(){});

    var available = [];
    for (var i = 0; i < buffers.length; i++) {
      if (buffers[i]) available.push(i);
    }
    if (available.length === 0) return false;

    var idx = available[Math.floor(Math.random() * available.length)];
    var buf = buffers[idx];

    try {
      var src = c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 1 + (Math.random() * 0.08 - 0.04);

      var gain = c.createGain();
      gain.gain.value = MASTER_VOLUME;

      src.connect(gain);
      gain.connect(c.destination);

      activeCount++;
      src.onended = function() {
        activeCount--;
        try { src.disconnect(); gain.disconnect(); } catch(e) {}
      };

      src.start(0);
      return true;
    } catch(e) {
      warn('Ошибка воспроизведения: ' + e.message);
      return false;
    }
  }

  function setMuted(m) {
    isMuted = !!m;
    try { localStorage.setItem('pahomSoundMuted', isMuted ? '1' : '0'); } catch(e) {}
    try {
      window.dispatchEvent(new CustomEvent('pahomSoundMutedChanged', { detail: { muted: isMuted } }));
    } catch(e) {}
  }

  function toggleMute() {
    setMuted(!isMuted);
    return isMuted;
  }

  try {
    if (localStorage.getItem('pahomSoundMuted') === '1') isMuted = true;
  } catch(e) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  ['touchstart', 'touchend', 'click', 'pointerdown', 'keydown'].forEach(function(evt) {
    document.addEventListener(evt, unlock, { once: true, passive: true });
  });

  window.pahomSound = {
    play: playRandom,
    playRandom: playRandom,
    setMuted: setMuted,
    toggleMute: toggleMute,
    isMuted: function() { return isMuted; },
    ready: function() { return hasAnyBuffer(); },
    loadedCount: function() { return loadedCount; },
    total: function() { return SOUND_SOURCES.length; },
    failed: function() { return failedList.slice(); }
  };

  log('Модуль загружен. Mute: ' + isMuted);
})();
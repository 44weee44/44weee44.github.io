// sounds.js — звук клика через Web Audio API (A3.m4a, без рандома)
(function() {
  'use strict';

  var ctx = null;
  var isMuted = false;
  var MAX_CONCURRENT = 5;
  var activeCount = 0;
  var MASTER_VOLUME = 0.35;

  var SOUND_URL = 'A3.m4a';
  var buffer = null;

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

  function loadOne() {
    var c = getCtx();
    if (!c) return;

    log('Начинаю загрузку: ' + SOUND_URL);

    fetch(SOUND_URL)
      .then(function(resp) {
        log('HTTP ' + resp.status);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.arrayBuffer();
      })
      .then(function(arrayBuffer) {
        log('Получено ' + arrayBuffer.byteLength + ' байт. Декодирую...');
        var p = c.decodeAudioData(arrayBuffer);
        if (p && typeof p.then === 'function') return p;
        return new Promise(function(resolve, reject) {
          c.decodeAudioData(arrayBuffer, resolve, reject);
        });
      })
      .then(function(buf) {
        buffer = buf;
        log('OK ' + SOUND_URL + ' (' + buf.duration.toFixed(2) + 'с)');
      })
      .catch(function(err) {
        warn('FAIL ' + SOUND_URL + ' — ' + (err && err.message ? err.message : err));
      });
  }

  function init() {
    var c = getCtx();
    if (!c) return;
    loadOne();
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

  function playRandom() {
    if (isMuted) return false;
    if (!buffer) { warn('playRandom: буфер не загружен'); return false; }
    if (activeCount >= MAX_CONCURRENT) return false;

    var c = getCtx();
    if (!c) return false;
    if (c.state === 'suspended') c.resume().catch(function(){});

    try {
      var src = c.createBufferSource();
      src.buffer = buffer;

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
    ready: function() { return !!buffer; },
    loadedCount: function() { return buffer ? 1 : 0; },
    total: function() { return 1; },
    failed: function() { return []; }
  };

  log('Модуль загружен. Mute: ' + isMuted);
})();
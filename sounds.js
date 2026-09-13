// sounds.js — один Audio, обрезка на 100мс, без лагов
(function() {
  'use strict';

  var SOUND_URL = 'A3.m4a';
  var VOLUME = 1.0;
  var MIN_INTERVAL = 60;

  var audio = null;
  var isMuted = false;
  var lastPlay = 0;

  function init() {
    audio = new Audio(SOUND_URL);
    audio.preload = 'auto';
    audio.volume = VOLUME;
    try { audio.load(); } catch(e) {}
  }

  function playRandom() {
    if (isMuted) return false;
    if (!audio) return false;

    var now = Date.now();
    if (now - lastPlay < MIN_INTERVAL) return false;
    lastPlay = now;

    try {
      audio.pause();
      audio.currentTime = 0;
      var p = audio.play();
      if (p && typeof p.then === 'function') {
        p.catch(function(){});
      }
      setTimeout(function() {
        try { audio.pause(); } catch(e) {}
      }, 100);
      return true;
    } catch(e) {
      return false;
    }
  }

  // Пустышка
  function playExcite() { return false; }

  function setMuted(m) {
    isMuted = !!m;
    try { localStorage.setItem('pahomSoundMuted', isMuted ? '1' : '0'); } catch(e) {}
    try {
      window.dispatchEvent(new CustomEvent('pahomSoundMutedChanged', { detail: { muted: isMuted } }));
    } catch(e) {}
  }
  function toggleMute() { setMuted(!isMuted); return isMuted; }

  try {
    if (localStorage.getItem('pahomSoundMuted') === '1') isMuted = true;
  } catch(e) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.pahomSound = {
    play: playRandom,
    playRandom: playRandom,
    playExcite: playExcite,
    setMuted: setMuted,
    toggleMute: toggleMute,
    isMuted: function() { return isMuted; },
    ready: function() { return !!audio; },
    loadedCount: function() { return audio ? 1 : 0; },
    total: function() { return 1; },
    failed: function() { return []; }
  };
})();
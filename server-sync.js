// server-sync.js — синхронизация с сервером
(function() {
  'use strict';

  var API_BASE = 'https://save-pahom.duckdns.org';
  var AUTO_SAVE_INTERVAL_MS = 3000;
  var MIN_SAVE_GAP_MS = 2000;
  var MIGRATION_KEY = 'pahomMigratedToServer';

  var SYNC_KEYS = [
    'pahomSexpah', 'pahomClicks', 'pahomOverexcites', 'pahomTool',
    'pahomBuffs', 'pahomKraftState', 'pahomKraftPending',
    'pahomKraftLastTick', 'pahomBossInventory', 'pahomBossState',
    'pahomPlayerExp', 'pahomPlayerLevel',
    'pahomNickname', 'pahomIP', 'pahomAvatar',
    'pahomUpgradeLove', 'pahomUpgradeLoot',
    'pahomWeaponsOwned', 'pahomBossStats',
    'pahomLoveLastClick'
  ];

  function getUserId() {
    try {
      var tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
        return 'tg_' + tg.initDataUnsafe.user.id;
      }
    } catch(e) {}
    var stored = null;
    try { stored = localStorage.getItem('pahomServerUserId'); } catch(e) {}
    if (stored && stored.indexOf('tg_') === 0) return stored;
    return null;
  }

  var USER_ID = getUserId();
  var IS_TG_USER = !!USER_ID;

  function migrateLocalToTg(oldId, newId) {
    if (!oldId || !newId) return;
    if (oldId === newId) return;
    if (oldId.indexOf('u_') !== 0) return;
    if (newId.indexOf('tg_') !== 0) return;

    var migratedKey = 'pahomMigrated_' + oldId + '_to_' + newId;
    try { if (localStorage.getItem(migratedKey) === '1') return; } catch(e) {}

    fetch(API_BASE + '/api/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: oldId, to: newId })
    })
    .then(function(r) { return r.json(); })
    .then(function(resp) {
      if (resp && resp.ok) {
        try { localStorage.setItem(migratedKey, '1'); } catch(e) {}
      }
    })
    .catch(function(){});
  }

  try {
    var prevId = localStorage.getItem('pahomServerUserId');
    if (prevId && USER_ID && prevId !== USER_ID) {
      migrateLocalToTg(prevId, USER_ID);
    }
    if (USER_ID) localStorage.setItem('pahomServerUserId', USER_ID);
  } catch(e) {}

  function collectAllData() {
    var data = {};
    for (var i = 0; i < SYNC_KEYS.length; i++) {
      var v = null;
      try { v = localStorage.getItem(SYNC_KEYS[i]); } catch(e) {}
      if (v !== null) data[SYNC_KEYS[i]] = v;
    }
    return data;
  }

  var lastSaveHash = '';
  var lastSaveTime = 0;
  var isSaving = false;
  var pendingForce = false;
  var pendingTimer = null;

  function doSave(callback) {
      if (!IS_TG_USER) { if (callback) callback(false); return; }
      if (isSaving) {
        pendingForce = true;
        if (callback) callback(true);
        return;
      }
  
      var data = collectAllData();
      var json = JSON.stringify(data);
      // УБРАТЬ проверку json === lastSaveHash
      lastSaveHash = json;
      lastSaveTime = Date.now();
      isSaving = true;
      pendingForce = false;
  
      fetch(API_BASE + '/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID, data: data })
      })
        .then(function(r) { return r.json(); })
        .then(function() {
          isSaving = false;
          if (pendingForce) { pendingForce = false; doSave(); }
          if (callback) callback(true);
        })
        .catch(function(err) {
          isSaving = false;
          console.warn('[Sync] save error:', err);
          if (pendingForce) { pendingForce = false; doSave(); }
          if (callback) callback(false);
        });
    }

    function saveToServer(force, callback) {
          if (!IS_TG_USER) { if (callback) callback(true); return; }
      
          var now = Date.now();
          var sinceLast = now - lastSaveTime;
      
          // Форс — сразу, без задержки
          if (force) {
            if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
            doSave(callback);
            return;
          }
  
      if (sinceLast < MIN_SAVE_GAP_MS) {
        if (pendingTimer) clearTimeout(pendingTimer);
        pendingTimer = setTimeout(function() {
          pendingTimer = null;
          doSave(callback);
        }, MIN_SAVE_GAP_MS - sinceLast);
        if (callback) callback(true);
        return;
      }
  
      doSave(callback);
    }

  function saveViaBeacon() {
    if (!IS_TG_USER) return;
    try {
      var data = collectAllData();
      var payload = JSON.stringify({ userId: USER_ID, data: data });
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(API_BASE + '/api/save', blob);
      }
    } catch(e) {}
  }

  function loadFromServer(callback) {
    if (!IS_TG_USER) {
      if (callback) callback(false);
      return;
    }

    fetch(API_BASE + '/api/load?userId=' + encodeURIComponent(USER_ID))
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(resp) {
        if (!resp || !resp.data) {
          if (callback) callback(false);
          return;
        }
        var cloud = resp.data;
        var count = 0;
        for (var k in cloud) {
          if (!Object.prototype.hasOwnProperty.call(cloud, k)) continue;
          try { localStorage.setItem(k, cloud[k]); count++; } catch(e) {}
        }
        lastSaveHash = JSON.stringify(cloud);
        if (callback) callback(true, count);
      })
      .catch(function(err) {
        console.warn('[Sync] load error:', err);
        if (callback) callback(false);
      });
  }

  // Автосохранение раз в 3 секунды
  setInterval(function() { saveToServer(false); }, AUTO_SAVE_INTERVAL_MS);

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      saveToServer(true);
      saveViaBeacon();
    }
  });
  window.addEventListener('pagehide', function() {
    saveToServer(true);
    saveViaBeacon();
  });
  window.addEventListener('beforeunload', function() {
    saveViaBeacon();
  });
  window.addEventListener('blur', function() {
    saveToServer(true);
  });
  window.addEventListener('hashchange', function() {
    saveToServer(true);
  });

  window.pahomForceSave = function() {
    saveToServer(true);
  };

  window.pahomSaveNow = function(callback) {
    doSave(callback);
  };

  window.tgSyncReady = true;
  window.tgSyncLoad = loadFromServer;
  window.tgSyncSave = saveToServer;
  window.tgSyncSaveBeacon = saveViaBeacon;
  window.tgSyncUserId = USER_ID;

  console.log('[Sync] Ready. UserID:', USER_ID || 'NONE');
})();
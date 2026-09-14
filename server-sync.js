// server-sync.js — сохранение на свой сервер + 1 раз миграция из Telegram
(function() {
  'use strict';

  var API_BASE = 'https://save-pahom.duckdns.org';
  var SAVE_INTERVAL_MS = 30000;
  var MIGRATION_KEY = 'pahomMigratedToServer';

  var SYNC_KEYS = [
    'pahomSexpah', 'pahomClicks', 'pahomOverexcites', 'pahomTool',
    'pahomBuffs', 'pahomKraftState', 'pahomKraftPending',
    'pahomKraftLastTick', 'pahomBossInventory', 'pahomBossState',
    'pahomPlayerExp', 'pahomPlayerLevel', 'pahomLastExpClick',
    'pahomNickname', 'pahomIP', 'pahomAvatar',
    'pahomUpgradeLove', 'pahomUpgradeLoot'
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
    if (!stored) {
      stored = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem('pahomServerUserId', stored); } catch(e) {}
    }
    return stored;
  }

  var USER_ID = getUserId();

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
  var isSaving = false;

  function saveToServer(force, callback) {
    if (isSaving) { if (callback) callback(false); return; }
    var data = collectAllData();
    var json = JSON.stringify(data);
    if (!force && json === lastSaveHash) { if (callback) callback(true); return; }
    lastSaveHash = json;
    isSaving = true;

    fetch(API_BASE + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID, data: data })
    })
      .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function() {
        isSaving = false;
        if (callback) callback(true);
      })
      .catch(function(err) {
        isSaving = false;
        console.warn('[Sync] save error:', err);
        if (callback) callback(false);
      });
  }

  function loadFromServer(callback) {
    fetch(API_BASE + '/api/load?userId=' + encodeURIComponent(USER_ID))
      .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(resp) {
        if (!resp || !resp.data) {
          tryTelegramMigration(callback);
          return;
        }
        var cloud = resp.data;
        var count = 0;

        var localTick = parseInt(localStorage.getItem('pahomKraftLastTick') || '0', __10) || 0;
        var cloudTick = parseInt(cloud['pahomKraftLastTick'] || '0', 10) || 0;

        if (cloudTick >= localTick) {
          for (var k in cloud) {
            try { localStorage.setItem(k, cloud[k]); count++; } catch(e) {}
          }
          lastSaveHash = JSON.stringify(cloud);
          if (callback) callback(true, count);
        } else {
          if (callback) callback(false);
          setTimeout(function() { saveToServer(true); }, 1000);
        }
      })
      .catch(function(err) {
        console.warn('[Sync] load error:', err);
        if (callback) callback(false);
      });
  }

  function tryTelegramMigration(callback) {
    var migrated = false;
    try { migrated = localStorage.getItem(MIGRATION_KEY) === '1'; } catch(e) {}
    if (migrated) { if (callback) callback(false); return; }

    var tg = window.Telegram && window.Telegram.WebApp;
    if (!tg || !tg.CloudStorage) {
      try { localStorage.setItem(MIGRATION_KEY, '1'); } catch(e) {}
      if (callback) callback(false);
      return;
    }

    console.log('[Sync] Миграция из Telegram CloudStorage...');

    tg.CloudStorage.getItem('save__count', function(err, countStr) {
      if (err || !countStr) {
        try { localStorage.setItem(MIGRATION_KEY, '1'); } catch(e) {}
        if (callback) callback(false);
        return;
      }
      var n = parseInt(countStr, 10);
      if (!n || n < 1) {
        try { localStorage.setItem(MIGRATION_KEY, '1'); } catch(e) {}
        if (callback) callback(false);
        return;
      }
      var keys = [];
      for (var i = 0; i < n; i++) keys.push('save__' + i);
      tg.CloudStorage.getItems(keys, function(e, items) {
        if (e) { if (callback) callback(false); return; }
        var full = '';
        for (var j = 0; j < n; j++) {
          if (typeof items[keys[j]] === 'string') full += items[keys[j]];
        }
        try {
          var tgData = JSON.parse(full);
          var count = 0;
          for (var k in tgData) {
            if (tgData[k] !== null && tgData[k] !== undefined) {
              try { localStorage.setItem(k, tgData[k]); count++; } catch(e2) {}
            }
          }
          saveToServer(true, function(ok) {
            if (ok) {
              try { localStorage.setItem(MIGRATION_KEY, '1'); } catch(e3) {}
              console.log('[Sync] Миграция завершена');
              clearTelegramCloud(n);
            }
            if (callback) callback(true, count);
          });
        } catch(parseErr) {
          if (callback) callback(false);
        }
      });
    });
  }

  function clearTelegramCloud(chunksCount) {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (!tg || !tg.CloudStorage) return;
    tg.CloudStorage.removeItem('savecount', function() {
      var keys = [];
      for (var i = 0; i < chunksCount; i++) keys.push('save__' + i);
      if (tg.CloudStorage.removeItems) {
        tg.CloudStorage.removeItems(keys, function() {
          console.log('[Sync] Telegram очищен');
        });
      } else {
        keys.forEach(function(k) { tg.CloudStorage.removeItem(k, function(){}); });
      }
    });
  }

  setInterval(function() { saveToServer(false); }, SAVE_INTERVAL_MS);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') saveToServer(true);
  });
  window.addEventListener('pagehide', function() { saveToServer(true); });
  window.addEventListener('beforeunload', function() { saveToServer(true); });

  window.tgSyncReady = true;
  window.tgSyncLoad = loadFromServer;
  window.tgSyncSave = saveToServer;
  window.tgSyncUserId = USER_ID;

  console.log('[Sync] Ready. UserID:', USER_ID, 'API:', API_BASE);
})();
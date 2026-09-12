// telegram-sync.js
// Синхронизация прогресса через Telegram CloudStorage.
// Работает ТОЛЬКО внутри Telegram Mini App.
// В обычном браузере — ничего не делает, игра работает на localStorage.

(function() {
  'use strict';

  // ====== НАСТРОЙКИ ======
  var SAVE_INTERVAL_MS = 30000;    // автосохранение раз в 30 секунд
  var CHUNK_SIZE = 4000;            // 4096 лимит Telegram, оставляем запас
  var CHUNK_COUNT_KEY = 'save__count';
  var CHUNK_PREFIX = 'save__';

  // Какие ключи localStorage синхронизируем
  var SYNC_KEYS = [
    'pahomSexpah',
    'pahomClicks',
    'pahomOverexcites',
    'pahomTool',
    'pahomBuffs',
    'pahomKraftState',
    'pahomKraftPending',
    'pahomKraftLastTick',
    'pahomBossInventory',
    'pahomBossState',
    'pahomPlayerExp',
    'pahomPlayerLevel',
    'pahomLastExpClick',
    'pahomNickname',
    'pahomIP',
    'pahomAvatar'
  ];

  // ====== ПРОВЕРКА TELEGRAM ======
  var tg = window.Telegram && window.Telegram.WebApp;
  var isTelegram = !!(tg && tg.initData);

  if (!isTelegram) {
    console.log('[TG-Sync] Не в Telegram — работаем только на localStorage');
    window.tgSyncReady = false;
    window.tgSyncLoad = function(cb) { if (cb) cb(false); };
    window.tgSyncSave = function() {};
    return;
  }

  console.log('[TG-Sync] Telegram обнаружен, синхронизация активна');
  window.tgSyncReady = true;

  // Расширяем WebApp на весь экран
  try { tg.ready(); tg.expand(); } catch(e) {}

  // ====== СЕРИАЛИЗАЦИЯ ======
  function collectAllData() {
    var data = {};
    for (var i = 0; i < SYNC_KEYS.length; i++) {
      var key = SYNC_KEYS[i];
      var val = localStorage.getItem(key);
      if (val !== null) data[key] = val;
    }
    return JSON.stringify(data);
  }

  function chunkString(str, size) {
    var chunks = [];
    for (var i = 0; i < str.length; i += size) {
      chunks.push(str.slice(i, i + size));
    }
    return chunks;
  }

  // ====== БЕЗОПАСНЫЙ КЛЮЧ ======
  // Telegram CloudStorage требует: A-Z, a-z, 0-9, _, -  (1-128 символов)
  function safeKey(base) {
    return String(base).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
  }

  // ====== СОХРАНЕНИЕ В ОБЛАКО ======
  var lastSaveHash = '';
  var isSaving = false;

  function saveToCloud(force) {
    if (isSaving) return;
    var json = collectAllData();

    // Пропускаем если ничего не изменилось (кроме force)
    if (!force && json === lastSaveHash) return;
    lastSaveHash = json;

    isSaving = true;
    var chunks = chunkString(json, CHUNK_SIZE);

    // 1. Пишем количество чанков
    tg.CloudStorage.setItem(safeKey(CHUNK_COUNT_KEY), String(chunks.length), function(err) {
      if (err) {
        console.error('[TG-Sync] Ошибка сохранения count:', err);
        isSaving = false;
        return;
      }

      // 2. Пишем сами чанки
      var pending = chunks.length;
      if (pending === 0) { isSaving = false; return; }

      chunks.forEach(function(chunk, i) {
        var k = safeKey(CHUNK_PREFIX + i);
        tg.CloudStorage.setItem(k, chunk, function(e) {
          if (e) console.error('[TG-Sync] Ошибка чанка ' + i + ':', e);
          pending--;
          if (pending === 0) {
            isSaving = false;
            console.log('[TG-Sync] Сохранено (' + chunks.length + ' чанков, ' + json.length + ' символов)');
            window.dispatchEvent(new CustomEvent('tgSyncSaved', { detail: { chunks: chunks.length } }));
          }
        });
      });
    });
  }

  // ====== ЗАГРУЗКА ИЗ ОБЛАКА ======
  function loadFromCloud(callback) {
    tg.CloudStorage.getItem(safeKey(CHUNK_COUNT_KEY), function(err, countStr) {
      if (err || !countStr) {
        console.log('[TG-Sync] Нет сохранёнки в облаке — новый игрок или первая загрузка');
        if (callback) callback(false);
        return;
      }

      var n = parseInt(countStr, 10);
      if (!n || n < 1) { if (callback) callback(false); return; }

      var keys = [];
      for (var i = 0; i < n; i++) keys.push(safeKey(CHUNK_PREFIX + i));

      tg.CloudStorage.getItems(keys, function(e, items) {
        if (e) {
          console.error('[TG-Sync] Ошибка загрузки чанков:', e);
          if (callback) callback(false);
          return;
        }

        var full = '';
        for (var j = 0; j < n; j++) {
          var chunk = items[keys[j]];
          if (typeof chunk !== 'string') {
            console.warn('[TG-Sync] Пропущен чанк ' + j);
            continue;
          }
          full += chunk;
        }

        try {
          var data = JSON.parse(full);
          var count = 0;

          // Решаем: облако новее локального?
          // Сравниваем по pahomKraftLastTick, а если его нет — просто перезаписываем
          var localTick = parseInt(localStorage.getItem('pahomKraftLastTick') || '0', 10) || 0;
          var cloudTick = parseInt(data['pahomKraftLastTick'] || '0', 10) || 0;

          var cloudIsNewer = cloudTick >= localTick;

          if (cloudIsNewer) {
            for (var k in data) {
              if (data[k] !== null && data[k] !== undefined) {
                localStorage.setItem(k, data[k]);
                count++;
              }
            }
            lastSaveHash = JSON.stringify(data);
            console.log('[TG-Sync] Загружено из облака: ' + count + ' ключей');
            if (callback) callback(true, count);
          } else {
            console.log('[TG-Sync] Локальная сохранёнка новее облачной — оставляем локальную, потом зальём в облако');
            if (callback) callback(false);
            // Автоматически запушим свежую локальную в облако
            setTimeout(function() { saveToCloud(true); }, 1000);
          }
        } catch (err) {
          console.error('[TG-Sync] Ошибка парсинга:', err);
          if (callback) callback(false);
        }
      });
    });
  }

  // ====== АВТОСОХРАНЕНИЕ ======
  setInterval(function() { saveToCloud(false); }, SAVE_INTERVAL_MS);

  // Сохраняем при сворачивании / закрытии
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') saveToCloud(true);
  });

  window.addEventListener('pagehide', function() { saveToCloud(true); });
  window.addEventListener('beforeunload', function() { saveToCloud(true); });

  // Сохраняем при каждом закрытии Mini App
  if (tg.onEvent) {
    tg.onEvent('viewportChanged', function() {
      if (!tg.isExpanded) saveToCloud(true);
    });
  }

  // ====== ЭКСПОРТ ======
  window.tgSyncLoad = loadFromCloud;
  window.tgSyncSave = saveToCloud;
  window.tgUserId = (tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user.id : null;
  window.tgUserName = (tg.initDataUnsafe && tg.initDataUnsafe.user) ? (tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name) : null;

  console.log('[TG-Sync] Готов. Игрок:', window.tgUserName, 'ID:', window.tgUserId);
})();
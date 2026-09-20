// income.js — тонкий слой: только чтение pending и вызов сервера
// Всё начисление делает СЕРВЕР (calcPendingFromCraftState).
// Клиент только показывает и вызывает /api/claim_pending.
(function() {
   'use strict';

  var API_BASE = 'https://save-pahom.duckdns.org';
  var PENDING = 'pahomKraftPending';
  var CRAFT_STATE = 'pahomKraftState';

  function getPending() {
    return parseInt(localStorage.getItem(PENDING) || '0', 10) || 0;
  }

  function getUserId() {
    try {
      if (window.tgSyncUserId) return window.tgSyncUserId;
      return localStorage.getItem('pahomServerUserId') || '';
    } catch(e) { return ''; }
  }

  // Чисто для UI — сколько в минуту приносят срочники/меты.
  // Ничего не пишет в localStorage, ничего не начисляет.
  function calcIncomePerMin() {
    var state = {};
    try { state = JSON.parse(localStorage.getItem(CRAFT_STATE) || '{}') || {}; } catch(e) { return 0; }

    // baseIncome берём из «известных» рецептов на клиенте.
    // Список должен совпадать с серверным.
    var BASE_INCOME = {
      medic: 10, dodonov: 1, ishmatov: 12, seimur: 10,
      davydov: 16, samurai: 30, saint: 25, pahom_jr: 50,
      dryn: 100
      // wholetooth — не даёт дохода (item без baseIncome)
    };

    var perMin = 0;
    Object.keys(state).forEach(function(key) {
      var m = key.match(/^(.+)_t(\d+)$/);
      if (!m) return;
      var id = m[1];
      var tier = parseInt(m[2], 10) || 1;
      var count = parseInt(state[key], 10) || 0;
      if (count <= 0) return;
      var base = BASE_INCOME[id];
      if (!base) return;
      perMin += base * tier * count;
    });
    return perMin;
  }

  // Вызывается кнопкой «Скинуться» в kraft.html.
  // Шлёт POST /api/claim_pending → сервер списывает и начисляет.
  // Возвращает Promise с числом (сколько получено) или 0.
  function claimPending() {
    return new Promise(function(resolve) {
      var userId = getUserId();
      if (!userId) { resolve(0); return; }

      // Оптимистично: если локально pending = 0, всё равно дёрнем сервер —
      // он мог начислить между последним load и этим кликом.
      fetch(API_BASE + '/api/claim_pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId })
      })
      .then(function(r) { return r.json(); })
      .then(function(resp) {
        if (!resp || !resp.ok) {
          // «Нечего получать» — это норма, не ошибка
          resolve(0);
          return;
        }
        var claimed = parseInt(resp.claimed || '0', 10) || 0;

        // Обновляем локальный баланс сразу (UI не ждёт tgSyncLoad)
        try { localStorage.setItem('pahomSexpah', String(resp.newBalance)); } catch(e) {}
        try { localStorage.setItem(PENDING, '0'); } catch(e) {}

        // Синхронизируем всё остальное с сервером
        if (window.tgSyncLoad) {
          window.tgSyncLoad(function() {
            resolve(claimed);
          });
        } else {
          resolve(claimed);
        }
      })
      .catch(function() { resolve(0); });
    });
  }

  window.pahomGetPending = getPending;
  window.pahomClaimPending = claimPending;
  window.pahomCalcIncomePerMin = calcIncomePerMin;
})();
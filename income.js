// income.js — общий оффлайн-доход от срочников (копит в pending)
(function() {
  'use strict';

  var CRAFT_STATE = 'pahomKraftState';
  var LAST_TICK = 'pahomKraftLastTick';
  var PENDING = 'pahomKraftPending';

  var INCOMES = {
    medic: 2,
    seimur: 10,
    dodonov: 1,
    ishmatov: 12
  };

  function getCraftState() {
    try { return JSON.parse(localStorage.getItem(CRAFT_STATE) || '{}') || {}; } catch(e) { return {}; }
  }

  function calcIncomePerMin() {
    var state = getCraftState();
    var perMin = 0;
    for (var id in INCOMES) {
      if (state[id] && state[id] > 0) perMin += INCOMES[id] * state[id];
    }
    return perMin;
  }

  function applyIncome() {
    var now = Date.now();
    var last = parseInt(localStorage.getItem(LAST_TICK) || '0', 10) || 0;

    if (last === 0) {
      localStorage.setItem(LAST_TICK, String(now));
      return 0;
    }

    var perMin = calcIncomePerMin();
    if (perMin <= 0) {
      localStorage.setItem(LAST_TICK, String(now));
      return 0;
    }

    var diffMs = now - last;
    if (diffMs < 60000) return 0;

    var diffMin = Math.floor(diffMs / 60000);
    var earned = perMin * diffMin;

    var pending = parseInt(localStorage.getItem(PENDING) || '0', 10) || 0;
    pending += earned;
    try { localStorage.setItem(PENDING, String(pending)); } catch(e) {}
    localStorage.setItem(LAST_TICK, String(last + diffMin * 60000));

    window.dispatchEvent(new CustomEvent('pahomPendingChanged', { detail: { pending: pending } }));
    return earned;
  }

  function claimPending() {
    var pending = parseInt(localStorage.getItem(PENDING) || '0', 10) || 0;
    if (pending <= 0) return 0;

    var sexpah = parseInt(localStorage.getItem('pahomSexpah') || '0', 10) || 0;
    sexpah += pending;
    try { localStorage.setItem('pahomSexpah', String(sexpah)); } catch(e) {}
    try { localStorage.setItem(PENDING, '0'); } catch(e) {}

    window.dispatchEvent(new CustomEvent('pahomPendingChanged', { detail: { pending: 0 } }));

    try {
      if (window.tgSyncSave) window.tgSyncSave(true);
    } catch(e) {}

    return pending;
  }

  function getPending() {
    return parseInt(localStorage.getItem(PENDING) || '0', 10) || 0;
  }

  applyIncome();
  setInterval(applyIncome, 5000);

  window.pahomApplyIncome = applyIncome;
  window.pahomClaimPending = claimPending;
  window.pahomGetPending = getPending;
  window.pahomCalcIncomePerMin = calcIncomePerMin;
})();
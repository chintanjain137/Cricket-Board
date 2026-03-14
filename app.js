/**
 * GULLY CRICKET BOARD — app.js
 * Rebuilt: all DOM refs fetched fresh, no stale captures.
 * Full 2-innings support with target chasing & result.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'gullyMatch';
  const MAX_WICKETS = 10;

  let match = null;

  /* ── tiny helper: always fetch fresh ── */
  function el(id) { return document.getElementById(id); }
  function qsa(sel) { return document.querySelectorAll(sel); }

  /* ─────────────────────────────────────
     INIT
  ───────────────────────────────────── */
  function init() {
    bindEvents();
    const saved = loadFromStorage();
    if (saved && saved.innings1) {
      match = saved;
      showMain();
    } else {
      showSetup();
    }
  }

  /* ─────────────────────────────────────
     EVENT BINDING
  ───────────────────────────────────── */
  function bindEvents() {
    /* setup screen */
    qsa('.over-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        qsa('.over-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        el('customOvers').value = '';
      });
    });
    el('btnStartMatch').addEventListener('click', handleStart);
    el('btnNewMatch').addEventListener('click', handleNewMatch);

    /* scoring buttons */
    qsa('.btn-run').forEach(btn => {
      btn.addEventListener('click', () => recordBall({ type: 'run', value: parseInt(btn.dataset.run, 10) }));
    });
    el('btnWide').addEventListener('click',   () => recordBall({ type: 'wide' }));
    el('btnNoball').addEventListener('click', () => recordBall({ type: 'noball' }));
    el('btnWicket').addEventListener('click', () => recordBall({ type: 'wicket' }));
    el('btnUndo').addEventListener('click',   handleUndo);

    /* innings transition — use event delegation so it works even if hidden at load */
    document.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'btnStartInn2') handleStartInn2();
    });
  }

  /* ─────────────────────────────────────
     MATCH LIFECYCLE
  ───────────────────────────────────── */
  function handleStart() {
    let overs = 0;
    const sel = document.querySelector('.over-opt.selected');
    if (sel) overs = parseInt(sel.dataset.val, 10);
    const custom = parseInt(el('customOvers').value, 10);
    if (!isNaN(custom) && custom > 0) overs = custom;
    if (!overs || overs < 1) { alert('Please select or enter a valid number of overs.'); return; }

    match = {
      totalOvers: overs,
      currentInnings: 1,
      innings1: { balls: [] },
      innings2: null
    };
    saveToStorage();
    showMain();
  }

  function handleNewMatch() {
    const inn = activeInnings();
    if (inn && inn.balls.length > 0) {
      if (!confirm('Start a new match? Current data will be cleared.')) return;
    }
    clearStorage();
    match = null;
    qsa('.over-opt').forEach(b => b.classList.remove('selected'));
    el('customOvers').value = '';
    showSetup();
  }

  function handleStartInn2() {
    if (!match || match.innings2) return;
    match.currentInnings = 2;
    match.innings2 = { balls: [] };
    saveToStorage();
    render();
  }

  /* ─────────────────────────────────────
     BALL RECORDING
  ───────────────────────────────────── */
  function recordBall(ball) {
    if (!match) return;
    const innings = activeInnings();
    if (!innings) return;

    const stats = calcStats(innings.balls, match.totalOvers);

    /* block if current innings already done */
    if (stats.inningsComplete) return;

    /* in 2nd innings: block if target already passed (shouldn't normally be reachable) */
    if (match.currentInnings === 2) {
      const target = calcStats(match.innings1.balls, match.totalOvers).runs + 1;
      if (stats.runs >= target) return;
    }

    innings.balls.push(ball);
    saveToStorage();
    render();
    flashScore();
  }

  function handleUndo() {
    const innings = activeInnings();
    if (!innings || innings.balls.length === 0) return;
    innings.balls.pop();
    saveToStorage();
    render();
  }

  /* ─────────────────────────────────────
     HELPERS
  ───────────────────────────────────── */
  function activeInnings() {
    if (!match) return null;
    return match.currentInnings === 1 ? match.innings1 : match.innings2;
  }

  function calcStats(balls, totalOvers) {
    let runs = 0, wickets = 0, extras = 0, legalBalls = 0;
    for (const ball of balls) {
      if (ball.type === 'run')    { runs += ball.value; legalBalls++; }
      else if (ball.type === 'wicket') { wickets++;         legalBalls++; }
      else if (ball.type === 'wide')   { runs++; extras++; }
      else if (ball.type === 'noball') { runs++; extras++; }
    }
    const totalLegal   = totalOvers * 6;
    const oversNum     = Math.floor(legalBalls / 6);
    const ballsInOver  = legalBalls % 6;
    const oversDecimal = oversNum + ballsInOver / 6;
    return {
      runs, wickets, extras, legalBalls,
      oversNum, ballsInOver,
      oversDisplay: oversNum + '.' + ballsInOver,
      oversDecimal,
      runRate: oversDecimal > 0 ? (runs / oversDecimal).toFixed(2) : '0.00',
      inningsComplete: legalBalls >= totalLegal || wickets >= MAX_WICKETS,
      totalLegal
    };
  }

  function getBallsByOver(balls) {
    const overs = [];
    let cur = [], legal = 0;
    for (const ball of balls) {
      cur.push(ball);
      if (ball.type === 'run' || ball.type === 'wicket') {
        legal++;
        if (legal === 6) { overs.push([...cur]); cur = []; legal = 0; }
      }
    }
    if (cur.length) overs.push(cur);
    return overs;
  }

  function getBallLabel(ball) {
    if (ball.type === 'run')     return ball.value === 0 ? '•' : String(ball.value);
    if (ball.type === 'wicket')  return 'W';
    if (ball.type === 'wide')    return 'WD';
    if (ball.type === 'noball')  return 'NB';
    return '?';
  }

  function getBallChipClass(ball) {
    if (ball.type === 'run')    return 'chip-run-' + ball.value;
    if (ball.type === 'wicket') return 'chip-wicket';
    if (ball.type === 'wide')   return 'chip-wide';
    if (ball.type === 'noball') return 'chip-noball';
    return '';
  }

  function setButtonsDisabled(disabled) {
    qsa('.btn-run').forEach(b => { b.disabled = disabled; });
    el('btnWide').disabled   = disabled;
    el('btnNoball').disabled = disabled;
    el('btnWicket').disabled = disabled;
  }

  function flashScore() {
    const s = el('scoreRuns');
    s.classList.remove('flash');
    void s.offsetWidth;
    s.classList.add('flash');
  }

  function show(id)  { el(id).classList.remove('hidden'); }
  function hide(id)  { el(id).classList.add('hidden'); }

  /* ─────────────────────────────────────
     RENDER
  ───────────────────────────────────── */
  function render() {
    if (!match) return;

    const isInn2      = match.currentInnings === 2;
    const inn1Stats   = calcStats(match.innings1.balls, match.totalOvers);
    const activeBalls = isInn2 && match.innings2 ? match.innings2.balls : match.innings1.balls;
    const activeStats = calcStats(activeBalls, match.totalOvers);

    /* ── innings badge ── */
    const badge = el('inningsBadge');
    badge.textContent = isInn2 ? '2ND INNINGS' : '1ST INNINGS';
    badge.className   = 'innings-badge ' + (isInn2 ? 'badge-inn2' : 'badge-inn1');

    /* ── main scoreboard ── */
    el('scoreRuns').textContent         = activeStats.runs;
    el('scoreWickets').textContent      = activeStats.wickets;
    el('scoreOvers').textContent        = activeStats.oversDisplay + ' / ' + match.totalOvers;
    el('scoreRR').textContent           = activeStats.runRate;
    el('scoreExtras').textContent       = activeStats.extras;
    el('totalOversDisplay').textContent = match.totalOvers;

    /* ── last ball ── */
    const badge2 = el('lastBallBadge');
    if (activeBalls.length > 0) {
      const last = activeBalls[activeBalls.length - 1];
      badge2.textContent = getBallLabel(last);
      badge2.className   = 'ball-badge ball-chip ' + getBallChipClass(last);
    } else {
      badge2.textContent = '—';
      badge2.className   = 'ball-badge';
    }

    /* ── current over ── */
    renderCurrentOver(activeStats, activeBalls);

    /* ── 1st innings summary strip (only in 2nd innings) ── */
    if (isInn2) {
      show('inn1Summary');
      el('inn1Score').textContent = '1st Innings: ' + inn1Stats.runs + '/' + inn1Stats.wickets + ' (' + inn1Stats.oversDisplay + ')';
    } else {
      hide('inn1Summary');
    }

    /* ── target bar (only in 2nd innings) ── */
    if (isInn2) {
      const target    = inn1Stats.runs + 1;
      const runsLeft  = Math.max(0, target - activeStats.runs);
      const ballsLeft = match.totalOvers * 6 - activeStats.legalBalls;
      const rrr       = ballsLeft > 0 ? (runsLeft / (ballsLeft / 6)).toFixed(2) : '—';
      show('targetBar');
      el('targetNeeded').textContent    = runsLeft > 0 ? 'Need ' + runsLeft + ' more' : '🎯 Target reached!';
      el('targetBallsLeft').textContent = ballsLeft + ' balls left';
      el('targetRRR').textContent       = 'RRR ' + rrr;
    } else {
      hide('targetBar');
    }

    /* ── decide which banner (if any) to show ── */
    const inn1Done    = inn1Stats.inningsComplete;
    const waitingInn2 = inn1Done && !match.innings2;   // 1st complete, haven't started 2nd yet

    let matchOver = false;
    let resultText = '';

    if (isInn2) {
      const target = inn1Stats.runs + 1;
      const chased = activeStats.runs >= target;
      const inn2Done = activeStats.inningsComplete;

      if (chased || inn2Done) {
        matchOver = true;
        if (chased) {
          const wktsLeft  = MAX_WICKETS - activeStats.wickets;
          const ballsLeft = match.totalOvers * 6 - activeStats.legalBalls;
          resultText = 'Team 2 WON by ' + wktsLeft + ' wickets (' + ballsLeft + ' balls to spare) 🏆';
        } else {
          const diff = inn1Stats.runs - activeStats.runs;
          if (diff > 0)       resultText = 'Team 1 WON by ' + diff + ' runs 🏆';
          else if (diff === 0) resultText = 'MATCH TIED 🤝';
          else                 resultText = 'Team 2 WON 🏆';
        }
      }
    }

    /* banners: only one shown at a time */
    if (matchOver) {
      hide('inn1CompleteBanner');
      show('matchResultBanner');
      el('matchResultText').textContent = resultText;
      setButtonsDisabled(true);
    } else if (waitingInn2) {
      show('inn1CompleteBanner');
      hide('matchResultBanner');
      el('inn1FinalScore').textContent = inn1Stats.runs + '/' + inn1Stats.wickets + ' (' + inn1Stats.oversDisplay + ')';
      setButtonsDisabled(true);
    } else {
      hide('inn1CompleteBanner');
      hide('matchResultBanner');
      setButtonsDisabled(false);
    }

    /* undo is always allowed if balls exist */
    el('btnUndo').disabled = activeBalls.length === 0;

    /* ── history ── */
    renderHistory(activeBalls);
  }

  function renderCurrentOver(stats, balls) {
    const overs = getBallsByOver(balls);
    const last  = overs.length > 0 ? overs[overs.length - 1] : [];
    /* if the last group ended on exactly the 6th legal ball it's complete → show empty */
    const complete = stats.legalBalls > 0 && stats.ballsInOver === 0;
    const display  = complete ? [] : last;
    el('currentOverBalls').innerHTML = display
      .map(b => `<span class="ball-chip ${getBallChipClass(b)}">${getBallLabel(b)}</span>`)
      .join('');
  }

  function renderHistory(balls) {
    const overs = getBallsByOver(balls);
    if (!overs.length) {
      el('ballHistory').innerHTML = '<div style="color:var(--muted);font-size:0.85rem;text-align:center;padding:10px 0;">No balls bowled yet</div>';
      el('historyCount').textContent = '';
      return;
    }
    el('historyCount').textContent = balls.length + ' balls';
    el('ballHistory').innerHTML = [...overs].reverse().map((overBalls, ri) => {
      const overNum = overs.length - ri;
      const chips = overBalls
        .map(b => `<span class="ball-chip ${getBallChipClass(b)}">${getBallLabel(b)}</span>`)
        .join('');
      return `<div class="over-group">
        <div class="over-group-label">OVER ${overNum}</div>
        <div class="over-group-balls">${chips}</div>
      </div>`;
    }).join('');
  }

  /* ─────────────────────────────────────
     VIEW SWITCHING
  ───────────────────────────────────── */
  function showSetup() {
    show('setupPanel');
    hide('mainContent');
  }

  function showMain() {
    hide('setupPanel');
    show('mainContent');
    render();
  }

  /* ─────────────────────────────────────
     LOCAL STORAGE
  ───────────────────────────────────── */
  function saveToStorage() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(match)); }
    catch (e) { console.warn('Storage save failed:', e); }
  }

  function loadFromStorage() {
    try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }

  function clearStorage() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  /* ─── BOOT ─── */
  init();

})();
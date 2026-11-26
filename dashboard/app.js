// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and renders the
// ranked board, the filters, a per-protocol drawer with the model's own arithmetic and the farm plan.
// No network: every byte it shows is in data.js.
//
// The page recomputes each row's implied value from the snapshot figures it was given and compares the
// result with the number board.json carries, so the screenshot and the code are visibly the same
// arithmetic. Nothing here is special-cased by protocol name.
(function () {
  'use strict';

  var R = window.RADAR;
  if (!R) return;

  var $ = function (sel) { return document.querySelector(sel); };

  var state = {
    q: '',
    category: 'all',
    chain: 'all',
    early: false,
    sort: 'implied',
    dir: -1,
    tab: 'pre-token',
    selected: null
  };

  // Deep links: #q=...&category=...&chain=...&early=1&tab=live&p=<slug>. The page is still one file and
  // one render; the hash only seeds the state before the first paint, so a view can be linked or shot.
  (function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('q')) state.q = p.get('q');
    if (p.get('category')) state.category = p.get('category');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('early')) state.early = p.get('early') === '1';
    if (p.get('tab')) state.tab = p.get('tab');
    if (p.get('p')) state.selected = p.get('p');
  })();

  /* ---------- formatting ---------- */

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }

  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function pctClass(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'flat';
    if (n > 0.005) return 'up';
    if (n < -0.005) return 'down';
    return 'flat';
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function fmtMult(m) {
    if (m === null || m === undefined || !isFinite(m)) return 'n/a';
    return 'x' + m.toFixed(m >= 10 ? 1 : 3);
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- the model, recomputed in the page ---------- */

  // The same arithmetic lib/model.ts runs: TVL x the category's multiple x the growth multiplier x the
  // maturity multiplier. base_multiple is the multiple the model read off the live protocols of this
  // category, carried on the row so the page can show and check it.
  function recompute(row) {
    var m = R.model;
    var growth = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    growth = Math.min(m.growth_cap, Math.max(m.growth_floor, growth));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var base = row.tvl_usd * row.base_multiple;
    return {
      growthPct: growth,
      growthMult: growthMult,
      maturityMult: maturity,
      base: base,
      implied: Math.max(1, Math.round(base * growthMult * maturity))
    };
  }

  /* ---------- the farm plan, derived from the protocol's own record ---------- */

  function chainOf(row) { return row.chains && row.chains.length > 0 ? row.chains[0] : 'its main chain'; }

  function capitalFor(row) {
    if (row.tvl_usd >= 5e9) return 250;
    if (row.tvl_usd >= 1e9) return 150;
    if (row.tvl_usd >= 1e8) return 100;
    return 50;
  }

  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  function actionFor(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var n = row.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + n + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + " of liquidity to " + n + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + n + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + n + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + n + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + n + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + n + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + n + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + n + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + n + ' on ' + chain + ' and keep the position open.';
  }

  function farmSteps(row) {
    var chain = chainOf(row);
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(row, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
  }

  /* ---------- header ---------- */

  var market = null;
  (R.multiples || []).forEach(function (m) { if (m.category === '__market') market = m; });

  // The snapshot's provenance, without its address: the page shows who the figures came from, and the
  // board stays free of any network address.
  var srcLabel = String(R.source || '').replace(/\s*https?:\/\/\S+/g, '').replace(/[,\s]+$/, '');

  $('#ver').textContent = R.model_version;
  $('#meta').textContent = 'snapshot ' + R.as_of + '  ·  ' + R.board_size + ' pre-token protocols ranked';

  $('#formula').innerHTML =
    'implied value  =  <b>TVL</b>  ×  <b>category multiple</b>  ×  <b>growth</b>  ×  <b>maturity</b>' +
    '<br>category multiple = median( market cap ÷ TVL ) over the protocols in the same category that already trade' +
    (market ? '  ·  market-wide median ' + fmtMult(market.multiple) + ' over ' + market.sample_size + ' live protocols' : '');

  $('#note').textContent =
    'Every number comes from the snapshot alone: a protocol\u2019s TVL, its seven-day change and how long it has run without a token. ' +
    'The multiple is read off that category\u2019s live-token protocols rather than fixed by hand, so a sector the market already pays up for is valued higher. ' +
    'Protocols whose token already trades are never mixed into this board; they are on the second tab at the market\u2019s own values.';

  /* ---------- filters ---------- */

  var cats = {};
  var chains = {};
  R.rows.forEach(function (r) {
    if (r.category) cats[r.category] = (cats[r.category] || 0) + 1;
    (r.chains || []).forEach(function (c) { chains[c] = (chains[c] || 0) + 1; });
  });

  function fillSelect(el, map, allLabel) {
    var keys = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; });
    el.innerHTML = '<option value="all">' + allLabel + '</option>' + keys.map(function (k) {
      return '<option value="' + esc(k) + '">' + esc(k) + ' (' + map[k] + ')</option>';
    }).join('');
  }
  fillSelect($('#category'), cats, 'All categories');
  fillSelect($('#chain'), chains, 'All chains');

  // Reflect a deep-linked state in the controls before the first paint.
  $('#q').value = state.q;
  if (cats[state.category]) $('#category').value = state.category;
  if (chains[state.chain]) $('#chain').value = state.chain;
  $('#early').checked = state.early;

  $('#countBoard').textContent = R.rows.length;
  $('#countLive').textContent = R.live.length;

  /* ---------- filtering and sorting ---------- */

  function visible() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.early && !r.early) return false;
      if (!q) return true;
      var hay = (r.name + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    rows.sort(function (a, b) {
      var k = state.sort;
      var x, y;
      if (k === 'name') { x = a.name.toLowerCase(); y = b.name.toLowerCase(); return x < y ? -state.dir : x > y ? state.dir : 0; }
      if (k === 'category') { x = (a.category || '').toLowerCase(); y = (b.category || '').toLowerCase(); return x < y ? -state.dir : x > y ? state.dir : 0; }
      if (k === 'change') { x = a.change_7d === null ? -1e9 : a.change_7d; y = b.change_7d === null ? -1e9 : b.change_7d; }
      else if (k === 'age') { x = a.age_days === null ? 1e9 : a.age_days; y = b.age_days === null ? 1e9 : b.age_days; }
      else if (k === 'tvl') { x = a.tvl_usd; y = b.tvl_usd; }
      else if (k === 'multiple') { x = a.base_multiple; y = b.base_multiple; }
      else if (k === 'rank') { x = a.rank; y = b.rank; }
      else { x = a.implied_value_usd; y = b.implied_value_usd; }
      return (x - y) * state.dir || a.rank - b.rank;
    });
    return rows;
  }

  /* ---------- board ---------- */

  var COLS = [
    { key: 'rank', label: '#', cls: 'left', cell: function (r) { return '<span class="rank' + (r.rank <= 3 ? ' top' : '') + '">' + r.rank + '</span>'; } },
    { key: 'name', label: 'Protocol', cls: 'left', cell: function (r) {
      return '<span class="pname">' + esc(r.name) + '</span><span class="pcat">' + esc(r.category || 'uncategorised') + '</span>';
    } },
    { key: 'chain', label: 'Chains', cls: 'left hide-sm', sortable: false, cell: function (r) {
      return (r.chains || []).slice(0, 2).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') || '<span class="flat">n/a</span>';
    } },
    { key: 'tvl', label: 'TVL', cell: function (r) { return fmtUsd(r.tvl_usd); } },
    { key: 'change', label: '7d', cell: function (r) { return '<span class="' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</span>'; } },
    { key: 'age', label: 'Age', cell: function (r) { return '<span class="flat">' + fmtAge(r.age_days) + '</span>'; } },
    { key: 'multiple', label: 'Multiple', cell: function (r) { return '<span class="mult">' + fmtMult(r.base_multiple) + '</span>'; } },
    { key: 'implied', label: 'Implied value', cell: function (r) { return '<span class="implied">' + fmtUsd(r.implied_value_usd) + '</span>'; } }
  ];

  function renderBoard() {
    var board = $('#board');

    if (state.tab === 'live') {
      board.innerHTML = renderLive();
      return;
    }

    var rows = visible();
    $('#status').textContent =
      rows.length + ' of ' + R.rows.length + ' rows shown  ·  watchlist floor ' + R.watchlist_size +
      '  ·  early finds ' + R.early_size + '  ·  source ' + srcLabel;

    if (rows.length === 0) {
      board.innerHTML = '<div class="empty"><b>No protocol matches these filters</b>Clear the search or widen the category.</div>';
      return;
    }

    var head = '<tr>' + COLS.map(function (c) {
      var sorted = state.sort === c.key;
      var arrow = sorted ? '<span class="arrow">' + (state.dir === 1 ? '▲' : '▼') + '</span>' : '';
      return '<th class="' + (c.cls || '') + (sorted ? ' is-sorted' : '') + '"' +
        (c.sortable === false ? '' : ' data-sort="' + c.key + '"') + '>' + c.label + arrow + '</th>';
    }).join('') + '</tr>';

    var body = rows.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.selected === r.slug ? ' class="is-selected"' : '') + '>' +
        COLS.map(function (c) { return '<td class="' + (c.cls || '') + '">' + c.cell(r) + '</td>'; }).join('') +
        '</tr>';
    }).join('');

    board.innerHTML = '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';

    Array.prototype.forEach.call(board.querySelectorAll('th[data-sort]'), function (th) {
      th.addEventListener('click', function () {
        var k = th.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir;
        else { state.sort = k; state.dir = k === 'name' || k === 'category' || k === 'rank' ? 1 : -1; }
        renderBoard();
      });
    });

    Array.prototype.forEach.call(board.querySelectorAll('tbody tr'), function (tr) {
      tr.addEventListener('click', function () { openDrawer(tr.getAttribute('data-slug')); });
    });
  }

  function renderLive() {
    $('#status').textContent =
      R.live.length + ' protocols whose token already trades, shown at the market\u2019s own values  ·  never mixed into the ranked board';

    var head = '<tr><th class="left">#</th><th class="left">Protocol</th><th class="left hide-sm">Chains</th>' +
      '<th>TVL</th><th>Market cap</th><th>MC / TVL</th><th>7d</th></tr>';

    var body = R.live.map(function (r, i) {
      var ratio = r.mcap_usd && r.tvl_usd > 0 ? r.mcap_usd / r.tvl_usd : null;
      return '<tr>' +
        '<td class="left"><span class="rank">' + (i + 1) + '</span></td>' +
        '<td class="left"><span class="pname">' + esc(r.name) + '</span><span class="pcat">' + esc(r.category || 'uncategorised') + '</span></td>' +
        '<td class="left hide-sm">' + (r.chains || []).slice(0, 2).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + '</td>' +
        '<td>' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td>' + fmtUsd(r.mcap_usd) + '</td>' +
        '<td><span class="mult">' + (ratio === null ? 'n/a' : 'x' + ratio.toFixed(2)) + '</span></td>' +
        '<td><span class="' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</span></td>' +
        '</tr>';
    }).join('');

    return '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  /* ---------- drawer ---------- */

  function bySlug(slug) {
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) return R.rows[i];
    return null;
  }

  function openDrawer(slug) {
    var r = bySlug(slug);
    if (!r) return;
    state.selected = slug;

    var calc = recompute(r);
    var agrees = calc.implied === r.implied_value_usd;
    var steps = farmSteps(r);

    var multSource = '';
    (R.multiples || []).forEach(function (m) {
      if (r.category && m.category === r.category) {
        multSource = m.source === 'category-median'
          ? 'median of ' + m.sample_size + ' live ' + r.category + ' protocols'
          : 'market median (only ' + m.sample_size + ' live in this category)';
      }
    });

    var html =
      '<div class="drawer-head">' +
        '<div style="flex:1">' +
          '<h2>' + esc(r.name) + '</h2>' +
          '<div class="sub">' + esc(r.category || 'uncategorised') + ' · ' + esc((r.chains || []).join(', ') || 'chain not recorded') +
            ' · listed ' + esc(r.listed_at || 'unknown') + '</div>' +
        '</div>' +
        '<button type="button" class="close" id="closeDrawer" aria-label="Close">×</button>' +
      '</div>' +
      '<div class="drawer-body">' +
        '<h3 class="sect-title">How the model reaches this number</h3>' +
        '<table class="calc">' +
          '<tr><td>TVL' + (r.early ? ' <span class="src">below the watchlist floor</span>' : '') + '</td><td>' + fmtUsd(r.tvl_usd) + '</td></tr>' +
          '<tr><td>× category multiple<span class="src">' + esc(multSource) + '</span></td><td>' + fmtMult(r.base_multiple) + '</td></tr>' +
          '<tr><td>× growth<span class="src">7d ' + fmtPct(r.change_7d) + ', clamped and weighted ' + R.model.growth_weight + '</span></td><td>' + fmtMult(calc.growthMult) + '</td></tr>' +
          '<tr><td>× maturity<span class="src">' + fmtAge(r.age_days) + ' without a token, floor ' + R.model.maturity_floor + '</span></td><td>' + fmtMult(calc.maturityMult) + '</td></tr>' +
          '<tr class="total"><td>Implied value</td><td>' + fmtUsd(calc.implied) + '</td></tr>' +
        '</table>' +
        '<div class="check' + (agrees ? '' : ' bad') + '">' +
          (agrees
            ? 'page recompute ' + fmtUsd(calc.implied) + ' = board.json  ✓'
            : 'page recompute ' + fmtUsd(calc.implied) + ' ≠ board.json ' + fmtUsd(r.implied_value_usd) + '  ✗') +
        '</div>' +
        '<h3 class="sect-title">How to farm it</h3>' +
        '<ol class="steps">' + steps.map(function (s) {
          return '<li>' + esc(s.text) + '<span class="cost">' + esc(s.cost) + ' · ' + esc(s.time) + '</span></li>';
        }).join('') + '</ol>' +
      '</div>';

    var d = $('#drawer');
    d.innerHTML = html;
    d.hidden = false;
    document.body.classList.add('is-locked');
    $('#closeDrawer').addEventListener('click', closeDrawer);

    renderBoard();
  }

  function closeDrawer() {
    state.selected = null;
    $('#drawer').hidden = true;
    document.body.classList.remove('is-locked');
    renderBoard();
  }

  /* ---------- wiring ---------- */

  $('#q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
  $('#category').addEventListener('change', function (e) { state.category = e.target.value; renderBoard(); });
  $('#chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
  $('#early').addEventListener('change', function (e) { state.early = e.target.checked; renderBoard(); });

  $('#reset').addEventListener('click', function () {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.early = false;
    $('#q').value = ''; $('#category').value = 'all'; $('#chain').value = 'all'; $('#early').checked = false;
    renderBoard();
  });

  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
    tab.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.classList.remove('is-on'); });
      tab.classList.add('is-on');
      state.tab = tab.getAttribute('data-tab');
      $('#toolbar').style.display = state.tab === 'live' ? 'none' : '';
      renderBoard();
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) closeDrawer();
  });

  $('#foot').textContent =
    R.model_version + '  ·  ' + R.board_size + ' ranked  ·  ' + R.live_size + ' live  ·  snapshot ' + R.as_of + '  ·  ' + srcLabel;

  // First paint: honour a deep-linked tab and, if one was named, the protocol's drawer.
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
    t.classList.toggle('is-on', t.getAttribute('data-tab') === state.tab);
  });
  if (state.tab === 'live') $('#toolbar').style.display = 'none';

  renderBoard();
  if (state.selected) openDrawer(state.selected);
})();

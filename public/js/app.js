/* =====================================================================
   app.js -- shell, boot sequence, login, navigation & hash router
   ===================================================================== */
(function (R) {
  'use strict';
  const U = R.U, UI = R.UI, api = R.api;

  /* ------------------------------------------------------------ nav model */
  const NAV = [
    { group: 'HOME', items: ['dashboard'] },
    { group: 'STUDENTS', items: ['students'] },
    { group: 'USERS', items: ['staff'] },
    { group: 'SCHEDULING', items: ['courses', 'sections', 'master'] },
    { group: 'GRADES', items: ['grades'] },
    { group: 'ATTENDANCE', items: ['attendance'] },
    { group: 'DISCIPLINE', items: ['discipline'] },
    { group: 'FEES', items: ['fees'] },
    { group: 'REPORTS', items: ['reports'] },
    { group: 'MESSAGING', items: ['messages'] },
    { group: 'SETUP', items: ['setup'] }
  ];

  const App = {
    user: null,
    state: null,
    current: null,

    /* ------------------------------------------------------------ boot */
    boot() {
      document.getElementById('bootart').textContent = U.LOGO.join('\n');
      const log = document.getElementById('bootlog');
      const lines = [
        '  Copyright (c) 2026  RUAHSIS',
        '',
        '  [ ok ]  initialising terminal .........................',
        '  [ ok ]  loading sqlite database .......................',
        '  [ ok ]  mounting modules ..............................',
        '  [ ok ]  student / scheduling / grades / attendance ....',
        '',
        '  >> press any key to continue'
      ];
      let i = 0;
      const step = () => {
        if (i >= lines.length) { finish(); return; }
        log.textContent += lines[i] + '\n';
        i++;
        setTimeout(step, 90);
      };
      const finish = () => {
        clearTimeout(auto);
        document.getElementById('boot').classList.add('hidden');
        App.showLogin();
      };
      const auto = setTimeout(finish, 1500);
      const skip = () => { if (!document.getElementById('boot').classList.contains('hidden')) finish(); };
      document.getElementById('boot').onclick = skip;
      document.addEventListener('keydown', skip, { once: true });
      step();
    },

    /* ------------------------------------------------------------ login */
    showLogin() {
      document.getElementById('login').classList.remove('hidden');
      document.getElementById('loginart').textContent = U.LOGO.join('\n');
      document.getElementById('logindemo').textContent =
        '  DEMO ACCOUNTS\n' +
        '  ------------------------------------------------------------\n' +
        '    admin      / admin       administrator  (full access)\n' +
        '    katherine.nolan / teacher   teacher    (own sections)\n' +
        '    student1   / student     student portal (own record)\n' +
        '    parent     / parent      parent portal  (own children)';
      const box = document.getElementById('loginbox');
      box.innerHTML =
        '<pre class="ascii">' + U.esc(U.box('LOGIN', [], 60)) + '</pre>' +
        '<div style="border:1px solid var(--line2);background:var(--panel);padding:14px">' +
        '<div class="form-row"><label>USERNAME</label><div class="f"><input type="text" id="lu" autocomplete="username" autofocus></div></div>' +
        '<div class="form-row"><label>PASSWORD</label><div class="f"><input type="password" id="lp" autocomplete="current-password"></div></div>' +
        '<div class="form-row"><label></label><div class="f"><button class="primary" id="lgo">[ SIGN IN ]</button><span class="dim" id="lmsg"></span></div></div>' +
        '</div>';
      const go = () => App.login();
      document.getElementById('lgo').onclick = go;
      ['lu', 'lp'].forEach((i) => document.getElementById(i).onkeydown = (e) => { if (e.key === 'Enter') go(); });
      document.getElementById('lu').value = 'admin';
      document.getElementById('lp').value = 'admin';
    },

    async login() {
      const msg = document.getElementById('lmsg');
      msg.textContent = ' authenticating…';
      try {
        const r = await api.post('/api/auth/login', {
          username: document.getElementById('lu').value,
          password: document.getElementById('lp').value
        });
        api.token = r.token;
        App.user = r.user;
        document.getElementById('login').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        await App.refreshState();
        App.startClock();
        App._onHash = () => App.route();
        window.addEventListener('hashchange', App._onHash);
        App.route();
      } catch (e) {
        msg.innerHTML = '<span class="red"> ' + U.esc(e.message) + '</span>';
      }
    },

    logout(silent) {
      // Detach the router first: clearing location.hash fires 'hashchange',
      // which would otherwise re-render the dashboard with a dead session.
      if (App._onHash) { window.removeEventListener('hashchange', App._onHash); App._onHash = null; }
      api.token = '';
      App.user = null;
      if (silent) {
        location.hash = '';
        location.reload();
      } else {
        api.post('/api/auth/logout').catch(() => { });
        location.hash = '';
        location.reload();
      }
    },

    /* ------------------------------------------------------------ state */
    async refreshState() {
      const b = await api.get('/api/setup/bootstrap');
      const me = await api.get('/api/auth/me');
      App.user = Object.assign({}, App.user, me.user);
      R.state = App.state = {
        schoolId: b.schoolId,
        schoolYearId: b.schoolYearId,
        markingPeriodId: b.markingPeriodId,
        schools: b.schools,
        schoolYears: b.schoolYears,
        markingPeriods: b.markingPeriods,
        periods: b.periods,
        gradeLevels: b.gradeLevels,
        gradeLevelsRaw: b.gradeLevels,
        gradeScales: b.gradeScales,
        subjects: b.subjects,
        enrollmentCodes: b.enrollmentCodes,
        attendanceCodes: b.attendanceCodes,
        disciplineCategories: b.disciplineCategories,
        disciplineActions: b.disciplineActions,
        schoolName: (b.schools.find((s) => s.id === b.schoolId) || {}).title || 'School',
        schoolYearTitle: (b.schoolYears.find((s) => s.id === b.schoolYearId) || {}).title || '—'
      };
      App.renderChrome();
    },

    /* ------------------------------------------------------------ chrome */
    renderChrome() {
      const me = App.user;
      const schoolSel = R.state.schools.map((s) =>
        '<option value="' + s.id + '"' + (s.id === R.state.schoolId ? ' selected' : '') + '>' + U.esc(s.title) + '</option>').join('');
      const yearSel = R.state.schoolYears.map((s) =>
        '<option value="' + s.id + '"' + (s.id === R.state.schoolYearId ? ' selected' : '') + '>' + U.esc(s.title) + '</option>').join('');

      document.getElementById('hdr').innerHTML =
        '<button id="btnMenu" title="Menu">[ ≡ ]</button>' +
        '<span class="brand">RUAHSIS</span>' +
        '<span class="sub">v1.0</span>' +
        '<span class="pill h-user">USER <b>' + U.esc(me.username) + '</b></span>' +
        '<span class="pill h-prof">PROFILE <b>' + U.esc(String(me.profile).toUpperCase()) + '</b></span>' +
        '<span class="spacer"></span>' +
        '<span class="sub">SCHOOL</span><select id="hSchool" style="max-width:200px">' + schoolSel + '</select>' +
        '<span class="sub">YEAR</span><select id="hYear">' + yearSel + '</select>' +
        '<span class="pill h-clock" id="hClock">--:--:--</span>' +
        '<button id="btnFx">[ CRT ]</button>' +
        '<button onclick="RSIS.App.logout()">[ LOGOUT ]</button>';

      // ---- mobile navigation drawer
      const bd = document.getElementById('backdrop');
      document.getElementById('btnMenu').onclick = () => App.toggleNav();
      bd.onclick = () => App.toggleNav(false);

      document.getElementById('hSchool').onchange = (e) => {
        R.state.schoolId = Number(e.target.value);
        R.state.schoolName = (R.state.schools.find((s) => s.id === R.state.schoolId) || {}).title;
        App.reload();
      };
      document.getElementById('hYear').onchange = (e) => {
        R.state.schoolYearId = Number(e.target.value);
        R.state.schoolYearTitle = (R.state.schoolYears.find((s) => s.id === R.state.schoolYearId) || {}).title;
        App.reload();
      };
      document.getElementById('btnFx').onclick = () => document.body.classList.toggle('scan');

      // ---- sidebar
      let html = '';
      NAV.forEach((g) => {
        const items = g.items.filter((id) => {
          const v = R.Views[id];
          if (!v || v.hidden) return false;
          return !v.profiles || v.profiles.indexOf(me.profile) >= 0;
        });
        if (!items.length) return;
        html += '<div class="grp">┤ ' + g.group + ' ├</div>';
        items.forEach((id) => {
          const v = R.Views[id];
          html += '<a data-view="' + id + '">  ' + U.esc(v.title.toUpperCase()) + '</a>';
        });
      });
      document.getElementById('side').innerHTML = html;
      document.querySelectorAll('#side a').forEach((a) => a.onclick = () => {
        App.toggleNav(false);
        App.go(a.dataset.view);
      });
    },

    /** show/hide the off-canvas sidebar (mobile only) */
    toggleNav(force) {
      const side = document.getElementById('side');
      const bd = document.getElementById('backdrop');
      if (!side || !bd) return;
      const open = force === undefined ? !side.classList.contains('open') : !!force;
      side.classList.toggle('open', open);
      bd.classList.toggle('show', open);
    },

    startClock() {
      const tick = () => {
        const e = document.getElementById('hClock');
        if (e) e.textContent = new Date().toTimeString().slice(0, 8);
        const st = document.getElementById('status');
        if (st) {
          st.innerHTML =
            '<span>RUAHSIS <b>READY</b></span>' +
            '<span>SCHOOL <b>' + U.esc(R.state.schoolName) + '</b></span>' +
            '<span>YEAR <b>' + U.esc(R.state.schoolYearTitle) + '</b></span>' +
            '<span>USER <b>' + U.esc(App.user.username) + '</b></span>' +
            '<span class="spacer"></span>' +
            '<span>' + new Date().toISOString().slice(0, 10) + '</span>' +
            '<span><span class="blink">█</span></span>';
        }
      };
      tick();
      setInterval(tick, 1000);
    },

    /* ------------------------------------------------------------ router */
    go(path) { location.hash = '#/' + path; },

    parse() {
      const h = location.hash.replace(/^#\/?/, '');
      const qi = h.indexOf('?');
      const query = {};
      let base = h;
      if (qi >= 0) {
        new URLSearchParams(h.slice(qi + 1)).forEach((v, k) => query[k] = v);
        base = h.slice(0, qi);
      }
      const parts = base.split('/').filter(Boolean);
      let id = parts[1], tab = parts[2];
      // Record ids are always numeric, so a non-numeric second segment is a
      // tab:  #/attendance/day, #/reports/cards, #/setup/schools, #/messages/inbox
      // whereas  #/students/12/grades  keeps  id=12, tab=grades.
      if (id !== undefined && !/^\d+$/.test(id)) { tab = id; id = undefined; }
      return { view: parts[0] || 'dashboard', params: { id, tab }, query, raw: base };
    },

    async route() {
      const r = App.parse();
      const view = R.Views[r.view] || R.Views.dashboard;
      App.current = r;
      App.toggleNav(false);
      document.querySelectorAll('#side a').forEach((a) => a.classList.toggle('active', a.dataset.view === r.view));
      const main = document.getElementById('main');
      main.scrollTop = 0;
      try {
        await view.render(main, r.params, r.query);
      } catch (e) {
        main.innerHTML = '<pre class="ascii">' + U.esc(U.box('ERROR', [
          'View   : ' + r.view,
          'Message: ' + e.message
        ], 70)) + '</pre>';
        UI.err(e.message);
      }
    },

    reload() { App.route(); }
  };

  R.App = App;
  R.state = App.state;

  // Leaving mobile width should never leave the drawer stranded open.
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) App.toggleNav(false);
  });

  window.addEventListener('DOMContentLoaded', () => {
    if (api.token) {
      api.get('/api/auth/me').then((r) => {
        App.user = Object.assign({ profile: 'admin' }, r.user);
        document.getElementById('boot').classList.add('hidden');
        document.getElementById('login').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        App.refreshState().then(() => {
          App.startClock();
          App._onHash = () => App.route();
          window.addEventListener('hashchange', App._onHash);
          App.route();
        });
      }).catch(() => { api.token = ''; App.boot(); });
    } else {
      App.boot();
    }
  });
})(window.RSIS);

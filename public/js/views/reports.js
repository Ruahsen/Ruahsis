/* =====================================================================
   views/reports.js -- reports, report cards, transcripts
   ===================================================================== */
(function (R) {
  'use strict';
  const U = R.U, UI = R.UI, api = R.api;

  R.Views = R.Views || {};

  R.Views.reports = {
    id: 'reports', title: 'Reports', group: 'Reports',
    profiles: ['admin', 'teacher'],

    async render(root, params) {
      const tab = (params && params.tab) || 'enrollment';
      const TABS = [
        { id: 'enrollment', label: 'ENROLMENT' },
        { id: 'grades', label: 'GRADE DISTRIBUTION' },
        { id: 'attention', label: 'ATTENTION LIST' },
        { id: 'defaulters', label: 'FEE DEFAULTERS' },
        { id: 'cards', label: 'REPORT CARDS' }
      ];
      let html = UI.pageHead('REPORTS', 'analytics & printed output');
      html += UI.tabs(TABS, tab);
      html += '<div id="tabbody"></div>';
      root.innerHTML = html;
      UI.onTabs(root, (t) => R.App.go('reports/' + t));
      const body = document.getElementById('tabbody');
      switch (tab) {
        case 'grades': return R.Views.reports.grades(body);
        case 'attention': return R.Views.reports.attention(body);
        case 'defaulters': return R.Views.reports.defaulters(body);
        case 'cards': return R.Views.reports.cards(body);
        default: return R.Views.reports.enrollment(body);
      }
    },

    async enrollment(body) {
      body.innerHTML = '<pre class="ascii dim">loading…</pre>';
      const [g, s, eth] = await Promise.all([
        api.get('/api/reports/enrollment?group_by=grade_level'),
        api.get('/api/reports/enrollment?group_by=gender'),
        api.get('/api/reports/enrollment?group_by=ethnicity')
      ]);
      const mk = (res, title) => UI.chart((res.rows || []).map((r) => ({
        label: r.label || '—', n: r.n, extra: U.pct(r.n / (res.total || 1), 1)
      })));
      body.innerHTML =
        '<pre class="ascii">' + U.esc(U.box('TOTAL ENROLMENT', ['Active students: ' + g.total], 34)) + '</pre>' +
        mk(g) + mk(s) + mk(eth);
    },

    async grades(body) {
      body.innerHTML = '<pre class="ascii dim">loading…</pre>';
      const r = await api.get('/api/reports/grade-distribution');
      const rows = (r.rows || []).map((x) => ({ label: x.label || '—', n: x.n, extra: 'avg ' + U.pct(x.avg_pct) }));
      body.innerHTML = rows.length ? UI.chart(rows) : UI.empty('No grades posted for the current marking period.');
    },

    async attention(body) {
      body.innerHTML = '<pre class="ascii dim">loading…</pre>';
      const r = await api.get('/api/reports/attention-list');
      const rows = r.data.map((x) => ({
        id: x.id, sid: x.student_id, name: x.first_name + ' ' + x.last_name, gr: x.grade_level,
        present: x.present, total: x.total, bar: U.bar(x.rate, 100, 24), rate: U.pct(x.rate)
      }));
      body.innerHTML = U.table({
        title: 'ATTENDANCE ATTENTION LIST  (below 90%)',
        columns: [
          { title: 'STUDENT ID', key: 'sid', width: 11 }, { title: 'NAME', key: 'name', max: 24 },
          { title: 'GR', key: 'gr', width: 4, align: 'c' },
          { title: 'PRESENT', key: 'present', width: 8, align: 'r' }, { title: 'DAYS', key: 'total', width: 6, align: 'r' },
          { title: 'ATTENDANCE', key: 'bar', width: 26 }, { title: 'RATE', key: 'rate', width: 8, align: 'r' }
        ], rows, empty: '   every student is at or above 90% attendance'
      });
      UI.onRows(body, (id) => R.App.go('students/' + id));
    },

    async defaulters(body) {
      body.innerHTML = '<pre class="ascii dim">loading…</pre>';
      const r = await api.get('/api/reports/defaulters');
      const rows = r.data.map((x) => ({
        id: x.id, sid: x.student_id, name: x.first_name + ' ' + x.last_name, gr: x.grade_level,
        charged: U.money(x.charged), paid: U.money(x.paid), balance: U.money(x.balance),
        bar: U.bar(x.balance, Math.max.apply(null, r.data.map((y) => y.balance).concat([1])), 16)
      }));
      body.innerHTML = U.table({
        title: 'OUTSTANDING BALANCES',
        columns: [
          { title: 'STUDENT ID', key: 'sid', width: 11 }, { title: 'NAME', key: 'name', max: 24 },
          { title: 'GR', key: 'gr', width: 4, align: 'c' },
          { title: 'CHARGED', key: 'charged', width: 11, align: 'r' }, { title: 'PAID', key: 'paid', width: 11, align: 'r' },
          { title: 'BALANCE', key: 'balance', width: 11, align: 'r' }, { title: 'SEVERITY', key: 'bar', width: 18 }
        ], rows, empty: '   no outstanding balances'
      });
      UI.onRows(body, (id) => R.App.go('students/' + id + '/fees'));
    },

    async cards(body) {
      body.innerHTML = UI.toolbar(
        '<button id="btnCard">[ OPEN REPORT CARD ]</button>' +
        '<button id="btnTran">[ OPEN TRANSCRIPT ]</button>' +
        '<span class="dim">pick a student, then choose the output</span>') +
        '<div class="toolbar"><label>Student</label><input type="text" id="sq" size="18" placeholder="last name">' +
        '<button id="sb">[ FIND ]</button><select id="spick"></select></div><div id="prev"></div>';
      document.getElementById('sb').onclick = async () => {
        const res = await api.get('/api/students' + api.qs({ search: document.getElementById('sq').value, limit: 50 }));
        document.getElementById('spick').innerHTML =
          res.data.map((s) => '<option value="' + s.id + '">' + U.esc(s.student_id + '  ' + U.name(s)) + '</option>').join('');
      };
      document.getElementById('btnCard').onclick = () => {
        const id = document.getElementById('spick').value;
        if (id) R.Views.reports.reportCardModal(id); else UI.err('Find a student first');
      };
      document.getElementById('btnTran').onclick = () => {
        const id = document.getElementById('spick').value;
        if (id) R.Views.reports.transcriptModal(id); else UI.err('Find a student first');
      };
    },

    /* -------------------------------------------------------- report card */
    async reportCardModal(id) {
      const r = await api.get('/api/reports/student/' + id + '/report-card');
      const s = r.student, sch = r.school || {};
      const L = [];
      const w = 74;
      L.push(U.pad((sch.title || 'SCHOOL').toUpperCase(), w, 'c'));
      L.push(U.pad((sch.address || '') + '  ' + (sch.city || '') + ' ' + (sch.state || '') + ' ' + (sch.zip || ''), w, 'c'));
      L.push(U.repeat('═', w));
      L.push(U.pad('REPORT CARD', w, 'c'));
      L.push(U.repeat('═', w));
      L.push(U.pad('STUDENT : ' + [s.first_name, s.last_name].join(' '), w / 2) + U.pad('ID: ' + s.student_id, w / 2));
      L.push(U.pad('GRADE   : ' + (s.grade_level || '—'), w / 2) + U.pad('PERIOD: ' + ((r.markingPeriods.find((m) => m.id === r.markingPeriodId) || {}).title || '—'), w / 2));
      L.push(U.repeat('─', w));
      L.push(U.pad('COURSE', 30) + U.pad('TEACHER', 20) + U.pad('%', 6, 'r') + U.pad('GR', 5, 'r') + U.pad('CR', 6, 'r') + U.pad('GP', 7, 'r'));
      L.push(U.repeat('─', w));
      r.courses.forEach((c) => {
        L.push(U.pad(String(c.course_title || c.title).slice(0, 29), 30) +
          U.pad(String(c.teacher || '—').slice(0, 19), 20) +
          U.pad(c.grade_percent === null ? '—' : U.pct(c.grade_percent, 1), 6, 'r') +
          U.pad(c.grade_letter || '—', 5, 'r') +
          U.pad(U.n(c.credit_attempted).toFixed(2), 6, 'r') +
          U.pad(U.n(c.weighted_gp).toFixed(2), 7, 'r'));
      });
      L.push(U.repeat('─', w));
      L.push(U.pad('COURSES: ' + r.courses.length, 30) + U.pad('CREDITS: ' + U.n(r.credits).toFixed(2), 20) +
        U.pad('GPA: ' + r.gpa.toFixed(2), 24));
      L.push(U.repeat('═', w));
      if (r.courses.length) {
        const absent = r.courses.reduce((a, c) => a + (c.att_absent || 0), 0);
        const total = r.courses.reduce((a, c) => a + (c.att_total || 0), 0);
        L.push('Period absences: ' + absent + ' of ' + total + ' recorded period checks');
      }
      L.push('');
      L.push(U.pad('___________________________', 36) + U.pad('___________________________', 38));
      L.push(U.pad('Principal  ' + (sch.principal || ''), 36) + U.pad('Date  ' + U.date(Date.now()), 38));

      UI.modal({
        title: 'REPORT CARD  ' + s.student_id,
        html: '<pre class="ascii">' + U.esc(L.join('\n')) + '</pre>',
        saveLabel: 'PRINT / EXPORT',
        extra: '<button id="btnCsv">[ CSV ]</button>',
        onSave: () => {
          const win = window.open('', '_blank');
          win.document.write('<html><head><title>Report card ' + U.esc(s.student_id) + '</title>' +
            '<style>body{font-family:monospace;white-space:pre;background:#fff;color:#000;padding:20px}</style></head><body>' +
            U.esc(L.join('\n')) + '</body></html>');
          win.document.close(); win.print();
        }
      });
      setTimeout(() => {
        const b = document.getElementById('btnCsv');
        if (b) b.onclick = () => {
          const lines = ['course,teacher,percent,letter,credit,grade_points'];
          r.courses.forEach((c) => lines.push([c.course_title, c.teacher, c.grade_percent, c.grade_letter, c.credit_attempted, c.weighted_gp].join(',')));
          U.download('reportcard-' + s.student_id + '.csv', lines.join('\n'), 'text/csv');
        };
      }, 60);
    },

    /* -------------------------------------------------------- transcript */
    async transcriptModal(id) {
      const r = await api.get('/api/reports/student/' + id + '/transcript');
      const s = r.student, sch = r.school || {};
      const w = 74;
      const L = [];
      L.push(U.pad((sch.title || 'SCHOOL').toUpperCase(), w, 'c'));
      L.push(U.pad('OFFICIAL TRANSCRIPT', w, 'c'));
      L.push(U.repeat('═', w));
      L.push(U.pad('STUDENT : ' + [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' '), w / 2) + U.pad('ID: ' + s.student_id, w / 2));
      L.push(U.pad('BIRTHDATE: ' + U.date(s.birthdate), w / 2) + U.pad('GRADE: ' + (s.grade_level || '—'), w / 2));
      L.push('');
      r.years.forEach((y) => {
        L.push(U.repeat('─', w));
        L.push('SCHOOL YEAR  ' + y.schoolYear + '           YEAR GPA: ' + y.gpa.toFixed(2) + '   CREDITS: ' + U.n(y.cred).toFixed(2));
        L.push(U.repeat('─', w));
        L.push(U.pad('COURSE', 32) + U.pad('MARKING PERIOD', 16) + U.pad('%', 6, 'r') + U.pad('GR', 5, 'r') + U.pad('CREDIT', 8, 'r') + U.pad('GP', 7, 'r'));
        y.courses.forEach((c) => {
          L.push(U.pad(String(c.course_title || c.title).slice(0, 31), 32) +
            U.pad(String(c.mp_title || '—').slice(0, 15), 16) +
            U.pad(c.grade_percent === null ? '—' : U.pct(c.grade_percent, 1), 6, 'r') +
            U.pad(c.grade_letter || '—', 5, 'r') +
            U.pad(U.n(c.credit_attempted).toFixed(2), 8, 'r') +
            U.pad(U.n(c.weighted_gp).toFixed(2), 7, 'r'));
        });
      });
      L.push(U.repeat('═', w));
      L.push(U.pad('CUMULATIVE GPA : ' + r.cumulativeGpa.toFixed(2), w / 2) + U.pad('TOTAL CREDITS: ' + U.n(r.totalCredits).toFixed(2), w / 2));
      L.push(U.repeat('═', w));

      UI.modal({
        title: 'TRANSCRIPT  ' + s.student_id,
        html: '<pre class="ascii">' + U.esc(L.join('\n')) + '</pre>',
        saveLabel: 'PRINT / EXPORT',
        onSave: () => {
          const win = window.open('', '_blank');
          win.document.write('<html><head><title>Transcript ' + U.esc(s.student_id) + '</title>' +
            '<style>body{font-family:monospace;white-space:pre;background:#fff;color:#000;padding:20px}</style></head><body>' +
            U.esc(L.join('\n')) + '</body></html>');
          win.document.close(); win.print();
        }
      });
    }
  };
})(window.RSIS);

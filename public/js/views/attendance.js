/* =====================================================================
   views/attendance.js -- daily + period attendance, summaries
   ===================================================================== */
(function (R) {
  'use strict';
  const U = R.U, UI = R.UI, api = R.api;

  R.Views = R.Views || {};
  const isStaff = () => R.App.user && (R.App.user.profile === 'admin' || R.App.user.profile === 'teacher');
  const TABS = [
    { id: 'day', label: 'DAILY ATTENDANCE' },
    { id: 'period', label: 'PERIOD ATTENDANCE' },
    { id: 'summary', label: 'SUMMARY' },
    { id: 'daily', label: 'DAILY TOTALS' }
  ];

  R.Views.attendance = {
    id: 'attendance', title: 'Attendance', group: 'Attendance',
    profiles: ['admin', 'teacher', 'parent', 'student'],

    async render(root, params, query) {
      const tab = (params && params.tab) || (query && query.cp ? 'period' : 'day');
      let html = UI.pageHead('ATTENDANCE', 'daily & period attendance');
      if (isStaff()) html += UI.tabs(TABS, tab);
      html += '<div id="tabbody"></div>';
      root.innerHTML = html;
      UI.onTabs(root, (t) => R.App.go('attendance/' + t));
      const body = document.getElementById('tabbody');
      if (!isStaff()) return R.Views.attendance.summary(body);
      switch (tab) {
        case 'period': return R.Views.attendance.period(body, query);
        case 'summary': return R.Views.attendance.summary(body);
        case 'daily': return R.Views.attendance.daily(body);
        default: return R.Views.attendance.day(body);
      }
    },

    /* ------------------------------------------------------- day */
    async day(body) {
      const today = new Date().toISOString().slice(0, 10);
      body.innerHTML = UI.toolbar(
        '<label>DATE</label><input type="date" id="dt" value="' + today + '">' +
        '<label>GRADE</label>' + UI.select('gr', (R.state.gradeLevels || []).map((g) => ({ value: g.short_name || g.title, label: g.title })), '', 'all') +
        '<button id="go">[ LOAD ]</button>' +
        (isStaff() ? '<button class="primary" id="save">[ SAVE ATTENDANCE ]</button>' : '') +
        '<span class="spacer"></span><span class="dim" id="sum"></span>') + '<div id="grid"></div>';

      const load = async () => {
        const box = document.getElementById('grid');
        box.innerHTML = '<pre class="ascii dim">loading…</pre>';
        const d = await api.get('/api/attendance/day' + api.qs({ date: document.getElementById('dt').value, grade_level: document.getElementById('gr').value }));
        const opts = d.codes.map((c) => '<option value="' + c.id + '"' + (String(c.id) === String(d.rows[0] && d.rows[0].attendance_code) ? '' : '') + '>' + U.esc(c.short_name + ' - ' + c.title) + '</option>').join('');
        const rows = d.rows.map((r) => ({
          id: r.student.id, sid: r.student.student_id, name: U.name(r.student), gr: r.student.grade_level,
          code: '<select class="code" data-s="' + r.student.id + '">' + d.codes.map((c) =>
            '<option value="' + c.id + '"' + (String(c.id) === String(r.attendance_code) ? ' selected' : '') + '>' + U.esc(c.short_name + ' - ' + c.title) + '</option>').join('') + '</select>',
          comment: '<input type="text" class="cmt" data-s="' + r.student.id + '" value="' + U.esc(r.comment || '') + '" size="26">'
        }));
        box.innerHTML = '<div class="scroll-x"><table class="grid"><thead><tr>' +
          ['STUDENT ID', 'NAME', 'GR', 'CODE', 'COMMENT'].map((h) => '<th>' + h + '</th>').join('') +
          '</tr></thead><tbody>' + rows.map((r) => '<tr><td>' + U.esc(r.sid) + '</td><td>' + U.esc(r.name) + '</td><td>' +
            U.esc(r.gr) + '</td><td>' + r.code + '</td><td>' + r.comment + '</td></tr>').join('') + '</tbody></table></div>';
        document.getElementById('sum').textContent =
          'present ' + d.summary.present + ' / absent ' + d.summary.absent + ' / excused ' + d.summary.excused +
          ' / tardy ' + d.summary.tardy + '  →  ' + U.pct(d.summary.rate);
      };
      const save = async () => {
        const entries = [];
        document.querySelectorAll('#grid .code').forEach((sel) => {
          const sid = sel.dataset.s;
          const cmt = document.querySelector('#grid .cmt[data-s="' + sid + '"]');
          entries.push({ student_id: Number(sid), attendance_code: Number(sel.value), comment: cmt ? cmt.value : '' });
        });
        try {
          const r = await api.post('/api/attendance/day', { date: document.getElementById('dt').value, entries });
          UI.ok(r.message); load();
        } catch (e) { UI.err(e.message); }
      };
      document.getElementById('go').onclick = load;
      document.getElementById('dt').onchange = load;
      document.getElementById('gr').onchange = load;
      if (isStaff()) document.getElementById('save').onclick = save;
      load();
    },

    /* ------------------------------------------------------- period */
    async period(body, query) {
      const today = new Date().toISOString().slice(0, 10);
      body.innerHTML = UI.toolbar(
        '<label>SECTION</label><select id="cp"></select>' +
        '<label>DATE</label><input type="date" id="dt" value="' + today + '">' +
        '<button id="go">[ LOAD ]</button>' +
        (isStaff() ? '<button class="primary" id="save">[ SAVE ]</button>' : '') +
        '<span class="spacer"></span><span class="dim" id="sum"></span>') + '<div id="grid"></div>';

      const cps = await api.get('/api/course-periods');
      const sel = document.getElementById('cp');
      sel.innerHTML = cps.data.map((c) => '<option value="' + c.id + '">' + U.esc((c.period || '?') + '  ' + c.course_title + ' / ' + c.title) + '</option>').join('');
      if (query && query.cp) sel.value = query.cp;

      const load = async () => {
        const box = document.getElementById('grid');
        box.innerHTML = '<pre class="ascii dim">loading…</pre>';
        try {
          const d = await api.get('/api/attendance/period' + api.qs({ course_period_id: sel.value, date: document.getElementById('dt').value }));
          box.innerHTML = '<div class="scroll-x"><table class="grid"><thead><tr>' +
            ['STUDENT ID', 'NAME', 'CODE', 'REASON'].map((h) => '<th>' + h + '</th>').join('') +
            '</tr></thead><tbody>' + d.rows.map((r) =>
              '<tr><td>' + U.esc(r.student.student_id) + '</td><td>' + U.esc(U.name(r.student)) + '</td><td>' +
              '<select class="code" data-s="' + r.student.id + '">' + d.codes.map((c) =>
                '<option value="' + c.id + '"' + (String(c.id) === String(r.attendance_code) ? ' selected' : '') + '>' + U.esc(c.short_name + ' - ' + c.title) + '</option>').join('') +
              '</select></td><td><input type="text" class="cmt" data-s="' + r.student.id + '" value="' + U.esc(r.attendance_reason || '') + '" size="30"></td></tr>'
            ).join('') + '</tbody></table></div>';
          document.getElementById('sum').textContent = d.rows.length + ' students';
        } catch (e) { box.innerHTML = UI.empty(e.message); }
      };
      document.getElementById('go').onclick = load;
      document.getElementById('dt').onchange = load;
      sel.onchange = load;
      if (isStaff()) document.getElementById('save').onclick = async () => {
        const entries = [];
        document.querySelectorAll('#grid .code').forEach((s) => {
          const cmt = document.querySelector('#grid .cmt[data-s="' + s.dataset.s + '"]');
          entries.push({ student_id: Number(s.dataset.s), attendance_code: Number(s.value), attendance_reason: cmt ? cmt.value : '' });
        });
        try {
          const r = await api.post('/api/attendance/period', { course_period_id: Number(sel.value), date: document.getElementById('dt').value, entries });
          UI.ok(r.message); load();
        } catch (e) { UI.err(e.message); }
      };
      if (sel.value) load();
    },

    /* ------------------------------------------------------- summary */
    async summary(body) {
      body.innerHTML = '<pre class="ascii dim">loading…</pre>';
      const r = await api.get('/api/attendance/summary');
      const rows = r.data.map((x) => ({
        id: x.studentId, sid: x.sid, name: x.name, gr: x.grade_level,
        present: x.present, absent: x.absent, excused: x.excused, tardy: x.tardy, total: x.total,
        bar: U.bar(x.rate, 100, 22), rate: U.pct(x.rate)
      }));
      body.innerHTML = U.table({
        title: 'ATTENDANCE SUMMARY  (lowest rate first)',
        columns: [
          { title: 'STUDENT ID', key: 'sid', width: 11 }, { title: 'NAME', key: 'name', max: 24 },
          { title: 'GR', key: 'gr', width: 4, align: 'c' },
          { title: 'PRESENT', key: 'present', width: 8, align: 'r' }, { title: 'ABSENT', key: 'absent', width: 7, align: 'r' },
          { title: 'EXC', key: 'excused', width: 5, align: 'r' }, { title: 'TARDY', key: 'tardy', width: 6, align: 'r' },
          { title: 'DAYS', key: 'total', width: 6, align: 'r' },
          { title: 'ATTENDANCE', key: 'bar', width: 24 }, { title: 'RATE', key: 'rate', width: 8, align: 'r' }
        ], rows, empty: '   no attendance data recorded yet'
      });
      UI.onRows(body, (id) => R.App.go('students/' + id));
    },

    /* ------------------------------------------------------- daily totals */
    async daily(body) {
      body.innerHTML = '<pre class="ascii dim">loading…</pre>';
      const r = await api.get('/api/attendance/daily');
      const rows = r.data.map((x) => ({
        id: x.school_date, date: U.date(x.school_date), present: x.present, absent: x.absent,
        tardy: x.tardy, total: x.total, bar: U.bar(x.rate, 100, 30), rate: U.pct(x.rate)
      }));
      body.innerHTML = U.table({
        title: 'DAILY SCHOOL-WIDE TOTALS',
        columns: [
          { title: 'DATE', key: 'date', width: 11 }, { title: 'PRESENT', key: 'present', width: 9, align: 'r' },
          { title: 'ABSENT', key: 'absent', width: 8, align: 'r' }, { title: 'TARDY', key: 'tardy', width: 7, align: 'r' },
          { title: 'RECORDED', key: 'total', width: 9, align: 'r' },
          { title: 'ATTENDANCE', key: 'bar', width: 32 }, { title: 'RATE', key: 'rate', width: 8, align: 'r' }
        ], rows, empty: '   no attendance recorded'
      });
    }
  };
})(window.RSIS);

/* =====================================================================
   views/scheduling.js -- Courses, sections, master schedule
   ===================================================================== */
(function (R) {
  'use strict';
  const U = R.U, UI = R.UI, api = R.api;

  R.Views = R.Views || {};
  const isAdmin = () => R.App.user && R.App.user.profile === 'admin';
  const isStaff = () => R.App.user && (R.App.user.profile === 'admin' || R.App.user.profile === 'teacher');

  /* =================================================== COURSES ========= */
  R.Views.courses = {
    id: 'courses', title: 'Courses', group: 'Scheduling',
    profiles: ['admin', 'teacher', 'parent', 'student'],

    async render(root, params) {
      let html = UI.pageHead('COURSES', 'course catalogue');
      if (isAdmin()) html += UI.toolbar('<button class="primary" id="btnNew">[ + NEW COURSE ]</button>');
      html += UI.toolbar(
        '<label>SEARCH</label><input type="text" id="q" size="22" placeholder="title / short name">' +
        '<label>SUBJECT</label>' + UI.select('fSubj', (R.state.subjects || []).map((s) => ({ value: s.id, label: s.title })), '', 'all') +
        '<button id="btnGo">[ SEARCH ]</button><span class="spacer"></span><span class="dim" id="cnt"></span>');
      html += '<div id="list"></div>';
      root.innerHTML = html;

      const load = async () => {
        const box = document.getElementById('list');
        box.innerHTML = '<pre class="ascii dim">loading…</pre>';
        try {
          const qs = api.qs({ search: document.getElementById('q').value, limit: 500, filter: { subject_id: document.getElementById('fSubj').value } });
          const res = await api.get('/api/courses' + qs);
          document.getElementById('cnt').textContent = res.total + ' course(s)';
          const rows = res.data.map((c) => ({
            id: c.id, short: c.short_name || '—', title: c.title, subject: c.subject || '—',
            grade: c.grade_level || '—', credits: U.n(c.credit_hours).toFixed(2), sections: c.sections,
            status: c.is_active ? 'ACTIVE' : 'INACTIVE',
            desc: String(c.description || '').replace(/\s+/g, ' ').slice(0, 42)
          }));
          box.innerHTML = U.table({
            title: 'COURSES',
            columns: [
              { title: 'SHORT', key: 'short', width: 12 }, { title: 'TITLE', key: 'title', max: 28 },
              { title: 'SUBJECT', key: 'subject', max: 18 }, { title: 'GRADES', key: 'grade', width: 8 },
              { title: 'CREDIT', key: 'credits', width: 7, align: 'r' },
              { title: 'SEC', key: 'sections', width: 4, align: 'r' }, { title: 'STATUS', key: 'status', width: 9 },
              { title: 'DESCRIPTION', key: 'desc', max: 42 }
            ], rows, empty: '   no courses found'
          });
          UI.onRows(box, (id) => R.Views.courses.detail(id));
        } catch (e) { box.innerHTML = UI.empty(e.message); }
      };
      document.getElementById('btnGo').onclick = load;
      document.getElementById('q').onkeydown = (e) => { if (e.key === 'Enter') load(); };
      document.getElementById('fSubj').onchange = load;
      if (document.getElementById('btnNew')) document.getElementById('btnNew').onclick = () => R.Views.courses.edit(null);
      load();
    },

    async detail(id) {
      const r = await api.get('/api/courses/' + id);
      const c = r.course;
      const rows = (c.periods || []).map((p) => ({
        id: p.id, per: p.period || '—', time: (p.start_time || '') + '-' + (p.end_time || ''),
        section: p.title, teacher: p.teacher || '—', room: p.room || '—',
        seats: (p.filled_seats || 0) + '/' + p.total_seats, bar: U.bar(p.filled_seats || 0, p.total_seats || 1, 12)
      }));
      let html = '<pre class="ascii">' + U.esc(U.kvbox('COURSE', [
        ['Title', c.title], ['Short Name', c.short_name], ['Subject', c.subject],
        ['Grade Levels', c.grade_level], ['Credit Hours', U.n(c.credit_hours).toFixed(2)],
        ['Description', String(c.description || '').slice(0, 120)]
      ], 70)) + '</pre>';
      html += U.table({
        title: 'SECTIONS',
        columns: [
          { title: 'PER', key: 'per', width: 4, align: 'c' }, { title: 'TIME', key: 'time', width: 12 },
          { title: 'SECTION', key: 'section', max: 22 }, { title: 'TEACHER', key: 'teacher', max: 18 },
          { title: 'ROOM', key: 'room', width: 6 }, { title: 'FILL', key: 'bar', width: 14 }, { title: 'SEATS', key: 'seats', width: 8, align: 'r' }
        ], rows, empty: '   no sections defined for this course'
      });
      html += '<div class="toolbar">' +
        (isAdmin() ? '<button id="btnEdit">[ EDIT COURSE ]</button><button id="btnSec">[ + ADD SECTION ]</button>' : '') +
        '<button onclick="RSIS.App.go(\'sections\')">[ ALL SECTIONS ]</button></div>';
      UI.modal({
        title: 'COURSE  ' + c.short_name,
        html: html,
        saveLabel: 'CLOSE',
        onSave: async () => { }
      });
      const bind = (i, fn) => { const e = document.getElementById(i); if (e) e.onclick = () => { document.querySelector('#modal [data-close]').click(); setTimeout(fn, 60); }; };
      bind('btnEdit', () => R.Views.courses.edit(c));
      bind('btnSec', () => R.Views.sections.edit(null, c.id));
    },

    edit(c) {
      const isNew = !c; const d = c || {};
      UI.modal({
        title: isNew ? 'NEW COURSE' : 'EDIT COURSE',
        fields: [
          { name: 'title', label: 'Title', value: d.title, required: true },
          { name: 'short_name', label: 'Short Name', value: d.short_name },
          { name: 'subject_id', label: 'Subject', type: 'select', value: d.subject_id, options: (R.state.subjects || []).map((s) => ({ value: s.id, label: s.title })) },
          { name: 'grade_level', label: 'Grade Levels', value: d.grade_level || '9-12' },
          { name: 'credit_hours', label: 'Credit Hours', type: 'number', value: d.credit_hours === undefined ? 1 : d.credit_hours },
          { name: 'description', label: 'Description', type: 'textarea', rows: 3, value: d.description },
          { name: 'is_active', label: 'Active', type: 'checkbox', value: d.is_active === undefined ? 1 : d.is_active }
        ],
        onDelete: isNew ? null : async () => { await api.del('/api/courses/' + d.id); UI.ok('Course deleted'); R.App.reload(); },
        onSave: async (data) => {
          if (isNew) { await api.post('/api/courses', data); UI.ok('Course created'); }
          else { await api.put('/api/courses/' + d.id, data); UI.ok('Course saved'); }
          R.App.reload();
        }
      });
    }
  };

  /* =================================================== SECTIONS ======== */
  R.Views.sections = {
    id: 'sections', title: 'Sections', group: 'Scheduling',
    profiles: ['admin', 'teacher'],

    async render(root) {
      let html = UI.pageHead('COURSE PERIODS', 'sections / master schedule');
      if (isAdmin()) html += UI.toolbar('<button class="primary" id="btnNew">[ + NEW SECTION ]</button>');
      html += UI.toolbar(
        '<label>SEARCH</label><input type="text" id="q" size="20" placeholder="section / course">' +
        '<label>PERIOD</label>' + UI.select('fPer', (R.state.periods || []).map((p) => ({ value: p.id, label: p.title })), '', 'all') +
        '<label>TEACHER</label>' + UI.select('fTeach', [], '', 'all') +
        '<button id="btnGo">[ GO ]</button><span class="spacer"></span><span class="dim" id="cnt"></span>');
      html += '<div id="list"></div>';
      root.innerHTML = html;

      // load teachers into the filter
      try {
        const t = await api.get('/api/staff/teachers');
        const sel = document.getElementById('fTeach');
        t.data.forEach((x) => sel.insertAdjacentHTML('beforeend', '<option value="' + x.id + '">' + U.esc(U.name(x)) + '</option>'));
      } catch (_) { }

      const load = async () => {
        const box = document.getElementById('list');
        box.innerHTML = '<pre class="ascii dim">loading…</pre>';
        try {
          const qs = api.qs({
            search: document.getElementById('q').value,
            filter: { period_id: document.getElementById('fPer').value, teacher_id: document.getElementById('fTeach').value }
          });
          const res = await api.get('/api/course-periods' + qs);
          document.getElementById('cnt').textContent = res.total + ' section(s)';
          const rows = res.data.map((c) => ({
            id: c.id, per: c.period || '—', time: (c.start_time || '') + '-' + (c.end_time || ''),
            course: c.course_title || '—', section: c.title, teacher: c.teacher || '—', room: c.room || '—',
            bar: U.bar(c.enrolled || 0, c.total_seats || 1, 10), seats: (c.enrolled || 0) + '/' + c.total_seats
          }));
          box.innerHTML = U.table({
            title: 'COURSE PERIODS',
            columns: [
              { title: 'PER', key: 'per', width: 4, align: 'c' }, { title: 'TIME', key: 'time', width: 12 },
              { title: 'COURSE', key: 'course', max: 24 }, { title: 'SECTION', key: 'section', max: 20 },
              { title: 'TEACHER', key: 'teacher', max: 18 }, { title: 'ROOM', key: 'room', width: 5 },
              { title: 'FILL', key: 'bar', width: 12 }, { title: 'SEATS', key: 'seats', width: 8, align: 'r' }
            ], rows, empty: '   no sections found'
          });
          UI.onRows(box, (id) => R.Views.sections.roster(id));
        } catch (e) { box.innerHTML = UI.empty(e.message); }
      };
      document.getElementById('btnGo').onclick = load;
      document.getElementById('q').onkeydown = (e) => { if (e.key === 'Enter') load(); };
      ['fPer', 'fTeach'].forEach((i) => document.getElementById(i).onchange = load);
      if (document.getElementById('btnNew')) document.getElementById('btnNew').onclick = () => R.Views.sections.edit(null);
      load();
    },

    async roster(id) {
      const [cp, roster] = await Promise.all([
        api.get('/api/course-periods/' + id),
        api.get('/api/course-periods/' + id + '/roster')
      ]);
      const c = cp.coursePeriod;
      const rows = roster.data.map((s) => ({
        id: s.id, sid: s.student_id, name: U.name(s), gr: s.grade_level,
        gender: s.gender || '—', email: s.email || '—'
      }));
      let html = '<pre class="ascii">' + U.esc(U.kvbox('SECTION', [
        ['Section', c.title], ['Course', c.course_title], ['Teacher', c.teacher],
        ['Period', c.period_title + '  ' + (c.start_time || '') + '-' + (c.end_time || '')],
        ['Room', c.room], ['Seats', (c.enrolled || 0) + ' / ' + c.total_seats],
        ['Credit', c.credit_attempted]
      ], 62)) + '</pre>';
      html += U.table({
        title: 'ROSTER  (' + rows.length + ' students)',
        columns: [
          { title: 'STUDENT ID', key: 'sid', width: 11 }, { title: 'NAME', key: 'name', max: 26 },
          { title: 'GR', key: 'gr', width: 4, align: 'c' }, { title: 'GENDER', key: 'gender', width: 8 },
          { title: 'EMAIL', key: 'email', max: 28 }
        ], rows, empty: '   no students enrolled'
      });
      html += '<div class="toolbar">' +
        '<button id="gb">[ GRADEBOOK ]</button>' +
        '<button id="att">[ ATTENDANCE ]</button>' +
        (isStaff() ? '<button id="addstu">[ + ENROL STUDENT ]</button>' : '') +
        (isAdmin() ? '<button id="edit">[ EDIT SECTION ]</button>' : '') +
        '</div>';
      UI.modal({ title: 'SECTION  ' + c.short_name, html: html, saveLabel: 'CLOSE', onSave: async () => { } });
      const close = () => document.querySelector('#modal [data-close]').click();
      document.getElementById('gb').onclick = () => { close(); setTimeout(() => R.App.go('gradebook/' + id), 60); };
      document.getElementById('att').onclick = () => { close(); setTimeout(() => R.App.go('attendance?cp=' + id), 60); };
      const bind = (i, fn) => { const e = document.getElementById(i); if (e) e.onclick = () => { close(); setTimeout(fn, 60); }; };
      bind('edit', () => R.Views.sections.edit(c));
      bind('addstu', () => UI.modal({
        title: 'ENROL STUDENT INTO ' + c.short_name,
        fields: [
          { name: 'q', label: 'Search', placeholder: 'type a last name…' },
          { name: 'student_id', label: 'Student', type: 'select', options: [], required: true }
        ],
        html: '<div class="form-row"><label>Search</label><div class="f"><input type="text" id="sq" placeholder="last name"><button type="button" id="sb">[ FIND ]</button></div></div>' +
          '<div class="form-row"><label>Student</label><div class="f"><select id="f_student_id"></select></div></div>',
        onSave: async () => {
          const sid = document.getElementById('f_student_id').value;
          if (!sid) throw new Error('Pick a student first');
          await api.post('/api/course-periods/' + id + '/enroll', { student_id: sid });
          UI.ok('Student enrolled');
        }
      }));
      // wire the student search inside the enrol modal
      setTimeout(() => {
        const sb = document.getElementById('sb');
        if (!sb) return;
        sb.onclick = async () => {
          const res = await api.get('/api/students' + api.qs({ search: document.getElementById('sq').value, limit: 50 }));
          const sel = document.getElementById('f_student_id');
          sel.innerHTML = res.data.map((s) => '<option value="' + s.id + '">' + U.esc(s.student_id + '  ' + U.name(s)) + '</option>').join('');
        };
      }, 80);
    },

    edit(c, presetCourseId) {
      const isNew = !c; const d = c || {};
      UI.modal({
        title: isNew ? 'NEW SECTION' : 'EDIT SECTION',
        fields: [
          { name: 'course_id', label: 'Course', type: 'select', value: d.course_id || presetCourseId, options: [], required: true },
          { name: 'title', label: 'Section Title', value: d.title, required: true },
          { name: 'short_name', label: 'Short Name', value: d.short_name },
          { name: 'teacher_id', label: 'Teacher', type: 'select', value: d.teacher_id, options: [] },
          { name: 'period_id', label: 'Period', type: 'select', value: d.period_id, options: (R.state.periods || []).map((p) => ({ value: p.id, label: p.title + '  ' + (p.start_time || '') })) },
          { name: 'room', label: 'Room', value: d.room },
          { name: 'total_seats', label: 'Total Seats', type: 'number', value: d.total_seats || 30 },
          { name: 'credit_attempted', label: 'Credit', type: 'number', value: d.credit_attempted === undefined ? 1 : d.credit_attempted },
          { name: 'mp_id', label: 'Marking Period', type: 'select', value: d.mp_id || (R.state.markingPeriods.find((m) => m.mp_type === 'year') || {}).id, options: R.state.markingPeriods.map((m) => ({ value: m.id, label: m.title })) },
          { name: 'grade_scale_id', label: 'Grade Scale', type: 'select', value: d.grade_scale_id || (R.state.gradeScales[0] || {}).id, options: R.state.gradeScales.map((g) => ({ value: g.id, label: g.title })) },
          { name: 'does_attendance', label: 'Take Attendance', type: 'checkbox', value: d.does_attendance === undefined ? 1 : d.does_attendance },
          { name: 'is_active', label: 'Active', type: 'checkbox', value: d.is_active === undefined ? 1 : d.is_active }
        ],
        onDelete: isNew ? null : async () => { await api.del('/api/course-periods/' + d.id); UI.ok('Section deleted'); R.App.reload(); },
        onSave: async (data) => {
          if (isNew) { await api.post('/api/course-periods', data); UI.ok('Section created'); }
          else { await api.put('/api/course-periods/' + d.id, data); UI.ok('Section saved'); }
          R.App.reload();
        }
      });
      // populate course + teacher selects asynchronously
      (async () => {
        const [courses, teachers] = await Promise.all([api.get('/api/courses?limit=500'), api.get('/api/staff/teachers')]);
        const cs = document.getElementById('f_course_id');
        if (cs) cs.innerHTML = courses.data.map((x) => '<option value="' + x.id + '"' + (String(x.id) === String(d.course_id || presetCourseId) ? ' selected' : '') + '>' + U.esc(x.short_name + '  ' + x.title) + '</option>').join('');
        const ts = document.getElementById('f_teacher_id');
        if (ts) ts.innerHTML = '<option value="">— unassigned —</option>' + teachers.data.map((x) => '<option value="' + x.id + '"' + (String(x.id) === String(d.teacher_id) ? ' selected' : '') + '>' + U.esc(U.name(x)) + '</option>').join('');
      })();
    }
  };

  /* =================================================== MASTER SCHEDULE == */
  R.Views.master = {
    id: 'master', title: 'Master Schedule', group: 'Scheduling',
    profiles: ['admin', 'teacher'],

    async render(root) {
      let html = UI.pageHead('MASTER SCHEDULE', 'period / section grid');
      html += '<div id="ms"></div>';
      root.innerHTML = html;
      const r = await api.get('/api/scheduling/master');
      const periods = r.periods;
      const byPeriod = {};
      r.rows.forEach((x) => { (byPeriod[x.period_id] = byPeriod[x.period_id] || []).push(x); });

      const cellW = 30;
      const lines = [];
      const head = U.pad('PERIOD', 10) + periods.map((p) => U.pad((p.short_name || p.title) + ' ' + (p.start_time || '').slice(0, 5), cellW)).join('');
      const maxRows = Math.max.apply(null, periods.map((p) => (byPeriod[p.id] || []).length).concat([1]));
      lines.push(head);
      lines.push(U.repeat('─', 10 + periods.length * cellW));
      for (let i = 0; i < maxRows; i++) {
        lines.push(U.pad(i === 0 ? 'SECTIONS' : '', 10) + periods.map((p) => {
          const cell = (byPeriod[p.id] || [])[i];
          return cell ? U.pad(cell.short_name + ' r' + (cell.room || '?'), cellW) : U.pad('', cellW);
        }).join(''));
      }
      let out = U.box('MASTER SCHEDULE', lines, Math.min(200, 10 + periods.length * cellW + 2));
      root.innerHTML = html + '<pre class="ascii">' + U.esc(out) + '</pre>';

      // unscheduled students
      const u = await api.get('/api/scheduling/unscheduled');
      if (u.data.length) {
        root.innerHTML += '<pre class="ascii">' + U.esc(U.box('UNSCHEDULED STUDENTS (' + u.data.length + ')',
          u.data.slice(0, 30).map((s) => U.pad(s.student_id, 10) + U.pad(U.name(s), 26) + 'gr ' + s.grade_level), 56)) + '</pre>';
      } else {
        root.innerHTML += '<pre class="ascii">' + U.esc(U.box('UNSCHEDULED STUDENTS', ['all active students are scheduled'], 56)) + '</pre>';
      }
    }
  };
})(window.RSIS);

/* =====================================================================
   views/students.js -- student roster + full student record
   ===================================================================== */
(function (R) {
  'use strict';
  const U = R.U, UI = R.UI, api = R.api;

  R.Views = R.Views || {};
  const isAdmin = () => R.App.user && R.App.user.profile === 'admin';
  const isStaff = () => R.App.user && (R.App.user.profile === 'admin' || R.App.user.profile === 'teacher');

  const TABS = [
    { id: 'profile', label: 'PROFILE' }, { id: 'enrollment', label: 'ENROLMENT' },
    { id: 'contacts', label: 'CONTACTS' }, { id: 'medical', label: 'MEDICAL' },
    { id: 'schedule', label: 'SCHEDULE' }, { id: 'grades', label: 'GRADES' },
    { id: 'attendance', label: 'ATTENDANCE' }, { id: 'discipline', label: 'DISCIPLINE' },
    { id: 'fees', label: 'FEES' }, { id: 'notes', label: 'NOTES' }
  ];

  const V = {
    id: 'students', title: 'Students', group: 'Students',
    profiles: ['admin', 'teacher', 'parent', 'student'],

    async render(root, params) {
      if (params && params.id) return V.detail(root, params.id, params.tab || 'profile');
      return V.list(root);
    },

    /* ------------------------------------------------------------ list */
    async list(root) {
      root.innerHTML = UI.pageHead('STUDENTS', 'roster') + '<pre class="ascii dim">loading…</pre>';
      const me = R.App.user;

      let html = UI.pageHead('STUDENTS', 'roster');
      if (me.profile === 'admin') {
        html += UI.toolbar('<button class="primary" id="btnNew">[ + NEW STUDENT ]</button>');
      }
      html += UI.toolbar(
        '<label>SEARCH</label><input type="text" id="q" size="22" placeholder="name / id / email">' +
        '<label>GRADE</label>' + UI.select('fGrade', (R.state.gradeLevels || []).map((g) => ({ value: g.short_name || g.title, label: g.title })), '', 'all') +
        '<label>STATUS</label>' + UI.select('fActive', [{ value: '1', label: 'Active' }, { value: '0', label: 'Inactive' }], '1', 'all') +
        '<button id="btnGo">[ SEARCH ]</button><span class="spacer"></span><span class="dim" id="cnt"></span>'
      );
      html += '<div id="list"></div>';
      root.innerHTML = html;

      const load = async () => {
        const box = document.getElementById('list');
        box.innerHTML = '<pre class="ascii dim">loading…</pre>';
        try {
          const qs = api.qs({
            search: document.getElementById('q').value,
            limit: 500,
            filter: {
              grade_level: document.getElementById('fGrade').value,
              is_active: document.getElementById('fActive').value
            }
          });
          const res = await api.get('/api/students' + qs);
          document.getElementById('cnt').textContent = res.total + ' record(s)';
          const rows = res.data.map((s) => ({
            id: s.id, student_id: s.student_id, name: [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' '),
            gr: s.grade_level, gender: s.gender, courses: s.scheduled_courses, dob: U.date(s.birthdate),
            status: s.is_active ? 'ACTIVE' : 'INACTIVE', email: s.email
          }));
          box.innerHTML = U.table({
            title: 'STUDENT ROSTER',
            columns: [
              { title: 'STUDENT ID', key: 'student_id', width: 11 },
              { title: 'NAME', key: 'name', max: 30 },
              { title: 'GR', key: 'gr', width: 4, align: 'c' },
              { title: 'GENDER', key: 'gender', width: 8 },
              { title: 'BIRTHDATE', key: 'dob', width: 11 },
              { title: 'CRS', key: 'courses', width: 4, align: 'r' },
              { title: 'STATUS', key: 'status', width: 9 },
              { title: 'EMAIL', key: 'email', max: 30 }
            ],
            rows, empty: '   no students match the current filter'
          });
          UI.onRows(box, (id) => R.App.go('students/' + id));
        } catch (e) { box.innerHTML = UI.empty(e.message); }
      };

      document.getElementById('btnGo').onclick = load;
      document.getElementById('q').onkeydown = (e) => { if (e.key === 'Enter') load(); };
      ['fGrade', 'fActive'].forEach((i) => document.getElementById(i).onchange = load);
      if (document.getElementById('btnNew')) document.getElementById('btnNew').onclick = () => V.edit();
      load();
    },

    /* ------------------------------------------------------------ detail */
    async detail(root, id, tab) {
      root.innerHTML = '<pre class="ascii dim">loading student…</pre>';
      const d = await api.get('/api/students/' + id);
      const s = d.student;
      const me = R.App.user;
      const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ');

      let html = UI.pageHead(fullName.toUpperCase(), '#' + s.student_id + '  ' + (s.grade_level ? 'grade ' + s.grade_level : ''),
        '<button onclick="RSIS.App.go(\'students\')">[ < BACK TO LIST ]</button>');
      html += UI.tabs(TABS, tab);
      html += '<div id="tabbody"></div>';
      root.innerHTML = html;

      UI.onTabs(root, (t) => R.App.go('students/' + id + '/' + t));
      const body = document.getElementById('tabbody');
      await V.renderTab(body, d, tab);
    },

    async renderTab(body, d, tab) {
      const s = d.student;
      switch (tab) {
        case 'enrollment': return V.tabEnrollment(body, d);
        case 'contacts': return V.tabContacts(body, d);
        case 'medical': return V.tabMedical(body, d);
        case 'schedule': return V.tabSchedule(body, d);
        case 'grades': return V.tabGrades(body, d);
        case 'attendance': return V.tabAttendance(body, d);
        case 'discipline': return V.tabDiscipline(body, d);
        case 'fees': return V.tabFees(body, d);
        case 'notes': return V.tabNotes(body, d);
        default: return V.tabProfile(body, d);
      }
    },

    /* ------------------------------------------------------------ profile */
    async tabProfile(body, d) {
      const s = d.student;
      const info = [
        ['Student ID', s.student_id], ['Alt ID', s.alt_id],
        ['Name', [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ')],
        ['Preferred', s.preferred_name], ['Gender', s.gender],
        ['Birthdate', U.date(s.birthdate) + (U.age(s.birthdate) ? '  (age ' + U.age(s.birthdate) + ')' : '')],
        ['Grade Level', s.grade_level], ['Email', s.email], ['Phone', s.phone],
        ['Address', [s.address, s.city, s.state, s.zip].filter(Boolean).join(', ')],
        ['Ethnicity', s.ethnicity], ['Language', s.language],
        ['Enrolled', U.date(s.enrollment_date)], ['Status', s.is_active ? 'ACTIVE' : 'INACTIVE']
      ];
      let html = '<pre class="ascii">' + U.esc(U.kvbox('STUDENT INFO', info, 66)) + '</pre>';

      const med = d.medical || {};
      const alertLines = [
        'Allergies   : ' + (med.allergies || 'none recorded'),
        'Medications : ' + (med.medications || 'none recorded'),
        'Physician   : ' + (med.physician || '—') + ' ' + (med.physician_phone || ''),
        'Insurance   : ' + (med.insurance || '—') + (med.policy_number ? '  #' + med.policy_number : '')
      ];
      html += '<pre class="ascii">' + U.esc(U.box('MEDICAL ALERTS', alertLines, 66)) + '</pre>';

      const contacts = (d.contacts || []).slice(0, 3);
      html += '<pre class="ascii">' + U.esc(U.box('CONTACTS',
        contacts.length ? contacts.map((c) => U.pad(c.relationship || 'Contact', 14) + ' ' + U.name(c) + '  ' + (c.cell_phone || c.home_phone || '')) : ['no contacts recorded'], 66)) + '</pre>';

      if (isAdmin()) {
        html += '<div class="toolbar">' +
          '<button id="btnEdit">[ EDIT STUDENT ]</button>' +
          '<button id="btnCard">[ REPORT CARD ]</button>' +
          '<button id="btnTran">[ TRANSCRIPT ]</button>' +
          '<button class="danger" id="btnDrop">[ DROP / WITHDRAW ]</button>' +
          '<button class="danger" id="btnDel">[ DELETE ]</button></div>';
      } else if (isStaff()) {
        html += '<div class="toolbar"><button id="btnCard">[ REPORT CARD ]</button><button id="btnTran">[ TRANSCRIPT ]</button></div>';
      }

      body.innerHTML = html;
      const bind = (i, fn) => { const e = document.getElementById(i); if (e) e.onclick = fn; };
      bind('btnEdit', () => V.edit(s));
      bind('btnCard', () => R.Views.reports.reportCardModal(s.id));
      bind('btnTran', () => R.Views.reports.transcriptModal(s.id));
      bind('btnDrop', () => UI.confirm('Drop ' + U.name(s) + ' from the current school year?', async () => {
        await api.post('/api/students/' + s.id + '/drop', { drop_code: 'TROUT' });
        UI.ok('Student dropped'); R.App.go('students/' + s.id);
      }));
      bind('btnDel', () => UI.confirm('PERMANENTLY delete ' + U.name(s) + ' and all related records?', async () => {
        await api.del('/api/students/' + s.id); UI.ok('Student deleted'); R.App.go('students');
      }));
    },

    /* ------------------------------------------------------------ enrollment */
    async tabEnrollment(body, d) {
      const rows = (d.enrollment || []).map((e, i) => ({
        id: e.id, year: e.school_year || '—', school: (R.state.schools.find((x) => x.id === e.school_id) || {}).title || e.school_id,
        grade: e.grade_level, start: U.date(e.start_date), end: U.date(e.end_date),
        code: e.enrollment_code || '—', drop: e.drop_code || '—'
      }));
      let html = U.table({
        title: 'ENROLMENT HISTORY',
        columns: [
          { title: 'SCHOOL YEAR', key: 'year', width: 14 }, { title: 'SCHOOL', key: 'school', max: 24 },
          { title: 'GR', key: 'grade', width: 4, align: 'c' }, { title: 'START', key: 'start', width: 11 },
          { title: 'END', key: 'end', width: 11 }, { title: 'ENROL CODE', key: 'code', width: 11 },
          { title: 'DROP CODE', key: 'drop', width: 10 }
        ], rows, empty: '   no enrolment records'
      });
      if (isAdmin()) html += '<div class="toolbar"><button id="btnAdd">[ + ADD ENROLMENT RECORD ]</button></div>';
      body.innerHTML = html;
      if (isAdmin()) document.getElementById('btnAdd').onclick = () => UI.modal({
        title: 'ENROLMENT RECORD',
        fields: [
          { name: 'school_id', label: 'School', type: 'select', value: d.student.school_id, options: R.state.schools.map((x) => ({ value: x.id, label: x.title })) },
          { name: 'school_year_id', label: 'School Year', type: 'select', value: R.state.schoolYearId, options: R.state.schoolYears.map((x) => ({ value: x.id, label: x.title })) },
          { name: 'grade_level', label: 'Grade Level', value: d.student.grade_level },
          { name: 'start_date', label: 'Start Date', type: 'date', value: new Date().toISOString().slice(0, 10) },
          { name: 'end_date', label: 'End Date', type: 'date' },
          { name: 'enrollment_code', label: 'Enrol Code', value: 'NEW' },
          { name: 'comment', label: 'Comment', type: 'textarea', rows: 2 }
        ],
        onSave: async (data) => { await api.post('/api/students/' + d.student.id + '/enrollment', data); UI.ok('Enrolment added'); R.App.go('students/' + d.student.id + '/enrollment'); }
      });
    },

    /* ------------------------------------------------------------ contacts */
    async tabContacts(body, d) {
      const rows = (d.contacts || []).map((c) => ({
        id: c.id, rel: c.relationship || '—', name: U.name(c),
        home: c.home_phone || '—', cell: c.cell_phone || '—', email: c.email || '—',
        flags: [c.is_custodial ? 'custodial' : '', c.is_emergency ? 'emergency' : ''].filter(Boolean).join(' ') || '—'
      }));
      let html = U.table({
        title: 'CONTACTS / GUARDIANS',
        columns: [
          { title: 'RELATIONSHIP', key: 'rel', width: 14 }, { title: 'NAME', key: 'name', max: 24 },
          { title: 'HOME', key: 'home', width: 14 }, { title: 'CELL', key: 'cell', width: 14 },
          { title: 'EMAIL', key: 'email', max: 26 }, { title: 'FLAGS', key: 'flags', width: 20 }
        ], rows, empty: '   no contacts recorded'
      });
      if (isAdmin()) html += '<div class="toolbar"><button id="btnAdd">[ + ADD CONTACT ]</button><span class="dim">click a row to edit</span></div>';
      body.innerHTML = html;
      UI.onRows(body, (id) => {
        const c = rows.find((r) => String(r.id) === String(id));
        if (!c) return;
        const raw = (d.contacts || []).find((x) => String(x.id) === String(id));
        UI.modal({
          title: 'EDIT CONTACT',
          fields: [
            { name: 'first_name', label: 'First Name', value: raw.first_name, required: true },
            { name: 'last_name', label: 'Last Name', value: raw.last_name, required: true },
            { name: 'relationship', label: 'Relationship', value: raw.relationship },
            { name: 'home_phone', label: 'Home Phone', value: raw.home_phone },
            { name: 'cell_phone', label: 'Cell Phone', value: raw.cell_phone },
            { name: 'email', label: 'Email', value: raw.email },
            { name: 'is_custodial', label: 'Custodial', type: 'checkbox', value: raw.is_custodial },
            { name: 'is_emergency', label: 'Emergency', type: 'checkbox', value: raw.is_emergency }
          ],
          onDelete: async () => { await api.del('/api/students/' + d.student.id + '/contacts/' + id); UI.ok('Contact removed'); R.App.go('students/' + d.student.id + '/contacts'); },
          onSave: async (data) => { await api.put('/api/students/' + d.student.id + '/contacts/' + id, data); UI.ok('Contact saved'); R.App.go('students/' + d.student.id + '/contacts'); }
        });
      });
      if (isAdmin()) document.getElementById('btnAdd').onclick = () => UI.modal({
        title: 'ADD CONTACT',
        fields: [
          { name: 'first_name', label: 'First Name', required: true },
          { name: 'last_name', label: 'Last Name', required: true },
          { name: 'relationship', label: 'Relationship', type: 'select', options: ['Mother', 'Father', 'Guardian', 'Grandparent', 'Step-parent', 'Other'] },
          { name: 'home_phone', label: 'Home Phone' },
          { name: 'cell_phone', label: 'Cell Phone' },
          { name: 'email', label: 'Email' },
          { name: 'is_custodial', label: 'Custodial', type: 'checkbox', value: 1 },
          { name: 'is_emergency', label: 'Emergency', type: 'checkbox', value: 1 }
        ],
        onSave: async (data) => { await api.post('/api/students/' + d.student.id + '/contacts', data); UI.ok('Contact added'); R.App.go('students/' + d.student.id + '/contacts'); }
      });
    },

    /* ------------------------------------------------------------ medical */
    async tabMedical(body, d) {
      const m = d.medical || {};
      const lines = [
        ['Physician', m.physician], ['Physician Phone', m.physician_phone],
        ['Insurance', m.insurance], ['Policy #', m.policy_number],
        ['Allergies', m.allergies], ['Medications', m.medications],
        ['Immunizations', m.immunizations], ['Notes', m.notes],
        ['Last Updated', U.date(m.date_updated)]
      ];
      let html = '<pre class="ascii">' + U.esc(U.kvbox('MEDICAL / HEALTH RECORD', lines, 66)) + '</pre>';
      if (isAdmin()) html += '<div class="toolbar"><button id="btnEdit">[ EDIT MEDICAL RECORD ]</button></div>';
      body.innerHTML = html;
      if (isAdmin()) document.getElementById('btnEdit').onclick = () => UI.modal({
        title: 'MEDICAL RECORD',
        fields: [
          { name: 'physician', label: 'Physician', value: m.physician },
          { name: 'physician_phone', label: 'Phone', value: m.physician_phone },
          { name: 'insurance', label: 'Insurance', value: m.insurance },
          { name: 'policy_number', label: 'Policy #', value: m.policy_number },
          { name: 'allergies', label: 'Allergies', value: m.allergies },
          { name: 'medications', label: 'Medications', value: m.allergies ? m.medications : m.medications },
          { name: 'immunizations', label: 'Immunizations', value: m.immunizations },
          { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, value: m.notes }
        ],
        onSave: async (data) => { await api.put('/api/students/' + d.student.id + '/medical', data); UI.ok('Medical record saved'); R.App.go('students/' + d.student.id + '/medical'); }
      });
    },

    /* ------------------------------------------------------------ schedule */
    async tabSchedule(body, d) {
      const rows = (d.schedule || []).map((r) => ({
        id: r.schedule_id, per: r.period || '—', time: (r.start_time || '') + '-' + (r.end_time || ''),
        course: r.course_title, section: r.title, teacher: r.teacher || '—', room: r.room || '—'
      }));
      let html = U.table({
        title: 'SCHEDULE  (' + rows.length + ' courses)',
        columns: [
          { title: 'PER', key: 'per', width: 4, align: 'c' }, { title: 'TIME', key: 'time', width: 12 },
          { title: 'COURSE', key: 'course', max: 28 }, { title: 'SECTION', key: 'section', max: 22 },
          { title: 'TEACHER', key: 'teacher', max: 18 }, { title: 'ROOM', key: 'room', width: 6 }
        ], rows, empty: '   student is not scheduled into any section'
      });
      if (isStaff()) html += '<div class="toolbar"><button id="btnAdd">[ + ADD COURSE ]</button><span class="dim">click a row to remove</span></div>';
      body.innerHTML = html;

      if (isStaff()) {
        document.getElementById('btnAdd').onclick = async () => {
          const cps = await api.get('/api/course-periods');
          UI.modal({
            title: 'ADD COURSE TO SCHEDULE',
            fields: [{
              name: 'course_period_id', label: 'Section', type: 'select',
              options: cps.data.map((c) => ({ value: c.id, label: (c.period || '?') + '  ' + c.course_title + ' / ' + c.title + '  (' + (c.enrolled || 0) + '/' + c.total_seats + ')' }))
            }],
            onSave: async (data) => {
              await api.post('/api/students/' + d.student.id + '/schedule', data);
              UI.ok('Course added'); R.App.go('students/' + d.student.id + '/schedule');
            }
          });
        };
        UI.onRows(body, (id) => UI.confirm('Remove this course from the schedule?', async () => {
          await api.del('/api/schedule/' + id); UI.ok('Removed'); R.App.go('students/' + d.student.id + '/schedule');
        }));
      }
    },

    /* ------------------------------------------------------------ grades */
    async tabGrades(body, d) {
      const mps = R.state.markingPeriods.filter((m) => m.mp_type === 'quarter');
      body.innerHTML = UI.toolbar(
        '<label>MARKING PERIOD</label>' + UI.select('mp', mps.map((m) => ({ value: m.id, label: m.title })), R.state.markingPeriodId) +
        '<button id="go">[ GO ]</button>') + '<div id="g"></div>';
      const load = async () => {
        const mp = document.getElementById('mp').value;
        const r = await api.get('/api/students/' + d.student.id + '/grades?mp_id=' + mp);
        const rows = r.courses.map((c) => ({
          id: c.id, course: c.course_title || c.title, teacher: c.teacher || '—',
          letter: c.grade_letter || '—', pct: c.grade_percent === null ? '—' : U.pct(c.grade_percent),
          bar: U.bar(c.grade_percent || 0, 100, 12), cred: c.credit_attempted, gpt: U.n(c.weighted_gp).toFixed(2)
        }));
        let html = U.table({
          title: 'GRADES',
          columns: [
            { title: 'COURSE', key: 'course', max: 30 }, { title: 'TEACHER', key: 'teacher', max: 18 },
            { title: 'MARK', key: 'bar', width: 14 }, { title: '%', key: 'pct', width: 7, align: 'r' },
            { title: 'LETTER', key: 'letter', width: 7, align: 'c' },
            { title: 'CREDIT', key: 'cred', width: 7, align: 'r' }, { title: 'GP', key: 'gpt', width: 6, align: 'r' }
          ], rows, empty: '   no grades posted for this marking period'
        });
        html += '<pre class="ascii">' + U.esc(U.box('SUMMARY', [
          'Courses              : ' + rows.length,
          'Attempted credits    : ' + r.credits,
          'GPA (this period)    : ' + r.gpa.toFixed(2)
        ], 56)) + '</pre>';
        document.getElementById('g').innerHTML = html;
      };
      document.getElementById('go').onclick = load;
      document.getElementById('mp').onchange = load;
      load();
    },

    /* ------------------------------------------------------------ attendance */
    async tabAttendance(body, d) {
      const r = await api.get('/api/students/' + d.student.id + '/attendance');
      const sm = r.summary;
      let html = '<pre class="ascii">' + U.esc(U.box('ATTENDANCE SUMMARY', [
        'Present   : ' + String(sm.present).padStart(4) + '   ' + U.bar(sm.present, sm.total || 1, 24),
        'Absent    : ' + String(sm.absent).padStart(4) + '   ' + U.bar(sm.absent, sm.total || 1, 24),
        'Excused   : ' + String(sm.excused).padStart(4) + '   ' + U.bar(sm.excused, sm.total || 1, 24),
        'Tardy     : ' + String(sm.tardy).padStart(4) + '   ' + U.bar(sm.tardy, sm.total || 1, 24),
        '',
        'Total days: ' + sm.total + '     Attendance rate: ' + U.pct(sm.rate)
      ], 62)) + '</pre>';
      const rows = r.records.slice(0, 120).map((a) => ({
        id: a.id, date: U.date(a.school_date), code: a.code || '—', title: a.code_title || '—',
        present: a.minutes_present, absent: a.minutes_absent, comment: a.comment || ''
      }));
      html += U.table({
        title: 'ATTENDANCE RECORDS (most recent 120)',
        columns: [
          { title: 'DATE', key: 'date', width: 11 }, { title: 'CODE', key: 'code', width: 5, align: 'c' },
          { title: 'DESCRIPTION', key: 'title', width: 18 },
          { title: 'PRESENT MIN', key: 'present', width: 12, align: 'r' },
          { title: 'ABSENT MIN', key: 'absent', width: 11, align: 'r' },
          { title: 'COMMENT', key: 'comment', max: 26 }
        ], rows, empty: '   no attendance recorded'
      });
      body.innerHTML = html;
    },

    /* ------------------------------------------------------------ discipline */
    async tabDiscipline(body, d) {
      const r = await api.get('/api/students/' + d.student.id + '/discipline');
      const rows = r.data.map((x) => ({
        id: x.id, date: U.date(x.event_date), cat: x.category || '—', act: x.action || '—',
        title: x.title || '—', staff: x.staff || '—', pts: x.points,
        status: x.is_resolved ? 'RESOLVED' : 'OPEN'
      }));
      let html = U.table({
        title: 'DISCIPLINE REFERRALS',
        columns: [
          { title: 'DATE', key: 'date', width: 11 }, { title: 'CATEGORY', key: 'cat', width: 16 },
          { title: 'INCIDENT', key: 'title', max: 26 }, { title: 'ACTION', key: 'act', width: 20 },
          { title: 'BY', key: 'staff', max: 16 }, { title: 'PTS', key: 'pts', width: 4, align: 'r' },
          { title: 'STATUS', key: 'status', width: 9 }
        ], rows, empty: '   no discipline referrals - clean record'
      });
      if (isStaff()) html += '<div class="toolbar"><button id="btnAdd">[ + NEW REFERRAL ]</button><span class="dim">click a row to edit</span></div>';
      body.innerHTML = html;
      UI.onRows(body, (id) => R.Views.discipline.editReferral(id, d.student.id));
      if (isStaff()) document.getElementById('btnAdd').onclick = () => R.Views.discipline.editReferral(null, d.student.id);
    },

    /* ------------------------------------------------------------ fees */
    async tabFees(body, d) {
      const r = await api.get('/api/students/' + d.student.id + '/fees');
      const rows = r.data.map((f) => ({
        id: f.id, title: f.title, amount: U.money(f.amount), paid: U.money(f.paid || 0),
        balance: U.money((f.amount - (f.paid || 0))), due: U.date(f.due_date),
        status: (f.amount - (f.paid || 0)) > 0 ? 'OWING' : 'PAID'
      }));
      const charged = r.data.reduce((a, f) => a + f.amount, 0);
      const paid = r.data.reduce((a, f) => a + (f.paid || 0), 0);
      let html = '<pre class="ascii">' + U.esc(U.box('ACCOUNT SUMMARY', [
        'Charged   : ' + U.money(charged),
        'Paid      : ' + U.money(paid),
        'Balance   : ' + U.money(charged - paid)
      ], 44)) + '</pre>';
      html += U.table({
        title: 'FEES',
        columns: [
          { title: 'FEE', key: 'title', max: 26 }, { title: 'AMOUNT', key: 'amount', width: 11, align: 'r' },
          { title: 'PAID', key: 'paid', width: 11, align: 'r' }, { title: 'BALANCE', key: 'balance', width: 11, align: 'r' },
          { title: 'DUE DATE', key: 'due', width: 11 }, { title: 'STATUS', key: 'status', width: 8 }
        ], rows, empty: '   no fees on this account'
      });
      body.innerHTML = html;
    },

    /* ------------------------------------------------------------ notes */
    async tabNotes(body, d) {
      const rows = (d.notes || []).map((n) => ({
        id: n.id, date: U.date(n.note_date), cat: n.category || '—', title: n.title || '—',
        by: [n.staff_first_name, n.staff_last_name].filter(Boolean).join(' ') || '—',
        note: String(n.note || '').replace(/\s+/g, ' ').slice(0, 60)
      }));
      let html = U.table({
        title: 'NOTES',
        columns: [
          { title: 'DATE', key: 'date', width: 11 }, { title: 'CATEGORY', key: 'cat', width: 13 },
          { title: 'TITLE', key: 'title', max: 22 }, { title: 'BY', key: 'by', max: 16 },
          { title: 'NOTE', key: 'note', max: 44 }
        ], rows, empty: '   no notes recorded'
      });
      if (isStaff()) html += '<div class="toolbar"><button id="btnAdd">[ + ADD NOTE ]</button></div>';
      body.innerHTML = html;
      UI.onRows(body, (id) => {
        const n = (d.notes || []).find((x) => String(x.id) === String(id));
        if (n) UI.confirm('Delete this note?', async () => {
          await api.del('/api/students/' + d.student.id + '/notes/' + id); UI.ok('Note deleted'); R.App.go('students/' + d.student.id + '/notes');
        });
      });
      if (isStaff()) document.getElementById('btnAdd').onclick = () => UI.modal({
        title: 'ADD NOTE',
        fields: [
          { name: 'note_date', label: 'Date', type: 'date', value: new Date().toISOString().slice(0, 10) },
          { name: 'category', label: 'Category', type: 'select', options: ['General', 'Academic', 'Behaviour', 'Health', 'Counselling'] },
          { name: 'title', label: 'Title' },
          { name: 'note', label: 'Note', type: 'textarea', rows: 5, required: true }
        ],
        onSave: async (data) => { await api.post('/api/students/' + d.student.id + '/notes', data); UI.ok('Note added'); R.App.go('students/' + d.student.id + '/notes'); }
      });
    },

    /* ------------------------------------------------------------ edit + new */
    edit(s) {
      const isNew = !s;
      const d = s || {};
      UI.modal({
        title: isNew ? 'NEW STUDENT' : 'EDIT STUDENT  #' + d.student_id,
        fields: [
          { name: 'first_name', label: 'First Name', value: d.first_name, required: true },
          { name: 'middle_name', label: 'Middle Name', value: d.middle_name },
          { name: 'last_name', label: 'Last Name', value: d.last_name, required: true },
          { name: 'student_id', label: 'Student ID', value: d.student_id, placeholder: 'auto-generated' },
          { name: 'grade_level', label: 'Grade Level', type: 'select', value: d.grade_level, options: (R.state.gradeLevels || []).map((g) => ({ value: g.short_name || g.title, label: g.title })) },
          { name: 'gender', label: 'Gender', type: 'select', value: d.gender, options: ['', 'Male', 'Female', 'Other'] },
          { name: 'birthdate', label: 'Birthdate', type: 'date', value: d.birthdate },
          { name: 'email', label: 'Email', value: d.email },
          { name: 'phone', label: 'Phone', value: d.phone },
          { name: 'address', label: 'Address', value: d.address },
          { name: 'city', label: 'City', value: d.city },
          { name: 'state', label: 'State', value: d.state },
          { name: 'zip', label: 'ZIP', value: d.zip },
          { name: 'ethnicity', label: 'Ethnicity', value: d.ethnicity },
          { name: 'language', label: 'Language', value: d.language },
          { name: 'school_id', label: 'School', type: 'select', value: d.school_id || R.state.schoolId, options: R.state.schools.map((x) => ({ value: x.id, label: x.title })) },
          { name: 'is_active', label: 'Active', type: 'checkbox', value: d.is_active === undefined ? 1 : d.is_active }
        ],
        onSave: async (data) => {
          if (isNew) { const r = await api.post('/api/students', data); UI.ok('Student created'); R.App.go('students/' + r.student.id); }
          else { await api.put('/api/students/' + d.id, data); UI.ok('Student saved'); R.App.go('students/' + d.id); }
        }
      });
    }
  };

  R.Views.students = V;
})(window.RSIS);

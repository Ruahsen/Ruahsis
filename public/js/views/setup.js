/* =====================================================================
   views/setup.js -- school configuration (admin only)
   ===================================================================== */
(function (R) {
  'use strict';
  const U = R.U, UI = R.UI, api = R.api;

  R.Views = R.Views || {};

  const TABS = [
    { id: 'schools', label: 'SCHOOLS' },
    { id: 'years', label: 'SCHOOL YEARS' },
    { id: 'mps', label: 'MARKING PERIODS' },
    { id: 'periods', label: 'PERIODS' },
    { id: 'grades', label: 'GRADE LEVELS' },
    { id: 'scales', label: 'GRADE SCALES' },
    { id: 'subjects', label: 'SUBJECTS' },
    { id: 'codes', label: 'CODES' },
    { id: 'log', label: 'ACTIVITY LOG' }
  ];

  /** generic CRUD table + "add" button */
  async function crud(body, cfg) {
    body.innerHTML = '<pre class="ascii dim">loading…</pre>';
    const res = await api.get(cfg.path);
    const rows = (cfg.rows ? cfg.rows(res) : res.data).map((r) => cfg.map(r));
    let html = U.table({
      title: cfg.title,
      columns: cfg.columns, rows, empty: '   no records - use the button below to add one'
    });
    html += '<div class="toolbar"><button class="primary" id="btnAdd">[ + ADD ' + cfg.label.toUpperCase() + ' ]</button>' +
      '<span class="dim">click a row to edit</span></div>';
    body.innerHTML = html;
    document.getElementById('btnAdd').onclick = () => cfg.edit(null);
    UI.onRows(body, (id) => {
      const raw = res.data.find((x) => String(x.id) === String(id));
      if (raw) cfg.edit(raw);
    });
  }

  const schoolOpts = () => R.state.schools.map((s) => ({ value: s.id, label: s.title }));

  R.Views.setup = {
    id: 'setup', title: 'Setup', group: 'Setup',
    profiles: ['admin'],

    async render(root, params) {
      const tab = (params && params.tab) || 'schools';
      let html = UI.pageHead('SETUP', 'school configuration');
      html += '<pre class="ascii">' + U.esc(U.box('CURRENT CONTEXT', [
        'School        : ' + R.state.schoolName,
        'School Year   : ' + R.state.schoolYearTitle,
        'Marking Period: ' + ((R.state.markingPeriods.find((m) => m.id === R.state.markingPeriodId) || {}).title || '—')
      ], 60)) + '</pre>';
      html += UI.tabs(TABS, tab);
      html += '<div id="tabbody"></div>';
      root.innerHTML = html;
      UI.onTabs(root, (t) => R.App.go('setup/' + t));
      const body = document.getElementById('tabbody');
      const V = R.Views.setup;
      switch (tab) {
        case 'years': return V.years(body);
        case 'mps': return V.mps(body);
        case 'periods': return V.periods(body);
        case 'grades': return V.gradeLevels(body);
        case 'scales': return V.scales(body);
        case 'subjects': return V.subjects(body);
        case 'codes': return V.codes(body);
        case 'log': return V.log(body);
        default: return V.schools(body);
      }
    },

    schools(body) {
      return crud(body, {
        path: '/api/setup/schools', title: 'SCHOOLS', label: 'school',
        columns: [
          { title: 'TITLE', key: 'title', max: 26 }, { title: 'SHORT', key: 'short_name', width: 10 },
          { title: 'CITY', key: 'city', width: 14 }, { title: 'STATE', key: 'state', width: 6 },
          { title: 'PHONE', key: 'phone', width: 15 }, { title: 'PRINCIPAL', key: 'principal', max: 20 }
        ],
        map: (r) => ({ id: r.id, title: r.title, short_name: r.short_name || '—', city: r.city || '—', state: r.state || '—', phone: r.phone || '—', principal: r.principal || '—' }),
        edit: (d) => UI.modal({
          title: d ? 'SCHOOL  ' + d.title : 'NEW SCHOOL',
          fields: [
            { name: 'title', label: 'Title', value: d ? d.title : '', required: true },
            { name: 'short_name', label: 'Short Name', value: d ? d.short_name : '' },
            { name: 'address', label: 'Address', value: d ? d.address : '' },
            { name: 'city', label: 'City', value: d ? d.city : '' },
            { name: 'state', label: 'State', value: d ? d.state : '' },
            { name: 'zip', label: 'ZIP', value: d ? d.zip : '' },
            { name: 'phone', label: 'Phone', value: d ? d.phone : '' },
            { name: 'principal', label: 'Principal', value: d ? d.principal : '' },
            { name: 'website', label: 'Website', value: d ? d.website : '' }
          ],
          onDelete: d ? async () => { await api.del('/api/setup/schools/' + d.id); UI.ok('School deleted'); R.App.reload(); } : null,
          onSave: async (data) => {
            if (d) await api.put('/api/setup/schools/' + d.id, data); else await api.post('/api/setup/schools', data);
            UI.ok('School saved'); await R.App.refreshState(); R.App.reload();
          }
        })
      });
    },

    years(body) {
      return crud(body, {
        path: '/api/setup/school-years', title: 'SCHOOL YEARS', label: 'school year',
        columns: [
          { title: 'TITLE', key: 'title', width: 14 }, { title: 'SHORT', key: 'short_name', width: 8 },
          { title: 'START', key: 'start_date', width: 11 }, { title: 'END', key: 'end_date', width: 11 },
          { title: 'SCHOOL', key: 'school', max: 22 }, { title: 'CURRENT', key: 'current', width: 9 }
        ],
        map: (r) => ({
          id: r.id, title: r.title, short_name: r.short_name || '—', start_date: U.date(r.start_date),
          end_date: U.date(r.end_date),
          school: (R.state.schools.find((s) => s.id === r.school_id) || {}).title || '—',
          current: r.is_current ? '<< CURRENT' : ''
        }),
        edit: (d) => UI.modal({
          title: d ? 'SCHOOL YEAR  ' + d.title : 'NEW SCHOOL YEAR',
          fields: [
            { name: 'title', label: 'Title', value: d ? d.title : '', required: true },
            { name: 'short_name', label: 'Short Name', value: d ? d.short_name : '' },
            { name: 'school_id', label: 'School', type: 'select', value: d ? d.school_id : R.state.schoolId, options: schoolOpts() },
            { name: 'start_date', label: 'Start Date', type: 'date', value: d ? d.start_date : '', required: true },
            { name: 'end_date', label: 'End Date', type: 'date', value: d ? d.end_date : '', required: true },
            { name: 'sort_order', label: 'Sort Order', type: 'number', value: d ? d.sort_order : 1 }
          ],
          extra: d ? '<button id="btnAct">[ MAKE CURRENT ]</button>' : '',
          onDelete: d ? async () => { await api.del('/api/setup/school-years/' + d.id); UI.ok('Deleted'); R.App.reload(); } : null,
          onSave: async (data) => {
            if (d) await api.put('/api/setup/school-years/' + d.id, data); else await api.post('/api/setup/school-years', data);
            UI.ok('School year saved'); await R.App.refreshState(); R.App.reload();
          }
        })
      }).then(() => {
        const b = document.getElementById('btnAct');
        if (b) b.onclick = async () => {
          const sel = document.querySelector('#modal .trow') || null;
          UI.toast('Use the row action below to activate a year');
        };
      });
    },

    mps(body) {
      return crud(body, {
        path: '/api/setup/marking-periods', title: 'MARKING PERIODS', label: 'marking period',
        columns: [
          { title: 'TITLE', key: 'title', max: 24 }, { title: 'SHORT', key: 'short_name', width: 7 },
          { title: 'TYPE', key: 'mp_type', width: 9 }, { title: 'START', key: 'start_date', width: 11 },
          { title: 'END', key: 'end_date', width: 11 }, { title: 'PARENT', key: 'parent', width: 16 },
          { title: 'GRADES', key: 'does_grades', width: 7 }
        ],
        map: (r) => ({
          id: r.id, title: r.title, short_name: r.short_name || '—', mp_type: r.mp_type,
          start_date: U.date(r.start_date), end_date: U.date(r.end_date),
          parent: (R.state.markingPeriods.find((m) => m.id === r.parent_id) || {}).short_name || '—',
          does_grades: r.does_grades ? 'yes' : 'no'
        }),
        edit: (d) => UI.modal({
          title: d ? 'MARKING PERIOD  ' + d.title : 'NEW MARKING PERIOD',
          fields: [
            { name: 'title', label: 'Title', value: d ? d.title : '', required: true },
            { name: 'short_name', label: 'Short Name', value: d ? d.short_name : '' },
            { name: 'mp_type', label: 'Type', type: 'select', value: d ? d.mp_type : 'quarter', options: ['year', 'semester', 'quarter', 'progress'] },
            { name: 'parent_id', label: 'Parent', type: 'select', value: d ? d.parent_id : '', options: [{ value: '', label: '— none —' }].concat(R.state.markingPeriods.map((m) => ({ value: m.id, label: m.title }))) },
            { name: 'start_date', label: 'Start Date', type: 'date', value: d ? d.start_date : '' },
            { name: 'end_date', label: 'End Date', type: 'date', value: d ? d.end_date : '' },
            { name: 'sort_order', label: 'Sort Order', type: 'number', value: d ? d.sort_order : 1 },
            { name: 'does_grades', label: 'Grades', type: 'checkbox', value: d ? d.does_grades : 1 },
            { name: 'does_comments', label: 'Comments', type: 'checkbox', value: d ? d.does_comments : 1 }
          ],
          onDelete: d ? async () => { await api.del('/api/setup/marking-periods/' + d.id); UI.ok('Deleted'); R.App.reload(); } : null,
          onSave: async (data) => {
            data.school_id = R.state.schoolId;
            data.school_year_id = R.state.schoolYearId;
            if (d) await api.put('/api/setup/marking-periods/' + d.id, data); else await api.post('/api/setup/marking-periods', data);
            UI.ok('Marking period saved'); await R.App.refreshState(); R.App.reload();
          }
        })
      });
    },

    periods(body) {
      return crud(body, {
        path: '/api/setup/periods', title: 'BELL SCHEDULE PERIODS', label: 'period',
        columns: [
          { title: 'TITLE', key: 'title', max: 20 }, { title: 'SHORT', key: 'short_name', width: 7 },
          { title: 'START', key: 'start_time', width: 9 }, { title: 'END', key: 'end_time', width: 9 },
          { title: 'MINUTES', key: 'length_min', width: 8, align: 'r' }, { title: 'SORT', key: 'sort_order', width: 6, align: 'r' }
        ],
        map: (r) => ({ id: r.id, title: r.title, short_name: r.short_name || '—', start_time: r.start_time || '—', end_time: r.end_time || '—', length_min: r.length_min || '—', sort_order: r.sort_order }),
        edit: (d) => UI.modal({
          title: d ? 'PERIOD  ' + d.title : 'NEW PERIOD',
          fields: [
            { name: 'title', label: 'Title', value: d ? d.title : '', required: true },
            { name: 'short_name', label: 'Short Name', value: d ? d.short_name : '' },
            { name: 'start_time', label: 'Start', value: d ? d.start_time : '' },
            { name: 'end_time', label: 'End', value: d ? d.end_time : '' },
            { name: 'length_min', label: 'Minutes', type: 'number', value: d ? d.length_min : 50 },
            { name: 'sort_order', label: 'Sort Order', type: 'number', value: d ? d.sort_order : 1 }
          ],
          onDelete: d ? async () => { await api.del('/api/setup/periods/' + d.id); UI.ok('Deleted'); R.App.reload(); } : null,
          onSave: async (data) => {
            data.school_id = R.state.schoolId;
            if (d) await api.put('/api/setup/periods/' + d.id, data); else await api.post('/api/setup/periods', data);
            UI.ok('Period saved'); await R.App.refreshState(); R.App.reload();
          }
        })
      });
    },

    gradeLevels(body) {
      return crud(body, {
        path: '/api/setup/grade-levels', title: 'GRADE LEVELS', label: 'grade level',
        columns: [
          { title: 'TITLE', key: 'title', max: 20 }, { title: 'SHORT', key: 'short_name', width: 8 },
          { title: 'SORT', key: 'sort_order', width: 6, align: 'r' }, { title: 'NEXT GRADE', key: 'next', width: 14 }
        ],
        map: (r) => ({ id: r.id, title: r.title, short_name: r.short_name || '—', sort_order: r.sort_order, next: (R.state.gradeLevelsRaw || []).find((g) => g.id === r.next_grade_id) ? ((R.state.gradeLevelsRaw || []).find((g) => g.id === r.next_grade_id).title) : '—' }),
        edit: (d) => UI.modal({
          title: d ? 'GRADE LEVEL  ' + d.title : 'NEW GRADE LEVEL',
          fields: [
            { name: 'title', label: 'Title', value: d ? d.title : '', required: true },
            { name: 'short_name', label: 'Short Name', value: d ? d.short_name : '' },
            { name: 'sort_order', label: 'Sort Order', type: 'number', value: d ? d.sort_order : 1 },
            { name: 'next_grade_id', label: 'Next Grade', type: 'select', value: d ? d.next_grade_id : '', options: [{ value: '', label: '— none —' }].concat((R.state.gradeLevelsRaw || []).map((g) => ({ value: g.id, label: g.title }))) }
          ],
          onDelete: d ? async () => { await api.del('/api/setup/grade-levels/' + d.id); UI.ok('Deleted'); R.App.reload(); } : null,
          onSave: async (data) => {
            data.school_id = R.state.schoolId;
            if (d) await api.put('/api/setup/grade-levels/' + d.id, data); else await api.post('/api/setup/grade-levels', data);
            UI.ok('Grade level saved'); await R.App.refreshState(); R.App.reload();
          }
        })
      });
    },

    async scales(body) {
      body.innerHTML = '<pre class="ascii dim">loading…</pre>';
      const res = await api.get('/api/setup/grade-scales');
      let html = '';
      res.data.forEach((s) => {
        const lines = (s.breakdowns || []).map((b) =>
          U.pad(b.title, 5) + ' │' + U.bar(b.breakoff, 100, 34) + '│ ' + String(b.breakoff).padStart(3) + '%   GPA ' + U.n(b.gpa_value).toFixed(2));
        html += '<pre class="ascii">' + U.esc(U.box('GRADE SCALE  ' + s.title + '   (honor roll GPA ' + U.n(s.hr_gpa).toFixed(2) + ')', lines, 62)) + '</pre>';
      });
      html += '<div class="toolbar"><button class="primary" id="btnAdd">[ + NEW GRADE SCALE ]</button>' +
        '<span class="dim">scales control the letter/GPA conversion used by the gradebook</span></div>';
      body.innerHTML = html;
      document.getElementById('btnAdd').onclick = () => UI.modal({
        title: 'NEW GRADE SCALE',
        fields: [
          { name: 'title', label: 'Title', required: true },
          { name: 'hr_gpa', label: 'Honor Roll GPA', type: 'number', value: 3.0 },
          { name: 'sort_order', label: 'Sort Order', type: 'number', value: 1 },
          { name: 'breakdowns', label: 'Breakdown', type: 'textarea', rows: 10, value: 'A,93,4.0\nA-,90,3.67\nB+,87,3.33\nB,83,3.0\nB-,80,2.67\nC+,77,2.33\nC,73,2.0\nC-,70,1.67\nD,63,1.0\nF,0,0' }
        ],
        onSave: async (data) => {
          const breakdowns = String(data.breakdowns).split('\n').map((l) => l.split(',')).filter((p) => p.length >= 3)
            .map((p, i) => ({ title: p[0].trim(), breakoff: Number(p[1]), gpa_value: Number(p[2]), sort_order: i + 1 }));
          await api.post('/api/setup/grade-scales', { title: data.title, hr_gpa: data.hr_gpa, sort_order: data.sort_order, school_id: R.state.schoolId, breakdowns });
          UI.ok('Grade scale created'); R.App.reload();
        }
      });
    },

    subjects(body) {
      return crud(body, {
        path: '/api/setup/subjects', title: 'COURSE SUBJECTS', label: 'subject',
        columns: [
          { title: 'TITLE', key: 'title', max: 24 }, { title: 'SHORT', key: 'short_name', width: 10 },
          { title: 'SORT', key: 'sort_order', width: 6, align: 'r' }
        ],
        map: (r) => ({ id: r.id, title: r.title, short_name: r.short_name || '—', sort_order: r.sort_order }),
        edit: (d) => UI.modal({
          title: d ? 'SUBJECT  ' + d.title : 'NEW SUBJECT',
          fields: [
            { name: 'title', label: 'Title', value: d ? d.title : '', required: true },
            { name: 'short_name', label: 'Short Name', value: d ? d.short_name : '' },
            { name: 'sort_order', label: 'Sort Order', type: 'number', value: d ? d.sort_order : 1 }
          ],
          onDelete: d ? async () => { await api.del('/api/setup/subjects/' + d.id); UI.ok('Deleted'); R.App.reload(); } : null,
          onSave: async (data) => {
            data.school_id = R.state.schoolId;
            if (d) await api.put('/api/setup/subjects/' + d.id, data); else await api.post('/api/setup/subjects', data);
            UI.ok('Subject saved'); await R.App.refreshState(); R.App.reload();
          }
        })
      });
    },

    async codes(body) {
      body.innerHTML = '<pre class="ascii dim">loading…</pre>';
      const [att, enr, cat, act] = await Promise.all([
        api.get('/api/setup/attendance-codes'),
        api.get('/api/setup/enrollment-codes'),
        api.get('/api/setup/discipline-categories'),
        api.get('/api/setup/discipline-actions')
      ]);
      let html = U.table({
        title: 'ATTENDANCE CODES',
        columns: [
          { title: 'TITLE', key: 'title', max: 22 }, { title: 'SHORT', key: 'short_name', width: 7 },
          { title: 'TYPE', key: 'type', width: 10 }, { title: 'STATE CODE', key: 'state_code', width: 11 },
          { title: 'DEFAULT', key: 'def', width: 8 }, { title: 'SORT', key: 'sort_order', width: 5, align: 'r' }
        ],
        rows: att.data.map((c) => ({ id: c.id, title: c.title, short_name: c.short_name, type: c.type, state_code: c.state_code || '—', def: c.is_default ? 'YES' : '', sort_order: c.sort_order })),
        empty: '   none'
      });
      html += U.table({
        title: 'ENROLMENT / DROP CODES',
        columns: [
          { title: 'TITLE', key: 'title', max: 22 }, { title: 'SHORT', key: 'short_name', width: 8 },
          { title: 'TYPE', key: 'type', width: 10 }, { title: 'SORT', key: 'sort_order', width: 5, align: 'r' }
        ],
        rows: enr.data.map((c) => ({ id: c.id, title: c.title, short_name: c.short_name || '—', type: c.type, sort_order: c.sort_order })),
        empty: '   none'
      });
      const two = U.row([
        U.box('DISCIPLINE CATEGORIES', cat.data.map((c) => U.pad(c.short_name || '—', 8) + c.title), 44),
        U.box('DISCIPLINE ACTIONS', act.data.map((c) => U.pad(c.short_name || '—', 8) + c.title), 44)
      ]);
      html += '<pre class="ascii">' + U.esc(two) + '</pre>';
      html += '<div class="toolbar">' +
        '<button id="addAtt">[ + ATTENDANCE CODE ]</button>' +
        '<button id="addEnr">[ + ENROLMENT CODE ]</button>' +
        '<button id="addCat">[ + CATEGORY ]</button>' +
        '<button id="addAct">[ + ACTION ]</button></div>';
      body.innerHTML = html;
      const add = (title, path, extraFields) => UI.modal({
        title: title,
        fields: [
          { name: 'title', label: 'Title', required: true },
          { name: 'short_name', label: 'Short Name', required: true },
          { name: 'type', label: 'Type', type: 'select', options: extraFields }
        ],
        onSave: async (data) => { await api.post(path, Object.assign({ school_id: R.state.schoolId }, data)); UI.ok('Added'); R.App.reload(); }
      });
      document.getElementById('addAtt').onclick = () => add('NEW ATTENDANCE CODE', '/api/setup/attendance-codes', ['present', 'absent', 'excused', 'late', 'official']);
      document.getElementById('addEnr').onclick = () => add('NEW ENROLMENT CODE', '/api/setup/enrollment-codes', ['add', 'drop', 'roll']);
      document.getElementById('addCat').onclick = () => add('NEW CATEGORY', '/api/setup/discipline-categories', ['general']);
      document.getElementById('addAct').onclick = () => add('NEW ACTION', '/api/setup/discipline-actions', ['general']);
    },

    async log(body) {
      body.innerHTML = '<pre class="ascii dim">loading…</pre>';
      const res = await api.get('/api/setup/activity-log?limit=200');
      const rows = res.data.map((l) => ({
        id: l.id, when: U.datetime(l.created_at), who: l.username || '—', action: (l.action || '').toUpperCase(), detail: l.detail || ''
      }));
      body.innerHTML = U.table({
        title: 'ACTIVITY LOG',
        columns: [
          { title: 'WHEN', key: 'when', width: 17 }, { title: 'USER', key: 'who', max: 18 },
          { title: 'ACTION', key: 'action', width: 10 }, { title: 'DETAIL', key: 'detail', max: 46 }
        ], rows, empty: '   no activity recorded'
      });
    }
  };
})(window.RSIS);

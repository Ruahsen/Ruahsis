/* =====================================================================
   views/staff.js -- Users / Staff
   ===================================================================== */
(function (R) {
  'use strict';
  const U = R.U, UI = R.UI, api = R.api;

  R.Views = R.Views || {};
  const isAdmin = () => R.App.user && R.App.user.profile === 'admin';
  const PROFILES = ['admin', 'teacher', 'parent', 'student', 'none'];

  const V = {
    id: 'staff', title: 'Users', group: 'Users',
    profiles: ['admin', 'teacher'],

    async render(root, params) {
      if (params && params.id) return V.detail(root, params.id);
      return V.list(root);
    },

    async list(root) {
      let html = UI.pageHead('USERS', 'staff, teachers, parents & portal accounts');
      if (isAdmin()) html += UI.toolbar('<button class="primary" id="btnNew">[ + NEW USER ]</button>');
      html += UI.toolbar(
        '<label>SEARCH</label><input type="text" id="q" size="22" placeholder="name / username / email">' +
        '<label>PROFILE</label>' + UI.select('fProfile', PROFILES, '', 'all') +
        '<label>WITH LOGIN</label>' + UI.select('fLogin', [{ value: '1', label: 'Yes' }], '', 'any') +
        '<button id="btnGo">[ SEARCH ]</button><span class="spacer"></span><span class="dim" id="cnt"></span>');
      html += '<div id="list"></div>';
      root.innerHTML = html;

      const load = async () => {
        const box = document.getElementById('list');
        box.innerHTML = '<pre class="ascii dim">loading…</pre>';
        try {
          const qs = api.qs({
            search: document.getElementById('q').value, limit: 500, has_login: document.getElementById('fLogin').value,
            filter: { profile: document.getElementById('fProfile').value }
          });
          const res = await api.get('/api/staff' + qs);
          document.getElementById('cnt').textContent = res.total + ' record(s)';
          const rows = res.data.map((s) => ({
            id: s.id, username: s.username || '—', name: (s.title ? s.title + ' ' : '') + U.name(s),
            profile: String(s.profile || '').toUpperCase(), email: s.email || '—',
            phone: s.phone || s.cell_phone || s.home_phone || '—',
            cps: s.course_periods, kids: s.linked_students,
            status: s.is_active ? 'ACTIVE' : 'INACTIVE', last: s.last_login ? U.date(s.last_login) : 'never'
          }));
          box.innerHTML = U.table({
            title: 'USERS',
            columns: [
              { title: 'USERNAME', key: 'username', max: 18 }, { title: 'NAME', key: 'name', max: 24 },
              { title: 'PROFILE', key: 'profile', width: 9 }, { title: 'EMAIL', key: 'email', max: 26 },
              { title: 'PHONE', key: 'phone', width: 14 },
              { title: 'SEC', key: 'cps', width: 4, align: 'r' }, { title: 'KIDS', key: 'kids', width: 5, align: 'r' },
              { title: 'LAST LOGIN', key: 'last', width: 11 }, { title: 'STATUS', key: 'status', width: 9 }
            ], rows, empty: '   no users found'
          });
          UI.onRows(box, (id) => R.App.go('staff/' + id));
        } catch (e) { box.innerHTML = UI.empty(e.message); }
      };
      document.getElementById('btnGo').onclick = load;
      document.getElementById('q').onkeydown = (e) => { if (e.key === 'Enter') load(); };
      ['fProfile', 'fLogin'].forEach((i) => document.getElementById(i).onchange = load);
      if (document.getElementById('btnNew')) document.getElementById('btnNew').onclick = () => V.edit(null);
      load();
    },

    async detail(root, id) {
      const r = await api.get('/api/staff/' + id);
      const s = r.staff;
      let html = UI.pageHead(U.name(s).toUpperCase(), (s.profile || '').toUpperCase() + (s.username ? '  @' + s.username : ''),
        '<button onclick="RSIS.App.go(\'staff\')">[ < BACK ]</button>');

      html += '<pre class="ascii">' + U.esc(U.kvbox('USER INFO', [
        ['Username', s.username || '(no portal login)'],
        ['Name', (s.title || '') + ' ' + U.name(s)],
        ['Profile', (s.profile || '').toUpperCase()],
        ['Email', s.email], ['Phone', s.phone], ['Home', s.home_phone], ['Cell', s.cell_phone],
        ['Address', [s.address, s.city, s.state, s.zip].filter(Boolean).join(', ')],
        ['Status', s.is_active ? 'ACTIVE' : 'INACTIVE'],
        ['Last Login', s.last_login ? U.date(s.last_login) : 'never']
      ], 62)) + '</pre>';

      if (r.schedule.length) {
        html += U.table({
          title: 'TEACHING SCHEDULE',
          columns: [
            { title: 'PER', key: 'period', width: 4, align: 'c' }, { title: 'TIME', key: 'time', width: 12 },
            { title: 'COURSE', key: 'course_title', max: 26 }, { title: 'SECTION', key: 'title', max: 18 },
            { title: 'ROOM', key: 'room', width: 6 }, { title: 'STUDENTS', key: 'students', width: 9, align: 'r' }
          ],
          rows: r.schedule.map((c) => ({ id: c.id, period: c.period || '—', time: (c.start_time || '') + '-' + (c.end_time || ''), course_title: c.course_title, title: c.title, room: c.room || '—', students: c.students })),
          empty: '   no sections'
        });
      }
      if (r.children.length) {
        html += U.table({
          title: 'LINKED STUDENTS',
          columns: [
            { title: 'STUDENT ID', key: 'sid', width: 11 }, { title: 'NAME', key: 'name', max: 24 },
            { title: 'GRADE', key: 'grade_level', width: 6 }, { title: 'RELATIONSHIP', key: 'relationship', width: 14 }
          ],
          rows: r.children.map((c) => ({ id: c.student_id, sid: c.student_id_alias || c.sid, name: U.name(c), grade_level: c.grade_level, relationship: c.relationship })),
          empty: '   none'
        });
      }

      if (isAdmin() || (R.App.user && R.App.user.id === s.id)) {
        html += '<div class="toolbar">' +
          (isAdmin() ? '<button id="btnEdit">[ EDIT USER ]</button>' : '') +
          '<button id="btnPass">[ CHANGE PASSWORD ]</button>' +
          (isAdmin() && R.App.user.id !== s.id ? '<button class="danger" id="btnDel">[ DELETE ]</button>' : '') +
          '</div>';
      }
      root.innerHTML = html;
      const bind = (i, fn) => { const e = document.getElementById(i); if (e) e.onclick = fn; };
      bind('btnEdit', () => V.edit(s));
      bind('btnPass', () => V.password(s));
      bind('btnDel', () => UI.confirm('Delete user ' + U.name(s) + '?', async () => {
        await api.del('/api/staff/' + s.id); UI.ok('User deleted'); R.App.go('staff');
      }));
    },

    edit(s) {
      const isNew = !s;
      const d = s || {};
      UI.modal({
        title: isNew ? 'NEW USER' : 'EDIT USER  @' + (d.username || '—'),
        fields: [
          { name: 'first_name', label: 'First Name', value: d.first_name, required: true },
          { name: 'middle_name', label: 'Middle Name', value: d.middle_name },
          { name: 'last_name', label: 'Last Name', value: d.last_name, required: true },
          { name: 'title', label: 'Title', type: 'select', value: d.title, options: ['', 'Mr.', 'Ms.', 'Mrs.', 'Dr.'] },
          { name: 'profile', label: 'Profile', type: 'select', value: d.profile || 'teacher', options: PROFILES, required: true },
          { name: 'username', label: 'Username', value: d.username, placeholder: 'leave blank = no login' },
          { name: 'password', label: 'Password', type: 'password', placeholder: isNew ? 'required with username' : 'leave blank to keep' },
          { name: 'email', label: 'Email', value: d.email },
          { name: 'phone', label: 'Phone', value: d.phone },
          { name: 'cell_phone', label: 'Cell', value: d.cell_phone },
          { name: 'home_phone', label: 'Home', value: d.home_phone },
          { name: 'address', label: 'Address', value: d.address },
          { name: 'city', label: 'City', value: d.city },
          { name: 'state', label: 'State', value: d.state },
          { name: 'zip', label: 'ZIP', value: d.zip },
          { name: 'school_id', label: 'School', type: 'select', value: d.school_id || R.state.schoolId, options: R.state.schools.map((x) => ({ value: x.id, label: x.title })) },
          { name: 'is_active', label: 'Active', type: 'checkbox', value: d.is_active === undefined ? 1 : d.is_active }
        ],
        onSave: async (data) => {
          if (isNew) { const r = await api.post('/api/staff', data); UI.ok('User created'); R.App.go('staff/' + r.staff.id); }
          else { await api.put('/api/staff/' + d.id, data); UI.ok('User saved'); R.App.go('staff/' + d.id); }
        }
      });
    },

    password(s) {
      UI.modal({
        title: 'CHANGE PASSWORD  @' + (s.username || '—'),
        fields: [
          { name: 'current', label: 'Current Password', type: 'password', placeholder: 'required when changing own' },
          { name: 'password', label: 'New Password', type: 'password', required: true }
        ],
        onSave: async (data) => { await api.post('/api/staff/' + s.id + '/password', data); UI.ok('Password updated'); }
      });
    }
  };

  R.Views.staff = V;
})(window.RSIS);

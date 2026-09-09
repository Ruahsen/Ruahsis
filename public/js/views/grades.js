/* =====================================================================
   views/grades.js -- gradebook, assignments, GPA, honor roll
   ===================================================================== */
(function (R) {
  'use strict';
  const U = R.U, UI = R.UI, api = R.api;

  R.Views = R.Views || {};
  const isStaff = () => R.App.user && (R.App.user.profile === 'admin' || R.App.user.profile === 'teacher');

  /* =================================================== GRADEBOOK ======= */
  R.Views.gradebook = {
    id: 'gradebook', title: 'Gradebook', group: 'Grades', hidden: true,
    profiles: ['admin', 'teacher'],

    async render(root, params, query) {
      const cpId = (params && params.id) || (query && query.cp);
      if (!cpId) return V_gradesIndex(root);

      root.innerHTML = '<pre class="ascii dim">loading gradebook…</pre>';
      const d = await api.get('/api/grades/gradebook?course_period_id=' + cpId);
      const cp = d.coursePeriod;
      const assignments = d.assignments;

      let html = UI.pageHead('GRADEBOOK', cp.title + '  ::  ' + (cp.teacher || '') + '  ::  room ' + (cp.room || '—'),
        '<button onclick="RSIS.App.go(\'grades\')">[ < GRADES MENU ]</button>');

      html += '<pre class="ascii">' + U.esc(U.kvbox('SECTION', [
        ['Course', cp.course_title], ['Section', cp.title], ['Teacher', cp.teacher],
        ['Period', cp.period_title], ['Room', cp.room], ['Enrolled', d.rows.length],
        ['Assignments', assignments.length]
      ], 56)) + '</pre>';

      if (!assignments.length) {
        html += UI.empty('No assignments yet. Use "[ + NEW ASSIGNMENT ]" to create one.');
      } else {
        // ---- editable grid
        const cols = [{ title: 'STUDENT', key: 'name', align: '' }]
          .concat(assignments.map((a) => ({ title: a.title + ' (' + a.points + ')', key: 'a' + a.id, align: 'r' })))
          .concat([{ title: '%', key: 'pct', align: 'r' }, { title: 'LTR', key: 'letter', align: 'c' }]);

        const rows = d.rows.map((r) => {
          const o = { id: r.student.id, name: U.name(r.student), pct: r.percent === null ? '—' : U.pct(r.percent), letter: r.letter || '—' };
          assignments.forEach((a) => {
            const sc = r.scores[a.id] || {};
            o['a' + a.id] = '<input type="text" size="5" class="score" data-a="' + a.id + '" data-s="' + r.student.id +
              '" value="' + (sc.points === null || sc.points === undefined ? '' : sc.points) + '">';
          });
          return o;
        });

        html += '<div class="scroll-x"><table class="grid"><thead><tr>' +
          cols.map((c) => '<th' + (c.align === 'r' ? ' class="num"' : '') + '>' + U.esc(c.title) + '</th>').join('') +
          '</tr></thead><tbody>' +
          rows.map((r) => '<tr><td class="nowrap">' + U.esc(r.name) + '</td>' +
            assignments.map((a) => '<td class="num">' + r['a' + a.id] + '</td>').join('') +
            '<td class="num">' + r.pct + '</td><td>' + U.esc(r.letter) + '</td></tr>').join('') +
          '</tbody></table></div>';

        html += '<div class="toolbar">' +
          (isStaff() ? '<button class="primary" id="btnSave">[ SAVE SCORES ]</button>' : '') +
          (isStaff() ? '<button id="btnNew">[ + NEW ASSIGNMENT ]</button>' : '') +
          (isStaff() ? '<button id="btnRecalc">[ RE-CALCULATE REPORT CARD ]</button>' : '') +
          '<button id="btnCsv">[ EXPORT CSV ]</button>' +
          '<span class="dim">blank = not graded</span></div>';
      }
      if (isStaff()) html += '<div class="toolbar"><button id="btnNew2">[ + NEW ASSIGNMENT ]</button></div>';

      // ---- assignments list
      if (assignments.length) {
        html += U.table({
          title: 'ASSIGNMENTS',
          columns: [
            { title: 'TITLE', key: 'title', max: 28 }, { title: 'TYPE', key: 'type', width: 12 },
            { title: 'ASSIGNED', key: 'assigned', width: 11 }, { title: 'DUE', key: 'due', width: 11 },
            { title: 'POINTS', key: 'points', width: 7, align: 'r' }, { title: 'WEIGHT', key: 'weight', width: 7, align: 'r' },
            { title: 'SCORED', key: 'scored', width: 12, align: 'r' }
          ],
          rows: assignments.map((a) => ({
            id: a.id, title: a.title, type: a.type_title || '—', assigned: U.date(a.assigned_date),
            due: U.date(a.due_date), points: a.points, weight: a.weight, scored: a.scored + '/' + a.total
          })),
          empty: '   none'
        });
        html += '<div class="toolbar dim">click an assignment row to edit or delete it</div>';
      }

      root.innerHTML = html;

      // ---- bindings
      const saveScores = async () => {
        const grades = [];
        root.querySelectorAll('input.score').forEach((i) => {
          grades.push({ assignment_id: Number(i.dataset.a), student_id: Number(i.dataset.s), points: i.value === '' ? null : Number(i.value) });
        });
        try {
          const r = await api.post('/api/grades/gradebook', { grades });
          UI.ok(r.message || 'Scores saved');
          R.App.reload();
        } catch (e) { UI.err(e.message); }
      };
      const newAssignment = () => UI.modal({
        title: 'NEW ASSIGNMENT',
        fields: [
          { name: 'title', label: 'Title', required: true },
          { name: 'assignment_type_id', label: 'Type', type: 'select', options: (d.types || []).map((t) => ({ value: t.id, label: t.title })) },
          { name: 'mp_id', label: 'Marking Period', type: 'select', value: R.state.markingPeriodId, options: R.state.markingPeriods.filter((m) => m.mp_type === 'quarter').map((m) => ({ value: m.id, label: m.title })) },
          { name: 'points', label: 'Points', type: 'number', value: 100 },
          { name: 'weight', label: 'Weight', type: 'number', value: 1 },
          { name: 'assigned_date', label: 'Assigned', type: 'date', value: new Date().toISOString().slice(0, 10) },
          { name: 'due_date', label: 'Due', type: 'date', value: new Date().toISOString().slice(0, 10) },
          { name: 'description', label: 'Description', type: 'textarea', rows: 3 }
        ],
        onSave: async (data) => {
          await api.post('/api/grades/assignments', Object.assign({ course_period_id: cpId }, data));
          UI.ok('Assignment created'); R.App.reload();
        }
      });

      const bind = (i, fn) => { const e = document.getElementById(i); if (e) e.onclick = fn; };
      bind('btnSave', saveScores);
      bind('btnNew', newAssignment);
      bind('btnNew2', newAssignment);
      bind('btnRecalc', async () => {
        try { const r = await api.post('/api/grades/recalculate', { course_period_id: cpId }); UI.ok(r.message); R.App.reload(); }
        catch (e) { UI.err(e.message); }
      });
      bind('btnCsv', () => {
        const lines = ['student,' + assignments.map((a) => '"' + a.title.replace(/"/g, '""') + '"').join(',') + ',percent,letter'];
        d.rows.forEach((r) => {
          lines.push('"' + U.name(r.student) + '",' + assignments.map((a) => {
            const sc = r.scores[a.id] || {};
            return sc.points === null || sc.points === undefined ? '' : sc.points;
          }).join(',') + ',' + (r.percent === null ? '' : r.percent) + ',' + (r.letter || ''));
        });
        U.download('gradebook-' + cpId + '.csv', lines.join('\n'), 'text/csv');
      });

      // assignment row clicks
      const tbl = root.querySelectorAll('pre.ascii[data-table]');
      if (tbl.length) UI.onRows(tbl[tbl.length - 1], (id) => {
        const a = assignments.find((x) => String(x.id) === String(id));
        if (!a) return;
        UI.modal({
          title: 'ASSIGNMENT  ' + a.title,
          fields: [
            { name: 'title', label: 'Title', value: a.title, required: true },
            { name: 'points', label: 'Points', type: 'number', value: a.points },
            { name: 'weight', label: 'Weight', type: 'number', value: a.weight },
            { name: 'assigned_date', label: 'Assigned', type: 'date', value: a.assigned_date },
            { name: 'due_date', label: 'Due', type: 'date', value: a.due_date },
            { name: 'is_ec', label: 'Extra Credit', type: 'checkbox', value: a.is_ec },
            { name: 'description', label: 'Description', type: 'textarea', rows: 3, value: a.description }
          ],
          onDelete: async () => { await api.del('/api/grades/assignments/' + a.id); UI.ok('Assignment deleted'); R.App.reload(); },
          onSave: async (data) => { await api.put('/api/grades/assignments/' + a.id, data); UI.ok('Saved'); R.App.reload(); }
        });
      });
    }
  };

  /* =================================================== GRADES MENU ===== */
  function V_gradesIndex(root) {
    let html = UI.pageHead('GRADES', 'gradebook, GPA, honor roll');
    html += UI.toolbar('<label>SECTION</label><select id="cp"></select><button id="go">[ OPEN GRADEBOOK ]</button>');
    html += '<div id="gp"></div>';
    root.innerHTML = html;
    api.get('/api/course-periods').then((r) => {
      document.getElementById('cp').innerHTML = r.data.map((c) =>
        '<option value="' + c.id + '">' + U.esc((c.period || '?') + '  ' + c.course_title + ' / ' + c.title + '  (' + (c.enrolled || 0) + ')') + '</option>').join('');
    });
    document.getElementById('go').onclick = () => R.App.go('gradebook/' + document.getElementById('cp').value);
    return html;
  }

  R.Views.grades = {
    id: 'grades', title: 'Grades', group: 'Grades',
    profiles: ['admin', 'teacher', 'parent', 'student'],

    async render(root, params, query) {
      const me = R.App.user;
      let html = UI.pageHead('GRADES', 'gpa, honor roll & report cards');

      if (isStaff()) {
        html += UI.toolbar('<label>SECTION</label><select id="cp"></select><button id="go">[ OPEN GRADEBOOK ]</button>');
      }

      html += UI.toolbar(
        '<label>MARKING PERIOD</label>' + UI.select('mp', R.state.markingPeriods.filter((m) => m.mp_type === 'quarter').map((m) => ({ value: m.id, label: m.title })), R.state.markingPeriodId) +
        '<button id="btnGpa">[ CLASS GPA RANKING ]</button>' +
        '<button id="btnHonor">[ HONOR ROLL ]</button>' +
        '<button id="btnDist">[ GRADE DISTRIBUTION ]</button>');
      html += '<div id="out"></div>';
      root.innerHTML = html;

      if (isStaff()) {
        const r = await api.get('/api/course-periods');
        document.getElementById('cp').innerHTML = r.data.map((c) =>
          '<option value="' + c.id + '">' + U.esc((c.period || '?') + '  ' + c.course_title + ' / ' + c.title) + '</option>').join('');
        document.getElementById('go').onclick = () => R.App.go('gradebook/' + document.getElementById('cp').value);
      }

      const out = document.getElementById('out');
      const showGpa = async () => {
        out.innerHTML = '<pre class="ascii dim">loading…</pre>';
        const r = await api.get('/api/grades/gpa');
        const rows = r.data.slice(0, 200).map((x, i) => ({
          id: x.studentId, rank: x.rank, sid: x.student_id || '—', name: U.name(x) || '—',
          gr: x.grade_level || '—', gpa: x.gpa.toFixed(3), bar: U.bar(x.gpa, 4.33, 24), cred: U.n(x.credits).toFixed(1)
        }));
        out.innerHTML = U.table({
          title: 'GPA RANKING',
          columns: [
            { title: 'RANK', key: 'rank', width: 6, align: 'r' }, { title: 'STUDENT ID', key: 'sid', width: 11 },
            { title: 'NAME', key: 'name', max: 24 }, { title: 'GR', key: 'gr', width: 4, align: 'c' },
            { title: 'GPA SCALE', key: 'bar', width: 26 }, { title: 'GPA', key: 'gpa', width: 7, align: 'r' },
            { title: 'CREDITS', key: 'cred', width: 8, align: 'r' }
          ], rows, empty: '   no grades posted yet'
        });
        UI.onRows(out, (id) => R.App.go('students/' + id));
      };
      const showHonor = async () => {
        out.innerHTML = '<pre class="ascii dim">loading…</pre>';
        const r = await api.get('/api/grades/honor-roll');
        const rows = r.data.map((x, i) => ({
          id: x.student_id, rank: i + 1, sid: x.sid, name: x.first_name + ' ' + x.last_name,
          gr: x.grade_level, gpa: U.n(x.gpa).toFixed(3), bar: U.bar(x.gpa, 4.33, 26)
        }));
        out.innerHTML = U.table({
          title: 'HONOR ROLL  (GPA >= 3.00)',
          columns: [
            { title: '#', key: 'rank', width: 5, align: 'r' }, { title: 'STUDENT ID', key: 'sid', width: 11 },
            { title: 'NAME', key: 'name', max: 26 }, { title: 'GR', key: 'gr', width: 4, align: 'c' },
            { title: 'GPA SCALE', key: 'bar', width: 28 }, { title: 'GPA', key: 'gpa', width: 7, align: 'r' }
          ], rows, empty: '   no students currently qualify'
        });
        UI.onRows(out, (id) => R.App.go('students/' + id));
      };
      const showDist = async () => {
        out.innerHTML = '<pre class="ascii dim">loading…</pre>';
        const r = await api.get('/api/reports/grade-distribution?mp_id=' + document.getElementById('mp').value);
        out.innerHTML = UI.chart((r.rows || []).map((x) => ({ label: x.label || '—', n: x.n, extra: 'avg ' + U.pct(x.avg_pct) })));
      };

      document.getElementById('btnGpa').onclick = showGpa;
      document.getElementById('btnHonor').onclick = showHonor;
      document.getElementById('btnDist').onclick = showDist;
      showGpa();
    }
  };
})(window.RSIS);

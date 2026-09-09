/* =====================================================================
   views/discipline.js -- referrals, categories, actions
   ===================================================================== */
(function (R) {
  'use strict';
  const U = R.U, UI = R.UI, api = R.api;

  R.Views = R.Views || {};
  const isStaff = () => R.App.user && (R.App.user.profile === 'admin' || R.App.user.profile === 'teacher');

  R.Views.discipline = {
    id: 'discipline', title: 'Discipline', group: 'Discipline',
    profiles: ['admin', 'teacher', 'parent', 'student'],

    async render(root) {
      let html = UI.pageHead('DISCIPLINE', 'referrals & incidents');
      if (isStaff()) html += UI.toolbar('<button class="primary" id="btnNew">[ + NEW REFERRAL ]</button>');
      html += UI.toolbar(
        '<label>SEARCH</label><input type="text" id="q" size="20" placeholder="student / incident">' +
        '<label>CATEGORY</label>' + UI.select('fCat', (R.state.disciplineCategories || []).map((c) => ({ value: c.id, label: c.title })), '', 'all') +
        '<label>STATUS</label>' + UI.select('fOpen', [{ value: '1', label: 'Open only' }], '', 'all') +
        '<button id="btnGo">[ SEARCH ]</button><span class="spacer"></span><span class="dim" id="cnt"></span>');
      html += '<div id="list"></div>';
      html += '<div id="charts"></div>';
      root.innerHTML = html;

      const load = async () => {
        const box = document.getElementById('list');
        box.innerHTML = '<pre class="ascii dim">loading…</pre>';
        try {
          const qs = api.qs({
            search: document.getElementById('q').value, limit: 400, open: document.getElementById('fOpen').value,
            filter: { category_id: document.getElementById('fCat').value }
          });
          const res = await api.get('/api/discipline/referrals' + qs);
          document.getElementById('cnt').textContent = res.total + ' referral(s)';
          const rows = res.data.map((x) => ({
            id: x.id, date: U.date(x.event_date), sid: x.sid, name: x.first_name + ' ' + x.last_name,
            gr: x.grade_level || '—', cat: x.category || '—', incident: x.title || '—',
            action: x.action || '—', by: x.staff || '—', pts: x.points,
            status: x.is_resolved ? 'RESOLVED' : 'OPEN'
          }));
          box.innerHTML = U.table({
            title: 'DISCIPLINE REFERRALS',
            columns: [
              { title: 'DATE', key: 'date', width: 11 }, { title: 'STUDENT ID', key: 'sid', width: 11 },
              { title: 'STUDENT', key: 'name', max: 20 }, { title: 'GR', key: 'gr', width: 4, align: 'c' },
              { title: 'CATEGORY', key: 'cat', width: 16 }, { title: 'INCIDENT', key: 'incident', max: 24 },
              { title: 'ACTION', key: 'action', width: 18 }, { title: 'STAFF', key: 'by', max: 14 },
              { title: 'PTS', key: 'pts', width: 4, align: 'r' }, { title: 'STATUS', key: 'status', width: 9 }
            ], rows, empty: '   no referrals found'
          });
          UI.onRows(box, (id) => R.Views.discipline.editReferral(id));

          // charts
          const byCat = {}, byAct = {};
          res.data.forEach((x) => { byCat[x.category || '—'] = (byCat[x.category || '—'] || 0) + 1; byAct[x.action || '—'] = (byAct[x.action || '—'] || 0) + 1; });
          const c1 = Object.keys(byCat).map((k) => ({ label: k, n: byCat[k] })).sort((a, b) => b.n - a.n);
          const c2 = Object.keys(byAct).map((k) => ({ label: k, n: byAct[k] })).sort((a, b) => b.n - a.n);
          let ch = '';
          if (c1.length) ch += UI.chart(c1);
          if (c2.length) ch += UI.chart(c2);
          document.getElementById('charts').innerHTML = ch;
        } catch (e) { box.innerHTML = UI.empty(e.message); }
      };
      document.getElementById('btnGo').onclick = load;
      document.getElementById('q').onkeydown = (e) => { if (e.key === 'Enter') load(); };
      ['fCat', 'fOpen'].forEach((i) => document.getElementById(i).onchange = load);
      if (isStaff()) document.getElementById('btnNew').onclick = () => R.Views.discipline.editReferral(null, null);
      load();
    },

    async editReferral(id, presetStudentId) {
      let d = null;
      if (id) {
        const r = await api.get('/api/discipline/referrals/' + id);
        d = r.referral;
      }
      UI.modal({
        title: d ? 'REFERRAL  #' + d.id : 'NEW DISCIPLINE REFERRAL',
        fields: [
          { name: 'student_pick', label: 'Student', type: 'static', value: d ? (d.first_name + ' ' + d.last_name) : 'use search below' },
          { name: 'student_id', label: 'Student ID', type: 'number', value: d ? d.student_id : (presetStudentId || '') },
          { name: 'event_date', label: 'Event Date', type: 'date', value: (d && d.event_date) || new Date().toISOString().slice(0, 10) },
          { name: 'entry_date', label: 'Entry Date', type: 'date', value: (d && d.entry_date) || new Date().toISOString().slice(0, 10) },
          { name: 'category_id', label: 'Category', type: 'select', value: d ? d.category_id : '', options: [{ value: '', label: '— none —' }].concat((R.state.disciplineCategories || []).map((c) => ({ value: c.id, label: c.title }))) },
          { name: 'action_id', label: 'Action', type: 'select', value: d ? d.action_id : '', options: [{ value: '', label: '— none —' }].concat((R.state.disciplineActions || []).map((c) => ({ value: c.id, label: c.title }))) },
          { name: 'title', label: 'Incident', value: d ? d.title : '', required: true },
          { name: 'description', label: 'Description', type: 'textarea', rows: 3, value: d ? d.description : '' },
          { name: 'consequence', label: 'Consequence', value: d ? d.consequence : '' },
          { name: 'points', label: 'Points', type: 'number', value: d ? d.points : 0 },
          { name: 'is_resolved', label: 'Resolved', type: 'checkbox', value: d ? d.is_resolved : 0 }
        ],
        onDelete: d ? async () => { await api.del('/api/discipline/referrals/' + d.id); UI.ok('Referral deleted'); R.App.reload(); } : null,
        onSave: async (data) => {
          delete data.student_pick;
          if (!data.student_id) throw new Error('Student ID is required');
          if (d) { await api.put('/api/discipline/referrals/' + d.id, data); UI.ok('Referral saved'); }
          else { await api.post('/api/discipline/referrals', data); UI.ok('Referral created'); }
          R.App.reload();
        }
      });
    }
  };
})(window.RSIS);

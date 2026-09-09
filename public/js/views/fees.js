/* =====================================================================
   views/fees.js -- student fees & payments
   ===================================================================== */
(function (R) {
  'use strict';
  const U = R.U, UI = R.UI, api = R.api;

  R.Views = R.Views || {};
  const isAdmin = () => R.App.user && R.App.user.profile === 'admin';

  R.Views.fees = {
    id: 'fees', title: 'Fees', group: 'Fees',
    profiles: ['admin', 'parent', 'student'],

    async render(root) {
      let html = UI.pageHead('STUDENT FEES', 'billing & payments');
      if (isAdmin()) html += UI.toolbar('<button class="primary" id="btnNew">[ + NEW FEE ]</button>');
      html += UI.toolbar(
        '<label>SEARCH</label><input type="text" id="q" size="22" placeholder="student / fee title">' +
        '<label>STATUS</label>' + UI.select('fStat', [{ value: 'owing', label: 'Owing' }], '', 'all') +
        '<button id="btnGo">[ SEARCH ]</button><span class="spacer"></span><span class="dim" id="cnt"></span>');
      html += '<div id="tot"></div><div id="list"></div>';
      root.innerHTML = html;

      const load = async () => {
        const box = document.getElementById('list');
        box.innerHTML = '<pre class="ascii dim">loading…</pre>';
        try {
          const qs = api.qs({ search: document.getElementById('q').value, limit: 600 });
          const res = await api.get('/api/fees' + qs);
          let rows = res.data.map((f) => ({
            id: f.id, sid: f.sid, name: f.first_name + ' ' + f.last_name, title: f.title,
            amount: U.money(f.amount), paid: U.money(f.paid || 0), balance: U.money(f.balance),
            due: U.date(f.due_date), status: f.balance > 0 ? 'OWING' : 'PAID'
          }));
          if (document.getElementById('fStat').value === 'owing') rows = rows.filter((r) => r.status === 'OWING');
          document.getElementById('cnt').textContent = rows.length + ' fee(s)';

          const charged = res.data.reduce((a, f) => a + f.amount, 0);
          const paid = res.data.reduce((a, f) => a + (f.paid || 0), 0);
          document.getElementById('tot').innerHTML = '<pre class="ascii">' + U.esc(U.box('ACCOUNTS RECEIVABLE', [
            'Total charged  : ' + U.money(charged),
            'Total paid     : ' + U.money(paid) + '   ' + U.bar(paid, charged || 1, 24),
            'Outstanding    : ' + U.money(charged - paid)
          ], 60)) + '</pre>';

          box.innerHTML = U.table({
            title: 'FEES',
            columns: [
              { title: 'STUDENT ID', key: 'sid', width: 11 }, { title: 'STUDENT', key: 'name', max: 22 },
              { title: 'FEE', key: 'title', max: 22 }, { title: 'AMOUNT', key: 'amount', width: 11, align: 'r' },
              { title: 'PAID', key: 'paid', width: 11, align: 'r' }, { title: 'BALANCE', key: 'balance', width: 11, align: 'r' },
              { title: 'DUE DATE', key: 'due', width: 11 }, { title: 'STATUS', key: 'status', width: 8 }
            ], rows, empty: '   no fees found'
          });
          UI.onRows(box, (id) => {
            const f = res.data.find((x) => String(x.id) === String(id));
            if (!f) return;
            if (!isAdmin()) return;
            if (f.balance <= 0) { UI.toast('This fee is already paid in full'); return; }
            UI.modal({
              title: 'RECORD PAYMENT',
              fields: [
                { name: 'student', label: 'Student', type: 'static', value: f.first_name + ' ' + f.last_name + '  (' + f.sid + ')' },
                { name: 'fee', label: 'Fee', type: 'static', value: f.title + '  balance ' + U.money(f.balance) },
                { name: 'amount', label: 'Amount', type: 'number', value: f.balance, required: true },
                { name: 'payment_date', label: 'Date', type: 'date', value: new Date().toISOString().slice(0, 10) },
                { name: 'method', label: 'Method', type: 'select', value: 'Cash', options: ['Cash', 'Check', 'Card', 'Online'] },
                { name: 'comments', label: 'Comments', type: 'textarea', rows: 2 }
              ],
              onSave: async (data) => { await api.post('/api/fees/' + f.id + '/pay', data); UI.ok('Payment recorded'); R.App.reload(); }
            });
          });
        } catch (e) { box.innerHTML = UI.empty(e.message); }
      };
      document.getElementById('btnGo').onclick = load;
      document.getElementById('q').onkeydown = (e) => { if (e.key === 'Enter') load(); };
      document.getElementById('fStat').onchange = load;
      if (isAdmin()) document.getElementById('btnNew').onclick = () => UI.modal({
        title: 'NEW FEE',
        html: '<div class="form-row"><label>Student</label><div class="f"><input type="text" id="sq" placeholder="last name"><button type="button" id="sb">[ FIND ]</button></div></div>' +
          '<div class="form-row"><label>Select</label><div class="f"><select id="f_student_id"></select></div></div>' +
          '<div class="form-row"><label>Title</label><div class="f"><input id="fx_title" value="Textbook Fee"></div></div>' +
          '<div class="form-row"><label>Amount</label><div class="f"><input id="fx_amount" type="number" value="50"></div></div>' +
          '<div class="form-row"><label>Due Date</label><div class="f"><input id="fx_due" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div></div>' +
          '<div class="form-row"><label>Comments</label><div class="f"><input id="fx_comments"></div></div>',
        onSave: async () => {
          const sid = document.getElementById('f_student_id').value;
          if (!sid) throw new Error('Find and select a student first');
          await api.post('/api/fees', {
            student_id: Number(sid),
            title: document.getElementById('fx_title').value,
            amount: Number(document.getElementById('fx_amount').value),
            due_date: document.getElementById('fx_due').value,
            comments: document.getElementById('fx_comments').value
          });
          UI.ok('Fee created'); R.App.reload();
        }
      });
      setTimeout(() => {
        const sb = document.getElementById('sb');
        if (!sb) return;
        sb.onclick = async () => {
          const res = await api.get('/api/students' + api.qs({ search: document.getElementById('sq').value, limit: 50 }));
          document.getElementById('f_student_id').innerHTML =
            res.data.map((s) => '<option value="' + s.id + '">' + U.esc(s.student_id + '  ' + U.name(s)) + '</option>').join('');
        };
      }, 80);
      load();
    }
  };
})(window.RSIS);

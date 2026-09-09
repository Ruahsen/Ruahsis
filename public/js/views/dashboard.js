/* =====================================================================
   views/dashboard.js -- system overview
   ===================================================================== */
(function (R) {
  'use strict';
  const U = R.U, UI = R.UI, api = R.api;

  R.Views = R.Views || {};

  R.Views.dashboard = {
    id: 'dashboard', title: 'Dashboard', group: 'Home',
    profiles: ['admin', 'teacher', 'parent', 'student'],

    async render(root) {
      root.innerHTML = UI.pageHead('DASHBOARD', 'system overview') + '<pre class="ascii dim">loading…</pre>';
      const d = await api.get('/api/dashboard');
      const st = d.stats, att = st.attendanceToday;

      const cards = [
        { k: 'STUDENTS', v: st.students, s: 'enrolled' },
        { k: 'TEACHERS', v: st.staff, s: 'active staff' },
        { k: 'COURSES', v: st.courses, s: st.sections + ' sections' },
        {
          k: 'ATTENDANCE TODAY', v: att.rate + '%',
          s: att.present + ' present / ' + att.absent + ' absent / ' + att.tardy + ' tardy',
          kind: att.rate >= 95 ? 'good' : att.rate >= 90 ? 'warn' : 'bad'
        },
        { k: 'OPEN REFERRALS', v: st.openReferrals, s: 'discipline', kind: st.openReferrals > 10 ? 'warn' : '' },
        { k: 'AVERAGE GPA', v: st.avgGpa.toFixed(2), s: st.honorRoll + ' on honor roll' },
        { k: 'FEES CHARGED', v: U.money(st.feesCharged), s: U.money(st.feesPaid) + ' collected' },
        {
          k: 'OUTSTANDING', v: U.money(st.feesBalance), s: 'balance due',
          kind: st.feesBalance > 1000 ? 'bad' : ''
        }
      ];

      let html = UI.pageHead('DASHBOARD', R.state.schoolName + '  ::  ' + R.state.schoolYearTitle);
      html += UI.cards(cards);

      // ---- charts
      const byGrade = (d.byGrade || []).map((r) => ({ label: r.grade_level || '—', n: r.n }));
      const byGender = (d.byGender || []).map((r) => ({ label: r.gender || '—', n: r.n }));
      const grades = (d.gradeDist || []).map((r) => ({ label: r.grade_letter || '—', n: r.n }));

      let charts = U.box('ENROLMENT BY GRADE', byGrade.map((r) => U.pad(r.label, 6) + ' │' + U.bar(r.n, Math.max.apply(null, byGrade.map((x) => x.n)) || 1, 26) + '│ ' + r.n), 46);
      const genderLines = byGender.map((r) => U.pad(r.label, 10) + ' │' + U.bar(r.n, Math.max.apply(null, byGender.map((x) => x.n)) || 1, 20) + '│ ' + r.n);
      charts = U.row([charts, U.box('BY GENDER', genderLines, 42)]);
      html += '<pre class="ascii">' + U.esc(charts) + '</pre>';

      if (grades.length) {
        const gmax = Math.max.apply(null, grades.map((x) => x.n));
        html += '<pre class="ascii">' + U.esc(U.box('GRADE DISTRIBUTION (current marking period)',
          grades.map((r) => U.pad(r.label, 4) + ' │' + U.bar(r.n, gmax, 40) + '│ ' + r.n), 58)) + '</pre>';
      }

      // ---- attendance trend
      if (d.daily && d.daily.length) {
        const lines = d.daily.map((r) => U.date(r.date) + ' │' + U.bar(r.rate, 100, 34) + '│ ' + U.pct(r.rate));
        html += '<pre class="ascii">' + U.esc(U.box('DAILY ATTENDANCE (last ' + d.daily.length + ' days)  ' + U.spark(d.daily.map((r) => r.rate)), lines, 56)) + '</pre>';
      }

      // ---- role specific
      const me = R.App.user;
      if (me.profile === 'teacher' && d.mySections.length) {
        html += '<pre class="ascii">' + U.esc(U.box('MY SECTIONS',
          d.mySections.map((s) => U.pad((s.period || '?') + ' ' + (s.room || ''), 10) + ' ' + U.cut(s.title, 34) + ' ' + String(s.students).padStart(3) + ' std'), 64)) + '</pre>';
      }
      if (me.profile === 'parent' && d.myChildren.length) {
        html += '<pre class="ascii">' + U.esc(U.box('MY CHILDREN',
          d.myChildren.map((c) => U.pad(c.student_id, 8) + ' ' + U.pad(c.first_name + ' ' + c.last_name, 26) + ' gr ' + c.grade_level), 52)) + '</pre>';
        html += '<div class="toolbar">' + d.myChildren.map((c) =>
          '<button onclick="RSIS.App.go(\'students/' + c.id + '\')">[ ' + U.esc(c.first_name) + ' ]</button>').join(' ') + '</div>';
      }
      if (me.profile === 'student' && d.mySchedule.length) {
        html += '<pre class="ascii">' + U.esc(U.box('MY SCHEDULE',
          d.mySchedule.map((s) => U.pad(s.period || '?', 4) + ' ' + U.pad(s.start_time || '', 6) + ' ' + U.cut(s.title, 30) + U.pad(s.room || '', 6)), 64)) + '</pre>';
      }

      root.innerHTML = html;
    }
  };
})(window.RSIS);

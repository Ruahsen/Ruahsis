'use strict';
/** End-to-end smoke test of the HTTP API. Usage: node lib/smoketest.js [baseUrl] */
const BASE = process.argv[2] || 'http://localhost:8787';

let token = null;
const results = [];
async function call(method, path, body, asUser) {
  const headers = { 'Content-Type': 'application/json' };
  if (asUser !== false && token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let json = null, text = '';
  try { text = await res.text(); json = JSON.parse(text); } catch (_) { }
  return { status: res.status, json, text };
}
function check(name, r, expectOk = true) {
  const ok = r.status < 400 && (!expectOk || (r.json && r.json.ok !== false));
  results.push({ ok, name, status: r.status, err: r.json && r.json.error });
  console.log(`  ${ok ? '[ok]  ' : '[FAIL]'} ${String(r.status).padEnd(4)} ${name}${ok ? '' : '  -> ' + (r.json && r.json.error ? r.json.error : r.text.slice(0, 120))}`);
  return r;
}

(async () => {
  console.log('\n  RUAHSIS API smoke test  ->  ' + BASE + '\n');

  let r = await call('GET', '/api/health', null, false); check('GET  /api/health', r);

  // ---- login
  r = await call('POST', '/api/auth/login', { username: 'admin', password: 'admin' }, false);
  check('POST /api/auth/login (admin)', r);
  token = r.json && r.json.token;
  if (!token) { console.log('\n  [X] Cannot continue without a session token\n'); process.exit(1); }

  r = await call('GET', '/api/auth/me'); check('GET  /api/auth/me', r);
  r = await call('POST', '/api/auth/login', { username: 'admin', password: 'wrong' }, false);
  results.push({ ok: r.status === 401, name: 'login rejects bad password', status: r.status });
  console.log(`  ${r.status === 401 ? '[ok]  ' : '[FAIL]'} ${String(r.status).padEnd(4)} login rejects bad password`);

  // ---- setup
  r = await call('GET', '/api/setup/bootstrap'); check('GET  /api/setup/bootstrap', r);
  const boot = r.json;
  r = await call('GET', '/api/setup/schools'); check('GET  /api/setup/schools', r);
  r = await call('GET', '/api/setup/marking-periods'); check('GET  /api/setup/marking-periods', r);
  r = await call('GET', '/api/setup/periods'); check('GET  /api/setup/periods', r);
  r = await call('GET', '/api/setup/grade-levels'); check('GET  /api/setup/grade-levels', r);
  r = await call('GET', '/api/setup/grade-scales'); check('GET  /api/setup/grade-scales', r);
  r = await call('GET', '/api/setup/attendance-codes'); check('GET  /api/setup/attendance-codes', r);
  r = await call('GET', '/api/setup/activity-log'); check('GET  /api/setup/activity-log', r);

  // ---- students
  r = await call('GET', '/api/students?limit=5'); check('GET  /api/students', r);
  const studentId = r.json.data[0].id;
  r = await call('GET', '/api/students?search=' + encodeURIComponent(r.json.data[0].last_name)); check('GET  /api/students?search=', r);
  r = await call('GET', `/api/students/${studentId}`); check('GET  /api/students/:id', r);
  r = await call('GET', `/api/students/${studentId}/schedule`); check('GET  /api/students/:id/schedule', r);
  r = await call('GET', `/api/students/${studentId}/grades`); check('GET  /api/students/:id/grades', r);
  r = await call('GET', `/api/students/${studentId}/attendance`); check('GET  /api/students/:id/attendance', r);
  r = await call('GET', `/api/students/${studentId}/discipline`); check('GET  /api/students/:id/discipline', r);
  r = await call('GET', `/api/students/${studentId}/fees`); check('GET  /api/students/:id/fees', r);

  // create / update / delete a student
  r = await call('POST', '/api/students', { first_name: 'Test', last_name: 'Student', grade_level: '9', gender: 'Female', birthdate: '2011-04-02' });
  check('POST /api/students (create)', r);
  const newId = r.json && r.json.student && r.json.student.id;
  r = await call('PUT', '/api/students/' + newId, { city: 'Springfield' }); check('PUT  /api/students/:id', r);
  r = await call('POST', '/api/students/' + newId + '/notes', { note: 'Smoke test note', category: 'General' }); check('POST /api/students/:id/notes', r);
  r = await call('POST', '/api/students/' + newId + '/contacts', { first_name: 'Casey', last_name: 'Tester', relationship: 'Guardian' }); check('POST /api/students/:id/contacts', r);
  r = await call('PUT', '/api/students/' + newId + '/medical', { allergies: 'None', physician: 'Dr Who' }); check('PUT  /api/students/:id/medical', r);
  r = await call('DELETE', '/api/students/' + newId); check('DELETE /api/students/:id', r);

  // ---- staff
  r = await call('GET', '/api/staff?limit=5'); check('GET  /api/staff', r);
  r = await call('GET', '/api/staff?filter[profile]=teacher&limit=3'); check('GET  /api/staff (teacher filter)', r);
  const teacher = r.json.data[0];
  r = await call('GET', '/api/staff/' + teacher.id); check('GET  /api/staff/:id', r);
  r = await call('GET', '/api/staff/teachers'); check('GET  /api/staff/teachers', r);

  // ---- courses / scheduling
  r = await call('GET', '/api/courses?limit=5'); check('GET  /api/courses', r);
  r = await call('GET', '/api/course-periods'); check('GET  /api/course-periods', r);
  const cp = r.json.data[0];
  r = await call('GET', '/api/course-periods/' + cp.id); check('GET  /api/course-periods/:id', r);
  r = await call('GET', '/api/course-periods/' + cp.id + '/roster'); check('GET  /api/course-periods/:id/roster', r);
  r = await call('GET', '/api/scheduling/master'); check('GET  /api/scheduling/master', r);
  r = await call('GET', '/api/scheduling/unscheduled'); check('GET  /api/scheduling/unscheduled', r);

  // ---- grades
  r = await call('GET', '/api/grades/gradebook?course_period_id=' + cp.id); check('GET  /api/grades/gradebook', r);
  const gb = r.json;
  const asg = gb.assignments && gb.assignments[0];
  if (asg && gb.rows.length) {
    r = await call('POST', '/api/grades/gradebook', { grades: [{ assignment_id: asg.id, student_id: gb.rows[0].student.id, points: 42 }] });
    check('POST /api/grades/gradebook (save score)', r);
  }
  r = await call('GET', '/api/grades/assignments?course_period_id=' + cp.id); check('GET  /api/grades/assignments', r);
  r = await call('GET', '/api/grades/report-card-grades?student_id=' + studentId); check('GET  /api/grades/report-card-grades', r);
  r = await call('GET', '/api/grades/gpa?student_id=' + studentId); check('GET  /api/grades/gpa', r);
  r = await call('GET', '/api/grades/gpa'); check('GET  /api/grades/gpa (class)', r);
  r = await call('GET', '/api/grades/honor-roll'); check('GET  /api/grades/honor-roll', r);
  r = await call('POST', '/api/grades/recalculate', { course_period_id: cp.id }); check('POST /api/grades/recalculate', r);

  // ---- attendance
  const today = new Date().toISOString().slice(0, 10);
  r = await call('GET', '/api/attendance/codes'); check('GET  /api/attendance/codes', r);
  r = await call('GET', '/api/attendance/day?date=' + today); check('GET  /api/attendance/day', r);
  r = await call('GET', '/api/attendance/period?course_period_id=' + cp.id + '&date=' + today); check('GET  /api/attendance/period', r);
  r = await call('GET', '/api/attendance/summary'); check('GET  /api/attendance/summary', r);
  r = await call('GET', '/api/attendance/daily'); check('GET  /api/attendance/daily', r);
  r = await call('GET', '/api/attendance/calendar'); check('GET  /api/attendance/calendar', r);
  // save one attendance entry
  const dayRows = (await call('GET', '/api/attendance/day?date=' + today)).json.rows;
  if (dayRows && dayRows.length) {
    r = await call('POST', '/api/attendance/day', { date: today, entries: [{ student_id: dayRows[0].student.id, attendance_code: dayRows[0].attendance_code }] });
    check('POST /api/attendance/day (save)', r);
  }

  // ---- discipline
  r = await call('GET', '/api/discipline/referrals?limit=5'); check('GET  /api/discipline/referrals', r);
  r = await call('POST', '/api/discipline/referrals', { student_id: studentId, title: 'Smoke test referral', category_id: 1, action_id: 1 });
  check('POST /api/discipline/referrals (create)', r);
  const refId = r.json && r.json.referral && r.json.referral.id;
  if (refId) { r = await call('DELETE', '/api/discipline/referrals/' + refId); check('DELETE /api/discipline/referrals/:id', r); }

  // ---- fees
  r = await call('GET', '/api/fees?limit=5'); check('GET  /api/fees', r);
  r = await call('POST', '/api/fees', { student_id: studentId, title: 'Smoke fee', amount: 12.5, due_date: today });
  check('POST /api/fees (create)', r);
  const feeId = r.json && r.json.fee && r.json.fee.id;
  if (feeId) {
    r = await call('POST', '/api/fees/' + feeId + '/pay', { amount: 12.5 }); check('POST /api/fees/:id/pay', r);
    r = await call('DELETE', '/api/fees/' + feeId); check('DELETE /api/fees/:id', r);
  }
  r = await call('GET', '/api/fees/balance/' + studentId); check('GET  /api/fees/balance/:id', r);

  // ---- reports
  r = await call('GET', '/api/dashboard'); check('GET  /api/dashboard', r);
  r = await call('GET', '/api/reports/enrollment'); check('GET  /api/reports/enrollment', r);
  r = await call('GET', '/api/reports/grade-distribution'); check('GET  /api/reports/grade-distribution', r);
  r = await call('GET', '/api/reports/attention-list'); check('GET  /api/reports/attention-list', r);
  r = await call('GET', '/api/reports/defaulters'); check('GET  /api/reports/defaulters', r);
  r = await call('GET', '/api/reports/student/' + studentId + '/report-card'); check('GET  .../report-card', r);
  r = await call('GET', '/api/reports/student/' + studentId + '/transcript'); check('GET  .../transcript', r);
  r = await call('GET', '/api/messages'); check('GET  /api/messages', r);
  r = await call('GET', '/api/portal-notes'); check('GET  /api/portal-notes', r);

  // ---- teacher + student role scoping
  const t = await call('POST', '/api/auth/login', { username: 'katherine.nolan', password: 'teacher' }, false);
  results.push({ ok: t.status === 200, name: 'login as teacher', status: t.status });
  console.log(`  ${t.status === 200 ? '[ok]  ' : '[FAIL]'} ${String(t.status).padEnd(4)} login as teacher`);
  if (t.json && t.json.token) {
    const save = token; token = t.json.token;
    r = await call('GET', '/api/dashboard'); check('GET  /api/dashboard (teacher)', r);
    r = await call('GET', '/api/course-periods'); check('GET  /api/course-periods (teacher scope)', r);
    r = await call('GET', '/api/students?limit=3'); check('GET  /api/students (teacher)', r);
    r = await call('POST', '/api/students', { first_name: 'No', last_name: 'Perms' });
    results.push({ ok: r.status === 403, name: 'teacher blocked from creating students', status: r.status });
    console.log(`  ${r.status === 403 ? '[ok]  ' : '[FAIL]'} ${String(r.status).padEnd(4)} teacher blocked from creating students (403)`);
    token = save;
  }
  const s = await call('POST', '/api/auth/login', { username: 'student1', password: 'student' }, false);
  const sOk = s.status === 200;
  results.push({ ok: sOk, name: 'login as student', status: s.status });
  console.log(`  ${sOk ? '[ok]  ' : '[FAIL]'} ${String(s.status).padEnd(4)} login as student`);
  if (s.json && s.json.token) {
    const save = token; token = s.json.token;
    r = await call('GET', '/api/students?limit=5'); check('GET  /api/students (student scope)', r);
    const scoped = r.json.data.length <= 1;
    results.push({ ok: scoped, name: 'student sees only own record', status: r.status });
    console.log(`  ${scoped ? '[ok]  ' : '[FAIL]'} ${String(r.status).padEnd(4)} student sees only own record (${r.json.data.length})`);
    token = save;
  }

  // ---- logout
  r = await call('POST', '/api/auth/logout'); check('POST /api/auth/logout', r);

  const failed = results.filter((x) => !x.ok);
  console.log('\n  ' + '='.repeat(52));
  console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log('\n  FAILURES:'); failed.forEach((f) => console.log(`   - ${f.name} (HTTP ${f.status})${f.err ? ': ' + f.err : ''}`)); }
  console.log('  ' + '='.repeat(52) + '\n');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('\n  [X] Smoke test crashed:', e.message, '\n'); process.exit(1); });

'use strict';
/** Attendance: daily (day) and period attendance, codes and summaries. */
const { HttpError } = require('../lib/router');
const { buildUpdate, buildInsert, paging } = require('../lib/db');
const H = require('./helpers');

function todayStr() { return new Date().toISOString().slice(0, 10); }

module.exports = function (router, db, auth, ctx) {
  const staffOnly = auth.requireProfile('admin', 'teacher');

  // ------------------------------------------------------------ codes
  router.get('/api/attendance/codes', (req) => {
    auth.requireAuth(req);
    return H.list(db.all('SELECT * FROM attendance_codes ORDER BY sort_order'), req);
  });

  // ------------------------------------------------------------ day attendance (roster grid)
  router.get('/api/attendance/day', (req) => {
    auth.requireAuth(req);
    const date = req.query.date || todayStr();
    const cpId = H.int(req.query.course_period_id);
    const schoolId = H.int(req.query.school_id) || H.currentSchool(db, req);

    let students;
    if (cpId) {
      students = db.all(`SELECT s.id, s.student_id, s.first_name, s.last_name, s.grade_level
        FROM schedule sc JOIN students s ON s.id = sc.student_id
        WHERE sc.course_period_id = ? ORDER BY s.last_name, s.first_name`, [cpId]);
    } else {
      const gl = req.query.grade_level;
      const params = [schoolId], w = ['s.school_id = ?', 's.is_active = 1'];
      if (gl) { w.push('s.grade_level = ?'); params.push(gl); }
      const vis = auth.visibleStudentIds(db, req.user);
      if (vis !== null) { w.push(vis.length ? `s.id IN (${vis.map(() => '?').join(',')})` : 's.id = 0'); params.push(...vis); }
      const { limit } = paging(req, 's.last_name');
      students = db.all(`SELECT s.id, s.student_id, s.first_name, s.last_name, s.grade_level FROM students s
        WHERE ${w.join(' AND ')} ORDER BY s.last_name, s.first_name LIMIT ?`, [...params, limit]);
    }

    const existing = db.all('SELECT * FROM attendance_day WHERE school_date = ?', [date]);
    const map = Object.fromEntries(existing.map((e) => [e.student_id, e]));
    const codes = db.all('SELECT * FROM attendance_codes ORDER BY sort_order');
    const defaultCode = (codes.find((c) => c.is_default) || codes[0] || {}).id || null;

    const rows = students.map((s) => ({
      student: s,
      record: map[s.id] || null,
      attendance_code: map[s.id] ? map[s.id].attendance_code : defaultCode,
      comment: map[s.id] ? map[s.id].comment : null
    }));

    const summary = { present: 0, absent: 0, excused: 0, tardy: 0, total: rows.length };
    const codeById = Object.fromEntries(codes.map((c) => [c.id, c]));
    for (const r of rows) {
      const c = codeById[r.attendance_code];
      if (!c) continue;
      if (c.short_name === 'P') summary.present++;
      else if (c.short_name === 'A') summary.absent++;
      else if (c.short_name === 'EA') summary.excused++;
      else summary.tardy++;
    }
    summary.rate = summary.total ? Math.round((summary.present / summary.total) * 1000) / 10 : 0;
    return { ok: true, date, codes, rows, summary };
  });

  /** Bulk save: {date, entries:[{student_id, attendance_code, comment, minutes_present}]} */
  router.post('/api/attendance/day', (req) => {
    staffOnly(req);
    const date = req.body.date || todayStr();
    const entries = req.body.entries || [];
    if (!Array.isArray(entries)) throw new HttpError(400, 'entries array required');
    const schoolId = H.int(req.body.school_id) || H.currentSchool(db, req);
    db.run('INSERT OR IGNORE INTO attendance_calendar (school_id, school_date, minutes, is_school_day) VALUES (?,?,?,?)', [schoolId, date, 360, 1]);

    const stmt = db.raw.prepare(`INSERT INTO attendance_day (student_id, school_id, school_date, minutes_present, minutes_absent, state_value, attendance_code, comment)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(student_id, school_date) DO UPDATE SET
        attendance_code = excluded.attendance_code, comment = excluded.comment,
        minutes_present = excluded.minutes_present, minutes_absent = excluded.minutes_absent,
        state_value = excluded.state_value`);
    const codeById = Object.fromEntries(db.all('SELECT id, type, short_name FROM attendance_codes').map((c) => [c.id, c]));
    db.raw.exec('BEGIN');
    try {
      for (const e of entries) {
        const code = codeById[H.int(e.attendance_code)];
        const isAbsent = code && (code.short_name === 'A' || code.short_name === 'EA');
        const present = e.minutes_present !== undefined && e.minutes_present !== null
          ? H.int(e.minutes_present) : (isAbsent ? 0 : (code && code.short_name === 'T' ? 350 : 360));
        const absent = Math.max(0, 360 - present);
        stmt.run(H.int(e.student_id), schoolId, date, present, absent,
          isAbsent ? 0 : (present / 360), H.int(e.attendance_code), e.comment || null);
      }
      db.raw.exec('COMMIT');
    } catch (err) { db.raw.exec('ROLLBACK'); throw err; }
    ctx.logActivity(req, 'update', 'attendance for ' + date + ' (' + entries.length + ')');
    return H.done('Attendance saved for ' + date, { saved: entries.length });
  });

  // ------------------------------------------------------------ period attendance
  router.get('/api/attendance/period', (req) => {
    auth.requireAuth(req);
    const cpId = H.int(req.query.course_period_id);
    if (!cpId) throw new HttpError(400, 'course_period_id is required');
    const date = req.query.date || todayStr();
    const cp = db.get('SELECT * FROM course_periods WHERE id = ?', [cpId]);
    if (!cp) throw new HttpError(404, 'Course period not found');
    if (req.user.profile === 'teacher' && cp.teacher_id !== req.user.id) throw new HttpError(403, 'Not your course period');

    const roster = db.all(`SELECT s.id, s.student_id, s.first_name, s.last_name
      FROM schedule sc JOIN students s ON s.id = sc.student_id
      WHERE sc.course_period_id = ? ORDER BY s.last_name, s.first_name`, [cpId]);
    const existing = db.all('SELECT * FROM attendance_period WHERE course_period_id = ? AND school_date = ?', [cpId, date]);
    const map = Object.fromEntries(existing.map((e) => [e.student_id, e]));
    const codes = db.all('SELECT * FROM attendance_codes ORDER BY sort_order');
    const defCode = (codes.find((c) => c.is_default) || codes[0] || {}).id || null;
    return {
      ok: true, date, coursePeriod: cp, codes,
      rows: roster.map((s) => ({
        student: s,
        record: map[s.id] || null,
        attendance_code: map[s.id] ? map[s.id].attendance_code : defCode,
        attendance_reason: map[s.id] ? map[s.id].attendance_reason : null
      }))
    };
  });

  router.post('/api/attendance/period', (req) => {
    const cpId = H.int(req.body.course_period_id);
    auth.requireCoursePeriodAccess(db, req, cpId);
    const date = req.body.date || todayStr();
    const entries = req.body.entries || [];
    const cp = db.get('SELECT school_id, period_id, teacher_id FROM course_periods WHERE id = ?', [cpId]);
    const stmt = db.raw.prepare(`INSERT INTO attendance_period (student_id, course_period_id, school_id, school_date, period_id, attendance_code, attendance_reason, teacher_id)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(student_id, course_period_id, school_date) DO UPDATE SET
        attendance_code = excluded.attendance_code, attendance_reason = excluded.attendance_reason`);
    db.raw.exec('BEGIN');
    try {
      for (const e of entries) {
        stmt.run(H.int(e.student_id), cpId, cp.school_id, date, cp.period_id,
          H.int(e.attendance_code), e.attendance_reason || null, cp.teacher_id || req.user.id);
      }
      db.raw.exec('COMMIT');
    } catch (err) { db.raw.exec('ROLLBACK'); throw err; }
    return H.done('Period attendance saved', { saved: entries.length });
  });

  // ------------------------------------------------------------ summary
  router.get('/api/attendance/summary', (req) => {
    auth.requireAuth(req);
    const schoolId = H.int(req.query.school_id) || H.currentSchool(db, req);
    const params = [], where = ['a.school_id = ?'];
    params.push(schoolId);
    if (req.query.from) { where.push('a.school_date >= ?'); params.push(req.query.from); }
    if (req.query.to) { where.push('a.school_date <= ?'); params.push(req.query.to); }
    const codes = db.all('SELECT * FROM attendance_codes');
    const codeById = Object.fromEntries(codes.map((c) => [c.id, c]));

    const rows = db.all(`SELECT a.student_id, a.attendance_code, COUNT(*) AS n,
        s.first_name, s.last_name, s.student_id AS sid, s.grade_level
      FROM attendance_day a JOIN students s ON s.id = a.student_id
      WHERE ${where.join(' AND ')} GROUP BY a.student_id, a.attendance_code`, params);

    const byStudent = {};
    for (const r of rows) {
      const k = r.student_id;
      byStudent[k] = byStudent[k] || { studentId: r.student_id, name: r.first_name + ' ' + r.last_name, sid: r.sid, grade_level: r.grade_level, present: 0, absent: 0, excused: 0, tardy: 0, total: 0 };
      const c = codeById[r.attendance_code] || {};
      const b = byStudent[k];
      if (c.short_name === 'P') b.present += r.n;
      else if (c.short_name === 'A') b.absent += r.n;
      else if (c.short_name === 'EA') b.excused += r.n;
      else b.tardy += r.n;
      b.total += r.n;
    }
    const out = Object.values(byStudent).map((b) => ({ ...b, rate: b.total ? Math.round((b.present / b.total) * 1000) / 10 : 0 }));
    out.sort((a, b) => a.rate - b.rate);
    return H.list(out, req);
  });

  /** Daily school-wide totals for the dashboard. */
  router.get('/api/attendance/daily', (req) => {
    auth.requireAuth(req);
    const schoolId = H.int(req.query.school_id) || H.currentSchool(db, req);
    const rows = db.all(`SELECT a.school_date,
        COUNT(*) AS total,
        SUM(CASE WHEN c.short_name = 'P' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN c.short_name = 'A' OR c.short_name = 'EA' THEN 1 ELSE 0 END) AS absent,
        SUM(CASE WHEN c.short_name IN ('T','UT','ET') THEN 1 ELSE 0 END) AS tardy
      FROM attendance_day a LEFT JOIN attendance_codes c ON c.id = a.attendance_code
      WHERE a.school_id = ? GROUP BY a.school_date ORDER BY a.school_date DESC LIMIT 30`, [schoolId]);
    return H.list(rows.reverse().map((r) => ({ ...r, rate: r.total ? Math.round((r.present / r.total) * 1000) / 10 : 0 })), req);
  });

  // ------------------------------------------------------------ calendar
  router.get('/api/attendance/calendar', (req) => {
    auth.requireAuth(req);
    const schoolId = H.int(req.query.school_id) || H.currentSchool(db, req);
    return H.list(db.all('SELECT * FROM attendance_calendar WHERE school_id = ? ORDER BY school_date', [schoolId]), req);
  });

  router.post('/api/attendance/calendar', (req) => {
    auth.requireProfile('admin')(req);
    H.requireBody(req, ['school_date']);
    db.run('INSERT OR REPLACE INTO attendance_calendar (school_id, school_date, minutes, is_school_day) VALUES (?,?,?,?)',
      [H.int(req.body.school_id) || H.currentSchool(db, req), req.body.school_date, H.int(req.body.minutes, 360), H.yes(req.body.is_school_day) ? 1 : 0]);
    return H.done('Calendar updated');
  });
};

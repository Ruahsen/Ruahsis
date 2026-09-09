'use strict';
/** Students: roster, profile, enrollment, contacts, medical, notes, schedule, grades, attendance. */
const { HttpError } = require('../lib/router');
const { buildUpdate, buildInsert, paging, searchClause } = require('../lib/db');
const H = require('./helpers');

const STUDENT_COLS = ['student_id', 'alt_id', 'first_name', 'middle_name', 'last_name', 'preferred_name', 'name_suffix',
  'gender', 'birthdate', 'grade_level', 'school_id', 'email', 'phone', 'address', 'city', 'state', 'zip',
  'ethnicity', 'language', 'is_active', 'enrollment_date'];

function fullName(s) {
  return [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ');
}

module.exports = function (router, db, auth, ctx) {
  const canView = auth.requireProfile('admin', 'teacher', 'parent', 'student');

  /** Build the WHERE clause honouring search + filters + profile-scoped visibility. */
  function scope(req) {
    const where = [], params = [];
    const s = searchClause(req, ['s.first_name', 's.last_name', 's.student_id', 's.alt_id', 's.email', 's.grade_level']);
    if (s.clause) { where.push(s.clause); params.push(...s.params); }
    const f = req.query.filter || {};
    if (f.grade_level) { where.push('s.grade_level = ?'); params.push(f.grade_level); }
    if (f.gender) { where.push('s.gender = ?'); params.push(f.gender); }
    if (f.school_id) { where.push('s.school_id = ?'); params.push(H.int(f.school_id)); }
    if (f.is_active !== undefined && f.is_active !== '') { where.push('s.is_active = ?'); params.push(H.yes(f.is_active) ? 1 : 0); }
    if (f.course_period_id) {
      where.push('s.id IN (SELECT student_id FROM schedule WHERE course_period_id = ?)');
      params.push(H.int(f.course_period_id));
    }
    const vis = auth.visibleStudentIds(db, req.user);
    if (vis !== null) {
      where.push(vis.length ? `s.id IN (${vis.map(() => '?').join(',')})` : 's.id = 0');
      params.push(...vis);
    }
    return { clause: where.length ? ' WHERE ' + where.join(' AND ') : '', params };
  }

  // ---------------------------------------------------------------- roster
  router.get('/api/students', (req) => {
    canView(req);
    const { limit, offset, orderBy } = paging(req, 's.last_name ASC, s.first_name ASC');
    const sc = scope(req);
    const total = db.count('SELECT COUNT(*) c FROM students s' + sc.clause, sc.params);
    const rows = db.all(
      `SELECT s.*, (SELECT COUNT(*) FROM schedule sc WHERE sc.student_id = s.id) AS scheduled_courses
         FROM students s ${sc.clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...sc.params, limit, offset]
    );
    for (const r of rows) r.full_name = fullName(r);
    return H.list(rows, req, total);
  });

  // ---------------------------------------------------------------- profile
  router.get('/api/students/:id', (req) => {
    canView(req);
    const id = H.requireId(req);
    auth.assertStudentVisible(db, req.user, id);
    const student = db.get('SELECT * FROM students WHERE id = ?', [id]);
    if (!student) throw new HttpError(404, 'Student not found');
    student.full_name = fullName(student);
    student.age = student.birthdate
      ? Math.floor((Date.now() - new Date(student.birthdate).getTime()) / 31557600000) : null;

    const schoolYearId = H.currentSchoolYear(db, req);
    return {
      ok: true,
      student,
      enrollment: db.all(`SELECT e.*, sy.title AS school_year FROM student_enrollment e
        LEFT JOIN school_years sy ON sy.id = e.school_year_id WHERE e.student_id = ? ORDER BY e.start_date DESC`, [id]),
      contacts: db.all(`SELECT j.*, p.first_name, p.middle_name, p.last_name, p.home_phone, p.cell_phone, p.email, p.address, p.city, p.state, p.zip
        FROM students_join_people j JOIN staff p ON p.id = j.person_id WHERE j.student_id = ?`, [id]),
      medical: db.get('SELECT * FROM student_medical WHERE student_id = ?', [id]),
      notes: db.all(`SELECT n.*, st.last_name AS staff_last_name, st.first_name AS staff_first_name
        FROM student_notes n LEFT JOIN staff st ON st.id = n.staff_id WHERE n.student_id = ? ORDER BY n.note_date DESC`, [id]),
      schedule: db.all(`SELECT sc.id AS schedule_id, cp.id AS course_period_id, cp.title, cp.short_name, cp.room,
          c.title AS course_title, p.title AS period_title, p.short_name AS period, p.start_time, p.end_time,
          (st.first_name || ' ' || st.last_name) AS teacher
        FROM schedule sc
        JOIN course_periods cp ON cp.id = sc.course_period_id
        JOIN courses c ON c.id = cp.course_id
        LEFT JOIN periods p ON p.id = cp.period_id
        LEFT JOIN staff st ON st.id = cp.teacher_id
        WHERE sc.student_id = ? AND (cp.school_year_id = ? OR cp.school_year_id IS NULL)
        ORDER BY p.sort_order`, [id, schoolYearId]),
      schoolYearId
    };
  });

  router.post('/api/students', (req) => {
    auth.requireProfile('admin')(req);
    H.requireBody(req, ['first_name', 'last_name']);
    const body = { ...req.body };
    if (!body.student_id) {
      const n = db.count('SELECT COUNT(*) c FROM students') + 1000;
      body.student_id = 'S' + String(n).padStart(4, '0');
    }
    if (db.get('SELECT id FROM students WHERE student_id = ?', [body.student_id])) throw new HttpError(409, 'Student ID already exists: ' + body.student_id);
    if (!body.school_id) body.school_id = H.currentSchool(db, req);
    if (!body.enrollment_date) body.enrollment_date = new Date().toISOString().slice(0, 10);
    const ins = buildInsert('students', { ...body, created_at: Date.now(), updated_at: Date.now() },
      STUDENT_COLS.concat(['created_at', 'updated_at']));
    const id = db.run(ins.sql, ins.params).lastInsertRowid;

    const syId = H.currentSchoolYear(db, req);
    if (syId && body.school_id) {
      db.run(`INSERT INTO student_enrollment (student_id, school_id, school_year_id, grade_level, start_date, enrollment_code)
        VALUES (?,?,?,?,?,?)`, [id, body.school_id, syId, body.grade_level || null, body.enrollment_date, 'NEW']);
    }
    ctx.logActivity(req, 'create', 'student #' + id);
    return H.one(db.get('SELECT * FROM students WHERE id = ?', [id]), 'student');
  });

  router.put('/api/students/:id', (req) => {
    auth.requireProfile('admin')(req);
    const id = H.requireId(req);
    const u = buildUpdate('students', id, req.body, STUDENT_COLS);
    if (u) db.run(u.sql, u.params);
    ctx.logActivity(req, 'update', 'student #' + id);
    return H.one(db.get('SELECT * FROM students WHERE id = ?', [id]), 'student');
  });

  router.del('/api/students/:id', (req) => {
    auth.requireProfile('admin')(req);
    const id = H.requireId(req);
    db.run('DELETE FROM students WHERE id = ?', [id]);
    ctx.logActivity(req, 'delete', 'student #' + id);
    return H.done('Student deleted');
  });

  // ---------------------------------------------------------------- enrollment
  router.get('/api/students/:id/enrollment', (req) => {
    canView(req); const id = H.requireId(req);
    return H.list(db.all(`SELECT e.*, sy.title AS school_year FROM student_enrollment e
      LEFT JOIN school_years sy ON sy.id = e.school_year_id WHERE e.student_id = ? ORDER BY e.start_date DESC`, [id]), req);
  });
  router.post('/api/students/:id/enrollment', (req) => {
    auth.requireProfile('admin')(req);
    const id = H.requireId(req);
    const ins = buildInsert('student_enrollment', {
      ...req.body, student_id: id,
      school_id: req.body.school_id || H.currentSchool(db, req),
      school_year_id: req.body.school_year_id || H.currentSchoolYear(db, req)
    }, ['student_id', 'school_id', 'school_year_id', 'grade_level', 'start_date', 'end_date', 'enrollment_code', 'drop_code', 'calendar_id', 'next_school', 'comment']);
    const eid = db.run(ins.sql, ins.params).lastInsertRowid;
    return H.one(db.get('SELECT * FROM student_enrollment WHERE id = ?', [eid]), 'enrollment');
  });
  router.put('/api/students/:id/enrollment/:enrollmentId', (req) => {
    auth.requireProfile('admin')(req);
    const eid = H.int(req.params.enrollmentId);
    const u = buildUpdate('student_enrollment', eid, req.body,
      ['school_id', 'school_year_id', 'grade_level', 'start_date', 'end_date', 'enrollment_code', 'drop_code', 'calendar_id', 'next_school', 'comment'], { stamp: false });
    if (u) db.run(u.sql, u.params);
    return H.one(db.get('SELECT * FROM student_enrollment WHERE id = ?', [eid]), 'enrollment');
  });
  router.del('/api/students/:id/enrollment/:enrollmentId', (req) => {
    auth.requireProfile('admin')(req);
    db.run('DELETE FROM student_enrollment WHERE id = ?', [H.int(req.params.enrollmentId)]);
    return H.done('Enrollment record deleted');
  });
  /** Drop / withdraw: sets end_date + drop code and deactivates the student. */
  router.post('/api/students/:id/drop', (req) => {
    auth.requireProfile('admin')(req);
    const id = H.requireId(req);
    const syId = H.currentSchoolYear(db, req);
    db.run(`UPDATE student_enrollment SET end_date = ?, drop_code = ? WHERE student_id = ? AND school_year_id = ? AND end_date IS NULL`,
      [req.body.end_date || new Date().toISOString().slice(0, 10), req.body.drop_code || 'TROUT', id, syId]);
    db.run('UPDATE students SET is_active = 0 WHERE id = ?', [id]);
    return H.done('Student dropped');
  });

  // ---------------------------------------------------------------- contacts
  router.post('/api/students/:id/contacts', (req) => {
    auth.requireProfile('admin')(req);
    const id = H.requireId(req);
    H.requireBody(req, ['first_name', 'last_name']);
    let personId = H.int(req.body.person_id);
    if (!personId) {
      const i = buildInsert('staff', {
        first_name: req.body.first_name, middle_name: req.body.middle_name, last_name: req.body.last_name,
        profile: 'parent', profile_id: 0, home_phone: req.body.home_phone, cell_phone: req.body.cell_phone,
        email: req.body.email, address: req.body.address, city: req.body.city, state: req.body.state, zip: req.body.zip,
        school_id: H.currentSchool(db, req), is_active: 1, created_at: Date.now(), updated_at: Date.now()
      }, ['first_name', 'middle_name', 'last_name', 'profile', 'profile_id', 'home_phone', 'cell_phone', 'email', 'address', 'city', 'state', 'zip', 'school_id', 'is_active', 'created_at', 'updated_at']);
      personId = db.run(i.sql, i.params).lastInsertRowid;
    }
    db.run('INSERT OR IGNORE INTO students_join_people (student_id, person_id, relationship, is_emergency, is_custodial) VALUES (?,?,?,?,?)',
      [id, personId, req.body.relationship || 'Guardian', H.yes(req.body.is_emergency) ? 1 : 0, H.yes(req.body.is_custodial) ? 1 : 0]);
    return H.done('Contact added', { personId });
  });
  router.put('/api/students/:id/contacts/:linkId', (req) => {
    auth.requireProfile('admin')(req);
    const linkId = H.int(req.params.linkId);
    const u = buildUpdate('students_join_people', linkId, req.body, ['relationship', 'is_emergency', 'is_custodial'], { stamp: false });
    if (u) db.run(u.sql, u.params);
    // allow editing person identity fields too
    const link = db.get('SELECT person_id FROM students_join_people WHERE id = ?', [linkId]);
    if (link) {
      const pu = buildUpdate('staff', link.person_id, req.body, ['first_name', 'middle_name', 'last_name', 'home_phone', 'cell_phone', 'email']);
      if (pu) db.run(pu.sql, pu.params);
      if (req.body.password && req.body.username) {
        db.run('UPDATE staff SET username = ?, password = ? WHERE id = ?', [req.body.username, require('../lib/auth').hashPassword(req.body.password), link.person_id]);
      }
    }
    return H.done('Contact updated');
  });
  router.del('/api/students/:id/contacts/:linkId', (req) => {
    auth.requireProfile('admin')(req);
    const link = db.get('SELECT person_id FROM students_join_people WHERE id = ?', [H.int(req.params.linkId)]);
    db.run('DELETE FROM students_join_people WHERE id = ?', [H.int(req.params.linkId)]);
    if (link) db.run('DELETE FROM staff WHERE id = ? AND profile = ? AND username IS NULL', [link.person_id, 'parent']);
    return H.done('Contact removed');
  });

  // ---------------------------------------------------------------- medical
  router.put('/api/students/:id/medical', (req) => {
    auth.requireProfile('admin')(req);
    const id = H.requireId(req);
    const exists = db.get('SELECT id FROM student_medical WHERE student_id = ?', [id]);
    const cols = ['physician', 'physician_phone', 'insurance', 'policy_number', 'allergies', 'medications', 'immunizations', 'notes', 'date_updated'];
    if (!exists) {
      const i = buildInsert('student_medical', { ...req.body, student_id: id, date_updated: new Date().toISOString().slice(0, 10) }, ['student_id'].concat(cols));
      db.run(i.sql, i.params);
    } else {
      const u = buildUpdate('student_medical', exists.id, { ...req.body, date_updated: new Date().toISOString().slice(0, 10) }, cols, { stamp: false });
      if (u) db.run(u.sql, u.params);
    }
    return H.one(db.get('SELECT * FROM student_medical WHERE student_id = ?', [id]), 'medical');
  });

  // ---------------------------------------------------------------- notes
  router.post('/api/students/:id/notes', (req) => {
    auth.requireProfile('admin', 'teacher')(req);
    const id = H.requireId(req);
    H.requireBody(req, ['note']);
    const nid = db.run('INSERT INTO student_notes (student_id, staff_id, school_id, note_date, category, title, note, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, req.user ? req.user.id : null, H.currentSchool(db, req), req.body.note_date || new Date().toISOString().slice(0, 10),
        req.body.category || 'General', req.body.title || null, req.body.note, Date.now()]).lastInsertRowid;
    return H.one(db.get('SELECT * FROM student_notes WHERE id = ?', [nid]), 'note');
  });
  router.del('/api/students/:id/notes/:noteId', (req) => {
    auth.requireProfile('admin', 'teacher')(req);
    db.run('DELETE FROM student_notes WHERE id = ?', [H.int(req.params.noteId)]);
    return H.done('Note deleted');
  });

  // ---------------------------------------------------------------- schedule / grades / attendance (read)
  router.get('/api/students/:id/schedule', (req) => {
    canView(req); const id = H.requireId(req);
    auth.assertStudentVisible(db, req.user, id);
    const syId = H.int(req.query.school_year_id) || H.currentSchoolYear(db, req);
    return H.list(db.all(`SELECT sc.id AS schedule_id, sc.course_period_id, cp.title, cp.short_name, cp.room, cp.credit_attempted,
        c.title AS course_title, p.title AS period_title, p.short_name AS period, p.sort_order AS period_sort, p.start_time, p.end_time,
        (st.first_name || ' ' || st.last_name) AS teacher, st.id AS teacher_id
      FROM schedule sc
      JOIN course_periods cp ON cp.id = sc.course_period_id
      JOIN courses c ON c.id = cp.course_id
      LEFT JOIN periods p ON p.id = cp.period_id
      LEFT JOIN staff st ON st.id = cp.teacher_id
      WHERE sc.student_id = ? AND (cp.school_year_id = ? OR cp.school_year_id IS NULL)
      ORDER BY p.sort_order`, [id, syId]), req);
  });

  router.get('/api/students/:id/grades', (req) => {
    canView(req); const id = H.requireId(req);
    auth.assertStudentVisible(db, req.user, id);
    const mpId = H.int(req.query.mp_id) || H.currentMarkingPeriod(db, H.currentSchoolYear(db, req));
    const courses = db.all(`SELECT rcg.*, cp.title, cp.short_name, cp.room, cp.credit_attempted, c.title AS course_title,
        (st.first_name || ' ' || st.last_name) AS teacher
      FROM student_report_card_grades rcg
      JOIN course_periods cp ON cp.id = rcg.course_period_id
      JOIN courses c ON c.id = cp.course_id
      LEFT JOIN staff st ON st.id = cp.teacher_id
      WHERE rcg.student_id = ? AND rcg.mp_id = ? ORDER BY c.title`, [id, mpId]);
    let gpSum = 0, credSum = 0;
    for (const c of courses) { gpSum += (c.weighted_gp || 0); credSum += (c.credit_attempted || 0); }
    return { ok: true, markingPeriodId: mpId, courses, gpa: credSum ? Math.round((gpSum / credSum) * 100) / 100 : 0, credits: credSum };
  });

  router.get('/api/students/:id/attendance', (req) => {
    canView(req); const id = H.requireId(req);
    auth.assertStudentVisible(db, req.user, id);
    const from = req.query.from || null, to = req.query.to || null;
    const params = [id], where = ['a.student_id = ?'];
    if (from) { where.push('a.school_date >= ?'); params.push(from); }
    if (to) { where.push('a.school_date <= ?'); params.push(to); }
    const rows = db.all(`SELECT a.*, c.title AS code_title, c.short_name AS code, c.type AS code_type
      FROM attendance_day a LEFT JOIN attendance_codes c ON c.id = a.attendance_code
      WHERE ${where.join(' AND ')} ORDER BY a.school_date DESC LIMIT 400`, params);
    const summary = {
      present: rows.filter((r) => r.code === 'P').length,
      absent: rows.filter((r) => r.code === 'A').length,
      excused: rows.filter((r) => r.code === 'EA').length,
      tardy: rows.filter((r) => r.code === 'T' || r.code === 'UT' || r.code === 'ET').length,
      total: rows.length
    };
    summary.rate = summary.total ? Math.round((summary.present / summary.total) * 1000) / 10 : 0;
    return { ok: true, records: rows, summary };
  });

  router.get('/api/students/:id/discipline', (req) => {
    canView(req); const id = H.requireId(req);
    auth.assertStudentVisible(db, req.user, id);
    return H.list(db.all(`SELECT d.*, cat.title AS category, act.title AS action, (st.first_name || ' ' || st.last_name) AS staff
      FROM discipline_referrals d
      LEFT JOIN discipline_categories cat ON cat.id = d.category_id
      LEFT JOIN discipline_actions act ON act.id = d.action_id
      LEFT JOIN staff st ON st.id = d.staff_id
      WHERE d.student_id = ? ORDER BY d.event_date DESC`, [id]), req);
  });

  router.get('/api/students/:id/fees', (req) => {
    canView(req); const id = H.requireId(req);
    auth.assertStudentVisible(db, req.user, id);
    return H.list(db.all(`SELECT f.*, (SELECT COALESCE(SUM(p.amount),0) FROM student_payments p WHERE p.fee_id = f.id) AS paid
      FROM student_fees f WHERE f.student_id = ? ORDER BY f.due_date`, [id]), req);
  });
};

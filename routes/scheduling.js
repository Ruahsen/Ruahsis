'use strict';
/** Courses, course periods (sections), master schedule and student scheduling. */
const { HttpError } = require('../lib/router');
const { buildUpdate, buildInsert, paging, searchClause } = require('../lib/db');
const H = require('./helpers');

const COURSE_COLS = ['school_id', 'subject_id', 'title', 'short_name', 'grade_level', 'credit_hours', 'description', 'is_active'];
const CP_COLS = ['course_id', 'school_id', 'school_year_id', 'teacher_id', 'period_id', 'mp_id', 'grade_scale_id',
  'title', 'short_name', 'room', 'total_seats', 'credit_attempted', 'credit_earned', 'does_attendance', 'does_honor_roll', 'is_active'];

module.exports = function (router, db, auth, ctx) {
  const staffOnly = auth.requireProfile('admin', 'teacher');

  // ------------------------------------------------------------------ courses
  router.get('/api/courses', (req) => {
    auth.requireAuth(req);
    const { limit, offset, orderBy } = paging(req, 'c.title ASC');
    const where = [], params = [];
    const s = searchClause(req, ['c.title', 'c.short_name', 'c.grade_level']);
    if (s.clause) { where.push(s.clause); params.push(...s.params); }
    const f = req.query.filter || {};
    if (f.subject_id) { where.push('c.subject_id = ?'); params.push(H.int(f.subject_id)); }
    if (f.school_id) { where.push('c.school_id = ?'); params.push(H.int(f.school_id)); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const total = db.count('SELECT COUNT(*) c FROM courses c' + w, params);
    const rows = db.all(`SELECT c.*, s.title AS subject,
        (SELECT COUNT(*) FROM course_periods cp WHERE cp.course_id = c.id) AS sections
      FROM courses c LEFT JOIN course_subjects s ON s.id = c.subject_id ${w} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, offset]);
    return H.list(rows, req, total);
  });

  router.resource('/api/courses', {
    get: (req) => {
      auth.requireAuth(req);
      const id = H.requireId(req);
      const course = db.get('SELECT c.*, s.title AS subject FROM courses c LEFT JOIN course_subjects s ON s.id = c.subject_id WHERE c.id = ?', [id]);
      if (!course) throw new HttpError(404, 'Course not found');
      course.periods = db.all(`SELECT cp.*, p.short_name AS period, p.title AS period_title, p.start_time, p.end_time,
          (st.first_name || ' ' || st.last_name) AS teacher, cp.filled_seats
        FROM course_periods cp LEFT JOIN periods p ON p.id = cp.period_id
        LEFT JOIN staff st ON st.id = cp.teacher_id WHERE cp.course_id = ? ORDER BY p.sort_order`, [id]);
      return { ok: true, course };
    },
    create: (req) => {
      auth.requireProfile('admin')(req);
      H.requireBody(req, ['title']);
      const i = buildInsert('courses', { ...req.body, school_id: req.body.school_id || H.currentSchool(db, req) }, COURSE_COLS);
      const id = db.run(i.sql, i.params).lastInsertRowid;
      return H.one(db.get('SELECT * FROM courses WHERE id = ?', [id]), 'course');
    },
    update: (req) => {
      auth.requireProfile('admin')(req);
      const id = H.requireId(req);
      const u = buildUpdate('courses', id, req.body, COURSE_COLS, { stamp: false });
      if (u) db.run(u.sql, u.params);
      return H.one(db.get('SELECT * FROM courses WHERE id = ?', [id]), 'course');
    },
    remove: (req) => {
      auth.requireProfile('admin')(req);
      db.run('DELETE FROM courses WHERE id = ?', [H.requireId(req)]);
      return H.done('Course deleted');
    }
  });

  // ------------------------------------------------------------------ course periods
  router.get('/api/course-periods', (req) => {
    auth.requireAuth(req);
    const where = [], params = [];
    const syId = H.int(req.query.school_year_id) || H.currentSchoolYear(db, req);
    where.push('(cp.school_year_id = ? OR cp.school_year_id IS NULL)'); params.push(syId);
    const f = req.query.filter || {};
    if (f.teacher_id) { where.push('cp.teacher_id = ?'); params.push(H.int(f.teacher_id)); }
    if (f.course_id) { where.push('cp.course_id = ?'); params.push(H.int(f.course_id)); }
    if (f.period_id) { where.push('cp.period_id = ?'); params.push(H.int(f.period_id)); }
    if (f.school_id) { where.push('cp.school_id = ?'); params.push(H.int(f.school_id)); }
    if (req.query.search) {
      where.push('(cp.title LIKE ? OR cp.short_name LIKE ? OR c.title LIKE ?)');
      const like = '%' + req.query.search + '%';
      params.push(like, like, like);
    }
    // teachers only see their own sections
    if (req.user && req.user.profile === 'teacher') { where.push('cp.teacher_id = ?'); params.push(req.user.id); }
    const w = ' WHERE ' + where.join(' AND ');
    const rows = db.all(`SELECT cp.*, c.title AS course_title, c.short_name AS course_short,
        p.short_name AS period, p.title AS period_title, p.sort_order AS period_sort, p.start_time, p.end_time,
        (st.first_name || ' ' || st.last_name) AS teacher, st.id AS teacher_id,
        (SELECT COUNT(*) FROM schedule s WHERE s.course_period_id = cp.id) AS enrolled
      FROM course_periods cp
      JOIN courses c ON c.id = cp.course_id
      LEFT JOIN periods p ON p.id = cp.period_id
      LEFT JOIN staff st ON st.id = cp.teacher_id
      ${w} ORDER BY p.sort_order, c.title`, params);
    return H.list(rows, req);
  });

  router.get('/api/course-periods/:id', (req) => {
    auth.requireAuth(req);
    const id = H.requireId(req);
    const cp = db.get(`SELECT cp.*, c.title AS course_title, c.short_name AS course_short,
        p.short_name AS period, p.title AS period_title, p.start_time, p.end_time,
        (st.first_name || ' ' || st.last_name) AS teacher
      FROM course_periods cp JOIN courses c ON c.id = cp.course_id
      LEFT JOIN periods p ON p.id = cp.period_id LEFT JOIN staff st ON st.id = cp.teacher_id
      WHERE cp.id = ?`, [id]);
    if (!cp) throw new HttpError(404, 'Course period not found');
    cp.enrolled = db.count('SELECT COUNT(*) c FROM schedule WHERE course_period_id = ?', [id]);
    return { ok: true, coursePeriod: cp };
  });

  router.post('/api/course-periods', (req) => {
    auth.requireProfile('admin')(req);
    H.requireBody(req, ['course_id', 'title']);
    const body = {
      ...req.body,
      school_id: req.body.school_id || H.currentSchool(db, req),
      school_year_id: req.body.school_year_id || H.currentSchoolYear(db, req)
    };
    const i = buildInsert('course_periods', body, CP_COLS);
    const id = db.run(i.sql, i.params).lastInsertRowid;
    return H.one(db.get('SELECT * FROM course_periods WHERE id = ?', [id]), 'coursePeriod');
  });

  router.put('/api/course-periods/:id', (req) => {
    const id = H.requireId(req);
    if (req.user.profile !== 'admin') auth.requireCoursePeriodAccess(db, req, id);
    const u = buildUpdate('course_periods', id, req.body, CP_COLS, { stamp: false });
    if (u) db.run(u.sql, u.params);
    return H.one(db.get('SELECT * FROM course_periods WHERE id = ?', [id]), 'coursePeriod');
  });

  router.del('/api/course-periods/:id', (req) => {
    auth.requireProfile('admin')(req);
    db.run('DELETE FROM course_periods WHERE id = ?', [H.requireId(req)]);
    return H.done('Course period deleted');
  });

  // ------------------------------------------------------------------ roster
  router.get('/api/course-periods/:id/roster', (req) => {
    auth.requireAuth(req);
    const id = H.requireId(req);
    const rows = db.all(`SELECT s.id, s.student_id, s.first_name, s.middle_name, s.last_name, s.grade_level,
        s.gender, s.email, s.phone, sc.id AS schedule_id, sc.start_date, sc.end_date
      FROM schedule sc JOIN students s ON s.id = sc.student_id
      WHERE sc.course_period_id = ? ORDER BY s.last_name, s.first_name`, [id]);
    for (const r of rows) r.full_name = [r.first_name, r.last_name].filter(Boolean).join(' ');
    return H.list(rows, req);
  });

  /** Enrol a student into a section (with conflict + capacity checks). */
  router.post('/api/course-periods/:id/enroll', (req) => {
    staffOnly(req);
    const cpId = H.requireId(req);
    const studentId = H.int(req.body.student_id);
    if (!studentId) throw new HttpError(400, 'student_id is required');
    const cp = db.get('SELECT * FROM course_periods WHERE id = ?', [cpId]);
    if (!cp) throw new HttpError(404, 'Course period not found');
    const enrolled = db.count('SELECT COUNT(*) c FROM schedule WHERE course_period_id = ?', [cpId]);
    if (enrolled >= cp.total_seats) throw new HttpError(409, 'Section is full (' + enrolled + '/' + cp.total_seats + ')');
    if (db.get('SELECT id FROM schedule WHERE student_id = ? AND course_period_id = ?', [studentId, cpId]))
      throw new HttpError(409, 'Student is already enrolled in this section');

    const conflict = db.get(`SELECT cp.title, p.short_name AS period FROM schedule s
      JOIN course_periods cp ON cp.id = s.course_period_id
      LEFT JOIN periods p ON p.id = cp.period_id
      WHERE s.student_id = ? AND cp.period_id = ? AND cp.school_year_id = ?`,
      [studentId, cp.period_id, cp.school_year_id]);
    if (conflict && !H.yes(req.body.force)) {
      throw new HttpError(409, `Schedule conflict in ${conflict.period}: ${conflict.title}`);
    }
    db.run('INSERT INTO schedule (student_id, course_period_id, mp_id, start_date, end_date, seats) VALUES (?,?,?,?,?,?)',
      [studentId, cpId, cp.mp_id, req.body.start_date || null, null, 1]);
    H.recalcSeats(db, cpId);
    ctx.logActivity(req, 'update', 'scheduled student #' + studentId + ' into cp #' + cpId);
    return H.done('Student enrolled');
  });

  router.del('/api/course-periods/:id/enroll/:studentId', (req) => {
    staffOnly(req);
    const cpId = H.requireId(req);
    const studentId = H.int(req.params.studentId);
    db.run('DELETE FROM schedule WHERE student_id = ? AND course_period_id = ?', [studentId, cpId]);
    db.run('DELETE FROM gradebook_grades WHERE student_id = ? AND assignment_id IN (SELECT id FROM gradebook_assignments WHERE course_period_id = ?)', [studentId, cpId]);
    db.run('DELETE FROM attendance_period WHERE student_id = ? AND course_period_id = ?', [studentId, cpId]);
    H.recalcSeats(db, cpId);
    return H.done('Student un-enrolled');
  });

  // ------------------------------------------------------------------ student schedule edits
  router.post('/api/students/:id/schedule', (req) => {
    staffOnly(req);
    const studentId = H.requireId(req);
    const cpId = H.int(req.body.course_period_id);
    if (!cpId) throw new HttpError(400, 'course_period_id is required');
    const cp = db.get('SELECT * FROM course_periods WHERE id = ?', [cpId]);
    if (!cp) throw new HttpError(404, 'Course period not found');
    if (db.get('SELECT id FROM schedule WHERE student_id = ? AND course_period_id = ?', [studentId, cpId]))
      throw new HttpError(409, 'Already enrolled');
    const conflict = db.get(`SELECT cp.title, p.short_name AS period FROM schedule s
      JOIN course_periods cp ON cp.id = s.course_period_id LEFT JOIN periods p ON p.id = cp.period_id
      WHERE s.student_id = ? AND cp.period_id = ?`, [studentId, cp.period_id]);
    if (conflict && !H.yes(req.body.force)) throw new HttpError(409, `Conflict in ${conflict.period}: ${conflict.title}`);
    const enrolled = db.count('SELECT COUNT(*) c FROM schedule WHERE course_period_id = ?', [cpId]);
    if (enrolled >= cp.total_seats) throw new HttpError(409, 'Section full');
    const sid = db.run('INSERT INTO schedule (student_id, course_period_id, mp_id, start_date, end_date, seats) VALUES (?,?,?,?,?,?)',
      [studentId, cpId, cp.mp_id, req.body.start_date || null, null, 1]).lastInsertRowid;
    H.recalcSeats(db, cpId);
    return H.done('Course added to schedule', { scheduleId: sid });
  });

  router.del('/api/schedule/:id', (req) => {
    staffOnly(req);
    const id = H.requireId(req);
    const s = db.get('SELECT course_period_id FROM schedule WHERE id = ?', [id]);
    db.run('DELETE FROM schedule WHERE id = ?', [id]);
    if (s) H.recalcSeats(db, s.course_period_id);
    return H.done('Course removed from schedule');
  });

  /** Unscheduled students + open seats report. */
  router.get('/api/scheduling/unscheduled', (req) => {
    staffOnly(req);
    const syId = H.currentSchoolYear(db, req);
    return H.list(db.all(`SELECT s.id, s.student_id, s.first_name, s.last_name, s.grade_level
      FROM students s WHERE s.is_active = 1 AND s.id NOT IN (
        SELECT sc.student_id FROM schedule sc JOIN course_periods cp ON cp.id = sc.course_period_id
        WHERE cp.school_year_id = ?) ORDER BY s.last_name`, [syId]), req);
  });

  /** Master schedule grid: period x room. */
  router.get('/api/scheduling/master', (req) => {
    auth.requireAuth(req);
    const syId = H.int(req.query.school_year_id) || H.currentSchoolYear(db, req);
    const periods = db.all('SELECT * FROM periods WHERE school_id = ? ORDER BY sort_order', [H.currentSchool(db, req)]);
    const rows = db.all(`SELECT cp.id, cp.title, cp.short_name, cp.room, cp.filled_seats, cp.total_seats,
        cp.period_id, c.title AS course_title, (st.last_name || ', ' || st.first_name) AS teacher
      FROM course_periods cp JOIN courses c ON c.id = cp.course_id
      LEFT JOIN staff st ON st.id = cp.teacher_id
      WHERE cp.school_year_id = ? ORDER BY c.title`, [syId]);
    if (req.user && req.user.profile === 'teacher') {
      const mine = rows.filter((r) => r.teacher && r.teacher.includes(req.user.lastName || '###'));
      return { ok: true, periods, rows: mine };
    }
    return { ok: true, periods, rows };
  });
};

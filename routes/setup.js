'use strict';
/** School setup: schools, years, marking periods, periods, grade levels, grades scales, codes. */
const { HttpError } = require('../lib/router');
const { buildUpdate, buildInsert, paging, searchClause } = require('../lib/db');
const H = require('./helpers');

module.exports = function (router, db, auth, ctx) {
  const adminOnly = auth.requireProfile('admin');

  // ------------------------------------------------------------ bootstrap
  router.get('/api/setup/bootstrap', (req) => {
    const u = auth.requireAuth(req);
    const schoolId = H.int(req.query.school_id) || H.currentSchool(db, req);
    const schoolYearId = H.currentSchoolYear(db, req);
    return {
      ok: true,
      user: u,
      schoolId,
      schoolYearId,
      markingPeriodId: H.currentMarkingPeriod(db, schoolYearId),
      schools: db.all('SELECT * FROM schools ORDER BY title'),
      schoolYears: db.all('SELECT * FROM school_years ORDER BY start_date DESC'),
      markingPeriods: db.all('SELECT * FROM marking_periods WHERE school_year_id = ? ORDER BY sort_order', [schoolYearId]),
      periods: db.all('SELECT * FROM periods WHERE school_id = ? ORDER BY sort_order', [schoolId]),
      gradeLevels: db.all('SELECT * FROM grade_levels WHERE school_id = ? ORDER BY sort_order', [schoolId]),
      gradeScales: db.all('SELECT * FROM grade_scales WHERE school_id = ? ORDER BY sort_order', [schoolId]),
      subjects: db.all('SELECT * FROM course_subjects WHERE school_id = ? ORDER BY sort_order', [schoolId]),
      enrollmentCodes: db.all('SELECT * FROM enrollment_codes WHERE school_id = ? ORDER BY sort_order', [schoolId]),
      attendanceCodes: db.all('SELECT * FROM attendance_codes WHERE school_id = ? ORDER BY sort_order', [schoolId]),
      disciplineCategories: db.all('SELECT * FROM discipline_categories WHERE school_id = ? ORDER BY sort_order', [schoolId]),
      disciplineActions: db.all('SELECT * FROM discipline_actions WHERE school_id = ? ORDER BY sort_order', [schoolId])
    };
  });

  // ------------------------------------------------------------ schools
  const SCHOOL_COLS = ['title', 'short_name', 'address', 'city', 'state', 'zip', 'phone', 'principal', 'website'];
  router.get('/api/setup/schools', (req) => H.list(db.all('SELECT * FROM schools ORDER BY title'), req));
  router.post('/api/setup/schools', (req) => {
    adminOnly(req); H.requireBody(req, ['title']);
    const ins = buildInsert('schools', { ...req.body, created_at: Date.now() }, SCHOOL_COLS.concat('created_at'));
    const id = db.run(ins.sql, ins.params).lastInsertRowid;
    ctx.logActivity(req, 'create', 'school #' + id);
    return H.one(db.get('SELECT * FROM schools WHERE id = ?', [id]), 'school');
  });
  router.put('/api/setup/schools/:id', (req) => {
    adminOnly(req); const id = H.requireId(req);
    const u = buildUpdate('schools', id, req.body, SCHOOL_COLS, { stamp: false });
    if (u) db.run(u.sql, u.params);
    return H.one(db.get('SELECT * FROM schools WHERE id = ?', [id]), 'school');
  });
  router.del('/api/setup/schools/:id', (req) => {
    adminOnly(req); const id = H.requireId(req);
    db.run('DELETE FROM schools WHERE id = ?', [id]);
    return H.done('School deleted');
  });

  // ------------------------------------------------------------ school years
  const SY_COLS = ['school_id', 'title', 'short_name', 'start_date', 'end_date', 'is_current', 'sort_order'];
  router.get('/api/setup/school-years', (req) => {
    const where = [], params = [];
    if (req.query.school_id) { where.push('school_id = ?'); params.push(H.int(req.query.school_id)); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    return H.list(db.all('SELECT * FROM school_years' + w + ' ORDER BY start_date DESC', params), req);
  });
  router.post('/api/setup/school-years', (req) => {
    adminOnly(req); H.requireBody(req, ['title', 'start_date', 'end_date']);
    const ins = buildInsert('school_years', req.body, SY_COLS);
    const id = db.run(ins.sql, ins.params).lastInsertRowid;
    return H.one(db.get('SELECT * FROM school_years WHERE id = ?', [id]), 'schoolYear');
  });
  router.put('/api/setup/school-years/:id', (req) => {
    adminOnly(req); const id = H.requireId(req);
    const u = buildUpdate('school_years', id, req.body, SY_COLS, { stamp: false });
    if (u) db.run(u.sql, u.params);
    return H.one(db.get('SELECT * FROM school_years WHERE id = ?', [id]), 'schoolYear');
  });
  router.post('/api/setup/school-years/:id/activate', (req) => {
    adminOnly(req); const id = H.requireId(req);
    db.run('UPDATE school_years SET is_current = 0 WHERE is_current = 1');
    db.run('UPDATE school_years SET is_current = 1 WHERE id = ?', [id]);
    return H.done('School year activated');
  });
  router.del('/api/setup/school-years/:id', (req) => {
    adminOnly(req); db.run('DELETE FROM school_years WHERE id = ?', [H.requireId(req)]);
    return H.done('School year deleted');
  });

  // ------------------------------------------------------------ marking periods
  const MP_COLS = ['school_id', 'school_year_id', 'parent_id', 'mp_type', 'title', 'short_name', 'sort_order',
    'start_date', 'end_date', 'does_grades', 'does_comments', 'does_exam'];
  router.get('/api/setup/marking-periods', (req) => {
    const params = [], where = [];
    if (req.query.school_year_id) { where.push('school_year_id = ?'); params.push(H.int(req.query.school_year_id)); }
    if (req.query.mp_type) { where.push('mp_type = ?'); params.push(req.query.mp_type); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    return H.list(db.all('SELECT * FROM marking_periods' + w + ' ORDER BY sort_order, id', params), req);
  });
  router.resource('/api/setup/marking-periods', {
    create: (req) => { adminOnly(req); H.requireBody(req, ['title', 'mp_type']); const i = buildInsert('marking_periods', req.body, MP_COLS); const id = db.run(i.sql, i.params).lastInsertRowid; return H.one(db.get('SELECT * FROM marking_periods WHERE id = ?', [id]), 'markingPeriod'); },
    update: (req) => { adminOnly(req); const id = H.requireId(req); const u = buildUpdate('marking_periods', id, req.body, MP_COLS, { stamp: false }); if (u) db.run(u.sql, u.params); return H.one(db.get('SELECT * FROM marking_periods WHERE id = ?', [id]), 'markingPeriod'); },
    remove: (req) => { adminOnly(req); db.run('DELETE FROM marking_periods WHERE id = ?', [H.requireId(req)]); return H.done('Marking period deleted'); }
  });

  // ------------------------------------------------------------ periods
  const P_COLS = ['school_id', 'title', 'short_name', 'sort_order', 'start_time', 'end_time', 'length_min'];
  router.get('/api/setup/periods', (req) => {
    const params = [], where = [];
    if (req.query.school_id) { where.push('school_id = ?'); params.push(H.int(req.query.school_id)); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    return H.list(db.all('SELECT * FROM periods' + w + ' ORDER BY sort_order', params), req);
  });
  router.resource('/api/setup/periods', {
    create: (req) => { adminOnly(req); H.requireBody(req, ['title']); const i = buildInsert('periods', req.body, P_COLS); const id = db.run(i.sql, i.params).lastInsertRowid; return H.one(db.get('SELECT * FROM periods WHERE id = ?', [id]), 'period'); },
    update: (req) => { adminOnly(req); const id = H.requireId(req); const u = buildUpdate('periods', id, req.body, P_COLS, { stamp: false }); if (u) db.run(u.sql, u.params); return H.one(db.get('SELECT * FROM periods WHERE id = ?', [id]), 'period'); },
    remove: (req) => { adminOnly(req); db.run('DELETE FROM periods WHERE id = ?', [H.requireId(req)]); return H.done('Period deleted'); }
  });

  // ------------------------------------------------------------ grade levels
  const GL_COLS = ['school_id', 'title', 'short_name', 'sort_order', 'next_grade_id'];
  router.get('/api/setup/grade-levels', (req) => H.list(db.all('SELECT * FROM grade_levels ORDER BY sort_order'), req));
  router.resource('/api/setup/grade-levels', {
    create: (req) => { adminOnly(req); H.requireBody(req, ['title']); const i = buildInsert('grade_levels', req.body, GL_COLS); const id = db.run(i.sql, i.params).lastInsertRowid; return H.one(db.get('SELECT * FROM grade_levels WHERE id = ?', [id]), 'gradeLevel'); },
    update: (req) => { adminOnly(req); const id = H.requireId(req); const u = buildUpdate('grade_levels', id, req.body, GL_COLS, { stamp: false }); if (u) db.run(u.sql, u.params); return H.one(db.get('SELECT * FROM grade_levels WHERE id = ?', [id]), 'gradeLevel'); },
    remove: (req) => { adminOnly(req); db.run('DELETE FROM grade_levels WHERE id = ?', [H.requireId(req)]); return H.done('Grade level deleted'); }
  });

  // ------------------------------------------------------------ grade scales
  const GS_COLS = ['school_id', 'title', 'comment', 'hr_gpa', 'sort_order'];
  router.get('/api/setup/grade-scales', (req) => {
    const scales = db.all('SELECT * FROM grade_scales ORDER BY sort_order');
    for (const s of scales) s.breakdowns = db.all('SELECT * FROM grade_scale_breakdowns WHERE grade_scale_id = ? ORDER BY breakoff DESC', [s.id]);
    return H.list(scales, req);
  });
  router.post('/api/setup/grade-scales', (req) => {
    adminOnly(req); H.requireBody(req, ['title']);
    const i = buildInsert('grade_scales', req.body, GS_COLS);
    const id = db.run(i.sql, i.params).lastInsertRowid;
    for (const b of (req.body.breakdowns || [])) {
      db.run('INSERT INTO grade_scale_breakdowns (grade_scale_id, title, short_name, breakoff, gpa_value, sort_order) VALUES (?,?,?,?,?,?)',
        [id, b.title, b.short_name || b.title, b.breakoff, b.gpa_value, b.sort_order || 0]);
    }
    return H.one(db.get('SELECT * FROM grade_scales WHERE id = ?', [id]), 'gradeScale');
  });
  router.put('/api/setup/grade-scales/:id', (req) => {
    adminOnly(req); const id = H.requireId(req);
    const u = buildUpdate('grade_scales', id, req.body, GS_COLS, { stamp: false });
    if (u) db.run(u.sql, u.params);
    if (Array.isArray(req.body.breakdowns)) {
      db.run('DELETE FROM grade_scale_breakdowns WHERE grade_scale_id = ?', [id]);
      for (const b of req.body.breakdowns) {
        db.run('INSERT INTO grade_scale_breakdowns (grade_scale_id, title, short_name, breakoff, gpa_value, sort_order) VALUES (?,?,?,?,?,?)',
          [id, b.title, b.short_name || b.title, b.breakoff, b.gpa_value, b.sort_order || 0]);
      }
    }
    return H.one(db.get('SELECT * FROM grade_scales WHERE id = ?', [id]), 'gradeScale');
  });
  router.del('/api/setup/grade-scales/:id', (req) => {
    adminOnly(req); db.run('DELETE FROM grade_scales WHERE id = ?', [H.requireId(req)]);
    return H.done('Grade scale deleted');
  });

  // ------------------------------------------------------------ subjects
  const SUBJ_COLS = ['school_id', 'title', 'short_name', 'sort_order'];
  router.resource('/api/setup/subjects', {
    list: (req) => H.list(db.all('SELECT * FROM course_subjects ORDER BY sort_order'), req),
    create: (req) => { adminOnly(req); H.requireBody(req, ['title']); const i = buildInsert('course_subjects', req.body, SUBJ_COLS); const id = db.run(i.sql, i.params).lastInsertRowid; return H.one(db.get('SELECT * FROM course_subjects WHERE id = ?', [id]), 'subject'); },
    update: (req) => { adminOnly(req); const id = H.requireId(req); const u = buildUpdate('course_subjects', id, req.body, SUBJ_COLS, { stamp: false }); if (u) db.run(u.sql, u.params); return H.one(db.get('SELECT * FROM course_subjects WHERE id = ?', [id]), 'subject'); },
    remove: (req) => { adminOnly(req); db.run('DELETE FROM course_subjects WHERE id = ?', [H.requireId(req)]); return H.done('Subject deleted'); }
  });

  // ------------------------------------------------------------ enrollment codes
  const EC_COLS = ['school_id', 'title', 'short_name', 'type', 'sort_order'];
  router.resource('/api/setup/enrollment-codes', {
    list: (req) => H.list(db.all('SELECT * FROM enrollment_codes ORDER BY type, sort_order'), req),
    create: (req) => { adminOnly(req); H.requireBody(req, ['title', 'type']); const i = buildInsert('enrollment_codes', req.body, EC_COLS); const id = db.run(i.sql, i.params).lastInsertRowid; return H.one(db.get('SELECT * FROM enrollment_codes WHERE id = ?', [id]), 'code'); },
    update: (req) => { adminOnly(req); const id = H.requireId(req); const u = buildUpdate('enrollment_codes', id, req.body, EC_COLS, { stamp: false }); if (u) db.run(u.sql, u.params); return H.one(db.get('SELECT * FROM enrollment_codes WHERE id = ?', [id]), 'code'); },
    remove: (req) => { adminOnly(req); db.run('DELETE FROM enrollment_codes WHERE id = ?', [H.requireId(req)]); return H.done('Code deleted'); }
  });

  // ------------------------------------------------------------ attendance codes
  const AC_COLS = ['school_id', 'title', 'short_name', 'type', 'state_code', 'sort_order', 'is_default'];
  router.resource('/api/setup/attendance-codes', {
    list: (req) => H.list(db.all('SELECT * FROM attendance_codes ORDER BY sort_order'), req),
    create: (req) => { adminOnly(req); H.requireBody(req, ['title', 'short_name', 'type']); const i = buildInsert('attendance_codes', req.body, AC_COLS); const id = db.run(i.sql, i.params).lastInsertRowid; return H.one(db.get('SELECT * FROM attendance_codes WHERE id = ?', [id]), 'code'); },
    update: (req) => { adminOnly(req); const id = H.requireId(req); const u = buildUpdate('attendance_codes', id, req.body, AC_COLS, { stamp: false }); if (u) db.run(u.sql, u.params); return H.one(db.get('SELECT * FROM attendance_codes WHERE id = ?', [id]), 'code'); },
    remove: (req) => { adminOnly(req); db.run('DELETE FROM attendance_codes WHERE id = ?', [H.requireId(req)]); return H.done('Code deleted'); }
  });

  // ------------------------------------------------------------ discipline lists
  router.resource('/api/setup/discipline-categories', {
    list: (req) => H.list(db.all('SELECT * FROM discipline_categories ORDER BY sort_order'), req),
    create: (req) => { adminOnly(req); H.requireBody(req, ['title']); const i = buildInsert('discipline_categories', req.body, ['school_id', 'title', 'short_name', 'sort_order']); const id = db.run(i.sql, i.params).lastInsertRowid; return H.one(db.get('SELECT * FROM discipline_categories WHERE id = ?', [id]), 'category'); },
    remove: (req) => { adminOnly(req); db.run('DELETE FROM discipline_categories WHERE id = ?', [H.requireId(req)]); return H.done('Category deleted'); }
  });
  router.resource('/api/setup/discipline-actions', {
    list: (req) => H.list(db.all('SELECT * FROM discipline_actions ORDER BY sort_order'), req),
    create: (req) => { adminOnly(req); H.requireBody(req, ['title']); const i = buildInsert('discipline_actions', req.body, ['school_id', 'title', 'short_name', 'sort_order']); const id = db.run(i.sql, i.params).lastInsertRowid; return H.one(db.get('SELECT * FROM discipline_actions WHERE id = ?', [id]), 'action'); },
    remove: (req) => { adminOnly(req); db.run('DELETE FROM discipline_actions WHERE id = ?', [H.requireId(req)]); return H.done('Action deleted'); }
  });

  // ------------------------------------------------------------ activity log
  router.get('/api/setup/activity-log', (req) => {
    adminOnly(req);
    const { limit, offset } = paging(req);
    return H.list(db.all('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]), req,
      db.count('SELECT COUNT(*) c FROM activity_log'));
  });
};

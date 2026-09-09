'use strict';
/** Gradebook: assignments, score entry, report card grades, GPA, honor roll, transcripts. */
const { HttpError } = require('../lib/router');
const { buildUpdate, buildInsert, paging } = require('../lib/db');
const H = require('./helpers');

const ASSIGN_COLS = ['staff_id', 'course_period_id', 'assignment_type_id', 'mp_id', 'title', 'description',
  'points', 'weight', 'is_ec', 'assigned_date', 'due_date', 'sort_order'];

/** letter + gpa for a percentage using the section's grade scale. */
function gradeFor(db, gradeScaleId, pct) {
  if (pct === null || pct === undefined) return { letter: null, gpa: 0 };
  const row = db.get(`SELECT title, gpa_value FROM grade_scale_breakdowns
    WHERE grade_scale_id = ? AND breakoff <= ? ORDER BY breakoff DESC LIMIT 1`, [gradeScaleId, pct]);
  return row ? { letter: row.title, gpa: row.gpa_value } : { letter: null, gpa: 0 };
}

module.exports = function (router, db, auth, ctx) {
  const staffOnly = auth.requireProfile('admin', 'teacher');

  // ------------------------------------------------------ assignment types
  router.get('/api/grades/assignment-types', (req) => {
    auth.requireAuth(req);
    const cpId = H.int(req.query.course_period_id);
    if (!cpId) return H.list([], req);
    const cp = db.get('SELECT course_id FROM course_periods WHERE id = ?', [cpId]);
    return H.list(db.all('SELECT * FROM gradebook_assignment_types WHERE course_id = ? ORDER BY sort_order', [cp.course_id]), req);
  });
  router.post('/api/grades/assignment-types', (req) => {
    staffOnly(req);
    H.requireBody(req, ['course_id', 'title']);
    const id = db.run('INSERT INTO gradebook_assignment_types (staff_id, course_id, title, sort_order, final_weight) VALUES (?,?,?,?,?)',
      [req.user.id, H.int(req.body.course_id), req.body.title, req.body.sort_order || 0, req.body.final_weight || 0]).lastInsertRowid;
    return H.one(db.get('SELECT * FROM gradebook_assignment_types WHERE id = ?', [id]), 'type');
  });
  router.del('/api/grades/assignment-types/:id', (req) => {
    staffOnly(req);
    db.run('DELETE FROM gradebook_assignment_types WHERE id = ?', [H.requireId(req)]);
    return H.done('Assignment type deleted');
  });

  // ------------------------------------------------------ assignments
  router.get('/api/grades/assignments', (req) => {
    auth.requireAuth(req);
    const cpId = H.int(req.query.course_period_id);
    const where = [], params = [];
    if (cpId) { where.push('a.course_period_id = ?'); params.push(cpId); }
    if (req.query.mp_id) { where.push('a.mp_id = ?'); params.push(H.int(req.query.mp_id)); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const rows = db.all(`SELECT a.*, t.title AS type_title,
        (SELECT COUNT(*) FROM gradebook_grades g WHERE g.assignment_id = a.id AND g.points IS NOT NULL) AS scored,
        (SELECT COUNT(*) FROM gradebook_grades g WHERE g.assignment_id = a.id) AS total
      FROM gradebook_assignments a LEFT JOIN gradebook_assignment_types t ON t.id = a.assignment_type_id
      ${w} ORDER BY a.due_date, a.sort_order`, params);
    return H.list(rows, req);
  });

  router.post('/api/grades/assignments', (req) => {
    const cpId = H.int(req.body.course_period_id);
    auth.requireCoursePeriodAccess(db, req, cpId);
    H.requireBody(req, ['course_period_id', 'title']);
    const body = { ...req.body, staff_id: req.user.id };
    if (!body.assigned_date) body.assigned_date = new Date().toISOString().slice(0, 10);
    const i = buildInsert('gradebook_assignments', body, ASSIGN_COLS);
    const id = db.run(i.sql, i.params).lastInsertRowid;
    // pre-create empty grade rows for the roster
    const roster = db.all('SELECT student_id FROM schedule WHERE course_period_id = ?', [cpId]);
    const ins = db.raw.prepare('INSERT OR IGNORE INTO gradebook_grades (assignment_id, student_id, points) VALUES (?,?,?)');
    for (const r of roster) ins.run(id, r.student_id, null);
    return H.one(db.get('SELECT * FROM gradebook_assignments WHERE id = ?', [id]), 'assignment');
  });

  router.put('/api/grades/assignments/:id', (req) => {
    const id = H.requireId(req);
    const a = db.get('SELECT * FROM gradebook_assignments WHERE id = ?', [id]);
    if (!a) throw new HttpError(404, 'Assignment not found');
    auth.requireCoursePeriodAccess(db, req, a.course_period_id);
    const u = buildUpdate('gradebook_assignments', id, req.body, ASSIGN_COLS, { stamp: false });
    if (u) db.run(u.sql, u.params);
    return H.one(db.get('SELECT * FROM gradebook_assignments WHERE id = ?', [id]), 'assignment');
  });

  router.del('/api/grades/assignments/:id', (req) => {
    const id = H.requireId(req);
    const a = db.get('SELECT * FROM gradebook_assignments WHERE id = ?', [id]);
    if (!a) throw new HttpError(404, 'Assignment not found');
    auth.requireCoursePeriodAccess(db, req, a.course_period_id);
    db.run('DELETE FROM gradebook_assignments WHERE id = ?', [id]);
    return H.done('Assignment deleted');
  });

  // ------------------------------------------------------ gradebook grid
  router.get('/api/grades/gradebook', (req) => {
    auth.requireAuth(req);
    const cpId = H.int(req.query.course_period_id);
    if (!cpId) throw new HttpError(400, 'course_period_id is required');
    const cp = db.get(`SELECT cp.*, c.title AS course_title, (st.first_name || ' ' || st.last_name) AS teacher
      FROM course_periods cp JOIN courses c ON c.id = cp.course_id
      LEFT JOIN staff st ON st.id = cp.teacher_id WHERE cp.id = ?`, [cpId]);
    if (!cp) throw new HttpError(404, 'Course period not found');
    if (req.user.profile === 'teacher' && cp.teacher_id !== req.user.id) throw new HttpError(403, 'Not your course period');

    const assignments = db.all(`SELECT * FROM gradebook_assignments WHERE course_period_id = ? ORDER BY due_date, sort_order`, [cpId]);
    const roster = db.all(`SELECT s.id, s.student_id, s.first_name, s.last_name, s.grade_level
      FROM schedule sc JOIN students s ON s.id = sc.student_id
      WHERE sc.course_period_id = ? ORDER BY s.last_name, s.first_name`, [cpId]);
    const grades = db.all(`SELECT g.* FROM gradebook_grades g
      JOIN gradebook_assignments a ON a.id = g.assignment_id WHERE a.course_period_id = ?`, [cpId]);
    const map = {};
    for (const g of grades) map[g.assignment_id + ':' + g.student_id] = g;

    const rows = roster.map((s) => {
      const scores = {};
      let earned = 0, possible = 0;
      for (const a of assignments) {
        const g = map[a.id + ':' + s.id];
        const pts = g ? g.points : null;
        scores[a.id] = { points: pts, comment: g ? g.comment : null, isExempt: g ? !!g.is_exempt : false };
        if (pts !== null && pts !== undefined && !g.is_exempt) { earned += pts; possible += a.points; }
      }
      const pct = possible ? Math.round((earned / possible) * 1000) / 10 : null;
      const lg = gradeFor(db, cp.grade_scale_id, pct);
      return { student: s, scores, percent: pct, letter: lg.letter, gpa: lg.gpa, earned, possible };
    });
    return {
      ok: true,
      coursePeriod: cp,
      assignments,
      rows,
      types: db.all('SELECT * FROM gradebook_assignment_types WHERE course_id = ? ORDER BY sort_order', [cp.course_id])
    };
  });

  /** Bulk save: {grades:[{assignment_id, student_id, points, comment}]} or {assignment_id, grades:[{student_id, points}]} */
  router.post('/api/grades/gradebook', (req) => {
    const list = req.body.grades || [];
    if (!Array.isArray(list)) throw new HttpError(400, 'grades array required');
    const cpIds = new Set();
    for (const g of list) {
      const aid = H.int(g.assignment_id || req.body.assignment_id);
      const a = db.get('SELECT course_period_id FROM gradebook_assignments WHERE id = ?', [aid]);
      if (!a) throw new HttpError(404, 'Assignment ' + aid + ' not found');
      cpIds.add(a.course_period_id);
    }
    for (const cpid of cpIds) auth.requireCoursePeriodAccess(db, req, cpid);

    const stmt = db.raw.prepare(`INSERT INTO gradebook_grades (assignment_id, student_id, points, comment, is_exempt)
      VALUES (?,?,?,?,?)
      ON CONFLICT(assignment_id, student_id) DO UPDATE SET points = excluded.points, comment = excluded.comment, is_exempt = excluded.is_exempt`);
    db.raw.exec('BEGIN');
    try {
      for (const g of list) {
        stmt.run(H.int(g.assignment_id || req.body.assignment_id), H.int(g.student_id),
          g.points === '' || g.points === null || g.points === undefined ? null : H.num(g.points),
          g.comment === undefined ? null : g.comment, g.is_exempt ? 1 : 0);
      }
      db.raw.exec('COMMIT');
    } catch (e) { db.raw.exec('ROLLBACK'); throw e; }

    // refresh report card grades for every touched section/mp
    for (const cpid of cpIds) {
      const mpId = H.int(req.body.mp_id) || H.currentMarkingPeriod(db, H.currentSchoolYear(db, req));
      recalcReportCard(db, cpid, mpId);
    }
    return H.done(list.length + ' score(s) saved', { saved: list.length });
  });

  // ------------------------------------------------------ report card grades
  router.get('/api/grades/report-card-grades', (req) => {
    auth.requireAuth(req);
    const where = [], params = [];
    if (req.query.student_id) { where.push('r.student_id = ?'); params.push(H.int(req.query.student_id)); }
    if (req.query.course_period_id) { where.push('r.course_period_id = ?'); params.push(H.int(req.query.course_period_id)); }
    if (req.query.mp_id) { where.push('r.mp_id = ?'); params.push(H.int(req.query.mp_id)); }
    else { const mp = H.currentMarkingPeriod(db, H.currentSchoolYear(db, req)); if (mp) { where.push('r.mp_id = ?'); params.push(mp); } }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    return H.list(db.all(`SELECT r.*, cp.title, c.title AS course_title, (st.first_name || ' ' || st.last_name) AS teacher
      FROM student_report_card_grades r
      JOIN course_periods cp ON cp.id = r.course_period_id
      JOIN courses c ON c.id = cp.course_id
      LEFT JOIN staff st ON st.id = cp.teacher_id ${w} ORDER BY c.title`, params), req);
  });

  router.post('/api/grades/report-card-grades', (req) => {
    const cpId = H.int(req.body.course_period_id);
    auth.requireCoursePeriodAccess(db, req, cpId);
    const mpId = H.int(req.body.mp_id) || H.currentMarkingPeriod(db, H.currentSchoolYear(db, req));
    const studentId = H.int(req.body.student_id);
    const cp = db.get('SELECT grade_scale_id, credit_attempted FROM course_periods WHERE id = ?', [cpId]);
    let pct = H.num(req.body.grade_percent);
    let letter = req.body.grade_letter || null, gpa = H.num(req.body.gpa_points);
    if (pct !== null && !letter) { const lg = gradeFor(db, cp.grade_scale_id, pct); letter = lg.letter; gpa = lg.gpa; }
    if (pct === null && letter) {
      const b = db.get('SELECT breakoff, gpa_value FROM grade_scale_breakdowns WHERE grade_scale_id = ? AND title = ?', [cp.grade_scale_id, letter]);
      pct = b ? b.breakoff : null; gpa = b ? b.gpa_value : gpa;
    }
    db.run(`INSERT INTO student_report_card_grades (student_id, course_period_id, mp_id, grade_letter, grade_percent, gpa_points, unweighted_gp, weighted_gp, comment)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(student_id, course_period_id, mp_id) DO UPDATE SET
        grade_letter = excluded.grade_letter, grade_percent = excluded.grade_percent,
        gpa_points = excluded.gpa_points, unweighted_gp = excluded.unweighted_gp,
        weighted_gp = excluded.weighted_gp, comment = excluded.comment`,
      [studentId, cpId, mpId, letter, pct, gpa, gpa, (gpa || 0) * (cp.credit_attempted || 1), req.body.comment || null]);
    return H.done('Grade saved');
  });

  router.post('/api/grades/recalculate', (req) => {
    const cpId = H.int(req.body.course_period_id);
    if (!cpId) throw new HttpError(400, 'course_period_id required');
    auth.requireCoursePeriodAccess(db, req, cpId);
    const mpId = H.int(req.body.mp_id) || H.currentMarkingPeriod(db, H.currentSchoolYear(db, req));
    const n = recalcReportCard(db, cpId, mpId);
    return H.done('Recalculated ' + n + ' grade(s)');
  });

  // ------------------------------------------------------ GPA + rankings
  router.get('/api/grades/gpa', (req) => {
    auth.requireAuth(req);
    const syId = H.currentSchoolYear(db, req);
    const mpId = H.int(req.query.mp_id);
    const where = [], params = [];
    if (mpId) { where.push('r.mp_id = ?'); params.push(mpId); }
    where.push('cp.school_year_id = ? OR cp.school_year_id IS NULL'); params.push(syId);
    const w = ' WHERE ' + where.join(' AND ');
    const all = db.all(`SELECT r.student_id, SUM(r.weighted_gp) AS gp, SUM(cp.credit_attempted) AS cred,
        SUM(CASE WHEN r.grade_percent IS NOT NULL THEN cp.credit_attempted ELSE 0 END) AS earned_cred
      FROM student_report_card_grades r JOIN course_periods cp ON cp.id = r.course_period_id
      ${w} GROUP BY r.student_id`, params);
    const ranked = all.map((r) => ({ studentId: r.student_id, gpa: r.cred ? r.gp / r.cred : 0, credits: r.cred, earnedCredits: r.earned_cred }))
      .sort((a, b) => b.gpa - a.gpa);
    ranked.forEach((r, i) => { r.rank = i + 1; });
    const lookup = Object.fromEntries(ranked.map((r) => [r.studentId, r]));

    if (req.query.student_id) {
      const sid = H.int(req.query.student_id);
      const rec = lookup[sid] || { gpa: 0, credits: 0, rank: null };
      return { ok: true, gpa: Math.round(rec.gpa * 100) / 100, credits: rec.credits, rank: rec.rank, classSize: ranked.length };
    }
    const withNames = ranked.map((r) => {
      const s = db.get('SELECT first_name, last_name, student_id, grade_level FROM students WHERE id = ?', [r.studentId]);
      return { ...r, ...s };
    });
    return H.list(withNames, req);
  });

  router.get('/api/grades/honor-roll', (req) => {
    auth.requireAuth(req);
    const syId = H.currentSchoolYear(db, req);
    const minGpa = H.num(req.query.min_gpa, 3.0);
    const rows = db.all(`SELECT r.student_id, SUM(r.weighted_gp) AS gp, SUM(cp.credit_attempted) AS cred,
        s.first_name, s.last_name, s.student_id AS sid, s.grade_level
      FROM student_report_card_grades r
      JOIN course_periods cp ON cp.id = r.course_period_id
      JOIN students s ON s.id = r.student_id
      WHERE (cp.school_year_id = ? OR cp.school_year_id IS NULL)
      GROUP BY r.student_id HAVING (gp / cred) >= ?
      ORDER BY (gp / cred) DESC`, [syId, minGpa]);
    return H.list(rows.map((r) => ({ ...r, gpa: Math.round((r.gp / r.cred) * 100) / 100 })), req);
  });
};

/**
 * Recompute report card grades for a course period from gradebook scores.
 * Returns number of rows written.
 */
function recalcReportCard(db, coursePeriodId, mpId) {
  const cp = db.get('SELECT grade_scale_id, credit_attempted FROM course_periods WHERE id = ?', [coursePeriodId]);
  if (!cp || !mpId) return 0;
  const rows = db.all(`SELECT g.student_id, SUM(g.points) AS earned, SUM(a.points) AS possible
    FROM gradebook_grades g JOIN gradebook_assignments a ON a.id = g.assignment_id
    WHERE a.course_period_id = ? AND g.points IS NOT NULL AND (a.mp_id = ? OR a.mp_id IS NULL)
    GROUP BY g.student_id`, [coursePeriodId, mpId]);
  let n = 0;
  for (const r of rows) {
    if (!r.possible) continue;
    const pct = Math.round((r.earned / r.possible) * 1000) / 10;
    const b = db.get('SELECT title, gpa_value FROM grade_scale_breakdowns WHERE grade_scale_id = ? AND breakoff <= ? ORDER BY breakoff DESC LIMIT 1', [cp.grade_scale_id, pct]);
    const letter = b ? b.title : null, gpa = b ? b.gpa_value : 0;
    db.run(`INSERT INTO student_report_card_grades (student_id, course_period_id, mp_id, grade_letter, grade_percent, gpa_points, unweighted_gp, weighted_gp)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(student_id, course_period_id, mp_id) DO UPDATE SET
        grade_letter = excluded.grade_letter, grade_percent = excluded.grade_percent,
        gpa_points = excluded.gpa_points, unweighted_gp = excluded.unweighted_gp, weighted_gp = excluded.weighted_gp`,
      [r.student_id, coursePeriodId, mpId, letter, pct, gpa, gpa, gpa * (cp.credit_attempted || 1)]);
    n++;
  }
  return n;
}

module.exports.recalcReportCard = recalcReportCard;

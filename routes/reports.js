'use strict';
/** Dashboard statistics, reports, report cards, transcripts, messaging. */
const { HttpError } = require('../lib/router');
const { paging } = require('../lib/db');
const H = require('./helpers');

module.exports = function (router, db, auth, ctx) {
  // ------------------------------------------------------------ dashboard
  router.get('/api/dashboard', (req) => {
    const u = auth.requireAuth(req);
    const schoolId = H.int(req.query.school_id) || H.currentSchool(db, req);
    const syId = H.currentSchoolYear(db, req);
    const today = new Date().toISOString().slice(0, 10);

    const students = db.count('SELECT COUNT(*) c FROM students WHERE school_id = ? AND is_active = 1', [schoolId]);
    const staff = db.count("SELECT COUNT(*) c FROM staff WHERE school_id = ? AND is_active = 1 AND profile = 'teacher'", [schoolId]);
    const courses = db.count('SELECT COUNT(*) c FROM courses WHERE school_id = ?', [schoolId]);
    const sections = db.count('SELECT COUNT(*) c FROM course_periods WHERE school_id = ? AND school_year_id = ?', [schoolId, syId]);

    const byGrade = db.all(`SELECT grade_level, COUNT(*) AS n FROM students
      WHERE school_id = ? AND is_active = 1 GROUP BY grade_level ORDER BY grade_level`, [schoolId]);
    const byGender = db.all(`SELECT gender, COUNT(*) AS n FROM students
      WHERE school_id = ? AND is_active = 1 GROUP BY gender`, [schoolId]);

    const todayAtt = db.all(`SELECT c.short_name, COUNT(*) AS n FROM attendance_day a
      JOIN attendance_codes c ON c.id = a.attendance_code
      WHERE a.school_id = ? AND a.school_date = ? GROUP BY c.short_name`, [schoolId, today]);
    const attMap = Object.fromEntries(todayAtt.map((r) => [r.short_name, r.n]));
    const attTotal = todayAtt.reduce((a, r) => a + r.n, 0);

    const openReferrals = db.count('SELECT COUNT(*) c FROM discipline_referrals WHERE school_id = ? AND is_resolved = 0', [schoolId]);
    const outstanding = db.get(`SELECT COALESCE(SUM(f.amount),0) AS charged,
        (SELECT COALESCE(SUM(p.amount),0) FROM student_payments p JOIN students s2 ON s2.id = p.student_id WHERE s2.school_id = ?) AS paid
      FROM student_fees f JOIN students s ON s.id = f.student_id WHERE s.school_id = ?`, [schoolId, schoolId]) || { charged: 0, paid: 0 };

    const mpId = H.currentMarkingPeriod(db, syId);
    const gradeDist = mpId ? db.all(`SELECT grade_letter, COUNT(*) AS n FROM student_report_card_grades
      WHERE mp_id = ? GROUP BY grade_letter ORDER BY grade_letter`, [mpId]) : [];

    const gpaRows = db.all(`SELECT r.student_id, SUM(r.weighted_gp) AS gp, SUM(cp.credit_attempted) AS cred
      FROM student_report_card_grades r JOIN course_periods cp ON cp.id = r.course_period_id
      WHERE cp.school_year_id = ? OR cp.school_year_id IS NULL GROUP BY r.student_id`, [syId]);
    const gpas = gpaRows.map((r) => (r.cred ? r.gp / r.cred : 0)).filter((n) => !Number.isNaN(n)).sort((a, b) => b - a);
    const avgGpa = gpas.length ? Math.round((gpas.reduce((a, b) => a + b, 0) / gpas.length) * 100) / 100 : 0;
    const honorRoll = gpas.filter((g) => g >= 3.0).length;

    const daily = db.all(`SELECT a.school_date,
        COUNT(*) AS total,
        SUM(CASE WHEN c.short_name = 'P' THEN 1 ELSE 0 END) AS present
      FROM attendance_day a JOIN attendance_codes c ON c.id = a.attendance_code
      WHERE a.school_id = ? GROUP BY a.school_date ORDER BY a.school_date DESC LIMIT 14`, [schoolId])
      .map((r) => ({ date: r.school_date, total: r.total, present: r.present, rate: r.total ? Math.round((r.present / r.total) * 1000) / 10 : 0 }))
      .reverse();

    let mySections = [], myChildren = [], mySchedule = [];
    if (u.profile === 'teacher') {
      mySections = db.all(`SELECT cp.id, cp.title, cp.room, p.short_name AS period,
          (SELECT COUNT(*) FROM schedule s WHERE s.course_period_id = cp.id) AS students
        FROM course_periods cp LEFT JOIN periods p ON p.id = cp.period_id
        WHERE cp.teacher_id = ? AND cp.school_year_id = ? ORDER BY p.sort_order`, [u.id, syId]);
    }
    if (u.profile === 'parent') {
      myChildren = db.all(`SELECT s.id, s.first_name, s.last_name, s.student_id, s.grade_level
        FROM students_join_people j JOIN students s ON s.id = j.student_id WHERE j.person_id = ?`, [u.id]);
    }
    if (u.profile === 'student') {
      const s = db.get('SELECT id FROM students WHERE staff_id = ?', [u.id]);
      if (s) {
        mySchedule = db.all(`SELECT cp.title, cp.room, p.short_name AS period, p.start_time, p.end_time,
            (st.first_name || ' ' || st.last_name) AS teacher
          FROM schedule sc JOIN course_periods cp ON cp.id = sc.course_period_id
          LEFT JOIN periods p ON p.id = cp.period_id LEFT JOIN staff st ON st.id = cp.teacher_id
          WHERE sc.student_id = ? ORDER BY p.sort_order`, [s.id]);
      }
    }

    return {
      ok: true,
      stats: {
        students, staff, courses, sections,
        attendanceToday: {
          present: attMap['P'] || 0, absent: attMap['A'] || 0, excused: attMap['EA'] || 0,
          tardy: (attMap['T'] || 0) + (attMap['UT'] || 0) + (attMap['ET'] || 0),
          total: attTotal,
          rate: attTotal ? Math.round(((attMap['P'] || 0) / attTotal) * 1000) / 10 : 0
        },
        openReferrals,
        feesCharged: Math.round(outstanding.charged * 100) / 100,
        feesPaid: Math.round(outstanding.paid * 100) / 100,
        feesBalance: Math.round((outstanding.charged - outstanding.paid) * 100) / 100,
        avgGpa, honorRoll
      },
      byGrade, byGender, gradeDist, daily,
      mySections, myChildren, mySchedule,
      schoolId, schoolYearId: syId, markingPeriodId: mpId
    };
  });

  // ------------------------------------------------------------ reports
  router.get('/api/reports/enrollment', (req) => {
    auth.requireAuth(req);
    const schoolId = H.int(req.query.school_id) || H.currentSchool(db, req);
    const group = req.query.group_by === 'gender' ? 'gender'
      : req.query.group_by === 'ethnicity' ? 'ethnicity'
        : req.query.group_by === 'grade_level' ? 'grade_level' : 'grade_level';
    const rows = db.all(`SELECT ${group} AS label, COUNT(*) AS n FROM students
      WHERE school_id = ? AND is_active = 1 GROUP BY ${group} ORDER BY n DESC`, [schoolId]);
    return { ok: true, groupBy: group, rows, total: rows.reduce((a, r) => a + r.n, 0) };
  });

  router.get('/api/reports/grade-distribution', (req) => {
    auth.requireAuth(req);
    const syId = H.currentSchoolYear(db, req);
    const mpId = H.int(req.query.mp_id) || H.currentMarkingPeriod(db, syId);
    const rows = mpId ? db.all(`SELECT grade_letter AS label, COUNT(*) AS n, AVG(grade_percent) AS avg_pct
      FROM student_report_card_grades WHERE mp_id = ? GROUP BY grade_letter ORDER BY avg_pct DESC`, [mpId]) : [];
    return { ok: true, markingPeriodId: mpId, rows };
  });

  router.get('/api/reports/attention-list', (req) => {
    auth.requireAuth(req);
    const schoolId = H.int(req.query.school_id) || H.currentSchool(db, req);
    const minRate = H.num(req.query.min_rate, 90);
    const rows = db.all(`SELECT s.id, s.first_name, s.last_name, s.student_id, s.grade_level,
        COUNT(*) AS total,
        SUM(CASE WHEN c.short_name = 'P' THEN 1 ELSE 0 END) AS present
      FROM attendance_day a JOIN students s ON s.id = a.student_id
      JOIN attendance_codes c ON c.id = a.attendance_code
      WHERE a.school_id = ? GROUP BY s.id`, [schoolId]);
    const out = rows.map((r) => ({ ...r, rate: r.total ? Math.round((r.present / r.total) * 1000) / 10 : 0 }))
      .filter((r) => r.rate < minRate).sort((a, b) => a.rate - b.rate);
    return H.list(out, req);
  });

  router.get('/api/reports/defaulters', (req) => {
    auth.requireAuth(req);
    const rows = db.all(`SELECT s.id, s.first_name, s.last_name, s.student_id, s.grade_level,
        COALESCE(SUM(f.amount),0) AS charged,
        (SELECT COALESCE(SUM(p.amount),0) FROM student_payments p WHERE p.student_id = s.id) AS paid
      FROM students s JOIN student_fees f ON f.student_id = s.id
      GROUP BY s.id HAVING (charged - paid) > 0 ORDER BY (charged - paid) DESC`);
    return H.list(rows.map((r) => ({ ...r, balance: Math.round((r.charged - r.paid) * 100) / 100 })), req);
  });

  // ------------------------------------------------------------ report card / transcript
  router.get('/api/reports/student/:id/report-card', (req) => {
    auth.requireAuth(req);
    const sid = H.int(req.params.id);
    auth.assertStudentVisible(db, req.user, sid);
    const student = db.get('SELECT * FROM students WHERE id = ?', [sid]);
    if (!student) throw new HttpError(404, 'Student not found');
    const syId = H.currentSchoolYear(db, req);
    const mps = db.all(`SELECT * FROM marking_periods WHERE school_year_id = ? AND mp_type = 'quarter' ORDER BY sort_order`, [syId]);
    const mpId = H.int(req.query.mp_id) || H.currentMarkingPeriod(db, syId) || (mps[0] && mps[0].id);
    const courses = db.all(`SELECT r.*, cp.title, cp.room, cp.credit_attempted, c.title AS course_title,
        (st.first_name || ' ' || st.last_name) AS teacher,
        (SELECT COUNT(*) FROM attendance_period ap WHERE ap.student_id = r.student_id AND ap.course_period_id = r.course_period_id) AS att_total,
        (SELECT COUNT(*) FROM attendance_period ap JOIN attendance_codes ac ON ac.id = ap.attendance_code
          WHERE ap.student_id = r.student_id AND ap.course_period_id = r.course_period_id AND ac.short_name IN ('A','EA')) AS att_absent
      FROM student_report_card_grades r
      JOIN course_periods cp ON cp.id = r.course_period_id
      JOIN courses c ON c.id = cp.course_id
      LEFT JOIN staff st ON st.id = cp.teacher_id
      WHERE r.student_id = ? AND r.mp_id = ? ORDER BY c.title`, [sid, mpId]);
    let gp = 0, cred = 0;
    for (const c of courses) { gp += c.weighted_gp || 0; cred += c.credit_attempted || 0; }
    return {
      ok: true, student, markingPeriods: mps, markingPeriodId: mpId, courses,
      gpa: cred ? Math.round((gp / cred) * 100) / 100 : 0, credits: cred,
      school: db.get('SELECT * FROM schools WHERE id = ?', [student.school_id])
    };
  });

  router.get('/api/reports/student/:id/transcript', (req) => {
    auth.requireAuth(req);
    const sid = H.int(req.params.id);
    auth.assertStudentVisible(db, req.user, sid);
    const student = db.get('SELECT * FROM students WHERE id = ?', [sid]);
    if (!student) throw new HttpError(404, 'Student not found');
    const rows = db.all(`SELECT r.*, cp.title, cp.credit_attempted, cp.credit_earned, c.title AS course_title,
        mp.title AS mp_title, mp.sort_order AS mp_sort, sy.title AS school_year
      FROM student_report_card_grades r
      JOIN course_periods cp ON cp.id = r.course_period_id
      JOIN courses c ON c.id = cp.course_id
      JOIN marking_periods mp ON mp.id = r.mp_id
      LEFT JOIN school_years sy ON sy.id = cp.school_year_id
      WHERE r.student_id = ? ORDER BY sy.start_date, mp.sort_order, c.title`, [sid]);
    const years = {};
    for (const r of rows) {
      const y = r.school_year || 'Unassigned';
      years[y] = years[y] || { schoolYear: y, courses: [], gp: 0, cred: 0 };
      years[y].courses.push(r);
      years[y].gp += r.weighted_gp || 0;
      years[y].cred += r.credit_attempted || 0;
    }
    const byYear = Object.values(years).map((y) => ({ ...y, gpa: y.cred ? Math.round((y.gp / y.cred) * 100) / 100 : 0 }));
    const totGp = byYear.reduce((a, y) => a + y.gp, 0), totCred = byYear.reduce((a, y) => a + y.cred, 0);
    return {
      ok: true, student, years: byYear,
      cumulativeGpa: totCred ? Math.round((totGp / totCred) * 100) / 100 : 0,
      totalCredits: Math.round(totCred * 100) / 100,
      school: db.get('SELECT * FROM schools WHERE id = ?', [student.school_id])
    };
  });

  // ------------------------------------------------------------ messaging
  router.get('/api/messages', (req) => {
    const u = auth.requireAuth(req);
    const box = req.query.box === 'sent' ? 'sent' : 'inbox';
    const col = box === 'sent' ? 'from_staff_id' : 'to_staff_id';
    const rows = db.all(`SELECT m.*, (f.first_name || ' ' || f.last_name) AS from_name,
        (t.first_name || ' ' || t.last_name) AS to_name
      FROM messages m LEFT JOIN staff f ON f.id = m.from_staff_id LEFT JOIN staff t ON t.id = m.to_staff_id
      WHERE m.${col} = ? ORDER BY m.created_at DESC LIMIT 100`, [u.id]);
    return H.list(rows, req);
  });

  router.post('/api/messages', (req) => {
    const u = auth.requireAuth(req);
    H.requireBody(req, ['subject', 'body', 'to_staff_id']);
    const id = db.run('INSERT INTO messages (from_staff_id, to_staff_id, subject, body, is_read, created_at) VALUES (?,?,?,?,?,?)',
      [u.id, H.int(req.body.to_staff_id), req.body.subject, req.body.body, 0, Date.now()]).lastInsertRowid;
    return H.one(db.get('SELECT * FROM messages WHERE id = ?', [id]), 'message');
  });

  router.post('/api/messages/:id/read', (req) => {
    auth.requireAuth(req);
    db.run('UPDATE messages SET is_read = 1 WHERE id = ?', [H.requireId(req)]);
    return H.done('Marked as read');
  });

  router.get('/api/portal-notes', (req) => {
    auth.requireAuth(req);
    const schoolId = H.int(req.query.school_id) || H.currentSchool(db, req);
    return H.list(db.all('SELECT * FROM portal_notes WHERE school_id = ? AND published = 1 ORDER BY created_at DESC', [schoolId]), req);
  });

  router.post('/api/portal-notes', (req) => {
    auth.requireProfile('admin')(req);
    H.requireBody(req, ['title', 'body']);
    const id = db.run('INSERT INTO portal_notes (school_id, title, body, published, created_at) VALUES (?,?,?,?,?)',
      [H.int(req.body.school_id) || H.currentSchool(db, req), req.body.title, req.body.body, H.yes(req.body.published, true) ? 1 : 0, Date.now()]).lastInsertRowid;
    return H.one(db.get('SELECT * FROM portal_notes WHERE id = ?', [id]), 'note');
  });
};

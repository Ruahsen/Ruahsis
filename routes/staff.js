'use strict';
/** Users / Staff module. */
const { HttpError } = require('../lib/router');
const { buildUpdate, buildInsert, paging, searchClause } = require('../lib/db');
const authLib = require('../lib/auth');
const H = require('./helpers');

const STAFF_COLS = ['staff_id', 'username', 'first_name', 'middle_name', 'last_name', 'title', 'profile', 'email',
  'phone', 'home_phone', 'cell_phone', 'address', 'city', 'state', 'zip', 'school_id', 'is_active'];

module.exports = function (router, db, auth, ctx) {
  const adminOnly = auth.requireProfile('admin');

  /** Teachers list used for dropdowns -- must be registered BEFORE /api/staff/:id. */
  router.get('/api/staff/teachers', (req) => {
    auth.requireAuth(req);
    return H.list(db.all(`SELECT id, first_name, last_name, title FROM staff WHERE profile = 'teacher' AND is_active = 1
      ORDER BY last_name, first_name`), req);
  });

  router.get('/api/staff', (req) => {
    auth.requireAuth(req);
    const { limit, offset, orderBy } = paging(req, 'st.last_name ASC, st.first_name ASC');
    const where = [], params = [];
    const s = searchClause(req, ['st.first_name', 'st.last_name', 'st.username', 'st.email', 'st.staff_id', 'st.profile']);
    if (s.clause) { where.push(s.clause); params.push(...s.params); }
    const f = req.query.filter || {};
    if (f.profile) { where.push('st.profile = ?'); params.push(f.profile); }
    if (f.school_id) { where.push('st.school_id = ?'); params.push(H.int(f.school_id)); }
    if (f.is_active !== undefined && f.is_active !== '') { where.push('st.is_active = ?'); params.push(H.yes(f.is_active) ? 1 : 0); }
    if (H.yes(req.query.has_login)) where.push('st.username IS NOT NULL');
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const total = db.count('SELECT COUNT(*) c FROM staff st' + w, params);
    const rows = db.all(`SELECT st.id, st.staff_id, st.username, st.first_name, st.middle_name, st.last_name, st.title,
        st.profile, st.email, st.phone, st.home_phone, st.cell_phone, st.school_id, st.is_active, st.is_admin, st.last_login,
        (SELECT COUNT(*) FROM course_periods cp WHERE cp.teacher_id = st.id) AS course_periods,
        (SELECT COUNT(*) FROM students_join_people j WHERE j.person_id = st.id) AS linked_students
      FROM staff st ${w} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return H.list(rows, req, total);
  });

  router.get('/api/staff/:id', (req) => {
    auth.requireAuth(req);
    const id = H.requireId(req);
    const staff = db.get('SELECT id, staff_id, username, first_name, middle_name, last_name, title, profile, email, phone, home_phone, cell_phone, address, city, state, zip, school_id, is_active, is_admin, last_login FROM staff WHERE id = ?', [id]);
    if (!staff) throw new HttpError(404, 'User not found');
    return {
      ok: true, staff,
      schedule: db.all(`SELECT cp.id, cp.title, cp.short_name, cp.room, c.title AS course_title,
          p.short_name AS period, p.start_time, p.end_time,
          (SELECT COUNT(*) FROM schedule s WHERE s.course_period_id = cp.id) AS students
        FROM course_periods cp
        JOIN courses c ON c.id = cp.course_id
        LEFT JOIN periods p ON p.id = cp.period_id
        WHERE cp.teacher_id = ? ORDER BY p.sort_order`, [id]),
      children: db.all(`SELECT j.id, j.relationship, s.id AS student_id, s.first_name, s.last_name, s.student_id AS sid, s.grade_level
        FROM students_join_people j JOIN students s ON s.id = j.student_id WHERE j.person_id = ?`, [id])
    };
  });

  router.post('/api/staff', (req) => {
    adminOnly(req);
    H.requireBody(req, ['first_name', 'last_name', 'profile']);
    const body = { ...req.body };
    if (body.username) {
      if (db.get('SELECT id FROM staff WHERE username = ?', [body.username])) throw new HttpError(409, 'Username already taken');
      if (!body.password) throw new HttpError(400, 'Password is required when a username is set');
      body.password = authLib.hashPassword(body.password);
    } else delete body.password;
    if (!body.school_id) body.school_id = H.currentSchool(db, req);
    if (body.profile === 'admin') body.is_admin = 1;
    const i = buildInsert('staff', { ...body, created_at: Date.now(), updated_at: Date.now() },
      STAFF_COLS.concat(['password', 'is_admin', 'created_at', 'updated_at']));
    const id = db.run(i.sql, i.params).lastInsertRowid;
    ctx.logActivity(req, 'create', 'user #' + id);
    return H.one(db.get('SELECT id, username, first_name, last_name, profile FROM staff WHERE id = ?', [id]), 'staff');
  });

  router.put('/api/staff/:id', (req) => {
    const id = H.requireId(req);
    const isSelf = req.user && req.user.id === id;
    if (!isSelf) adminOnly(req);
    const body = { ...req.body };
    delete body.password;
    delete body.is_admin;
    if (!isSelf) {
      if (body.profile) db.run('UPDATE staff SET is_admin = ? WHERE id = ?', [body.profile === 'admin' ? 1 : 0, id]);
    }
    const u = buildUpdate('staff', id, body, STAFF_COLS);
    if (u) db.run(u.sql, u.params);
    return H.one(db.get('SELECT id, username, first_name, last_name, profile, email FROM staff WHERE id = ?', [id]), 'staff');
  });

  router.post('/api/staff/:id/password', (req) => {
    const id = H.requireId(req);
    const isSelf = req.user && req.user.id === id;
    if (!isSelf) adminOnly(req);
    if (!req.body.password) throw new HttpError(400, 'New password required');
    if (isSelf && req.body.current) {
      const row = db.get('SELECT password FROM staff WHERE id = ?', [id]);
      if (!authLib.verifyPassword(req.body.current, row.password)) throw new HttpError(403, 'Current password is incorrect');
    }
    db.run('UPDATE staff SET password = ?, failed_logins = 0 WHERE id = ?', [authLib.hashPassword(req.body.password), id]);
    return H.done('Password updated');
  });

  router.del('/api/staff/:id', (req) => {
    adminOnly(req);
    const id = H.requireId(req);
    if (req.user && req.user.id === id) throw new HttpError(400, 'You cannot delete your own account');
    db.run('DELETE FROM staff WHERE id = ?', [id]);
    ctx.logActivity(req, 'delete', 'user #' + id);
    return H.done('User deleted');
  });
};

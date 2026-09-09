'use strict';
/** Discipline referrals, fees and payments. */
const { HttpError } = require('../lib/router');
const { buildUpdate, buildInsert, paging } = require('../lib/db');
const H = require('./helpers');

module.exports = function (router, db, auth, ctx) {
  const staffOnly = auth.requireProfile('admin', 'teacher');
  const REF_COLS = ['student_id', 'school_id', 'staff_id', 'entry_date', 'event_date', 'category_id', 'action_id',
    'title', 'description', 'consequence', 'points', 'is_resolved'];

  // ------------------------------------------------------------ referrals
  router.get('/api/discipline/referrals', (req) => {
    auth.requireAuth(req);
    const where = [], params = [];
    if (req.query.student_id) { where.push('d.student_id = ?'); params.push(H.int(req.query.student_id)); }
    if (req.query.category_id) { where.push('d.category_id = ?'); params.push(H.int(req.query.category_id)); }
    if (req.query.open === '1' || req.query.open === 'true') where.push('d.is_resolved = 0');
    if (req.query.search) { where.push('(s.first_name LIKE ? OR s.last_name LIKE ? OR d.title LIKE ?)'); const l = '%' + req.query.search + '%'; params.push(l, l, l); }
    if (req.user.profile === 'student') {
      const s = db.get('SELECT id FROM students WHERE staff_id = ?', [req.user.id]);
      where.push('d.student_id = ?'); params.push(s ? s.id : 0);
    } else if (req.user.profile === 'parent') {
      const vis = auth.visibleStudentIds(db, req.user) || [];
      where.push(vis.length ? `d.student_id IN (${vis.map(() => '?').join(',')})` : 'd.student_id = 0'); params.push(...vis);
    }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const { limit, offset } = paging(req);
    const rows = db.all(`SELECT d.*, s.first_name, s.last_name, s.student_id AS sid, s.grade_level,
        cat.title AS category, act.title AS action, (st.first_name || ' ' || st.last_name) AS staff
      FROM discipline_referrals d
      JOIN students s ON s.id = d.student_id
      LEFT JOIN discipline_categories cat ON cat.id = d.category_id
      LEFT JOIN discipline_actions act ON act.id = d.action_id
      LEFT JOIN staff st ON st.id = d.staff_id ${w} ORDER BY d.event_date DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return H.list(rows, req, db.count('SELECT COUNT(*) c FROM discipline_referrals d JOIN students s ON s.id = d.student_id' + w, params));
  });

  router.resource('/api/discipline/referrals', {
    get: (req) => {
      auth.requireAuth(req);
      const r = db.get(`SELECT d.*, s.first_name, s.last_name FROM discipline_referrals d JOIN students s ON s.id = d.student_id WHERE d.id = ?`, [H.requireId(req)]);
      if (!r) throw new HttpError(404, 'Referral not found');
      return { ok: true, referral: r };
    },
    create: (req) => {
      staffOnly(req);
      H.requireBody(req, ['student_id', 'title']);
      const body = {
        ...req.body,
        school_id: req.body.school_id || H.currentSchool(db, req),
        staff_id: req.body.staff_id || (req.user ? req.user.id : null),
        entry_date: req.body.entry_date || new Date().toISOString().slice(0, 10),
        event_date: req.body.event_date || new Date().toISOString().slice(0, 10)
      };
      const i = buildInsert('discipline_referrals', body, REF_COLS);
      const id = db.run(i.sql, i.params).lastInsertRowid;
      ctx.logActivity(req, 'create', 'referral #' + id);
      return H.one(db.get('SELECT * FROM discipline_referrals WHERE id = ?', [id]), 'referral');
    },
    update: (req) => {
      staffOnly(req);
      const id = H.requireId(req);
      const u = buildUpdate('discipline_referrals', id, req.body, REF_COLS, { stamp: false });
      if (u) db.run(u.sql, u.params);
      return H.one(db.get('SELECT * FROM discipline_referrals WHERE id = ?', [id]), 'referral');
    },
    remove: (req) => {
      staffOnly(req);
      db.run('DELETE FROM discipline_referrals WHERE id = ?', [H.requireId(req)]);
      return H.done('Referral deleted');
    }
  });

  // ------------------------------------------------------------ fees
  router.get('/api/fees', (req) => {
    auth.requireAuth(req);
    const where = [], params = [];
    if (req.query.student_id) { where.push('f.student_id = ?'); params.push(H.int(req.query.student_id)); }
    if (req.query.search) { where.push('(s.first_name LIKE ? OR s.last_name LIKE ? OR f.title LIKE ?)'); const l = '%' + req.query.search + '%'; params.push(l, l, l); }
    const vis = auth.visibleStudentIds(db, req.user);
    if (vis !== null) { where.push(vis.length ? `f.student_id IN (${vis.map(() => '?').join(',')})` : 'f.student_id = 0'); params.push(...vis); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const rows = db.all(`SELECT f.*, s.first_name, s.last_name, s.student_id AS sid,
        (SELECT COALESCE(SUM(p.amount),0) FROM student_payments p WHERE p.fee_id = f.id) AS paid
      FROM student_fees f JOIN students s ON s.id = f.student_id ${w} ORDER BY f.due_date, s.last_name`, params);
    for (const r of rows) r.balance = Math.round((r.amount - r.paid) * 100) / 100;
    return H.list(rows, req);
  });

  router.post('/api/fees', (req) => {
    auth.requireProfile('admin')(req);
    H.requireBody(req, ['student_id', 'title', 'amount']);
    const id = db.run('INSERT INTO student_fees (student_id, school_id, title, amount, due_date, comments, created_at) VALUES (?,?,?,?,?,?,?)',
      [H.int(req.body.student_id), H.int(req.body.school_id) || H.currentSchool(db, req), req.body.title,
        H.num(req.body.amount, 0), req.body.due_date || null, req.body.comments || null, Date.now()]).lastInsertRowid;
    return H.one(db.get('SELECT * FROM student_fees WHERE id = ?', [id]), 'fee');
  });

  router.del('/api/fees/:id', (req) => {
    auth.requireProfile('admin')(req);
    db.run('DELETE FROM student_fees WHERE id = ?', [H.requireId(req)]);
    return H.done('Fee deleted');
  });

  router.post('/api/fees/:id/pay', (req) => {
    auth.requireProfile('admin')(req);
    const feeId = H.requireId(req);
    const fee = db.get('SELECT * FROM student_fees WHERE id = ?', [feeId]);
    if (!fee) throw new HttpError(404, 'Fee not found');
    const amount = H.num(req.body.amount, fee.amount);
    const pid = db.run('INSERT INTO student_payments (student_id, fee_id, amount, payment_date, method, comments, created_at) VALUES (?,?,?,?,?,?,?)',
      [fee.student_id, feeId, amount, req.body.payment_date || new Date().toISOString().slice(0, 10),
        req.body.method || 'Cash', req.body.comments || null, Date.now()]).lastInsertRowid;
    return H.one(db.get('SELECT * FROM student_payments WHERE id = ?', [pid]), 'payment');
  });

  router.get('/api/fees/balance/:studentId', (req) => {
    auth.requireAuth(req);
    const sid = H.int(req.params.studentId);
    auth.assertStudentVisible(db, req.user, sid);
    const fees = db.all('SELECT * FROM student_fees WHERE student_id = ?', [sid]);
    const payments = db.all('SELECT * FROM student_payments WHERE student_id = ?', [sid]);
    const charged = fees.reduce((a, f) => a + f.amount, 0);
    const paid = payments.reduce((a, p) => a + p.amount, 0);
    return { ok: true, charged, paid, balance: Math.round((charged - paid) * 100) / 100, fees, payments };
  });
};

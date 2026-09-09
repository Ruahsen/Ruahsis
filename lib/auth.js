'use strict';
/**
 * Authentication, sessions and role based access control.
 * Profiles mirror RosarioSIS: admin / teacher / parent / student.
 */
const crypto = require('crypto');
const { HttpError } = require('./router');

const SESSION_COOKIE = 'rsis_sid';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function hashPassword(plain, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), s, 64).toString('hex');
  return s + ':' + hash;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex')); }
  catch { return false; }
}

function newToken() { return crypto.randomBytes(32).toString('hex'); }

function createSession(db, staffId, ip) {
  const token = newToken();
  const now = Date.now();
  db.run(
    'INSERT INTO sessions (token, staff_id, student_id, created_at, expires_at, ip) VALUES (?,?,?,?,?,?)',
    [token, staffId, null, now, now + SESSION_TTL_MS, ip || '']
  );
  return token;
}

function destroySession(db, token) {
  if (!token) return;
  db.run('DELETE FROM sessions WHERE token = ?', [token]);
}

/** Loads req.user from the session cookie. Never throws on anonymous. */
function attachUser(db) {
  return function (req, res) {
    req.user = null;
    const cookieHeader = req.headers.cookie || '';
    const cookie = Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const i = c.indexOf('=');
        return i < 0 ? [c.trim(), ''] : [c.trim().slice(0, i), c.trim().slice(i + 1)];
      })
    );
    const token = cookie[SESSION_COOKIE];
    if (!token) return;

    const row = db.get(
      `SELECT s.*, st.id AS staff_id, st.username, st.first_name, st.middle_name, st.last_name,
              st.profile, st.profile_id, st.email, st.school_id, st.is_admin, st.last_login,
              st.title AS staff_title, st.home_phone
         FROM sessions s JOIN staff st ON st.id = s.staff_id
        WHERE s.token = ? AND s.expires_at > ? AND st.is_active = 1`,
      [token, Date.now()]
    );
    if (!row) return;
    req.sessionToken = token;
    req.user = {
      id: row.staff_id,
      staffId: row.staff_id,
      studentId: row.student_id,
      username: row.username,
      profile: row.profile,
      profileId: row.profile_id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      schoolId: row.school_id,
      isAdmin: !!row.is_admin,
      title: row.staff_title
    };
  };
}

function requireAuth(req) {
  if (!req.user) throw new HttpError(401, 'Authentication required');
  return req.user;
}

/** requireProfile('admin','teacher') -> throws 403 otherwise */
function requireProfile(...profiles) {
  return function (req) {
    const u = requireAuth(req);
    if (u.isAdmin && u.profile === 'admin') return u;
    if (!profiles.includes(u.profile)) {
      throw new HttpError(403, `Requires profile: ${profiles.join(' / ')}`);
    }
    return u;
  };
}

/** Admin, or a teacher who actually teaches the given course period. */
function requireCoursePeriodAccess(db, req, coursePeriodId) {
  const u = requireAuth(req);
  if (u.profile === 'admin') return u;
  if (u.profile !== 'teacher') throw new HttpError(403, 'Teacher access required');
  const row = db.get(
    'SELECT id FROM course_periods WHERE id = ? AND teacher_id = ?',
    [coursePeriodId, u.staffId]
  );
  if (!row) throw new HttpError(403, 'You are not the teacher of this course period');
  return u;
}

/**
 * Resolve the set of students a user is allowed to see.
 * admin/teacher -> all; student -> self; parent -> their children.
 */
function visibleStudentIds(db, user) {
  if (!user) return [];
  if (user.profile === 'admin' || user.profile === 'teacher') return null; // null = unrestricted
  if (user.profile === 'student') {
    const s = db.get('SELECT id FROM students WHERE staff_id = ?', [user.staffId]);
    return s ? [s.id] : [];
  }
  if (user.profile === 'parent') {
    const rows = db.all('SELECT student_id FROM students_join_people WHERE person_id = ?', [user.staffId]);
    return rows.map((r) => r.student_id);
  }
  return [];
}

function assertStudentVisible(db, user, studentId) {
  const allowed = visibleStudentIds(db, user);
  if (allowed === null) return true;
  if (allowed.includes(Number(studentId))) return true;
  throw new HttpError(403, 'Not authorised to access this student');
}

module.exports = {
  SESSION_COOKIE, SESSION_TTL_MS,
  hashPassword, verifyPassword, newToken,
  createSession, destroySession, attachUser,
  requireAuth, requireProfile, requireCoursePeriodAccess,
  visibleStudentIds, assertStudentVisible
};

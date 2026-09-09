'use strict';
/**
 * RUAHSIS -- Vercel Serverless entry point.
 *
 * server.js runs a long-lived http.Server, which does not work on Vercel's
 * serverless runtime. This module exposes the same router stack as a
 * request handler instead:
 *
 *   - Database is lazily opened on first request (module scope survives
 *     between invocations of the same Lambda instance).
 *   - The same "never locked out" seeding from server.js applies.
 *   - Static assets are served by Vercel from /public (filesystem is checked
 *     before rewrites); the serveStatic fallback below only runs if a
 *     request slips past it.
 */
const fs = require('fs');
const path = require('path');
const { Router, HttpError, serveStatic, json, errorHandler } = require('../lib/router');
const { open, initSchema, DB, log } = require('../lib/db');
const auth = require('../lib/auth');
const registerRoutes = require('../routes');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

let appPromise = null;

function bootstrap() {
  if (!appPromise) {
    appPromise = (async () => {
      const db = new DB(initSchema(open()));

      // Same lock-out protection as server.js: guarantee an admin exists.
      if (db.count('SELECT COUNT(*) c FROM staff') === 0) {
        db.run(
          `INSERT INTO staff (staff_id, username, password, first_name, last_name, profile, profile_id, is_admin, is_active, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          ['STF001', 'admin', auth.hashPassword('admin'), 'System', 'Administrator', 'admin', 1, 1, 1, Date.now()]
        );
        db.run(`INSERT INTO schools (title, short_name, created_at) VALUES (?,?,?)`, ['My School', 'MS', Date.now()]);
        console.log('  [!] Empty database: created default admin account (admin / admin)');
      }

      const router = new Router();

      // Public session routes (mirrored from server.js)
      router.post('/api/auth/login', (req, res) => {
        const { username, password } = req.body || {};
        if (!username || !password) throw new HttpError(400, 'Username and password are required');
        const staff = db.get('SELECT * FROM staff WHERE (username = ? OR email = ?) AND is_active = 1', [username, username]);
        if (!staff || !auth.verifyPassword(password, staff.password)) {
          if (staff) db.run('UPDATE staff SET failed_logins = failed_logins + 1 WHERE id = ?', [staff.id]);
          throw new HttpError(401, 'Invalid username or password');
        }
        const token = auth.createSession(db, staff.id, req.socket.remoteAddress);
        db.run('UPDATE staff SET last_login = ?, failed_logins = 0 WHERE id = ?', [Date.now(), staff.id]);
        log(db, staff.id, staff.username, 'login', 'Successful login');
        const maxAge = Math.floor(auth.SESSION_TTL_MS / 1000);
        res.setHeader('Set-Cookie',
          `${auth.SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
        return {
          ok: true,
          token,
          user: {
            id: staff.id, username: staff.username, profile: staff.profile, isAdmin: !!staff.is_admin,
            name: [staff.first_name, staff.last_name].filter(Boolean).join(' '),
            schoolId: staff.school_id, email: staff.email
          }
        };
      });

      router.post('/api/auth/logout', (req, res) => {
        if (req.sessionToken) auth.destroySession(db, req.sessionToken);
        res.setHeader('Set-Cookie', `${auth.SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
        return { ok: true };
      });

      router.get('/api/auth/me', (req) => {
        if (!req.user) throw new HttpError(401, 'Not authenticated');
        const u = req.user;
        let studentId = u.studentId || null;
        if (u.profile === 'student' && !studentId) {
          const s = db.get('SELECT id FROM students WHERE staff_id = ?', [u.id]);
          studentId = s ? s.id : null;
        }
        return {
          ok: true,
          user: {
            id: u.id, staffId: u.staffId, username: u.username, profile: u.profile, isAdmin: u.isAdmin,
            name: u.name, firstName: u.firstName, lastName: u.lastName, email: u.email,
            schoolId: u.schoolId, studentId, title: u.title
          }
        };
      });

      router.get('/api/health', () => ({ ok: true, service: 'RUAHSIS ASCII', time: new Date().toISOString() }));

      registerRoutes(router, db, auth, {
        logActivity: (req, action, detail) => {
          if (req.user) log(db, req.user.id, req.user.username, action, detail);
        }
      });
      router.use(auth.attachUser(db));

      return { router, db };
    })().catch((err) => { appPromise = null; throw err; });
  }
  return appPromise;
}

const staticHandler = fs.existsSync(PUBLIC_DIR) ? serveStatic(PUBLIC_DIR) : null;

module.exports = async (req, res) => {
  // Vercel rewrites "/api/x" -> "/api/api/x" (see vercel.json) because the
  // platform replaces req.url with the rewrite destination. Normalise back to
  // the original path here; when the destination is preserved verbatim the
  // extra prefix is simply absent and nothing changes.
  if (req.url === '/api/api') req.url = '/api';
  else if (req.url.startsWith('/api/api/')) req.url = req.url.slice(4);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    req.headers.cookie = (req.headers.cookie ? req.headers.cookie + '; ' : '') + auth.SESSION_COOKIE + '=' + req.headers.authorization.slice(7);
  }
  try {
    const { router } = await bootstrap();

    if (req.method === 'GET' && !req.url.startsWith('/api/')) {
      await staticHandler(req, res);
      if (res.servedStatic) return;
    }

    const result = await router.handle(req, res);
    if (!res.writableEnded) {
      if (result === undefined) json(res, { ok: true });
      else json(res, result);
    }
  } catch (err) {
    errorHandler(err, req, res);
  }
};

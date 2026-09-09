'use strict';
/**
 * RUAHSIS -- Student Information System (ASCII Web Edition)
 * Zero dependency Node.js HTTP server.
 *
 *   npm start        -> http://localhost:8787
 *   PORT=9000 npm start
 */
const http = require('http');
const path = require('path');
const os = require('os');
const { Router, HttpError, serveStatic, json, errorHandler } = require('./lib/router');
const { open, initSchema, DB, log } = require('./lib/db');
const auth = require('./lib/auth');
const registerRoutes = require('./routes');

const PORT = parseInt(process.env.PORT, 10) || 8787;
const HOST = process.env.HOST || '0.0.0.0';

const db = new DB(initSchema(open()));

// Make sure at least one admin exists so the system is never locked out.
const staffCount = db.count('SELECT COUNT(*) c FROM staff');
if (staffCount === 0) {
  db.run(`INSERT INTO staff (staff_id, username, password, first_name, last_name, profile, profile_id, is_admin, is_active, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ['STF001', 'admin', auth.hashPassword('admin'), 'System', 'Administrator', 'admin', 1, 1, 1, Date.now()]);
  db.run(`INSERT INTO schools (title, short_name, created_at) VALUES (?,?,?)`, ['My School', 'MS', Date.now()]);
  console.log('\n  [!] Empty database: created default admin account (admin / admin)\n');
}

const router = new Router();
const logActivity = (req, action, detail) => {
  if (req.user) log(db, req.user.id, req.user.username, action, detail);
};

registerRoutes(router, db, auth, { logActivity });

// Public session bootstrap
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

// --------------------------------------------------------------- middleware
router.use(auth.attachUser(db));

const staticHandler = serveStatic(path.join(__dirname, 'public'));

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    req.headers.cookie = (req.headers.cookie ? req.headers.cookie + '; ' : '') + auth.SESSION_COOKIE + '=' + req.headers.authorization.slice(7);
  }
  try {
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
});

server.listen(PORT, HOST, () => {
  const nets = os.networkInterfaces();
  const lan = Object.values(nets).flat().find((n) => n && n.family === 'IPv4' && !n.internal);
  const line = (s) => '  | ' + s.padEnd(56) + ' |';
  console.log('\n  +' + '-'.repeat(58) + '+');
  console.log(line('  R U A H S I S   ::   S T U D E N T   I N F O'));
  console.log(line(''));
  console.log(line('  ASCII Web Edition  -  running'));
  console.log(line(''));
  console.log(line('  Local:    http://localhost:' + PORT));
  if (lan) console.log(line('  Network:  http://' + lan.address + ':' + PORT));
  console.log(line(''));
  console.log(line('  Database: ' + require('./lib/db').DB_PATH));
  console.log(line('  Default login:  admin / admin'));
  console.log('  +' + '-'.repeat(58) + '+\n');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('\n  [X] Port ' + PORT + ' is already in use. Try:  PORT=8788 npm start\n');
    process.exit(1);
  }
  throw e;
});

process.on('SIGINT', () => { console.log('\n  Shutting down RUAHSIS...\n'); process.exit(0); });

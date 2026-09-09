'use strict';
/**
 * SQLite wrapper around the built-in `node:sqlite` DatabaseSync driver.
 * Exposes helper query helpers used across all route modules.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

// Vercel's filesystem is read-only outside /tmp, so the SQLite database must
// live there in serverless deployments (RSIS_DB can override it anywhere).
const DB_PATH = process.env.RSIS_DB
  || (process.env.VERCEL ? path.join(os.tmpdir(), 'ruahsis.db') : path.join(__dirname, '..', 'data', 'rosariosis.db'));

let db = null;

function open() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  return db;
}

function initSchema(database = open()) {
  // resolve from a few locations so the file is found even when bundled
  const candidates = [
    path.join(__dirname, 'schema.sql'),
    path.join(process.cwd(), 'lib', 'schema.sql'),
    path.join(process.cwd(), 'schema.sql')
  ];
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) throw new Error('schema.sql not found (looked in: ' + candidates.join(', ') + ')');
  database.exec(fs.readFileSync(file, 'utf8'));
  return database;
}

/** Normalise values for node:sqlite (booleans -> 0/1, undefined -> null). */
function norm(v) {
  if (v === undefined) return null;
  if (v === true) return 1;
  if (v === false) return 0;
  return v;
}

class DB {
  constructor(database) { this.db = database || open(); }

  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    const r = stmt.run(...params.map(norm));
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }
  get(sql, params = []) {
    return this.db.prepare(sql).get(...params.map(norm)) || null;
  }
  all(sql, params = []) {
    return this.db.prepare(sql).all(...params.map(norm));
  }
  exec(sql) { return this.db.exec(sql); }
  count(sql, params = []) {
    const row = this.db.prepare(sql).get(...params.map(norm));
    return row ? Number(Object.values(row)[0] || 0) : 0;
  }
  transaction(fn) {
    this.db.exec('BEGIN');
    try { const r = fn(); this.db.exec('COMMIT'); return r; }
    catch (e) { try { this.db.exec('ROLLBACK'); } catch (_) {} throw e; }
  }
  get raw() { return this.db; }
}

/** Build "SET a = ?, b = ?" from a whitelist of columns present in body. */
function buildUpdate(table, id, body, columns, opts = {}) {
  const sets = [];
  const params = [];
  for (const c of columns) {
    if (Object.prototype.hasOwnProperty.call(body, c)) {
      sets.push(`${c} = ?`);
      params.push(body[c]);
    }
  }
  if (!sets.length) return null;
  const stampCol = opts.stampColumn || 'updated_at';
  const sql = opts.stamp === false
    ? `UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`
    : `UPDATE ${table} SET ${sets.join(', ')}, ${stampCol} = ? WHERE id = ?`;
  const finalParams = opts.stamp === false ? [...params, id] : [...params, Date.now(), id];
  return { sql, params: finalParams };
}

/** Build INSERT from columns present in body. */
function buildInsert(table, body, columns) {
  const cols = [];
  const placeholders = [];
  const params = [];
  for (const c of columns) {
    if (Object.prototype.hasOwnProperty.call(body, c)) {
      cols.push(c);
      placeholders.push('?');
      params.push(body[c]);
    }
  }
  return { sql: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`, params };
}

/** Parse filters from query string: filter[field]=value */
function applyFilters(req, columnMap, where = [], params = []) {
  const f = req.query.filter || {};
  for (const [key, col] of Object.entries(columnMap)) {
    if (f[key] !== undefined && f[key] !== '') {
      where.push(`${col} = ?`);
      params.push(f[key]);
    }
  }
  return { where, params };
}

/** Parse sorting + pagination from query. */
function paging(req, defaultSort = '1', maxLimit = 500) {
  const limit = Math.min(parseInt(req.query.limit, 10) || maxLimit, 2000);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  let orderBy = defaultSort;
  const sort = req.query.sort;
  const dir = String(req.query.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  if (sort && /^[A-Za-z_][A-Za-z0-9_.]*$/.test(sort)) orderBy = `${sort} ${dir}`;
  return { limit, offset, orderBy, dir };
}

/** LIKE search across columns. */
function searchClause(req, columns) {
  const q = req.query.search || req.query.q;
  if (!q || !String(q).trim()) return { clause: '', params: [] };
  const parts = columns.map((c) => `${c} LIKE ?`);
  const like = `%${String(q).trim()}%`;
  return { clause: '(' + parts.join(' OR ') + ')', params: columns.map(() => like) };
}

function log(database, staffId, username, action, detail) {
  try {
    database.run(
      'INSERT INTO activity_log (staff_id, username, action, detail, created_at) VALUES (?,?,?,?,?)',
      [staffId, username, action, detail, Date.now()]
    );
  } catch (_) { /* logging must never break a request */ }
}

module.exports = {
  DB_PATH, open, initSchema, DB, buildUpdate, buildInsert, applyFilters, paging, searchClause, log, norm
};

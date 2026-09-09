'use strict';
const { HttpError } = require('../lib/router');

function int(v, def = null) {
  if (v === undefined || v === null || v === '') return def;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : n;
}
function num(v, def = null) {
  if (v === undefined || v === null || v === '') return def;
  const n = parseFloat(v);
  return Number.isNaN(n) ? def : n;
}
function str(v, def = null) {
  if (v === undefined || v === null) return def;
  const s = String(v).trim();
  return s === '' ? def : s;
}
function yes(v) { return v === true || v === 1 || v === '1' || v === 'true' || v === 'on'; }

/** Standard envelope for list endpoints. */
function list(rows, req, total) {
  return {
    ok: true,
    data: rows,
    total: total === undefined ? rows.length : total,
    limit: int(req && req.query.limit, rows.length),
    offset: int(req && req.query.offset, 0)
  };
}
function one(row, key = 'item') {
  return { ok: true, [key]: row };
}
function done(message, extra) {
  return { ok: true, message, ...(extra || {}) };
}

function requireId(req, name = 'id') {
  const id = int(req.params[name]);
  if (!id) throw new HttpError(400, 'Invalid id');
  return id;
}

function requireBody(req, fields) {
  for (const f of fields) {
    if (req.body[f] === undefined || req.body[f] === null || String(req.body[f]).trim() === '') {
      throw new HttpError(400, `Field "${f}" is required`);
    }
  }
}

/** Resolve the active school year (explicit param > query > current flag > latest). */
function currentSchoolYear(db, req) {
  if (req && req.query.school_year_id) return int(req.query.school_year_id);
  if (req && req.params.school_year_id) return int(req.params.school_year_id);
  const row = db.get('SELECT id FROM school_years WHERE is_current = 1 LIMIT 1');
  if (row) return row.id;
  const latest = db.get('SELECT id FROM school_years ORDER BY start_date DESC LIMIT 1');
  return latest ? latest.id : null;
}

function currentSchool(db, req) {
  if (req && req.query.school_id) return int(req.query.school_id);
  if (req && req.user && req.user.schoolId) return req.user.schoolId;
  const s = db.get('SELECT id FROM schools ORDER BY id LIMIT 1');
  return s ? s.id : null;
}

/** Marking period that contains today's date (falls back to Q1 of the year). */
function currentMarkingPeriod(db, schoolYearId) {
  const today = new Date().toISOString().slice(0, 10);
  const mp = db.get(
    `SELECT id FROM marking_periods WHERE school_year_id = ? AND mp_type = 'quarter'
      AND start_date <= ? AND end_date >= ? ORDER BY sort_order LIMIT 1`,
    [schoolYearId, today, today]
  );
  if (mp) return mp.id;
  const any = db.get(`SELECT id FROM marking_periods WHERE school_year_id = ? AND mp_type = 'quarter' ORDER BY sort_order LIMIT 1`, [schoolYearId]);
  return any ? any.id : null;
}

function touch(db, table, id) {
  try { db.run(`UPDATE ${table} SET updated_at = ? WHERE id = ?`, [Date.now(), id]); } catch (_) {}
}

/** Recompute filled_seats for a course period from the schedule table. */
function recalcSeats(db, coursePeriodId) {
  const c = db.count('SELECT COUNT(*) c FROM schedule WHERE course_period_id = ?', [coursePeriodId]);
  db.run('UPDATE course_periods SET filled_seats = ? WHERE id = ?', [c, coursePeriodId]);
  return c;
}

module.exports = { int, num, str, yes, list, one, done, requireId, requireBody, currentSchoolYear, currentSchool, currentMarkingPeriod, touch, recalcSeats };

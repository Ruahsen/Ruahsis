'use strict';
/**
 * Minimal zero-dependency HTTP router + middleware chain.
 * Supports: /path/:param  patterns, JSON bodies, static file serving.
 */
const fs = require('fs');
const path = require('path');
const url = require('url');

/**
 * Expand bracketed query keys ( `filter[grade_level]=9` ) into nested objects.
 * Node's legacy querystring parser keeps those keys flat, which is why we
 * roll our own here -- every route reads `req.query.filter`.
 */
function expandQuery(searchParams) {
  const out = {};
  for (const [k, v] of searchParams.entries()) {
    const m = /^([^[\]]+)\[([^[\]]+)\]$/.exec(k);
    if (m) (out[m[1]] || (out[m[1]] = {}))[m[2]] = v;
    else out[k] = v;
  }
  return out;
}

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

class Router {
  constructor() {
    this.routes = [];
    this.middleware = [];
  }

  use(fn) {
    this.middleware.push(fn);
    return this;
  }

  _add(method, pattern, handler) {
    const parts = pattern.split('/').filter(Boolean).map((p) => {
      if (p.startsWith(':')) return { param: p.slice(1) };
      return { literal: p };
    });
    this.routes.push({ method, parts, handler, pattern });
    return this;
  }

  get(p, h) { return this._add('GET', p, h); }
  post(p, h) { return this._add('POST', p, h); }
  put(p, h) { return this._add('PUT', p, h); }
  patch(p, h) { return this._add('PATCH', p, h); }
  del(p, h) { return this._add('DELETE', p, h); }

  // Auto CRUD: GET /, GET /:id, POST /, PUT /:id, DELETE /:id
  resource(pattern, handlers) {
    if (handlers.list) this.get(pattern, handlers.list);
    if (handlers.get) this.get(pattern + '/:id', handlers.get);
    if (handlers.create) this.post(pattern, handlers.create);
    if (handlers.update) this.put(pattern + '/:id', handlers.update);
    if (handlers.remove) this.del(pattern + '/:id', handlers.remove);
    return this;
  }

  match(method, pathname) {
    const segs = pathname.split('/').filter(Boolean);
    for (const r of this.routes) {
      if (r.method !== method) continue;
      if (r.parts.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        const p = r.parts[i];
        if (p.param) params[p.param] = decodeURIComponent(segs[i]);
        else if (p.literal !== segs[i]) { ok = false; break; }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }

  async handle(req, res) {
    const parsed = new URL(req.url, 'http://ruahsis.local');
    req.pathname = parsed.pathname;
    req.query = expandQuery(parsed.searchParams);

    // ---- body parsing ----
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
      const chunks = [];
      let size = 0;
      await new Promise((resolve, reject) => {
        req.on('data', (c) => {
          size += c.length;
          if (size > 8 * 1024 * 1024) { reject(new HttpError(413, 'Payload too large')); req.destroy(); return; }
          chunks.push(c);
        });
        req.on('end', resolve);
        req.on('error', reject);
      });
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) {
        try { req.body = JSON.parse(raw); }
        catch { throw new HttpError(400, 'Malformed JSON body'); }
      } else req.body = {};
    } else req.body = {};

    const m = this.match(req.method, parsed.pathname);
    if (!m) throw new HttpError(404, 'Not found: ' + req.method + ' ' + parsed.pathname);
    req.params = m.params;

    for (const mw of this.middleware) {
      await mw(req, res);
      if (res.writableEnded) return;
    }
    return await m.handler(req, res);
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2'
};

function serveStatic(rootDir) {
  return async function (req, res) {
    if (req.method !== 'GET') return;
    // NOTE: req.pathname is only assigned inside Router#handle(), which runs
    // after this handler -- so parse the URL ourselves.
    let rel = req.pathname || decodeURIComponent(url.parse(req.url).pathname || '/');
    if (rel === '/' || rel === '') rel = '/index.html';
    const filePath = path.join(rootDir, path.normalize(rel).replace(/^([/\\])+/, ''));
    if (!filePath.startsWith(path.resolve(rootDir))) throw new HttpError(403, 'Forbidden');
    let stat;
    try { stat = fs.statSync(filePath); } catch { throw new HttpError(404, 'File not found: ' + rel); }
    if (stat.isDirectory()) throw new HttpError(404, 'Not found');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
    res.servedStatic = true;
  };
}

function json(res, data, status = 200) {
  const payload = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function errorHandler(err, req, res) {
  const status = err.status || 500;
  const body = { ok: false, error: err.message || 'Internal server error' };
  if (err.details) body.details = err.details;
  if (status >= 500) console.error('[ERR]', req.method, req.url, err.stack || err.message);
  if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  if (!res.writableEnded) res.end(JSON.stringify(body));
}

module.exports = { Router, HttpError, serveStatic, json, errorHandler };

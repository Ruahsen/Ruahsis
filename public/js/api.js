/* =====================================================================
   api.js -- thin JSON client for the RUAHSIS backend
   ===================================================================== */
(function (R) {
  'use strict';

  const TOKEN_KEY = 'rsis_token';

  const api = {
    get token() { return localStorage.getItem(TOKEN_KEY) || ''; },
    set token(v) { if (v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); },

    async request(method, path, body) {
      const headers = { 'Content-Type': 'application/json' };
      if (api.token) headers.Authorization = 'Bearer ' + api.token;
      let res;
      try {
        res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch (e) {
        throw new Error('Network error - is the server running?');
      }
      let json = null;
      const text = await res.text();
      try { json = JSON.parse(text); } catch (_) { /* non json */ }
      if (res.status === 401) {
        // Only force a logout when we *had* a session. A 401 from /login just
        // means "wrong password" -- reloading the page there would be wrong.
        const hadSession = !!(R.App && R.App.user) && !path.startsWith('/api/auth/login');
        api.token = '';
        if (hadSession) R.App.logout(true);
      }
      if (!res.ok || (json && json.ok === false)) {
        const msg = (json && json.error) || ('HTTP ' + res.status);
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      return json;
    },

    get: (p) => api.request('GET', p),
    post: (p, b) => api.request('POST', p, b),
    put: (p, b) => api.request('PUT', p, b),
    del: (p) => api.request('DELETE', p),

    /** helper to build a query string from an object */
    qs(params) {
      const parts = [];
      for (const k in params) {
        const v = params[k];
        if (v === null || v === undefined || v === '') continue;
        if (typeof v === 'object' && v !== null) {
          // nested object -> filter[...]=...  (braces are required here: an
          // unbraced `else` would bind to the inner `if`, not this one)
          for (const kk in v) {
            const vv = v[kk];
            if (vv === '' || vv === null || vv === undefined) continue;
            parts.push('filter[' + kk + ']=' + encodeURIComponent(vv));
          }
        } else {
          parts.push(k + '=' + encodeURIComponent(v));
        }
      }
      return parts.length ? '?' + parts.join('&') : '';
    }
  };

  R.api = api;
})(window.RSIS);

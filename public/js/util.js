/* =====================================================================
   util.js -- string formatting + ASCII table / box rendering
   ===================================================================== */
window.RSIS = window.RSIS || {};

(function (R) {
  'use strict';

  /* ------------------------------------------------------ ASCII banner */
  const LOGO = [
    '██████╗ ██╗   ██╗ █████╗ ██╗  ██╗███████╗██╗███████╗',
    '██╔══██╗██║   ██║██╔══██╗██║  ██║██╔════╝██║██╔════╝',
    '██████╔╝██║   ██║███████║███████║███████╗██║███████╗',
    '██╔══██╗██║   ██║██╔══██║██╔══██║╚════██║██║╚════██║',
    '██║  ██║╚██████╔╝██║  ██║██║  ██║███████║██║███████║',
    '╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝╚══════╝'
  ];


  const U = {
    LOGO,

    /* ------------------------------------------------------ basics */
    esc(s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    s(v) { return v === null || v === undefined || v === '' ? '—' : String(v); },
    n(v, d) { const x = parseFloat(v); return isNaN(x) ? (d === undefined ? 0 : d) : x; },
    pad(s, w, align) {
      s = String(s === null || s === undefined ? '' : s);
      if (s.length > w) s = s.slice(0, Math.max(0, w - 1)) + '…';
      if (align === 'r') return s.padStart(w, ' ');
      if (align === 'c') { const p = Math.max(0, Math.floor((w - s.length) / 2)); return ' '.repeat(p) + s.padEnd(w - p, ' '); }
      return s.padEnd(w, ' ');
    },
    repeat(ch, n) { return n > 0 ? ch.repeat(n) : ''; },
    /** truncate (or pad) to exactly n characters */
    cut(s, n) { return U.pad(s, n); },

    /* ------------------------------------------------------ formats */
    date(v) {
      if (!v) return '—';
      if (typeof v === 'number' || /^\d+$/.test(v)) return new Date(Number(v)).toISOString().slice(0, 10);
      return String(v).slice(0, 10);
    },
    datetime(v) {
      if (!v) return '—';
      const d = new Date(Number(v));
      return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 16).replace('T', ' ');
    },
    money(v) {
      const n = U.n(v, 0);
      return (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
    pct(v, digits) {
      const d = digits === undefined ? 1 : digits;
      return v === null || v === undefined ? '—' : U.n(v).toFixed(d) + '%';
    },
    name(o) {
      if (!o) return '—';
      return [o.first_name, o.last_name].filter(Boolean).join(' ');
    },
    nameLast(o) {
      if (!o) return '—';
      return [o.last_name, o.first_name].filter(Boolean).join(', ');
    },
    age(birth) {
      if (!birth) return null;
      const b = new Date(birth), t = new Date();
      let a = t.getFullYear() - b.getFullYear();
      const m = t.getMonth() - b.getMonth();
      if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
      return a;
    },

    /* ------------------------------------------------------ ascii charts */
    /** horizontal bar, e.g. bar(62, 20) -> "████████████░░░░░░░░" */
    bar(value, max, width, full, empty) {
      const w = width || 20;
      const v = Math.max(0, Math.min(1, max ? value / max : 0));
      const f = Math.round(v * w);
      return U.repeat(full || '█', f) + U.repeat(empty || '░', w - f);
    },
    /** vertical sparkline of rates -> "▁▃▅▇▅▃" */
    spark(values) {
      const chars = ' ▁▂▃▄▅▆▇█';
      if (!values || !values.length) return '';
      const max = Math.max.apply(null, values) || 1;
      return values.map((v) => chars[Math.min(chars.length - 1, Math.round((v / max) * (chars.length - 1)))]).join('');
    },

    /* ------------------------------------------------------ responsive */
    /** True on phone-sized viewports, where wide ASCII must not just scroll. */
    narrow() {
      if (typeof window === 'undefined' || !window.matchMedia) return false;
      return window.matchMedia('(max-width: 760px)').matches;
    },

    /* ------------------------------------------------------ ascii table */
    /**
     * Narrow screens: render each record as a stacked ASCII card instead of
     * a wide row. Still one clickable `.trow` per record.
     */
    tableCards(opts, cols, rows, width) {
      const idKey = opts.idKey || 'id';
      const w = Math.max(30, Math.min(64, width || U.cols()));
      const inner = w - 4;
      const labelW = Math.max.apply(null, cols.map((c) => String(c.title || '').length).concat([4]));
      const valW = Math.max(8, inner - labelW - 3);
      const rule = (l, r, ch) => l + U.repeat(ch, w - 2) + r;
      const kv = (label, val) => '│ ' + U.pad(label, labelW) + ' : ' + U.pad(val, valW) + ' │';

      const out = [];
      out.push(U.box(opts.title || 'RESULTS', opts.footer ? [String(opts.footer)] : [], w));
      const rowStart = out.length;

      rows.forEach((r) => {
        const lines = [rule('┌', '┐', '─')];
        // first column becomes the card heading
        const p = cols[0];
        const pv = p.fmt ? p.fmt(r, p) : r[p.key];
        lines.push('│ ' + U.pad(pv === null || pv === undefined ? '' : String(pv), inner) + ' │');
        if (cols.length > 1) lines.push(rule('├', '┤', '─'));
        cols.slice(1).forEach((c) => {
          const raw = c.fmt ? c.fmt(r, c) : r[c.key];
          lines.push(kv(String(c.title || ''), raw === null || raw === undefined ? '' : String(raw)));
        });
        lines.push(rule('└', '┘', '─'));
        out.push(lines.join('\n'));
      });

      const esc = out.map(U.esc);
      for (let i = 0; i < rows.length; i++) {
        const id = rows[i][idKey];
        esc[rowStart + i] = '<span class="trow' + (String(id) === String(opts.selectId) ? ' sel' : '') +
          '" data-id="' + U.esc(id) + '">' + esc[rowStart + i] + '</span>';
      }
      return '<pre class="ascii" data-table="1">' + esc.join('\n') + '</pre>';
    },

    /**
     * opts: { columns:[{title,key,width,align,fmt,max}], rows:[], idKey,
     *         empty, selectId, footer }
     * Returns HTML for a <pre class="ascii">.
     */
    table(opts) {
      const cols = opts.columns || [];
      const rows = opts.rows || [];
      const idKey = opts.idKey || 'id';
      if (rows.length && U.narrow() && cols.length) {
        return U.tableCards(opts, cols, rows);
      }
      if (!rows.length) {
        return '<pre class="ascii">' + U.esc(U.box(opts.title || 'RESULTS', [opts.empty || '   (no records found)   '], opts.width || 60)) + '</pre>';
      }
      // ---- widths
      cols.forEach((c) => {
        let w = String(c.title || '').length;
        rows.forEach((r) => {
          const raw = c.fmt ? c.fmt(r, c) : r[c.key];
          const len = String(raw === null || raw === undefined ? '' : raw).length;
          if (len > w) w = len;
        });
        c._w = Math.min(c.width || (c.max || 32), Math.max(String(c.title || '').length, w));
      });

      const line = (l, m, r, ch) => l + cols.map((c) => U.repeat(ch, c._w + 2)).join(m) + r;
      const rowLine = (cells) => '│ ' + cells.map((t, i) => U.pad(t, cols[i]._w, cols[i].align)).join(' │ ') + ' │';

      const out = [];
      out.push(line('┌', '┬', '┐', '─'));
      out.push(rowLine(cols.map((c) => String(c.title || ''))));
      out.push(line('╞', '╪', '╡', '═'));
      const rowStart = out.length;
      rows.forEach((r) => {
        out.push(rowLine(cols.map((c) => {
          const raw = c.fmt ? c.fmt(r, c) : r[c.key];
          return raw === null || raw === undefined ? '' : String(raw);
        })));
      });
      out.push(line('└', '┴', '┘', '─'));

      // ---- wrap data rows in clickable spans
      const esc = out.map(U.esc);
      for (let i = 0; i < rows.length; i++) {
        const id = rows[i][idKey];
        esc[rowStart + i] = '<span class="trow' + (String(id) === String(opts.selectId) ? ' sel' : '') +
          '" data-id="' + U.esc(id) + '">' + esc[rowStart + i] + '</span>';
      }
      let html = esc.join('\n');
      if (opts.footer) html += '\n' + U.esc(opts.footer);
      return '<pre class="ascii" data-table="1">' + html + '</pre>';
    },

    /* ------------------------------------------------------ ascii box */
    /** Wrap text lines inside a bordered box of `width` columns. */
    box(title, lines, width) {
      const w = Math.max((width || 60), (title ? title.length + 8 : 0), 20);
      const out = [];
      if (title) {
        const head = '─[ ' + title + ' ]';
        out.push('┌' + head + U.repeat('─', Math.max(0, w - 2 - head.length)) + '┐');
      } else {
        out.push('┌' + U.repeat('─', w - 2) + '┐');
      }
      (lines || []).forEach((l) => {
        out.push('│ ' + U.pad(l, w - 4) + ' │');
      });
      out.push('└' + U.repeat('─', w - 2) + '┘');
      return out.join('\n');
    },

    /** two-column key/value block rendered as ascii */
    kvbox(title, pairs, width) {
      const w = width || 64;
      const klen = Math.max.apply(null, pairs.map((p) => String(p[0]).length).concat([4]));
      const lines = pairs.map((p) => U.pad(p[0], klen) + ' : ' + U.s(p[1]));
      return U.box(title, lines, w);
    },

    /** side by side ascii boxes (stacked on narrow screens) */
    row(boxes, gap) {
      if (U.narrow()) return boxes.join('\n');
      const g = gap === undefined ? 2 : gap;
      const blocks = boxes.map((b) => b.split('\n'));
      const h = Math.max.apply(null, blocks.map((b) => b.length));
      const widths = blocks.map((b) => Math.max.apply(null, b.map((l) => l.length)));
      const out = [];
      for (let i = 0; i < h; i++) {
        out.push(blocks.map((b, j) => U.pad(b[i] === undefined ? '' : b[i], widths[j])).join(U.repeat(' ', g)));
      }
      return out.join('\n');
    },

    /* ------------------------------------------------------ misc */
    /** terminal width of an element in characters */
    cols(el) {
      const e = el || document.getElementById('main');
      if (!e) return 100;
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-family:' +
        getComputedStyle(e).fontFamily + ';font-size:' + getComputedStyle(e).fontSize;
      probe.textContent = '0'.repeat(100);
      document.body.appendChild(probe);
      const w = probe.getBoundingClientRect().width / 100;
      probe.remove();
      return Math.max(40, Math.floor((e.clientWidth - 24) / w));
    },

    titleCase(s) {
      return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    },

    download(filename, text, mime) {
      const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },

    /** strip html -> plain text (for exports) */
    plain(html) {
      const d = document.createElement('div');
      d.innerHTML = html;
      return d.textContent;
    }
  };

  R.U = U;
})(window.RSIS);

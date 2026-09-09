/* =====================================================================
   ui.js -- toast, modal, form builder, HTML grid, shared widgets
   ===================================================================== */
(function (R) {
  'use strict';
  const U = R.U;

  const UI = {
    /* ---------------------------------------------------------- toast */
    toast(msg, kind) {
      const box = document.getElementById('toast');
      const el = document.createElement('div');
      el.className = 't ' + (kind || 'ok');
      el.textContent = (kind === 'err' ? '[!] ' : '[ok] ') + msg;
      box.appendChild(el);
      setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 2600);
      setTimeout(() => el.remove(), 3100);
    },
    ok(m) { UI.toast(m, 'ok'); },
    err(m) { UI.toast(m, 'err'); },

    /* ---------------------------------------------------------- modal */
    /** fields: [{name,label,type,value,options,required,readonly,placeholder,rows}] */
    modal(opts) {
      const wrap = document.getElementById('modal');
      const fields = opts.fields || [];
      const bodyHtml = fields.map((f) => {
        const id = 'f_' + f.name;
        let input;
        if (f.type === 'select') {
          input = '<select id="' + id + '"' + (f.required ? ' required' : '') + '>' +
            (f.options || []).map((o) => {
              const v = typeof o === 'object' ? o.value : o;
              const t = typeof o === 'object' ? o.label : o;
              return '<option value="' + U.esc(v) + '"' + (String(v) === String(f.value === undefined ? '' : f.value) ? ' selected' : '') + '>' + U.esc(t) + '</option>';
            }).join('') + '</select>';
        } else if (f.type === 'textarea') {
          input = '<textarea id="' + id + '" rows="' + (f.rows || 4) + '" placeholder="' + U.esc(f.placeholder || '') + '">' + U.esc(f.value === undefined ? '' : f.value) + '</textarea>';
        } else if (f.type === 'checkbox') {
          input = '<input type="checkbox" id="' + id + '"' + (f.value ? ' checked' : '') + '>';
        } else if (f.type === 'static') {
          input = '<span class="val">' + U.esc(f.value === undefined ? '' : f.value) + '</span>';
        } else {
          input = '<input type="' + (f.type || 'text') + '" id="' + id + '" value="' + U.esc(f.value === undefined ? '' : f.value) +
            '" placeholder="' + U.esc(f.placeholder || '') + '"' + (f.required ? ' required' : '') + (f.readonly ? ' readonly' : '') + '>';
        }
        return '<div class="form-row"><label for="' + id + '">' + U.esc(f.label) + '</label><div class="f">' + input + '</div></div>';
      }).join('');

      wrap.innerHTML =
        '<div class="box">' +
        '<div class="title"><span>┤ ' + U.esc(opts.title || '') + ' ├</span><span class="x" data-close="1">[ X ]</span></div>' +
        '<div class="content">' + (opts.html || bodyHtml) + '</div>' +
        '<div class="actions">' +
        (opts.extra || '') +
        (opts.onDelete ? '<button class="danger" data-del="1">[ DELETE ]</button>' : '') +
        '<button data-close="1">[ CANCEL ]</button>' +
        '<button class="primary" data-save="1">[ ' + U.esc(opts.saveLabel || 'SAVE') + ' ]</button>' +
        '</div></div>';
      wrap.classList.remove('hidden');

      const close = () => { wrap.classList.add('hidden'); wrap.innerHTML = ''; };
      wrap.querySelectorAll('[data-close]').forEach((b) => b.onclick = close);
      wrap.onclick = (e) => { if (e.target === wrap) close(); };
      document.onkeydown = (e) => { if (e.key === 'Escape') { close(); document.onkeydown = null; } };

      wrap.querySelector('[data-save]').onclick = async () => {
        const data = {};
        for (const f of fields) {
          if (f.type === 'static') continue;
          const el = document.getElementById('f_' + f.name);
          if (!el) continue;
          data[f.name] = f.type === 'checkbox' ? (el.checked ? 1 : 0) : (f.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value);
          if (f.required && (data[f.name] === '' || data[f.name] === null)) { UI.err(f.label + ' is required'); el.focus(); return; }
        }
        try {
          await opts.onSave(data);
          close();
          if (opts.after) opts.after();
        } catch (e) { UI.err(e.message); }
      };
      if (opts.onDelete) {
        wrap.querySelector('[data-del]').onclick = async () => {
          if (!confirm('Delete this record? This cannot be undone.')) return;
          try { await opts.onDelete(); close(); if (opts.after) opts.after(); }
          catch (e) { UI.err(e.message); }
        };
      }
      const first = wrap.querySelector('input:not([readonly]),select,textarea');
      if (first) first.focus();
      return { close };
    },

    confirm(msg, onYes) {
      UI.modal({
        title: 'CONFIRM',
        html: '<pre class="ascii">' + U.esc(msg) + '</pre>',
        saveLabel: 'YES',
        onSave: async () => { await onYes(); }
      });
    },

    /* ---------------------------------------------------------- html grid */
    /** cols:[{title,key,width,align,fmt}]; rows:[obj]; editable cells via cell input */
    grid(opts) {
      const cols = opts.columns || [];
      const rows = opts.rows || [];
      const head = '<tr>' + cols.map((c) => '<th' + (c.align === 'r' ? ' class="num"' : '') +
        (c.width ? ' style="min-width:' + c.width + 'px"' : '') + '>' + U.esc(c.title) + '</th>').join('') + '</tr>';
      const body = rows.map((r, i) => '<tr data-i="' + i + '"' + (opts.rowId ? ' data-id="' + U.esc(r[opts.rowId]) + '"' : '') + '>' +
        cols.map((c) => {
          const raw = c.fmt ? c.fmt(r, i) : r[c.key];
          return '<td' + (c.align === 'r' ? ' class="num"' : '') + '>' + (raw === null || raw === undefined ? '' : raw) + '</td>';
        }).join('') + '</tr>').join('');
      return '<div class="scroll-x"><table class="grid"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    },

    /* ---------------------------------------------------------- widgets */
    toolbar(inner) { return '<div class="toolbar">' + inner + '</div>'; },

    cards(items) {
      return '<div class="cards">' + items.map((c) =>
        '<div class="card ' + (c.kind || '') + '"><div class="k">' + U.esc(c.k) + '</div>' +
        '<div class="v">' + U.esc(c.v) + '</div>' +
        '<div class="s">' + (c.s || '') + '</div></div>').join('') + '</div>';
    },

    /** ascii horizontal bar chart: [{label, n}] */
    chart(rows, width, labelWidth) {
      if (!rows || !rows.length) return '<pre class="ascii">' + U.esc(U.box('CHART', ['(no data)'], 60)) + '</pre>';
      const max = Math.max.apply(null, rows.map((r) => r.n)) || 1;
      const lw = labelWidth || Math.max.apply(null, rows.map((r) => String(r.label).length));
      // narrower bars on phones so the box still fits
      const w = width || (U.narrow() ? Math.max(12, Math.min(34, U.cols() - lw - 16)) : 34);
      const lines = rows.map((r) =>
        U.pad(r.label, lw) + ' │' + U.bar(r.n, max, w) + '│ ' + String(r.n) +
        (r.extra ? '  ' + r.extra : ''));
      return '<pre class="ascii">' + U.esc(U.box(rows.title || 'DISTRIBUTION', lines, lw + w + 14)) + '</pre>';
    },

    empty(msg) { return '<div class="empty">' + U.esc(msg || 'No records found.') + '</div>'; },

    /** <select> html helper */
    select(id, options, value, blank) {
      return '<select id="' + id + '">' +
        (blank ? '<option value="">' + U.esc(blank) + '</option>' : '') +
        options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const t = typeof o === 'object' ? o.label : o;
          return '<option value="' + U.esc(v) + '"' + (String(v) === String(value === undefined ? '' : value) ? ' selected' : '') + '>' + U.esc(t) + '</option>';
        }).join('') + '</select>';
    },

    tabs(list, active) {
      return '<div class="tabs">' + list.map((t) =>
        '<div class="tab' + (t.id === active ? ' active' : '') + '" data-tab="' + U.esc(t.id) + '">' + U.esc(t.label) + '</div>'
      ).join('') + '</div>';
    },

    pageHead(title, crumb, right) {
      return '<div class="pagehead"><h1>' + U.esc(title) + '</h1>' +
        (crumb ? '<span class="crumb">' + U.esc(crumb) + '</span>' : '') +
        '<span class="spacer"></span>' + (right || '') + '</div>';
    },

    /** wire up clicks on ascii table rows */
    onRows(root, handler) {
      root.querySelectorAll('pre.ascii[data-table] .trow').forEach((el) => {
        el.onclick = () => handler(el.dataset.id, el);
      });
    },

    /** wire tab clicks */
    onTabs(root, handler) {
      root.querySelectorAll('.tab').forEach((el) => {
        el.onclick = () => handler(el.dataset.tab);
      });
    }
  };

  R.UI = UI;
})(window.RSIS);

// safe-dom.js — Single auditable surface for HTML interpolation.
//
// Rule: every view in this app builds markup as template strings and writes it
// through `setHTML(el, html)`. ANY user-supplied string interpolated into one of
// those templates MUST first pass through `escapeHtml(value)`.
//
// Keeping these two functions in one file means: if you ever audit XSS for this
// app, you only need to grep for two things —
//   1. Calls to setHTML       (the only place markup is ever assigned)
//   2. Calls to escapeHtml    (the only sanitizer for user content)
// If a view interpolates user content without escapeHtml, that's the bug.

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENT[c]);
}

// Single chokepoint for HTML assignment.
// Implemented via Range.createContextualFragment so consumers can swap the
// implementation (e.g. to DOMPurify) by editing this one function only.
export function setHTML(el, html) {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.deleteContents();
  const fragment = range.createContextualFragment(String(html ?? ''));
  el.appendChild(fragment);
}

// Convenience: escape a value safe for interpolation as an attribute.
export function escapeAttr(value) {
  return escapeHtml(value);
}

// Tagged template helper for repeated array -> markup mapping with a separator.
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) {
      const v = values[i];
      if (Array.isArray(v)) out += v.join('');
      else if (v === null || v === undefined || v === false) out += '';
      else out += String(v);
    }
  });
  return out;
}

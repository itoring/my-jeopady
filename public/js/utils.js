// 共有ユーティリティ（フロント）

export function sanitizeField(s) {
  if (typeof s !== 'string') return '';
  // 制御文字除去（\n と \t は残す）
  const t = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  return t;
}
export function hasForbidden(s) {
  if (s.includes('<') || s.includes('>')) return true;
  const lower = s.toLowerCase();
  if (lower.includes('http://') || lower.includes('https://') || lower.includes('http') || lower.includes('https')) return true;
  return false;
}
export function validateText100(s) {
  const t = sanitizeField(s);
  if (!t) return '入力してください。';
  if (t.length > 100) return '100文字以内で入力してください。';
  if (hasForbidden(t)) return '禁止文字（< >, http, https）が含まれています。';
  return null;
}
export function qs(sel, el = document) { return el.querySelector(sel); }
export function qsa(sel, el = document) { return Array.from(el.querySelectorAll(sel)); }
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.appendChild(c);
  return e;
}
export function getParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}
export function copyText(text) {
  navigator.clipboard?.writeText(text);
}
export function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

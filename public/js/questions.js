import { qs, qsa, el, sanitizeField, validateText100 } from './utils.js';

const settings = JSON.parse(sessionStorage.getItem('createSettings') || 'null');
if (!settings) {
  location.href = '/create/settings';
}

qs('#q-title').textContent = settings.title;

const root = qs('#q-root');
const topErrors = qs('#top-errors');

const diffs = [];
for (let d = 100; d <= settings.maxDifficulty; d += 100) diffs.push(d);

// 状態
const state = {}; // { [cat]: { [d]: {text, answer_text} } }

// 文字数カウンタ要素を返す
function counterEl(inputLike) {
  const c = el('div', { class: 'counter' });
  const set = () => { c.textContent = `${sanitizeField(inputLike.value).length}/100`; };
  inputLike.addEventListener('input', set);
  set();
  return c;
}

function cellField(type, value='') {
  const wrap = el('div');
  const input = type === 'textarea'
    ? el('textarea', { rows: '3', maxlength: '100' })
    : el('input', { maxlength: '100' });
  input.value = value || '';
  const cnt = counterEl(input);
  const err = el('div', { class: 'field-err' });
  wrap.appendChild(input);
  wrap.appendChild(cnt);
  wrap.appendChild(err);
  return { wrap, input, err };
}

// カテゴリごとに縦並び
settings.categories.forEach(cat => {
  state[cat] = {};
  const card = el('section', { class: 'q-card' });
  card.appendChild(el('div', { class: 'q-head', text: `【${cat}】` }));

  diffs.forEach(d => {
    state[cat][d] = { text: '', answer_text: '' };

    const rowQ = el('div', { class: 'q-row' });
    rowQ.appendChild(el('div', { text: `${d}点\n問題` }));
    const fQ = cellField('textarea', '');
    rowQ.appendChild(fQ.wrap);

    const rowA = el('div', { class: 'q-row' });
    rowA.appendChild(el('div', { text: `答え` }));
    const fA = cellField('input', '');

    rowA.appendChild(fA.wrap);

    // 入力監視
    const sync = () => {
      const t = sanitizeField(fQ.input.value);
      const a = sanitizeField(fA.input.value);
      state[cat][d].text = t;
      state[cat][d].answer_text = a;

      fQ.err.textContent = validateText100(t) || '';
      fA.err.textContent = validateText100(a) || '';
    };
    fQ.input.addEventListener('input', sync);
    fA.input.addEventListener('input', sync);
    sync();

    card.appendChild(rowQ);
    card.appendChild(rowA);
  });

  const catErr = el('div', { class: 'cat-errors error-block', style: 'display:none' });
  const catCheck = el('button', { class: 'btn', text: 'カテゴリチェック', type: 'button' });
  catCheck.addEventListener('click', () => {
    const msgs = [];
    diffs.forEach(d => {
      const t = state[cat][d].text;
      const a = state[cat][d].answer_text;
      const e1 = validateText100(t);
      const e2 = validateText100(a);
      if (e1) msgs.push(`${d}点: 問題 - ${e1}`);
      if (e2) msgs.push(`${d}点: 答え - ${e2}`);
    });
    if (msgs.length) {
      catErr.style.display = '';
      catErr.innerHTML = msgs.map(m => `<div>${m}</div>`).join('');
      catErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      catErr.style.display = 'none';
      catErr.textContent = '';
      alert(`カテゴリ「${cat}」はOKです。`);
    }
  });

  card.appendChild(catCheck);
  card.appendChild(catErr);
  root.appendChild(card);
});

function collectPayload() {
  const questions = {};
  for (const cat of settings.categories) {
    questions[cat] = {};
    diffs.forEach(d => {
      const cell = state[cat][d];
      questions[cat][d] = { text: cell.text, answer_text: cell.answer_text };
    });
  }
  return {
    title: settings.title,
    categories: settings.categories,
    maxDifficulty: settings.maxDifficulty,
    questions
  };
}

// 保存
qs('#save-all').addEventListener('click', async () => {
  topErrors.textContent = '';
  // 全体チェック
  for (const cat of settings.categories) {
    for (const d of diffs) {
      const cell = state[cat][d];
      const e1 = validateText100(cell.text);
      const e2 = validateText100(cell.answer_text);
      if (e1 || e2) {
        const msgs = [];
        if (e1) msgs.push(`カテゴリ「${cat}」 ${d}点: 問題 - ${e1}`);
        if (e2) msgs.push(`カテゴリ「${cat}」 ${d}点: 答え - ${e2}`);
        topErrors.innerHTML = msgs.map(m => `<div>${m}</div>`).join('');
        topErrors.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
  }

  const payload = collectPayload();
  try {
    const resp = await fetch('/api/quizzes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await resp.json();
    if (!resp.ok) {
      topErrors.textContent = data.error || '保存に失敗しました。';
      topErrors.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // done用に保持
    sessionStorage.setItem('lastCreated', JSON.stringify({ quizId: data.quizId, title: settings.title }));
    location.href = `/create/done?quizId=${encodeURIComponent(data.quizId)}`;
  } catch (e) {
    topErrors.textContent = '通信に失敗しました。';
  }
});

import { qs, el, sanitizeField, validateText100 } from './utils.js';

const form = qs('#settings-form');
const catList = qs('#cat-list');
const addCat = qs('#add-cat');
const removeCat = qs('#remove-cat');
const errBox = qs('#err');

function renderCategories(names) {
  catList.innerHTML = '';
  names.forEach((name, idx) => {
    const wrap = el('div', { class: 'row' });
    const label = el('label', { class: 'label', text: `カテゴリ${idx + 1}` });
    const input = el('input', { class: 'input', maxlength: '8', value: name || '' });
    input.addEventListener('input', () => {
      input.value = input.value.slice(0, 8);
    });
    wrap.appendChild(label);
    wrap.appendChild(input);
    catList.appendChild(wrap);
  });
}

function getCategories() {
  return Array.from(catList.querySelectorAll('input')).map(i => sanitizeField(i.value));
}

// 初期2カテゴリ
renderCategories(['', '']);

addCat.addEventListener('click', () => {
  const cur = getCategories();
  if (cur.length >= 5) return;
  cur.push('');
  renderCategories(cur);
});

removeCat.addEventListener('click', () => {
  const cur = getCategories();
  if (cur.length <= 2) return;
  cur.pop();
  renderCategories(cur);
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  errBox.textContent = '';

  const title = sanitizeField(qs('#title').value);
  const titleErr = validateText100(title);
  if (titleErr) {
    errBox.textContent = 'タイトル: ' + titleErr;
    return;
  }
  const cats = getCategories();
  if (cats.length < 2 || cats.length > 5) {
    errBox.textContent = 'カテゴリは2〜5個にしてください。';
    return;
  }
  if (cats.some(n => !n)) {
    errBox.textContent = 'カテゴリ名は空にできません。';
    return;
  }
  if ((new Set(cats)).size !== cats.length) {
    errBox.textContent = 'カテゴリ名が重複しています。';
    return;
  }

  const maxDifficulty = Number(qs('#maxDifficulty').value);
  if (![200, 300, 400, 500].includes(maxDifficulty)) {
    errBox.textContent = 'maxDifficultyは200/300/400/500から選択してください。';
    return;
  }

  sessionStorage.setItem('createSettings', JSON.stringify({ title, categories: cats, maxDifficulty }));
  location.href = '/create/questions';
});

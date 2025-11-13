import { qs, qsa, el, getParam, clamp } from './utils.js';

const quizId = location.pathname.split('/').pop();
const KEY = `quiz-state-${quizId}`;

const viewBoard = qs('#view-board');
const viewQuestion = qs('#view-question');
const viewAnswer = qs('#view-answer');

const boardRoot = qs('#board');
const boardTitle = qs('#board-title');
const teamUl = qs('#teams');
const judgeRows = qs('#judge-rows');

let quiz;           // {title, maxDifficulty, categories[], questions{cat:{diff:{text,answer_text}}}}
let state;          // localStorage管理

function defaultState() {
  return {
    quizId,
    scores: [0,0,0,0,0],
    usedCells: [],
    current: { categoryId: null, difficulty: null, phase: 'board' },
    lastFocusedCell: null,
    updatedAt: Date.now(),
    version: 1
  };
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s || s.quizId !== quizId) return defaultState();
    // 簡易整合性チェック
    if (!Array.isArray(s.scores) || s.scores.length !== 5) s.scores = [0,0,0,0,0];
    if (!Array.isArray(s.usedCells)) s.usedCells = [];
    if (!s.current || !['board','question','answer'].includes(s.current.phase)) s.current = { categoryId: null, difficulty: null, phase: 'board' };
    return s;
  } catch {
    return defaultState();
  }
}
function saveState() {
  state.updatedAt = Date.now();
  localStorage.setItem(KEY, JSON.stringify(state));
}

function resetState() {
  localStorage.removeItem(KEY);
  state = defaultState();
  saveState();
}

// スコア表示
function renderScores() {
  teamUl.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const li = el('li', { class: 'team' });
    li.appendChild(el('div', { class: 'team-name', text: `チーム${i+1}` }));
    const sc = state.scores[i];
    const score = el('div', { class: 'team-score' + (sc < 0 ? ' minus' : '') });
    score.textContent = String(sc);
    li.appendChild(score);
    teamUl.appendChild(li);
  }
}

// ボード
let focusIndex = { col: 0, row: 0 }; // roving tabindex

function cellKey(cat, d) { return `${cat}-${d}`; }
function isUsed(cat, d) { return state.usedCells.includes(cellKey(cat, d)); }

function selectCell(catIdx, rowIdx) {
  focusIndex.col = catIdx;
  focusIndex.row = rowIdx;
  updateTabIndex();
  // フォーカス移動
  const target = boardRoot.querySelector(`.cell[data-col="${catIdx}"][data-row="${rowIdx}"]`);
  target?.focus();
}

function updateTabIndex() {
  qsa('.cell', boardRoot).forEach(c => c.setAttribute('tabindex', '-1'));
  const btn = boardRoot.querySelector(`.cell[data-col="${focusIndex.col}"][data-row="${focusIndex.row}"]`);
  btn?.setAttribute('tabindex', '0');
}

function buildBoard() {
  const cols = quiz.categories.length;
  boardRoot.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  boardRoot.innerHTML = '';
  quiz.categories.forEach((cat, cIdx) => {
    const col = el('div', { class: 'cat-col' });
    col.appendChild(el('div', {
      class: 'cat-name cat' + (cIdx + 1),
      text: cat
    }));

    for (let d = 100, r = 0; d <= quiz.maxDifficulty; d += 100, r++) {
      const used = isUsed(cat, d);
      const btn = el('button', {
        class: 'cell' + (used ? ' answered' : ' cat' + (cIdx + 1)),
        'data-col': String(cIdx),
        'data-row': String(r),
        'data-cat': cat,
        'data-diff': String(d),
        type: 'button'
      });
      btn.textContent = `${d}`;
      btn.disabled = used;
      btn.addEventListener('click', () => {
        if (btn.classList.contains('answered')) return;
        state.current = { categoryId: cat, difficulty: d, phase: 'question' };
        state.lastFocusedCell = { categoryId: cat, difficulty: d };
        saveState();
        renderPhase();
      });
      btn.addEventListener('focus', () => {
        qsa('.cell', boardRoot).forEach(x => x.classList.remove('selected'));
        btn.classList.add('selected');
      });
      col.appendChild(btn);
    }
    boardRoot.appendChild(col);
  });

  // roving 初期位置
  const lf = state.lastFocusedCell;
  if (lf) {
    const col = quiz.categories.indexOf(lf.categoryId);
    const row = (lf.difficulty / 100) - 1;
    focusIndex = { col: clamp(col, 0, quiz.categories.length - 1), row: clamp(row, 0, (quiz.maxDifficulty/100)-1) };
  } else {
    focusIndex = { col: 0, row: 0 };
  }
  updateTabIndex();

  // キーボード移動（回答済みはスキップ）
  boardRoot.addEventListener('keydown', (e) => {
    const maxRow = (quiz.maxDifficulty / 100) - 1;
    const maxCol = quiz.categories.length - 1;
    const move = (dc, dr) => {
      let c = focusIndex.col;
      let r = focusIndex.row;
      for (let i = 0; i < (quiz.categories.length * (maxRow + 1)); i++) {
        c = clamp(c + dc, 0, maxCol);
        r = clamp(r + dr, 0, maxRow);
        const cat = quiz.categories[c];
        const diff = (r + 1) * 100;
        if (!isUsed(cat, diff)) {
          selectCell(c, r);
          return;
        }
        // 次候補
        if (dc !== 0 && dr === 0) {
          // 横移動時は行を維持しつつ詰め替え
          if (dc > 0 && c < maxCol) c++; else if (dc < 0 && c > 0) c--;
        } else if (dr !== 0 && dc === 0) {
          if (dr > 0 && r < maxRow) r++; else if (dr < 0 && r > 0) r--;
        }
      }
    };
    if (e.key === 'ArrowRight') { e.preventDefault(); move(+1, 0); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); move(-1, 0); }
    if (e.key === 'ArrowDown')  { e.preventDefault(); move(0, +1); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); move(0, -1); }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const btn = boardRoot.querySelector(`.cell[data-col="${focusIndex.col}"][data-row="${focusIndex.row}"]`);
      if (btn && !btn.classList.contains('answered')) btn.click();
    }
  });
}

// 問題/答え表示
function getCurrentQA() {
  const cat = state.current.categoryId;
  const d = state.current.difficulty;
  const q = quiz.questions[cat][d];
  return q;
}

function showBoard() {
  viewBoard.classList.remove('hidden');
  viewQuestion.classList.add('hidden');
  viewAnswer.classList.add('hidden');
}
function showQuestion() {
  viewBoard.classList.add('hidden');
  viewQuestion.classList.remove('hidden');
  viewAnswer.classList.add('hidden');
}
function showAnswer() {
  viewBoard.classList.add('hidden');
  viewQuestion.classList.add('hidden');
  viewAnswer.classList.remove('hidden');
}

function renderQuestion() {
  const q = getCurrentQA();
  qs('#question-text').textContent = q.text;
}

function renderAnswer() {
  const q = getCurrentQA();
  qs('#answer-text').textContent = q.answer_text;

  // 判定UI（5チーム、tri-state: off -> ⭕ -> ❌ -> off）
  judgeRows.innerHTML = '';
  const tri = (state.current.judge || [null, null, null, null, null]).slice(0,5);
  state.current.judge = tri;

  for (let i = 0; i < 5; i++) {
    const row = el('div', { class: 'jrow' });
    row.appendChild(el('div', { class: 'jlabel', text: `チーム${i+1}` }));
    const ok = el('button', { class: 'jbtn', text: '⭕', type: 'button' });
    const ng = el('button', { class: 'jbtn', text: '❌', type: 'button' });

    const setActive = () => {
      ok.classList.toggle('active', tri[i] === true);
      ng.classList.toggle('active', tri[i] === false);
    };
    ok.addEventListener('click', () => { tri[i] = (tri[i] === true ? null : true); setActive(); saveState(); });
    ng.addEventListener('click', () => { tri[i] = (tri[i] === false ? null : false); setActive(); saveState(); });
    setActive();

    row.appendChild(ok);
    row.appendChild(ng);
    judgeRows.appendChild(row);
  }
}

qs('#to-answer').addEventListener('click', () => {
  state.current.phase = 'answer';
  saveState();
  renderPhase();
});

qs('#back-board').addEventListener('click', () => {
  const cat = state.current.categoryId;
  const d = state.current.difficulty;
  const key = cellKey(cat, d);
  if (!state.usedCells.includes(key)) {
    // スコア反映
    const tri = state.current.judge || [];
    for (let i = 0; i < 5; i++) {
      if (tri[i] === true) state.scores[i] += d;
      else if (tri[i] === false) state.scores[i] -= d;
    }
    state.usedCells.push(key);
  }
  state.current = { categoryId: null, difficulty: null, phase: 'board' };
  saveState();
  renderPhase();
});

qs('#reset').addEventListener('click', () => {
  if (confirm('進行状況をリセットします。よろしいですか？')) {
    resetState();
    renderPhase();
  }
});

function renderBoardSelected() {
  // 再描画
  buildBoard();
  // 選択表示更新
  qsa('.cell', boardRoot).forEach(btn => {
    const cat = btn.getAttribute('data-cat');
    const d = Number(btn.getAttribute('data-diff'));
    if (isUsed(cat, d)) {
      btn.classList.add('answered');
      btn.disabled = true;
    }
  });
}

function renderPhase() {
  renderScores();
  renderBoardSelected();
  boardTitle.textContent = quiz.title;

  if (state.current.phase === 'board') {
    showBoard();
  } else if (state.current.phase === 'question') {
    renderQuestion();
    showQuestion();
  } else if (state.current.phase === 'answer') {
    renderAnswer();
    showAnswer();
  }
}

async function init() {
  const resp = await fetch(`/api/quizzes/${quizId}`);
  if (!resp.ok) {
    alert('クイズが見つかりません。');
    location.href = '/';
    return;
  }
  quiz = await resp.json();
  state = loadState();

  // 初回構築
  renderScores();
  buildBoard();
  renderPhase();
}

init();

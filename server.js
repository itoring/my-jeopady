const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const morgan = require('morgan');

const app = express();
const db = new sqlite3.Database(path.join(__dirname, 'db.sqlite'));

// スキーマを起動時に担保
function ensureSchema() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('PRAGMA foreign_keys = ON');
      db.run(`
        CREATE TABLE IF NOT EXISTS quizzes (
          quiz_id TEXT PRIMARY KEY UNIQUE,
          title TEXT NOT NULL,
          max_difficulty INTEGER NOT NULL,
          created_at INTEGER,
          updated_at INTEGER
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS categories (
          category_id INTEGER PRIMARY KEY AUTOINCREMENT,
          quiz_id TEXT NOT NULL,
          name TEXT NOT NULL,
          UNIQUE(quiz_id, name),
          FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS questions (
          question_id INTEGER PRIMARY KEY AUTOINCREMENT,
          quiz_id TEXT NOT NULL,
          category_id INTEGER NOT NULL,
          difficulty INTEGER NOT NULL,
          text TEXT NOT NULL,
          answer_text TEXT NOT NULL,
          UNIQUE(quiz_id, category_id, difficulty),
          FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE,
          FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE
        )
      `, (err) => err ? reject(err) : resolve());
    });
  });
}

app.use(morgan('tiny'));
app.use(bodyParser.json({ limit: '1mb' }));

// セキュリティヘッダ
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// 静的ファイル
app.use(express.static(path.join(__dirname, 'public')));

// === ユーティリティ ===
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function randomBase62(n = 20) {
  let s = '';
  for (let i = 0; i < n; i++) s += BASE62[Math.floor(Math.random() * BASE62.length)];
  return s;
}

// 制御文字除去（改行とタブは許可）
function stripControl(s) {
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}
// NGチェック
function hasForbidden(s) {
  if (s.includes('<') || s.includes('>')) return true;
  const lower = s.toLowerCase();
  if (lower.includes('http://') || lower.includes('https://') || lower.includes('http') || lower.includes('https')) return true;
  return false;
}
function sanitizeField(raw) {
  if (typeof raw !== 'string') return '';
  const t = stripControl(raw.trim());
  return t;
}
function validateText100(s) {
  if (!s) return '必須です。';
  if (s.length > 100) return '100文字以内で入力してください。';
  if (hasForbidden(s)) return '禁止文字（< >, http, https）が含まれています。';
  return null;
}
function validateCategories(arr) {
  if (!Array.isArray(arr)) return 'カテゴリは配列で指定してください。';
  if (arr.length < 2 || arr.length > 5) return 'カテゴリは2〜5個にしてください。';
  const names = arr.map(sanitizeField);
  if (names.some(n => !n)) return 'カテゴリ名は必須です。';
  if (names.some(n => n.length > 8)) return 'カテゴリ名は8文字以内です。';
  if (names.some(n => hasForbidden(n))) return 'カテゴリ名に禁止文字（< >, http, https）。';
  const set = new Set(names);
  if (set.size !== names.length) return 'カテゴリ名が重複しています。';
  return null;
}
function validateMaxDifficulty(maxDifficulty) {
  const ok = [200, 300, 400, 500];
  if (!ok.includes(maxDifficulty)) return 'maxDifficultyは200/300/400/500のいずれかにしてください。';
  return null;
}
function validateQuestions(payload) {
  const { categories, maxDifficulty, questions } = payload;
  const diffs = [];
  for (let d = 100; d <= maxDifficulty; d += 100) diffs.push(d);
  for (const cat of categories) {
    if (!questions || !questions[cat]) return `カテゴリ「${cat}」の問題が不足しています。`;
    for (const d of diffs) {
      const cell = questions[cat][d];
      if (!cell) return `カテゴリ「${cat}」の${d}点が不足しています。`;
      const text = sanitizeField(cell.text);
      const answer_text = sanitizeField(cell.answer_text);
      const e1 = validateText100(text);
      const e2 = validateText100(answer_text);
      if (e1) return `カテゴリ「${cat}」 ${d}点: 問題 - ${e1}`;
      if (e2) return `カテゴリ「${cat}」 ${d}点: 答え - ${e2}`;
    }
  }
  return null;
}
function nowMs() { return Date.now(); }

// quizIdユニーク生成
function generateUniqueQuizId() {
  return new Promise((resolve, reject) => {
    const tryInsert = () => {
      const id = randomBase62(20);
      db.get('SELECT quiz_id FROM quizzes WHERE quiz_id = ?', [id], (err, row) => {
        if (err) return reject(err);
        if (row) return tryInsert();
        resolve(id);
      });
    };
    tryInsert();
  });
}

// DBトランザクションヘルパ
function runInTransaction(fn) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN', (err) => {
        if (err) return reject(err);
        fn((err2, result) => {
          if (err2) {
            db.run('ROLLBACK', () => reject(err2));
          } else {
            db.run('COMMIT', (err3) => {
              if (err3) return reject(err3);
              resolve(result);
            });
          }
        });
      });
    });
  });
}

// === API ===

// POST /api/quizzes
// 入力: { title, categories: string[], maxDifficulty, questions: { [cat]: { [difficulty]: {text, answer_text} } } }
app.post('/api/quizzes', async (req, res) => {
  try {
    const raw = req.body || {};
    const title = sanitizeField(raw.title);
    const cats = (raw.categories || []).map(sanitizeField);
    const maxDifficulty = Number(raw.maxDifficulty);
    const questions = raw.questions || {};

    // バリデーション
    let err;
    if ((err = validateText100(title))) return res.status(400).json({ error: 'タイトル: ' + err });
    if ((err = validateCategories(cats))) return res.status(400).json({ error: err });
    if ((err = validateMaxDifficulty(maxDifficulty))) return res.status(400).json({ error: err });
    if ((err = validateQuestions({ categories: cats, maxDifficulty, questions }))) return res.status(400).json({ error: err });

    const quizId = await generateUniqueQuizId();
    const ts = nowMs();

    await runInTransaction((done) => {
      db.run(
        'INSERT INTO quizzes (quiz_id, title, max_difficulty, created_at, updated_at) VALUES (?,?,?,?,?)',
        [quizId, title, maxDifficulty, ts, ts],
        function (e1) {
          if (e1) return done(e1);
          const catIdMap = new Map();
          const insertCat = (i) => {
            if (i >= cats.length) return insertQuestions();
            const name = cats[i];
            db.run(
              'INSERT INTO categories (quiz_id, name) VALUES (?,?)',
              [quizId, name],
              function (e2) {
                if (e2) return done(e2);
                catIdMap.set(name, this.lastID);
                insertCat(i + 1);
              }
            );
          };
          const insertQuestions = () => {
            const diffs = [];
            for (let d = 100; d <= maxDifficulty; d += 100) diffs.push(d);

            const all = [];
            for (const cat of cats) {
              for (const d of diffs) {
                const cell = questions[cat][d];
                all.push({
                  quiz_id: quizId,
                  category_id: catIdMap.get(cat),
                  difficulty: d,
                  text: sanitizeField(cell.text),
                  answer_text: sanitizeField(cell.answer_text)
                });
              }
            }
            const stmt = db.prepare(`INSERT INTO questions (quiz_id, category_id, difficulty, text, answer_text)
              VALUES (?,?,?,?,?)`);
            let idx = 0;
            const loop = () => {
              if (idx >= all.length) {
                stmt.finalize((e3) => done(e3, { quizId }));
                return;
              }
              const q = all[idx++];
              stmt.run([q.quiz_id, q.category_id, q.difficulty, q.text, q.answer_text], (e4) => {
                if (e4) return done(e4);
                loop();
              });
            };
            loop();
          };
          insertCat(0);
        }
      );
    });

    return res.status(201).json({ quizId, playUrl: `/play/${quizId}` });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'サーバーエラー' });
  }
});

// GET /api/quizzes/:quizId
app.get('/api/quizzes/:quizId', (req, res) => {
  const quizId = req.params.quizId;
  db.get('SELECT * FROM quizzes WHERE quiz_id = ?', [quizId], (err, quiz) => {
    if (err) return res.status(500).json({ error: 'DBエラー' });
    if (!quiz) return res.status(404).json({ error: 'クイズが見つかりません' });
    db.all('SELECT * FROM categories WHERE quiz_id = ? ORDER BY category_id ASC', [quizId], (err2, cats) => {
      if (err2) return res.status(500).json({ error: 'DBエラー' });
      db.all('SELECT * FROM questions WHERE quiz_id = ?', [quizId], (err3, qs) => {
        if (err3) return res.status(500).json({ error: 'DBエラー' });
        const result = {
          quizId: quiz.quiz_id,
          title: quiz.title,
          maxDifficulty: quiz.max_difficulty,
          categories: cats.map(c => c.name),
          questions: {} // { [categoryName]: { [difficulty]: { text, answer_text } } }
        };
        for (const c of cats) {
          result.questions[c.name] = {};
        }
        for (const q of qs) {
          const cat = cats.find(c => c.category_id === q.category_id);
          if (cat) {
            if (!result.questions[cat.name]) result.questions[cat.name] = {};
            result.questions[cat.name][q.difficulty] = { text: q.text, answer_text: q.answer_text };
          }
        }
        res.json(result);
      });
    });
  });
});

// PUT /api/quizzes/:quizId 既存を上書き（簡易実装）
app.put('/api/quizzes/:quizId', (req, res) => {
  const quizId = req.params.quizId;
  const raw = req.body || {};
  const title = sanitizeField(raw.title);
  const cats = (raw.categories || []).map(sanitizeField);
  const maxDifficulty = Number(raw.maxDifficulty);
  const questions = raw.questions || {};
  let err;
  if ((err = validateText100(title))) return res.status(400).json({ error: 'タイトル: ' + err });
  if ((err = validateCategories(cats))) return res.status(400).json({ error: err });
  if ((err = validateMaxDifficulty(maxDifficulty))) return res.status(400).json({ error: err });
  if ((err = validateQuestions({ categories: cats, maxDifficulty, questions }))) return res.status(400).json({ error: err });

  db.get('SELECT quiz_id FROM quizzes WHERE quiz_id = ?', [quizId], (e0, row) => {
    if (e0) return res.status(500).json({ error: 'DBエラー' });
    if (!row) return res.status(404).json({ error: 'クイズが見つかりません' });

    runInTransaction((done) => {
      const ts = nowMs();
      db.run('UPDATE quizzes SET title=?, max_difficulty=?, updated_at=? WHERE quiz_id=?',
        [title, maxDifficulty, ts, quizId], (e1) => {
          if (e1) return done(e1);
          db.run('DELETE FROM categories WHERE quiz_id=?', [quizId], (e2) => {
            if (e2) return done(e2);
            const catIdMap = new Map();
            const insertCat = (i) => {
              if (i >= cats.length) return insertQuestions();
              const name = cats[i];
              db.run('INSERT INTO categories (quiz_id, name) VALUES (?,?)',
                [quizId, name], function (e3) {
                  if (e3) return done(e3);
                  catIdMap.set(name, this.lastID);
                  insertCat(i + 1);
                });
            };
            const insertQuestions = () => {
              const diffs = [];
              for (let d = 100; d <= maxDifficulty; d += 100) diffs.push(d);
              const all = [];
              for (const cat of cats) {
                for (const d of diffs) {
                  const cell = questions[cat][d];
                  all.push({
                    quiz_id: quizId,
                    category_id: catIdMap.get(cat),
                    difficulty: d,
                    text: sanitizeField(cell.text),
                    answer_text: sanitizeField(cell.answer_text)
                  });
                }
              }
              const stmt = db.prepare(`INSERT INTO questions (quiz_id, category_id, difficulty, text, answer_text)
                VALUES (?,?,?,?,?)`);
              let idx = 0;
              const loop = () => {
                if (idx >= all.length) {
                  stmt.finalize((e4) => done(e4, { ok: true }));
                  return;
                }
                const q = all[idx++];
                stmt.run([q.quiz_id, q.category_id, q.difficulty, q.text, q.answer_text], (e5) => {
                  if (e5) return done(e5);
                  loop();
                });
              };
              loop();
            };
            insertCat(0);
          });
        });
    }).then(() => res.json({ ok: true }))
      .catch(e => {
        console.error(e);
        res.status(500).json({ error: 'サーバーエラー' });
      });
  });
});

// POST /api/quizzes/:quizId/clone
app.post('/api/quizzes/:quizId/clone', async (req, res) => {
  const srcId = req.params.quizId;
  db.get('SELECT * FROM quizzes WHERE quiz_id=?', [srcId], async (e0, srcQuiz) => {
    if (e0) return res.status(500).json({ error: 'DBエラー' });
    if (!srcQuiz) return res.status(404).json({ error: 'クイズが見つかりません' });

    db.all('SELECT * FROM categories WHERE quiz_id=? ORDER BY category_id ASC', [srcId], async (e1, cats) => {
      if (e1) return res.status(500).json({ error: 'DBエラー' });
      db.all('SELECT * FROM questions WHERE quiz_id=?', [srcId], async (e2, qs) => {
        if (e2) return res.status(500).json({ error: 'DBエラー' });
        const newId = await generateUniqueQuizId();
        const ts = nowMs();
        try {
          await runInTransaction((done) => {
            db.run('INSERT INTO quizzes (quiz_id, title, max_difficulty, created_at, updated_at) VALUES (?,?,?,?,?)',
              [newId, srcQuiz.title, srcQuiz.max_difficulty, ts, ts], function (e3) {
                if (e3) return done(e3);
                const oldToNewCat = new Map();
                const insertCat = (i) => {
                  if (i >= cats.length) return insertQs();
                  const c = cats[i];
                  db.run('INSERT INTO categories (quiz_id, name) VALUES (?,?)',
                    [newId, c.name], function (e4) {
                      if (e4) return done(e4);
                      oldToNewCat.set(c.category_id, this.lastID);
                      insertCat(i + 1);
                    });
                };
                const insertQs = () => {
                  const stmt = db.prepare('INSERT INTO questions (quiz_id, category_id, difficulty, text, answer_text) VALUES (?,?,?,?,?)');
                  let idx = 0;
                  const list = qs.map(q => ({
                    quiz_id: newId,
                    category_id: oldToNewCat.get(q.category_id),
                    difficulty: q.difficulty,
                    text: q.text,
                    answer_text: q.answer_text
                  }));
                  const loop = () => {
                    if (idx >= list.length) return stmt.finalize(e5 => done(e5, { quizId: newId }));
                    const row = list[idx++];
                    stmt.run([row.quiz_id, row.category_id, row.difficulty, row.text, row.answer_text], (e6) => {
                      if (e6) return done(e6);
                      loop();
                    });
                  };
                  loop();
                };
                insertCat(0);
              });
          });
          res.status(201).json({ quizId: newId, playUrl: `/play/${newId}` });
        } catch (e) {
          console.error(e);
          res.status(500).json({ error: 'サーバーエラー' });
        }
      });
    });
  });
});

// DELETE /api/quizzes/:quizId
app.delete('/api/quizzes/:quizId', (req, res) => {
  const id = req.params.quizId;
  db.run('DELETE FROM quizzes WHERE quiz_id=?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'DBエラー' });
    return res.status(204).end();
  });
});

// ルーティング（SPAではないがディープリンク用）
app.get('/play/:quizId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'play.html'));
});
app.get('/create/settings', (req, res) => res.sendFile(path.join(__dirname, 'public', 'create-settings.html')));
app.get('/create/questions', (req, res) => res.sendFile(path.join(__dirname, 'public', 'create-questions.html')));
app.get('/create/done', (req, res) => res.sendFile(path.join(__dirname, 'public', 'create-done.html')));

// サーバ起動
ensureSchema().then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running http://localhost:${PORT}`));
}).catch(err => {
  console.error('Schema init failed:', err);
});
// DB初期化スクリプト: npm run init:db で実行
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'db.sqlite');

const db = new sqlite3.Database(dbPath);

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
  `, (err) => {
    if (err) {
      console.error('DB init error:', err);
    } else {
      console.log('DB initialized OK:', dbPath);
    }
    db.close();
  });
});

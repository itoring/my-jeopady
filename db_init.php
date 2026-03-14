<?php
// =============================================================
// DB初期化スクリプト
// ブラウザから一度だけアクセスして実行後、必ず削除してください
// 例: https://your-domain.com/db_init.php
// =============================================================

// 直接アクセスを簡易的に制限（必要に応じてIPやパスワードで強化）
// 本番環境では実行後すぐにこのファイルを削除すること

require_once __DIR__ . '/db_config.php';

try {
    $db = getDb();

    $db->exec("
        CREATE TABLE IF NOT EXISTS quizzes (
            quiz_id      VARCHAR(20)  NOT NULL,
            title        VARCHAR(100) NOT NULL,
            max_difficulty INT        NOT NULL,
            created_at   BIGINT,
            updated_at   BIGINT,
            PRIMARY KEY (quiz_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $db->exec("
        CREATE TABLE IF NOT EXISTS categories (
            category_id  INT          NOT NULL AUTO_INCREMENT,
            quiz_id      VARCHAR(20)  NOT NULL,
            name         VARCHAR(8)   NOT NULL,
            PRIMARY KEY (category_id),
            UNIQUE KEY uq_quiz_cat (quiz_id, name),
            FOREIGN KEY (quiz_id) REFERENCES quizzes(quiz_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $db->exec("
        CREATE TABLE IF NOT EXISTS questions (
            question_id  INT          NOT NULL AUTO_INCREMENT,
            quiz_id      VARCHAR(20)  NOT NULL,
            category_id  INT          NOT NULL,
            difficulty   INT          NOT NULL,
            text         VARCHAR(100) NOT NULL,
            answer_text  VARCHAR(100) NOT NULL,
            PRIMARY KEY (question_id),
            UNIQUE KEY uq_quiz_cat_diff (quiz_id, category_id, difficulty),
            FOREIGN KEY (quiz_id)     REFERENCES quizzes(quiz_id)        ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    echo 'DB initialized OK. このファイルをすぐに削除してください。';
} catch (Throwable $e) {
    http_response_code(500);
    echo 'DB init error: ' . htmlspecialchars($e->getMessage());
}

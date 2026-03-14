<?php
// =============================================================
// DB接続設定 - ConoHa Wing の管理画面の値に書き換えてください
// =============================================================
define('DB_HOST',    'YOUR_DB_HOST');      // 例: mysqlXXX.db.sakura.ne.jp など
define('DB_NAME',    'YOUR_DB_NAME');      // データベース名
define('DB_USER',    'YOUR_DB_USER');      // DBユーザー名
define('DB_PASS',    'YOUR_DB_PASS');      // DBパスワード
define('DB_CHARSET', 'utf8mb4');

/**
 * PDO接続を返す（シングルトン）
 */
function getDb(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            DB_HOST, DB_NAME, DB_CHARSET
        );
        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}

// =============================================================
// 共通: セキュリティヘッダ
// =============================================================
function sendSecurityHeaders(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header("Content-Security-Policy: default-src 'self'");
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
}

// =============================================================
// 共通: バリデーション・サニタイズ
// =============================================================
function sanitizeField(string $s): string
{
    $s = trim($s);
    // 制御文字除去（改行・タブは許可）
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s);
    return $s;
}

function hasForbidden(string $s): bool
{
    if (str_contains($s, '<') || str_contains($s, '>')) return true;
    if (str_contains(strtolower($s), 'http')) return true;
    return false;
}

function validateText100(string $s): ?string
{
    if ($s === '') return '必須です。';
    if (mb_strlen($s) > 100) return '100文字以内で入力してください。';
    if (hasForbidden($s)) return '禁止文字（< >, http, https）が含まれています。';
    return null;
}

function validateCategories(array $cats): ?string
{
    if (count($cats) < 2 || count($cats) > 5) return 'カテゴリは2〜5個にしてください。';
    foreach ($cats as $n) {
        if ($n === '') return 'カテゴリ名は必須です。';
        if (mb_strlen($n) > 8) return 'カテゴリ名は8文字以内です。';
        if (hasForbidden($n)) return 'カテゴリ名に禁止文字（< >, http, https）。';
    }
    if (count(array_unique($cats)) !== count($cats)) return 'カテゴリ名が重複しています。';
    return null;
}

function validateQuestions(array $cats, int $maxDifficulty, array $questions): ?string
{
    $diffs = range(100, $maxDifficulty, 100);
    foreach ($cats as $cat) {
        if (!isset($questions[$cat])) {
            return "カテゴリ「{$cat}」の問題が不足しています。";
        }
        foreach ($diffs as $d) {
            $cell = $questions[$cat][(string)$d] ?? $questions[$cat][$d] ?? null;
            if (!$cell) return "カテゴリ「{$cat}」の{$d}点が不足しています。";
            $text = sanitizeField((string)($cell['text'] ?? ''));
            $ans  = sanitizeField((string)($cell['answer_text'] ?? ''));
            if ($e = validateText100($text)) return "カテゴリ「{$cat}」 {$d}点: 問題 - {$e}";
            if ($e = validateText100($ans))  return "カテゴリ「{$cat}」 {$d}点: 答え - {$e}";
        }
    }
    return null;
}

// =============================================================
// 共通: ユーティリティ
// =============================================================
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function randomBase62(int $n = 20): string
{
    $s = '';
    for ($i = 0; $i < $n; $i++) {
        $s .= BASE62[random_int(0, 61)];
    }
    return $s;
}

function generateUniqueQuizId(PDO $db): string
{
    for ($i = 0; $i < 10; $i++) {
        $candidate = randomBase62(20);
        $st = $db->prepare('SELECT quiz_id FROM quizzes WHERE quiz_id = ?');
        $st->execute([$candidate]);
        if (!$st->fetch()) return $candidate;
    }
    throw new RuntimeException('ID生成に失敗しました');
}

function nowMs(): int
{
    return (int)(microtime(true) * 1000);
}

function jsonError(int $code, string $message): never
{
    http_response_code($code);
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

<?php
// POST /api/quizzes - クイズ新規作成
require_once __DIR__ . '/../db_config.php';

sendSecurityHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError(405, 'Method Not Allowed');
}

$raw = json_decode(file_get_contents('php://input'), true);
if (!is_array($raw)) {
    jsonError(400, 'Invalid JSON');
}

$title         = sanitizeField((string)($raw['title'] ?? ''));
$cats          = array_map(fn($c) => sanitizeField((string)$c), (array)($raw['categories'] ?? []));
$maxDifficulty = (int)($raw['maxDifficulty'] ?? 0);
$questions     = $raw['questions'] ?? [];

// バリデーション
if ($e = validateText100($title))                         jsonError(400, 'タイトル: ' . $e);
if ($e = validateCategories($cats))                       jsonError(400, $e);
if (!in_array($maxDifficulty, [200, 300, 400, 500], true)) jsonError(400, 'maxDifficultyは200/300/400/500のいずれかにしてください。');
if ($e = validateQuestions($cats, $maxDifficulty, $questions)) jsonError(400, $e);

try {
    $db     = getDb();
    $quizId = generateUniqueQuizId($db);
    $ts     = nowMs();
    $diffs  = range(100, $maxDifficulty, 100);

    $db->beginTransaction();

    $db->prepare('INSERT INTO quizzes (quiz_id, title, max_difficulty, created_at, updated_at) VALUES (?,?,?,?,?)')
       ->execute([$quizId, $title, $maxDifficulty, $ts, $ts]);

    $catIdMap = [];
    $stCat = $db->prepare('INSERT INTO categories (quiz_id, name) VALUES (?,?)');
    foreach ($cats as $cat) {
        $stCat->execute([$quizId, $cat]);
        $catIdMap[$cat] = (int)$db->lastInsertId();
    }

    $stQ = $db->prepare('INSERT INTO questions (quiz_id, category_id, difficulty, text, answer_text) VALUES (?,?,?,?,?)');
    foreach ($cats as $cat) {
        foreach ($diffs as $d) {
            $cell = $questions[$cat][(string)$d] ?? $questions[$cat][$d];
            $stQ->execute([
                $quizId,
                $catIdMap[$cat],
                $d,
                sanitizeField((string)($cell['text'] ?? '')),
                sanitizeField((string)($cell['answer_text'] ?? '')),
            ]);
        }
    }

    $db->commit();

    http_response_code(201);
    echo json_encode(['quizId' => $quizId, 'playUrl' => "/play/{$quizId}"], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    error_log($e->getMessage());
    jsonError(500, 'サーバーエラー');
}

<?php
// GET /api/quizzes/:id    - クイズ取得
// PUT /api/quizzes/:id    - クイズ更新
// DELETE /api/quizzes/:id - クイズ削除
require_once __DIR__ . '/../db_config.php';

sendSecurityHeaders();

$quizId = $_GET['id'] ?? '';
if (!preg_match('/^[A-Za-z0-9]{1,30}$/', $quizId)) {
    jsonError(400, '不正なID');
}

$method = $_SERVER['REQUEST_METHOD'];

// ===== GET =====
if ($method === 'GET') {
    $db   = getDb();
    $quiz = $db->prepare('SELECT * FROM quizzes WHERE quiz_id = ?');
    $quiz->execute([$quizId]);
    $quiz = $quiz->fetch();
    if (!$quiz) jsonError(404, 'クイズが見つかりません');

    $stCats = $db->prepare('SELECT * FROM categories WHERE quiz_id = ? ORDER BY category_id ASC');
    $stCats->execute([$quizId]);
    $cats = $stCats->fetchAll();

    $stQs = $db->prepare('SELECT * FROM questions WHERE quiz_id = ?');
    $stQs->execute([$quizId]);
    $qs = $stQs->fetchAll();

    $catMap = [];
    foreach ($cats as $c) {
        $catMap[$c['category_id']] = $c['name'];
    }

    $result = [
        'quizId'        => $quiz['quiz_id'],
        'title'         => $quiz['title'],
        'maxDifficulty' => (int)$quiz['max_difficulty'],
        'categories'    => array_column($cats, 'name'),
        'questions'     => [],
    ];
    foreach ($cats as $c) {
        $result['questions'][$c['name']] = [];
    }
    foreach ($qs as $q) {
        $catName = $catMap[$q['category_id']] ?? null;
        if ($catName !== null) {
            $result['questions'][$catName][$q['difficulty']] = [
                'text'        => $q['text'],
                'answer_text' => $q['answer_text'],
            ];
        }
    }

    echo json_encode($result, JSON_UNESCAPED_UNICODE);
    exit;
}

// ===== PUT =====
if ($method === 'PUT') {
    $raw = json_decode(file_get_contents('php://input'), true);
    if (!is_array($raw)) jsonError(400, 'Invalid JSON');

    $title         = sanitizeField((string)($raw['title'] ?? ''));
    $cats          = array_map(fn($c) => sanitizeField((string)$c), (array)($raw['categories'] ?? []));
    $maxDifficulty = (int)($raw['maxDifficulty'] ?? 0);
    $questions     = $raw['questions'] ?? [];

    if ($e = validateText100($title))                              jsonError(400, 'タイトル: ' . $e);
    if ($e = validateCategories($cats))                            jsonError(400, $e);
    if (!in_array($maxDifficulty, [200, 300, 400, 500], true))    jsonError(400, 'maxDifficultyは200/300/400/500のいずれかにしてください。');
    if ($e = validateQuestions($cats, $maxDifficulty, $questions)) jsonError(400, $e);

    try {
        $db   = getDb();
        $row  = $db->prepare('SELECT quiz_id FROM quizzes WHERE quiz_id = ?');
        $row->execute([$quizId]);
        if (!$row->fetch()) jsonError(404, 'クイズが見つかりません');

        $ts    = nowMs();
        $diffs = range(100, $maxDifficulty, 100);

        $db->beginTransaction();

        $db->prepare('UPDATE quizzes SET title=?, max_difficulty=?, updated_at=? WHERE quiz_id=?')
           ->execute([$title, $maxDifficulty, $ts, $quizId]);

        // カテゴリを削除（ON DELETE CASCADEでquestionsも連鎖削除）
        $db->prepare('DELETE FROM categories WHERE quiz_id=?')->execute([$quizId]);

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
        echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);

    } catch (Throwable $e) {
        if (isset($db) && $db->inTransaction()) $db->rollBack();
        error_log($e->getMessage());
        jsonError(500, 'サーバーエラー');
    }
    exit;
}

// ===== DELETE =====
if ($method === 'DELETE') {
    try {
        $db = getDb();
        $db->prepare('DELETE FROM quizzes WHERE quiz_id=?')->execute([$quizId]);
        http_response_code(204);
    } catch (Throwable $e) {
        error_log($e->getMessage());
        jsonError(500, 'サーバーエラー');
    }
    exit;
}

jsonError(405, 'Method Not Allowed');

<?php
// POST /api/quizzes/:id/clone - クイズ複製
require_once __DIR__ . '/../db_config.php';

sendSecurityHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonError(405, 'Method Not Allowed');
}

$srcId = $_GET['id'] ?? '';
if (!preg_match('/^[A-Za-z0-9]{1,30}$/', $srcId)) {
    jsonError(400, '不正なID');
}

try {
    $db = getDb();

    $stQuiz = $db->prepare('SELECT * FROM quizzes WHERE quiz_id = ?');
    $stQuiz->execute([$srcId]);
    $srcQuiz = $stQuiz->fetch();
    if (!$srcQuiz) jsonError(404, 'クイズが見つかりません');

    $stCats = $db->prepare('SELECT * FROM categories WHERE quiz_id = ? ORDER BY category_id ASC');
    $stCats->execute([$srcId]);
    $cats = $stCats->fetchAll();

    $stQs = $db->prepare('SELECT * FROM questions WHERE quiz_id = ?');
    $stQs->execute([$srcId]);
    $qs = $stQs->fetchAll();

    $newId = generateUniqueQuizId($db);
    $ts    = nowMs();

    $db->beginTransaction();

    $db->prepare('INSERT INTO quizzes (quiz_id, title, max_difficulty, created_at, updated_at) VALUES (?,?,?,?,?)')
       ->execute([$newId, $srcQuiz['title'], $srcQuiz['max_difficulty'], $ts, $ts]);

    $oldToNew = [];
    $stCat = $db->prepare('INSERT INTO categories (quiz_id, name) VALUES (?,?)');
    foreach ($cats as $c) {
        $stCat->execute([$newId, $c['name']]);
        $oldToNew[$c['category_id']] = (int)$db->lastInsertId();
    }

    $stQ = $db->prepare('INSERT INTO questions (quiz_id, category_id, difficulty, text, answer_text) VALUES (?,?,?,?,?)');
    foreach ($qs as $q) {
        $stQ->execute([
            $newId,
            $oldToNew[$q['category_id']],
            $q['difficulty'],
            $q['text'],
            $q['answer_text'],
        ]);
    }

    $db->commit();

    http_response_code(201);
    echo json_encode(['quizId' => $newId, 'playUrl' => "/play/{$newId}"], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    error_log($e->getMessage());
    jsonError(500, 'サーバーエラー');
}

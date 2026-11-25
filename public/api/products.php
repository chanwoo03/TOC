<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

// 배포 위치: /www/medisync-demo/api/products.php
// 비밀번호 파일: /home/.../cpfamily/medisync_db_config.php (www 폴더 바깥)
$configPath = dirname(__DIR__, 3) . '/medisync_db_config.php';
if (!is_readable($configPath)) {
    http_response_code(503);
    echo json_encode(['error' => 'catalog_unavailable']);
    exit;
}

try {
    $config = require $configPath;
    if (!is_array($config) || empty($config['password'])) {
        throw new RuntimeException('Invalid database configuration');
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $config['host'] ?? 'localhost',
        $config['port'] ?? 3306,
        $config['database'] ?? 'cpfamily'
    );
    $db = new PDO($dsn, $config['username'] ?? 'cpfamily', $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    $products = [];
    $rows = $db->query(
        "SELECT product_id, official_name, display_name, manufacturer, source_url
         FROM medisync_products
         WHERE product_type = 'otc'
         ORDER BY display_name
         LIMIT 500"
    );
    foreach ($rows as $row) {
        $id = $row['product_id'];
        $products[$id] = [
            'itemId' => $id,
            'officialName' => $row['official_name'],
            'displayName' => $row['display_name'],
            'manufacturer' => $row['manufacturer'],
            'sourceUrl' => $row['source_url'],
            'ingredients' => [],
            'notice' => ['cautionOriginal' => '', 'adverseOriginal' => ''],
        ];
    }

    $ingredients = $db->query(
        "SELECT ps.product_id, s.name
         FROM medisync_product_substances ps
         JOIN medisync_substances s ON s.substance_id = ps.substance_id
         JOIN medisync_products p ON p.product_id = ps.product_id
         WHERE p.product_type = 'otc'
         ORDER BY ps.product_id, s.name"
    );
    foreach ($ingredients as $row) {
        if (isset($products[$row['product_id']])) {
            $products[$row['product_id']]['ingredients'][] = $row['name'];
        }
    }

    $notices = $db->query(
        "SELECT n.product_id, n.notice_type, n.original_text
         FROM medisync_product_notices n
         JOIN medisync_products p ON p.product_id = n.product_id
         WHERE p.product_type = 'otc'
         ORDER BY n.notice_id"
    );
    foreach ($notices as $row) {
        $id = $row['product_id'];
        if (!isset($products[$id])) {
            continue;
        }
        if ($row['notice_type'] === 'interaction_caution') {
            $products[$id]['notice']['cautionOriginal'] = $row['original_text'];
        } elseif ($row['notice_type'] === 'adverse_effect') {
            $products[$id]['notice']['adverseOriginal'] = $row['original_text'];
        }
    }

    echo json_encode(
        ['products' => array_values($products), 'count' => count($products)],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
    );
} catch (Throwable $error) {
    // DB 비밀번호나 내부 경로를 방문자에게 공개하지 않습니다.
    error_log('MediSync catalog API failed');
    http_response_code(503);
    echo json_encode(['error' => 'catalog_unavailable']);
}

<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function request_header(string $name): string
{
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    if (!is_array($headers)) {
        $headers = [];
    }
    foreach ($headers as $header => $value) {
        if (is_string($header) && strtolower($header) === strtolower($name) && is_string($value)) {
            return $value;
        }
    }
    $serverName = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return is_string($_SERVER[$serverName] ?? null) ? $_SERVER[$serverName] : '';
}

function inside_directory(string $path, string $directory): bool
{
    return $path === $directory || str_starts_with($path, $directory . DIRECTORY_SEPARATOR);
}

function local_config(string $documentRoot): array
{
    $parent = dirname($documentRoot);
    while ($parent !== $documentRoot) {
        $candidate = $parent . DIRECTORY_SEPARATOR . 'planner-data' . DIRECTORY_SEPARATOR . 'config.json';
        if (file_exists($candidate) || is_link($candidate)) {
            $resolved = realpath($candidate);
            if (!$resolved || is_link($candidate) || !is_file($resolved) || !is_readable($resolved)
                || inside_directory($resolved, $documentRoot)) {
                respond(503, ['error' => 'Palvelimen asetustiedostoa ei voi käyttää web-juuren ulkopuolelta.']);
            }
            $contents = @file_get_contents($resolved);
            if ($contents === false) {
                error_log('Planner: local configuration could not be read.');
                respond(503, ['error' => 'Palvelimen asetustiedoston lukeminen epäonnistui.']);
            }
            $config = json_decode($contents, true);
            if (!is_array($config) || !is_string($config['writeKey'] ?? null) || strlen($config['writeKey']) < 32) {
                respond(503, ['error' => 'Palvelimen config.json ei ole kelvollinen tai kirjoitusavain on liian lyhyt.']);
            }
            return [dirname($resolved) . DIRECTORY_SEPARATOR . 'planner.json', $config['writeKey']];
        }
        $next = dirname($parent);
        if ($next === $parent) {
            break;
        }
        $parent = $next;
    }
    respond(503, ['error' => 'Palvelimen Aluesuunnittelu-tallennusta ei ole määritetty.']);
}

function planner_config(): array
{
    clearstatcache(true);
    $documentRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
    if (!$documentRoot) {
        respond(503, ['error' => 'Palvelimen web-juurta ei voi määrittää.']);
    }
    $file = getenv('PLANNER_DATA_FILE');
    $key = getenv('PLANNER_WRITE_KEY');
    // A partial environment configuration is an error, not a reason to use another key.
    if ($file === false && $key === false) {
        [$file, $key] = local_config($documentRoot);
    }
    if (!is_string($file) || !str_starts_with($file, DIRECTORY_SEPARATOR)
        || !is_string($key) || strlen($key) < 32) {
        respond(503, ['error' => 'Palvelimen Aluesuunnittelu-tallennusta ei ole määritetty.']);
    }

    $directory = realpath(dirname($file));
    if (!$directory || !is_writable($directory)) {
        respond(503, ['error' => 'Palvelimen tallennushakemistoa ei voi käyttää.']);
    }
    if (inside_directory($directory, $documentRoot)) {
        respond(503, ['error' => 'PLANNER_DATA_FILE pitää sijoittaa julkisen web-juuren ulkopuolelle.']);
    }

    return [$file, $key];
}

function read_state(string $file): array
{
    if (is_link($file) || is_link($file . '.lock')) {
        respond(503, ['error' => 'Palvelimen tallennustiedosto ei voi olla symbolinen linkki.']);
    }
    if (!is_file($file)) {
        return ['document' => null, 'backups' => []];
    }
    $contents = file_get_contents($file);
    $state = $contents === false ? null : json_decode($contents, true);
    if (!is_array($state) || !array_key_exists('document', $state) || !is_array($state['backups'] ?? null)) {
        respond(500, ['error' => 'Palvelimelle tallennettu suunnitelma ei ole kelvollinen JSON-tiedosto.']);
    }
    return ['document' => $state['document'], 'backups' => $state['backups']];
}

function revision(array $state): string
{
    return hash('sha256', json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
}

function valid_document(mixed $document): bool
{
    return is_array($document)
        && ($document['version'] ?? null) === 1
        && is_string($document['activeScenarioId'] ?? null)
        && is_array($document['scenarios'] ?? null)
        && count($document['scenarios']) > 0;
}

[$file, $writeKey] = planner_config();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $state = read_state($file);
    respond(200, [...$state, 'revision' => is_file($file) ? revision($state) : null]);
}

if ($method !== 'PUT') {
    header('Allow: GET, PUT');
    respond(405, ['error' => 'Pyyntöä ei tueta.']);
}

$providedKey = request_header('X-Planner-Write-Key');
if (!hash_equals($writeKey, $providedKey)) {
    respond(401, ['error' => 'Tallennukseen tarvitaan palvelimen kirjoitusavain.']);
}

$length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($length < 1 || $length > 10 * 1024 * 1024) {
    respond(413, ['error' => 'Tallennuspyynnön koko ei ole sallittu.']);
}
$payload = json_decode((string)file_get_contents('php://input'), true);
$document = is_array($payload) ? ($payload['document'] ?? null) : null;
$backups = is_array($payload) ? ($payload['backups'] ?? null) : null;
if (!valid_document($document) || !is_array($backups) || count($backups) > 10) {
    respond(400, ['error' => 'Tallennettava suunnitelma tai varmuuskopiot eivät ole kelvollisia.']);
}
foreach ($backups as $backup) {
    if (!is_array($backup) || !is_string($backup['id'] ?? null) || !is_string($backup['createdAt'] ?? null) || !valid_document($backup['document'] ?? null)) {
        respond(400, ['error' => 'Varmuuskopioiden tiedot eivät ole kelvollisia.']);
    }
}

$lock = fopen($file . '.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX)) {
    respond(503, ['error' => 'Palvelimen tallennuksen lukitseminen epäonnistui.']);
}

try {
    $current = read_state($file);
    $currentRevision = is_file($file) ? revision($current) : null;
    $expectedRevision = request_header('X-Expected-Revision');
    $createOnly = request_header('If-None-Match') === '*';
    if (($currentRevision === null && (!$createOnly || $expectedRevision !== ''))
        || ($currentRevision !== null && ($expectedRevision === '' || !hash_equals($currentRevision, $expectedRevision)))) {
        respond(409, ['error' => 'Palvelimen suunnitelma on muuttunut. Lataa uusin versio ennen tallennusta.']);
    }

    $next = ['document' => $document, 'backups' => $backups];
    $encoded = json_encode($next, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $temporary = tempnam(dirname($file), '.planner-');
    if ($temporary === false || file_put_contents($temporary, $encoded, LOCK_EX) === false) {
        respond(503, ['error' => 'Suunnitelman kirjoittaminen palvelimelle epäonnistui.']);
    }
    chmod($temporary, 0600);
    if (!rename($temporary, $file)) {
        unlink($temporary);
        respond(503, ['error' => 'Suunnitelman julkaiseminen palvelimelle epäonnistui.']);
    }
    respond(200, ['revision' => revision($next)]);
} finally {
    flock($lock, LOCK_UN);
    fclose($lock);
}

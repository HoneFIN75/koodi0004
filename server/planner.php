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
    if (is_array($headers)) {
        foreach ($headers as $header => $value) {
            if (is_string($header) && strtolower($header) === strtolower($name) && is_string($value)) {
                return $value;
            }
        }
    }
    $serverName = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return is_string($_SERVER[$serverName] ?? null) ? $_SERVER[$serverName] : '';
}

function inside_directory(string $path, string $directory): bool
{
    return $path === $directory || str_starts_with($path, $directory . DIRECTORY_SEPARATOR);
}

function document_root(): string
{
    $root = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
    if (!$root) {
        respond(503, ['error' => 'Palvelimen web-juurta ei voi määrittää.']);
    }
    return $root;
}

function planner_data_directory(string $root): string
{
    $configuredFile = getenv('PLANNER_DATA_FILE');
    if ($configuredFile !== false && $configuredFile !== '') {
        if (!str_starts_with($configuredFile, DIRECTORY_SEPARATOR)) {
            respond(503, ['error' => 'Palvelimen tallennushakemistoa ei voi käyttää.']);
        }
        $directory = realpath(dirname($configuredFile));
        if (!$directory || !is_writable($directory) || !private_directory($directory)
            || inside_directory($configuredFile, $root) || inside_directory($directory, $root)) {
            respond(503, ['error' => 'Palvelimen tallennushakemistoa ei voi käyttää web-juuren ulkopuolelta.']);
        }
        return $directory;
    }

    $parent = dirname($root);
    while ($parent !== $root) {
        $candidate = $parent . DIRECTORY_SEPARATOR . 'planner-data';
        $configFile = $candidate . DIRECTORY_SEPARATOR . 'config.json';
        $authFile = $candidate . DIRECTORY_SEPARATOR . 'auth.json';
        if (file_exists($configFile) || is_link($configFile) || file_exists($authFile) || is_link($authFile)) {
            $directory = realpath($candidate);
            if (!$directory || is_link($candidate) || !is_dir($directory) || !is_writable($directory)
                || !private_directory($directory) || inside_directory($directory, $root)) {
                respond(503, ['error' => 'Palvelimen tallennushakemistoa ei voi käyttää web-juuren ulkopuolelta.']);
            }
            foreach ([$configFile, $authFile] as $privateFile) {
                if (is_link($privateFile)) {
                    respond(503, ['error' => 'Yksityinen palvelinasetustiedosto ei voi olla symbolinen linkki.']);
                }
            }
            return $directory;
        }
        $next = dirname($parent);
        if ($next === $parent) {
            break;
        }
        $parent = $next;
    }
    respond(503, ['error' => 'Palvelimen Aluesuunnittelu-tallennusta ei ole määritetty.']);
}

function private_directory(string $directory): bool
{
    clearstatcache(true, $directory);
    $permissions = fileperms($directory);
    return $permissions !== false && ($permissions & 0077) === 0;
}

function data_file(string $directory): string
{
    $configuredFile = getenv('PLANNER_DATA_FILE');
    return $configuredFile !== false && $configuredFile !== ''
        ? $configuredFile
        : $directory . DIRECTORY_SEPARATOR . 'planner.json';
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

function https_request(): bool
{
    return in_array(strtolower((string)($_SERVER['HTTPS'] ?? '')), ['on', '1'], true)
        || (string)($_SERVER['SERVER_PORT'] ?? '') === '443';
}

function json_request(): array
{
    $length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length < 1 || $length > 1024 * 1024) {
        respond(413, ['error' => 'Pyyntö ei ole kelvollinen.']);
    }
    $payload = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($payload)) {
        respond(400, ['error' => 'Pyyntö ei ole kelvollinen JSON-objekti.']);
    }
    return $payload;
}

function auth_path(string $directory): string
{
    return $directory . DIRECTORY_SEPARATOR . 'auth.json';
}

function read_auth(string $directory): ?array
{
    $path = auth_path($directory);
    if (is_link($path)) {
        respond(503, ['error' => 'Kirjautumisasetustiedostoa ei voi käyttää.']);
    }
    if (!is_file($path)) {
        return null;
    }
    $contents = file_get_contents($path);
    $auth = $contents === false ? null : json_decode($contents, true);
    if (!is_array($auth) || ($auth['version'] ?? null) !== 1
        || !is_int($auth['sessionVersion'] ?? null)
        || !is_string($auth['rateLimitKey'] ?? null)
        || !preg_match('/^[a-f0-9]{64}$/', $auth['rateLimitKey'])
        || !is_array($auth['passwords'] ?? null)
        || !is_string($auth['passwords']['writer'] ?? null)
        || !is_string($auth['passwords']['admin'] ?? null)) {
        respond(503, ['error' => 'Kirjautuminen ei ole määritetty oikein.']);
    }
    clearstatcache(true, $path);
    $permissions = fileperms($path);
    if ($permissions === false || ($permissions & 0077) !== 0) {
        respond(503, ['error' => 'Kirjautumisasetustiedoston oikeuksien tulee olla 600.']);
    }
    return $auth;
}

function begin_session(string $directory): void
{
    $sessionDirectory = $directory . DIRECTORY_SEPARATOR . 'sessions';
    if (is_link($sessionDirectory)) {
        respond(503, ['error' => 'Kirjautumisistuntoja ei voi tallentaa turvallisesti.']);
    }
    if (!is_dir($sessionDirectory) && !mkdir($sessionDirectory, 0700, true) && !is_dir($sessionDirectory)) {
        respond(503, ['error' => 'Kirjautumisistuntoja ei voi tallentaa turvallisesti.']);
    }
    if (!chmod($sessionDirectory, 0700) || !private_directory($sessionDirectory)
        || !is_writable($sessionDirectory) || session_save_path($sessionDirectory) === false) {
        respond(503, ['error' => 'Kirjautumisistuntoja ei voi tallentaa turvallisesti.']);
    }
    foreach ([
        'session.use_strict_mode' => '1',
        'session.use_cookies' => '1',
        'session.use_only_cookies' => '1',
        'session.use_trans_sid' => '0',
        'session.gc_maxlifetime' => (string)(8 * 60 * 60),
        'session.cookie_httponly' => '1',
        'session.cookie_secure' => '1',
        'session.cookie_samesite' => 'Strict',
    ] as $setting => $value) {
        if (ini_set($setting, $value) === false) {
            respond(503, ['error' => 'Kirjautumisistuntoa ei voitu määrittää turvallisesti.']);
        }
    }
    if (session_name('planner_session') === false || !session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ])) {
        respond(503, ['error' => 'Kirjautumisistuntoa ei voitu määrittää turvallisesti.']);
    }
    if (!session_start()) {
        respond(503, ['error' => 'Kirjautumisistuntoa ei voitu aloittaa.']);
    }
}

function clear_session(): void
{
    $_SESSION = [];
    session_regenerate_id(true);
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function csrf_token(): string
{
    if (!is_string($_SESSION['csrf'] ?? null)) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function verify_csrf(): void
{
    $token = request_header('X-CSRF-Token');
    if ($token === '' || !hash_equals(csrf_token(), $token)) {
        respond(403, ['error' => 'Pyyntö vanheni. Päivitä sivu ja yritä uudelleen.']);
    }
}

function session_role(?array $auth): ?string
{
    $role = $_SESSION['role'] ?? null;
    if (!$auth || !in_array($role, ['writer', 'admin'], true)
        || ($_SESSION['sessionVersion'] ?? null) !== $auth['sessionVersion']
        || !is_int($_SESSION['issuedAt'] ?? null)
        || $_SESSION['issuedAt'] < time() - 8 * 60 * 60) {
        if (isset($_SESSION['role'])) {
            clear_session();
        }
        return null;
    }
    return $role;
}

function require_https(): void
{
    if (!https_request()) {
        respond(400, ['error' => 'Kirjautuminen ja muutokset edellyttävät HTTPS-yhteyttä.']);
    }
}

function auth_action(string $directory): never
{
    $action = (string)($_GET['action'] ?? '');
    if ($action === 'session') {
        require_https();
        begin_session($directory);
        $auth = read_auth($directory);
        respond(200, [
            'authReady' => $auth !== null,
            'role' => session_role($auth),
            'csrfToken' => csrf_token(),
        ]);
    }

    require_https();
    begin_session($directory);
    $auth = read_auth($directory);
    if (!$auth) {
        respond(503, ['error' => 'Kirjautumista ei ole vielä alustettu palvelimelle.']);
    }
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method !== 'POST') {
        header('Allow: POST');
        respond(405, ['error' => 'Pyyntöä ei tueta.']);
    }
    verify_csrf();
    $payload = json_request();

    if ($action === 'login') {
        $role = $payload['role'] ?? null;
        $password = $payload['password'] ?? null;
        if (!is_string($role) || !in_array($role, ['writer', 'admin'], true)
            || !is_string($password) || strlen($password) > 1024) {
            respond(400, ['error' => 'Tunnus tai salasana on virheellinen.']);
        }
        $remoteAddress = is_string($_SERVER['REMOTE_ADDR'] ?? null) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
        $fingerprint = hash_hmac('sha256', $remoteAddress . '|' . $role, $auth['rateLimitKey']);
        if (!rate_limit($directory, $fingerprint, false)) {
            respond(429, ['error' => 'Kirjautumisyrityksiä on liikaa. Odota 15 minuuttia ja yritä uudelleen.']);
        }
        if (!password_verify($password, $auth['passwords'][$role])) {
            rate_limit($directory, $fingerprint, true);
            respond(401, ['error' => 'Tunnus tai salasana on virheellinen.']);
        }
        rate_limit($directory, $fingerprint, null);
        session_regenerate_id(true);
        $_SESSION = [
            'role' => $role,
            'sessionVersion' => $auth['sessionVersion'],
            'issuedAt' => time(),
            'csrf' => bin2hex(random_bytes(32)),
        ];
        respond(200, ['role' => $role, 'csrfToken' => $_SESSION['csrf']]);
    }

    $role = session_role($auth);
    if ($action === 'logout') {
        clear_session();
        respond(200, ['role' => null, 'csrfToken' => $_SESSION['csrf']]);
    }
    if ($action !== 'admin/password') {
        respond(404, ['error' => 'Rajapintaa ei löydy.']);
    }
    if ($role !== 'admin') {
        respond(403, ['error' => 'Tämä toiminto edellyttää ylläpitäjän käyttöoikeutta.']);
    }

    $account = $payload['account'] ?? null;
    $currentPassword = $payload['currentAdminPassword'] ?? null;
    $newPassword = $payload['newPassword'] ?? null;
    if (!in_array($account, ['writer', 'admin'], true)
        || !is_string($currentPassword) || strlen($currentPassword) > 1024 || !is_string($newPassword)
        || !password_verify($currentPassword, $auth['passwords']['admin'])) {
        respond(400, ['error' => 'Nykyinen ylläpitäjän salasana tai tilitiedot ovat virheelliset.']);
    }
    $characterCount = preg_match_all('/./us', $newPassword);
    if ($characterCount === false || $characterCount < 12 || strlen($newPassword) > 1024) {
        respond(400, ['error' => 'Salasanan tulee olla vähintään 12 merkkiä.']);
    }
    if (!defined('PASSWORD_ARGON2ID') && strlen($newPassword) > 72) {
        respond(400, ['error' => 'Tämän palvelimen salasana voi olla enintään 72 tavua.']);
    }

    $lock = fopen($directory . DIRECTORY_SEPARATOR . 'auth.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        respond(503, ['error' => 'Salasanan vaihtaminen epäonnistui.']);
    }
    try {
        $latest = read_auth($directory);
        if (!$latest || $latest['sessionVersion'] !== $auth['sessionVersion']
            || !password_verify($currentPassword, $latest['passwords']['admin'])) {
            respond(409, ['error' => 'Kirjautumistiedot muuttuivat. Kirjaudu uudelleen ja yritä uudelleen.']);
        }
        $algorithm = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
        $hash = password_hash($newPassword, $algorithm);
        if ($hash === false) {
            respond(503, ['error' => 'Salasanan vaihtaminen epäonnistui.']);
        }
        $latest['passwords'][$account] = $hash;
        $latest['sessionVersion']++;
        if (!write_private_json(auth_path($directory), $latest)) {
            respond(503, ['error' => 'Salasanan tallentaminen epäonnistui.']);
        }
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
    clear_session();
    respond(200, ['role' => null, 'csrfToken' => $_SESSION['csrf']]);
}

function rate_limit(string $directory, string $fingerprint, ?bool $failed): bool
{
    $path = $directory . DIRECTORY_SEPARATOR . 'login-attempts.json';
    if (is_link($path)) {
        respond(503, ['error' => 'Kirjautumisrajoitusta ei voi käyttää.']);
    }
    $previousMask = umask(0077);
    $handle = fopen($path, 'c+');
    umask($previousMask);
    if ($handle === false) {
        respond(503, ['error' => 'Kirjautumisrajoitusta ei voi käyttää.']);
    }
    if (!chmod($path, 0600)) {
        flock($handle, LOCK_UN);
        fclose($handle);
        respond(503, ['error' => 'Kirjautumisrajoituksen tiedoston oikeuksien tulee olla 600.']);
    }
    clearstatcache(true, $path);
    $permissions = fileperms($path);
    if ($permissions === false || ($permissions & 0077) !== 0) {
        flock($handle, LOCK_UN);
        fclose($handle);
        respond(503, ['error' => 'Kirjautumisrajoituksen tiedoston oikeuksien tulee olla 600.']);
    }
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        respond(503, ['error' => 'Kirjautumisrajoitusta ei voi käyttää.']);
    }
    try {
        rewind($handle);
        $raw = stream_get_contents($handle);
        $entries = $raw === '' ? [] : json_decode((string)$raw, true);
        if (!is_array($entries)) {
            respond(503, ['error' => 'Kirjautumisrajoitusta ei voi käyttää.']);
        }
        $now = time();
        $attempts = array_values(array_filter(
            is_array($entries[$fingerprint] ?? null) ? $entries[$fingerprint] : [],
            static fn($time): bool => is_int($time) && $time > $now - 900
        ));
        if ($failed === false && count($attempts) >= 10) {
            return false;
        }
        if ($failed === true) {
            $attempts[] = $now;
        } elseif ($failed === null) {
            $attempts = [];
        }
        $entries[$fingerprint] = $attempts;
        foreach ($entries as $key => $times) {
            if (!is_array($times) || $times === []) {
                unset($entries[$key]);
            }
        }
        $encoded = json_encode($entries, JSON_THROW_ON_ERROR);
        rewind($handle);
        if (!ftruncate($handle, 0) || fwrite($handle, $encoded) !== strlen($encoded) || !fflush($handle)) {
            respond(503, ['error' => 'Kirjautumisrajoitusta ei voi tallentaa.']);
        }
        return true;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function write_private_json(string $path, array $value): bool
{
    $encoded = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $temporary = tempnam(dirname($path), '.planner-auth-');
    if ($temporary === false) {
        return false;
    }
    if (file_put_contents($temporary, $encoded, LOCK_EX) !== strlen($encoded)) {
        unlink($temporary);
        return false;
    }
    chmod($temporary, 0600);
    if (!rename($temporary, $path)) {
        unlink($temporary);
        return false;
    }
    return true;
}

$root = document_root();
$directory = planner_data_directory($root);
$file = data_file($directory);
$action = (string)($_GET['action'] ?? '');
if ($action === 'clubs') {
    require_once __DIR__ . '/clubs-api.php';
    clubs_api($directory);
}
if ($action !== '') {
    auth_action($directory);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    $state = read_state($file);
    respond(200, [...$state, 'revision' => is_file($file) ? revision($state) : null]);
}
if ($method !== 'PUT') {
    header('Allow: GET, PUT');
    respond(405, ['error' => 'Pyyntöä ei tueta.']);
}

require_https();
$auth = read_auth($directory);
begin_session($directory);
$role = session_role($auth);
if ($role !== 'writer' && $role !== 'admin') {
    respond(401, ['error' => 'Kirjoittaminen edellyttää kirjautumista Writer- tai Admin-tunnuksella.']);
}
verify_csrf();

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

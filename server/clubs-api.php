<?php
declare(strict_types=1);

function clubs_respond(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function clubs_file(string $directory): string
{
    return $directory . DIRECTORY_SEPARATOR . 'clubs.json';
}

function clubs_revision(array $store): string
{
    return hash('sha256', json_encode($store, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
}

function clubs_text(mixed $value, int $maxLength, bool $required = false): bool
{
    if (!is_string($value) || strlen($value) > $maxLength || preg_match('//u', $value) !== 1) {
        return false;
    }
    $value = trim($value);
    return !$required || $value !== '';
}

function clubs_valid_url(string $value): bool
{
    if ($value === '') {
        return true;
    }
    $parts = parse_url($value);
    return is_array($parts)
        && in_array(strtolower((string)($parts['scheme'] ?? '')), ['http', 'https'], true)
        && isset($parts['host'])
        && $parts['host'] !== ''
        && !isset($parts['user'])
        && !isset($parts['pass'])
        && filter_var($value, FILTER_VALIDATE_URL) !== false;
}

function clubs_valid_record(mixed $club): bool
{
    $recordFields = ['id', 'seura', 'paikkakunta', 'latitude', 'longitude', 'jasenmaara', 'aanimaara', 'contact', 'details', 'archived'];
    if (!is_array($club)
        || array_diff(array_keys($club), $recordFields) !== []
        || !is_string($club['id'] ?? null)
        || !preg_match('/^[A-Za-z0-9_-]{1,100}$/', $club['id'])
        || !clubs_text($club['seura'] ?? null, 200, true)
        || !clubs_text($club['paikkakunta'] ?? null, 200, true)
        || !array_key_exists('latitude', $club)
        || !array_key_exists('longitude', $club)
        || !array_key_exists('jasenmaara', $club)
        || !array_key_exists('aanimaara', $club)
        || !array_key_exists('contact', $club)
        || !array_key_exists('details', $club)
        || !is_bool($club['archived'] ?? null)) {
        return false;
    }

    foreach (['latitude' => [-90, 90], 'longitude' => [-180, 180]] as $key => [$min, $max]) {
        $value = $club[$key];
        if ($value !== null && ((!is_int($value) && !is_float($value)) || !is_finite((float)$value) || $value < $min || $value > $max)) {
            return false;
        }
    }
    $members = $club['jasenmaara'];
    if ($members !== null && (!is_int($members) || $members < 0 || $members > 9007199254740991)) {
        return false;
    }
    $expectedVotes = $members === null ? null : ($members === 0 ? 0 : ($members < 100 ? 10 : ($members < 300 ? 15 : ($members < 500 ? 20 : 25))));
    if ($club['aanimaara'] !== $expectedVotes) {
        return false;
    }

    $contact = $club['contact'];
    $contactFields = ['name', 'email', 'phone', 'website', 'instagram', 'tiktok', 'public'];
    if (!is_array($contact)
        || array_diff(array_keys($contact), $contactFields) !== []
        || !clubs_text($contact['name'] ?? null, 200)
        || !clubs_text($contact['email'] ?? null, 254)
        || !clubs_text($contact['phone'] ?? null, 50)
        || !clubs_text($contact['website'] ?? null, 2048)
        || !clubs_text($contact['instagram'] ?? null, 2048)
        || !clubs_text($contact['tiktok'] ?? null, 2048)
        || !is_bool($contact['public'] ?? null)) {
        return false;
    }
    $email = trim($contact['email']);
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        return false;
    }
    foreach (['website', 'instagram', 'tiktok'] as $field) {
        if (!clubs_valid_url(trim($contact[$field]))) {
            return false;
        }
    }

    $details = $club['details'];
    if (!is_array($details) || count($details) > 100) {
        return false;
    }
    foreach ($details as $key => $value) {
        $validString = is_string($value) && clubs_text($value, 2000);
        $validNumber = (is_int($value) || is_float($value)) && (!is_float($value) || is_finite($value));
        if (!is_string($key) || $key === '' || strlen($key) > 100
            || (!$validString && !$validNumber)) {
            return false;
        }
    }
    return true;
}

function clubs_valid_store(mixed $store): bool
{
    if (!is_array($store) || array_diff(array_keys($store), ['version', 'data']) !== []
        || ($store['version'] ?? null) !== 1 || !is_array($store['data'] ?? null) || !array_is_list($store['data'])) {
        return false;
    }
    if (count($store['data']) > 10000) {
        return false;
    }
    $ids = [];
    foreach ($store['data'] as $club) {
        if (!clubs_valid_record($club) || isset($ids[$club['id']])) {
            return false;
        }
        $ids[$club['id']] = true;
    }
    return true;
}

function clubs_load_store(string $file): array
{
    if (is_link($file) || is_link($file . '.lock')) {
        clubs_respond(503, ['error' => 'Seuratietojen tallennustiedosto ei voi olla symbolinen linkki.']);
    }
    if (!is_file($file)) {
        clubs_respond(503, ['error' => 'Seuratietoja ei ole vielä alustettu. Suorita seuratietojen migraatio palvelimella.']);
    }
    clearstatcache(true, $file);
    $permissions = fileperms($file);
    if ($permissions === false || ($permissions & 0077) !== 0) {
        clubs_respond(503, ['error' => 'Seuratietojen tallennustiedoston oikeuksien tulee olla 600.']);
    }
    $contents = file_get_contents($file);
    $store = $contents === false ? null : json_decode($contents, true);
    if (!clubs_valid_store($store)) {
        clubs_respond(500, ['error' => 'Palvelimelle tallennetut seuratiedot eivät ole kelvollisia.']);
    }
    return $store;
}

function clubs_write_store(string $file, array $store): void
{
    $encoded = json_encode($store, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $temporary = tempnam(dirname($file), '.clubs-');
    if ($temporary === false) {
        clubs_respond(503, ['error' => 'Seuratietojen väliaikaistiedoston luominen epäonnistui.']);
    }
    if (!chmod($temporary, 0600) || file_put_contents($temporary, $encoded, LOCK_EX) !== strlen($encoded)) {
        unlink($temporary);
        clubs_respond(503, ['error' => 'Seuratietojen kirjoittaminen epäonnistui.']);
    }
    if (!rename($temporary, $file)) {
        unlink($temporary);
        clubs_respond(503, ['error' => 'Seuratietojen julkaiseminen epäonnistui.']);
    }
}

function clubs_admin_role(string $directory): string
{
    require_https();
    begin_session($directory);
    $role = session_role(read_auth($directory));
    if ($role === null) {
        clubs_respond(401, ['error' => 'Kirjautuminen edellytetään.']);
    }
    if ($role !== 'admin') {
        clubs_respond(403, ['error' => 'Tämä toiminto edellyttää ylläpitäjän käyttöoikeutta.']);
    }
    return $role;
}

function clubs_api(string $directory): never
{
    $file = clubs_file($directory);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $view = (string)($_GET['view'] ?? '');

    if ($method === 'GET') {
        if ($view === 'admin') {
            clubs_admin_role($directory);
        } elseif ($view !== '') {
            clubs_respond(400, ['error' => 'Näkymää ei tunnistettu.']);
        }
        $store = clubs_load_store($file);
        $revision = clubs_revision($store);
        if ($view === 'admin') {
            clubs_respond(200, [...$store, 'revision' => $revision]);
        }

        $publicClubs = [];
        foreach ($store['data'] as $club) {
            if ($club['archived']) {
                continue;
            }
            if (!$club['contact']['public']) {
                unset($club['contact']);
            }
            $publicClubs[] = $club;
        }
        clubs_respond(200, [
            'metadata' => [
                'generatedAt' => gmdate('c'),
                'recordCount' => count($publicClubs),
                'source' => 'Seurakartta',
            ],
            'data' => $publicClubs,
            'revision' => clubs_revision(['version' => 1, 'data' => $publicClubs]),
        ]);
    }

    if ($method !== 'PUT') {
        header('Allow: GET, PUT');
        clubs_respond(405, ['error' => 'Pyyntöä ei tueta.']);
    }
    clubs_admin_role($directory);
    verify_csrf();

    $length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length < 1 || $length > 10 * 1024 * 1024) {
        clubs_respond(413, ['error' => 'Seuratietopyynnön koko ei ole sallittu.']);
    }
    $payload = json_decode((string)file_get_contents('php://input'), true);
    if (!clubs_valid_store($payload)) {
        clubs_respond(400, ['error' => 'Tallennettavat seuratiedot eivät ole kelvollisessa muodossa.']);
    }

    $lockPath = $file . '.lock';
    if (is_link($lockPath)) {
        clubs_respond(503, ['error' => 'Seuratietojen tallennuslukko ei voi olla symbolinen linkki.']);
    }
    $lock = fopen($lockPath, 'c');
    if ($lock === false || !chmod($lockPath, 0600) || !flock($lock, LOCK_EX)) {
        if (is_resource($lock)) {
            fclose($lock);
        }
        clubs_respond(503, ['error' => 'Seuratietojen tallennuksen lukitseminen epäonnistui.']);
    }

    try {
        $current = clubs_load_store($file);
        $currentRevision = clubs_revision($current);
        $expectedRevision = request_header('X-Expected-Revision');
        if (!preg_match('/^[a-f0-9]{64}$/', $expectedRevision) || !hash_equals($currentRevision, $expectedRevision)) {
            clubs_respond(409, ['error' => 'Seuratiedot ovat muuttuneet. Lataa uusin aineisto ennen tallennusta.']);
        }
        clubs_write_store($file, $payload);
        clubs_respond(200, ['revision' => clubs_revision($payload)]);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

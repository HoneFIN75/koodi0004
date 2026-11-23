<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/clubs-api.php';

function migration_fail(string $message): never
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function migration_number(mixed $value): ?float
{
    if (is_int($value) || is_float($value)) {
        return is_finite((float)$value) ? (float)$value : null;
    }
    if (!is_string($value) || trim($value) === '') {
        return null;
    }
    $number = preg_replace('/[\s\x{00A0}]+/u', '', $value);
    return is_string($number) && is_numeric($number) && is_finite((float)$number) ? (float)$number : null;
}

function migration_count(mixed $value): ?int
{
    $number = migration_number($value);
    return $number !== null && $number >= 0 && $number <= 9007199254740991 && floor($number) === $number ? (int)$number : null;
}

function migration_text(mixed $value): ?string
{
    return is_string($value) && trim($value) !== '' ? trim($value) : null;
}

function migration_key(string $value): string
{
    $value = preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);
    return function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
}

function migration_private_directory(string $directory): bool
{
    clearstatcache(true, $directory);
    $permissions = fileperms($directory);
    return $permissions !== false && ($permissions & 0077) === 0;
}

function migration_record(array $item, int $index, int $duplicatePosition = 0): array
{
    $name = migration_text($item['seura'] ?? null) ?? 'Nimetön seura (tietue ' . ($index + 1) . ')';
    $town = migration_text($item['paikkakunta'] ?? null) ?? 'Paikkakunta puuttuu';
    $latitude = migration_number($item['latitude'] ?? null);
    $longitude = migration_number($item['longitude'] ?? null);
    if ($latitude === null || $latitude < -90 || $latitude > 90) {
        $latitude = null;
    }
    if ($longitude === null || $longitude < -180 || $longitude > 180) {
        $longitude = null;
    }
    $members = migration_count($item['jasenmaara'] ?? null);
    $votes = $members === null ? null : ($members === 0 ? 0 : ($members < 100 ? 10 : ($members < 300 ? 15 : ($members < 500 ? 20 : 25))));
    $contactSource = is_array($item['contact'] ?? null) ? $item['contact'] : [];
    $contactFields = [
        'name' => ['contactName', 'name'],
        'email' => ['email', 'email'],
        'phone' => ['phone', 'phone'],
        'website' => ['website', 'website'],
        'instagram' => ['instagram', 'instagram'],
        'tiktok' => ['tiktok', 'tiktok'],
    ];
    $contact = [];
    foreach ($contactFields as $field => [$legacy, $nested]) {
        $value = $contactSource[$nested] ?? $item[$legacy] ?? '';
        $contact[$field] = is_string($value) ? trim($value) : '';
    }
    $contact['public'] = array_key_exists('public', $contactSource)
        ? $contactSource['public'] === true
        : (migration_text($item['email'] ?? null) !== null || migration_text($item['website'] ?? null) !== null);

    $core = ['seura', 'paikkakunta', 'latitude', 'longitude', 'jasenmaara', 'aanimaara', 'id', 'archived', 'contact'];
    foreach (array_column($contactFields, 0) as $legacyField) {
        $core[] = $legacyField;
    }
    $details = [];
    foreach ($item as $key => $value) {
        if (in_array($key, $core, true)) {
            continue;
        }
        if (is_string($value) && trim($value) !== '') {
            $details[$key] = trim($value);
        } elseif (is_int($value) || (is_float($value) && is_finite($value))) {
            $details[$key] = $value;
        }
    }
    $stableKey = migration_key($name) . "\0" . migration_key($town);
    if ($duplicatePosition > 0) {
        $stableKey .= "\0source-row:" . ($index + 1);
    }
    return [
        'id' => 'club_' . hash('sha256', $stableKey),
        'seura' => $name,
        'paikkakunta' => $town,
        'latitude' => $latitude,
        'longitude' => $longitude,
        'jasenmaara' => $members,
        'aanimaara' => $votes,
        'contact' => $contact,
        'details' => $details,
        'archived' => false,
    ];
}

if ($argc !== 3 && $argc !== 4) {
    migration_fail('Käyttö: php server/migrate-clubs.php <seurat.json> <yksityinen-polku/clubs.json> [--preserve-duplicate-name-town]');
}
$preserveDuplicates = $argc === 4 && $argv[3] === '--preserve-duplicate-name-town';
if ($argc === 4 && !$preserveDuplicates) {
    migration_fail('Tuntematon valitsin.');
}
$sourcePath = $argv[1];
$targetPath = $argv[2];
$source = is_file($sourcePath) && !is_link($sourcePath) ? file_get_contents($sourcePath) : false;
$payload = $source === false ? null : json_decode($source, true);
if (!is_array($payload) || !is_array($payload['data'] ?? null) || !array_is_list($payload['data'])) {
    migration_fail('Lähdetiedosto ei sisällä kelvollista data-taulukkoa.');
}

$keyTotals = [];
foreach ($payload['data'] as $index => $item) {
    if (!is_array($item)) {
        migration_fail('Lähdeaineistossa on virheellinen tietue. Migraatiota ei tehty.');
    }
    $name = migration_text($item['seura'] ?? null) ?? 'Nimetön seura (tietue ' . ($index + 1) . ')';
    $town = migration_text($item['paikkakunta'] ?? null) ?? 'Paikkakunta puuttuu';
    $key = migration_key($name) . "\0" . migration_key($town);
    $keyTotals[$key] = ($keyTotals[$key] ?? 0) + 1;
}
$duplicateGroups = count(array_filter($keyTotals, static fn(int $count): bool => $count > 1));
if ($duplicateGroups > 0 && !$preserveDuplicates) {
    migration_fail($duplicateGroups . ' seuran nimi- ja paikkakuntayhdistelmää ei ole yksikäsitteinen. Tarkista lähde tai vahvista niiden säilyttäminen erillisinä valitsimella --preserve-duplicate-name-town. Migraatiota ei tehty.');
}

$data = [];
$seenKeys = [];
$keyPositions = [];
$warnings = [
    'missing_name' => 0,
    'missing_town' => 0,
    'invalid_coordinates' => 0,
    'unknown_members' => 0,
    'recalculated_votes' => 0,
    'duplicate_name_town_groups_preserved' => $duplicateGroups,
];
foreach ($payload['data'] as $index => $item) {
    if (!is_array($item)) {
        migration_fail('Lähdeaineistossa on virheellinen tietue. Migraatiota ei tehty.');
    }
    if (migration_text($item['seura'] ?? null) === null) {
        $warnings['missing_name']++;
    }
    if (migration_text($item['paikkakunta'] ?? null) === null) {
        $warnings['missing_town']++;
    }
    $latitude = migration_number($item['latitude'] ?? null);
    $longitude = migration_number($item['longitude'] ?? null);
    $invalidLatitude = ($item['latitude'] ?? null) !== null
        && ($latitude === null || $latitude < -90 || $latitude > 90);
    $invalidLongitude = ($item['longitude'] ?? null) !== null
        && ($longitude === null || $longitude < -180 || $longitude > 180);
    if ($invalidLatitude || $invalidLongitude) {
        $warnings['invalid_coordinates']++;
    }
    $members = migration_count($item['jasenmaara'] ?? null);
    if (($item['jasenmaara'] ?? null) !== null && $members === null) {
        $warnings['unknown_members']++;
    }
    $sourceVotes = migration_count($item['aanimaara'] ?? null);
    $expectedVotes = $members === null ? null : ($members === 0 ? 0 : ($members < 100 ? 10 : ($members < 300 ? 15 : ($members < 500 ? 20 : 25))));
    if (($item['aanimaara'] ?? null) !== null && $sourceVotes !== $expectedVotes) {
        $warnings['recalculated_votes']++;
    }
    $name = migration_text($item['seura'] ?? null) ?? 'Nimetön seura (tietue ' . ($index + 1) . ')';
    $town = migration_text($item['paikkakunta'] ?? null) ?? 'Paikkakunta puuttuu';
    $key = migration_key($name) . "\0" . migration_key($town);
    $position = ($keyPositions[$key] ?? 0) + 1;
    $keyPositions[$key] = $position;
    $club = migration_record($item, $index, $keyTotals[$key] > 1 ? $position : 0);
    if (isset($seenKeys[$club['id']])) {
        migration_fail('Seuran tunniste ei ole yksikäsitteinen. Migraatiota ei tehty.');
    }
    $seenKeys[$club['id']] = true;
    $data[] = $club;
}

$store = ['version' => 1, 'data' => $data];
if (!clubs_valid_store($store)) {
    migration_fail('Migroitu seuratietomalli ei läpäissyt validointia. Migraatiota ei tehty.');
}
$directory = realpath(dirname($targetPath));
$fileName = basename($targetPath);
if (!$directory || $fileName === '.' || $fileName === '..' || str_contains($fileName, DIRECTORY_SEPARATOR)
    || !is_writable($directory) || !migration_private_directory($directory)
    || $targetPath !== $directory . DIRECTORY_SEPARATOR . $fileName
    || is_link($targetPath) || file_exists($targetPath)) {
    migration_fail('Kohdekansion tulee olla olemassa, kirjoitettava ja yksityinen (oikeudet 700); kohdetiedosto ei saa olla olemassa.');
}

$lockPath = $targetPath . '.migration.lock';
$lock = fopen($lockPath, 'x');
if ($lock === false || !chmod($lockPath, 0600) || !flock($lock, LOCK_EX)) {
    migration_fail('Migraation lukitseminen epäonnistui tai migraatio on jo suoritettu.');
}
try {
    if (file_exists($targetPath) || is_link($targetPath)) {
        migration_fail('Kohdetiedosto luotiin migraation aikana. Olemassa olevaa tiedostoa ei ylikirjoitettu.');
    }
    $encoded = json_encode($store, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $previousMask = umask(0077);
    $temporary = tempnam($directory, '.clubs-migration-');
    umask($previousMask);
    if ($temporary === false || !chmod($temporary, 0600) || file_put_contents($temporary, $encoded, LOCK_EX) !== strlen($encoded)) {
        if (is_string($temporary)) {
            unlink($temporary);
        }
        migration_fail('Migroidun tiedoston kirjoittaminen epäonnistui.');
    }
    if (!rename($temporary, $targetPath)) {
        unlink($temporary);
        migration_fail('Migroidun tiedoston julkaiseminen epäonnistui.');
    }
} finally {
    flock($lock, LOCK_UN);
    fclose($lock);
}

fwrite(STDOUT, count($data) . ' seuraa migroitiin. Yksityisiä yhteystietoja ei tulostettu.' . PHP_EOL);
foreach ($warnings as $warning => $count) {
    if ($count > 0) {
        fwrite(STDOUT, $count . ' tietueessa: ' . str_replace('_', ' ', $warning) . '.' . PHP_EOL);
    }
}

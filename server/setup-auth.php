<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

function fail(string $message): never
{
    fwrite(STDERR, $message . PHP_EOL);
    exit(1);
}

function tty_command(array $arguments): array
{
    $pipes = [];
    $process = proc_open($arguments, [
        0 => STDIN,
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $pipes);
    if (!is_resource($process)) {
        return ['', 1];
    }
    $output = stream_get_contents($pipes[1]);
    $error = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $status = proc_close($process);
    return [$output . $error, $status];
}

function read_password(string $prompt): string
{
    fwrite(STDOUT, $prompt);
    $isTerminal = function_exists('stream_isatty') && stream_isatty(STDIN);
    $terminalState = null;
    if ($isTerminal) {
        [$terminalState, $status] = tty_command(['stty', '-g']);
        if ($status !== 0 || trim($terminalState) === '') {
            fail('Salasanaa ei voitu lukea turvallisesti tältä päätelaitteelta.');
        }
        [, $status] = tty_command(['stty', '-echo']);
        if ($status !== 0) {
            fail('Salasanaa ei voitu lukea turvallisesti tältä päätelaitteelta.');
        }
    }
    try {
        $password = fgets(STDIN);
    } finally {
        if ($isTerminal && is_string($terminalState)) {
            tty_command(['stty', trim($terminalState)]);
            fwrite(STDOUT, PHP_EOL);
        }
    }
    if ($password === false) {
        fail('Salasanaa ei saatu luettua.');
    }
    return rtrim($password, "\r\n");
}

function password_hash_value(string $password): string
{
    $characterCount = preg_match_all('/./us', $password);
    if ($characterCount === false || $characterCount < 12 || strlen($password) > 1024) {
        fail('Käytä vähintään 12 merkin salasanaa (enintään 1024 tavua).');
    }
    if (!defined('PASSWORD_ARGON2ID') && strlen($password) > 72) {
        fail('Tämän PHP-asennuksen salasana voi olla enintään 72 tavua.');
    }
    $algorithm = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
    $hash = password_hash($password, $algorithm);
    if ($hash === false) {
        fail('Salasanan tiivisteen luominen epäonnistui.');
    }
    return $hash;
}

if ($argc !== 1) {
    fail('Tämä alustus ei hyväksy argumentteja. Aja komento ilman salasanoja argumenteissa.');
}
if (!function_exists('password_hash') || !function_exists('password_verify')
    || !function_exists('random_bytes') || !function_exists('proc_open')) {
    fail('PHP:stä puuttuu turvalliseen alustukseen tarvittava ominaisuus.');
}

$home = realpath(getenv('HOME') ?: '');
$configuredFile = getenv('PLANNER_DATA_FILE');
$requestedDirectory = $configuredFile !== false && $configuredFile !== ''
    ? dirname($configuredFile)
    : ($home ? $home . DIRECTORY_SEPARATOR . 'planner-data' : '');
$directory = $requestedDirectory !== '' ? realpath($requestedDirectory) : false;
if (!$home || !$directory || !is_dir($directory) || is_link($requestedDirectory)
    || ($configuredFile !== false && $configuredFile !== '' && (!str_starts_with($configuredFile, DIRECTORY_SEPARATOR) || is_link($configuredFile)))
    || ($configuredFile !== false && $configuredFile !== '' && inside_public_root($configuredFile, $home . DIRECTORY_SEPARATOR . 'public_html'))
    || inside_public_root($directory, $home . DIRECTORY_SEPARATOR . 'public_html')) {
    fail('Luo planner-data-kansio kotihakemiston alle ja varmista, ettei se ole public_html-hakemiston sisällä.');
}
if (!is_writable($directory)) {
    fail('planner-data-kansioon ei voi kirjoittaa.');
}
if (!chmod($directory, 0700) || (fileperms($directory) & 0077) !== 0) {
    fail('planner-data-kansion oikeuksiksi ei voitu asettaa 700.');
}

$authPath = $directory . DIRECTORY_SEPARATOR . 'auth.json';
if (file_exists($authPath) || is_link($authPath)) {
    fail('Kirjautuminen on jo alustettu. Alustus ei ylikirjoita olemassa olevia tunnuksia.');
}
$legacyConfig = $directory . DIRECTORY_SEPARATOR . 'config.json';
if (is_link($legacyConfig)) {
    fail('Vanha config.json on symbolinen linkki. Tarkista tiedosto ennen alustusta.');
}
$legacy = null;
if (is_file($legacyConfig)) {
    $legacy = json_decode((string)file_get_contents($legacyConfig));
    if (!is_object($legacy)) {
        fail('Vanha config.json ei ole kelvollinen JSON-objekti. Tarkista se ennen alustusta.');
    }
}

fwrite(STDOUT, 'Luo Writer-salasana (vähintään 12 merkkiä).' . PHP_EOL);
$writerPassword = read_password('Writer-salasana: ');
$writerConfirmation = read_password('Vahvista Writer-salasana: ');
if (!hash_equals($writerPassword, $writerConfirmation)) {
    fail('Writer-salasanat eivät täsmää.');
}
fwrite(STDOUT, 'Luo Admin-salasana (vähintään 12 merkkiä).' . PHP_EOL);
$adminPassword = read_password('Admin-salasana: ');
$adminConfirmation = read_password('Vahvista Admin-salasana: ');
if (!hash_equals($adminPassword, $adminConfirmation)) {
    fail('Admin-salasanat eivät täsmää.');
}

$previousMask = umask(0077);
$lock = fopen($directory . DIRECTORY_SEPARATOR . 'auth-setup.lock', 'x');
umask($previousMask);
if ($lock === false || !flock($lock, LOCK_EX)) {
    fail('Alustuksen lukitseminen epäonnistui tai toinen alustus on käynnissä.');
}
chmod($directory . DIRECTORY_SEPARATOR . 'auth-setup.lock', 0600);
try {
    if (file_exists($authPath) || is_link($authPath)) {
        fail('Kirjautuminen alustettiin jo. Olemassa olevia tunnuksia ei muutettu.');
    }
    $auth = [
        'version' => 1,
        'sessionVersion' => 1,
        'rateLimitKey' => bin2hex(random_bytes(32)),
        'passwords' => [
            'writer' => password_hash_value($writerPassword),
            'admin' => password_hash_value($adminPassword),
        ],
    ];
    $encoded = json_encode($auth, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    umask(0077);
    $temporary = tempnam($directory, '.planner-auth-');
    if ($temporary === false || file_put_contents($temporary, $encoded, LOCK_EX) !== strlen($encoded)) {
        if (is_string($temporary)) {
            unlink($temporary);
        }
        fail('Kirjautumistunnuksia ei voitu alustaa.');
    }
    chmod($temporary, 0600);
    if (!rename($temporary, $authPath)) {
        unlink($temporary);
        fail('Kirjautumistunnuksia ei voitu tallentaa.');
    }
} finally {
    flock($lock, LOCK_UN);
    fclose($lock);
}

$legacyConfig = $directory . DIRECTORY_SEPARATOR . 'config.json';
if (is_object($legacy) && property_exists($legacy, 'writeKey')) {
    unset($legacy->writeKey);
    $encodedLegacy = json_encode($legacy, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $temporaryLegacy = tempnam($directory, '.planner-config-');
    if ($temporaryLegacy !== false && file_put_contents($temporaryLegacy, $encodedLegacy, LOCK_EX) === strlen($encodedLegacy)) {
        chmod($temporaryLegacy, 0600);
        if (!rename($temporaryLegacy, $legacyConfig)) {
            unlink($temporaryLegacy);
            fwrite(STDERR, 'Huomio: vanhan config.json-tiedoston avainta ei voitu poistaa; palvelin ei enää käytä sitä.' . PHP_EOL);
        }
    } elseif (is_string($temporaryLegacy)) {
        unlink($temporaryLegacy);
        fwrite(STDERR, 'Huomio: vanhan config.json-tiedoston avainta ei voitu poistaa; palvelin ei enää käytä sitä.' . PHP_EOL);
    }
}

fwrite(STDOUT, 'Kirjautuminen alustettiin. Salasanat tallennettiin vain palvelinpuolen tiivisteinä.' . PHP_EOL);
fwrite(STDOUT, 'Poista setup-auth.php palvelimelta. Olemassa olevaa suunnitelmaa tai varmuuskopioita ei muutettu.' . PHP_EOL);

function inside_public_root(string $path, string $publicRoot): bool
{
    $resolvedPublicRoot = realpath($publicRoot);
    return $resolvedPublicRoot !== false
        && ($path === $resolvedPublicRoot || str_starts_with($path, $resolvedPublicRoot . DIRECTORY_SEPARATOR));
}

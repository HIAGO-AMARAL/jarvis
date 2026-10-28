<?php
/*
 * Jarvis: assistente pessoal (PWA) em PHP + SQLite.
 * Núcleo: configuração, banco, sessão, login e utilidades da API.
 */

define('RAIZ', dirname(__DIR__));

$arquivoConfig = __DIR__ . '/config.php';
$GLOBALS['cfg'] = require (is_file($arquivoConfig) ? $arquivoConfig : __DIR__ . '/config.example.php');

date_default_timezone_set(cfg('fuso_horario'));
mb_internal_encoding('UTF-8');
error_reporting(E_ALL);
ini_set('display_errors', cfg('debug') ? '1' : '0');
ini_set('log_errors', '1');

if (!is_dir(dirname(cfg('banco')))) {
    @mkdir(dirname(cfg('banco')), 0755, true);
}
ini_set('error_log', dirname(cfg('banco')) . '/php-erros.log');

// Sessões dentro de data/: continuam valendo quando o PC reinicia.
$pastaSessoes = dirname(cfg('banco')) . '/sessoes';
if (!is_dir($pastaSessoes)) {
    @mkdir($pastaSessoes, 0700, true);
}
if (is_dir($pastaSessoes) && is_writable($pastaSessoes)) {
    session_save_path($pastaSessoes);
}

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('JARVISSESS');
session_set_cookie_params(['lifetime' => 60 * 60 * 24 * 60, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
ini_set('session.gc_maxlifetime', (string) (60 * 60 * 24 * 60));
session_start();

require __DIR__ . '/ia.php';
require __DIR__ . '/jogo.php';
require __DIR__ . '/rotas.php';
require __DIR__ . '/sync.php';
require __DIR__ . '/integracoes.php';
require __DIR__ . '/cerebro.php';

function cfg(string $chave)
{
    return $GLOBALS['cfg'][$chave] ?? null;
}

/** Na sincronização, "agora" é o momento em que você fez a ação no celular. */
function hoje(): string
{
    return substr(agora(), 0, 10);
}

function agora(): string
{
    return $GLOBALS['agora_fixa'] ?? date('Y-m-d H:i:s');
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $novo = !is_file(cfg('banco'));
        $pdo = new PDO('sqlite:' . cfg('banco'));
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA foreign_keys = ON');
        criar_tabelas($pdo);
        if ($novo || !ajuste('semeado', '', $pdo)) {
            semear($pdo);
        }
    }
    return $pdo;
}

function criar_tabelas(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS ajustes (chave TEXT PRIMARY KEY, valor TEXT);
        CREATE TABLE IF NOT EXISTS tarefas (
            id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, data TEXT, categoria TEXT NOT NULL DEFAULT 'geral',
            dificuldade INTEGER NOT NULL DEFAULT 2, feita INTEGER NOT NULL DEFAULT 0, feita_em TEXT, criada_em TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS xp (id INTEGER PRIMARY KEY AUTOINCREMENT, pontos INTEGER NOT NULL, motivo TEXT NOT NULL, ref TEXT, criado_em TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS compras (item TEXT PRIMARY KEY, preco INTEGER NOT NULL, criado_em TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS comidas (
            id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, descricao TEXT NOT NULL, itens TEXT,
            kcal REAL NOT NULL DEFAULT 0, proteina REAL NOT NULL DEFAULT 0, carbo REAL NOT NULL DEFAULT 0, gordura REAL NOT NULL DEFAULT 0, criado_em TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS habitos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, ordem INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS habitos_feitos (habito_id INTEGER NOT NULL REFERENCES habitos(id) ON DELETE CASCADE, data TEXT NOT NULL, PRIMARY KEY (habito_id, data));
        CREATE TABLE IF NOT EXISTS pesos (data TEXT PRIMARY KEY, kg REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS treino (dia INTEGER PRIMARY KEY, titulo TEXT NOT NULL, exercicios TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS refeicoes (id INTEGER PRIMARY KEY AUTOINCREMENT, ordem INTEGER NOT NULL, nome TEXT NOT NULL, horario TEXT, descricao TEXT);
        CREATE TABLE IF NOT EXISTS refeicoes_feitas (refeicao_id INTEGER NOT NULL REFERENCES refeicoes(id) ON DELETE CASCADE, data TEXT NOT NULL, PRIMARY KEY (refeicao_id, data));
        CREATE TABLE IF NOT EXISTS estudos (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, detalhe TEXT, status TEXT NOT NULL DEFAULT 'a_fazer', ordem INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS livros (
            id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, autor TEXT, status TEXT NOT NULL DEFAULT 'quero',
            nota INTEGER, resumo TEXT, opiniao_ia TEXT, atualizado_em TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, papel TEXT NOT NULL, texto TEXT NOT NULL, criado_em TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS economia (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, valor REAL NOT NULL, descricao TEXT NOT NULL, categoria TEXT NOT NULL DEFAULT 'outros', data TEXT NOT NULL, criado_em TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS cofrinho (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, valor REAL NOT NULL, descricao TEXT, data TEXT NOT NULL, criado_em TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS metas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, valor REAL NOT NULL, icone TEXT NOT NULL DEFAULT 'presente', concluida INTEGER NOT NULL DEFAULT 0, criado_em TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ifro_eventos (uid TEXT PRIMARY KEY, tarefa_id INTEGER NOT NULL DEFAULT 0, data TEXT);
        CREATE TABLE IF NOT EXISTS versoes (chave TEXT PRIMARY KEY, em TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tentativas_login (ip TEXT NOT NULL, criado_em TEXT NOT NULL);
    ");
}

/** Dados iniciais (o plano de retomada). Tudo pode ser editado no app. */
function semear(PDO $pdo): void
{
    $pdo->beginTransaction();
    $ins = function (string $sql, array $linhas) use ($pdo) {
        $st = $pdo->prepare($sql);
        foreach ($linhas as $l) {
            $st->execute($l);
        }
    };
    $ins('INSERT INTO habitos (nome, ordem) VALUES (?, ?)', [
        ['Treinar', 1], ['Ler 30 minutos', 2], ['Estudar 1 hora', 3], ['Beber 3 L de água', 4], ['Dormir às 23:00', 5],
    ]);
    $ins('INSERT INTO treino (dia, titulo, exercicios) VALUES (?, ?, ?)', [
        [0, 'Descanso', ''],
        [1, 'Superior A', "Supino reto 4×6-8\nRemada curvada 4×8-10\nDesenvolvimento com halteres 3×8-10\nPuxada frente 3×10-12\nRosca direta 3×10-12\nTríceps corda 3×10-12"],
        [2, 'Inferior A', "Agachamento livre 4×6-8\nStiff 3×8-10\nLeg press 3×10-12\nCadeira flexora 3×10-12\nPanturrilha em pé 4×12-15\nAbdominal 3×15\nEsteira inclinada 20 min"],
        [3, 'Descanso', 'Caminhada leve, se quiser'],
        [4, 'Superior B', "Supino inclinado com halteres 4×8-10\nBarra fixa ou puxada 4×6-10\nRemada baixa 3×10-12\nElevação lateral 4×12-15\nRosca martelo 3×10-12\nTríceps francês 3×10-12"],
        [5, 'Inferior B', "Agachamento búlgaro 3×8-10 cada perna\nElevação pélvica 4×8-10\nCadeira extensora 3×12-15\nMesa flexora 3×10-12\nPanturrilha sentado 4×12-15\nPrancha 3×40 s\nEsteira inclinada 20 min"],
        [6, 'Cardio', 'Caminhada de 40 min'],
    ]);
    $ins('INSERT INTO refeicoes (ordem, nome, horario, descricao) VALUES (?, ?, ?, ?)', [
        [1, 'Café da manhã', '06:30', '3 ovos, 2 fatias de pão integral ou 1 tapioca, 1 fruta, café sem açúcar'],
        [2, 'Almoço', '12:00', '150 g de frango ou carne magra, 4 colheres de arroz, 1 concha de feijão, salada, legumes'],
        [3, 'Pré-treino', '18:15', 'Iogurte natural com banana e aveia, ou pão com frango desfiado'],
        [4, 'Jantar', '21:00', '150 g de carne, frango ou peixe, 150 g de batata, macaxeira ou arroz, salada'],
        [5, 'Ceia (opcional)', '22:30', '1 copo de leite, ou 1 dose de whey, ou 2 ovos'],
    ]);
    $ins('INSERT INTO estudos (titulo, detalhe, ordem) VALUES (?, ?, ?)', [
        ['Git e GitHub', 'Curso em Vídeo (Gustavo Guanabara)', 1],
        ['SQL', 'Consultas, JOIN, GROUP BY', 2],
        ['JavaScript', 'Continuar', 3],
        ['React', 'Continuar', 4],
        ['Inglês', '20 minutos por dia', 5],
    ]);
    $ins('INSERT INTO livros (titulo, autor, atualizado_em) VALUES (?, ?, ?)', [
        ['Hábitos Atômicos', 'James Clear', agora()], ['Aprendendo a Aprender', 'Barbara Oakley', agora()],
        ['Pai Rico, Pai Pobre', 'Robert Kiyosaki', agora()], ['A Startup Enxuta', 'Eric Ries', agora()],
        ['Essencialismo', 'Greg McKeown', agora()], ['A Batalha do Apocalipse', 'Eduardo Spohr', agora()],
    ]);
    $pdo->prepare('INSERT OR REPLACE INTO ajustes (chave, valor) VALUES (?, ?)')->execute(['semeado', '1']);
    $pdo->commit();
}

function ajuste(string $chave, string $padrao = '', ?PDO $pdo = null): string
{
    $st = ($pdo ?: db())->prepare('SELECT valor FROM ajustes WHERE chave = ?');
    $st->execute([$chave]);
    $v = $st->fetchColumn();
    return $v === false ? $padrao : (string) $v;
}

function salvar_ajuste(string $chave, string $valor): void
{
    db()->prepare('INSERT OR REPLACE INTO ajustes (chave, valor) VALUES (?, ?)')->execute([$chave, $valor]);
}

// ---------------------------------------------------------------- Login

function instalado(): bool
{
    return ajuste('senha_hash') !== '';
}

function logado(): bool
{
    return !empty($_SESSION['ok']);
}

function csrf(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function bloqueado(): bool
{
    $st = db()->prepare('SELECT COUNT(*) FROM tentativas_login WHERE ip = ? AND criado_em > ?');
    $st->execute([ip(), date('Y-m-d H:i:s', time() - 15 * 60)]);
    return (int) $st->fetchColumn() >= 5;
}

function tentar_login(string $senha): bool
{
    if (bloqueado()) {
        throw new RuntimeException('Muitas tentativas. Espere 15 minutos.');
    }
    if (password_verify($senha, ajuste('senha_hash'))) {
        session_regenerate_id(true);
        $_SESSION['ok'] = 1;
        db()->prepare('DELETE FROM tentativas_login WHERE ip = ?')->execute([ip()]);
        return true;
    }
    db()->prepare('INSERT INTO tentativas_login (ip, criado_em) VALUES (?, ?)')->execute([ip(), agora()]);
    return false;
}

// ---------------------------------------------------------------- API

/** Resposta de uma rota executada dentro da sincronização. */
class RespostaSync extends Exception
{
    public $dados;
    public $status;

    public function __construct($dados, int $status)
    {
        parent::__construct('resposta');
        $this->dados = $dados;
        $this->status = $status;
    }
}

function responder($dados, int $status = 200): void
{
    if (!empty($GLOBALS['em_sync'])) {
        throw new RespostaSync($dados, $status);
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

function erro(string $mensagem, int $status = 400): void
{
    responder(['erro' => $mensagem], $status);
}

function entrada(): array
{
    if (isset($GLOBALS['entrada_fixa'])) {
        return $GLOBALS['entrada_fixa'];
    }
    static $dados = null;
    if ($dados === null) {
        $dados = json_decode((string) file_get_contents('php://input'), true) ?: [];
    }
    return $dados;
}

function texto(string $campo, int $max = 500): string
{
    return mb_substr(trim((string) (entrada()[$campo] ?? '')), 0, $max);
}

/** "1.234,56", "1234.5" ou "R$ 50" → número. */
function dinheiro($v): float
{
    $t = preg_replace('/[^\d,.\-]/', '', (string) $v);
    if (strpos($t, ',') !== false) {
        $t = str_replace(['.', ','], ['', '.'], $t);
    }
    return round((float) $t, 2);
}

function data_valida(?string $d): ?string
{
    return ($d && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && strtotime($d)) ? $d : null;
}

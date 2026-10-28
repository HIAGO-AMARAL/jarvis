<?php
/*
 * API JSON do Jarvis. Rota em ?r=..., corpo em JSON.
 * Toda escrita exige login e o cabeçalho X-CSRF.
 */
require __DIR__ . '/lib/bootstrap.php';

$r = (string) ($_GET['r'] ?? '');
$metodo = $_SERVER['REQUEST_METHOD'];

try {
    // ------------------------------------------------ Sem login
    if ($r === 'estado') {
        responder(['instalado' => instalado(), 'logado' => logado(), 'csrf' => csrf(), 'nome' => cfg('nome')]);
    }
    if ($r === 'instalar' && $metodo === 'POST') {
        if (instalado()) {
            erro('Já está instalado.', 403);
        }
        $senha = (string) (entrada()['senha'] ?? '');
        if (mb_strlen($senha) < 8) {
            erro('Use uma senha com pelo menos 8 caracteres.');
        }
        salvar_ajuste('senha_hash', password_hash($senha, PASSWORD_DEFAULT));
        tentar_login($senha);
        responder(['ok' => true, 'csrf' => csrf()]);
    }
    if ($r === 'entrar' && $metodo === 'POST') {
        if (!tentar_login((string) (entrada()['senha'] ?? ''))) {
            erro('Senha incorreta.', 401);
        }
        responder(['ok' => true, 'csrf' => csrf()]);
    }

    // ------------------------------------------------ Com login
    if (!logado()) {
        erro('Faça login.', 401);
    }
    if ($metodo !== 'GET' && !hash_equals(csrf(), (string) ($_SERVER['HTTP_X_CSRF'] ?? ''))) {
        erro('Sessão expirada. Recarregue a página.', 403);
    }
    try {
        processar_caixa_claude();
    } catch (Throwable $e) {
        error_log('CAIXA CLAUDE: ' . $e->getMessage());
    }
    if ($r === 'sync' && $metodo === 'POST') {
        responder(sincronizar((array) (entrada()['ops'] ?? [])));
    }
    if ($metodo === 'POST' && !versao_aceita($r, entrada(), (string) (entrada()['_em'] ?? ''))) {
        // já existe uma edição mais nova deste item: ignora esta
        responder(['ok' => true, 'ignorado' => true, 'jogo' => jogo_status()]);
    }
    executar_rota($r);
} catch (RuntimeException $e) {
    erro($e->getMessage());
} catch (Throwable $e) {
    error_log('API ' . $r . ': ' . $e->getMessage() . ' em ' . $e->getFile() . ':' . $e->getLine());
    erro('Erro interno. Veja data/php-erros.log.', 500);
}

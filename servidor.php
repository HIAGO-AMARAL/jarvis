<?php
/*
 * Roteador para rodar o Jarvis no PC com o servidor embutido do PHP
 * (php -S 127.0.0.1:8080 servidor.php). Faz o papel do .htaccess:
 * bloqueia o banco, a configuração e os arquivos internos.
 */
$caminho = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');

$bloqueado = preg_match('#^/(data|lib|windows|\.git)(/|$)#i', $caminho)
    || preg_match('#\.(sqlite|md|log|bat|vbs|ps1)$#i', $caminho)
    || preg_match('#/\.#', $caminho)
    || $caminho === '/servidor.php';
if ($bloqueado) {
    http_response_code(403);
    echo 'Acesso negado.';
    return true;
}

header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

if ($caminho === '/' || $caminho === '') {
    require __DIR__ . '/index.php';
    return true;
}
if ($caminho === '/sw.js') {
    // o service worker nunca pode ficar guardado, senão o app não atualiza
    header('Content-Type: text/javascript; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    readfile(__DIR__ . '/sw.js');
    return true;
}
if (str_ends_with($caminho, '.webmanifest') && is_file(__DIR__ . $caminho)) {
    header('Content-Type: application/manifest+json');
    readfile(__DIR__ . $caminho);
    return true;
}
return false; // o PHP entrega o arquivo (ou executa o .php) normalmente

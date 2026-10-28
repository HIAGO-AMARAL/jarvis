<?php
/*
 * Integrações do Jarvis:
 *
 * 1) Caixa do Claude: o Claude (pelo app do Claude ligado ao PC) grava arquivos
 *    JSON em data/claude/. Na próxima vez que o Jarvis abrir, cada arquivo é
 *    aplicado como uma fila de sincronização (mesmas rotas do modo offline) e
 *    vira um aviso na tela. Formato:
 *    {
 *      "ops": [
 *        {"rota": "tarefa_salvar", "corpo": {"titulo": "...", "data": "2026-10-30", "dificuldade": 2, "categoria": "estudo"},
 *         "aviso": "Lembrete criado: ..."}
 *      ]
 *    }
 *    Arquivos processados vão para data/claude/feito/ com o resultado.
 *
 * 2) Calendário do IFRO: link .ics do calendário do Moodle (ou outro). A cada
 *    hora, as atividades novas viram missões com a data de entrega.
 *
 * 3) Avisos: recados que aparecem como notificação na tela Hoje.
 */

function pasta_claude(): string
{
    $p = dirname(cfg('banco')) . '/claude';
    if (!is_dir($p)) {
        @mkdir($p, 0700, true);
    }
    return $p;
}

function avisar(string $texto, string $tipo = 'info'): void
{
    $lista = json_decode(ajuste('avisos', '[]'), true) ?: [];
    $lista[] = ['texto' => mb_substr($texto, 0, 300), 'tipo' => $tipo, 'em' => agora()];
    salvar_ajuste('avisos', json_encode(array_slice($lista, -30), JSON_UNESCAPED_UNICODE));
}

/** Devolve os avisos ainda não vistos e limpa a lista. */
function pegar_avisos(): array
{
    $lista = json_decode(ajuste('avisos', '[]'), true) ?: [];
    if ($lista) {
        salvar_ajuste('avisos', '[]');
    }
    return $lista;
}

function processar_caixa_claude(): void
{
    $pasta = pasta_claude();
    $arquivos = glob($pasta . '/*.json') ?: [];
    sort($arquivos);
    foreach (array_slice($arquivos, 0, 20) as $arq) {
        $trabalho = $arq . '.processando';
        if (!@rename($arq, $trabalho)) {
            continue; // outro pedido já pegou este arquivo
        }
        $dados = json_decode((string) file_get_contents($trabalho), true);
        $ops = [];
        $avisos = [];
        foreach ((array) ($dados['ops'] ?? []) as $i => $op) {
            if (!is_array($op)) {
                continue;
            }
            $fila = 'claude-' . basename($arq, '.json') . '-' . $i;
            $ops[] = ['fila' => $fila, 'rota' => (string) ($op['rota'] ?? ''), 'corpo' => (array) ($op['corpo'] ?? []), 'em' => (string) ($op['em'] ?? date('Y-m-d H:i:s'))];
            $avisos[$fila] = (string) ($op['aviso'] ?? '');
        }
        $res = $ops ? sincronizar($ops) : ['resultados' => [], 'erro' => 'Arquivo sem ações válidas.'];
        foreach ($res['resultados'] as $r) {
            if (!empty($r['ok'])) {
                if ($avisos[$r['fila']] !== '') {
                    avisar($avisos[$r['fila']], 'claude');
                }
            } elseif (!empty($r['erro'])) {
                avisar('O Claude tentou mexer aqui, mas deu erro: ' . $r['erro'], 'erro');
            }
        }
        if (!is_dir($pasta . '/feito')) {
            @mkdir($pasta . '/feito', 0700, true);
        }
        $dados['resultado'] = $res['resultados'];
        $dados['processado_em'] = agora();
        file_put_contents($pasta . '/feito/' . basename($arq), json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        @unlink($trabalho);
    }
}

// ---------------------------------------------------------------- Calendário do IFRO

function ical_data(string $nome, string $valor): ?array
{
    // devolve [data Y-m-d, hora H:i ou null] no fuso do Jarvis
    $params = '';
    if (strpos($nome, ';') !== false) {
        $params = substr($nome, strpos($nome, ';') + 1);
    }
    try {
        if (preg_match('/^\d{8}$/', $valor)) {
            return [substr($valor, 0, 4) . '-' . substr($valor, 4, 2) . '-' . substr($valor, 6, 2), null];
        }
        if (!preg_match('/^\d{8}T\d{4,6}Z?$/', $valor)) {
            return null;
        }
        $fuso = new DateTimeZone(date_default_timezone_get());
        if (substr($valor, -1) === 'Z') {
            $d = new DateTime(substr($valor, 0, -1), new DateTimeZone('UTC'));
        } elseif (preg_match('/TZID=([^;:]+)/', $params, $m)) {
            $d = new DateTime($valor, new DateTimeZone($m[1]));
        } else {
            $d = new DateTime($valor, $fuso);
        }
        $d->setTimezone($fuso);
        return [$d->format('Y-m-d'), $d->format('H:i')];
    } catch (Throwable $e) {
        return null;
    }
}

function ical_texto(string $v): string
{
    return trim(str_replace(['\\n', '\\N', '\\,', '\\;', '\\\\'], [' ', ' ', ',', ';', '\\'], $v));
}

/** Lê os eventos de um texto .ics. */
function ical_eventos(string $ics): array
{
    $ics = preg_replace("/\r?\n[ \t]/", '', $ics);
    $eventos = [];
    foreach (explode('BEGIN:VEVENT', $ics) as $i => $bloco) {
        if ($i === 0) {
            continue;
        }
        $bloco = explode('END:VEVENT', $bloco)[0];
        $ev = [];
        foreach (preg_split("/\r?\n/", $bloco) as $linha) {
            $pos = strpos($linha, ':');
            if ($pos === false) {
                continue;
            }
            $nome = substr($linha, 0, $pos);
            $valor = substr($linha, $pos + 1);
            $chave = strtoupper(explode(';', $nome)[0]);
            if ($chave === 'UID') {
                $ev['uid'] = trim($valor);
            } elseif ($chave === 'SUMMARY') {
                // tira o final padrão do Moodle ("... está marcado(a) para esse prazo", "... vence")
                $ev['titulo'] = trim(preg_replace('/\s+(está marcado\(a\) para esse prazo|está marcad[oa] para esse prazo|vence|deve ser entregue|está para ser entregue|fecha|termina)\.?$/iu', '', ical_texto($valor)));
            } elseif ($chave === 'DTSTART' || ($chave === 'DTEND' && empty($ev['quando']))) {
                $ev['quando'] = ical_data($nome, trim($valor));
            }
        }
        if (!empty($ev['uid']) && !empty($ev['titulo']) && !empty($ev['quando'])) {
            $eventos[] = $ev;
        }
    }
    return $eventos;
}

/** Busca o calendário e cria missões para as atividades novas. Devolve quantas criou. */
function ifro_atualizar(bool $forcar = false): int
{
    $url = ajuste('ifro_ical');
    if ($url === '') {
        return 0;
    }
    $ultima = ajuste('ifro_ultima');
    if (!$forcar && $ultima !== '' && time() - strtotime($ultima) < 3600) {
        return 0;
    }
    salvar_ajuste('ifro_ultima', date('Y-m-d H:i:s'));
    if (!function_exists('curl_init')) {
        throw new RuntimeException('O PHP está sem a extensão curl.');
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3, CURLOPT_TIMEOUT => 15, CURLOPT_USERAGENT => 'Jarvis/4']);
    $ics = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if (!is_string($ics) || $status >= 400 || strpos($ics, 'BEGIN:VCALENDAR') === false) {
        salvar_ajuste('ifro_erro', 'Não consegui ler o calendário (' . ($status ?: 'sem conexão') . '). Confira o link.');
        if ($forcar) {
            throw new RuntimeException(ajuste('ifro_erro'));
        }
        return 0;
    }
    salvar_ajuste('ifro_erro', '');
    $novos = 0;
    $ontem = date('Y-m-d', strtotime('-1 day'));
    foreach (ical_eventos($ics) as $ev) {
        list($data, $hora) = $ev['quando'];
        $st = db()->prepare('SELECT tarefa_id, data FROM ifro_eventos WHERE uid = ?');
        $st->execute([$ev['uid']]);
        $ja = $st->fetch();
        if ($ja) {
            if ($ja['data'] !== $data) {
                // professor mudou o prazo: atualiza a missão se ainda não foi feita
                db()->prepare('UPDATE tarefas SET data = ? WHERE id = ? AND feita = 0')->execute([$data, $ja['tarefa_id']]);
                db()->prepare('UPDATE ifro_eventos SET data = ? WHERE uid = ?')->execute([$data, $ev['uid']]);
                avisar('O prazo de "' . $ev['titulo'] . '" mudou para ' . date('d/m', strtotime($data)) . ($hora ? " às $hora" : '') . '.', 'ifro');
            }
            continue;
        }
        if ($data < $ontem) {
            db()->prepare('INSERT OR IGNORE INTO ifro_eventos (uid, tarefa_id, data) VALUES (?, 0, ?)')->execute([$ev['uid'], $data]);
            continue;
        }
        $titulo = mb_substr('IFRO: ' . $ev['titulo'] . ($hora ? " (até $hora)" : ''), 0, 200);
        db()->prepare('INSERT INTO tarefas (titulo, data, categoria, dificuldade, criada_em) VALUES (?, ?, ?, ?, ?)')->execute([$titulo, $data, 'estudo', 2, agora()]);
        db()->prepare('INSERT INTO ifro_eventos (uid, tarefa_id, data) VALUES (?, ?, ?)')->execute([$ev['uid'], (int) db()->lastInsertId(), $data]);
        avisar('Atividade nova do IFRO: ' . $ev['titulo'] . ' (entrega ' . date('d/m', strtotime($data)) . ($hora ? " às $hora" : '') . ').', 'ifro');
        $novos++;
    }
    return $novos;
}

<?php
/*
 * Sincronização entre o celular (modo offline) e o Jarvis do PC.
 *
 * O celular guarda cada ação numa fila, com o horário em que foi feita (_em).
 * Quando encontra o PC, manda a fila inteira para ?r=sync, que executa as
 * ações em ordem, como se tivessem acontecido naquele horário.
 *
 * Conflito (mesmo item editado no PC e no celular): vale a edição mais
 * recente. Cada item tem um "carimbo" na tabela versoes; uma ação mais
 * antiga que o carimbo é ignorada.
 *
 * Itens criados offline têm id negativo (provisório). O servidor cria o item
 * de verdade e devolve o mapa provisório → definitivo.
 */

/** Ações que podem ser feitas offline (as que usam IA ou a loja precisam do PC). */
const ROTAS_OFFLINE = [
    'tarefa_salvar', 'tarefa_marcar', 'tarefa_excluir',
    'habito_marcar', 'habito_salvar', 'habito_excluir',
    'refeicao_marcar', 'refeicao_salvar', 'refeicao_excluir',
    'treino_salvar', 'peso_salvar', 'peso_excluir',
    'estudo_salvar', 'estudo_excluir', 'livro_salvar', 'livro_excluir',
    'comida_adicionar', 'comida_excluir', 'metas_salvar',
    'economia_salvar', 'economia_excluir', 'cofrinho_salvar', 'cofrinho_excluir', 'meta_salvar', 'meta_excluir',
];

/** Qual item uma ação altera (null = ação que só cria, sem conflito possível). */
function chave_versao(string $r, array $e): ?string
{
    $id = (int) ($e['id'] ?? 0);
    $data = data_valida($e['data'] ?? '') ?: hoje();
    switch ($r) {
        case 'tarefa_salvar':
        case 'tarefa_marcar':
        case 'tarefa_excluir':
            return $id > 0 ? "tarefa:$id" : null;
        case 'habito_marcar':
            return "habito_feito:$id:$data";
        case 'habito_salvar':
        case 'habito_excluir':
            return $id > 0 ? "habito:$id" : null;
        case 'refeicao_marcar':
            return "refeicao_feita:$id:$data";
        case 'refeicao_salvar':
        case 'refeicao_excluir':
            return $id > 0 ? "refeicao:$id" : null;
        case 'treino_salvar':
            return 'treino:' . (int) ($e['dia'] ?? -1);
        case 'peso_salvar':
        case 'peso_excluir':
            return "peso:$data";
        case 'estudo_salvar':
        case 'estudo_excluir':
            return $id > 0 ? "estudo:$id" : null;
        case 'livro_salvar':
        case 'livro_excluir':
            return $id > 0 ? "livro:$id" : null;
        case 'comida_excluir':
            return $id > 0 ? "comida:$id" : null;
        case 'metas_salvar':
            return 'metas';
        case 'economia_salvar':
        case 'economia_excluir':
            return $id > 0 ? "economia:$id" : null;
        case 'cofrinho_salvar':
        case 'cofrinho_excluir':
            return $id > 0 ? "cofrinho:$id" : null;
        case 'meta_salvar':
        case 'meta_excluir':
            return $id > 0 ? "meta:$id" : null;
    }
    return null;
}

/** Normaliza o horário vindo do aparelho; sem horário válido, usa o do PC. */
function horario_valido(string $em): string
{
    return preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/', $em) ? $em : date('Y-m-d H:i:s');
}

/**
 * Confere o carimbo do item. Devolve false se já existe uma edição mais nova
 * (a ação deve ser ignorada). Se aceitar, grava o novo carimbo.
 */
function versao_aceita(string $r, array $e, string $em): bool
{
    $chave = chave_versao($r, $e);
    if ($chave === null) {
        return true;
    }
    $em = horario_valido($em);
    $st = db()->prepare('SELECT em FROM versoes WHERE chave = ?');
    $st->execute([$chave]);
    $atual = $st->fetchColumn();
    if ($atual !== false && strcmp((string) $atual, $em) > 0) {
        return false;
    }
    db()->prepare('INSERT OR REPLACE INTO versoes (chave, em) VALUES (?, ?)')->execute([$chave, $em]);
    return true;
}

/** Executa a fila do celular. */
function sincronizar(array $ops): array
{
    $mapa = [];
    $resultados = [];
    foreach (array_slice($ops, 0, 500) as $op) {
        $r = (string) ($op['rota'] ?? '');
        $corpo = is_array($op['corpo'] ?? null) ? $op['corpo'] : [];
        $em = horario_valido((string) ($op['em'] ?? ''));
        $res = ['fila' => $op['fila'] ?? null];

        if (!in_array($r, ROTAS_OFFLINE, true)) {
            $resultados[] = $res + ['erro' => 'Ação não permitida offline.'];
            continue;
        }

        // id provisório (negativo) → definitivo
        $provisorio = null;
        $id = (int) ($corpo['id'] ?? 0);
        if ($id < 0) {
            if (isset($mapa[$id])) {
                $corpo['id'] = $mapa[$id];
            } elseif (substr($r, -7) === '_salvar' || $r === 'comida_adicionar') {
                $provisorio = $id;
                $corpo['id'] = 0;
            } else {
                $resultados[] = $res + ['ignorado' => true];
                continue;
            }
        }

        $GLOBALS['agora_fixa'] = substr($em, 0, 19);
        $GLOBALS['entrada_fixa'] = $corpo;
        $GLOBALS['em_sync'] = true;
        try {
            if (!versao_aceita($r, $corpo, $em)) {
                $res['ignorado'] = true;
            } else {
                executar_rota($r);
                $res['erro'] = 'Sem resposta.';
            }
        } catch (RespostaSync $resp) {
            $d = is_array($resp->dados) ? $resp->dados : [];
            if (isset($d['erro'])) {
                $res['erro'] = $d['erro'];
            } else {
                $res['ok'] = true;
                if ($provisorio !== null && !empty($d['id'])) {
                    $mapa[$provisorio] = (int) $d['id'];
                }
            }
        } catch (Throwable $t) {
            error_log('SYNC ' . $r . ': ' . $t->getMessage());
            $res['erro'] = $t instanceof RuntimeException ? $t->getMessage() : 'Erro interno.';
        } finally {
            unset($GLOBALS['agora_fixa'], $GLOBALS['entrada_fixa'], $GLOBALS['em_sync']);
        }
        $resultados[] = $res;
    }
    return ['ok' => true, 'resultados' => $resultados, 'mapa' => (object) $mapa, 'jogo' => jogo_status()];
}

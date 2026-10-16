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
    $id = (int) (entrada()['id'] ?? ($_GET['id'] ?? 0));

    switch ($r) {
        case 'sair':
            $_SESSION = [];
            session_destroy();
            responder(['ok' => true]);

        // -------- Painel do dia
        case 'hoje':
            $d = hoje();
            $tarefas = db()->prepare('SELECT * FROM tarefas WHERE data = ? OR (data < ? AND feita = 0) ORDER BY feita, data, dificuldade DESC, id');
            $tarefas->execute([$d, $d]);
            $habitos = db()->prepare('SELECT h.*, (SELECT COUNT(*) FROM habitos_feitos f WHERE f.habito_id = h.id AND f.data = ?) AS feito FROM habitos h WHERE ativo = 1 ORDER BY ordem, id');
            $habitos->execute([$d]);
            $refeicoes = db()->prepare('SELECT r.*, (SELECT COUNT(*) FROM refeicoes_feitas f WHERE f.refeicao_id = r.id AND f.data = ?) AS feita FROM refeicoes r ORDER BY ordem, id');
            $refeicoes->execute([$d]);
            responder([
                'data' => $d,
                'tarefas' => $tarefas->fetchAll(),
                'habitos' => $habitos->fetchAll(),
                'refeicoes' => $refeicoes->fetchAll(),
                'treino' => db()->query('SELECT * FROM treino WHERE dia = ' . (int) date('w'))->fetch() ?: null,
                'lendo' => db()->query("SELECT id, titulo, autor FROM livros WHERE status = 'lendo' ORDER BY atualizado_em DESC")->fetchAll(),
                'jogo' => jogo_status(),
            ]);

        // -------- Missões (tarefas)
        case 'semana':
            $ini = data_valida($_GET['inicio'] ?? '') ?: date('Y-m-d', strtotime('monday this week'));
            $fim = date('Y-m-d', strtotime($ini . ' +6 days'));
            $st = db()->prepare('SELECT * FROM tarefas WHERE data BETWEEN ? AND ? ORDER BY data, feita, dificuldade DESC, id');
            $st->execute([$ini, $fim]);
            $semData = db()->query('SELECT * FROM tarefas WHERE data IS NULL ORDER BY feita, id DESC LIMIT 100')->fetchAll();
            responder(['inicio' => $ini, 'fim' => $fim, 'tarefas' => $st->fetchAll(), 'sem_data' => $semData]);

        case 'tarefa_salvar':
            $titulo = texto('titulo', 200);
            if ($titulo === '') {
                erro('Escreva a missão.');
            }
            $dados = [
                'titulo' => $titulo,
                'data' => data_valida(entrada()['data'] ?? null),
                'categoria' => in_array(entrada()['categoria'] ?? '', ['geral', 'estudo', 'trabalho', 'saude', 'casa'], true) ? entrada()['categoria'] : 'geral',
                'dificuldade' => max(1, min(4, (int) (entrada()['dificuldade'] ?? 2))),
            ];
            if ($id) {
                db()->prepare('UPDATE tarefas SET titulo = ?, data = ?, categoria = ?, dificuldade = ? WHERE id = ?')->execute(array_merge(array_values($dados), [$id]));
            } else {
                db()->prepare('INSERT INTO tarefas (titulo, data, categoria, dificuldade, criada_em) VALUES (?, ?, ?, ?, ?)')->execute(array_merge(array_values($dados), [agora()]));
                $id = (int) db()->lastInsertId();
            }
            responder(['ok' => true, 'id' => $id]);

        case 'tarefa_marcar':
            $t = db()->query('SELECT * FROM tarefas WHERE id = ' . $id)->fetch();
            if (!$t) {
                erro('Missão não encontrada.', 404);
            }
            $feita = !empty(entrada()['feita']);
            db()->prepare('UPDATE tarefas SET feita = ?, feita_em = ? WHERE id = ?')->execute([$feita ? 1 : 0, $feita ? agora() : null, $id]);
            $antes = jogo_status()['nivel'];
            $ganho = $feita
                ? xp_ganhar(XP_DIFICULDADE[(int) $t['dificuldade']] ?? 25, 'Missão: ' . $t['titulo'], 'tarefa:' . $id)
                : xp_perder('tarefa:' . $id);
            $j = jogo_status();
            responder(['ok' => true, 'xp' => $ganho, 'subiu' => $j['nivel'] > $antes, 'jogo' => $j]);

        case 'tarefa_excluir':
            xp_perder('tarefa:' . $id);
            db()->prepare('DELETE FROM tarefas WHERE id = ?')->execute([$id]);
            responder(['ok' => true, 'jogo' => jogo_status()]);

        // -------- Hábitos
        case 'habitos':
            responder(['habitos' => db()->query('SELECT * FROM habitos ORDER BY ordem, id')->fetchAll()]);

        case 'habito_marcar':
            $d = data_valida(entrada()['data'] ?? '') ?: hoje();
            $h = db()->query('SELECT * FROM habitos WHERE id = ' . $id)->fetch();
            if (!$h) {
                erro('Hábito não encontrado.', 404);
            }
            $antes = jogo_status()['nivel'];
            if (!empty(entrada()['feito'])) {
                db()->prepare('INSERT OR IGNORE INTO habitos_feitos (habito_id, data) VALUES (?, ?)')->execute([$id, $d]);
                $ganho = xp_ganhar(XP_HABITO, 'Hábito: ' . $h['nome'], "habito:$id:$d");
            } else {
                db()->prepare('DELETE FROM habitos_feitos WHERE habito_id = ? AND data = ?')->execute([$id, $d]);
                $ganho = xp_perder("habito:$id:$d");
            }
            $ganho += conferir_combo($d);
            $j = jogo_status();
            responder(['ok' => true, 'xp' => $ganho, 'subiu' => $j['nivel'] > $antes, 'jogo' => $j]);

        case 'habito_salvar':
            $nome = texto('nome', 100);
            if ($nome === '') {
                erro('Dê um nome ao hábito.');
            }
            if ($id) {
                db()->prepare('UPDATE habitos SET nome = ?, ativo = ? WHERE id = ?')->execute([$nome, empty(entrada()['inativo']) ? 1 : 0, $id]);
            } else {
                db()->prepare('INSERT INTO habitos (nome, ordem) VALUES (?, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM habitos))')->execute([$nome]);
            }
            responder(['ok' => true]);

        case 'habito_excluir':
            db()->prepare('DELETE FROM habitos WHERE id = ?')->execute([$id]);
            responder(['ok' => true]);

        // -------- Saúde
        case 'saude':
            responder([
                'treino' => db()->query('SELECT * FROM treino ORDER BY dia')->fetchAll(),
                'refeicoes' => db()->query('SELECT * FROM refeicoes ORDER BY ordem, id')->fetchAll(),
                'pesos' => db()->query('SELECT * FROM pesos ORDER BY data DESC LIMIT 120')->fetchAll(),
            ]);

        case 'treino_salvar':
            $dia = (int) (entrada()['dia'] ?? -1);
            if ($dia < 0 || $dia > 6) {
                erro('Dia inválido.');
            }
            db()->prepare('INSERT OR REPLACE INTO treino (dia, titulo, exercicios) VALUES (?, ?, ?)')->execute([$dia, texto('titulo', 80) ?: 'Treino', texto('exercicios', 3000)]);
            responder(['ok' => true]);

        case 'refeicao_marcar':
            $d = hoje();
            $antes = jogo_status()['nivel'];
            if (!empty(entrada()['feita'])) {
                db()->prepare('INSERT OR IGNORE INTO refeicoes_feitas (refeicao_id, data) VALUES (?, ?)')->execute([$id, $d]);
                $ganho = xp_ganhar(XP_REFEICAO, 'Refeição no plano', "refeicao:$id:$d");
            } else {
                db()->prepare('DELETE FROM refeicoes_feitas WHERE refeicao_id = ? AND data = ?')->execute([$id, $d]);
                $ganho = xp_perder("refeicao:$id:$d");
            }
            $j = jogo_status();
            responder(['ok' => true, 'xp' => $ganho, 'subiu' => $j['nivel'] > $antes, 'jogo' => $j]);

        case 'refeicao_salvar':
            $nome = texto('nome', 80);
            if ($nome === '') {
                erro('Dê um nome à refeição.');
            }
            if ($id) {
                db()->prepare('UPDATE refeicoes SET nome = ?, horario = ?, descricao = ? WHERE id = ?')->execute([$nome, texto('horario', 10), texto('descricao', 500), $id]);
            } else {
                db()->prepare('INSERT INTO refeicoes (ordem, nome, horario, descricao) VALUES ((SELECT COALESCE(MAX(ordem), 0) + 1 FROM refeicoes), ?, ?, ?)')->execute([$nome, texto('horario', 10), texto('descricao', 500)]);
            }
            responder(['ok' => true]);

        case 'refeicao_excluir':
            db()->prepare('DELETE FROM refeicoes WHERE id = ?')->execute([$id]);
            responder(['ok' => true]);

        case 'peso_salvar':
            $kg = (float) str_replace(',', '.', (string) (entrada()['kg'] ?? '0'));
            $d = data_valida(entrada()['data'] ?? '') ?: hoje();
            if ($kg < 30 || $kg > 300) {
                erro('Peso inválido.');
            }
            db()->prepare('INSERT OR REPLACE INTO pesos (data, kg) VALUES (?, ?)')->execute([$d, round($kg, 1)]);
            $ganho = xp_ganhar(XP_PESO, 'Pesagem registrada', 'peso:' . $d);
            responder(['ok' => true, 'xp' => $ganho, 'jogo' => jogo_status()]);

        case 'peso_excluir':
            $d = data_valida(entrada()['data'] ?? '');
            db()->prepare('DELETE FROM pesos WHERE data = ?')->execute([$d]);
            xp_perder('peso:' . $d);
            responder(['ok' => true]);

        // -------- Estudos e leituras
        case 'estudos':
            responder([
                'estudos' => db()->query("SELECT * FROM estudos ORDER BY status = 'feito', ordem, id")->fetchAll(),
                'livros' => db()->query("SELECT * FROM livros ORDER BY CASE status WHEN 'lendo' THEN 0 WHEN 'quero' THEN 1 ELSE 2 END, atualizado_em DESC")->fetchAll(),
            ]);

        case 'estudo_salvar':
            $titulo = texto('titulo', 120);
            if ($titulo === '') {
                erro('Escreva o que vai estudar.');
            }
            $status = in_array(entrada()['status'] ?? '', ['a_fazer', 'estudando', 'feito'], true) ? entrada()['status'] : 'a_fazer';
            if ($id) {
                db()->prepare('UPDATE estudos SET titulo = ?, detalhe = ?, status = ? WHERE id = ?')->execute([$titulo, texto('detalhe', 300), $status, $id]);
            } else {
                db()->prepare('INSERT INTO estudos (titulo, detalhe, status, ordem) VALUES (?, ?, ?, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM estudos))')->execute([$titulo, texto('detalhe', 300), $status]);
            }
            responder(['ok' => true]);

        case 'estudo_excluir':
            db()->prepare('DELETE FROM estudos WHERE id = ?')->execute([$id]);
            responder(['ok' => true]);

        case 'livro_salvar':
            $titulo = texto('titulo', 200);
            if ($titulo === '') {
                erro('Informe o título do livro.');
            }
            $status = in_array(entrada()['status'] ?? '', ['quero', 'lendo', 'lido'], true) ? entrada()['status'] : 'quero';
            $nota = (int) (entrada()['nota'] ?? 0);
            $dados = [$titulo, texto('autor', 120), $status, $nota >= 1 && $nota <= 5 ? $nota : null, texto('resumo', 8000), agora()];
            if ($id) {
                db()->prepare('UPDATE livros SET titulo = ?, autor = ?, status = ?, nota = ?, resumo = ?, atualizado_em = ? WHERE id = ?')->execute(array_merge($dados, [$id]));
            } else {
                db()->prepare('INSERT INTO livros (titulo, autor, status, nota, resumo, atualizado_em) VALUES (?, ?, ?, ?, ?, ?)')->execute($dados);
                $id = (int) db()->lastInsertId();
            }
            $ganho = $status === 'lido' ? xp_ganhar(XP_LIVRO_LIDO, 'Livro lido: ' . $titulo, 'livro:' . $id) : xp_perder('livro:' . $id);
            responder(['ok' => true, 'id' => $id, 'xp' => $ganho, 'jogo' => jogo_status()]);

        case 'livro_excluir':
            xp_perder('livro:' . $id);
            db()->prepare('DELETE FROM livros WHERE id = ?')->execute([$id]);
            responder(['ok' => true]);

        case 'livro_opiniao':
            $l = db()->query('SELECT * FROM livros WHERE id = ' . $id)->fetch();
            if (!$l || trim((string) $l['resumo']) === '') {
                erro('Escreva e salve o seu resumo antes de pedir a opinião do Jarvis.');
            }
            $pedido = "Livro: {$l['titulo']}" . ($l['autor'] ? " ({$l['autor']})" : '') . "\nNota que dei: " . ($l['nota'] ?: 'sem nota') . "/5\n\nMeu resumo:\n{$l['resumo']}\n\n"
                . 'Avalie meu resumo como um colega que conhece o livro: o que eu entendi bem, o que ficou faltando ou está impreciso, '
                . 'e 2 perguntas para eu pensar. No fim, sugira uma ação prática para aplicar na minha vida. Seja breve (até 200 palavras).';
            $resposta = ia_gerar(ia_instrucao_jarvis(), [['papel' => 'user', 'texto' => $pedido]], 0.6);
            db()->prepare('UPDATE livros SET opiniao_ia = ? WHERE id = ?')->execute([$resposta, $id]);
            responder(['ok' => true, 'opiniao' => $resposta]);

        // -------- Chat com o Jarvis
        case 'chat':
            responder(['mensagens' => array_reverse(db()->query('SELECT * FROM chat ORDER BY id DESC LIMIT 60')->fetchAll()), 'configurado' => ia_configurada()]);

        case 'chat_enviar':
            $msg = texto('texto', 4000);
            if ($msg === '') {
                erro('Escreva uma mensagem.');
            }
            $historico = array_reverse(db()->query('SELECT papel, texto FROM chat ORDER BY id DESC LIMIT 20')->fetchAll());
            $historico[] = ['papel' => 'user', 'texto' => $msg];
            $resposta = ia_gerar(ia_instrucao_jarvis(), $historico);
            $ins = db()->prepare('INSERT INTO chat (papel, texto, criado_em) VALUES (?, ?, ?)');
            $ins->execute(['user', $msg, agora()]);
            $ins->execute(['model', $resposta, agora()]);
            responder(['ok' => true, 'resposta' => $resposta]);

        case 'chat_limpar':
            db()->exec('DELETE FROM chat');
            responder(['ok' => true]);

        // -------- Jogo e loja
        case 'jogo':
            $itens = [];
            foreach (loja_itens() as $chave => list($tipo, $nome, $preco, $desc)) {
                $itens[] = ['id' => $chave, 'tipo' => $tipo, 'nome' => $nome, 'preco' => $preco, 'descricao' => $desc, 'possui' => possui($chave)];
            }
            $historico = db()->query('SELECT pontos, motivo, criado_em FROM xp ORDER BY id DESC LIMIT 30')->fetchAll();
            responder(['jogo' => jogo_status(), 'itens' => $itens, 'historico' => $historico, 'tem_pet_proprio' => (bool) glob(dirname(cfg('banco')) . '/pet.*')]);

        case 'comprar':
            comprar(texto('item', 40));
            responder(['ok' => true, 'jogo' => jogo_status()]);

        case 'equipar':
            equipar(texto('item', 40), !isset(entrada()['ligar']) || !empty(entrada()['ligar']));
            responder(['ok' => true, 'jogo' => jogo_status()]);

        case 'pet_enviar':
            $f = $_FILES['imagem'] ?? null;
            if (!$f || $f['error'] !== UPLOAD_ERR_OK) {
                erro('Escolha uma imagem.');
            }
            if ($f['size'] > 3 * 1024 * 1024) {
                erro('Use uma imagem de até 3 MB.');
            }
            $info = @getimagesize($f['tmp_name']);
            $ext = [IMAGETYPE_PNG => 'png', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp', IMAGETYPE_JPEG => 'jpg'][$info[2] ?? 0] ?? '';
            if ($ext === '') {
                erro('Envie PNG, GIF, WEBP ou JPG.');
            }
            foreach (glob(dirname(cfg('banco')) . '/pet.*') ?: [] as $velho) {
                @unlink($velho);
            }
            move_uploaded_file($f['tmp_name'], dirname(cfg('banco')) . '/pet.' . $ext);
            responder(['ok' => true]);

        case 'pet_imagem':
            $arq = (glob(dirname(cfg('banco')) . '/pet.*') ?: [])[0] ?? '';
            if (!$arq) {
                http_response_code(404);
                exit;
            }
            $mime = ['png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp', 'jpg' => 'image/jpeg'][pathinfo($arq, PATHINFO_EXTENSION)] ?? 'application/octet-stream';
            header('Content-Type: ' . $mime);
            header('Cache-Control: private, max-age=86400');
            readfile($arq);
            exit;

        // -------- Ajustes
        case 'ajustes':
            responder([
                'gemini_configurado' => ia_configurada(),
                'gemini_modelo' => ia_modelo(),
                'spotify_client_id' => ajuste('spotify_client_id'),
            ]);

        case 'ajustes_salvar':
            $e = entrada();
            if (isset($e['gemini_chave']) && trim((string) $e['gemini_chave']) !== '') {
                salvar_ajuste('gemini_chave', trim((string) $e['gemini_chave']));
            }
            if (!empty($e['gemini_remover'])) {
                salvar_ajuste('gemini_chave', '');
            }
            if (isset($e['gemini_modelo']) && preg_match('/^[a-z0-9.\-]+$/i', (string) $e['gemini_modelo'])) {
                salvar_ajuste('gemini_modelo', (string) $e['gemini_modelo']);
            }
            if (isset($e['spotify_client_id'])) {
                salvar_ajuste('spotify_client_id', preg_replace('/[^a-z0-9]/i', '', (string) $e['spotify_client_id']));
            }
            if (!empty($e['senha_nova'])) {
                if (!password_verify((string) ($e['senha_atual'] ?? ''), ajuste('senha_hash'))) {
                    erro('Senha atual incorreta.');
                }
                if (mb_strlen((string) $e['senha_nova']) < 8) {
                    erro('A nova senha precisa de pelo menos 8 caracteres.');
                }
                salvar_ajuste('senha_hash', password_hash((string) $e['senha_nova'], PASSWORD_DEFAULT));
            }
            responder(['ok' => true]);

        case 'ia_testar':
            responder(['resposta' => ia_gerar('Responda em uma frase curta, em português.', [['papel' => 'user', 'texto' => 'Diga oi para o Hiago como o Jarvis.']])]);
    }
    erro('Rota desconhecida.', 404);
} catch (RuntimeException $e) {
    erro($e->getMessage());
} catch (Throwable $e) {
    error_log('API ' . $r . ': ' . $e->getMessage() . ' em ' . $e->getFile() . ':' . $e->getLine());
    erro('Erro interno. Veja data/php-erros.log.', 500);
}

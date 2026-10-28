<?php
/*
 * Todas as rotas que exigem login. Chamada pela API (um pedido por vez)
 * e pela sincronização (vários pedidos guardados no celular, em ordem).
 */

function executar_rota(string $r): void
{
        $id = (int) (entrada()['id'] ?? ($_GET['id'] ?? 0));

        switch ($r) {
            case 'sair':
                $_SESSION = [];
                session_destroy();
                responder(['ok' => true]);

            // -------- Painel do dia
            case 'hoje':
                try {
                    ifro_atualizar();
                } catch (Throwable $e) {
                    error_log('IFRO: ' . $e->getMessage());
                }
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
                    'avisos' => pegar_avisos(),
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
                    $id = (int) db()->lastInsertId();
                }
                responder(['ok' => true, 'id' => $id]);

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
                $d = data_valida(entrada()['data'] ?? '') ?: hoje();
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
                    $id = (int) db()->lastInsertId();
                }
                responder(['ok' => true, 'id' => $id]);

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
                    $id = (int) db()->lastInsertId();
                }
                responder(['ok' => true, 'id' => $id]);

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
                responder(['jogo' => jogo_status(), 'itens' => $itens, 'historico' => $historico, 'pets_proprios' => pets_proprios()]);

            case 'comprar':
                comprar(texto('item', 40));
                responder(['ok' => true, 'jogo' => jogo_status()]);

            case 'equipar':
                equipar(texto('item', 40), !isset(entrada()['ligar']) || !empty(entrada()['ligar']));
                responder(['ok' => true, 'jogo' => jogo_status()]);

            case 'pet_enviar':
                if (!possui('pet-proprio')) {
                    erro('Compre "Meus mascotes" na loja primeiro.');
                }
                $f = $_FILES['imagem'] ?? null;
                if (!$f || $f['error'] !== UPLOAD_ERR_OK) {
                    erro('Escolha uma imagem.');
                }
                if ($f['size'] > 3 * 1024 * 1024) {
                    erro('Use uma imagem de até 3 MB.');
                }
                if (count(pets_proprios()) >= 30) {
                    erro('Limite de 30 mascotes. Apague algum antes.');
                }
                $info = @getimagesize($f['tmp_name']);
                $ext = [IMAGETYPE_PNG => 'png', IMAGETYPE_GIF => 'gif', IMAGETYPE_WEBP => 'webp', IMAGETYPE_JPEG => 'jpg'][$info[2] ?? 0] ?? '';
                if ($ext === '') {
                    erro('Envie PNG, GIF, WEBP ou JPG.');
                }
                $nome = 'pet_' . bin2hex(random_bytes(5)) . '.' . $ext;
                move_uploaded_file($f['tmp_name'], pasta_pets() . '/' . $nome);
                equipar('proprio:' . $nome);
                responder(['ok' => true, 'arquivo' => $nome, 'jogo' => jogo_status()]);

            case 'pet_apagar':
                $nome = basename(texto('arquivo', 80));
                if ($nome && is_file(pasta_pets() . '/' . $nome)) {
                    equipar('proprio:' . $nome, false);
                    @unlink(pasta_pets() . '/' . $nome);
                }
                responder(['ok' => true, 'jogo' => jogo_status()]);

            case 'pet_imagem':
                $arq = pasta_pets() . '/' . basename((string) ($_GET['a'] ?? ''));
                if (!is_file($arq)) {
                    $velho = (glob(dirname(cfg('banco')) . '/pet.*') ?: [])[0] ?? '';
                    if (!$velho) {
                        http_response_code(404);
                        exit;
                    }
                    $arq = $velho;
                }
                $mime = ['png' => 'image/png', 'gif' => 'image/gif', 'webp' => 'image/webp', 'jpg' => 'image/jpeg'][pathinfo($arq, PATHINFO_EXTENSION)] ?? 'application/octet-stream';
                header('Content-Type: ' . $mime);
                header('Cache-Control: private, max-age=604800');
                readfile($arq);
                exit;

            // -------- Diário de comida (estimativa pela IA)
            case 'comidas':
                $ini = data_valida($_GET['inicio'] ?? '') ?: date('Y-m-d', strtotime('monday this week'));
                $fim = date('Y-m-d', strtotime($ini . ' +6 days'));
                $st = db()->prepare('SELECT * FROM comidas WHERE data BETWEEN ? AND ? ORDER BY data, id');
                $st->execute([$ini, $fim]);
                responder([
                    'inicio' => $ini, 'fim' => $fim, 'comidas' => $st->fetchAll(),
                    'meta_kcal' => (int) ajuste('meta_kcal', '2200'), 'meta_proteina' => (int) ajuste('meta_proteina', '160'),
                    'balanco' => json_decode(ajuste('balanco:' . $ini, 'null'), true),
                ]);

            case 'comida_adicionar':
                $desc = texto('descricao', 600);
                if ($desc === '') {
                    erro('Escreva o que você comeu.');
                }
                $d = data_valida(entrada()['data'] ?? '') ?: hoje();
                $pedido = "Estime a nutrição desta refeição, em porções típicas brasileiras quando a quantidade não for dita: \"$desc\".\n"
                    . 'Responda só JSON: {"itens":[{"nome":"...","quantidade":"...","kcal":0,"proteina":0,"carbo":0,"gordura":0}],'
                    . '"total":{"kcal":0,"proteina":0,"carbo":0,"gordura":0}}. Números em kcal e gramas, sem texto fora do JSON.';
                try {
                    $bruto = ia_gerar('Você é um assistente de nutrição que estima calorias e macronutrientes de forma realista. Responda apenas JSON válido.', [['papel' => 'user', 'texto' => $pedido]], 0.2, true);
                } catch (RuntimeException $falhaIa) {
                    // veio da fila do celular: guarda a refeição mesmo sem a estimativa, para não perder o registro
                    if (empty($GLOBALS['em_sync'])) {
                        throw $falhaIa;
                    }
                    $bruto = '{"itens":[],"total":{"kcal":0,"proteina":0,"carbo":0,"gordura":0}}';
                }
                $j = json_decode(trim(preg_replace('/^```(json)?|```$/m', '', $bruto)), true);
                if (!is_array($j) || !isset($j['total'])) {
                    erro('Não entendi a resposta da IA. Tente descrever de outro jeito.');
                }
                $t = $j['total'];
                db()->prepare('INSERT INTO comidas (data, descricao, itens, kcal, proteina, carbo, gordura, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
                    ->execute([$d, $desc, json_encode($j['itens'] ?? [], JSON_UNESCAPED_UNICODE), (float) ($t['kcal'] ?? 0), (float) ($t['proteina'] ?? 0), (float) ($t['carbo'] ?? 0), (float) ($t['gordura'] ?? 0), agora()]);
                $id = (int) db()->lastInsertId();
                $ganho = xp_ganhar(2, 'Registrou o que comeu', 'comida:' . $id);
                responder(['ok' => true, 'id' => $id, 'xp' => $ganho, 'jogo' => jogo_status()]);

            case 'comida_excluir':
                xp_perder('comida:' . $id);
                db()->prepare('DELETE FROM comidas WHERE id = ?')->execute([$id]);
                responder(['ok' => true]);

            case 'metas_salvar':
                salvar_ajuste('meta_kcal', (string) max(1000, min(6000, (int) (entrada()['kcal'] ?? 2200))));
                salvar_ajuste('meta_proteina', (string) max(30, min(400, (int) (entrada()['proteina'] ?? 160))));
                responder(['ok' => true]);

            case 'comida_balanco':
                $ini = data_valida(entrada()['inicio'] ?? '') ?: date('Y-m-d', strtotime('monday this week'));
                $fim = date('Y-m-d', strtotime($ini . ' +6 days'));
                $st = db()->prepare('SELECT data, descricao, kcal, proteina, carbo, gordura FROM comidas WHERE data BETWEEN ? AND ? ORDER BY data, id');
                $st->execute([$ini, $fim]);
                $linhas = $st->fetchAll();
                if (!$linhas) {
                    erro('Registre o que você comeu antes de pedir o balanço.');
                }
                $txt = '';
                foreach ($linhas as $l) {
                    $txt .= date('d/m', strtotime($l['data'])) . ': ' . $l['descricao'] . ' (~' . round($l['kcal']) . ' kcal, ' . round($l['proteina']) . " g prot.)\n";
                }
                $pedido = 'Metas diárias: ' . ajuste('meta_kcal', '2200') . ' kcal e ' . ajuste('meta_proteina', '160') . " g de proteína (objetivo: emagrecer mantendo massa).\nO que comi nesta semana:\n$txt\n"
                    . 'Faça um balanço curto (até 180 palavras): média de calorias e proteína nos dias registrados, se está saudável e equilibrado, '
                    . 'o que está bom, 3 ajustes práticos para a próxima semana. Lembre que são estimativas e que não substitui nutricionista. Não use markdown com #.';
                $resposta = ia_gerar(ia_instrucao_jarvis(), [['papel' => 'user', 'texto' => $pedido]], 0.5);
                salvar_ajuste('balanco:' . $ini, json_encode(['texto' => $resposta, 'em' => agora()], JSON_UNESCAPED_UNICODE));
                responder(['ok' => true, 'texto' => $resposta]);

            // -------- Jardim (cada semana é uma árvore; cada dia bem cumprido aduba)
            case 'jardim':
                $porDia = [];
                foreach (db()->query("SELECT substr(criado_em, 1, 10) AS dia, SUM(pontos) AS xp FROM xp GROUP BY dia") as $l) {
                    $porDia[$l['dia']] = (int) $l['xp'];
                }
                $meta = (int) ajuste('jardim_meta', '40');
                $primeiro = db()->query('SELECT MIN(criado_em) FROM xp')->fetchColumn() ?: agora();
                $semana = strtotime('monday this week', strtotime(substr($primeiro, 0, 10)));
                $fimSemana = strtotime('monday this week');
                $arvores = [];
                while ($semana <= $fimSemana) {
                    $dias = [];
                    for ($i = 0; $i < 7; $i++) {
                        $dia = date('Y-m-d', strtotime("+$i days", $semana));
                        $dias[] = ['data' => $dia, 'xp' => $porDia[$dia] ?? 0, 'regado' => ($porDia[$dia] ?? 0) >= $meta, 'futuro' => $dia > hoje()];
                    }
                    $arvores[] = ['inicio' => date('Y-m-d', $semana), 'semana' => (int) date('W', $semana), 'regados' => count(array_filter($dias, function ($d) { return $d['regado']; })), 'dias' => $dias];
                    $semana = strtotime('+7 days', $semana);
                }
                responder(['arvores' => $arvores, 'meta' => $meta]);

            // -------- Ajustes
            case 'ajustes':
                responder([
                    'gemini_configurado' => ia_configurada(),
                    'gemini_modelo' => ia_modelo(),
                    'spotify_client_id' => ajuste('spotify_client_id'),
                    'ifro_ical' => ajuste('ifro_ical'),
                    'ifro_ultima' => ajuste('ifro_ultima'),
                    'ifro_erro' => ajuste('ifro_erro'),
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
                if (isset($e['ifro_ical'])) {
                    $u = trim(str_replace('webcal://', 'https://', (string) $e['ifro_ical']));
                    if ($u !== '' && !preg_match('#^https://[^\s]+$#i', $u)) {
                        erro('Cole o link completo do calendário (começa com https:// ou webcal://).');
                    }
                    salvar_ajuste('ifro_ical', $u);
                    salvar_ajuste('ifro_ultima', '');
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

            // -------- Cérebro (mapa do Obsidian)
            case 'mapa':
                responder(cerebro_mapa());

            // -------- Economia
            case 'economia':
                $mes = preg_match('/^\d{4}-\d{2}$/', (string) ($_GET['mes'] ?? '')) ? $_GET['mes'] : date('Y-m');
                $st = db()->prepare("SELECT * FROM economia WHERE substr(data, 1, 7) = ? ORDER BY data DESC, id DESC");
                $st->execute([$mes]);
                $lanc = $st->fetchAll();
                $ent = 0.0;
                $sai = 0.0;
                $cats = [];
                foreach ($lanc as $l) {
                    if ($l['tipo'] === 'entrada') {
                        $ent += $l['valor'];
                    } else {
                        $sai += $l['valor'];
                        $cats[$l['categoria']] = ($cats[$l['categoria']] ?? 0) + $l['valor'];
                    }
                }
                arsort($cats);
                $meses = [];
                for ($i = 5; $i >= 0; $i--) {
                    $m = date('Y-m', strtotime("$mes-01 -$i months"));
                    $q = db()->prepare("SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor END), 0) AS e, COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor END), 0) AS s FROM economia WHERE substr(data, 1, 7) = ?");
                    $q->execute([$m]);
                    $meses[] = ['mes' => $m] + $q->fetch();
                }
                $st = db()->prepare('SELECT c.*, p.pago_em FROM contas c LEFT JOIN contas_pagas p ON p.conta_id = c.id AND p.mes = ? WHERE c.ativa = 1 ORDER BY c.dia, c.nome');
                $st->execute([$mes]);
                $contas = $st->fetchAll();
                $cofre = (float) db()->query("SELECT COALESCE(SUM(CASE WHEN tipo = 'guardar' THEN valor ELSE -valor END), 0) FROM cofrinho")->fetchColumn();
                responder([
                    'mes' => $mes, 'lancamentos' => $lanc, 'entradas' => round($ent, 2), 'saidas' => round($sai, 2), 'categorias' => $cats, 'meses' => $meses,
                    'cofrinho' => round($cofre, 2), 'movimentos' => db()->query('SELECT * FROM cofrinho ORDER BY data DESC, id DESC LIMIT 30')->fetchAll(),
                    'metas' => db()->query('SELECT * FROM metas ORDER BY concluida, valor')->fetchAll(),
                    'contas' => $contas,
                ]);

            case 'conta_salvar':
                $nome = texto('nome', 80);
                $valor = dinheiro(entrada()['valor'] ?? 0);
                if ($nome === '' || $valor <= 0) {
                    erro('Dê um nome e um valor para a conta.');
                }
                $dia = max(1, min(31, (int) (entrada()['dia'] ?? 10)));
                $cat = preg_replace('/[^a-z_]/', '', (string) (entrada()['categoria'] ?? 'contas')) ?: 'contas';
                if ($id > 0) {
                    db()->prepare('UPDATE contas SET nome = ?, valor = ?, dia = ?, categoria = ? WHERE id = ?')->execute([$nome, $valor, $dia, $cat, $id]);
                } else {
                    db()->prepare('INSERT INTO contas (nome, valor, dia, categoria, criado_em) VALUES (?, ?, ?, ?, ?)')->execute([$nome, $valor, $dia, $cat, agora()]);
                    $id = (int) db()->lastInsertId();
                }
                responder(['ok' => true, 'id' => $id]);

            case 'conta_excluir':
                // some das próximas listas; o que já foi pago continua no extrato
                db()->prepare('UPDATE contas SET ativa = 0 WHERE id = ?')->execute([$id]);
                responder(['ok' => true]);

            case 'conta_pagar':
                $c = db()->query('SELECT * FROM contas WHERE id = ' . $id)->fetch();
                $mes = preg_match('/^\d{4}-\d{2}$/', (string) (entrada()['mes'] ?? '')) ? entrada()['mes'] : substr(hoje(), 0, 7);
                if (!$c) {
                    erro('Conta não encontrada.', 404);
                }
                $st = db()->prepare('SELECT * FROM contas_pagas WHERE conta_id = ? AND mes = ?');
                $st->execute([$id, $mes]);
                $paga = $st->fetch();
                if (!empty(entrada()['paga'])) {
                    if (!$paga) {
                        $ult = (int) date('t', strtotime($mes . '-01'));
                        $d = substr(hoje(), 0, 7) === $mes ? hoje() : $mes . '-' . str_pad((string) min($c['dia'], $ult), 2, '0', STR_PAD_LEFT);
                        db()->prepare('INSERT INTO economia (tipo, valor, descricao, categoria, data, criado_em) VALUES (?, ?, ?, ?, ?, ?)')->execute(['saida', $c['valor'], $c['nome'] . ' (conta do mês)', $c['categoria'], $d, agora()]);
                        db()->prepare('INSERT INTO contas_pagas (conta_id, mes, lancamento_id, pago_em) VALUES (?, ?, ?, ?)')->execute([$id, $mes, (int) db()->lastInsertId(), agora()]);
                    }
                } elseif ($paga) {
                    db()->prepare('DELETE FROM economia WHERE id = ?')->execute([(int) $paga['lancamento_id']]);
                    db()->prepare('DELETE FROM contas_pagas WHERE conta_id = ? AND mes = ?')->execute([$id, $mes]);
                }
                responder(['ok' => true]);

            case 'economia_salvar':
                $valor = dinheiro(entrada()['valor'] ?? 0);
                $desc = texto('descricao', 120);
                if ($valor <= 0) {
                    erro('Coloque um valor maior que zero.');
                }
                if ($desc === '') {
                    erro('Escreva o motivo.');
                }
                $tipo = (entrada()['tipo'] ?? '') === 'entrada' ? 'entrada' : 'saida';
                $cat = preg_replace('/[^a-z_]/', '', (string) (entrada()['categoria'] ?? 'outros')) ?: 'outros';
                $d = data_valida(entrada()['data'] ?? '') ?: hoje();
                if ($id > 0) {
                    db()->prepare('UPDATE economia SET tipo = ?, valor = ?, descricao = ?, categoria = ?, data = ? WHERE id = ?')->execute([$tipo, $valor, $desc, $cat, $d, $id]);
                } else {
                    db()->prepare('INSERT INTO economia (tipo, valor, descricao, categoria, data, criado_em) VALUES (?, ?, ?, ?, ?, ?)')->execute([$tipo, $valor, $desc, $cat, $d, agora()]);
                    $id = (int) db()->lastInsertId();
                }
                responder(['ok' => true, 'id' => $id]);

            case 'economia_excluir':
                db()->prepare('DELETE FROM economia WHERE id = ?')->execute([$id]);
                responder(['ok' => true]);

            case 'cofrinho_salvar':
                $valor = dinheiro(entrada()['valor'] ?? 0);
                if ($valor <= 0) {
                    erro('Coloque um valor maior que zero.');
                }
                $tipo = (entrada()['tipo'] ?? '') === 'retirar' ? 'retirar' : 'guardar';
                $d = data_valida(entrada()['data'] ?? '') ?: hoje();
                if ($id > 0) {
                    db()->prepare('UPDATE cofrinho SET tipo = ?, valor = ?, descricao = ?, data = ? WHERE id = ?')->execute([$tipo, $valor, texto('descricao', 120), $d, $id]);
                    responder(['ok' => true, 'id' => $id]);
                }
                db()->prepare('INSERT INTO cofrinho (tipo, valor, descricao, data, criado_em) VALUES (?, ?, ?, ?, ?)')->execute([$tipo, $valor, texto('descricao', 120), $d, agora()]);
                $id = (int) db()->lastInsertId();
                $antes = jogo_status()['nivel'];
                $ganho = $tipo === 'guardar' ? xp_ganhar(10, 'Guardou dinheiro no porquinho', 'cofrinho:' . $d) : 0;
                $j = jogo_status();
                responder(['ok' => true, 'id' => $id, 'xp' => $ganho, 'subiu' => $j['nivel'] > $antes, 'jogo' => $j]);

            case 'cofrinho_excluir':
                db()->prepare('DELETE FROM cofrinho WHERE id = ?')->execute([$id]);
                responder(['ok' => true]);

            case 'meta_salvar':
                $nome = texto('nome', 80);
                $valor = dinheiro(entrada()['valor'] ?? 0);
                if ($nome === '' || $valor <= 0) {
                    erro('Dê um nome e um valor para a meta.');
                }
                $icone = preg_replace('/[^a-z]/', '', (string) (entrada()['icone'] ?? 'presente')) ?: 'presente';
                $feita = !empty(entrada()['concluida']) ? 1 : 0;
                if ($id > 0) {
                    db()->prepare('UPDATE metas SET nome = ?, valor = ?, icone = ?, concluida = ? WHERE id = ?')->execute([$nome, $valor, $icone, $feita, $id]);
                } else {
                    db()->prepare('INSERT INTO metas (nome, valor, icone, concluida, criado_em) VALUES (?, ?, ?, ?, ?)')->execute([$nome, $valor, $icone, $feita, agora()]);
                    $id = (int) db()->lastInsertId();
                }
                responder(['ok' => true, 'id' => $id]);

            case 'meta_excluir':
                db()->prepare('DELETE FROM metas WHERE id = ?')->execute([$id]);
                responder(['ok' => true]);

            case 'ifro_atualizar':
                $n = ifro_atualizar(true);
                responder(['ok' => true, 'novos' => $n, 'avisos' => pegar_avisos()]);

            case 'ia_testar':
                responder(['resposta' => ia_gerar('Responda em uma frase curta, em português.', [['papel' => 'user', 'texto' => 'Diga oi para o Hiago como o Jarvis.']])]);
        }
        erro('Rota desconhecida.', 404);
}

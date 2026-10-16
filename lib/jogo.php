<?php
/*
 * Gamificação: XP, nível, moedas, sequência de dias e loja de personalizações.
 * Todo XP fica registrado na tabela xp com uma referência (ref), assim desmarcar
 * uma missão tira exatamente o XP que ela deu.
 */

const XP_DIFICULDADE = [1 => 10, 2 => 25, 3 => 50, 4 => 100];
const XP_HABITO = 5;
const XP_COMBO = 20;
const XP_REFEICAO = 2;
const XP_LIVRO_LIDO = 100;
const XP_PESO = 5;

function xp_ganhar(int $pontos, string $motivo, string $ref): int
{
    $st = db()->prepare('SELECT COUNT(*) FROM xp WHERE ref = ?');
    $st->execute([$ref]);
    if ((int) $st->fetchColumn() > 0) {
        return 0;
    }
    db()->prepare('INSERT INTO xp (pontos, motivo, ref, criado_em) VALUES (?, ?, ?, ?)')->execute([$pontos, $motivo, $ref, agora()]);
    return $pontos;
}

function xp_perder(string $ref): int
{
    $st = db()->prepare('SELECT COALESCE(SUM(pontos), 0) FROM xp WHERE ref = ?');
    $st->execute([$ref]);
    $p = (int) $st->fetchColumn();
    db()->prepare('DELETE FROM xp WHERE ref = ?')->execute([$ref]);
    return -$p;
}

/** XP total necessário para chegar ao nível n (nível 1 = 0 XP; cada nível pede 100 XP a mais que o anterior). */
function xp_do_nivel(int $n): int
{
    return 50 * ($n - 1) * $n;
}

function jogo_status(): array
{
    $xp = (int) db()->query('SELECT COALESCE(SUM(pontos), 0) FROM xp')->fetchColumn();
    $gasto = (int) db()->query('SELECT COALESCE(SUM(preco), 0) FROM compras')->fetchColumn();
    $nivel = 1;
    while (xp_do_nivel($nivel + 1) <= $xp) {
        $nivel++;
    }
    $ini = xp_do_nivel($nivel);
    $fim = xp_do_nivel($nivel + 1);
    return [
        'xp' => $xp,
        'nivel' => $nivel,
        'xp_nivel' => $xp - $ini,
        'xp_proximo' => $fim - $ini,
        'moedas' => $xp - $gasto,
        'sequencia' => sequencia(),
        'hoje_xp' => (int) db()->query("SELECT COALESCE(SUM(pontos), 0) FROM xp WHERE criado_em >= '" . hoje() . "'")->fetchColumn(),
        'equipado' => equipado(),
        'compras' => array_column(db()->query('SELECT item FROM compras')->fetchAll(), 'item'),
    ];
}

/** Dias seguidos (até hoje ou ontem) com pelo menos um hábito feito. */
function sequencia(): int
{
    $dias = array_flip(array_column(db()->query('SELECT DISTINCT data FROM habitos_feitos')->fetchAll(), 'data'));
    $d = isset($dias[hoje()]) ? strtotime(hoje()) : strtotime('-1 day');
    $n = 0;
    while (isset($dias[date('Y-m-d', $d)])) {
        $n++;
        $d = strtotime('-1 day', $d);
    }
    return $n;
}

/** Combo: todos os hábitos ativos do dia feitos dá bônus. */
function conferir_combo(string $data): int
{
    $total = (int) db()->query('SELECT COUNT(*) FROM habitos WHERE ativo = 1')->fetchColumn();
    $st = db()->prepare('SELECT COUNT(*) FROM habitos_feitos f JOIN habitos h ON h.id = f.habito_id WHERE h.ativo = 1 AND f.data = ?');
    $st->execute([$data]);
    $feitos = (int) $st->fetchColumn();
    if ($total > 0 && $feitos >= $total) {
        return xp_ganhar(XP_COMBO, 'Combo: todos os hábitos do dia', 'combo:' . $data);
    }
    return xp_perder('combo:' . $data);
}

// ---------------------------------------------------------------- Loja

function loja_itens(): array
{
    return [
        // tipo, nome, preço, descrição
        'tema-hud'        => ['tema', 'HUD Stark', 0, 'Painel azul de laboratório. O padrão.'],
        'tema-gameboy'    => ['tema', 'Tijolão 1989', 150, 'Verde de console portátil antigo, 4 tons.'],
        'tema-synthwave'  => ['tema', 'Synthwave', 300, 'Neon rosa e roxo, pôr do sol de fliperama.'],
        'tema-matrix'     => ['tema', 'Código Verde', 300, 'Chuva de caracteres verdes no fundo.'],
        'tema-pergaminho' => ['tema', 'Taverna', 400, 'Pergaminho e madeira, cara de RPG de mesa.'],
        'pet-slime'       => ['pet', 'Gosminha', 200, 'Um slime que pula pela tela.'],
        'pet-robo'        => ['pet', 'Bit', 350, 'Robozinho que anda e pisca a antena.'],
        'pet-fantasma'    => ['pet', 'Bu', 250, 'Fantasminha que flutua e some de vez em quando.'],
        'pet-dragao'      => ['pet', 'Brasinha', 500, 'Dragãozinho que solta faísca quando você completa missão.'],
        'pet-proprio'     => ['pet', 'Meu mascote', 100, 'Envie a sua própria imagem ou GIF (fica só no seu servidor).'],
        'titulo-aprendiz' => ['titulo', 'Aprendiz', 0, ''],
        'titulo-dev'      => ['titulo', 'Codificador', 100, ''],
        'titulo-bug'      => ['titulo', 'Caçador de Bugs', 250, ''],
        'titulo-foco'     => ['titulo', 'Mestre do Foco', 500, ''],
        'titulo-lenda'    => ['titulo', 'Lenda Viva', 1000, ''],
        'efeito-confete'  => ['efeito', 'Chuva de pixels', 120, 'Explosão de pixels ao concluir missão.'],
        'efeito-som'      => ['efeito', 'Som 8 bits', 80, 'Bipe de videogame ao concluir missão e subir de nível.'],
    ];
}

function equipado(): array
{
    $e = json_decode(ajuste('equipado', ''), true) ?: [];
    return array_merge(['tema' => 'tema-hud', 'pet' => '', 'titulo' => 'titulo-aprendiz', 'efeito-confete' => false, 'efeito-som' => false], $e);
}

function possui(string $item): bool
{
    $itens = loja_itens();
    if (!isset($itens[$item])) {
        return false;
    }
    if ($itens[$item][2] === 0) {
        return true;
    }
    $st = db()->prepare('SELECT COUNT(*) FROM compras WHERE item = ?');
    $st->execute([$item]);
    return (int) $st->fetchColumn() > 0;
}

function comprar(string $item): void
{
    $itens = loja_itens();
    if (!isset($itens[$item])) {
        throw new RuntimeException('Item não existe.');
    }
    if (possui($item)) {
        return;
    }
    $preco = $itens[$item][2];
    if (jogo_status()['moedas'] < $preco) {
        throw new RuntimeException('Moedas insuficientes. Complete mais missões!');
    }
    db()->prepare('INSERT INTO compras (item, preco, criado_em) VALUES (?, ?, ?)')->execute([$item, $preco, agora()]);
}

function equipar(string $item, bool $ligar = true): void
{
    $itens = loja_itens();
    if ($item !== '' && !possui($item)) {
        throw new RuntimeException('Compre o item antes de equipar.');
    }
    $e = equipado();
    $tipo = $item === '' ? 'pet' : $itens[$item][0];
    if ($tipo === 'efeito') {
        $e[$item] = $ligar;
    } else {
        $e[$tipo] = $item;
    }
    salvar_ajuste('equipado', json_encode($e));
}

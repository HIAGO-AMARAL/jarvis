<?php
/*
 * Conversa com o Gemini (Google AI Studio). A chave fica só no servidor.
 * Documentação: https://ai.google.dev/api/generate-content
 */

function ia_configurada(): bool
{
    return ia_chave() !== '';
}

function ia_chave(): string
{
    return ajuste('gemini_chave', (string) cfg('gemini_chave'));
}

function ia_modelo(): string
{
    $m = ajuste('gemini_modelo', (string) cfg('gemini_modelo'));
    return preg_match('/^[a-z0-9.\-]+$/i', $m) ? $m : 'gemini-2.5-flash';
}

/**
 * $mensagens: [['papel' => 'user'|'model', 'texto' => '...'], ...]
 */
function ia_gerar(string $instrucao, array $mensagens, float $temperatura = 0.7): string
{
    if (!ia_configurada()) {
        throw new RuntimeException('Coloque a chave do Gemini em Ajustes para falar com o Jarvis.');
    }
    if (!function_exists('curl_init')) {
        throw new RuntimeException('O servidor não tem a extensão cURL do PHP.');
    }
    $contents = [];
    foreach ($mensagens as $m) {
        $contents[] = ['role' => $m['papel'] === 'model' ? 'model' : 'user', 'parts' => [['text' => (string) $m['texto']]]];
    }
    $corpo = [
        'system_instruction' => ['parts' => [['text' => $instrucao]]],
        'contents' => $contents,
        'generationConfig' => ['temperature' => $temperatura, 'maxOutputTokens' => 1500],
    ];
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . ia_modelo() . ':generateContent';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'x-goog-api-key: ' . ia_chave()],
        CURLOPT_POSTFIELDS => json_encode($corpo, JSON_UNESCAPED_UNICODE),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
    ]);
    $resposta = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $falha = curl_error($ch);
    curl_close($ch);
    if ($resposta === false) {
        throw new RuntimeException('Sem conexão com o Gemini: ' . $falha);
    }
    $json = json_decode($resposta, true);
    if ($status !== 200) {
        $msg = $json['error']['message'] ?? ('erro ' . $status);
        throw new RuntimeException('O Gemini respondeu: ' . $msg);
    }
    $partes = $json['candidates'][0]['content']['parts'] ?? [];
    $texto = trim(implode('', array_map(function ($p) { return $p['text'] ?? ''; }, $partes)));
    if ($texto === '') {
        throw new RuntimeException('O Gemini não devolveu resposta. Tente de novo.');
    }
    return $texto;
}

/** Resumo do dia do Hiago para o Jarvis saber do que está falando. */
function ia_contexto(): string
{
    $d = hoje();
    $semana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][(int) date('w')];
    $tarefas = db()->prepare('SELECT titulo, feita, data FROM tarefas WHERE data BETWEEN ? AND ? ORDER BY data');
    $tarefas->execute([$d, date('Y-m-d', strtotime('+6 days'))]);
    $linhas = [];
    foreach ($tarefas->fetchAll() as $t) {
        $linhas[] = '- ' . date('d/m', strtotime($t['data'])) . ': ' . $t['titulo'] . ($t['feita'] ? ' (feita)' : '');
    }
    $treino = db()->query('SELECT titulo, exercicios FROM treino WHERE dia = ' . (int) date('w'))->fetch();
    $lendo = db()->query("SELECT titulo, autor FROM livros WHERE status = 'lendo'")->fetchAll();
    $peso = db()->query('SELECT kg, data FROM pesos ORDER BY data DESC LIMIT 1')->fetch();
    $j = jogo_status();
    return "Hoje é $semana, " . date('d/m/Y') . ".\n"
        . 'Nível ' . $j['nivel'] . ', ' . $j['xp'] . " XP, sequência de {$j['sequencia']} dia(s).\n"
        . 'Treino de hoje: ' . ($treino ? $treino['titulo'] : '—') . ".\n"
        . 'Lendo agora: ' . ($lendo ? implode('; ', array_map(function ($l) { return $l['titulo'] . ' (' . $l['autor'] . ')'; }, $lendo)) : 'nenhum') . ".\n"
        . 'Último peso: ' . ($peso ? $peso['kg'] . ' kg em ' . date('d/m', strtotime($peso['data'])) : 'não registrado') . ".\n"
        . "Missões dos próximos 7 dias:\n" . ($linhas ? implode("\n", $linhas) : '- nenhuma cadastrada');
}

function ia_instrucao_jarvis(): string
{
    return "Você é o Jarvis, assistente pessoal do Hiago: programador, estudante de Técnico em Informática no IFRO "
        . "(Ariquemes, RO), em busca do primeiro emprego remoto em TI. Ele é nerd e gamer, treina musculação e quer emagrecer, "
        . "ler mais e estudar Git, SQL, JavaScript, React e inglês.\n"
        . "Fale sempre em português do Brasil, de forma curta, direta e com um toque de humor nerd, sem exagero. "
        . "Ajude a organizar o dia e a semana, sugira prioridades e dê incentivo honesto: se ele estiver atrasado, diga com gentileza. "
        . "Não invente dados que não estão no contexto. Não dê orientação médica; para saúde, sugira procurar um profissional.\n\n"
        . "CONTEXTO ATUAL:\n" . ia_contexto();
}

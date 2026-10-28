<?php
/*
 * Mapa do Cérebro: lê o cofre do Obsidian (pasta Cerebro) e monta um mapa
 * mental em árvore para a tela "Cérebro" do Jarvis.
 *
 * Regras (para o Hiago e o Claude organizarem o cofre):
 *  - Cada pasta é um ramo (o número do começo some: "02 Projetos" → "Projetos").
 *  - Cada nota da pasta é um galho. Pasta com uma nota só vira um galho só.
 *  - Nota com o mesmo nome da pasta (ex.: Projetos.md) é o índice: cada linha
 *    da primeira tabela vira um galho (1ª coluna = nome; colunas "O que é" e
 *    "Status" viram descrição e status).
 *  - Itens de lista embaixo de "## Mapas", "## Partes", "## Regiões", "## Fases",
 *    "## Módulos" ou "## Itens" viram galhos filhos daquela nota.
 *  - Em pasta de uma nota só, itens de lista que começam em **negrito** viram galhos.
 *  - Frontmatter "icone: jogo" troca o ícone. [[links]] viram ligações extras.
 *  - Os livros vêm da estante do Jarvis (e da tabela "Livros" do cofre).
 */

function cofre_pasta(): string
{
    $p = cfg('cofre') ?: (RAIZ . '/../Cerebro');
    return rtrim(str_replace('\\', '/', $p), '/');
}

function cerebro_norm(string $t): string
{
    $t = mb_strtolower(trim(preg_replace('/\[\[([^\]|]+)(\|[^\]]+)?\]\]/u', '$1', $t)));
    $t = strtr($t, ['á' => 'a', 'à' => 'a', 'â' => 'a', 'ã' => 'a', 'é' => 'e', 'ê' => 'e', 'í' => 'i', 'ó' => 'o', 'ô' => 'o', 'õ' => 'o', 'ú' => 'u', 'ç' => 'c']);
    return preg_replace('/[^a-z0-9]+/', ' ', $t);
}

function cerebro_limpo(string $t): string
{
    $t = preg_replace('/\[\[([^\]|]+)\|([^\]]+)\]\]/u', '$2', $t);
    $t = preg_replace('/\[\[([^\]]+)\]\]/u', '$1', $t);
    $t = preg_replace('/\*\*|__|`/', '', $t);
    return trim($t);
}

/** Escolhe um ícone pelo nome (ou pelo "icone:" do frontmatter). */
function cerebro_icone(string $nome, string $pai = ''): string
{
    $n = cerebro_norm($nome . ' ' . $pai);
    $regras = [
        'roblox|jogo|seas of will|game' => 'jogo', 'atenas|atena' => 'coruja', 'jarvis' => 'orbe',
        'modelo|padro|prompt' => 'modelo', 'servidor|ubuntu|linux' => 'servidor', 'bot|discord' => 'robo', 'vharnor|modpack|minecraft|\bmods?\b' => 'cubo',
        'alimenta|comida|dieta' => 'cafe', 'sono|dormir' => 'lua', 'leitura|livro' => 'livro',
        'barbearia' => 'tesoura', 'cafe|cafeeir' => 'cafe', 'doce' => 'doce', 'site|landing|web' => 'globo',
        'carreira|emprego|curriculo|portfolio' => 'maleta', 'projeto' => 'camadas', 'atlaris|empresa' => 'foguete',
        'rotina|saude|treino' => 'haltere', 'estudo|curso' => 'capelo', 'ideia' => 'lampada',
        'inbox|caixa' => 'caixa', 'livro|leitura' => 'livro', 'mapa|regiao|calha|vila|mar' => 'mapa',
    ];
    foreach ($regras as $re => $ico) {
        if (preg_match('/(' . $re . ')/', $n)) {
            return $ico;
        }
    }
    return 'nota';
}

function cerebro_status(string $s): string
{
    $n = cerebro_norm($s);
    if ($n === '') {
        return '';
    }
    $primeiro = cerebro_norm(preg_split('/[;,(]/', $s)[0]);
    if (preg_match('/^(no ar|pronto|pronta|feito|conclu|entregue)/', $primeiro)) {
        return 'ok';
    }
    if (preg_match('/pausad|parad/', $n)) {
        return 'pausado';
    }
    if (preg_match('/ideia|planej/', $n)) {
        return 'ideia';
    }
    if (preg_match('/andamento|falta|fazendo|pronta para subir|em teste/', $n)) {
        return 'andamento';
    }
    if (preg_match('/no ar|pronto|feito|conclu|entregue|ok/', $n)) {
        return 'ok';
    }
    return 'andamento';
}

/** Lê uma nota: título, frontmatter, resumo, tabelas, listas por seção e links. */
function cerebro_ler(string $arq): array
{
    $txt = str_replace("\r\n", "\n", (string) @file_get_contents($arq));
    $front = [];
    if (preg_match('/^---\n(.*?)\n---\n/s', $txt, $m)) {
        foreach (explode("\n", $m[1]) as $l) {
            if (preg_match('/^(\w+):\s*(.+)$/', $l, $x)) {
                $front[strtolower($x[1])] = trim($x[2], " \"'");
            }
        }
        $txt = substr($txt, strlen($m[0]));
    }
    $titulo = preg_match('/^#\s+(.+)$/m', $txt, $m) ? cerebro_limpo($m[1]) : pathinfo($arq, PATHINFO_FILENAME);
    $resumo = '';
    foreach (explode("\n", $txt) as $l) {
        $l = trim($l);
        if ($l === '' || $l[0] === '#' || $l[0] === '|' || $l === '---') {
            continue;
        }
        $resumo = cerebro_limpo(ltrim($l, '-* '));
        break;
    }
    // primeira tabela
    $tabela = [];
    if (preg_match('/^\|(.+)\|\n\|[-:| ]+\|\n((?:\|.*\|\n?)+)/m', $txt, $m)) {
        $cab = array_map(function ($c) { return cerebro_norm($c); }, explode('|', $m[1]));
        foreach (explode("\n", trim($m[2])) as $linha) {
            $cel = array_map('trim', explode('|', trim($linha, " |")));
            $tabela[] = ['cab' => $cab, 'cel' => $cel];
        }
    }
    // listas embaixo das seções especiais
    $filhos = [];
    $negritos = [];
    $secao = '';
    foreach (explode("\n", $txt) as $l) {
        if (preg_match('/^#{2,3}\s+(.+)$/', $l, $m)) {
            $secao = cerebro_norm($m[1]);
            continue;
        }
        if (preg_match('/^[-*]\s+(\[.\]\s+)?(.+)$/', $l, $m)) {
            $item = $m[2];
            if (preg_match('/^(mapas|partes|regioes|fases|modulos|itens)\b/', $secao)) {
                $filhos[] = cerebro_limpo(preg_replace('/[:\-–].*$/u', '', $item)) ?: cerebro_limpo($item);
            }
            if (preg_match('/^\*\*([^*]{2,40}?):?\*\*:?\s*(.*)$/u', $item, $b)) {
                $negritos[] = [rtrim(cerebro_limpo($b[1]), ':'), cerebro_limpo($b[2])];
            }
        }
    }
    preg_match_all('/\[\[([^\]|#]+)/u', $txt, $m);
    return ['titulo' => $titulo, 'front' => $front, 'resumo' => mb_substr($resumo, 0, 220), 'tabela' => $tabela,
        'filhos' => array_values(array_unique(array_filter($filhos))), 'negritos' => $negritos, 'links' => array_unique($m[1])];
}

function cerebro_mapa(): array
{
    $raiz = cofre_pasta();
    $nos = [];
    $arestas = [];
    $porNome = [];
    $add = function (array $no, ?string $pai) use (&$nos, &$arestas, &$porNome) {
        $no['id'] = 'n' . count($nos);
        $nos[] = $no;
        if ($pai !== null) {
            $arestas[] = [$pai, $no['id']];
        }
        $porNome[cerebro_norm($no['nome'])] = $no['id'];
        return $no['id'];
    };
    $obs = function (string $arq) use ($raiz) {
        $rel = substr(str_replace('\\', '/', $arq), strlen($raiz) + 1);
        return 'obsidian://open?vault=' . rawurlencode(basename($raiz)) . '&file=' . rawurlencode(preg_replace('/\.md$/', '', $rel));
    };
    $centro = $add(['nome' => 'Cérebro', 'icone' => 'cerebro', 'tipo' => 'raiz', 'resumo' => 'Tudo o que está no seu Obsidian, ligado.'], null);
    $existe = is_dir($raiz);
    $links = [];

    if ($existe) {
        $pastas = array_filter(glob($raiz . '/*', GLOB_ONLYDIR) ?: [], function ($p) {
            $b = basename($p);
            return $b[0] !== '.' && $b[0] !== '_';
        });
        sort($pastas);
        foreach ($pastas as $pasta) {
            $nomePasta = trim(preg_replace('/^\d+\s*/', '', basename($pasta)));
            $notas = glob($pasta . '/*.md') ?: [];
            sort($notas);
            if (!$notas) {
                continue;
            }
            $unica = count($notas) === 1;
            $lidas = [];
            foreach ($notas as $arq) {
                $lidas[$arq] = cerebro_ler($arq);
            }
            $info = $unica ? reset($lidas) : null;
            if ($unica && cerebro_norm($info['titulo']) === 'inbox' && strlen(trim(implode('', array_column($info['negritos'], 0)))) === 0 && !$info['filhos']) {
                // inbox vazia não entra no mapa
                $temItem = (bool) preg_match('/^[-*]\s+\S/m', (string) @file_get_contents(array_key_first($lidas)));
                if (!$temItem) {
                    continue;
                }
            }
            $idPasta = $add([
                'nome' => $unica ? $info['titulo'] : $nomePasta,
                'icone' => $unica && !empty($info['front']['icone']) ? $info['front']['icone'] : cerebro_icone($nomePasta),
                'tipo' => 'ramo', 'resumo' => $unica ? $info['resumo'] : count($notas) . ' notas',
                'abrir' => $unica ? $obs(array_key_first($lidas)) : null,
            ], $centro);
            if ($unica) {
                foreach ($info['links'] as $l) {
                    $links[] = [$idPasta, $l];
                }
                foreach (array_slice($info['negritos'], 0, 12) as $b) {
                    $add(['nome' => $b[0], 'icone' => cerebro_icone($b[0], $nomePasta), 'tipo' => 'folha', 'resumo' => $b[1]], $idPasta);
                }
                continue;
            }
            // nota-índice (mesmo nome da pasta): tabela vira galhos
            $indice = null;
            foreach ($lidas as $arq => $l) {
                if (cerebro_norm(pathinfo($arq, PATHINFO_FILENAME)) === cerebro_norm($nomePasta)) {
                    $indice = $arq;
                }
            }
            $galhos = [];
            if ($indice) {
                foreach ($lidas[$indice]['tabela'] as $t) {
                    $nome = cerebro_limpo($t['cel'][0] ?? '');
                    if ($nome === '') {
                        continue;
                    }
                    $desc = '';
                    $st = '';
                    foreach ($t['cab'] as $i => $c) {
                        if (preg_match('/o que|descri/', $c)) {
                            $desc = cerebro_limpo($t['cel'][$i] ?? '');
                        }
                        if (preg_match('/status|situa/', $c)) {
                            $st = cerebro_limpo($t['cel'][$i] ?? '');
                        }
                    }
                    $galhos[cerebro_norm($nome)] = ['nome' => $nome, 'resumo' => $desc, 'status' => cerebro_status($st), 'status_txt' => $st];
                }
                foreach ($lidas[$indice]['links'] as $l) {
                    $links[] = [$idPasta, $l];
                }
            }
            foreach ($lidas as $arq => $l) {
                if ($arq === $indice) {
                    continue;
                }
                $k = cerebro_norm(pathinfo($arq, PATHINFO_FILENAME));
                $base = $galhos[$k] ?? ['nome' => $l['titulo'], 'resumo' => $l['resumo'], 'status' => '', 'status_txt' => ''];
                if ($base['resumo'] === '') {
                    $base['resumo'] = $l['resumo'];
                }
                $base['nota'] = $arq;
                $galhos[$k] = $base;
            }
            foreach ($galhos as $g) {
                $l = isset($g['nota']) ? $lidas[$g['nota']] : null;
                $id = $add([
                    'nome' => $g['nome'], 'icone' => $l && !empty($l['front']['icone']) ? $l['front']['icone'] : cerebro_icone($g['nome'], $nomePasta),
                    'tipo' => 'galho', 'resumo' => $g['resumo'], 'status' => $g['status'], 'status_txt' => $g['status_txt'],
                    'abrir' => isset($g['nota']) ? $obs($g['nota']) : ($indice ? $obs($indice) : null),
                ], $idPasta);
                if ($l) {
                    foreach ($l['filhos'] as $f) {
                        $add(['nome' => $f, 'icone' => cerebro_icone($f, 'mapa'), 'tipo' => 'folha', 'resumo' => ''], $id);
                    }
                    foreach ($l['links'] as $x) {
                        $links[] = [$id, $x];
                    }
                }
            }
        }
    }

    // livros: estante do Jarvis + tabela "Livros" do cofre
    $livros = [];
    foreach (db()->query('SELECT titulo, autor, status, nota FROM livros ORDER BY titulo') as $l) {
        $livros[cerebro_norm($l['titulo'])] = $l;
    }
    foreach (glob($raiz . '/*/*.md') ?: [] as $arq) {
        $txt = (string) @file_get_contents($arq);
        if (!preg_match('/^#{1,3}\s+Livros\s*$/mi', $txt)) {
            continue;
        }
        if (preg_match('/^#{1,3}\s+Livros\s*\n+\|.+\|\n\|[-:| ]+\|\n((?:\|.*\|\n?)+)/mi', str_replace("\r\n", "\n", $txt), $m)) {
            foreach (explode("\n", trim($m[1])) as $linha) {
                $c = array_map('trim', explode('|', trim($linha, ' |')));
                $tit = trim(preg_replace('/\s*\(.*\)\s*$/', '', cerebro_limpo($c[0] ?? '')));
                if ($tit === '') {
                    continue;
                }
                $k = cerebro_norm($tit);
                $achou = false;
                foreach ($livros as $kk => $v) {
                    if (strpos($kk, $k) === 0 || strpos($k, $kk) === 0) {
                        $achou = true;
                    }
                }
                if (!$achou) {
                    $st = cerebro_norm($c[1] ?? '');
                    $livros[$k] = ['titulo' => $tit, 'autor' => preg_match('/\((.+)\)/', $c[0], $a) ? $a[1] : '', 'status' => preg_match('/lido|conclu/', $st) ? 'lido' : (preg_match('/lendo/', $st) ? 'lendo' : 'quero'), 'nota' => null];
                }
            }
        }
    }
    if ($livros) {
        $idLivros = $add(['nome' => 'Livros', 'icone' => 'livro', 'tipo' => 'ramo', 'resumo' => count($livros) . ' livros na estante'], $centro);
        uasort($livros, function ($a, $b) {
            $o = ['lendo' => 0, 'lido' => 1, 'quero' => 2];
            return [$o[$a['status']] ?? 3, $a['titulo']] <=> [$o[$b['status']] ?? 3, $b['titulo']];
        });
        foreach ($livros as $l) {
            $add(['nome' => $l['titulo'], 'icone' => 'livro', 'tipo' => 'livro', 'livro' => $l['status'],
                'resumo' => trim(($l['autor'] ? $l['autor'] . ' · ' : '') . ['lido' => 'Lido', 'lendo' => 'Lendo agora', 'quero' => 'Ainda não leu'][$l['status']] . ($l['nota'] ? ' · ' . $l['nota'] . '/5' : ''))], $idLivros);
        }
    }

    // ligações extras dos [[links]]
    $extras = [];
    foreach ($links as $x) {
        $alvo = $porNome[cerebro_norm($x[1])] ?? null;
        if ($alvo && $alvo !== $x[0]) {
            $par = [$x[0], $alvo];
            sort($par);
            $extras[implode('-', $par)] = $par;
        }
    }
    $arv = [];
    foreach ($arestas as $a) {
        $arv[implode('-', [min($a), max($a)])] = true;
    }
    $extras = array_values(array_filter($extras, function ($p) use ($arv) { return !isset($arv[implode('-', [min($p), max($p)])]); }));

    return ['nos' => $nos, 'arestas' => $arestas, 'extras' => $extras, 'cofre' => $existe, 'pasta' => $raiz];
}

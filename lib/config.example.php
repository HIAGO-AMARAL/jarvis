<?php
// Copie este arquivo para lib/config.php no servidor. Ele não vai para o GitHub.
return [
    'nome'          => 'Jarvis',
    'fuso_horario'  => 'America/Sao_Paulo',
    'banco'         => __DIR__ . '/../data/jarvis.sqlite',
    // Chave e modelo do Gemini também podem ser definidos na tela Ajustes do app.
    'gemini_chave'  => '',
    'gemini_modelo' => 'gemini-2.5-flash',
    // Pasta do cofre do Obsidian (mapa do Cérebro). Padrão: a pasta Cerebro ao lado do jarvis.
    'cofre'         => __DIR__ . '/../../Cerebro',
    'debug'         => false,
];

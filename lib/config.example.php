<?php
// Copie este arquivo para lib/config.php no servidor. Ele não vai para o GitHub.
return [
    'nome'          => 'Jarvis',
    'fuso_horario'  => 'America/Sao_Paulo',
    'banco'         => __DIR__ . '/../data/jarvis.sqlite',
    // Chave e modelo do Gemini também podem ser definidos na tela Ajustes do app.
    'gemini_chave'  => '',
    'gemini_modelo' => 'gemini-2.5-flash',
    'debug'         => false,
];

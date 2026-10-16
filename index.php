<?php
header('Cache-Control: no-cache');
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
$v = '1';
?><!doctype html>
<html lang="pt-BR" data-tema="tema-hud">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#060b14">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Jarvis</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="assets/icons/icone-192.png">
<link rel="apple-touch-icon" href="assets/icons/icone-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Chakra+Petch:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/app.css?v=<?= $v ?>">
</head>
<body>
<canvas id="fundo-matrix" aria-hidden="true"></canvas>
<div id="app" class="carregando"><div class="boot"><span class="boot-logo">J.A.R.V.I.S</span><span class="boot-barra"><i></i></span><small>Iniciando sistemas...</small></div></div>
<div id="pet" aria-hidden="true"></div>
<div id="toasts" aria-live="polite"></div>
<script src="assets/app.js?v=<?= $v ?>"></script>
</body>
</html>

/* =============================================================================
   Jarvis: app de página única. Fala com api.php e guarda só o token do Spotify
   no navegador.
   ========================================================================== */
(function () {
  'use strict';

  // ---------------------------------------------------------------- utilidades
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var CSRF = '';
  var estado = { jogo: null, equipado: null };
  var DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var DIAS_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var DIF = { 1: ['Fácil', 10], 2: ['Média', 25], 3: ['Difícil', 50], 4: ['Chefão', 100] };
  var CAT = { geral: 'Geral', estudo: 'Estudo', trabalho: 'Trabalho', saude: 'Saúde', casa: 'Casa' };

  function iso(d) { var z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function deIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function br(s) { if (!s) return ''; var p = s.slice(0, 10).split('-'); return p[2] + '/' + p[1]; }
  function somaDias(s, n) { var d = deIso(s); d.setDate(d.getDate() + n); return iso(d); }
  function segunda(s) { var d = deIso(s); var w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return iso(d); }

  function api(rota, corpo, metodo) {
    var op = { method: metodo || (corpo ? 'POST' : 'GET'), headers: { 'X-CSRF': CSRF }, credentials: 'same-origin' };
    if (corpo instanceof FormData) op.body = corpo;
    else if (corpo) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(corpo); }
    return fetch('api.php?r=' + rota, op).then(function (r) {
      return r.json().catch(function () { return { erro: 'Resposta inválida do servidor.' }; }).then(function (j) {
        if (r.status === 401 && rota !== 'entrar') { telaLogin(); throw new Error(j.erro); }
        if (!r.ok || j.erro) { toast(j.erro || 'Erro.', 'erro'); throw new Error(j.erro); }
        return j;
      });
    });
  }

  function toast(texto, tipo) {
    var t = document.createElement('div');
    t.className = 'toast ' + (tipo || '');
    t.textContent = texto;
    $('#toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, tipo === 'erro' ? 5000 : 2600);
  }

  // ---------------------------------------------------------------- ícones (pixel)
  var ICO = {
    hoje: '<path d="M4 6h16v14H4z"/><path d="M4 10h16M8 3v4M16 3v4"/><path d="M9 14h2v2H9z"/>',
    semana: '<path d="M3 5h18v15H3z"/><path d="M3 9h18M8 9v11M13 9v11M18 9v11"/>',
    saude: '<path d="M3 10h3v4H3zM18 10h3v4h-3zM6 8h2v8H6zM16 8h2v8h-2zM8 11h8v2H8z"/>',
    estudos: '<path d="M4 4h7v16H4zM13 4h7v16h-7z"/><path d="M6 8h3M15 8h3M6 11h3M15 11h3"/>',
    jarvis: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/>',
    loja: '<path d="M4 9h16l-1 11H5z"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/>',
    spotify: '<circle cx="12" cy="12" r="9"/><path d="M7 10c3-1 7-1 10 1M8 13c2.5-.8 5.5-.6 8 .8M9 16c2-.5 4-.3 6 .6"/>',
    ajustes: '<path d="M10 3h4v3l2 1 2-2 3 3-2 2 1 2h3v4h-3l-1 2 2 2-3 3-2-2-2 1v3h-4v-3l-2-1-2 2-3-3 2-2-1-2H0v-4h3l1-2-2-2 3-3 2 2 2-1z" transform="scale(.9) translate(1.3 1.3)"/><circle cx="12" cy="12" r="3"/>',
    check: '<path d="M4 12l5 5L20 6" stroke-width="3.5"/>',
    lixo: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    mais: '<path d="M12 5v14M5 12h14"/>',
    play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
    pausa: '<path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/>',
    prox: '<path d="M5 4l10 8-10 8zM17 4h3v16h-3z" fill="currentColor"/>',
    ant: '<path d="M19 4L9 12l10 8zM4 4h3v16H4z" fill="currentColor"/>',
    esq: '<path d="M15 5l-7 7 7 7"/>',
    dir: '<path d="M9 5l7 7-7 7"/>',
    moeda: '<rect x="6" y="3" width="12" height="18" fill="#ffc83d"/><rect x="3" y="6" width="18" height="12" fill="#ffc83d"/><rect x="10" y="7" width="4" height="10" fill="#b8860b"/>',
    fogo: '<path d="M12 2h2v4h2v2h2v4h2v8H4v-8h2V8h2v4h2V6h2z" fill="#ff7a1a"/><path d="M10 14h4v6h-4z" fill="#ffd23f"/>',
    raio: '<path d="M13 2L5 14h6l-2 8 10-13h-7z" fill="#ffd23f"/>',
    sair: '<path d="M15 4h4v16h-4M10 17l-5-5 5-5M5 12h11"/>',
    jardim: '<path d="M11 21v-7M6 14h12M12 3l6 6h-3l3 4H6l3-4H6z"/>'
  };
  function ico(n, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" shape-rendering="crispEdges" ' + (extra || '') + '>' + (ICO[n] || '') + '</svg>';
  }

  // ---------------------------------------------------------------- mascotes (pixel art original)
  var PETS = {
    'pet-slime': { cores: { g: '#39d353', G: '#1a7f37', w: '#ffffff', k: '#0b1d0f' }, mapa: [
      '....GGGG....', '..GGggggGG..', '.GggggggggG.', 'GggwkggwkggG', 'GggkkggkkggG', 'GggggggggggG', 'GgggggggwggG', '.GGGGGGGGGG.'] },
    'pet-robo': { cores: { m: '#9fb4c7', M: '#5b6f82', r: '#ff4d6d', c: '#00e5ff', k: '#14202b' }, mapa: [
      '.....r......', '.....M......', '..MMMMMMM...', '..MmcmmcmM..', '..MmmmmmmM..', '..MMkkkkMM..', '.MMmmmmmmMM.', '.M.MmmmmM.M.', '...MM..MM...'] },
    'pet-fantasma': { cores: { w: '#eef6ff', W: '#a9c4e0', k: '#20304a', p: '#ff9ec7' }, mapa: [
      '...WWWWW....', '..WwwwwwW...', '.WwwkwwkwW..', '.WwwkwwkwW..', '.WwpwwwpwW..', '.WwwwkkwwW..', '.WwwwwwwwW..', '.WwWwwWwwW..', '.W.W.WW.W...'] },
    'pet-dragao': { cores: { r: '#e5533d', R: '#9c2b1c', y: '#ffd23f', w: '#ffffff', k: '#2a0d06', o: '#ff9a3d' }, mapa: [
      '.......RR...', '......RrrR..', 'R....RrwkrR.', 'rR..RrrrrrRo', 'rrRRrrrrrRR.', '.rrrrryyrR..', '..RrryyyrR..', '..RrrrrrrR..', '...RR..RR...'] },
    'pet-abobora': { cores: { o: '#ff8a1f', O: '#c25a00', g: '#3fa34d', y: '#ffe066', k: '#2a1300' }, mapa: [
      '.....gg.....', '.....g......', '..OOOoOOO...', '.OooooooooO.', 'OoykoooykooO', 'OokkooookkoO', 'OooooooooooO', 'Ooykykykyko.', '.OokykykoOO.', '..OOOOOOOO..'] },
    'pet-morcego': { cores: { b: '#2d2140', B: '#140c22', r: '#ff4d6d', w: '#ffffff' }, mapa: [
      'B............B', 'BB....bb....BB', 'bBB..bbbb..BBb', 'bbBBbrbbrbBBbb', '.bbbbbbbbbbbb.', '..bb.bwwb.bb..', '......bb......'] },
    'pet-gato': { cores: { k: '#141414', K: '#2b2b2b', y: '#c6ff3d', p: '#ff8fb1' }, mapa: [
      '.k..k.......', '.kk.kk......', '.kkkkk......', 'kykkyk.....k', 'kkkpkk....k.', '.kkkkkkkkkk.', '.kKkkkkkKkk.', '.kk.kk.kk.kk', '.k..k..k..k.'] },
    'pet-capivara': { cores: { c: '#9b6a3c', C: '#6b4524', k: '#1d120a', n: '#4a2f17' }, mapa: [
      '..CC..........', '.CccC.........', 'Cckccccccccc..', 'nccccccccccccC', 'nncccccccccccC', '.CccccccccccC.', '..CC..CC.CC...', '..C...C...C...'] },
    'pet-drone': { cores: { m: '#5c6673', M: '#2f363f', c: '#02d7f2', r: '#ff003c', w: '#d9e2ec' }, mapa: [
      'MM........MM', 'wwwwM..Mwwww', '...MmmmmM...', '..MmmmmmmM..', '..MmcccmmM..', '..MmmmmmmM..', '...MmrmmM...', '....M..M....', '...M....M...'] }
  };
  var PET_ESTILO = { 'pet-fantasma': 'flutua', 'pet-drone': 'flutua', 'pet-morcego': 'voa', 'pet-capivara': 'lento', 'pet-gato': 'gato', 'pet-abobora': 'abobora' };
  function petSvg(id) {
    var p = PETS[id];
    if (!p) return '';
    var w = p.mapa[0].length, h = p.mapa.length, r = '';
    p.mapa.forEach(function (linha, y) {
      linha.split('').forEach(function (c, x) { if (p.cores[c]) r += '<rect x="' + x + '" y="' + y + '" width="1.02" height="1.02" fill="' + p.cores[c] + '"/>'; });
    });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" shape-rendering="crispEdges">' + r + '</svg>';
  }
  function petImg(id) {
    if (id === 'pet-proprio') return '<img src="api.php?r=pet_imagem" alt="">';
    if (id.indexOf('proprio:') === 0) return '<img src="api.php?r=pet_imagem&a=' + encodeURIComponent(id.slice(8)) + '" alt="">';
    return petSvg(id);
  }
  function aplicarPet() {
    var el = $('#pet'), pets = (estado.equipado && estado.equipado.pets) || [];
    el.innerHTML = pets.map(function (id, i) {
      return '<div class="mascote m' + (i + 1) + ' ' + (PET_ESTILO[id] || '') + '"><div class="corpo">' + petImg(id) + '</div></div>';
    }).join('');
  }
  function petFeliz() {
    $$('.mascote').forEach(function (m) {
      m.classList.add('feliz');
      setTimeout(function () { m.classList.remove('feliz'); }, 1600);
    });
  }

  // ---------------------------------------------------------------- tema e Matrix
  var matrixTimer = null;
  function aplicarTema() {
    var tema = (estado.equipado && estado.equipado.tema) || 'tema-hud';
    document.documentElement.dataset.tema = tema;
    var cor = getComputedStyle(document.documentElement).getPropertyValue('--fundo').trim();
    var meta = $('meta[name="theme-color"]');
    if (meta && cor) meta.content = cor;
    clearInterval(matrixTimer);
    if (tema !== 'tema-matrix') return;
    var cv = $('#fundo-matrix'), cx = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    var col = Math.floor(cv.width / 16), gotas = Array(col).fill(1), chars = 'アイウエオカキクケコ01ハヒフヘホ<>/{}$#JARVIS';
    matrixTimer = setInterval(function () {
      cx.fillStyle = 'rgba(0,0,0,.08)'; cx.fillRect(0, 0, cv.width, cv.height);
      cx.fillStyle = '#00ff41'; cx.font = '15px monospace';
      gotas.forEach(function (y, i) {
        cx.fillText(chars[Math.floor(Math.random() * chars.length)], i * 16, y * 16);
        gotas[i] = (y * 16 > cv.height && Math.random() > .975) ? 0 : y + 1;
      });
    }, 60);
  }

  // ---------------------------------------------------------------- efeitos
  var audio = null;
  function bip(notas) {
    if (!estado.equipado || !estado.equipado['efeito-som']) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var t = audio.currentTime;
      notas.forEach(function (f, i) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(.06, t + i * .08); g.gain.exponentialRampToValueAtTime(.0001, t + i * .08 + .12);
        o.connect(g); g.connect(audio.destination); o.start(t + i * .08); o.stop(t + i * .08 + .13);
      });
    } catch (e) { /* sem áudio */ }
  }
  function confete(x, y) {
    if (!estado.equipado || !estado.equipado['efeito-confete']) return;
    var cores = ['var(--acento)', 'var(--xp)', 'var(--ok)', 'var(--acento-2)'];
    for (var i = 0; i < 18; i++) {
      var p = document.createElement('i');
      p.className = 'pixel-confete';
      p.style.left = x + 'px'; p.style.top = y + 'px'; p.style.background = cores[i % 4];
      document.body.appendChild(p);
      var a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 70;
      p.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: 'translate(' + Math.cos(a) * d + 'px,' + (Math.sin(a) * d + 30) + 'px)', opacity: 0 }], { duration: 700 + Math.random() * 300, easing: 'steps(8)' });
      setTimeout(p.remove.bind(p), 1000);
    }
  }
  function recompensa(res, el) {
    if (res.jogo) atualizarHud(res.jogo);
    if (!res.xp) return;
    var r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0 };
    if (res.xp > 0) {
      var f = document.createElement('div');
      f.className = 'xp-voando'; f.textContent = '+' + res.xp + ' XP';
      f.style.left = (r.left + r.width / 2 - 30) + 'px'; f.style.top = r.top + 'px';
      document.body.appendChild(f);
      setTimeout(f.remove.bind(f), 1000);
      confete(r.left + r.width / 2, r.top);
      bip([660, 880]);
      petFeliz();
    }
    if (res.subiu) levelUp(res.jogo.nivel);
  }
  function levelUp(nivel) {
    bip([523, 659, 784, 1047]);
    var m = document.createElement('div');
    m.className = 'levelup';
    m.innerHTML = '<div><b>LEVEL UP!</b><span>Você chegou ao nível ' + nivel + '</span></div>';
    m.addEventListener('click', function () { m.remove(); });
    document.body.appendChild(m);
    setTimeout(function () { m.remove(); }, 3200);
  }

  // ---------------------------------------------------------------- casca e HUD
  var ROTAS = [
    ['hoje', 'Hoje'], ['semana', 'Missões'], ['saude', 'Saúde'], ['estudos', 'Estudos'],
    ['jardim', 'Jardim'], ['jarvis', 'Jarvis'], ['loja', 'Loja'], ['spotify', 'Spotify'], ['ajustes', 'Ajustes']
  ];
  function montarCasca() {
    var nav = ROTAS.map(function (r) { return '<a class="nav-item" href="#' + r[0] + '" data-rota="' + r[0] + '">' + ico(r[0]) + '<span class="rot">' + r[1] + '</span></a>'; }).join('');
    $('#app').className = '';
    $('#app').innerHTML =
      '<div class="casca"><nav class="trilho"><div class="marca">J.A.R.V.I.S</div>' + nav + '<div class="espaco"></div>' +
      '<button class="nav-item" data-sair>' + ico('sair') + '<span class="rot">Sair</span></button></nav>' +
      '<main class="principal"><section class="hud" id="hud"></section><div id="tela"></div></main></div>' +
      '<nav class="nav-baixo">' + nav + '</nav><div id="mini-player"></div>';
    $('[data-sair]').addEventListener('click', function () { api('sair', {}).then(function () { location.hash = ''; telaLogin(); }); });
  }
  function atualizarHud(j) {
    estado.jogo = j;
    var mudou = JSON.stringify(estado.equipado) !== JSON.stringify(j.equipado);
    estado.equipado = j.equipado;
    if (mudou) { aplicarTema(); aplicarPet(); }
    var titulo = { 'titulo-aprendiz': 'Aprendiz', 'titulo-dev': 'Codificador', 'titulo-bug': 'Caçador de Bugs', 'titulo-foco': 'Mestre do Foco', 'titulo-lenda': 'Lenda Viva' }[j.equipado.titulo] || 'Aprendiz';
    var pct = Math.min(100, Math.round(j.xp_nivel / j.xp_proximo * 100));
    $('#hud').innerHTML =
      '<div class="avatar">H<span class="lv">LV ' + j.nivel + '</span></div>' +
      '<div><div class="hud-nome"><strong>HIAGO</strong><span class="titulo">« ' + esc(titulo) + ' »</span></div>' +
      '<div class="barra-xp" title="' + j.xp_nivel + ' de ' + j.xp_proximo + ' XP"><i style="width:' + pct + '%"></i><span>' + j.xp_nivel + '/' + j.xp_proximo + ' XP</span></div></div>' +
      '<div class="hud-stats"><div class="stat" title="Moedas para a loja">' + ico('moeda') + j.moedas + '</div>' +
      '<div class="stat" title="Dias seguidos com hábitos">' + ico('fogo') + j.sequencia + '<small>dias</small></div>' +
      '<div class="stat" title="XP ganho hoje">' + ico('raio') + '+' + j.hoje_xp + '<small>hoje</small></div></div>';
  }

  // ---------------------------------------------------------------- rotas
  function navegar() {
    var rota = (location.hash || '#hoje').slice(1).split('?')[0];
    if (!TELAS[rota]) rota = 'hoje';
    $$('[data-rota]').forEach(function (a) { a.classList.toggle('ativo', a.dataset.rota === rota); });
    var tela = $('#tela');
    tela.innerHTML = '<div class="vazio">Carregando...</div>';
    tela = novo(tela);
    tela.innerHTML = '<div class="vazio">Carregando...</div>';
    TELAS[rota](tela);
    window.scrollTo(0, 0);
  }

  function itemTarefa(t, mostrarData) {
    var atrasada = !t.feita && t.data && t.data < iso(new Date());
    return '<li class="item ' + (t.feita ? 'feito' : '') + '" data-tarefa="' + t.id + '">' +
      '<button class="check" data-marcar-tarefa="' + t.id + '" aria-label="Concluir">' + ico('check') + '</button>' +
      '<div class="item-titulo">' + esc(t.titulo) + '<small>' + CAT[t.categoria] + (mostrarData && t.data ? ' · ' + br(t.data) : '') + (atrasada ? ' · <span class="atrasada">atrasada</span>' : '') + '</small></div>' +
      '<span class="dif dif-' + t.dificuldade + '">' + DIF[t.dificuldade][0] + '</span>' +
      '<span class="xp-tag">+' + DIF[t.dificuldade][1] + '</span>' +
      '<button class="btn-ico" data-editar-tarefa="' + t.id + '" aria-label="Editar">' + ico('editar') + '</button></li>';
  }

  function ligarTarefas(raiz, lista, aoMarcar, aoEditar) {
    raiz.addEventListener('click', function (e) {
      var b = e.target.closest('[data-marcar-tarefa]');
      if (b) {
        var li = b.closest('.item'), feita = !li.classList.contains('feito');
        li.classList.toggle('feito', feita);
        api('tarefa_marcar', { id: +b.dataset.marcarTarefa, feita: feita }).then(function (r) { recompensa(r, b); if (aoMarcar) aoMarcar(); });
        return;
      }
      var ed = e.target.closest('[data-editar-tarefa]');
      if (ed) {
        var t = lista().filter(function (x) { return x.id == ed.dataset.editarTarefa; })[0];
        if (t) editarTarefa(t, aoEditar);
      }
    });
  }

  function editarTarefa(t, depois) {
    modal('<h2 class="titulo-pixel">' + (t.id ? 'Editar missão' : 'Nova missão') + '</h2>' +
      '<label class="campo">Missão<input name="titulo" value="' + esc(t.titulo || '') + '" required></label>' +
      '<div class="form-grade"><label class="campo">Dia<input type="date" name="data" value="' + (t.data || '') + '"></label>' +
      '<label class="campo">Dificuldade<select name="dificuldade">' + [1, 2, 3, 4].map(function (d) { return '<option value="' + d + '"' + (+t.dificuldade === d ? ' selected' : '') + '>' + DIF[d][0] + ' (+' + DIF[d][1] + ' XP)</option>'; }).join('') + '</select></label>' +
      '<label class="campo">Tipo<select name="categoria">' + Object.keys(CAT).map(function (c) { return '<option value="' + c + '"' + (t.categoria === c ? ' selected' : '') + '>' + CAT[c] + '</option>'; }).join('') + '</select></label></div>',
      [t.id ? ['Excluir', 'perigo', function () { return api('tarefa_excluir', { id: t.id }).then(function (r) { atualizarHud(r.jogo); depois && depois(); }); }] : null,
       ['Salvar', 'cheio', function (f) { return api('tarefa_salvar', { id: t.id || 0, titulo: f.titulo.value, data: f.data.value, dificuldade: +f.dificuldade.value, categoria: f.categoria.value }).then(function () { depois && depois(); }); }]]);
  }

  function modal(html, acoes) {
    var fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML = '<form class="modal">' + html + '<div class="linha" style="justify-content:flex-end"><button type="button" class="btn" data-fechar>Cancelar</button></div></form>';
    var form = $('form', fundo), barra = $('.linha:last-child', form);
    (acoes || []).filter(Boolean).forEach(function (a) {
      var b = document.createElement('button');
      b.type = a[1] === 'cheio' ? 'submit' : 'button';
      b.className = 'btn ' + a[1];
      b.textContent = a[0];
      if (a[1] !== 'cheio') b.addEventListener('click', function () { a[2](form).then(fechar); });
      barra.appendChild(b);
    });
    var principal = (acoes || []).filter(function (a) { return a && a[1] === 'cheio'; })[0];
    form.addEventListener('submit', function (e) { e.preventDefault(); if (principal) principal[2](form).then(fechar); });
    function fechar() { fundo.remove(); }
    $('[data-fechar]', fundo).addEventListener('click', fechar);
    fundo.addEventListener('click', function (e) { if (e.target === fundo) fechar(); });
    document.body.appendChild(fundo);
    var primeiro = $('input, textarea', form);
    if (primeiro) primeiro.focus();
    return form;
  }

  // ================================================================ telas
  var TELAS = {};
  /** Troca o contêiner da tela por um novo, sem os ouvintes da renderização anterior. */
  function novo(el) { var n = el.cloneNode(false); if (el.parentNode) el.parentNode.replaceChild(n, el); return n; }

  TELAS.hoje = function (tela) {
    tela = novo(tela);
    api('hoje').then(function (d) {
      atualizarHud(d.jogo);
      var hora = new Date().getHours();
      var saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
      var feitas = d.tarefas.filter(function (t) { return +t.feita; }).length;
      var exercicios = d.treino && d.treino.exercicios ? d.treino.exercicios.split('\n').filter(Boolean) : [];
      tela.innerHTML =
        '<div class="cabeca-pagina"><div><h1>' + saudacao + ', Hiago.</h1><p>' + DIAS_LONGO[new Date().getDay()] + ', ' + new Date().toLocaleDateString('pt-BR') + ' · ' + feitas + '/' + d.tarefas.length + ' missões concluídas</p></div>' +
        '<button class="btn cheio" data-nova>' + ico('mais') + ' Missão</button></div>' +
        '<div class="grade">' +
        '<section class="painel c-7"><header><h2 class="titulo-pixel">Missões de hoje</h2></header><ul class="lista" id="l-tarefas">' +
        (d.tarefas.length ? d.tarefas.map(function (t) { return itemTarefa(t, t.data !== d.data); }).join('') : '<li class="vazio">Nenhuma missão hoje. Planeje a semana em Missões.</li>') + '</ul></section>' +
        '<section class="painel c-5"><header><h2 class="titulo-pixel">Hábitos</h2><span class="mini">+5 XP cada · combo +20</span></header><ul class="lista" id="l-habitos">' +
        d.habitos.map(function (h) { return '<li class="item ' + (+h.feito ? 'feito' : '') + '"><button class="check" data-habito="' + h.id + '">' + ico('check') + '</button><div class="item-titulo">' + esc(h.nome) + '</div></li>'; }).join('') + '</ul></section>' +
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Treino: ' + esc(d.treino ? d.treino.titulo : '—') + '</h2><a class="btn pequeno" href="#saude">Ver plano</a></header>' +
        (exercicios.length ? '<ul class="exercicios">' + exercicios.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="suave">Dia de descanso. Recupere as energias.</p>') + '</section>' +
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Refeições</h2><span class="mini">+2 XP cada</span></header><ul class="lista">' +
        d.refeicoes.map(function (r) { return '<li class="item ' + (+r.feita ? 'feito' : '') + '"><button class="check" data-refeicao="' + r.id + '">' + ico('check') + '</button><div class="item-titulo">' + esc(r.horario) + ' · ' + esc(r.nome) + '<small>' + esc(r.descricao) + '</small></div></li>'; }).join('') + '</ul></section>' +
        (d.lendo.length ? '<section class="painel c-12"><header><h2 class="titulo-pixel">Lendo agora</h2><a class="btn pequeno" href="#estudos">Estudos</a></header><p>' + d.lendo.map(function (l) { return '<strong>' + esc(l.titulo) + '</strong> <span class="suave">' + esc(l.autor || '') + '</span>'; }).join(' · ') + '</p></section>' : '') +
        '</div>';
      $('[data-nova]', tela).addEventListener('click', function () { editarTarefa({ data: d.data, dificuldade: 2, categoria: 'geral' }, function () { TELAS.hoje(tela); }); });
      ligarTarefas(tela, function () { return d.tarefas; }, null, function () { TELAS.hoje(tela); });
      tela.addEventListener('click', function (e) {
        var h = e.target.closest('[data-habito]'), r = e.target.closest('[data-refeicao]');
        var b = h || r;
        if (!b) return;
        var li = b.closest('.item'), on = !li.classList.contains('feito');
        li.classList.toggle('feito', on);
        (h ? api('habito_marcar', { id: +h.dataset.habito, feito: on }) : api('refeicao_marcar', { id: +r.dataset.refeicao, feita: on }))
          .then(function (res) { recompensa(res, b); });
      });
    });
  };

  TELAS.semana = function (tela, inicio) {
    tela = novo(tela);
    inicio = inicio || segunda(iso(new Date()));
    api('semana&inicio=' + inicio).then(function (d) {
      var hoje = iso(new Date()), todas = d.tarefas.concat(d.sem_data);
      var dias = [];
      for (var i = 0; i < 7; i++) dias.push(somaDias(inicio, i));
      var xpSemana = d.tarefas.filter(function (t) { return +t.feita; }).reduce(function (s, t) { return s + DIF[t.dificuldade][1]; }, 0);
      tela.innerHTML =
        '<div class="cabeca-pagina"><div><h1>Missões da semana</h1><p>' + br(d.inicio) + ' a ' + br(d.fim) + ' · ' + xpSemana + ' XP conquistados. No domingo, planeje tudo aqui.</p></div>' +
        '<div class="linha"><button class="btn-ico" data-sem="-7">' + ico('esq') + '</button><button class="btn pequeno" data-sem="0">Esta semana</button><button class="btn-ico" data-sem="7">' + ico('dir') + '</button></div></div>' +
        '<div class="semana">' + dias.map(function (dia) {
          var ts = d.tarefas.filter(function (t) { return t.data === dia; });
          var ok = ts.filter(function (t) { return +t.feita; }).length;
          return '<div class="dia ' + (dia === hoje ? 'hoje' : '') + '"><h3>' + DIAS[deIso(dia).getDay()] + ' <span>' + br(dia) + '</span></h3>' +
            '<div class="progresso-dia"><i style="width:' + (ts.length ? ok / ts.length * 100 : 0) + '%"></i></div>' +
            '<ul class="lista">' + ts.map(function (t) { return itemTarefa(t, false); }).join('') + '</ul>' +
            '<form data-add="' + dia + '"><input placeholder="+ nova missão" aria-label="Nova missão em ' + br(dia) + '"></form></div>';
        }).join('') + '</div>' +
        '<section class="painel" style="margin-top:18px"><header><h2 class="titulo-pixel">Sem data</h2><span class="mini">Ideias e missões para encaixar depois</span></header>' +
        '<ul class="lista">' + (d.sem_data.length ? d.sem_data.map(function (t) { return itemTarefa(t, false); }).join('') : '<li class="vazio">Vazio.</li>') + '</ul>' +
        '<form data-add="" style="margin-top:10px"><input placeholder="+ missão sem data"></form></section>';
      var recarregar = function () { TELAS.semana(tela, inicio); };
      ligarTarefas(tela, function () { return todas; }, null, recarregar);
      $$('[data-sem]', tela).forEach(function (b) { b.addEventListener('click', function () { TELAS.semana(tela, +b.dataset.sem ? somaDias(inicio, +b.dataset.sem) : null); }); });
      $$('form[data-add]', tela).forEach(function (f) {
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          var v = $('input', f).value.trim();
          if (!v) return;
          api('tarefa_salvar', { titulo: v, data: f.dataset.add || null, dificuldade: 2, categoria: 'geral' }).then(recarregar);
        });
      });
    });
  };

  function abasSaude(aba) {
    return '<div class="cabeca-pagina"><div><h1>Saúde</h1><p>Diário de comida, treino, cardápio e peso.</p></div></div>' +
      '<div class="abas">' + [['diario', 'Diário de comida'], ['treino', 'Treino'], ['dieta', 'Cardápio'], ['peso', 'Peso']].map(function (a) { return '<button class="aba ' + (aba === a[0] ? 'ativa' : '') + '" data-aba="' + a[0] + '">' + a[1] + '</button>'; }).join('') + '</div>';
  }
  function ligarAbasSaude(tela) {
    $$('[data-aba]', tela).forEach(function (b) { b.addEventListener('click', function () { TELAS.saude.aba = b.dataset.aba; TELAS.saude(tela); }); });
  }

  TELAS.saude = function (tela) {
    tela = novo(tela);
    var abaAtual = (TELAS.saude.aba = TELAS.saude.aba || 'diario');
    if (abaAtual === 'diario') { diarioComida(tela); return; }
    api('saude').then(function (d) {
      var hojeDia = new Date().getDay();
      var aba = abaAtual;
      var html = abasSaude(aba);
      if (aba === 'treino') {
        html += '<div class="grade">' + [1, 2, 3, 4, 5, 6, 0].map(function (n) {
          var t = d.treino.filter(function (x) { return +x.dia === n; })[0] || { dia: n, titulo: 'Descanso', exercicios: '' };
          return '<section class="painel c-4" style="' + (n === hojeDia ? 'border-color:var(--acento)' : '') + '"><header><h2 class="titulo-pixel">' + DIAS_LONGO[n] + '</h2><button class="btn-ico" data-treino="' + n + '">' + ico('editar') + '</button></header>' +
            '<strong>' + esc(t.titulo) + '</strong><div class="treino-dia suave">' + esc(t.exercicios) + '</div></section>';
        }).join('') + '</div>';
      } else if (aba === 'dieta') {
        html += '<section class="painel"><header><h2 class="titulo-pixel">Cardápio base · ~2.200 kcal</h2><button class="btn pequeno" data-ref="0">' + ico('mais') + ' Refeição</button></header><ul class="lista">' +
          d.refeicoes.map(function (r) { return '<li class="item"><div class="item-titulo"><strong>' + esc(r.horario) + ' · ' + esc(r.nome) + '</strong><small>' + esc(r.descricao) + '</small></div><button class="btn-ico" data-ref="' + r.id + '">' + ico('editar') + '</button></li>'; }).join('') +
          '</ul><p class="mini">Isto é um guia geral, não um acompanhamento nutricional.</p></section>';
      } else {
        html += '<div class="grade"><section class="painel c-4"><header><h2 class="titulo-pixel">Registrar</h2><span class="mini">+5 XP</span></header>' +
          '<form data-peso class="form-pilha" style="display:grid;gap:10px"><label class="campo">Peso (kg)<input name="kg" inputmode="decimal" required placeholder="87,0"></label>' +
          '<label class="campo">Data<input type="date" name="data" value="' + iso(new Date()) + '"></label><button class="btn cheio">Salvar</button></form></section>' +
          '<section class="painel c-8"><header><h2 class="titulo-pixel">Evolução</h2></header>' + graficoPeso(d.pesos.slice().reverse()) +
          '<ul class="lista" style="margin-top:10px">' + d.pesos.slice(0, 8).map(function (p) { return '<li class="item"><div class="item-titulo">' + br(p.data) + '/' + p.data.slice(0, 4) + '</div><span class="xp-tag">' + String(p.kg).replace('.', ',') + ' kg</span><button class="btn-ico" data-del-peso="' + p.data + '">' + ico('lixo') + '</button></li>'; }).join('') + '</ul></section></div>';
      }
      tela.innerHTML = html;
      ligarAbasSaude(tela);
      $$('[data-treino]', tela).forEach(function (b) {
        b.addEventListener('click', function () {
          var n = +b.dataset.treino, t = d.treino.filter(function (x) { return +x.dia === n; })[0] || { titulo: '', exercicios: '' };
          modal('<h2 class="titulo-pixel">Treino de ' + DIAS_LONGO[n] + '</h2><label class="campo">Nome<input name="titulo" value="' + esc(t.titulo) + '"></label><label class="campo">Exercícios (um por linha)<textarea name="ex" rows="8">' + esc(t.exercicios) + '</textarea></label>',
            [['Salvar', 'cheio', function (f) { return api('treino_salvar', { dia: n, titulo: f.titulo.value, exercicios: f.ex.value }).then(function () { TELAS.saude(tela); }); }]]);
        });
      });
      $$('[data-ref]', tela).forEach(function (b) {
        b.addEventListener('click', function () {
          var id = +b.dataset.ref, r = d.refeicoes.filter(function (x) { return +x.id === id; })[0] || { nome: '', horario: '', descricao: '' };
          modal('<h2 class="titulo-pixel">' + (id ? 'Editar refeição' : 'Nova refeição') + '</h2><div class="form-grade"><label class="campo">Nome<input name="nome" value="' + esc(r.nome) + '"></label><label class="campo">Horário<input name="horario" value="' + esc(r.horario) + '" placeholder="12:00"></label></div><label class="campo">O que comer<textarea name="descricao">' + esc(r.descricao) + '</textarea></label>',
            [id ? ['Excluir', 'perigo', function () { return api('refeicao_excluir', { id: id }).then(function () { TELAS.saude(tela); }); }] : null,
             ['Salvar', 'cheio', function (f) { return api('refeicao_salvar', { id: id, nome: f.nome.value, horario: f.horario.value, descricao: f.descricao.value }).then(function () { TELAS.saude(tela); }); }]]);
        });
      });
      var fp = $('[data-peso]', tela);
      if (fp) fp.addEventListener('submit', function (e) { e.preventDefault(); api('peso_salvar', { kg: fp.kg.value, data: fp.data.value }).then(function (r) { recompensa(r, $('button', fp)); TELAS.saude(tela); }); });
      $$('[data-del-peso]', tela).forEach(function (b) { b.addEventListener('click', function () { api('peso_excluir', { data: b.dataset.delPeso }).then(function () { TELAS.saude(tela); }); }); });
    });
  };

  function diarioComida(tela, inicio) {
    inicio = inicio || segunda(iso(new Date()));
    api('comidas&inicio=' + inicio).then(function (d) {
      var hoje = iso(new Date()), dias = [];
      for (var i = 0; i < 7; i++) dias.push(somaDias(inicio, i));
      var soma = function (lista, campo) { return lista.reduce(function (s, c) { return s + (+c[campo] || 0); }, 0); };
      var doDia = function (dia) { return d.comidas.filter(function (c) { return c.data === dia; }); };
      var hojeL = doDia(hoje);
      var registrados = dias.filter(function (x) { return doDia(x).length; });
      var mediaK = registrados.length ? Math.round(registrados.reduce(function (s, x) { return s + soma(doDia(x), 'kcal'); }, 0) / registrados.length) : 0;
      var mediaP = registrados.length ? Math.round(registrados.reduce(function (s, x) { return s + soma(doDia(x), 'proteina'); }, 0) / registrados.length) : 0;
      var maxK = Math.max(d.meta_kcal * 1.3, Math.max.apply(null, dias.map(function (x) { return soma(doDia(x), 'kcal'); })));
      var macro = function (rot, v, un) { return '<div><b>' + Math.round(v) + '</b>' + un + ' ' + rot + '</div>'; };
      tela.innerHTML = abasSaude('diario') +
        '<div class="grade"><section class="painel c-7"><header><h2 class="titulo-pixel">O que você comeu?</h2><span class="mini">+2 XP por registro</span></header>' +
        '<form data-comer class="linha"><input class="cresce" name="desc" placeholder="Ex.: 2 ovos mexidos, 1 pão francês e café com leite" required><input type="date" name="data" value="' + (inicio <= hoje && hoje <= dias[6] ? hoje : dias[0]) + '" style="max-width:170px"><button class="btn cheio">Registrar</button></form>' +
        '<p class="mini">O Jarvis estima calorias e macros com IA. São valores aproximados.</p>' +
        '<h3 class="titulo-pixel" style="margin:14px 0 10px">Hoje</h3><div class="macros">' + macro('kcal', soma(hojeL, 'kcal'), '') + macro('prot.', soma(hojeL, 'proteina'), 'g') + macro('carbo', soma(hojeL, 'carbo'), 'g') + macro('gord.', soma(hojeL, 'gordura'), 'g') + '</div>' +
        '<ul class="lista" style="margin-top:10px">' + (hojeL.length ? hojeL.map(function (c) {
          var itens = []; try { itens = JSON.parse(c.itens || '[]'); } catch (e) {}
          return '<li class="item"><div class="item-titulo">' + esc(c.descricao) + '<small>' + itens.map(function (x) { return esc(x.nome) + (x.quantidade ? ' (' + esc(x.quantidade) + ')' : '') + ' ~' + Math.round(x.kcal) + ' kcal'; }).join(' · ') + '</small></div><span class="xp-tag">' + Math.round(c.kcal) + ' kcal</span><button class="btn-ico" data-del-comida="' + c.id + '">' + ico('lixo') + '</button></li>';
        }).join('') : '<li class="vazio">Nada registrado hoje.</li>') + '</ul></section>' +
        '<section class="painel c-5"><header><h2 class="titulo-pixel">Semana</h2><div class="linha"><button class="btn-ico" data-sem="-7">' + ico('esq') + '</button><button class="btn-ico" data-sem="7">' + ico('dir') + '</button></div></header>' +
        '<p class="mini">' + br(d.inicio) + ' a ' + br(d.fim) + ' · média ' + mediaK + ' kcal e ' + mediaP + ' g de proteína nos dias registrados</p>' +
        '<div class="barras-kcal"><div class="meta" style="bottom:' + (d.meta_kcal / maxK * 140 + 24) + 'px"><span>meta ' + d.meta_kcal + '</span></div>' +
        dias.map(function (x) { var k = soma(doDia(x), 'kcal'); return '<div class="b"><span>' + (k ? Math.round(k) : '') + '</span><i class="' + (k > d.meta_kcal * 1.1 ? 'acima' : '') + '" style="height:' + (k / maxK * 140) + 'px"></i>' + DIAS[deIso(x).getDay()] + '</div>'; }).join('') + '</div>' +
        '<form data-metas class="linha" style="margin-top:12px"><label class="campo cresce">Meta kcal<input name="kcal" type="number" value="' + d.meta_kcal + '"></label><label class="campo cresce">Meta proteína (g)<input name="prot" type="number" value="' + d.meta_proteina + '"></label><button class="btn pequeno" style="align-self:end">Salvar</button></form>' +
        '<button class="btn" data-balanco style="margin-top:12px">' + ico('jarvis') + ' Balanço da semana</button>' +
        '<div class="opiniao" data-bal style="margin-top:10px"' + (d.balanco ? '' : ' hidden') + '>' + esc(d.balanco ? d.balanco.texto : '') + '</div></section></div>';
      ligarAbasSaude(tela);
      var recarregar = function () { var n = novo(tela); diarioComida(n, inicio); };
      var f = $('[data-comer]', tela);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var b = $('button', f); b.disabled = true; b.textContent = 'Calculando...';
        api('comida_adicionar', { descricao: f.desc.value, data: f.data.value }).then(function (r) { recompensa(r, b); recarregar(); })
          .catch(function () { b.disabled = false; b.textContent = 'Registrar'; });
      });
      $$('[data-del-comida]', tela).forEach(function (b) { b.addEventListener('click', function () { api('comida_excluir', { id: +b.dataset.delComida }).then(recarregar); }); });
      $$('[data-sem]', tela).forEach(function (b) { b.addEventListener('click', function () { diarioComida(novo(tela), somaDias(inicio, +b.dataset.sem)); }); });
      var fm = $('[data-metas]', tela);
      fm.addEventListener('submit', function (e) { e.preventDefault(); api('metas_salvar', { kcal: +fm.kcal.value, proteina: +fm.prot.value }).then(function () { toast('Metas salvas.'); recarregar(); }); });
      var bb = $('[data-balanco]', tela);
      bb.addEventListener('click', function () {
        bb.disabled = true; bb.textContent = 'Jarvis analisando a semana...';
        api('comida_balanco', { inicio: inicio }).then(function (r) { var o = $('[data-bal]', tela); o.hidden = false; o.textContent = r.texto; })
          .catch(function () {}).then(function () { bb.disabled = false; bb.innerHTML = ico('jarvis') + ' Balanço da semana'; });
      });
    });
  }

  function graficoPeso(p) {
    if (p.length < 2) return '<p class="vazio">Registre pelo menos 2 pesagens para ver o gráfico.</p>';
    var W = 600, H = 180, m = 30, kgs = p.map(function (x) { return +x.kg; });
    var min = Math.floor(Math.min.apply(null, kgs) - 1), max = Math.ceil(Math.max.apply(null, kgs) + 1);
    var x = function (i) { return m + i * (W - 2 * m) / (p.length - 1); }, y = function (v) { return H - m + 10 - (v - min) / (max - min) * (H - 2 * m); };
    var pts = p.map(function (q, i) { return x(i).toFixed(1) + ',' + y(+q.kg).toFixed(1); }).join(' ');
    return '<svg class="grafico-peso" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico de peso">' +
      '<text x="2" y="' + (y(max) + 4) + '">' + max + '</text><text x="2" y="' + (y(min) + 4) + '">' + min + '</text>' +
      '<polyline class="linha-peso" points="' + pts + '"/>' + p.map(function (q, i) { return '<rect class="ponto" x="' + (x(i) - 3) + '" y="' + (y(+q.kg) - 3) + '" width="6" height="6"><title>' + br(q.data) + ': ' + q.kg + ' kg</title></rect>'; }).join('') +
      '<text x="' + m + '" y="' + (H - 2) + '">' + br(p[0].data) + '</text><text x="' + (W - m - 30) + '" y="' + (H - 2) + '">' + br(p[p.length - 1].data) + '</text></svg>';
  }

  TELAS.estudos = function (tela) {
    tela = novo(tela);
    api('estudos').then(function (d) {
      var ST = { a_fazer: 'A fazer', estudando: 'Estudando', feito: 'Feito' }, LV = { quero: 'Quero ler', lendo: 'Lendo', lido: 'Lido' };
      tela.innerHTML =
        '<div class="cabeca-pagina"><div><h1>Estudos e leituras</h1><p>Livro lido vale +100 XP. Escreva o resumo e peça a opinião do Jarvis.</p></div></div>' +
        '<div class="grade"><section class="painel c-5"><header><h2 class="titulo-pixel">Trilha de estudos</h2><button class="btn pequeno" data-estudo="0">' + ico('mais') + ' Novo</button></header><ul class="lista">' +
        d.estudos.map(function (s) { return '<li class="item ' + (s.status === 'feito' ? 'feito' : '') + '"><div class="item-titulo"><strong>' + esc(s.titulo) + '</strong><small>' + esc(s.detalhe || '') + '</small></div><span class="selo ' + (s.status === 'estudando' ? 'lendo' : s.status === 'feito' ? 'lido' : '') + '">' + ST[s.status] + '</span><button class="btn-ico" data-estudo="' + s.id + '">' + ico('editar') + '</button></li>'; }).join('') +
        '</ul></section><section class="painel c-7"><header><h2 class="titulo-pixel">Estante</h2><button class="btn pequeno" data-livro="0">' + ico('mais') + ' Livro</button></header><div class="livros">' +
        d.livros.map(function (l) { return '<div class="livro" data-livro="' + l.id + '"><span class="selo ' + l.status + '">' + LV[l.status] + '</span><strong>' + esc(l.titulo) + '</strong><span class="suave">' + esc(l.autor || '') + '</span>' + (l.nota ? '<span class="estrelas">' + '★'.repeat(l.nota) + '☆'.repeat(5 - l.nota) + '</span>' : '') + (l.opiniao_ia ? '<span class="mini">💬 Jarvis comentou</span>' : '') + '</div>'; }).join('') +
        '</div></section></div>';
      tela.addEventListener('click', function (e) {
        var es = e.target.closest('[data-estudo]');
        if (es) {
          var id = +es.dataset.estudo, s = d.estudos.filter(function (x) { return +x.id === id; })[0] || { titulo: '', detalhe: '', status: 'a_fazer' };
          modal('<h2 class="titulo-pixel">' + (id ? 'Editar estudo' : 'Novo estudo') + '</h2><label class="campo">O quê<input name="titulo" value="' + esc(s.titulo) + '"></label><label class="campo">Onde / detalhe<input name="detalhe" value="' + esc(s.detalhe || '') + '" placeholder="Ex.: Curso em Vídeo"></label>' +
            '<label class="campo">Status<select name="status">' + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (s.status === k ? ' selected' : '') + '>' + ST[k] + '</option>'; }).join('') + '</select></label>',
            [id ? ['Excluir', 'perigo', function () { return api('estudo_excluir', { id: id }).then(function () { TELAS.estudos(tela); }); }] : null,
             ['Salvar', 'cheio', function (f) { return api('estudo_salvar', { id: id, titulo: f.titulo.value, detalhe: f.detalhe.value, status: f.status.value }).then(function () { TELAS.estudos(tela); }); }]]);
          return;
        }
        var lv = e.target.closest('[data-livro]');
        if (lv) abrirLivro(+lv.dataset.livro, d.livros, tela);
      });
    });
  };

  function abrirLivro(id, livros, tela) {
    var l = livros.filter(function (x) { return +x.id === id; })[0] || { titulo: '', autor: '', status: 'quero', nota: 0, resumo: '', opiniao_ia: '' };
    var nota = +l.nota || 0;
    var form = modal('<h2 class="titulo-pixel">' + (id ? 'Livro' : 'Novo livro') + '</h2>' +
      '<div class="form-grade"><label class="campo">Título<input name="titulo" value="' + esc(l.titulo) + '"></label><label class="campo">Autor<input name="autor" value="' + esc(l.autor || '') + '"></label>' +
      '<label class="campo">Status<select name="status"><option value="quero">Quero ler</option><option value="lendo">Lendo</option><option value="lido">Lido (+100 XP)</option></select></label></div>' +
      '<div class="campo"><span>Nota</span><div class="estrelas" data-estrelas>' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-n="' + n + '" class="' + (n <= nota ? 'on' : '') + '">★</button>'; }).join('') + '</div></div>' +
      '<label class="campo">Meu resumo (escreva sem olhar o livro, ajuda a memória)<textarea name="resumo" rows="7">' + esc(l.resumo || '') + '</textarea></label>' +
      (id ? '<div><button type="button" class="btn" data-opiniao>' + ico('jarvis') + ' Opinião do Jarvis</button></div>' : '') +
      '<div class="opiniao" data-op ' + (l.opiniao_ia ? '' : 'hidden') + '>' + esc(l.opiniao_ia || '') + '</div>',
      [id ? ['Excluir', 'perigo', function () { return api('livro_excluir', { id: id }).then(function () { TELAS.estudos(tela); }); }] : null,
       ['Salvar', 'cheio', function (f) { return api('livro_salvar', { id: id, titulo: f.titulo.value, autor: f.autor.value, status: f.status.value, nota: nota, resumo: f.resumo.value }).then(function (r) { recompensa(r); TELAS.estudos(tela); }); }]]);
    form.status.value = l.status;
    $$('[data-n]', form).forEach(function (b) {
      b.addEventListener('click', function () { nota = +b.dataset.n; $$('[data-n]', form).forEach(function (x) { x.classList.toggle('on', +x.dataset.n <= nota); }); });
    });
    var bo = $('[data-opiniao]', form);
    if (bo) bo.addEventListener('click', function () {
      bo.disabled = true; bo.textContent = 'Jarvis lendo seu resumo...';
      api('livro_salvar', { id: id, titulo: form.titulo.value, autor: form.autor.value, status: form.status.value, nota: nota, resumo: form.resumo.value })
        .then(function () { return api('livro_opiniao', { id: id }); })
        .then(function (r) { var op = $('[data-op]', form); op.hidden = false; op.textContent = r.opiniao; })
        .catch(function () {})
        .then(function () { bo.disabled = false; bo.innerHTML = ico('jarvis') + ' Opinião do Jarvis'; });
    });
  }

  // ================================================================ Jardim
  var ESPECIES = [
    { nome: 'Carvalho', copa: ['#2f7d32', '#43a047', '#1b5e20'], fruto: '#e53935', tronco: '#6d4c41' },
    { nome: 'Cerejeira', copa: ['#f48fb1', '#f8bbd0', '#ec407a'], fruto: '#ffffff', tronco: '#5d4037' },
    { nome: 'Ipê-amarelo', copa: ['#fbc02d', '#ffee58', '#f57f17'], fruto: '#fff59d', tronco: '#6d4c41' },
    { nome: 'Pinheiro', copa: ['#1b5e20', '#2e7d32', '#0d3b12'], fruto: '#8d6e63', tronco: '#4e342e' },
    { nome: 'Jabuticabeira', copa: ['#388e3c', '#66bb6a', '#1b5e20'], fruto: '#4a148c', tronco: '#8d6e63' },
    { nome: 'Árvore-cristal', copa: ['#26c6da', '#80deea', '#00838f'], fruto: '#ffffff', tronco: '#455a64' }
  ];
  var ESTAGIOS = ['Terra preparada', 'Semente', 'Broto', 'Muda', 'Muda forte', 'Árvore jovem', 'Árvore', 'Árvore lendária'];
  function arvoreSvg(estagio, especie, semente) {
    var e = ESPECIES[especie % ESPECIES.length], px = [], W = 24, H = 24;
    var p = function (x, y, c, w, h) { px.push('<rect x="' + x + '" y="' + y + '" width="' + (w || 1) + '" height="' + (h || 1) + '" fill="' + c + '"/>'); };
    // chão
    p(0, 21, '#5d4037', W, 3); p(0, 21, '#795548', W, 1);
    if (estagio === 0) { p(9, 20, '#4e342e', 6, 1); }
    if (estagio === 1) { p(11, 20, '#a1887f', 2, 1); p(11, 19, '#8d6e63', 2, 1); }
    if (estagio >= 2 && estagio <= 4) {
      var h = estagio === 2 ? 3 : estagio === 3 ? 6 : 9;
      p(11, 21 - h, '#558b2f', 1, h);
      p(9, 21 - h, '#7cb342', 2, 1); p(12, 21 - h + 1, '#7cb342', 2, 1);
      if (estagio >= 3) { p(8, 21 - h + 3, '#8bc34a', 3, 1); p(12, 21 - h + 4, '#8bc34a', 3, 1); }
      if (estagio === 4) { p(9, 21 - h - 1, '#9ccc65', 5, 2); }
    }
    if (estagio >= 5) {
      var grande = estagio >= 6;
      var topo = grande ? 2 : 6, tronco = grande ? 3 : 2;
      p(12 - Math.floor(tronco / 2), 13, e.tronco, tronco, 8);
      if (e.nome === 'Pinheiro') {
        for (var i = 0; i < (grande ? 5 : 4); i++) { var w = 3 + i * 3; p(12 - Math.floor(w / 2), topo + i * 2, e.copa[i % 2 ? 1 : 0], w, 3); }
      } else {
        var r = grande ? 8 : 6, cx = 12, cy = topo + r;
        for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) {
          var d = x * x + y * y;
          if (d <= r * r - (grande ? 6 : 3)) p(cx + x, cy + y - 1, ((x * 7 + y * 13 + semente) % 5 === 0) ? e.copa[2] : (y < -2 ? e.copa[1] : e.copa[0]));
        }
      }
      if (estagio === 7) {
        [[7, 6], [15, 5], [10, 10], [16, 11], [6, 12], [13, 8], [9, 4]].forEach(function (f) { p(f[0], f[1], e.fruto, 2, 2); });
        p(18, 1, '#ffd23f'); p(4, 3, '#ffd23f'); p(20, 7, '#ffd23f');
      }
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" shape-rendering="crispEdges">' + px.join('') + '</svg>';
  }

  TELAS.jardim = function (tela) {
    tela = novo(tela);
    api('jardim').then(function (d) {
      var arv = d.arvores.slice().reverse(), atual = arv[0];
      var est = function (a) { return Math.min(7, a.regados); };
      var cena = arv.slice(0, 12).reverse();
      var larg = Math.max(12, cena.length) * 24;
      var estrelas = '';
      for (var i = 0; i < 40; i++) estrelas += '<rect x="' + ((i * 37) % larg) + '" y="' + ((i * 17) % 50) + '" width="1" height="1" fill="#fff" opacity="' + (.3 + (i % 5) / 8) + '"/>';
      tela.innerHTML = '<div class="cabeca-pagina"><div><h1>Meu Jardim</h1><p>Cada semana planta uma árvore: o seu cérebro. Todo dia com pelo menos <strong>' + d.meta + ' XP</strong> aduba a árvore. Com 7 dias, ela fica lendária.</p></div></div>' +
        '<section class="jardim"><svg class="cena" viewBox="0 0 ' + larg + ' 96" shape-rendering="crispEdges">' + estrelas +
        '<rect x="' + (larg - 30) + '" y="8" width="10" height="10" fill="#fff4c2"/><rect x="' + (larg - 27) + '" y="8" width="7" height="7" fill="#1d2f5a"/>' +
        cena.map(function (a, i) { return '<svg x="' + (i * 24) + '" y="42" width="24" height="54" viewBox="0 0 24 24" preserveAspectRatio="xMidYMax meet">' + arvoreSvg(est(a), a.semana, a.semana).replace(/^<svg[^>]*>|<\/svg>$/g, '') + '</svg>'; }).join('') +
        '</svg></section>' +
        '<div class="grade" style="margin-top:18px"><section class="painel c-5"><header><h2 class="titulo-pixel">Esta semana</h2><span class="selo lido">' + ESPECIES[atual.semana % ESPECIES.length].nome + '</span></header>' +
        '<div class="arvore atual">' + arvoreSvg(est(atual), atual.semana, atual.semana) + '<strong>' + ESTAGIOS[est(atual)] + '</strong>' +
        '<div class="gotas">' + atual.dias.map(function (x) { return '<i class="' + (x.regado ? 'on' : '') + (x.futuro ? ' futuro' : '') + '" title="' + br(x.data) + ': ' + x.xp + ' XP"></i>'; }).join('') + '</div>' +
        '<p class="mini">' + atual.regados + ' de 7 dias adubados</p></div></section>' +
        '<section class="painel c-7"><header><h2 class="titulo-pixel">Floresta</h2><span class="mini">' + arv.length + ' árvore(s)</span></header><div class="arvores">' +
        arv.map(function (a, i) { return '<div class="arvore ' + (i === 0 ? 'atual' : '') + '">' + arvoreSvg(est(a), a.semana, a.semana) + '<strong>' + br(a.inicio) + '</strong><div class="mini">' + ESPECIES[a.semana % ESPECIES.length].nome + ' · ' + ESTAGIOS[est(a)] + '</div></div>'; }).join('') +
        '</div></section></div>';
    });
  };

  TELAS.jarvis = function (tela) {
    tela = novo(tela);
    api('chat').then(function (d) {
      tela.innerHTML = '<div class="cabeca-pagina"><div><h1>Jarvis</h1><p>Seu assistente sabe das suas missões, treino e leituras.</p></div><button class="btn pequeno" data-limpar>Limpar conversa</button></div>' +
        '<section class="painel chat">' +
        (d.configurado ? '' : '<p class="opiniao">Para conversar, coloque a chave grátis do Gemini em <a href="#ajustes">Ajustes</a>.</p>') +
        '<div class="chat-msgs" id="msgs">' + (d.mensagens.length ? d.mensagens.map(msgHtml).join('') : '<div class="msg model">Às suas ordens, Hiago. Quer que eu organize o seu dia?</div>') + '</div>' +
        '<form><input name="t" placeholder="Fale com o Jarvis..." autocomplete="off"><button class="btn cheio">Enviar</button></form></section>';
      var msgs = $('#msgs'), f = $('form', tela);
      msgs.scrollTop = msgs.scrollHeight;
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var t = f.t.value.trim();
        if (!t) return;
        f.t.value = '';
        msgs.insertAdjacentHTML('beforeend', msgHtml({ papel: 'user', texto: t }) + '<div class="msg model digitando" id="pensando">Processando</div>');
        msgs.scrollTop = msgs.scrollHeight;
        api('chat_enviar', { texto: t }).then(function (r) {
          $('#pensando').outerHTML = msgHtml({ papel: 'model', texto: r.resposta });
          msgs.scrollTop = msgs.scrollHeight;
        }).catch(function () { var p = $('#pensando'); if (p) p.remove(); });
      });
      $('[data-limpar]', tela).addEventListener('click', function () { api('chat_limpar', {}).then(function () { TELAS.jarvis(tela); }); });
    });
  };
  function msgHtml(m) { return '<div class="msg ' + (m.papel === 'user' ? 'user' : 'model') + '">' + esc(m.texto) + '</div>'; }

  TELAS.loja = function (tela) {
    tela = novo(tela);
    api('jogo').then(function (d) {
      atualizarHud(d.jogo);
      var eq = d.jogo.equipado, pets = eq.pets || [], grupos = [['tema', 'Temas'], ['pet', 'Mascotes'], ['titulo', 'Títulos'], ['efeito', 'Efeitos']];
      var amostras = { 'tema-hud': ['#060b14', '#00e5ff', '#ffb300'], 'tema-gameboy': ['#0f380f', '#306230', '#9bbc0f'], 'tema-synthwave': ['#12002b', '#ff40c4', '#29f0ff'], 'tema-matrix': ['#000', '#00ff41', '#b6ff00'], 'tema-pergaminho': ['#2a1a10', '#ead7b0', '#8b1e1e'],
        'tema-abismo': ['#000', '#111', '#fff'], 'tema-neon': ['#07070d', '#fcee0a', '#02d7f2'], 'tema-manga': ['#1a0b2e', '#f0c83c', '#ff4fa3'], 'tema-halloween': ['#120a12', '#ff7a1a', '#a663ff'], 'tema-misterio': ['#0a1210', '#c4a05a', '#5fd0b0'] };
      var temProprio = d.itens.some(function (i) { return i.id === 'pet-proprio' && i.possui; });
      var cartao = function (i, g) {
        var ativo = g === 'efeito' ? !!eq[i.id] : g === 'pet' ? pets.indexOf(i.id) >= 0 : eq[g] === i.id;
        var vit = g === 'tema' ? '<div class="amostra-tema">' + (amostras[i.id] || []).map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</div>'
          : g === 'pet' ? (i.id === 'pet-proprio' ? '<span class="mini">suas imagens</span>' : petSvg(i.id))
          : '<span class="titulo-pixel">' + esc(i.nome) + '</span>';
        var acao;
        if (!i.possui) acao = '<button class="btn cheio pequeno" data-comprar="' + i.id + '"' + (d.jogo.moedas < i.preco ? ' disabled' : '') + '>Comprar · ' + i.preco + '</button>';
        else if (i.id === 'pet-proprio') acao = '<label class="btn pequeno">Enviar imagem<input type="file" accept="image/png,image/gif,image/webp,image/jpeg" hidden data-pet-arquivo></label>';
        else if (g === 'tema' || g === 'titulo') acao = ativo ? '<button class="btn pequeno" disabled>Em uso</button>' : '<button class="btn pequeno" data-equipar="' + i.id + '">Usar</button>';
        else acao = '<button class="btn pequeno" data-equipar="' + i.id + '" data-ligar="' + (ativo ? 0 : 1) + '">' + (ativo ? (g === 'pet' ? 'Guardar' : 'Desligar') : (g === 'pet' ? 'Soltar' : 'Ligar')) + '</button>';
        return '<div class="produto ' + (ativo ? 'equipado' : '') + '"><div class="vitrine">' + vit + '</div><strong>' + esc(i.nome) + '</strong><span class="mini">' + esc(i.descricao) + '</span>' +
          '<div class="linha" style="justify-content:space-between">' + (i.possui ? '<span class="selo lido">Seu</span>' : '<span class="preco">' + i.preco + ' 🪙</span>') + acao + '</div></div>';
      };
      tela.innerHTML = '<div class="cabeca-pagina"><div><h1>Loja</h1><p>Gaste as moedas das missões. Você tem <strong style="color:var(--moeda)">' + d.jogo.moedas + '</strong> moedas. Até 3 mascotes andam juntos.</p></div></div>' +
        grupos.map(function (g) {
          var extra = '';
          if (g[0] === 'pet' && temProprio) {
            extra = '<h3 class="titulo-pixel" style="margin:16px 0 10px">Meus mascotes</h3>' + (d.pets_proprios.length ? '<div class="loja">' + d.pets_proprios.map(function (f) {
              var id = 'proprio:' + f, on = pets.indexOf(id) >= 0;
              return '<div class="produto ' + (on ? 'equipado' : '') + '"><div class="vitrine">' + petImg(id) + '</div><div class="linha" style="justify-content:space-between">' +
                '<button class="btn pequeno" data-equipar="' + esc(id) + '" data-ligar="' + (on ? 0 : 1) + '">' + (on ? 'Guardar' : 'Soltar') + '</button><button class="btn-ico" data-pet-apagar="' + esc(f) + '" aria-label="Apagar">' + ico('lixo') + '</button></div></div>';
            }).join('') + '</div>' : '<p class="mini">Envie imagens PNG ou GIF (de preferência com fundo transparente) no cartão "Meus mascotes".</p>');
          }
          return '<section class="painel" style="margin-bottom:16px"><header><h2 class="titulo-pixel">' + g[1] + '</h2></header><div class="loja">' +
            d.itens.filter(function (i) { return i.tipo === g[0]; }).map(function (i) { return cartao(i, g[0]); }).join('') + '</div>' + extra + '</section>';
        }).join('') +
        '<section class="painel"><header><h2 class="titulo-pixel">Últimos XP</h2></header><ul class="lista">' +
        (d.historico.length ? d.historico.map(function (h) { return '<li class="item"><div class="item-titulo">' + esc(h.motivo) + '<small>' + br(h.criado_em) + ' ' + h.criado_em.slice(11, 16) + '</small></div><span class="xp-tag">+' + h.pontos + '</span></li>'; }).join('') : '<li class="vazio">Complete uma missão para ganhar XP.</li>') + '</ul></section>';
      var recarregar = function (r) { if (r && r.jogo) atualizarHud(r.jogo); TELAS.loja(tela); };
      tela.addEventListener('click', function (e) {
        var c = e.target.closest('[data-comprar]'), q = e.target.closest('[data-equipar]'), x = e.target.closest('[data-pet-apagar]');
        if (c) {
          var item = c.dataset.comprar;
          api('comprar', { item: item }).then(function (r) {
            bip([880, 1175]); toast('Item comprado!');
            return item === 'pet-proprio' ? r : api('equipar', { item: item });
          }).then(recarregar);
        } else if (q) api('equipar', { item: q.dataset.equipar, ligar: q.dataset.ligar !== '0' }).then(recarregar);
        else if (x && confirm('Apagar este mascote?')) api('pet_apagar', { arquivo: x.dataset.petApagar }).then(recarregar);
      });
      var arq = $('[data-pet-arquivo]', tela);
      if (arq) arq.addEventListener('change', function () {
        var fd = new FormData(); fd.append('imagem', arq.files[0]);
        api('pet_enviar', fd).then(function (r) { toast('Mascote solto na tela!'); recarregar(r); });
      });
    });
  };

  // ================================================================ Spotify (PKCE, direto do navegador)
  var SP = {
    clientId: '',
    escopos: 'user-read-playback-state user-modify-playback-state user-read-currently-playing user-top-read user-read-recently-played',
    redirect: function () { return location.origin + location.pathname; },
    token: function () { try { return JSON.parse(localStorage.getItem('sp_token') || 'null'); } catch (e) { return null; } },
    salvar: function (t) {
      var antigo = SP.token() || {};
      t.expira = Date.now() + (t.expires_in - 60) * 1000;
      if (!t.refresh_token) t.refresh_token = antigo.refresh_token;
      try { localStorage.setItem('sp_token', JSON.stringify(t)); } catch (e) {}
    },
    conectar: function () {
      var v = aleatorio(64);
      try { localStorage.setItem('sp_verifier', v); } catch (e) {}
      desafio(v).then(function (ch) {
        location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
          client_id: SP.clientId, response_type: 'code', redirect_uri: SP.redirect(), scope: SP.escopos, code_challenge_method: 'S256', code_challenge: ch
        });
      });
    },
    trocarCodigo: function (code) {
      var v = localStorage.getItem('sp_verifier');
      return fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: SP.clientId, grant_type: 'authorization_code', code: code, redirect_uri: SP.redirect(), code_verifier: v }) })
        .then(function (r) { return r.json(); }).then(function (t) { if (t.access_token) SP.salvar(t); else throw new Error(t.error_description || 'Falha no login do Spotify'); });
    },
    renovar: function () {
      var t = SP.token();
      if (!t || !t.refresh_token) return Promise.reject(new Error('sem token'));
      return fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: SP.clientId, grant_type: 'refresh_token', refresh_token: t.refresh_token }) })
        .then(function (r) { return r.json(); }).then(function (n) { if (!n.access_token) throw new Error('renovação falhou'); SP.salvar(n); });
    },
    req: function (caminho, metodo) {
      var t = SP.token();
      if (!t) return Promise.reject(new Error('desconectado'));
      var antes = Date.now() > t.expira ? SP.renovar() : Promise.resolve();
      return antes.then(function () {
        return fetch('https://api.spotify.com/v1' + caminho, { method: metodo || 'GET', headers: { Authorization: 'Bearer ' + SP.token().access_token } });
      }).then(function (r) {
        if (r.status === 204) return null;
        if (r.status === 404 && metodo) { toast('Abra o Spotify em algum aparelho para controlar.', 'erro'); return null; }
        if (r.status === 403 && metodo) { toast('O Spotify recusou o comando (precisa do Premium e de um aparelho ativo).', 'erro'); return null; }
        return r.text().then(function (x) { return x ? JSON.parse(x) : null; });
      });
    },
    sair: function () { try { localStorage.removeItem('sp_token'); } catch (e) {} }
  };
  function aleatorio(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, function (b) { return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]; }).join(''); }
  function desafio(v) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)).then(function (h) {
      return btoa(String.fromCharCode.apply(null, new Uint8Array(h))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    });
  }

  var playerTimer = null;
  function miniPlayer() {
    clearInterval(playerTimer);
    var el = $('#mini-player');
    if (!el) return;
    if (!SP.clientId || !SP.token()) { el.innerHTML = ''; return; }
    var atualizar = function () {
      SP.req('/me/player').then(function (p) {
        if (!p || !p.item) { el.innerHTML = ''; return; }
        el.innerHTML = '<div class="mini-player player"><img src="' + esc((p.item.album.images[2] || p.item.album.images[0] || {}).url) + '" alt="">' +
          '<div class="info"><strong>' + esc(p.item.name) + '</strong><span class="suave">' + esc(p.item.artists.map(function (a) { return a.name; }).join(', ')) + '</span></div>' +
          '<div class="controles"><button class="btn-ico" data-sp="previous">' + ico('ant') + '</button><button class="btn-ico" data-sp="' + (p.is_playing ? 'pause' : 'play') + '">' + ico(p.is_playing ? 'pausa' : 'play') + '</button><button class="btn-ico" data-sp="next">' + ico('prox') + '</button></div></div>';
      }).catch(function () { el.innerHTML = ''; });
    };
    atualizar();
    playerTimer = setInterval(atualizar, 15000);
    if (!el.dataset.ligado) {
      el.dataset.ligado = 1;
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-sp]');
        if (!b) return;
        var a = b.dataset.sp;
        SP.req('/me/player/' + a, a === 'play' || a === 'pause' ? 'PUT' : 'POST').then(function () { setTimeout(atualizar, 500); });
      });
    }
  }

  TELAS.spotify = function (tela) {
    tela = novo(tela);
    if (!SP.clientId) {
      tela.innerHTML = '<div class="cabeca-pagina"><div><h1>Spotify</h1></div></div><section class="painel"><p>Para ligar o Spotify, coloque o <strong>Client ID</strong> em <a href="#ajustes">Ajustes</a>. O passo a passo está lá.</p></section>';
      return;
    }
    if (!SP.token()) {
      tela.innerHTML = '<div class="cabeca-pagina"><div><h1>Spotify</h1><p>Veja o que você mais escuta e controle a música daqui.</p></div></div><section class="painel"><button class="btn cheio" data-con>' + ico('spotify') + ' Conectar ao Spotify</button></section>';
      $('[data-con]', tela).addEventListener('click', SP.conectar);
      return;
    }
    var periodo = TELAS.spotify.periodo || 'short_term';
    Promise.all([SP.req('/me/top/tracks?limit=10&time_range=' + periodo), SP.req('/me/top/artists?limit=10&time_range=' + periodo), SP.req('/me/player/recently-played?limit=10')]).then(function (r) {
      var faixas = (r[0] && r[0].items) || [], artistas = (r[1] && r[1].items) || [], recentes = (r[2] && r[2].items) || [];
      var generos = {};
      artistas.forEach(function (a, i) { (a.genres || []).forEach(function (g) { generos[g] = (generos[g] || 0) + (10 - i); }); });
      var topG = Object.keys(generos).sort(function (a, b) { return generos[b] - generos[a]; }).slice(0, 6), maxG = topG.length ? generos[topG[0]] : 1;
      var pop = faixas.length ? Math.round(faixas.reduce(function (s, f) { return s + f.popularity; }, 0) / faixas.length) : 0;
      var img = function (o, i) { var im = (o.images || (o.album && o.album.images) || []); return im.length ? '<img src="' + esc((im[i] || im[0]).url) + '" alt="">' : ''; };
      tela.innerHTML = '<div class="cabeca-pagina"><div><h1>Spotify</h1><p>Popularidade média das suas favoritas: <strong>' + pop + '/100</strong>' + (pop < 50 ? ' · gosto alternativo, hein' : '') + '</p></div>' +
        '<div class="linha"><div class="abas" style="margin:0">' + [['short_term', '4 semanas'], ['medium_term', '6 meses'], ['long_term', '1 ano']].map(function (p) { return '<button class="aba ' + (periodo === p[0] ? 'ativa' : '') + '" data-per="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div><button class="btn pequeno perigo" data-sair-sp>Desconectar</button></div></div>' +
        '<div class="grade"><section class="painel c-6"><header><h2 class="titulo-pixel">Top músicas</h2></header><ol class="ranking">' +
        faixas.map(function (f) { return '<li>' + img(f.album, 2) + '<div class="item-titulo">' + esc(f.name) + '<small>' + esc(f.artists.map(function (a) { return a.name; }).join(', ')) + '</small></div><button class="btn-ico" data-tocar="' + esc(f.uri) + '">' + ico('play') + '</button></li>'; }).join('') + '</ol></section>' +
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Top artistas</h2></header><ol class="ranking">' +
        artistas.map(function (a) { return '<li>' + img(a, 2) + '<div class="item-titulo">' + esc(a.name) + '</div></li>'; }).join('') + '</ol></section>' +
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Seus gêneros</h2></header><div class="barras-genero">' +
        (topG.length ? topG.map(function (g) { return '<div><span>' + esc(g) + '</span><i style="width:' + Math.round(generos[g] / maxG * 100) + '%"></i></div>'; }).join('') : '<p class="vazio">O Spotify não informou gêneros.</p>') + '</div></section>' +
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Tocou recentemente</h2></header><ul class="lista">' +
        recentes.map(function (x) { return '<li class="item"><div class="item-titulo">' + esc(x.track.name) + '<small>' + esc(x.track.artists[0].name) + ' · ' + new Date(x.played_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</small></div></li>'; }).join('') + '</ul></section></div>';
      $$('[data-per]', tela).forEach(function (b) { b.addEventListener('click', function () { TELAS.spotify.periodo = b.dataset.per; TELAS.spotify(tela); }); });
      $('[data-sair-sp]', tela).addEventListener('click', function () { SP.sair(); miniPlayer(); TELAS.spotify(tela); });
      $$('[data-tocar]', tela).forEach(function (b) {
        b.addEventListener('click', function () {
          var t = SP.token();
          fetch('https://api.spotify.com/v1/me/player/play', { method: 'PUT', headers: { Authorization: 'Bearer ' + t.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ uris: [b.dataset.tocar] }) })
            .then(function (r) { if (r.status === 404) toast('Abra o Spotify em algum aparelho primeiro.', 'erro'); setTimeout(miniPlayer, 800); });
        });
      });
    }).catch(function () {
      tela.innerHTML = '<section class="painel"><p>Não consegui falar com o Spotify. Tente conectar de novo.</p><button class="btn cheio" data-con>Conectar</button></section>';
      $('[data-con]', tela).addEventListener('click', function () { SP.sair(); SP.conectar(); });
    });
  };

  // ================================================================ Ajustes
  var instalarEvento = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); instalarEvento = e; });

  TELAS.ajustes = function (tela) {
    tela = novo(tela);
    api('ajustes').then(function (d) {
      tela.innerHTML = '<div class="cabeca-pagina"><div><h1>Ajustes</h1></div></div><div class="grade">' +
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Instalar o app</h2></header>' +
        '<p><strong>Celular Android ou PC (Chrome/Edge):</strong> toque no botão abaixo, ou no menu do navegador › <em>Instalar app</em>.</p>' +
        '<p><strong>iPhone:</strong> abra no Safari › botão Compartilhar › <em>Adicionar à Tela de Início</em>.</p>' +
        '<button class="btn cheio" data-instalar' + (instalarEvento ? '' : ' disabled') + '>Instalar Jarvis</button>' + (instalarEvento ? '' : '<p class="mini">Botão indisponível: o app já está instalado ou o navegador não oferece. Use o menu do navegador.</p>') + '</section>' +
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Cérebro do Jarvis (Gemini)</h2><span class="selo ' + (d.gemini_configurado ? 'lido' : '') + '">' + (d.gemini_configurado ? 'Ligado' : 'Desligado') + '</span></header>' +
        '<form data-ia style="display:grid;gap:10px"><p class="mini">Crie uma chave grátis em aistudio.google.com › <em>Get API key</em>. Ela fica só no seu servidor.</p>' +
        '<label class="campo">Chave da API<input name="chave" type="password" placeholder="' + (d.gemini_configurado ? '•••••••• (já salva)' : 'AIza...') + '" autocomplete="off"></label>' +
        '<label class="campo">Modelo<input name="modelo" value="' + esc(d.gemini_modelo) + '"></label>' +
        '<div class="linha"><button class="btn cheio">Salvar</button><button type="button" class="btn" data-testar>Testar</button></div></form></section>' +
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Spotify</h2></header><form data-sp style="display:grid;gap:10px">' +
        '<ol class="mini" style="margin:0;padding-left:18px"><li>Entre em developer.spotify.com/dashboard e clique em <em>Create app</em>.</li><li>Em <em>Redirect URI</em>, coloque exatamente: <code>' + esc(SP.redirect()) + '</code></li><li>Marque <em>Web API</em>, salve e copie o <em>Client ID</em> aqui.</li></ol>' +
        '<label class="campo">Client ID<input name="cid" value="' + esc(d.spotify_client_id) + '" autocomplete="off"></label><button class="btn cheio">Salvar</button></form></section>' +
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Hábitos diários</h2></header><div id="hab"></div><form data-novo-hab class="linha" style="margin-top:10px"><input class="cresce" name="nome" placeholder="Novo hábito"><button class="btn">Adicionar</button></form></section>' +
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Trocar senha</h2></header><form data-senha style="display:grid;gap:10px"><label class="campo">Senha atual<input type="password" name="atual"></label><label class="campo">Nova senha<input type="password" name="nova" minlength="8"></label><button class="btn cheio">Trocar</button></form></section></div>';
      var bi = $('[data-instalar]', tela);
      bi.addEventListener('click', function () { if (instalarEvento) { instalarEvento.prompt(); instalarEvento = null; bi.disabled = true; } });
      var fi = $('[data-ia]', tela);
      fi.addEventListener('submit', function (e) { e.preventDefault(); api('ajustes_salvar', { gemini_chave: fi.chave.value, gemini_modelo: fi.modelo.value }).then(function () { toast('Gemini salvo.'); TELAS.ajustes(tela); }); });
      $('[data-testar]', tela).addEventListener('click', function () { api('ia_testar', {}).then(function (r) { toast(r.resposta); }); });
      var fs = $('[data-sp]', tela);
      fs.addEventListener('submit', function (e) { e.preventDefault(); api('ajustes_salvar', { spotify_client_id: fs.cid.value }).then(function () { SP.clientId = fs.cid.value.replace(/[^a-z0-9]/gi, ''); toast('Spotify salvo. Conecte na aba Spotify.'); }); });
      var fsen = $('[data-senha]', tela);
      fsen.addEventListener('submit', function (e) { e.preventDefault(); api('ajustes_salvar', { senha_atual: fsen.atual.value, senha_nova: fsen.nova.value }).then(function () { toast('Senha trocada.'); fsen.reset(); }); });
      var carregarHab = function () {
        api('habitos').then(function (h) {
          $('#hab', tela).innerHTML = '<ul class="lista">' + h.habitos.map(function (x) { return '<li class="item ' + (+x.ativo ? '' : 'feito') + '"><div class="item-titulo">' + esc(x.nome) + '</div><button class="btn pequeno" data-hab-ativo="' + x.id + '" data-nome="' + esc(x.nome) + '" data-on="' + x.ativo + '">' + (+x.ativo ? 'Pausar' : 'Ativar') + '</button><button class="btn-ico" data-hab-del="' + x.id + '">' + ico('lixo') + '</button></li>'; }).join('') + '</ul>';
        });
      };
      carregarHab();
      $('#hab', tela).addEventListener('click', function (e) {
        var a = e.target.closest('[data-hab-ativo]'), del = e.target.closest('[data-hab-del]');
        if (a) api('habito_salvar', { id: +a.dataset.habAtivo, nome: a.dataset.nome, inativo: a.dataset.on === '1' }).then(carregarHab);
        if (del) api('habito_excluir', { id: +del.dataset.habDel }).then(carregarHab);
      });
      var fh = $('[data-novo-hab]', tela);
      fh.addEventListener('submit', function (e) { e.preventDefault(); if (fh.nome.value.trim()) api('habito_salvar', { nome: fh.nome.value }).then(function () { fh.reset(); carregarHab(); }); });
    });
  };

  // ================================================================ login e início
  function telaLogin() {
    clearInterval(playerTimer);
    var instalar = !estado.instalado;
    $('#pet').innerHTML = '';
    $('#app').className = '';
    $('#app').innerHTML = '<div class="login"><form class="painel"><span class="boot-logo">J.A.R.V.I.S</span>' +
      '<p class="suave">' + (instalar ? 'Primeiro acesso: crie a sua senha (mínimo 8 caracteres).' : 'Identifique-se, senhor.') + '</p>' +
      '<input type="password" name="senha" placeholder="Senha" autocomplete="' + (instalar ? 'new-password' : 'current-password') + '" required minlength="' + (instalar ? 8 : 1) + '">' +
      (instalar ? '<input type="password" name="senha2" placeholder="Repita a senha" required>' : '') +
      '<button class="btn cheio" style="justify-content:center">' + (instalar ? 'Criar e entrar' : 'Entrar') + '</button></form></div>';
    var f = $('form');
    f.senha.focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (instalar && f.senha.value !== f.senha2.value) { toast('As senhas não conferem.', 'erro'); return; }
      api(instalar ? 'instalar' : 'entrar', { senha: f.senha.value }).then(function (r) { CSRF = r.csrf; estado.instalado = true; iniciarApp(); }).catch(function () {});
    });
  }

  function iniciarApp() {
    montarCasca();
    api('ajustes').then(function (a) {
      SP.clientId = a.spotify_client_id || '';
      var p = new URLSearchParams(location.search);
      var fim = function () { navegar(); miniPlayer(); };
      if (p.get('code') && SP.clientId) {
        SP.trocarCodigo(p.get('code')).then(function () { toast('Spotify conectado!'); }).catch(function (e) { toast(e.message, 'erro'); })
          .then(function () { history.replaceState(null, '', location.pathname + '#spotify'); fim(); });
      } else {
        if (p.get('error')) history.replaceState(null, '', location.pathname + '#spotify');
        fim();
      }
    });
  }

  window.addEventListener('hashchange', function () { if ($('#tela')) navegar(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});

  fetch('api.php?r=estado', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (s) {
    CSRF = s.csrf;
    estado.instalado = s.instalado;
    if (s.logado) iniciarApp(); else telaLogin();
  }).catch(function () {
    $('#app').innerHTML = '<div class="login"><div class="painel"><span class="boot-logo">OFFLINE</span><p>Sem conexão com o servidor. Tente de novo quando tiver internet.</p></div></div>';
  });
})();

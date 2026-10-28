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

  // ---------------------------------------------------------------- conversa com o servidor (e modo offline)
  // O Jarvis mora no PC. Quando o celular não alcança o PC, as telas abrem com a
  // última cópia guardada no aparelho e as ações vão para uma fila, com o horário
  // em que foram feitas. Quando o PC aparece de novo, a fila é enviada (?r=sync)
  // e o servidor aplica tudo em ordem; se o mesmo item foi editado nos dois,
  // vale a edição mais recente.
  var ROTAS_OFFLINE = ['tarefa_salvar', 'tarefa_marcar', 'tarefa_excluir', 'habito_marcar', 'habito_salvar', 'habito_excluir',
    'refeicao_marcar', 'refeicao_salvar', 'refeicao_excluir', 'treino_salvar', 'peso_salvar', 'peso_excluir',
    'estudo_salvar', 'estudo_excluir', 'livro_salvar', 'livro_excluir', 'comida_adicionar', 'comida_excluir', 'metas_salvar',
    'economia_salvar', 'economia_excluir', 'cofrinho_salvar', 'cofrinho_excluir', 'meta_salvar', 'meta_excluir'];
  var ROTAS_LENTAS = ['chat_enviar', 'livro_opiniao', 'comida_adicionar', 'comida_balanco', 'ia_testar', 'sync', 'pet_enviar'];
  var LS = {
    ler: function (k, padrao) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } },
    gravar: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* aparelho sem espaço */ } },
    apagar: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
    chaves: function (prefixo) { var r = []; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(prefixo) === 0) r.push(k); } } catch (e) {} return r; }
  };
  var rede = { offline: false, sincronizando: false, ultima: LS.ler('jv_ultima_sync', '') };

  function agoraLocal() {
    var d = new Date(), z = function (n, t) { n = String(n); while (n.length < (t || 2)) n = '0' + n; return n; };
    return iso(d) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds()) + '.' + z(d.getMilliseconds(), 3);
  }
  function fila() { return LS.ler('jv_fila', []); }
  function salvarFila(f) { LS.gravar('jv_fila', f); mostrarSinc(); }
  function marcarOffline(off) { if (rede.offline !== off) { rede.offline = off; mostrarSinc(); } }

  /** Pedido cru ao servidor. Falha de rede vira erro com .rede = true. */
  function pedir(rota, corpo, metodo) {
    var op = { method: metodo || (corpo ? 'POST' : 'GET'), headers: { 'X-CSRF': CSRF }, credentials: 'same-origin' };
    if (corpo instanceof FormData) op.body = corpo;
    else if (corpo) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(corpo); }
    var nome = rota.split('&')[0], ctrl = window.AbortController ? new AbortController() : null;
    if (ctrl) { op.signal = ctrl.signal; setTimeout(function () { ctrl.abort(); }, ROTAS_LENTAS.indexOf(nome) >= 0 ? 90000 : 7000); }
    return fetch('api.php?r=' + rota, op).catch(function () {
      marcarOffline(true);
      var x = new Error('Sem conexão com o PC.'); x.rede = true; throw x;
    }).then(function (r) {
      marcarOffline(false);
      return r.json().catch(function () { return { erro: 'Resposta inválida do servidor.' }; }).then(function (j) {
        if (r.status === 401 && rota !== 'entrar') { telaLogin(); throw new Error(j.erro); }
        if (!r.ok || j.erro) { toast(j.erro || 'Erro.', 'erro'); throw new Error(j.erro); }
        return j;
      });
    });
  }

  function api(rota, corpo, metodo) {
    var nome = rota.split('&')[0], offlineOk = ROTAS_OFFLINE.indexOf(nome) >= 0;
    if (corpo && !(corpo instanceof FormData)) corpo._em = corpo._em || agoraLocal();
    // com fila pendente, a ação nova entra no fim dela, para manter a ordem
    if (corpo && offlineOk && (rede.offline || fila().length)) return enfileirar(nome, corpo);
    return pedir(rota, corpo, metodo).then(function (j) {
      if (!corpo) {
        var copia = j;
        if (j.avisos) { copia = Object.assign({}, j); delete copia.avisos; } // recado aparece uma vez só
        LS.gravar('jv_c:' + rota, copia);
      }
      return j;
    }, function (err) {
      if (!err.rede) throw err;
      if (!corpo) {
        var c = LS.ler('jv_c:' + rota, null);
        if (c) return c;
        toast('Sem conexão com o PC, e esta tela ainda não foi aberta neste aparelho.', 'erro');
        throw err;
      }
      if (offlineOk) return enfileirar(nome, corpo);
      toast('Isso precisa do Jarvis do PC ligado. Tente quando ele estiver on.', 'erro');
      throw err;
    });
  }

  function enfileirar(rota, corpo) {
    var idTemp = null;
    if ((/_salvar$/.test(rota) || rota === 'comida_adicionar') && !(+corpo.id) && rota !== 'treino_salvar' && rota !== 'peso_salvar' && rota !== 'metas_salvar') {
      // (economia, cofrinho e metas também ganham id provisório)
      idTemp = -(Date.now() * 10 + Math.floor(Math.random() * 10));
      corpo.id = idTemp;
    }
    var f = fila();
    f.push({ fila: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), rota: rota, corpo: corpo, em: corpo._em });
    salvarFila(f);
    var xp = aplicarLocal(rota, corpo);
    setTimeout(sincronizar, 60);
    return Promise.resolve({ ok: true, offline: true, id: idTemp, xp: xp });
  }

  /** Atualiza as cópias guardadas das telas, para a ação aparecer mesmo sem o PC. Devolve o XP estimado. */
  function aplicarLocal(rota, c) {
    var xp = 0;
    var cada = function (prefixo, fn) { LS.chaves('jv_c:' + prefixo).forEach(function (k) { var v = LS.ler(k, null); if (v) { fn(v); LS.gravar(k, v); } }); };
    var listas = function (v) { return [v.tarefas, v.sem_data].filter(Boolean); };
    var tirar = function (lista, id) { for (var i = lista.length - 1; i >= 0; i--) if (+lista[i].id === +id) lista.splice(i, 1); };
    var achar = function (lista, id) { return (lista || []).filter(function (x) { return +x.id === +id; })[0]; };
    if (rota === 'tarefa_marcar') {
      var dif = 2;
      ['hoje', 'semana'].forEach(function (p) { cada(p, function (v) { listas(v).forEach(function (l) { var t = achar(l, c.id); if (t) { t.feita = c.feita ? 1 : 0; dif = +t.dificuldade || dif; } }); }); });
      xp = c.feita ? DIF[dif][1] : 0;
    } else if (rota === 'tarefa_salvar') {
      var velha = null;
      ['hoje', 'semana'].forEach(function (p) { cada(p, function (v) { listas(v).forEach(function (l) { velha = velha || achar(l, c.id); tirar(l, c.id); }); }); });
      var t = { id: c.id, titulo: c.titulo, data: c.data || null, categoria: c.categoria || 'geral', dificuldade: +c.dificuldade || 2, feita: velha ? velha.feita : 0 };
      cada('hoje', function (v) { if (t.data && (t.data === v.data || (t.data < v.data && !+t.feita))) v.tarefas.push(t); });
      cada('semana', function (v) { if (!t.data) v.sem_data.unshift(t); else if (t.data >= v.inicio && t.data <= v.fim) v.tarefas.push(t); });
    } else if (rota === 'tarefa_excluir') {
      ['hoje', 'semana'].forEach(function (p) { cada(p, function (v) { listas(v).forEach(function (l) { tirar(l, c.id); }); }); });
    } else if (rota === 'habito_marcar' || rota === 'refeicao_marcar') {
      var hab = rota === 'habito_marcar';
      cada('hoje', function (v) { if (v.data !== (c.data || iso(new Date()))) return; var x = achar(hab ? v.habitos : v.refeicoes, c.id); if (x) x[hab ? 'feito' : 'feita'] = (hab ? c.feito : c.feita) ? 1 : 0; });
      xp = (hab ? c.feito : c.feita) ? (hab ? 5 : 2) : 0;
    } else if (rota === 'peso_salvar' || rota === 'peso_excluir') {
      var data = c.data || iso(new Date());
      cada('saude', function (v) {
        v.pesos = v.pesos.filter(function (p) { return p.data !== data; });
        if (rota === 'peso_salvar') { v.pesos.push({ data: data, kg: String(c.kg).replace(',', '.') }); v.pesos.sort(function (a, b) { return a.data < b.data ? 1 : -1; }); }
      });
      xp = rota === 'peso_salvar' ? 5 : 0;
    } else if (rota === 'treino_salvar') {
      var tr = { dia: c.dia, titulo: c.titulo || 'Treino', exercicios: c.exercicios || '' };
      cada('saude', function (v) { v.treino = v.treino.filter(function (x) { return +x.dia !== +c.dia; }).concat([tr]); });
      cada('hoje', function (v) { if (deIso(v.data).getDay() === +c.dia) v.treino = tr; });
    } else if (rota === 'estudo_salvar' || rota === 'livro_salvar') {
      var lista = rota === 'estudo_salvar' ? 'estudos' : 'livros';
      cada('estudos', function (v) {
        var x = achar(v[lista], c.id);
        if (!x) { x = { id: c.id }; v[lista].push(x); }
        ['titulo', 'detalhe', 'status', 'autor', 'nota', 'resumo'].forEach(function (k) { if (k in c) x[k] = c[k]; });
      });
      xp = rota === 'livro_salvar' && c.status === 'lido' ? 100 : 0;
    } else if (rota === 'estudo_excluir' || rota === 'livro_excluir') {
      cada('estudos', function (v) { tirar(v[rota === 'estudo_excluir' ? 'estudos' : 'livros'], c.id); });
    } else if (rota === 'comida_adicionar') {
      var dia = c.data || iso(new Date());
      cada('comidas', function (v) { if (dia >= v.inicio && dia <= v.fim) v.comidas.push({ id: c.id, data: dia, descricao: c.descricao, itens: '[]', kcal: 0, proteina: 0, carbo: 0, gordura: 0, pendente: 1 }); });
      xp = 2;
    } else if (rota === 'economia_salvar' || rota === 'cofrinho_salvar' || rota === 'meta_salvar') {
      var valor = parseFloat(String(c.valor).replace(/\./g, '').replace(',', '.')) || 0, diaE = c.data || iso(new Date());
      cada('economia', function (v) {
        if (rota === 'economia_salvar' && diaE.slice(0, 7) === v.mes) {
          v.lancamentos = v.lancamentos.filter(function (l) { return +l.id !== +c.id; });
          v.lancamentos.unshift({ id: c.id, tipo: c.tipo, valor: valor, descricao: c.descricao, categoria: c.categoria, data: diaE });
          v.entradas = 0; v.saidas = 0;
          v.lancamentos.forEach(function (l) { if (l.tipo === 'entrada') v.entradas += +l.valor; else v.saidas += +l.valor; });
        } else if (rota === 'cofrinho_salvar') {
          v.movimentos.unshift({ id: c.id, tipo: c.tipo, valor: valor, descricao: c.descricao, data: diaE });
          v.cofrinho += c.tipo === 'retirar' ? -valor : valor;
        } else if (rota === 'meta_salvar') {
          v.metas = v.metas.filter(function (m) { return +m.id !== +c.id; });
          v.metas.push({ id: c.id, nome: c.nome, valor: valor, icone: c.icone, concluida: c.concluida ? 1 : 0 });
        }
      });
      xp = rota === 'cofrinho_salvar' && c.tipo !== 'retirar' ? 10 : 0;
    } else if (rota === 'economia_excluir' || rota === 'cofrinho_excluir' || rota === 'meta_excluir') {
      cada('economia', function (v) { var k = { economia_excluir: 'lancamentos', cofrinho_excluir: 'movimentos', meta_excluir: 'metas' }[rota]; tirar(v[k], c.id); });
    } else if (rota === 'comida_excluir') {
      cada('comidas', function (v) { tirar(v.comidas, c.id); });
    }
    return xp;
  }

  function sincronizar() {
    var f = fila();
    if (!f.length || rede.sincronizando) return Promise.resolve();
    rede.sincronizando = true; mostrarSinc();
    return pedir('sync', { ops: f }, 'POST').then(function (r) {
      var feitos = {};
      r.resultados.forEach(function (x) { feitos[x.fila] = x; });
      var resto = fila().filter(function (op) { return !feitos[op.fila]; });
      resto.forEach(function (op) { if (op.corpo && r.mapa[op.corpo.id]) op.corpo.id = +r.mapa[op.corpo.id]; });
      salvarFila(resto);
      rede.ultima = agoraLocal().slice(0, 16); LS.gravar('jv_ultima_sync', rede.ultima);
      if (r.jogo) atualizarHud(r.jogo);
      r.resultados.filter(function (x) { return x.erro; }).forEach(function (x) { toast('Uma ação não sincronizou: ' + x.erro, 'erro'); });
      toast('Sincronizado com o PC (' + f.length + (f.length === 1 ? ' ação)' : ' ações)'));
      if (!$('.modal-fundo') && $('#tela')) navegar();
      if (resto.length) setTimeout(sincronizar, 400);
    }, function () { /* continua na fila; tenta de novo depois */ }).then(function () { rede.sincronizando = false; mostrarSinc(); });
  }

  function mostrarSinc() {
    var el = $('#sinc');
    if (!el) return;
    var n = fila().length;
    el.className = 'sinc ' + (rede.sincronizando ? 'girando' : rede.offline ? 'off' : n ? 'pendente' : 'on');
    el.textContent = rede.sincronizando ? '⟳ sincronizando' : rede.offline ? '○ offline' + (n ? ' · ' + n + ' na fila' : '') : n ? '● ' + n + ' na fila' : '● PC conectado';
    el.title = rede.offline ? 'O celular não está alcançando o Jarvis do PC. Tudo que você fizer fica salvo aqui e sincroniza sozinho.' : 'Última sincronização: ' + (rede.ultima ? br(rede.ultima) + ' ' + rede.ultima.slice(11, 16) : 'nenhuma');
  }

  /** Testa se o PC voltou (e envia a fila). */
  function verificarPc() {
    if (fila().length) return sincronizar();
    if (!rede.offline) return Promise.resolve();
    return pedir('estado').then(function (s) { if (s.csrf) { CSRF = s.csrf; } if (!s.logado) telaLogin(); }).catch(function () {});
  }
  window.addEventListener('online', function () { setTimeout(verificarPc, 800); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) verificarPc(); });
  setInterval(verificarPc, 20000);

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
    moeda: '<circle cx="12" cy="12" r="8.5" fill="#fbbf24" stroke="#d97706" stroke-width="1.5"/><path d="M12 7.5v9M9.8 9.6c.4-1 1.3-1.4 2.3-1.4 1.3 0 2.2.7 2.2 1.7 0 2.4-4.6 1.4-4.6 3.9 0 1 .9 1.8 2.3 1.8 1 0 1.9-.5 2.3-1.4" stroke="#7c2d12" stroke-width="1.4"/>',
    fogo: '<path d="M12 21.5c-4 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.3 3.6-8.3.5 1.6 1.4 2.6 2.4 3.1C12 7 13 4.4 15.2 2.5c-.2 3.3 3.3 6.2 3.3 11.1 0 4.7-2.6 7.9-6.5 7.9z" fill="#fb923c" stroke="none"/><path d="M12 21.5c-1.8 0-3-1.2-3-3 0-2.3 2-3.2 2.7-5 1.3 1 3.3 2.8 3.3 5 0 1.8-1.2 3-3 3z" fill="#fde047" stroke="none"/>',
    raio: '<path d="M13.5 2.5L5.5 13.5h5.5l-1.5 8 8-11h-5.5z" fill="#a78bfa" stroke="none"/>',
    sair: '<path d="M15 4h4v16h-4M10 17l-5-5 5-5M5 12h11"/>',
    jardim: '<path d="M11 21v-7M6 14h12M12 3l6 6h-3l3 4H6l3-4H6z"/>'
  };
  // ---------------------------------------------------------------- ícones animados do menu
  // Cada ícone tem peças com classe própria; o CSS anima quando passa o mouse e quando a aba está ativa.
  function navIco(rota) {
    var dia = new Date().getDate();
    var I = {
      hoje: '<rect class="cal-folha" x="3.5" y="5" width="17" height="15.5" rx="3"/><path class="cal-topo" d="M3.5 9.5h17" /><path class="cal-argola" d="M8 3v4M16 3v4"/>' +
        '<text class="cal-num" x="12" y="17.6" text-anchor="middle">' + dia + '</text>',
      semana: '<path class="q-pergaminho" d="M6 4.5h10.5a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2V6"/><path class="q-pergaminho" d="M6 4.5a1.5 1.5 0 0 0-3 0V6h2.5"/>' +
        '<g class="q-marca"><path d="M9.4 9.4a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1 .8-1 1.5v.4"/><circle cx="12" cy="16.4" r=".9" fill="currentColor" stroke="none"/></g>',
      saude: '<circle class="r-cabeca" cx="14.5" cy="4.5" r="2"/><path class="r-corpo" d="M13.5 7.5l-2 6"/>' +
        '<path class="r-braco-a" d="M13.2 8.5l3.3 2.2"/><path class="r-braco-b" d="M13.2 8.5l-3.6 1.2"/>' +
        '<path class="r-perna-a" d="M11.5 13.5l3 2.5-.5 4"/><path class="r-perna-b" d="M11.5 13.5l-2.5 3.2-3.5.3"/><path class="r-vento" d="M2 9h3M3 12.5h3"/>',
      estudos: '<path class="l-capa" d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"/><path class="l-lombada" d="M12 6.5v13"/>' +
        '<path class="l-pagina" d="M12 6.5c1.6-1.1 3.9-1.5 6.5-1.3v12.3c-2.6-.2-4.9.2-6.5 1.3z"/>',
      jardim: '<path class="j-caule" d="M12 21v-9"/><path class="j-folha-a" d="M12 13c-4 0-6-2.5-6-6 3.5 0 6 2 6 6z"/><path class="j-folha-b" d="M12 11c0-3.5 2.5-6 6.5-6 0 4-2.5 6-6.5 6z"/><path d="M7 21h10"/>',
      jarvis: '<circle class="o-nucleo" cx="12" cy="12" r="3.2"/><path class="o-anel" d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5"/><path class="o-anel o-anel-b" d="M12 20.5A8.5 8.5 0 0 1 3.5 12"/><circle class="o-pulso" cx="12" cy="12" r="6"/>',
      economia: '<g class="pq-n-corpo"><path d="M4.5 12.5a7 5.8 0 0 1 13.4-2.3l2.1-.7v3.6l-1.5.6a6.6 6.6 0 0 1-2 3.1V19h-2.6v-1.6h-4.4V19H6.9v-2.4a5.6 5.6 0 0 1-2.4-4.1z"/><path d="M9.5 8.3h4"/><circle cx="15.3" cy="11.3" r=".5" fill="currentColor"/></g><circle class="pq-n-moeda" cx="11.5" cy="3" r="1.8"/>',
      cerebro: '<path class="cb-n-fio" d="M12 6v4M12 10L6.5 15M12 10l5.5 5"/><circle class="cb-n-a" cx="12" cy="4.5" r="2.2"/><circle class="cb-n-b" cx="5.5" cy="17" r="2.2"/><circle class="cb-n-c" cx="18.5" cy="17" r="2.2"/><circle class="cb-n-d" cx="12" cy="10" r="1.3"/>',
      loja: '<path d="M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/><circle class="s-moeda" cx="12" cy="2.5" r="1.6"/>',
      spotify: '<path class="eq eq-1" d="M5 20V12"/><path class="eq eq-2" d="M9.7 20V6"/><path class="eq eq-3" d="M14.3 20V10"/><path class="eq eq-4" d="M19 20V4"/>',
      ajustes: '<g class="g-roda"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.3"/></g>',
      sair: '<path d="M14 4h4.5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><g class="x-seta"><path d="M10 16.5L5.5 12 10 7.5M5.5 12H15"/></g>'
    };
    return '<svg class="nico nico-' + rota + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[rota] || '') + '</svg>';
  }
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
    var tema = (estado.equipado && estado.equipado.tema) || 'tema-clean';
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
    ['hoje', 'Hoje'], ['semana', 'Missões'], ['saude', 'Saúde'], ['estudos', 'Estudos'], ['economia', 'Economia'], ['cerebro', 'Cérebro'],
    ['jardim', 'Jardim'], ['jarvis', 'Jarvis'], ['loja', 'Loja'], ['spotify', 'Spotify'], ['ajustes', 'Ajustes']
  ];
  function montarCasca() {
    var nav = ROTAS.map(function (r) { return '<a class="nav-item" href="#' + r[0] + '" data-rota="' + r[0] + '">' + navIco(r[0]) + '<span class="rot">' + r[1] + '</span></a>'; }).join('');
    $('#app').className = '';
    $('#app').innerHTML =
      '<div class="casca"><nav class="trilho"><div class="marca"><span class="marca-orb"></span>JARVIS</div>' + nav + '<div class="espaco"></div>' +
      '<button class="nav-item" data-sair>' + navIco('sair') + '<span class="rot">Sair</span></button></nav>' +
      '<main class="principal"><button type="button" id="sinc" class="sinc"></button><section class="hud" id="hud"></section><div id="tela"></div></main></div>' +
      '<nav class="nav-baixo">' + nav + '</nav><div id="mini-player"></div>';
    $('#sinc').addEventListener('click', function () { if (fila().length) sincronizar(); else verificarPc(); });
    mostrarSinc();
    var jogoGuardado = LS.ler('jv_jogo', null);
    if (jogoGuardado) atualizarHud(jogoGuardado);
    else api('jogo').then(function (r) { atualizarHud(r.jogo); }).catch(function () {});
    $('[data-sair]').addEventListener('click', function () {
      if (fila().length && !confirm('Ainda há ações que não chegaram no PC. Elas ficam guardadas e sincronizam quando você entrar de novo. Sair mesmo?')) return;
      api('sair', {}).then(function () { LS.chaves('jv_c:').forEach(LS.apagar); location.hash = ''; telaLogin(); });
    });
  }
  function atualizarHud(j) {
    estado.jogo = j;
    LS.gravar('jv_jogo', j);
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

  function avisosHtml(lista) {
    if (!lista || !lista.length) return '';
    var ROT = { claude: ['Claude', 'claude'], ifro: ['IFRO', 'ifro'], erro: ['Atenção', 'erro'], info: ['Jarvis', 'info'] };
    return '<section class="painel c-12 avisos"><header><h2 class="titulo-pixel">Novidades</h2><span class="mini">desde a última vez</span></header><ul class="lista">' +
      lista.map(function (a) { var r = ROT[a.tipo] || ROT.info; return '<li class="item aviso-' + r[1] + '"><span class="aviso-selo">' + r[0] + '</span><div class="item-titulo">' + esc(a.texto) + '<small>' + br(a.em) + ' ' + String(a.em).slice(11, 16) + '</small></div></li>'; }).join('') +
      '</ul></section>';
  }

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
        '<div class="grade">' + avisosHtml(d.avisos) +
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
        (h ? api('habito_marcar', { id: +h.dataset.habito, feito: on, data: d.data }) : api('refeicao_marcar', { id: +r.dataset.refeicao, feita: on, data: d.data }))
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
          return '<li class="item"><div class="item-titulo">' + esc(c.descricao) + '<small>' + itens.map(function (x) { return esc(x.nome) + (x.quantidade ? ' (' + esc(x.quantidade) + ')' : '') + ' ~' + Math.round(x.kcal) + ' kcal'; }).join(' · ') + '</small></div><span class="xp-tag">' + (c.pendente ? '⏳ calcula ao sincronizar' : Math.round(c.kcal) + ' kcal') + '</span><button class="btn-ico" data-del-comida="' + c.id + '">' + ico('lixo') + '</button></li>';
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
      var amostras = { 'tema-clean': ['#0b0f17', '#6d8bff', '#a78bfa'], 'tema-hud': ['#060b14', '#00e5ff', '#ffb300'], 'tema-gameboy': ['#0f380f', '#306230', '#9bbc0f'], 'tema-synthwave': ['#12002b', '#ff40c4', '#29f0ff'], 'tema-matrix': ['#000', '#00ff41', '#b6ff00'], 'tema-pergaminho': ['#2a1a10', '#ead7b0', '#8b1e1e'],
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

  // ================================================================ Economia
  var BRL = function (v) { return (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  var ECO_CATS = {
    entrada: [['trabalho', 'Trabalho'], ['freela', 'Freela'], ['bolsa', 'Bolsa'], ['venda', 'Venda'], ['presente', 'Presente'], ['outros', 'Outros']],
    saida: [['comida', 'Comida'], ['transporte', 'Transporte'], ['lazer', 'Lazer'], ['jogos', 'Jogos'], ['compras', 'Compras'], ['contas', 'Contas'], ['estudo', 'Estudo'], ['saude', 'Saúde'], ['outros', 'Outros']]
  };
  var ECO_ICO = {
    trabalho: '<path d="M4 8h16v11H4z"/><path d="M9 8V5.5h6V8M4 12.5h16"/>',
    freela: '<rect x="3.5" y="5" width="17" height="11" rx="1.5"/><path d="M2 19h20M10 9.5l-2 1.5 2 1.5M14 9.5l2 1.5-2 1.5"/>',
    bolsa: '<path d="M2.5 9L12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c1.5 1.4 3.5 2 5.5 2s4-.6 5.5-2V11"/>',
    venda: '<path d="M3.5 12.5l8-8h7v7l-8 8z"/><circle cx="15" cy="8" r="1.4"/>',
    presente: '<rect x="4" y="9.5" width="16" height="10.5" rx="1"/><path d="M3 9.5h18v-3H3zM12 6.5V20M12 6.5C10 3 6.5 4 8 6.5M12 6.5c2-3.5 5.5-2.5 4 0"/>',
    comida: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 1.5-2.5 4-2.5 7H17V21M17 3v7"/>',
    transporte: '<rect x="4" y="4" width="16" height="13" rx="3"/><path d="M4 11h16M8 20v-3M16 20v-3"/><circle cx="8" cy="14" r=".6"/><circle cx="16" cy="14" r=".6"/>',
    lazer: '<path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M14 7v12" stroke-dasharray="2 2"/>',
    jogos: '<path d="M7 8h10a4 4 0 0 1 4 4.5l-.6 3.5a2.2 2.2 0 0 1-3.8 1L15 15H9l-1.6 2a2.2 2.2 0 0 1-3.8-1L3 12.5A4 4 0 0 1 7 8z"/><path d="M7.5 11v3M6 12.5h3"/><circle cx="15.5" cy="11.5" r=".7"/><circle cx="17" cy="13.5" r=".7"/>',
    compras: '<path d="M5 8h14l-1 12H6z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/>',
    contas: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    estudo: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13"/>',
    saude: '<path d="M12 20s-7.5-4.3-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.7-7.5 10-7.5 10z"/><path d="M8 12h2l1-2 2 4 1-2h2"/>',
    outros: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>'
  };
  var META_ICO = {
    console: ECO_ICO.jogos,
    celular: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    pc: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8.5 20h7M12 16v4"/>',
    fone: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    moto: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5l4-6h5l4 6M12 10.5L10 6.5H7.5M14.5 10.5l1-3h2.5"/>',
    viagem: '<path d="M10.5 13.5L3 11l1.3-1.3 7.7.6 4.8-4.8a1.6 1.6 0 0 1 2.3 2.3l-4.8 4.8.6 7.7L13.6 21l-2.5-7.5-3.4 3.4.4 2.3-1 1-1.5-3-3-1.5 1-1 2.3.4z"/>',
    casa: '<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5M10 20v-5h4v5"/>',
    roupa: '<path d="M8 3.5L3.5 6.5 5.5 10 7.5 9v11.5h9V9l2 1 2-3.5L16 3.5c-.5 1.5-2 2.5-4 2.5S8.5 5 8 3.5z"/>',
    livro: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
    presente: ECO_ICO.presente
  };
  var META_NOMES = { console: 'Videogame', celular: 'Celular', pc: 'Computador', fone: 'Fone', moto: 'Moto', viagem: 'Viagem', casa: 'Casa', roupa: 'Roupa', livro: 'Livro', presente: 'Outro' };
  function svgIco(paths, cls) { return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>'; }

  function porquinhoSvg() {
    return '<svg class="porquinho" viewBox="0 0 200 160" aria-hidden="true">' +
      '<defs><linearGradient id="pq-corpo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb3cf"/><stop offset="1" stop-color="#f472a8"/></linearGradient>' +
      '<linearGradient id="pq-moeda" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>' +
      '<radialGradient id="pq-brilho" cx=".35" cy=".3" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      '<g class="pq-moeda"><circle cx="100" cy="18" r="13" fill="url(#pq-moeda)" stroke="#b45309" stroke-width="2"/><text x="100" y="23.5" text-anchor="middle" font-size="15" font-weight="800" fill="#92400e" font-family="Inter, sans-serif">$</text></g>' +
      '<g class="pq-corpo-g">' +
      '<path d="M150 92c10-4 14 6 8 10-5 3-9-2-6-6 2-3 7-2 8 1" fill="none" stroke="#f472a8" stroke-width="4" stroke-linecap="round"/>' +
      '<rect x="62" y="118" width="16" height="24" rx="7" fill="#e85d97"/><rect x="122" y="118" width="16" height="24" rx="7" fill="#e85d97"/>' +
      '<ellipse cx="100" cy="92" rx="56" ry="44" fill="url(#pq-corpo)"/>' +
      '<rect x="72" y="120" width="16" height="22" rx="7" fill="#f47aab"/><rect x="112" y="120" width="16" height="22" rx="7" fill="#f47aab"/>' +
      '<path d="M66 58l-6-20 20 10z" fill="#f472a8"/><path d="M68 54l-3-11 10 6z" fill="#fbcfe8"/>' +
      '<rect x="86" y="49" width="28" height="6" rx="3" fill="#9d174d" opacity=".75"/>' +
      '<ellipse cx="100" cy="92" rx="56" ry="44" fill="url(#pq-brilho)"/>' +
      '<ellipse cx="50" cy="96" rx="15" ry="12" fill="#f9a8c9" stroke="#e85d97" stroke-width="2"/>' +
      '<ellipse cx="45" cy="96" rx="2.6" ry="3.6" fill="#9d174d"/><ellipse cx="55" cy="96" rx="2.6" ry="3.6" fill="#9d174d"/>' +
      '<g class="pq-olho"><ellipse cx="72" cy="80" rx="4.5" ry="5.5" fill="#3b0a1f"/><circle cx="73.5" cy="78" r="1.6" fill="#fff"/></g>' +
      '<ellipse cx="66" cy="94" rx="6" ry="3.5" fill="#fb7185" opacity=".45"/>' +
      '</g><g class="pq-brilhos"><path d="M160 40l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fde68a"/><path d="M38 50l1.4 3.4 3.4 1.4-3.4 1.4L38 59.6l-1.4-3.4-3.4-1.4 3.4-1.4z" fill="#fde68a"/></g></svg>';
  }

  TELAS.economia = function (tela, mes) {
    tela = novo(tela);
    mes = mes || TELAS.economia.mes || iso(new Date()).slice(0, 7);
    TELAS.economia.mes = mes;
    api('economia&mes=' + mes).then(function (d) {
      var nomeMes = deIso(mes + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      var saldo = d.entradas - d.saidas;
      var catNome = {};
      ECO_CATS.entrada.concat(ECO_CATS.saida).forEach(function (c) { catNome[c[0]] = c[1]; });
      var maxCat = Math.max.apply(null, [1].concat(Object.keys(d.categorias).map(function (k) { return d.categorias[k]; })));
      var maxMes = Math.max.apply(null, [1].concat(d.meses.map(function (m) { return Math.max(+m.e, +m.s); })));
      var metasAbertas = d.metas.filter(function (m) { return !+m.concluida; });
      var card = function (cls, ico, rot, val, sub) { return '<div class="eco-card ' + cls + '">' + svgIco(ico, 'eco-card-ico') + '<span>' + rot + '</span><strong>' + val + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; };
      tela.innerHTML =
        '<div class="cabeca-pagina"><div><h1>Economia</h1><p>Seu dinheiro do mês, o porquinho e as metas.</p></div>' +
        '<div class="linha"><button class="btn-ico" data-mes="-1" aria-label="Mês anterior">' + ico('esq') + '</button><span class="eco-mes">' + nomeMes + '</span><button class="btn-ico" data-mes="1" aria-label="Próximo mês">' + ico('dir') + '</button></div></div>' +
        '<div class="eco-cards">' +
        card('saldo ' + (saldo < 0 ? 'neg' : ''), '<path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h5v5"/>', 'Saldo do mês', BRL(saldo), saldo < 0 ? 'gastou mais do que ganhou' : 'sobrou neste mês') +
        card('entrada', '<path d="M12 19V5M6 11l6-6 6 6"/>', 'Entrou', BRL(d.entradas), d.lancamentos.filter(function (l) { return l.tipo === 'entrada'; }).length + ' lançamentos') +
        card('saida', '<path d="M12 5v14M6 13l6 6 6-6"/>', 'Saiu', BRL(d.saidas), d.lancamentos.filter(function (l) { return l.tipo === 'saida'; }).length + ' lançamentos') +
        card('cofre', '<path d="M5 11a7 6 0 0 1 13 0v4l-2 1v3h-3v-2H9v2H6v-3.5A6 6 0 0 1 5 11z"/><path d="M10 6.5h4"/><circle cx="15" cy="11" r=".6"/>', 'No porquinho', BRL(d.cofrinho), 'guardado no banco') +
        '</div>' +
        '<div class="grade">' +
        // porquinho
        '<section class="painel c-5 pq-painel"><header><h2 class="titulo-pixel">Porquinho</h2><span class="mini">+10 XP por dia que guardar</span></header>' +
        '<div class="pq-palco">' + porquinhoSvg() + '<div class="pq-valor"><span>Guardado</span><strong data-pq-valor>' + BRL(d.cofrinho) + '</strong></div></div>' +
        '<form data-pq class="pq-form"><div class="pq-tipo"><button type="button" class="ativo" data-pq-tipo="guardar">Guardei</button><button type="button" data-pq-tipo="retirar">Tirei</button></div>' +
        '<div class="linha"><label class="campo cresce eco-reais"><span class="sr">Valor</span><input name="valor" inputmode="decimal" placeholder="0,00" required></label><button class="btn cheio">Confirmar</button></div>' +
        '<input name="descricao" placeholder="Motivo (opcional)"></form>' +
        '<p class="mini" style="margin:10px 0 0">Aqui é só a anotação: o dinheiro de verdade fica no seu banco.</p>' +
        '<ul class="lista pq-hist">' + (d.movimentos.slice(0, 5).map(function (m) { return '<li class="item"><span class="eco-sinal ' + (m.tipo === 'guardar' ? 'mais' : 'menos') + '">' + (m.tipo === 'guardar' ? '+' : '−') + '</span><div class="item-titulo">' + esc(m.descricao || (m.tipo === 'guardar' ? 'Guardei' : 'Tirei')) + '<small>' + br(m.data) + '</small></div><strong class="eco-valor ' + (m.tipo === 'guardar' ? 'mais' : 'menos') + '">' + BRL(m.valor) + '</strong><button class="btn-ico" data-del-pq="' + m.id + '" aria-label="Apagar">' + ico('lixo') + '</button></li>'; }).join('') || '<li class="vazio">Nada guardado ainda.</li>') + '</ul></section>' +
        // metas
        '<section class="painel c-7"><header><h2 class="titulo-pixel">Metas</h2><button class="btn pequeno" data-meta="0">' + ico('mais') + ' Nova meta</button></header>' +
        (metasAbertas.length ? '<div class="metas">' + metasAbertas.map(function (m) {
          var pct = Math.min(100, d.cofrinho / m.valor * 100), falta = Math.max(0, m.valor - d.cofrinho);
          return '<div class="meta ' + (falta <= 0 ? 'pronta' : '') + '" data-meta="' + m.id + '"><div class="meta-ico">' + svgIco(META_ICO[m.icone] || META_ICO.presente) + '</div>' +
            '<div class="meta-info"><div class="meta-topo"><strong>' + esc(m.nome) + '</strong><span>' + BRL(m.valor) + '</span></div>' +
            '<div class="meta-barra"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
            '<div class="meta-pe"><span>' + Math.floor(pct) + '%</span><span>' + (falta <= 0 ? 'Já dá pra comprar!' : 'Faltam <b>' + BRL(falta) + '</b>') + '</span></div></div></div>';
        }).join('') + '</div>' : '<div class="vazio">Crie uma meta, tipo um PlayStation 5, e veja quanto falta.</div>') +
        (d.metas.length > metasAbertas.length ? '<p class="mini" style="margin-top:12px">Conquistadas: ' + d.metas.filter(function (m) { return +m.concluida; }).map(function (m) { return esc(m.nome); }).join(', ') + '</p>' : '') + '</section>' +
        // lançamento
        '<section class="painel c-5"><header><h2 class="titulo-pixel">Anotar</h2></header>' +
        '<form data-lanc class="form-pilha" style="display:grid;gap:12px"><div class="pq-tipo eco-tipo"><button type="button" class="ativo" data-tipo="entrada">Ganhei</button><button type="button" data-tipo="saida">Gastei</button></div>' +
        '<div class="form-grade"><label class="campo">Valor (R$)<input name="valor" inputmode="decimal" placeholder="0,00" required></label><label class="campo">Dia<input type="date" name="data" value="' + (iso(new Date()).slice(0, 7) === mes ? iso(new Date()) : mes + '-01') + '"></label></div>' +
        '<label class="campo">Por quê?<input name="descricao" placeholder="Ex.: site do Jhonattas, lanche, jogo na Steam" required></label>' +
        '<div class="eco-cats" data-cats></div><button class="btn cheio">Salvar</button></form></section>' +
        // extrato
        '<section class="painel c-7"><header><h2 class="titulo-pixel">Extrato de ' + nomeMes.split(' ')[0] + '</h2></header><ul class="lista">' +
        (d.lancamentos.length ? d.lancamentos.map(function (l) {
          var e = l.tipo === 'entrada';
          return '<li class="item"><span class="eco-cat-ico ' + (e ? 'mais' : 'menos') + '">' + svgIco(ECO_ICO[l.categoria] || ECO_ICO.outros) + '</span><div class="item-titulo">' + esc(l.descricao) + '<small>' + br(l.data) + ' · ' + (catNome[l.categoria] || 'Outros') + '</small></div><strong class="eco-valor ' + (e ? 'mais' : 'menos') + '">' + (e ? '+ ' : '− ') + BRL(l.valor) + '</strong><button class="btn-ico" data-del-lanc="' + l.id + '" aria-label="Apagar">' + ico('lixo') + '</button></li>';
        }).join('') : '<li class="vazio">Nada anotado neste mês.</li>') + '</ul></section>' +
        // gráficos
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Para onde foi</h2></header>' +
        (Object.keys(d.categorias).length ? '<div class="eco-barras">' + Object.keys(d.categorias).map(function (k) { return '<div><span class="eco-cat-ico menos">' + svgIco(ECO_ICO[k] || ECO_ICO.outros) + '</span><span>' + (catNome[k] || k) + '</span><i><b style="width:' + (d.categorias[k] / maxCat * 100).toFixed(1) + '%"></b></i><strong>' + BRL(d.categorias[k]) + '</strong></div>'; }).join('') + '</div>' : '<div class="vazio">Sem gastos neste mês.</div>') + '</section>' +
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Últimos 6 meses</h2><span class="mini"><i class="leg mais"></i>entrou <i class="leg menos"></i>saiu</span></header><div class="eco-meses">' +
        d.meses.map(function (m) { return '<div><div class="par"><i class="mais" style="height:' + (m.e / maxMes * 100).toFixed(1) + '%" title="Entrou ' + BRL(m.e) + '"></i><i class="menos" style="height:' + (m.s / maxMes * 100).toFixed(1) + '%" title="Saiu ' + BRL(m.s) + '"></i></div><span>' + deIso(m.mes + '-01').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '</span></div>'; }).join('') + '</div></section>' +
        '</div>';

      var recarregar = function () { TELAS.economia(tela, mes); };
      $$('[data-mes]', tela).forEach(function (b) { b.addEventListener('click', function () { var dt = deIso(mes + '-01'); dt.setMonth(dt.getMonth() + +b.dataset.mes); TELAS.economia(tela, iso(dt).slice(0, 7)); }); });
      // porquinho
      var fp = $('[data-pq]', tela), pqTipo = 'guardar';
      $$('[data-pq-tipo]', fp).forEach(function (b) { b.addEventListener('click', function () { pqTipo = b.dataset.pqTipo; $$('[data-pq-tipo]', fp).forEach(function (x) { x.classList.toggle('ativo', x === b); }); }); });
      fp.addEventListener('submit', function (e) {
        e.preventDefault();
        var palco = $('.pq-palco', tela);
        api('cofrinho_salvar', { tipo: pqTipo, valor: fp.valor.value, descricao: fp.descricao.value }).then(function (r) {
          palco.classList.remove('caiu', 'saiu'); void palco.offsetWidth; palco.classList.add(pqTipo === 'guardar' ? 'caiu' : 'saiu');
          if (pqTipo === 'guardar') { recompensa(r, $('button.cheio', fp)); bip([988, 1319]); }
          setTimeout(recarregar, 1300);
        });
      });
      $$('[data-del-pq]', tela).forEach(function (b) { b.addEventListener('click', function () { api('cofrinho_excluir', { id: +b.dataset.delPq }).then(recarregar); }); });
      // lançamento
      var fl = $('[data-lanc]', tela), tipo = 'entrada', cat = 'trabalho';
      var desenharCats = function () {
        if (!ECO_CATS[tipo].some(function (c) { return c[0] === cat; })) cat = ECO_CATS[tipo][0][0];
        $('[data-cats]', fl).innerHTML = ECO_CATS[tipo].map(function (c) { return '<button type="button" class="eco-cat ' + (c[0] === cat ? 'ativo' : '') + '" data-cat="' + c[0] + '">' + svgIco(ECO_ICO[c[0]]) + '<span>' + c[1] + '</span></button>'; }).join('');
      };
      desenharCats();
      $('[data-cats]', fl).addEventListener('click', function (e) { var b = e.target.closest('[data-cat]'); if (b) { cat = b.dataset.cat; desenharCats(); } });
      $$('[data-tipo]', fl).forEach(function (b) { b.addEventListener('click', function () { tipo = b.dataset.tipo; $$('[data-tipo]', fl).forEach(function (x) { x.classList.toggle('ativo', x === b); }); fl.classList.toggle('gasto', tipo === 'saida'); desenharCats(); }); });
      fl.addEventListener('submit', function (e) { e.preventDefault(); api('economia_salvar', { tipo: tipo, valor: fl.valor.value, descricao: fl.descricao.value, categoria: cat, data: fl.data.value }).then(function () { toast(tipo === 'entrada' ? 'Entrada anotada.' : 'Gasto anotado.'); recarregar(); }); });
      $$('[data-del-lanc]', tela).forEach(function (b) { b.addEventListener('click', function () { api('economia_excluir', { id: +b.dataset.delLanc }).then(recarregar); }); });
      // metas
      $$('[data-meta]', tela).forEach(function (el) {
        el.addEventListener('click', function () {
          var id = +el.dataset.meta, m = d.metas.filter(function (x) { return +x.id === id; })[0] || { nome: '', valor: '', icone: 'console' };
          var form = modal('<h2 class="titulo-pixel">' + (id ? 'Editar meta' : 'Nova meta') + '</h2>' +
            '<div class="form-grade"><label class="campo">O que quer comprar<input name="nome" value="' + esc(m.nome) + '" placeholder="PlayStation 5"></label><label class="campo">Preço (R$)<input name="valor" inputmode="decimal" value="' + (m.valor ? String(m.valor).replace('.', ',') : '') + '" placeholder="3.799,00"></label></div>' +
            '<div class="campo"><span>Ícone</span><div class="meta-icones">' + Object.keys(META_ICO).map(function (k) { return '<button type="button" data-ic="' + k + '" class="' + (k === m.icone ? 'ativo' : '') + '" title="' + META_NOMES[k] + '">' + svgIco(META_ICO[k]) + '</button>'; }).join('') + '</div></div>' +
            (id ? '<label class="linha" style="gap:8px"><input type="checkbox" name="feita" style="width:auto;min-height:0"' + (+m.concluida ? ' checked' : '') + '> Já comprei</label>' : ''),
            [id ? ['Excluir', 'perigo', function () { return api('meta_excluir', { id: id }).then(recarregar); }] : null,
             ['Salvar', 'cheio', function (f) { return api('meta_salvar', { id: id, nome: f.nome.value, valor: f.valor.value, icone: icone, concluida: f.feita ? f.feita.checked : false }).then(recarregar); }]]);
          var icone = m.icone;
          $$('[data-ic]', form).forEach(function (b) { b.addEventListener('click', function () { icone = b.dataset.ic; $$('[data-ic]', form).forEach(function (x) { x.classList.toggle('ativo', x === b); }); }); });
        });
      });
    });
  };

  // ================================================================ Cérebro (mapa do Obsidian)
  var CB_ICO = {
    cerebro: '<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3.2 3.2 0 0 0 7 18a2.5 2.5 0 0 0 5 .5V5.5a2.4 2.4 0 0 0-3-1zM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2A3.2 3.2 0 0 1 17 18a2.5 2.5 0 0 1-5 .5"/><path d="M9 9.5c1 0 2 .7 2 2M15 9.5c-1 0-2 .7-2 2M8 14c1 0 1.8.4 2.3 1"/>',
    jogo: ECO_ICO.jogos,
    coruja: '<path d="M6 5l2 2.5M18 5l-2 2.5"/><path d="M5.5 9a6.5 6.5 0 0 1 13 0v6a6.5 6.5 0 0 1-13 0z"/><circle cx="9.3" cy="10" r="2.2"/><circle cx="14.7" cy="10" r="2.2"/><circle cx="9.3" cy="10" r=".6" fill="currentColor"/><circle cx="14.7" cy="10" r=".6" fill="currentColor"/><path d="M11.2 13l.8 1.3.8-1.3M9 17.5c1.8 1 4.2 1 6 0"/>',
    orbe: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5M12 20.5A8.5 8.5 0 0 1 3.5 12"/>',
    servidor: '<rect x="4" y="4" width="16" height="7" rx="1.5"/><rect x="4" y="13" width="16" height="7" rx="1.5"/><path d="M7.5 7.5h.01M7.5 16.5h.01M11 7.5h5M11 16.5h5"/>',
    robo: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4.5V8M9.5 13h.01M14.5 13h.01M9.5 16h5M3 12.5v3M21 12.5v3"/><circle cx="12" cy="4" r="1"/>',
    cubo: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    tesoura: '<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8.3 15.7L18 4M15.7 15.7L6 4"/>',
    cafe: '<path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.8 1 .8 2 0 3M12 3.5c-.8 1 .8 2 0 3"/>',
    doce: '<path d="M6 11h12l-1.5 9h-9z"/><path d="M6 11a6 6 0 0 1 12 0"/><path d="M9.5 14l.5 6M14.5 14l-.5 6"/><circle cx="12" cy="4" r="1.2"/>',
    globo: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.5 3.4 5.3 3.4 8.5s-1.1 6-3.4 8.5c-2.3-2.5-3.4-5.3-3.4-8.5s1.1-6 3.4-8.5z"/>',
    maleta: ECO_ICO.trabalho,
    camadas: '<path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z"/><path d="M3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5"/>',
    foguete: '<path d="M12 15.5l-3.5-3.5c1.4-4.4 4.3-7.6 10-8.5-.9 5.7-4.1 8.6-8.5 10z"/><circle cx="14.5" cy="9.5" r="1.4"/><path d="M8.5 12H5l2.5-3.5h3.2M12 15.5V19l3.5-2.5v-3.2M7 17c-1.5.5-2.2 1.7-2.5 3.5 1.8-.3 3-1 3.5-2.5"/>',
    haltere: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    capelo: ECO_ICO.bolsa,
    lampada: '<path d="M9 17.5h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V17h5v-1.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    modelo: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 9v11"/>',
    caixa: '<path d="M3.5 13.5l2.5-8h12l2.5 8V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z"/><path d="M3.5 13.5h5l1 2.5h5l1-2.5h5"/>',
    livro: META_ICO.livro,
    lua: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    mapa: '<path d="M12 21s-6.5-5.4-6.5-11a6.5 6.5 0 0 1 13 0c0 5.6-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    nota: '<path d="M6 3h8.5L19 7.5V21H6z"/><path d="M14 3v5h5M9 13h7M9 16.5h5"/>'
  };
  var CB_CORES = ['#7c8cff', '#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#a78bfa', '#fb923c', '#2dd4bf', '#f87171'];
  var CB = { recolhidos: LS.ler('jv_cb_recolhidos', {}), arrastes: LS.ler('jv_cb_arrastes', {}), vista: null };

  TELAS.cerebro = function (tela) {
    tela = novo(tela);
    api('mapa').then(function (d) {
      tela.innerHTML = '<div class="cabeca-pagina"><div><h1>Cérebro</h1><p>Seus projetos, estudos e livros do Obsidian, todos ligados. Arraste para mover, role para dar zoom.</p></div>' +
        '<div class="linha cb-ferr"><label class="cb-busca">' + svgIco('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>') + '<input placeholder="Procurar no mapa" data-cb-busca></label>' +
        '<button class="btn-ico" data-cb="menos" aria-label="Diminuir">' + svgIco('<path d="M6 12h12"/>') + '</button><button class="btn-ico" data-cb="mais" aria-label="Aumentar">' + ico('mais') + '</button>' +
        '<button class="btn pequeno" data-cb="centro">Centralizar</button><button class="btn pequeno" data-cb="abrir">Abrir tudo</button></div></div>' +
        (d.cofre ? '' : '<p class="opiniao">Não achei a pasta do Obsidian em <code>' + esc(d.pasta) + '</code>. Mostrando só os livros.</p>') +
        '<section class="cb-palco" data-cb-palco><svg class="cb-svg" data-cb-svg><defs>' +
        '<filter id="cb-sombra" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity=".35"/></filter></defs>' +
        '<g data-cb-mundo><g data-cb-fios></g><g data-cb-nos></g></g></svg>' +
        '<aside class="cb-detalhe" data-cb-detalhe hidden></aside>' +
        '<div class="cb-legenda"><span><i class="ok"></i>feito / lido</span><span><i class="and"></i>em andamento / lendo</span><span><i class="pau"></i>pausado</span><span><i class="nao"></i>ainda não leu</span></div></section>';
      mapaCerebro(tela, d);
    });
  };

  function mapaCerebro(tela, d) {
    var svg = $('[data-cb-svg]', tela), mundo = $('[data-cb-mundo]', tela), gFios = $('[data-cb-fios]', tela), gNos = $('[data-cb-nos]', tela), palco = $('[data-cb-palco]', tela), det = $('[data-cb-detalhe]', tela);
    var NS = 'http://www.w3.org/2000/svg', porId = {}, filhos = {}, pai = {};
    d.nos.forEach(function (n) { porId[n.id] = n; filhos[n.id] = []; });
    d.arestas.forEach(function (a) { filhos[a[0]].push(a[1]); pai[a[1]] = a[0]; });
    var raiz = d.nos[0];
    // cor por ramo
    filhos[raiz.id].forEach(function (id, i) { var cor = CB_CORES[i % CB_CORES.length]; (function pinta(x) { porId[x].cor = cor; filhos[x].forEach(pinta); })(id); });
    raiz.cor = '#a5b4fc';
    var medidor = document.createElement('canvas').getContext('2d');
    var largura = function (n) { medidor.font = (n.tipo === 'raiz' ? '700 17px' : n.tipo === 'ramo' ? '600 15px' : '500 13.5px') + ' Inter, system-ui, sans-serif'; return Math.ceil(medidor.measureText(n.nome).width) + (n.tipo === 'raiz' ? 76 : n.tipo === 'ramo' ? 66 : 58) + (n.livro || n.status ? 26 : 0); };
    var estreito = function () { return palco.clientWidth < 720; };
    var selecionado = null, vista = CB.vista || null;

    function layout() {
      var pos = {}, ROW = 54, colX = estreito() ? [0, 70, 300, 540] : [0, 250, 560, 860];
      pos[raiz.id] = { x: 0, y: 0 };
      var cursor = { '-1': 110, '1': 110 };
      filhos[raiz.id].forEach(function (rid) {
        var lado = estreito() ? 1 : (cursor['-1'] < cursor['1'] ? -1 : 1);
        var y = cursor[lado], linhas = 0;
        var galhos = CB.recolhidos[rid] ? [] : filhos[rid];
        var yg = y + (galhos.length ? 46 : 0);
        galhos.forEach(function (gid) {
          var folhas = CB.recolhidos[gid] ? [] : filhos[gid];
          pos[gid] = { x: lado * colX[2], y: yg, lado: lado };
          folhas.forEach(function (fid, k) { pos[fid] = { x: lado * colX[3], y: yg + k * ROW, lado: lado }; });
          var n = Math.max(1, folhas.length);
          yg += n * ROW + (folhas.length > 1 ? 10 : 0);
          linhas += n;
        });
        pos[rid] = { x: lado * colX[1], y: y, lado: lado };
        cursor[lado] = Math.max(y + 70, yg) + 36;
      });
      Object.keys(pos).forEach(function (id) { var a = CB.arrastes[id]; if (a) { pos[id].x += a[0]; pos[id].y += a[1]; } });
      return pos;
    }

    function curva(a, b, lado) {
      if (a.x === 0 && a.y === 0 && b.lado !== undefined && porId && false) return '';
      var mx = (a.x + b.x) / 2;
      return 'M' + a.x + ',' + a.y + ' C' + mx + ',' + a.y + ' ' + mx + ',' + b.y + ' ' + b.x + ',' + b.y;
    }

    var pos, elNo = {}, elFio = {};
    function desenhar(animar) {
      pos = layout();
      gFios.innerHTML = ''; gNos.innerHTML = ''; elNo = {}; elFio = {};
      var visiveis = Object.keys(pos);
      // espinha (corrente central)
      var ramos = filhos[raiz.id].filter(function (id) { return pos[id]; });
      var maxY = Math.max.apply(null, [0].concat(ramos.map(function (id) { return pos[id].y; })));
      var esp = document.createElementNS(NS, 'path');
      esp.setAttribute('d', 'M0,0 L0,' + maxY);
      esp.setAttribute('class', 'cb-espinha');
      gFios.appendChild(esp);
      ramos.forEach(function (id) { var c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', 0); c.setAttribute('cy', pos[id].y); c.setAttribute('r', 4.5); c.setAttribute('class', 'cb-elo'); c.style.fill = porId[id].cor; gFios.appendChild(c); });
      // fios da árvore
      d.arestas.forEach(function (a) {
        if (!pos[a[0]] || !pos[a[1]]) return;
        var de = a[0] === raiz.id ? { x: 0, y: pos[a[1]].y } : pos[a[0]];
        var p = document.createElementNS(NS, 'path');
        var largDe = a[0] === raiz.id ? 0 : largura(porId[a[0]]) / 2 * (pos[a[1]].lado || 1);
        var origem = { x: de.x + largDe, y: de.y }, destino = { x: pos[a[1]].x - largura(porId[a[1]]) / 2 * (pos[a[1]].lado || 1), y: pos[a[1]].y };
        p.setAttribute('d', curva(origem, destino));
        p.setAttribute('class', 'cb-fio');
        p.style.stroke = porId[a[1]].cor;
        gFios.appendChild(p);
        elFio[a[1]] = { el: p, de: a[0] };
      });
      // ligações extras ([[links]])
      d.extras.forEach(function (x) {
        if (!pos[x[0]] || !pos[x[1]]) return;
        var a = pos[x[0]], b = pos[x[1]], p = document.createElementNS(NS, 'path');
        var meio = (a.x + b.x) / 2 + (Math.abs(a.y - b.y) > 200 ? (a.lado || 1) * 120 : 0);
        p.setAttribute('d', 'M' + a.x + ',' + a.y + ' Q' + meio + ',' + ((a.y + b.y) / 2) + ' ' + b.x + ',' + b.y);
        p.setAttribute('class', 'cb-extra');
        p.dataset.a = x[0]; p.dataset.b = x[1];
        gFios.insertBefore(p, gFios.firstChild);
      });
      // nós
      visiveis.forEach(function (id, ordem) {
        var n = porId[id], p = pos[id], w = largura(n), h = n.tipo === 'raiz' ? 54 : n.tipo === 'ramo' ? 44 : 38;
        var g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'cb-no cb-' + n.tipo + (selecionado === id ? ' sel' : ''));
        g.setAttribute('transform', 'translate(' + p.x + ',' + p.y + ')');
        g.dataset.id = id;
        if (animar) g.style.animationDelay = Math.min(ordem * 18, 700) + 'ms';
        var qtd = filhos[id].length, recolhido = CB.recolhidos[id];
        var marcador = '';
        if (n.livro) marcador = n.livro === 'lido' ? '<g class="cb-marca ok"><circle r="9"/><path d="M-3.8 .2l2.6 2.6 5-5.2"/></g>' : n.livro === 'lendo' ? '<g class="cb-marca and"><circle r="9"/><path d="M-4 0h8"/></g>' : '<g class="cb-marca nao"><circle r="9"/><path d="M-3 -3l6 6M3 -3l-6 6"/></g>';
        else if (n.status) marcador = n.status === 'ok' ? '<g class="cb-marca ok"><circle r="9"/><path d="M-3.8 .2l2.6 2.6 5-5.2"/></g>' : n.status === 'pausado' ? '<g class="cb-marca pau"><circle r="9"/><path d="M-2 -3.5v7M2 -3.5v7"/></g>' : n.status === 'ideia' ? '<g class="cb-marca ideia"><circle r="9"/><path d="M0 -4.5l1.2 3.3 3.3 1.2-3.3 1.2L0 4.5l-1.2-3.3-3.3-1.2 3.3-1.2z" fill="currentColor"/></g>' : '<g class="cb-marca and"><circle r="9"/><path d="M-4 0h8"/></g>';
        var ic = (n.tipo === 'raiz' ? 30 : 24), icx = -w / 2 + h / 2;
        g.innerHTML = '<rect class="cb-caixa" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="' + (h / 2) + '" filter="url(#cb-sombra)"/>' +
          '<circle class="cb-bola" cx="' + icx + '" cy="0" r="' + (h / 2 - 5) + '" style="fill:' + n.cor + '22;stroke:' + n.cor + '66"/>' +
          '<svg class="cb-ico" x="' + (icx - ic / 2 + 3) + '" y="' + (-ic / 2 + 3) + '" width="' + (ic - 6) + '" height="' + (ic - 6) + '" viewBox="0 0 24 24" fill="none" stroke="' + n.cor + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (CB_ICO[n.icone] || CB_ICO.nota) + '</svg>' +
          '<text class="cb-texto" x="' + (icx + h / 2 + 4) + '" y="0" dominant-baseline="central">' + esc(n.nome) + '</text>' +
          (marcador ? '<g transform="translate(' + (w / 2 - 20) + ',0)">' + marcador + '</g>' : '') +
          (qtd && n.tipo !== 'raiz' ? '<g class="cb-contador" data-recolher="' + id + '" transform="translate(' + ((p.lado || 1) * (w / 2 + 14)) + ',0)"><circle r="11"/><text dominant-baseline="central" text-anchor="middle">' + (recolhido ? '+' + qtd : '−') + '</text></g>' : '');
        gNos.appendChild(g);
        elNo[id] = g;
      });
      marcarCaminho();
    }

    function marcarCaminho() {
      $$('.cb-fio', gFios).forEach(function (f) { f.classList.remove('ativo'); });
      $$('.cb-no', gNos).forEach(function (g) { g.classList.toggle('sel', g.dataset.id === selecionado); });
      var caminho = {};
      if (selecionado) {
        var x = selecionado;
        while (x) { caminho[x] = true; if (elFio[x]) elFio[x].el.classList.add('ativo'); x = pai[x]; }
        (function desce(y) { filhos[y].forEach(function (f) { caminho[f] = true; if (elFio[f]) elFio[f].el.classList.add('ativo'); desce(f); }); })(selecionado);
      }
      $$('.cb-extra', gFios).forEach(function (x) {
        var liga = !!selecionado && (x.dataset.a === selecionado || x.dataset.b === selecionado);
        x.classList.toggle('ativo', liga);
        if (liga) { caminho[x.dataset.a] = true; caminho[x.dataset.b] = true; }
      });
      $$('.cb-no', gNos).forEach(function (g) { g.classList.toggle('apagado', !!selecionado && !caminho[g.dataset.id]); });
    }

    // ---------- câmera: arrastar, zoom e pinça
    var cam = vista || { x: 0, y: 0, k: 1 };
    function aplicarCam() { mundo.setAttribute('transform', 'translate(' + cam.x + ',' + cam.y + ') scale(' + cam.k + ')'); CB.vista = cam; }
    function centralizar() {
      var b = mundo.getBBox(), W = palco.clientWidth, H = palco.clientHeight;
      var k = Math.min(1.1, Math.max(.35, (W - 40) / (estreito() ? Math.min(b.width, 620) : b.width)));
      cam = { k: k, x: estreito() ? 24 - (b.x + 30) * k + 10 : W / 2 - (b.x + b.width / 2) * k, y: 70 - 0 };
      aplicarCam();
    }
    function zoom(f, cx, cy) {
      var k = Math.min(2.5, Math.max(.25, cam.k * f));
      cx = cx == null ? palco.clientWidth / 2 : cx; cy = cy == null ? palco.clientHeight / 2 : cy;
      cam.x = cx - (cx - cam.x) * (k / cam.k); cam.y = cy - (cy - cam.y) * (k / cam.k); cam.k = k; aplicarCam();
    }
    var ponteiros = {}, arrasto = null, pinca = null;
    svg.addEventListener('pointerdown', function (e) {
      ponteiros[e.pointerId] = { x: e.clientX, y: e.clientY };
      svg.setPointerCapture(e.pointerId);
      var ids = Object.keys(ponteiros);
      if (ids.length === 2) {
        var a = ponteiros[ids[0]], b = ponteiros[ids[1]];
        pinca = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: cam.k }; arrasto = null; return;
      }
      var no = e.target.closest('.cb-no'), cont = e.target.closest('[data-recolher]');
      arrasto = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, no: no && !cont ? no.dataset.id : null, cont: cont ? cont.dataset.recolher : null, moveu: false, base: no ? (CB.arrastes[no.dataset.id] || [0, 0]).slice() : null };
    });
    svg.addEventListener('pointermove', function (e) {
      if (!ponteiros[e.pointerId]) return;
      ponteiros[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pinca) {
        var ids = Object.keys(ponteiros); if (ids.length < 2) return;
        var a = ponteiros[ids[0]], b = ponteiros[ids[1]], r = palco.getBoundingClientRect();
        zoom(pinca.k * Math.hypot(a.x - b.x, a.y - b.y) / pinca.dist / cam.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        return;
      }
      if (!arrasto) return;
      var dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) arrasto.moveu = true;
      if (!arrasto.moveu) return;
      if (arrasto.no && arrasto.no !== raiz.id) {
        CB.arrastes[arrasto.no] = [arrasto.base[0] + dx / cam.k, arrasto.base[1] + dy / cam.k];
        moverNo(arrasto.no);
      } else { cam.x = arrasto.cx + dx; cam.y = arrasto.cy + dy; aplicarCam(); }
    });
    var soltar = function (e) {
      delete ponteiros[e.pointerId];
      if (pinca) { if (Object.keys(ponteiros).length < 2) pinca = null; return; }
      if (!arrasto) return;
      var a = arrasto; arrasto = null;
      if (a.moveu) { if (a.no) LS.gravar('jv_cb_arrastes', CB.arrastes); return; }
      if (a.cont) { CB.recolhidos[a.cont] = !CB.recolhidos[a.cont]; LS.gravar('jv_cb_recolhidos', CB.recolhidos); desenhar(false); return; }
      if (a.no) { selecionado = a.no; marcarCaminho(); mostrarDetalhe(porId[a.no]); }
      else { selecionado = null; marcarCaminho(); det.hidden = true; }
    };
    svg.addEventListener('pointerup', soltar);
    svg.addEventListener('pointercancel', soltar);
    svg.addEventListener('wheel', function (e) { e.preventDefault(); var r = palco.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top); }, { passive: false });

    function moverNo(id) {
      // redesenha só a posição do nó e dos fios ligados a ele
      var p0 = layout();
      pos = p0;
      var g = elNo[id]; if (g) g.setAttribute('transform', 'translate(' + p0[id].x + ',' + p0[id].y + ')');
      [id].concat(filhos[id]).forEach(function (f) {
        var fio = elFio[f]; if (!fio || !p0[f]) return;
        var de = fio.de === raiz.id ? { x: 0, y: p0[f].y } : p0[fio.de];
        var largDe = fio.de === raiz.id ? 0 : largura(porId[fio.de]) / 2 * (p0[f].lado || 1);
        fio.el.setAttribute('d', curva({ x: de.x + largDe, y: de.y }, { x: p0[f].x - largura(porId[f]) / 2 * (p0[f].lado || 1), y: p0[f].y }));
      });
    }

    function mostrarDetalhe(n) {
      var st = n.livro ? { lido: 'Lido', lendo: 'Lendo agora', quero: 'Ainda não leu' }[n.livro] : n.status_txt || '';
      var qtd = filhos[n.id].length;
      det.hidden = false;
      det.style.setProperty('--cor', n.cor);
      det.innerHTML = '<button class="btn-ico cb-fechar" aria-label="Fechar">' + svgIco('<path d="M6 6l12 12M18 6L6 18"/>') + '</button>' +
        '<div class="cb-det-ico">' + svgIco(CB_ICO[n.icone] || CB_ICO.nota) + '</div><h3>' + esc(n.nome) + '</h3>' +
        (st ? '<span class="selo ' + (n.livro === 'lido' || n.status === 'ok' ? 'lido' : n.livro === 'lendo' || n.status === 'andamento' ? 'lendo' : '') + '">' + esc(st) + '</span>' : '') +
        (n.resumo ? '<p>' + esc(n.resumo) + '</p>' : '') +
        (qtd ? '<p class="mini">' + qtd + (qtd === 1 ? ' ligação' : ' ligações') + ' abaixo</p>' : '') +
        '<div class="linha">' + (n.abrir ? '<a class="btn cheio pequeno" href="' + esc(n.abrir) + '">Abrir no Obsidian</a>' : '') +
        (n.livro ? '<a class="btn pequeno" href="#estudos">Ver na estante</a>' : '') + '</div>';
      $('.cb-fechar', det).addEventListener('click', function () { det.hidden = true; selecionado = null; marcarCaminho(); });
    }

    // ---------- ferramentas
    $$('[data-cb]', tela).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.dataset.cb;
        if (a === 'mais') zoom(1.2); else if (a === 'menos') zoom(1 / 1.2);
        else if (a === 'centro') { CB.arrastes = {}; LS.gravar('jv_cb_arrastes', {}); desenhar(false); centralizar(); }
        else if (a === 'abrir') { CB.recolhidos = {}; LS.gravar('jv_cb_recolhidos', {}); desenhar(true); }
      });
    });
    $('[data-cb-busca]', tela).addEventListener('input', function (e) {
      var q = e.target.value.trim().toLowerCase();
      if (!q) { selecionado = null; marcarCaminho(); det.hidden = true; return; }
      var achado = d.nos.filter(function (n) { return n.nome.toLowerCase().indexOf(q) >= 0; })[0];
      if (!achado) return;
      var x = pai[achado.id], mudou = false;
      while (x) { if (CB.recolhidos[x]) { CB.recolhidos[x] = false; mudou = true; } x = pai[x]; }
      if (mudou) desenhar(false);
      selecionado = achado.id; marcarCaminho(); mostrarDetalhe(achado);
      var p = pos[achado.id];
      cam.x = palco.clientWidth / 2 - p.x * cam.k; cam.y = palco.clientHeight / 2 - p.y * cam.k; aplicarCam();
    });

    desenhar(true);
    if (vista) aplicarCam(); else centralizar();
  }

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
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Sincronização</h2></header>' +
        '<p>O Jarvis mora no seu PC. Longe dele (ou com ele desligado), o celular guarda tudo e manda sozinho quando o PC aparecer. Se o mesmo item foi mudado nos dois, vale a mudança mais recente.</p>' +
        '<p class="mini">Na fila agora: <strong>' + fila().length + '</strong> · Última sincronização: ' + (rede.ultima ? br(rede.ultima) + ' às ' + rede.ultima.slice(11, 16) : 'nenhuma') + '</p>' +
        '<p class="mini">Funciona offline: missões, hábitos, refeições, treino, peso, estudos, livros e diário de comida (a IA calcula quando sincronizar). Precisa do PC: chat, opinião e balanço da IA, loja e Spotify.</p>' +
        '<button type="button" class="btn" data-sinc-agora>Sincronizar agora</button></section>' +
        '<section class="painel c-6"><header><h2 class="titulo-pixel">IFRO: atividades</h2><span class="selo ' + (d.ifro_ical ? 'lido' : '') + '">' + (d.ifro_ical ? 'Ligado' : 'Desligado') + '</span></header>' +
        '<form data-ifro style="display:grid;gap:10px"><p class="mini" style="margin:0">As atividades novas entram sozinhas como missões, com a data de entrega, e aparecem em Novidades.</p>' +
        '<ol class="mini" style="margin:0;padding-left:18px"><li>Entre no Moodle do IFRO e abra o <em>Calendário</em>.</li><li>Clique em <em>Importar ou exportar calendários</em> › <em>Exportar calendário</em>.</li><li>Marque <em>Todos os cursos</em> e <em>Eventos recentes e próximos</em>, clique em <em>Obter URL do calendário</em> e cole o link aqui.</li></ol>' +
        '<label class="campo">Link do calendário (.ics)<input name="ical" value="' + esc(d.ifro_ical) + '" placeholder="https://...export_execute.php?..." autocomplete="off"></label>' +
        (d.ifro_erro ? '<p class="mini" style="color:var(--perigo);margin:0">' + esc(d.ifro_erro) + '</p>' : d.ifro_ultima ? '<p class="mini" style="margin:0">Última busca: ' + br(d.ifro_ultima) + ' às ' + d.ifro_ultima.slice(11, 16) + '</p>' : '') +
        '<div class="linha"><button class="btn cheio">Salvar</button><button type="button" class="btn" data-ifro-agora' + (d.ifro_ical ? '' : ' disabled') + '>Buscar agora</button></div></form></section>' +
        '<section class="painel c-6"><header><h2 class="titulo-pixel">Claude</h2><span class="selo lido">Ligado</span></header>' +
        '<p>Fale com o Claude no app dele (com o PC conectado) e ele mexe aqui por você: "me lembra de estudar X na quinta", "terminei o livro Y", "marca o treino de hoje".</p>' +
        '<p class="mini">O que o Claude fizer aparece em <strong>Novidades</strong>, na tela Hoje, com o XP já contado.</p></section>' +
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
      $('[data-sinc-agora]', tela).addEventListener('click', function () { (fila().length ? sincronizar() : verificarPc()).then(function () { if (!fila().length && !rede.offline) toast('Tudo em dia com o PC.'); }); });
      var fif = $('[data-ifro]', tela);
      fif.addEventListener('submit', function (e) { e.preventDefault(); api('ajustes_salvar', { ifro_ical: fif.ical.value }).then(function () { toast('Calendário do IFRO salvo.'); return fif.ical.value.trim() ? api('ifro_atualizar', {}) : null; }).then(function (r) { if (r) toast(r.novos ? r.novos + ' atividade(s) nova(s) do IFRO viraram missões.' : 'Calendário lido. Nenhuma atividade nova.'); TELAS.ajustes(tela); }).catch(function () {}); });
      $('[data-ifro-agora]', tela).addEventListener('click', function (e) { var b = e.currentTarget; b.disabled = true; b.textContent = 'Buscando...'; api('ifro_atualizar', {}).then(function (r) { toast(r.novos ? r.novos + ' atividade(s) nova(s) do IFRO viraram missões.' : 'Nenhuma atividade nova no IFRO.'); }).catch(function () {}).then(function () { TELAS.ajustes(tela); }); });
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
      pedir(instalar ? 'instalar' : 'entrar', { senha: f.senha.value }).then(function (r) { CSRF = r.csrf; estado.instalado = true; LS.gravar('jv_c:estado', { instalado: true, logado: true, csrf: r.csrf }); iniciarApp(); }).catch(function (e) { if (e.rede) toast('Sem conexão com o Jarvis do PC.', 'erro'); });
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

  var VERSAO = '5';
  function atualizarApp() {
    try { if (sessionStorage.getItem('jv_atualizou') === VERSAO) return false; sessionStorage.setItem('jv_atualizou', VERSAO); } catch (e) { return false; }
    var limpar = [];
    if ('serviceWorker' in navigator) limpar.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.update(); })); }));
    if (window.caches) limpar.push(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('fontes') < 0; }).map(function (k) { return caches.delete(k); })); }));
    Promise.all(limpar).catch(function () {}).then(function () { location.reload(); });
    return true;
  }
  pedir('estado').then(function (s) {
    if (s.versao && s.versao !== VERSAO && atualizarApp()) return;
    CSRF = s.csrf;
    estado.instalado = s.instalado;
    LS.gravar('jv_c:estado', s);
    if (s.logado) iniciarApp(); else telaLogin();
  }).catch(function () {
    var s = LS.ler('jv_c:estado', null);
    if (s && s.logado) { CSRF = s.csrf; estado.instalado = true; iniciarApp(); return; }
    $('#app').innerHTML = '<div class="login"><div class="painel"><span class="boot-logo">OFFLINE</span><p>Não encontrei o Jarvis do PC. Na primeira vez, abra com o PC ligado para o aparelho guardar tudo. Depois ele funciona offline.</p></div></div>';
  });
})();

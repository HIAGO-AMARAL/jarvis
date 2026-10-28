# J.A.R.V.I.S: assistente pessoal gamificado

Aplicativo web pessoal (PWA) que organiza o dia como um RPG: missões da semana valem XP, hábitos diários dão bônus de sequência, e as moedas ganhas compram temas, mascotes e títulos. Tem um assistente com IA (Gemini) que conhece as suas missões, treino e leituras, e um painel do Spotify.

Instala no celular e no computador como um app, e sincroniza pelos dois.

## Funcionalidades

- **Missões da semana:** planejamento dia a dia, com dificuldade (Fácil +10, Média +25, Difícil +50, Chefão +100 XP)
- **Hábitos diários** com combo (+20 XP ao completar todos) e contador de dias seguidos
- **Diário de comida com IA:** escreva o que comeu e o Gemini estima calorias e macros; gráfico da semana contra a meta e balanço semanal feito pela IA
- **Meu Jardim:** cada semana planta uma árvore em pixel art que cresce a cada dia bem cumprido (XP do dia acima da meta); as semanas formam uma floresta
- **Saúde:** treino por dia da semana, cardápio com check de refeições e gráfico de peso
- **Estudos e leituras:** trilha de estudos e estante de livros com nota de 1 a 5 e resumo
- **Jarvis (IA):** chat com contexto do dia e **opinião sobre o resumo de cada livro**, via API do Gemini
- **Gamificação:** XP, níveis, moedas e loja com 10 temas (HUD, portátil retrô, synthwave, código verde, taverna, abismo, neon city, mangá bizarro, Halloween, mistério), 9 mascotes em pixel art com animações próprias (até 3 andando juntos) e mascotes enviados pelo usuário, títulos, efeitos de partícula e som 8 bits
- **Spotify:** música tocando agora com controles, top músicas, top artistas, gêneros e histórico (OAuth com PKCE, direto do navegador)
- **PWA:** instalável, abre rápido com service worker
- **Visual Nexus (v4):** tema limpo de vidro escuro com ícones animados no menu (calendário com o dia, marcador de missão, corredor, livro folheando...)
- **Caixa do Claude:** o Claude grava ações em `data/claude/*.json` (mesmo formato da sincronização) e o Jarvis aplica na próxima abertura, mostrando em *Novidades*
- **Calendário do IFRO:** importa o link .ics do Moodle e transforma atividades novas em missões com a data de entrega
- **Offline-first:** longe do servidor, as telas abrem com a última cópia guardada e cada ação vai para uma fila com o horário em que foi feita; quando o servidor aparece, a fila é aplicada em ordem (`?r=sync`). Conflito entre aparelhos: vale a edição mais recente (carimbo por item), e itens criados offline recebem id provisório que o servidor troca pelo definitivo

## Tecnologias

- **Back-end:** PHP 8 sem framework, API JSON, SQLite
- **Front-end:** JavaScript puro (SPA), CSS com temas por variáveis, SVG pixel art
- **IA:** Google Gemini (`generateContent`), chave guardada só no servidor
- **Integrações:** Spotify Web API (Authorization Code + PKCE)
- **Segurança:** senha com `password_hash`, sessão com cookie `HttpOnly`/`SameSite`, token CSRF em toda escrita, bloqueio após 5 tentativas de login, pastas de dados bloqueadas pelo `.htaccess`

## Estrutura

```
api.php          # API JSON (?r=rota)
index.php        # casca do app
lib/             # banco, login, IA (Gemini) e regras do jogo
assets/          # app.js, app.css, ícones
sw.js            # service worker (PWA)
servidor.php     # roteador para o servidor embutido do PHP
windows/         # instalar, iniciar e parar o Jarvis no Windows
data/            # banco SQLite e imagens (não versionado)
```

## Rodar no próprio PC (sem hospedagem)

O Jarvis pode morar no seu computador: o PC é o servidor e o celular funciona offline, sincronizando quando alcança o PC.

1. Baixe o projeto e rode `windows/instalar-no-windows.bat`. Ele instala o PHP (winget), faz o Jarvis ligar junto com o Windows e publica o app na sua rede privada do [Tailscale](https://tailscale.com) com HTTPS.
2. Instale o Tailscale no celular com a mesma conta e abra o endereço `https://NOME-DO-PC.SEU-TAILNET.ts.net` no PC e no celular. Instale como app nos dois.

`servidor.php` faz o papel do `.htaccess` no servidor embutido do PHP (bloqueia `data/`, `lib/` e arquivos internos).

## Rodar localmente

```bash
php -S localhost:8080 servidor.php
```

Abra `http://localhost:8080`, crie a senha no primeiro acesso e coloque a chave do Gemini em **Ajustes** (grátis em [aistudio.google.com](https://aistudio.google.com)).
Requer PHP 8.1+ com `pdo_sqlite` e `curl`.

---

Desenvolvido por **Hiago Amaral**, com apoio de IA (Claude Code).

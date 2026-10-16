# J.A.R.V.I.S: assistente pessoal gamificado

Aplicativo web pessoal (PWA) que organiza o dia como um RPG: missões da semana valem XP, hábitos diários dão bônus de sequência, e as moedas ganhas compram temas, mascotes e títulos. Tem um assistente com IA (Gemini) que conhece as suas missões, treino e leituras, e um painel do Spotify.

Instala no celular e no computador como um app, e sincroniza pelos dois.

## Funcionalidades

- **Missões da semana:** planejamento dia a dia, com dificuldade (Fácil +10, Média +25, Difícil +50, Chefão +100 XP)
- **Hábitos diários** com combo (+20 XP ao completar todos) e contador de dias seguidos
- **Saúde:** treino por dia da semana, cardápio com check de refeições e gráfico de peso
- **Estudos e leituras:** trilha de estudos e estante de livros com nota de 1 a 5 e resumo
- **Jarvis (IA):** chat com contexto do dia e **opinião sobre o resumo de cada livro**, via API do Gemini
- **Gamificação:** XP, níveis, moedas e loja com 5 temas (HUD, portátil retrô, synthwave, código verde, taverna), mascotes em pixel art que andam pela tela, títulos, efeitos de partícula e som 8 bits
- **Spotify:** música tocando agora com controles, top músicas, top artistas, gêneros e histórico (OAuth com PKCE, direto do navegador)
- **PWA:** instalável, abre rápido com service worker

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
data/            # banco SQLite e imagens (não versionado)
```

## Rodar localmente

```bash
php -S localhost:8080
```

Abra `http://localhost:8080`, crie a senha no primeiro acesso e coloque a chave do Gemini em **Ajustes** (grátis em [aistudio.google.com](https://aistudio.google.com)).
Requer PHP 8.1+ com `pdo_sqlite` e `curl`.

---

Desenvolvido por **Hiago Amaral**, com apoio de IA (Claude Code).

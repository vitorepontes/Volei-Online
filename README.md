# 🏐 Vôlei Online — Notícias e Agenda com IA

## O que a IA faz

A IA (Gemini) opera **nos bastidores**, sem assistente de chat na tela. Ela não inventa conteúdo: busca notícias reais de vôlei num feed RSS (Google News) e usa o Gemini só para resumir/estruturar o que já é real.

Cada atualização roda a busca **duas vezes**: uma com foco em vôlei de quadra (`modalidade='quadra'`) e outra em vôlei de praia (`modalidade='praia'`), para notícias e para eventos.

| Quando | O que acontece |
|---|---|
| **Todo dia às 8h** (cron) | Busca no RSS uma notícia real de quadra e uma de praia ainda não publicadas e, se achar notícias reais sobre torneio/campeonato, adiciona também eventos na agenda (quadra e praia) |
| **Rota `POST /ia/atualizar`** | Força uma atualização imediata (uso manual/teste, ex. via Postman/curl) |

A atualização **não roda mais ao iniciar o servidor** — só pelo cron das 8h ou chamando `POST /ia/atualizar` manualmente. Isso evita gastar cota da API do Gemini toda vez que o servidor é reiniciado durante o desenvolvimento.

Se não houver notícia ou evento novo no feed, nada é inserido — o sistema nunca inventa conteúdo fictício. O conteúdo gerado é salvo no PostgreSQL com a flag `gerada_ia = true`.

---

## Configuração rápida

### 1. Instalar dependências
```bash
npm install
```

### 2. Banco de dados (Neon/PostgreSQL)
As tabelas (`noticias`, `agenda`, `usuarios`) são criadas automaticamente na primeira execução — não é preciso rodar nenhum script SQL manual.

### 3. Configurar variáveis de ambiente
```bash
cp .env.example .env
```
Edite o `.env`:
```
DATABASE_URL=postgresql://usuario:senha@host/banco?sslmode=require
GEMINI_API_KEY=sua_chave_aqui
RESEND_API_KEY=re_sua_chave_aqui
```
- String de conexão: painel do seu projeto no [Neon](https://neon.tech)
- Chave da API Gemini: https://aistudio.google.com/apikey
- Chave da API Resend (envio do e-mail de redefinição de senha): https://resend.com/api-keys

### 4. Rodar
```bash
npm start
```
Acesse: **http://localhost:3000**

---

## Rotas da API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/noticias?modalidade=` | Lista notícias (`modalidade` opcional: `quadra` ou `praia`) |
| `POST` | `/noticias` | Cadastra notícia manualmente |
| `GET` | `/agenda?modalidade=` | Lista eventos (`modalidade` opcional: `quadra` ou `praia`) |
| `POST` | `/agenda` | Cadastra evento manualmente |
| `DELETE` | `/agenda/:id` | Remove evento |
| `GET` | `/aulas?nivel=&modalidade=` | Lista aulas (filtros opcionais e combináveis) |
| `POST` | `/cadastro` | Cadastra usuário — exige `nome`, `username`, `email`, `senha` (senha com hash bcrypt) |
| `POST` | `/login` | Autentica usuário |
| `PUT` | `/usuarios/:id` | Edita `username`, `bio`, `time_jogo`, `posicao_preferida` e `nivel` (não altera nome completo, email ou senha) |
| `GET` | `/usuarios/publico/:username` | Perfil público — retorna só `{ username, bio, time_jogo, posicao_preferida, nivel }`, nunca nome/email/senha |
| `POST` | `/esqueci-senha` | Envia (via Resend) um link de redefinição de senha para o e-mail informado, se existir conta |
| `POST` | `/resetar-senha` | Redefine a senha a partir de um token válido (`token`, `novaSenha`) |
| `POST` | `/ia/atualizar` | Força geração IA agora |

**Rotas mantidas mas não mais usadas pelo front-end**: `POST /progresso` e `GET /progresso/:usuario_id` — existiam para marcar aulas concluídas e avançar o nível automaticamente. Essa lógica de avanço automático foi removida: agora o campo `nivel` é editado livremente pelo próprio usuário em `perfil.html` (via `PUT /usuarios/:id`). A tabela `progresso` continua no banco, sem uso.

---

## Identidade pública vs. dados privados

Desde a introdução de contas com `username`, o **nome de usuário é o identificador público** (o que será usado futuramente num fórum da comunidade) — é ele que aparece no perfil, e é o único campo de identidade exposto pela rota pública `GET /usuarios/publico/:username`.

O **nome completo (`nome`) é um dado privado**: fica salvo no banco (útil, por exemplo, para personalizar o e-mail de redefinição de senha, "Olá, fulano!") mas nunca é retornado por nenhuma rota pública — só a própria pessoa autenticada o recebe, nas respostas de `/login` e `/cadastro`.

---

## Redefinição de senha (Resend)

O fluxo `esqueci-senha.html` → `resetar-senha.html` usa a API do [Resend](https://resend.com) para enviar o e-mail com o link de redefinição, a partir do endereço de teste `onboarding@resend.dev` — esse domínio é fornecido pelo próprio Resend para testes, funciona sem precisar verificar um domínio próprio, mas é **limitado a 100 e-mails/dia**. Isso é adequado para fins acadêmicos e de demonstração; para um uso real em produção seria necessário verificar um domínio próprio no Resend.

Por segurança, `POST /esqueci-senha` sempre responde com a mesma mensagem genérica de sucesso, exista ou não uma conta com aquele e-mail — isso evita que alguém use essa rota para descobrir quais e-mails têm cadastro no site. Se `RESEND_API_KEY` não estiver configurada, o servidor não quebra: ele só imprime o link de redefinição no console (útil para testar o fluxo localmente sem depender de um envio de e-mail real).

Cada token de redefinição expira em 30 minutos e só pode ser usado uma vez (tabela `senha_resets`).

---

## Controle de acesso das páginas (aulas e perfil)

As páginas `aulas.html` e `perfil.html` só carregam seu conteúdo se houver um usuário salvo em `localStorage` (`usuarioLogado`); caso contrário, redirecionam para `login.html`.

**Isso é apenas uma barreira de experiência de uso no front-end, não uma proteção de segurança real.** Qualquer pessoa pode abrir o DevTools, criar essa chave manualmente no `localStorage` e "logar" sem senha, ou chamar as rotas da API (`/aulas`, `/progresso`, `/usuarios/:id`, etc.) diretamente, sem passar pela tela de login — o backend não verifica sessão/token em nenhuma dessas rotas. Para uma aplicação real em produção, isso exigiria autenticação por sessão ou token (JWT, por exemplo) validada no servidor a cada requisição. Para o escopo deste projeto acadêmico, o controle via `localStorage` é suficiente.

---

## Sem a chave da IA

Se `GEMINI_API_KEY` não estiver no `.env`, o servidor funciona normalmente (notícias manuais, agenda manual, login/cadastro). A geração automática é simplesmente pulada com um aviso no console.

---

## Estrutura do projeto

- `index.html`, `login.html`, `aulas.html`, `noticias.html`, `agenda.html`, `perfil.html`, `esqueci-senha.html`, `resetar-senha.html` — páginas do site (HTML/CSS/JS puro)
- `style.css` — estilos de todas as páginas, com variáveis de tema em `:root`
- `app.js` — comportamento compartilhado do header (estado de login — o botão de conta vira link pro perfil quando logado —, menu mobile)
- `server.js` — backend Node/Express (banco, autenticação, rotas e geração de conteúdo via IA)
- `historico/` — código de etapas anteriores da disciplina (`classes.js`, `logica.js`), mantido para referência histórica mas não usado pelo site atual

## Modelo de dados (tabelas principais)

- `usuarios` — conta do usuário (`nome` privado, `username` público e único, `email`, `senha` com hash, `nivel`, `posicao_preferida`, `bio`, `time_jogo`)
- `noticias` / `agenda` — conteúdo exibido no site, com `modalidade` (`quadra`/`praia`, opcional)
- `aulas` — catálogo de vídeos de aula (`titulo`, `nivel`, `fundamento`, `modalidade`, `url_video`, `ordem`)
- `senha_resets` — tokens de redefinição de senha (`usuario_id`, `token`, `expira_em`, `usado_em`)
- `progresso` — tabela legada, ainda existe no banco mas não é mais usada pelo front-end (ver seção "Rotas da API")

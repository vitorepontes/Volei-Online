# 🏐 Vôlei Online

> Um site para **aprender, praticar e acompanhar o vôlei**, de quadra e de praia, reunindo aulas em vídeo, notícias reais, agenda de campeonatos e uma comunidade em um só lugar.

![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white)
![Gemini](https://img.shields.io/badge/IA-Google%20Gemini-8E75B2)
![Deploy](https://img.shields.io/badge/Deploy-Render-46E3B7)

Projeto de Extensão do curso de Engenharia de Software da **UniFil**, desenvolvido por **Vitor Emanoel Pontes Jacinto** e **Paulo Henrique Farias Lima**.

## 🔗 Links

| | |
|---|---|
| 🌐 Aplicação em produção | https://volei-online.onrender.com |
| 📚 Portfólio e documentação (GitHub Pages) | https://vitorepontes.github.io/Volei-Online/docs/ |
| 💻 Código-fonte | https://github.com/vitorepontes/Volei-Online |

> ⏳ A aplicação roda no plano gratuito do Render, que **hiberna após um tempo sem acessos**. O primeiro acesso depois disso pode levar de 30 a 50 segundos para responder; depois funciona normalmente.

---

## 📖 Sobre o projeto

Mesmo sendo um dos esportes mais populares do Brasil, é difícil encontrar um lugar que reúna tudo sobre vôlei: os vídeos de treino ficam espalhados, as notícias estão em portais generalistas e há pouco conteúdo organizado para quem está começando. O Vôlei Online junta isso em um único site.

### Funcionalidades

- **Aulas em vídeo** organizadas por fundamento (saque, manchete, toque, levantamento, bloqueio e ataque) e por nível (iniciante, intermediário e avançado), com alternância entre **quadra** e **praia**. Exige login.
- **Notícias reais**: buscadas automaticamente em um feed RSS do Google Notícias e resumidas pela IA, sempre com o link da matéria original.
- **Agenda de eventos** com campeonatos e torneios futuros; eventos que já passaram deixam de aparecer.
- **Filtro Quadra / Praia** em Aulas, Notícias e Agenda.
- **Cadastro e login** com senha protegida por hash (bcrypt) e **recuperação de senha por e-mail**.
- **Perfil** editável (nome de usuário, bio, time em que joga, posição preferida e nível) e **perfil público** de qualquer usuário.
- **Fórum**: chat global entre os usuários, com respostas a mensagens específicas.
- Layout responsivo (funciona em celular) e preocupação com acessibilidade (navegação por teclado, `aria-live`, contraste).

### Diferenciais

- **A IA não inventa conteúdo.** Ela só resume e estrutura notícias e eventos que já existem no feed RSS. Se não há nada novo, nada é inserido.
- **Privacidade por padrão.** O nome completo do usuário é um dado privado; no site (perfil público e fórum) aparece apenas o nome de usuário.
- **Custo zero.** Toda a stack usa planos gratuitos (Render, Neon, Gemini, Resend, GitHub Pages).

---

## 🧰 Tecnologias

| Camada | Tecnologia |
|---|---|
| Front-end | HTML, CSS e JavaScript puro |
| Back-end | Node.js e Express 5 |
| Banco de dados | PostgreSQL hospedado no [Neon](https://neon.tech) |
| Autenticação | bcrypt (hash de senha) |
| IA | [Google Gemini API](https://ai.google.dev) (`@google/generative-ai`) |
| Fonte de notícias | RSS do Google Notícias (`rss-parser`) |
| E-mail | [Resend](https://resend.com) |
| Agendamento | `node-cron` |
| Hospedagem | [Render](https://render.com) (aplicação) e GitHub Pages (portfólio) |

---

## 🚀 Como executar localmente

### Pré-requisitos

- [Node.js](https://nodejs.org) 18 ou superior
- Um banco PostgreSQL. A forma mais simples é criar um projeto gratuito no [Neon](https://neon.tech) e copiar a *connection string*
- (Opcional) Chave da API do Gemini e do Resend

### Passo a passo

```bash
# 1. Clonar o repositório
git clone https://github.com/vitorepontes/Volei-Online.git
cd Volei-Online

# 2. Instalar as dependências
npm install

# 3. Criar o arquivo de variáveis de ambiente
cp .env.example .env      # no Windows (PowerShell): copy .env.example .env

# 4. Editar o .env com seus valores (veja a tabela abaixo)

# 5. Iniciar o servidor
npm start
```

Acesse **http://localhost:3000**.

As tabelas são criadas automaticamente na primeira execução, não é preciso rodar nenhum script SQL. As aulas e alguns conteúdos iniciais (notícias e eventos) também são inseridos automaticamente.

Para desenvolvimento com recarga automática, use `npm run dev`.

### Variáveis de ambiente

| Variável | Obrigatória | Para que serve | Onde obter |
|---|---|---|---|
| `DATABASE_URL` | **Sim** | String de conexão do PostgreSQL | Painel do projeto no [Neon](https://neon.tech) |
| `GEMINI_API_KEY` | Não | Resumo de notícias e eventos pela IA | https://aistudio.google.com/apikey |
| `RESEND_API_KEY` | Não | Envio do e-mail de redefinição de senha | https://resend.com/api-keys |

Sem `GEMINI_API_KEY`, o site funciona normalmente, só não gera notícias e eventos novos (o servidor avisa no console). Sem `RESEND_API_KEY`, o link de redefinição de senha é **impresso no console do servidor** em vez de enviado por e-mail, o que é suficiente para testar o fluxo localmente.

> ⚠️ O arquivo `.env` contém segredos e está no `.gitignore`. Nunca o envie para o repositório.

---

## 🤖 Como a IA atualiza o conteúdo

A IA (Gemini) trabalha nos bastidores, sem chat na tela. O fluxo é:

1. Busca no feed RSS do Google Notícias, **uma vez para quadra e outra para praia**.
2. Escolhe a primeira notícia que ainda não está no banco.
3. Envia o título e o resumo ao Gemini, pedindo apenas que reescreva de forma objetiva, sem acrescentar fatos.
4. Salva no PostgreSQL com a modalidade, o link original da matéria e uma imagem de capa.
5. Se a matéria trata de um torneio ou campeonato, cria também um evento na agenda, com a data calculada.

| Quando | O que acontece |
|---|---|
| **Todo dia às 8h** (cron) | Roda o fluxo acima para notícias e eventos, de quadra e de praia |
| **`POST /ia/atualizar`** | Dispara a mesma rotina manualmente (útil para testes) |

A atualização **não roda ao iniciar o servidor**, para não gastar a cota diária gratuita da API do Gemini a cada reinício durante o desenvolvimento. Se não houver notícia ou evento novo, nada é inserido.

**Imagens das notícias:** o sistema tenta extrair a imagem de capa (`og:image`) da matéria. Como os links do Google Notícias passam por uma página do próprio Google, na prática é comum cair no *fallback*: uma foto de vôlei escolhida de forma determinística em um conjunto separado por modalidade.

---

## 🛣️ Rotas da API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/noticias?modalidade=` | Lista notícias (`quadra` ou `praia`, opcional) |
| `POST` | `/noticias` | Cadastra notícia manualmente |
| `GET` | `/agenda?modalidade=` | Lista eventos futuros (`quadra` ou `praia`, opcional) |
| `POST` | `/agenda` | Cadastra evento manualmente |
| `DELETE` | `/agenda/:id` | Remove um evento |
| `GET` | `/aulas?nivel=&modalidade=` | Lista aulas (filtros opcionais e combináveis) |
| `POST` | `/cadastro` | Cria usuário (`nome`, `username`, `email`, `senha`) |
| `POST` | `/login` | Autentica o usuário |
| `PUT` | `/usuarios/:id` | Edita `username`, `bio`, `time_jogo`, `posicao_preferida` e `nivel` |
| `GET` | `/usuarios/publico/:username` | Perfil público: só `username`, `bio`, `time_jogo`, `posicao_preferida` e `nivel` |
| `POST` | `/esqueci-senha` | Envia o link de redefinição por e-mail (resposta sempre genérica) |
| `POST` | `/resetar-senha` | Redefine a senha a partir de um token válido (`token`, `novaSenha`) |
| `GET` | `/forum` | Últimas 100 mensagens do fórum, em ordem cronológica |
| `POST` | `/forum` | Publica mensagem (`usuario_id`, `texto` de até 500 caracteres, `resposta_a` opcional) |
| `POST` | `/ia/atualizar` | Força a atualização de notícias e eventos pela IA |
| `POST` / `GET` | `/progresso`, `/progresso/:usuario_id` | **Legadas**, sem uso no front-end (ver abaixo) |

As rotas `/progresso` pertencem a uma ideia descartada: o nível do usuário subiria automaticamente ao concluir aulas. Hoje o nível é declarado pelo próprio usuário no perfil. A tabela `progresso` continua no banco sem uso.

---

## 🗂️ Estrutura do projeto

```
Volei-Online/
├── server.js              # Back-end: banco, autenticação, rotas, IA e cron
├── app.js                 # Comportamento compartilhado do header (login, menu mobile)
├── style.css              # Estilos de todas as páginas (variáveis de tema em :root)
├── index.html             # Página inicial
├── login.html             # Login e cadastro
├── esqueci-senha.html     # Pedido de redefinição de senha
├── resetar-senha.html     # Definição da nova senha (link recebido por e-mail)
├── aulas.html             # Aulas por fundamento, nível e modalidade
├── noticias.html          # Notícias
├── agenda.html            # Agenda de eventos
├── perfil.html            # Perfil do usuário logado
├── perfil-publico.html    # Perfil público de qualquer usuário
├── forum.html             # Fórum
├── docs/                  # Portfólio (GitHub Pages) e diagramas do projeto
├── historico/             # Código de etapas anteriores (classes.js, logica.js)
├── .env.example           # Modelo das variáveis de ambiente
└── package.json
```

## 🗄️ Modelo de dados

| Tabela | Conteúdo |
|---|---|
| `usuarios` | `nome` (privado), `username` (público e único), `email`, `senha` (hash), `nivel`, `posicao_preferida`, `bio`, `time_jogo` |
| `noticias` | `titulo`, `conteudo` (resumo), `imagem`, `link` (matéria original), `modalidade`, `gerada_ia` e `criado_em` |
| `agenda` | `titulo`, `dia`, `mes`, `data_evento` (data final, usada para esconder eventos passados), `local`, `descricao`, `modalidade` e `gerada_ia` |
| `aulas` | `titulo`, `descricao`, `nivel`, `fundamento`, `modalidade`, `url_video`, `ordem` |
| `forum_mensagens` | `usuario_id`, `texto`, `resposta_a` (autorreferência) e `criado_em` |
| `senha_resets` | `usuario_id`, `token`, `expira_em` (30 min) e `usado_em` (uso único) |
| `progresso` | Legada, sem uso |

Os diagramas de modelagem (casos de uso, DER e classes) estão no [portfólio](https://vitorepontes.github.io/Volei-Online/docs/).

---

## 🔐 Segurança e limitações conhecidas

- **Controle de acesso apenas no front-end.** `aulas.html`, `perfil.html` e `forum.html` redirecionam para o login se não houver usuário salvo no `localStorage`. Isso é uma barreira de experiência de uso, **não uma proteção real**: o servidor não valida sessão ou token nas rotas. Em produção seria necessária autenticação por sessão ou JWT verificada em cada requisição. Para o escopo deste projeto acadêmico, foi uma decisão consciente.
- **Senhas** são armazenadas com hash bcrypt. O **nome completo** nunca é devolvido por rotas públicas.
- **Redefinição de senha:** o token expira em 30 minutos e só pode ser usado uma vez. `POST /esqueci-senha` responde sempre com a mesma mensagem, exista ou não a conta, para não revelar quais e-mails estão
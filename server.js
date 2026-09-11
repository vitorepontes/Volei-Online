import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import pg from "pg";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Parser from "rss-parser";
import { Resend } from "resend";

dotenv.config();

const app = express();
const { Pool } = pg;

app.use(cors());
app.use(express.json());
app.use(express.static(import.meta.dirname || process.cwd()));

// ─────────────────────────────────────────────────────────
// BANCO POSTGRESQL
// ─────────────────────────────────────────────────────────
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

db.connect()
  .then(() => console.log("✅ Conectado ao PostgreSQL"))
  .catch(err => console.error("❌ PostgreSQL:", err.message));

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const USERNAME_REGEX = /^[a-zA-Z0-9_.]{3,20}$/;

async function backfillUsernames() {
  const { rows: semUsername } = await db.query("SELECT id, email FROM usuarios WHERE username IS NULL");
  if (!semUsername.length) return;

  const { rows: existentesRows } = await db.query("SELECT username FROM usuarios WHERE username IS NOT NULL");
  const existentes = new Set(existentesRows.map(r => r.username));

  for (const usuario of semUsername) {
    const base = usuario.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, "") || "usuario";
    let candidato = base;
    let sufixo = 1;
    while (existentes.has(candidato)) {
      candidato = `${base}${sufixo}`;
      sufixo++;
    }
    existentes.add(candidato);
    await db.query("UPDATE usuarios SET username=$1 WHERE id=$2", [candidato, usuario.id]);
  }

  console.log(`👤 Backfill de username aplicado a ${semUsername.length} usuário(s).`);
}

async function inicializarBanco() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id        SERIAL PRIMARY KEY,
      nome      TEXT NOT NULL,
      email     TEXT UNIQUE NOT NULL,
      senha     TEXT NOT NULL,
      nivel     TEXT NOT NULL DEFAULT 'Iniciante',
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS noticias (
      id         SERIAL PRIMARY KEY,
      titulo     TEXT,
      conteudo   TEXT,
      imagem     TEXT,
      link       TEXT,
      gerada_ia  BOOLEAN DEFAULT FALSE,
      criado_em  TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS agenda (
      id        SERIAL PRIMARY KEY,
      dia       TEXT NOT NULL,
      mes       TEXT NOT NULL,
      titulo    TEXT NOT NULL,
      local     TEXT,
      descricao TEXT,
      gerada_ia BOOLEAN DEFAULT FALSE,
      criado_em TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS aulas (
      id         SERIAL PRIMARY KEY,
      titulo     TEXT NOT NULL,
      descricao  TEXT,
      nivel      TEXT NOT NULL,
      fundamento TEXT,
      modalidade TEXT NOT NULL,
      url_video  TEXT NOT NULL,
      ordem      INTEGER DEFAULT 0,
      criado_em  TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS progresso (
      id           SERIAL PRIMARY KEY,
      usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
      aula_id      INTEGER NOT NULL REFERENCES aulas(id),
      concluida_em TIMESTAMP DEFAULT NOW(),
      UNIQUE (usuario_id, aula_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS senha_resets (
      id           SERIAL PRIMARY KEY,
      usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
      token        TEXT NOT NULL,
      expira_em    TIMESTAMP NOT NULL,
      usado_em     TIMESTAMP,
      criado_em    TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS forum_mensagens (
      id         SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
      texto      TEXT NOT NULL,
      resposta_a INTEGER REFERENCES forum_mensagens(id),
      criado_em  TIMESTAMP DEFAULT NOW()
    )
  `);


  await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS posicao_preferida TEXT`);
  await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username TEXT`);
  await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bio TEXT`);
  await db.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS time_jogo TEXT`);
  await db.query(`ALTER TABLE noticias ADD COLUMN IF NOT EXISTS modalidade TEXT`);
  await db.query(`ALTER TABLE agenda ADD COLUMN IF NOT EXISTS modalidade TEXT`);
  await db.query(`ALTER TABLE agenda ADD COLUMN IF NOT EXISTS data_evento DATE`);

  const { rows: constraintExiste } = await db.query(
    `SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_username_key'`
  );
  if (!constraintExiste.length) {
    await db.query(`ALTER TABLE usuarios ADD CONSTRAINT usuarios_username_key UNIQUE (username)`);
  }

  await backfillUsernames();

  // Só marca NOT NULL depois de garantir (via backfill) que não sobrou nenhum username nulo
  await db.query(`ALTER TABLE usuarios ALTER COLUMN username SET NOT NULL`);

  // Notícias iniciais
  const { rows: rn } = await db.query("SELECT COUNT(*) as total FROM noticias");
  if (parseInt(rn[0].total) === 0) {
    await db.query("INSERT INTO noticias (titulo,conteudo,imagem,link) VALUES ($1,$2,$3,$4)", [
      "Osasco avança na Superliga Feminina",
      "Em jogo emocionante, a equipe paulista garantiu mais uma vitória importante e segue forte na busca pelo título nacional.",
      "https://img.olympics.com/images/image/private/t_s_16_9_g_auto/t_s_w2440/f_auto/primary/h49firqq6e8qbccsdizc",
      "https://webvolei.com.br/"
    ]);
    await db.query("INSERT INTO noticias (titulo,conteudo,imagem,link) VALUES ($1,$2,$3,$4)", [
      "Sada Cruzeiro mantém liderança na Superliga",
      "A equipe mineira dominou o adversário em casa e garantiu mais três pontos fundamentais na tabela.",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQFuDhkC91uqgsi6L2vlkgp66O2FkLNGxzgyA&s",
      "https://webvolei.com.br/superliga-masculina/"
    ]);
    await db.query("INSERT INTO noticias (titulo,conteudo,imagem,link) VALUES ($1,$2,$3,$4)", [
      "Sul-Americano valendo vaga em LA-28 muda de data",
      "O Campeonato Sul-Americano, no Ginásio do Maracanãzinho, teve as datas antecipadas garantindo vaga direta para 2028.",
      "https://s2-ge.glbimg.com/5UIyyyClmkG8USMmO9fh3d3GLv0=/0x0:2747x1858/984x0/smart/filters:strip_icc()/i.s3.glbimg.com/v1/AUTH_bc8228b6673f488aa253bbcb03c80ec5/internal_photos/bs/2021/f/Y/mQWfSMSkO8RaQOsC6L6g/gettyimages-1332676367.jpg",
      "https://webvolei.com.br/"
    ]);
    console.log("📰 Notícias iniciais inseridas.");
  }

  await db.query("UPDATE noticias SET modalidade='quadra' WHERE modalidade IS NULL");
  const todosFallbacks = [...IMAGEM_FALLBACK.quadra, ...IMAGEM_FALLBACK.praia];
  const { rows: semImagemPropria } = await db.query(
    "SELECT id, modalidade FROM noticias WHERE imagem IS NULL OR imagem = ANY($1)",
    [todosFallbacks]
  );
  for (const n of semImagemPropria) {
    const imagemFallback = escolherImagemFallback(n.modalidade, n.id);
    await db.query("UPDATE noticias SET imagem=$1 WHERE id=$2", [imagemFallback, n.id]);
  }


  const TITULO_EVENTO_SEED = "Sul-Americano de Vôlei Feminino 2026";
  const { rows: reventoExiste } = await db.query("SELECT 1 FROM agenda WHERE titulo=$1", [TITULO_EVENTO_SEED]);
  if (!reventoExiste.length) {
    await db.query("DELETE FROM agenda WHERE data_evento IS NULL");
    const eventosIniciais = [

      ["08-13", "SET", TITULO_EVENTO_SEED, "Ginásio do Maracanãzinho - Rio de Janeiro", "Campeonato Sul-Americano de vôlei feminino 2026, confirmado pela CBV.", "quadra"],
      ["15-20", "SET", "Sul-Americano de Vôlei Masculino 2026", "Ginásio do Maracanãzinho - Rio de Janeiro", "Campeonato Sul-Americano de vôlei masculino 2026, confirmado pela CBV.", "quadra"],
    ];
    for (const [dia, mes, titulo, local, descricao, modalidade] of eventosIniciais) {
      await db.query(
        "INSERT INTO agenda (dia,mes,titulo,local,descricao,modalidade,data_evento) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [dia, mes, titulo, local, descricao, modalidade, calcularDataEvento(dia, mes)]
      );
    }
    console.log("📅 Eventos antigos (vencidos) removidos; eventos reais do Sul-Americano 2026 inseridos.");
  }


  const { rows: rau } = await db.query("SELECT COUNT(*) as total FROM aulas");
  if (parseInt(rau[0].total) === 0) {
    const aulasIniciais = [

      ["Fundamentos técnicos do voleibol", "Introdução aos principais fundamentos técnicos do vôlei de quadra.", "Iniciante", null, "quadra", "https://www.youtube.com/embed/3ey82LDiKbk", 1],
      ["Fundamentos básicos do voleibol", "Visão geral dos fundamentos básicos para quem está começando no vôlei de quadra.", "Iniciante", null, "quadra", "https://www.youtube.com/embed/ldy0v8fHqsg", 2],
      ["Como se joga voleibol", "Fundamentos do voleibol explicados na prática, para quem já tem noção básica do jogo.", "Intermediário", null, "quadra", "https://www.youtube.com/embed/6uLksQ3tY2M", 1],
      ["Os fundamentos do voleibol", "Aula sobre os fundamentos do voleibol com foco em aprimoramento técnico.", "Intermediário", null, "quadra", "https://www.youtube.com/embed/9weREdiKROM", 2],
      ["Vôlei de praia — fundamento do toque", "Como executar o toque no vôlei de praia: empunhadura e técnica.", "Iniciante", "Toque", "praia", "https://www.youtube.com/embed/EUTvlmVHzGs", 1],
      ["Fundamentos do vôlei de praia", "Visão geral dos fundamentos técnicos do vôlei de praia.", "Iniciante", null, "praia", "https://www.youtube.com/embed/u4f7g3sRIus", 2],
      ["As principais regras do vôlei de praia", "Panorama das regras e dinâmica do vôlei de praia, com Márcio Araújo.", "Intermediário", null, "praia", "https://www.youtube.com/embed/075gB4YAAXI", 1],
      ["Regras do vôlei de praia", "Regras e situações comuns do vôlei de praia explicadas na prática.", "Intermediário", null, "praia", "https://www.youtube.com/embed/uf-YasGYYV0", 2],
    ];
    for (const [titulo, descricao, nivel, fundamento, modalidade, url_video, ordem] of aulasIniciais) {
      await db.query(
        "INSERT INTO aulas (titulo,descricao,nivel,fundamento,modalidade,url_video,ordem) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [titulo, descricao, nivel, fundamento, modalidade, url_video, ordem]
      );
    }
    console.log("🎓 Aulas iniciais inseridas.");
  }


  const MARCADOR_AULAS_FUNDAMENTO = "https://www.youtube.com/embed/u7qtV9HN7Fs";
  const { rows: raf } = await db.query("SELECT COUNT(*) as total FROM aulas WHERE url_video=$1", [MARCADOR_AULAS_FUNDAMENTO]);
  if (parseInt(raf[0].total) === 0) {
    const aulasFundamento = [

      // ── QUADRA ──
      ["Saque por cima — passo a passo", "Aprenda o passo a passo do saque por cima, com dicas de postura e contato na bola.", "Iniciante", "Saque", "quadra", "https://www.youtube.com/embed/u7qtV9HN7Fs", 1],
      ["Como fazer o saque por cima (sacar com força)", "Dicas práticas para ganhar força e precisão no saque por cima.", "Iniciante", "Saque", "quadra", "https://www.youtube.com/embed/pxeFBK7LteA", 2],
      ["Como passar o saque flutuante", "Técnica de recepção do saque flutuante, um dos mais difíceis de receber.", "Intermediário", "Saque", "quadra", "https://www.youtube.com/embed/6Ly2dCIhCM4", 1],
      ["Saque flutuante saltando — passo a passo", "Como executar o saque flutuante saltando, com foco em concentração e timing.", "Avançado", "Saque", "quadra", "https://www.youtube.com/embed/xHXCSYeOQN8", 1],
      ["Saque viagem e saque flutuante", "Duas variações avançadas de saque por cima explicadas na prática.", "Avançado", "Saque", "quadra", "https://www.youtube.com/embed/ljqmhNAZ2xc", 2],

      ["Como ter uma ótima recepção no voleibol", "Fundamentos da manchete aplicados à recepção de saque.", "Iniciante", "Manchete", "quadra", "https://www.youtube.com/embed/lsmMMN0XN48", 1],

      ["Como executar o toque — fundamentos do vôlei", "Fundamentos técnicos do toque de bola (dedos), com o técnico Washington Gomes.", "Iniciante", "Toque", "quadra", "https://www.youtube.com/embed/njvxg_MFBtA", 1],
      ["Como aprender o toque no voleibol — treino em casa", "Exercícios simples para treinar o toque sem precisar de quadra.", "Iniciante", "Toque", "quadra", "https://www.youtube.com/embed/sucC8niOSbI", 2],
      ["Toque e levantamento — melhorando a precisão", "Exercícios para melhorar a precisão do toque e do levantamento.", "Intermediário", "Toque", "quadra", "https://www.youtube.com/embed/3DWZpd3v31w", 1],

      ["Toque perfeito — curso grátis de levantador", "Introdução à função de levantador e à técnica do toque para levantamento.", "Intermediário", "Levantamento", "quadra", "https://www.youtube.com/embed/N3vG7jZEEeg", 1],
      ["Levantamento rápido", "Levantamento rápido para variar o ritmo do ataque.", "Avançado", "Levantamento", "quadra", "https://www.youtube.com/embed/yIbOjTbxGQM", 1],

      ["Bloqueio no voleibol — tipos de bloqueio", "Visão geral dos tipos de bloqueio e quando usar cada um.", "Intermediário", "Bloqueio", "quadra", "https://www.youtube.com/embed/gBtpPwc6HGs", 1],
      ["Aprenda o bloqueio no voleibol passo a passo", "Passo a passo da técnica de bloqueio: posicionamento, salto e mãos.", "Intermediário", "Bloqueio", "quadra", "https://www.youtube.com/embed/624dKcKE6Dw", 2],

      ["Ataque vôlei — aprenda a cortada perfeita", "Fundamentos da cortada: aproximação, salto e golpe na bola.", "Intermediário", "Ataque", "quadra", "https://www.youtube.com/embed/khOT7z71jLc", 1],
      ["Como executar a cortada — fundamentos do vôlei", "Fundamentos da cortada com o técnico Washington Gomes.", "Intermediário", "Ataque", "quadra", "https://www.youtube.com/embed/SGGEMb8d7LY", 2],
      ["Ataque pipe", "Ataque rápido vindo do fundo de quadra (pipe).", "Avançado", "Ataque", "quadra", "https://www.youtube.com/embed/mrvCZkjz1cM", 1],
      ["Ataque rápido", "Variação de ataque rápido para surpreender o bloqueio adversário.", "Avançado", "Ataque", "quadra", "https://www.youtube.com/embed/lW2d1vrjEo8", 2],

      // ── PRAIA ──
      ["Vôlei de praia — fundamento básico de manchete", "Fundamento básico da manchete no vôlei de praia, com exercícios.", "Iniciante", "Manchete", "praia", "https://www.youtube.com/embed/lN9TXR2Q3j4", 1],
      ["Vôlei de praia — toque e manchete", "Exercícios combinando toque e manchete no vôlei de praia.", "Iniciante", "Manchete", "praia", "https://www.youtube.com/embed/xcM4Ha72xsg", 2],
      ["Vôlei de praia — toque e manchete (foco no toque)", "Exercícios combinando toque e manchete no vôlei de praia.", "Iniciante", "Toque", "praia", "https://www.youtube.com/embed/xcM4Ha72xsg", 1],

      ["Levantamento de toque no vôlei de praia na prática", "Pontos-chave para executar o levantamento de toque na areia.", "Intermediário", "Levantamento", "praia", "https://www.youtube.com/embed/FMTuQxpMMRI", 1],
      ["Como levantar no vôlei de praia (posição de pernas)", "Postura e posição de pernas para um levantamento limpo na areia.", "Intermediário", "Levantamento", "praia", "https://www.youtube.com/embed/SAVP4RHHlmk", 2],
      ["Dica de especialista: levantamento no vôlei de praia", "Duda Lisboa dá dicas avançadas sobre o levantamento no vôlei de praia.", "Avançado", "Levantamento", "praia", "https://www.youtube.com/embed/a2Cq2ax4xHc", 1],

      ["Treino de bloqueio e defesa no vôlei de praia", "Treino básico de bloqueio e defesa na areia, com André Stein.", "Intermediário", "Bloqueio", "praia", "https://www.youtube.com/embed/7QYpmQle6w4", 1],

      ["Vamos atacar! — vôlei de praia", "Fundamentos do ataque no vôlei de praia, com exercícios práticos.", "Intermediário", "Ataque", "praia", "https://www.youtube.com/embed/0niU2X5M5AY", 1],
    ];
    for (const [titulo, descricao, nivel, fundamento, modalidade, url_video, ordem] of aulasFundamento) {
      await db.query(
        "INSERT INTO aulas (titulo,descricao,nivel,fundamento,modalidade,url_video,ordem) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [titulo, descricao, nivel, fundamento, modalidade, url_video, ordem]
      );
    }
    console.log(`🎯 ${aulasFundamento.length} aulas por fundamento inseridas.`);
  }

  console.log("🗄️  Banco inicializado.");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const rssParser = new Parser();
const FEED_QUADRA_URL = `https://news.google.com/rss/search?q=${encodeURIComponent('vôlei de quadra OR superliga vôlei')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
const FEED_PRAIA_URL = `https://news.google.com/rss/search?q=${encodeURIComponent('vôlei de praia')}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
const PALAVRAS_EVENTO = ["campeonato", "torneio", "copa", "superliga", "mundial", "olimp", "liga das na", "vnl", "sul-americano"];


const IMAGEM_FALLBACK = {
  quadra: [
    "https://images.unsplash.com/photo-1547347298-4074fc3086f0?w=800&q=80",
    "https://images.unsplash.com/photo-1665406857477-e19222ca862c?w=800&q=80",
    "https://images.unsplash.com/photo-1728971124745-423b12df446d?w=800&q=80",
    "https://images.unsplash.com/photo-1479859546309-cd77fa21c8f6?w=800&q=80",
    "https://images.unsplash.com/photo-1666901356149-93f2eb3ba5a2?w=800&q=80",
    "https://images.unsplash.com/photo-1728971121202-04896f2a35a4?w=800&q=80",
    "https://images.unsplash.com/photo-1728971124746-607ba6d3fff0?w=800&q=80",
  ],
  praia: [
    "https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?w=800&q=80",
    "https://images.unsplash.com/photo-1748645288738-aadf398bcd3e?w=800&q=80",
    "https://images.unsplash.com/photo-1592656094267-764a45160876?w=800&q=80",
    "https://images.unsplash.com/photo-1521138054413-5a47d349b7af?w=800&q=80",
    "https://images.unsplash.com/photo-1686753767715-37cb0c34212c?w=800&q=80",
    "https://images.unsplash.com/photo-1601512986351-9b0e01780eef?w=800&q=80",
    "https://images.unsplash.com/photo-1746735793884-de62a9203958?w=800&q=80",
    "https://images.unsplash.com/photo-1754685247131-b232e09922aa?w=800&q=80",
  ],
};

function escolherImagemFallback(modalidade, id) {
  const lista = IMAGEM_FALLBACK[modalidade] || IMAGEM_FALLBACK.quadra;
  return lista[id % lista.length];
}

function tituloJaExiste(titulo, titulosExistentes) {
  const alvo = titulo.trim().toLowerCase();
  return titulosExistentes.some(t => t.trim().toLowerCase() === alvo);
}

async function extrairImagemCapa(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VoleiOnlineBot/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!match) return null;

    const imagem = match[1];
  
    const dominioImagem = new URL(imagem, url).hostname;
    if (/(^|\.)google(usercontent)?\.com$|\.gstatic\.com$/i.test(dominioImagem)) return null;

    return imagem;
  } catch {
    return null;
  }
}

const MESES_INDEX = { JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5, JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11 };

function calcularDataEvento(diaStr, mesStr) {
  const mesIndex = MESES_INDEX[String(mesStr || "").toUpperCase()];
  if (mesIndex === undefined) return null;
  const partes = String(diaStr || "").split("-");
  const diaFim = parseInt(partes[partes.length - 1], 10);
  if (!diaFim) return null;

  const hoje = new Date();
  const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let ano = hoje.getFullYear();
  let data = new Date(ano, mesIndex, diaFim);
  if (data < hojeSemHora) {
    ano += 1;
    data = new Date(ano, mesIndex, diaFim);
  }
  return `${ano}-${String(mesIndex + 1).padStart(2, "0")}-${String(diaFim).padStart(2, "0")}`;
}

async function gerarNoticiaComIA(modalidade, feedUrl) {
  if (!process.env.GEMINI_API_KEY) {
    console.log("⚠️  GEMINI_API_KEY não configurada — pulando geração de notícia.");
    return;
  }

  console.log(`🤖 IA buscando notícia real de vôlei de ${modalidade}...`);

  // Busca os títulos recentes para evitar repetição (considera notícias de qualquer modalidade)
  const { rows } = await db.query(
    "SELECT titulo FROM noticias ORDER BY criado_em DESC LIMIT 10"
  );
  const titulosExistentes = rows.map(r => r.titulo);

  const feed = await rssParser.parseURL(feedUrl);
  const item = (feed.items || []).find(i => i.title && !tituloJaExiste(i.title, titulosExistentes));

  if (!item) {
    console.log(`Nenhuma notícia nova encontrada (${modalidade})`);
    return;
  }

  const resumoFonte = item.contentSnippet || item.content || item.title;

  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
  const result = await model.generateContent(
    `Você é um redator esportivo especializado em vôlei brasileiro e mundial.
Reescreva a notícia real abaixo em um resumo de até 2 frases curtas em português.
Mantenha os fatos EXATAMENTE como estão na fonte. Não adicione nenhuma informação que não veio dela.
Responda APENAS com JSON válido, sem markdown, sem texto extra.
Formato: { "conteudo": "Resumo em até 2 frases, fiel à fonte." }

Título da notícia real: ${item.title}
Resumo/conteúdo da fonte: ${resumoFonte}`
  );

  const texto = result.response.text() || "{}";
  const json = texto.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const noticia = JSON.parse(json);

  if (!noticia.conteudo) throw new Error("JSON incompleto da IA");

  const imagemCapa = await extrairImagemCapa(item.link);

  // A escolha determinística do fallback depende do id, que só existe depois do INSERT —
  // por isso insere primeiro (com a imagem real, se achou) e só faz um UPDATE se precisar.
  const { rows: inserida } = await db.query(
    "INSERT INTO noticias (titulo, conteudo, imagem, link, gerada_ia, modalidade) VALUES ($1,$2,$3,$4,TRUE,$5) RETURNING id",
    [item.title, noticia.conteudo, imagemCapa, item.link, modalidade]
  );

  if (!imagemCapa) {
    const imagemFallback = escolherImagemFallback(modalidade, inserida[0].id);
    await db.query("UPDATE noticias SET imagem=$1 WHERE id=$2", [imagemFallback, inserida[0].id]);
  }

  console.log(`✅ Notícia real gerada pela IA (${modalidade}): "${item.title}"${imagemCapa ? " [imagem real do artigo]" : " [imagem de fallback]"}`);
}

async function gerarEventoComIA(modalidade, feedUrl) {
  if (!process.env.GEMINI_API_KEY) {
    console.log("⚠️  GEMINI_API_KEY não configurada — pulando geração de evento.");
    return;
  }

  console.log(`🤖 IA buscando notícia real sobre evento de vôlei de ${modalidade}...`);

  const { rows } = await db.query(
    "SELECT titulo FROM agenda ORDER BY criado_em DESC LIMIT 10"
  );
  const titulosExistentes = rows.map(r => r.titulo);

  const feed = await rssParser.parseURL(feedUrl);
  const item = (feed.items || []).find(i => {
    if (!i.title || tituloJaExiste(i.title, titulosExistentes)) return false;
    const texto = `${i.title} ${i.contentSnippet || i.content || ""}`.toLowerCase();
    return PALAVRAS_EVENTO.some(p => texto.includes(p));
  });

  if (!item) {
    console.log(`Nenhum evento novo encontrado (${modalidade})`);
    return;
  }

  const resumoFonte = item.contentSnippet || item.content || item.title;

  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
  const result = await model.generateContent(
    `Você é um assistente de agenda esportiva de vôlei.
Extraia dados de um evento real de vôlei (torneio/campeonato) a partir da notícia abaixo.
Use APENAS informações presentes no texto. Não invente nada.
Se o dia ou o mês do evento não estiverem claros no texto, responda com null nesses campos.
Responda APENAS com JSON válido, sem markdown.
Formato: { "dia": "DD ou DD-DD ou null", "mes": "MAI/JUN/JUL/AGO/SET/OUT/NOV/DEZ ou null", "local": "... ou null", "descricao": "Uma frase curta baseada apenas no texto." }

Título da notícia real: ${item.title}
Resumo/conteúdo da fonte: ${resumoFonte}`
  );

  const texto = result.response.text() || "{}";
  const json = texto.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const evento = JSON.parse(json);

  if (!evento.dia || !evento.mes || evento.dia === "null" || evento.mes === "null") {
    console.log(`Nenhum evento novo encontrado (${modalidade})`);
    return;
  }

  const dataEvento = calcularDataEvento(evento.dia, evento.mes);
  if (!dataEvento) {
    console.log(`Nenhum evento novo encontrado (${modalidade}) — mês inválido para calcular a data`);
    return;
  }

  await db.query(
    "INSERT INTO agenda (dia, mes, titulo, local, descricao, gerada_ia, modalidade, data_evento) VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7)",
    [evento.dia, evento.mes, item.title, evento.local || "", evento.descricao || "", modalidade, dataEvento]
  );

  console.log(`✅ Evento real gerado pela IA (${modalidade}): "${item.title}" em ${evento.dia}/${evento.mes}`);
}

async function atualizacaoAutomatica() {
  console.log("\n⏰ Rodando atualização automática com IA...");
  try { await gerarNoticiaComIA('quadra', FEED_QUADRA_URL); } catch (e) { console.error("❌ Erro ao gerar notícia (quadra):", e.message); }
  try { await gerarNoticiaComIA('praia', FEED_PRAIA_URL); } catch (e) { console.error("❌ Erro ao gerar notícia (praia):", e.message); }
  try { await gerarEventoComIA('quadra', FEED_QUADRA_URL); } catch (e) { console.error("❌ Erro ao gerar evento (quadra):", e.message); }
  try { await gerarEventoComIA('praia', FEED_PRAIA_URL); } catch (e) { console.error("❌ Erro ao gerar evento (praia):", e.message); }
  console.log("✅ Atualização automática concluída.\n");
}

cron.schedule("0 8 * * *", atualizacaoAutomatica);

app.get("/noticias", async (req, res) => {
  const { modalidade } = req.query;
  try {
    const { rows } = modalidade
      ? await db.query("SELECT * FROM noticias WHERE modalidade=$1 ORDER BY criado_em DESC", [modalidade])
      : await db.query("SELECT * FROM noticias ORDER BY criado_em DESC");
    res.json(rows);
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post("/noticias", async (req, res) => {
  const { titulo, conteudo, imagem, link } = req.body;
  try {
    const { rows } = await db.query(
      "INSERT INTO noticias (titulo,conteudo,imagem,link) VALUES ($1,$2,$3,$4) RETURNING *",
      [titulo, conteudo, imagem || null, link || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get("/agenda", async (req, res) => {
  const { modalidade } = req.query;
  try {
    // Nunca retorna eventos já vencidos (data_evento é a data do último dia do evento).
    // Eventos antigos sem data_evento calculável (NULL) também ficam de fora do resultado.
    const { rows } = modalidade
      ? await db.query(
          "SELECT * FROM agenda WHERE modalidade=$1 AND data_evento >= CURRENT_DATE ORDER BY data_evento ASC",
          [modalidade]
        )
      : await db.query(
          "SELECT * FROM agenda WHERE data_evento >= CURRENT_DATE ORDER BY data_evento ASC"
        );
    res.json(rows);
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post("/agenda", async (req, res) => {
  const { dia, mes, titulo, local, descricao, modalidade } = req.body;
  try {
    const dataEvento = calcularDataEvento(dia, mes);
    const { rows } = await db.query(
      "INSERT INTO agenda (dia,mes,titulo,local,descricao,modalidade,data_evento) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [dia, mes, titulo, local || "", descricao || "", modalidade || null, dataEvento]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.delete("/agenda/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM agenda WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

const ORDEM_NIVEIS = ["Iniciante", "Intermediário", "Avançado"];

app.get("/aulas", async (req, res) => {
  const { nivel, modalidade } = req.query;
  try {
    const condicoes = [];
    const valores = [];
    if (nivel) { valores.push(nivel); condicoes.push(`nivel = $${valores.length}`); }
    if (modalidade) { valores.push(modalidade); condicoes.push(`modalidade = $${valores.length}`); }
    const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
    const { rows } = await db.query(
      `SELECT * FROM aulas ${where} ORDER BY nivel, ordem, id`,
      valores
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post("/progresso", async (req, res) => {
  const { usuario_id, aula_id } = req.body;
  if (!usuario_id || !aula_id)
    return res.status(400).json({ erro: "usuario_id e aula_id são obrigatórios." });
  try {
    const inserida = await db.query(
      "INSERT INTO progresso (usuario_id, aula_id) VALUES ($1,$2) ON CONFLICT (usuario_id, aula_id) DO NOTHING RETURNING *",
      [usuario_id, aula_id]
    );
    if (!inserida.rows.length)
      return res.status(409).json({ erro: "Esta aula já foi marcada como concluída." });

    res.status(201).json({ progresso: inserida.rows[0] });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.get("/progresso/:usuario_id", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.id AS progresso_id, p.concluida_em, a.*
       FROM progresso p
       JOIN aulas a ON a.id = p.aula_id
       WHERE p.usuario_id = $1
       ORDER BY p.concluida_em DESC`,
      [req.params.usuario_id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post("/cadastro", async (req, res) => {
  const { nome, username, email, senha, nivel } = req.body;
  if (!nome || !username || !email || !senha)
    return res.status(400).json({ erro: "Nome, nome de usuário, e-mail e senha são obrigatórios." });
  if (!USERNAME_REGEX.test(username))
    return res.status(400).json({ erro: "Nome de usuário inválido. Use 3 a 20 caracteres: letras, números, ponto ou underline, sem espaços." });
  if (senha.length < 6)
    return res.status(400).json({ erro: "Senha deve ter ao menos 6 caracteres." });
  try {
    const existeEmail = await db.query("SELECT id FROM usuarios WHERE email=$1", [email]);
    if (existeEmail.rows.length > 0)
      return res.status(409).json({ erro: "E-mail já cadastrado." });
    const existeUsername = await db.query("SELECT id FROM usuarios WHERE username=$1", [username]);
    if (existeUsername.rows.length > 0)
      return res.status(409).json({ erro: "Nome de usuário já está em uso." });

    const hash = await bcrypt.hash(senha, 10);
    const { rows } = await db.query(
      `INSERT INTO usuarios (nome,username,email,senha,nivel) VALUES ($1,$2,$3,$4,$5)
       RETURNING id,nome,username,email,nivel,posicao_preferida,bio,time_jogo`,
      [nome, username, email, hash, nivel || "Iniciante"]
    );
    res.status(201).json({ mensagem: "Cadastro realizado!", usuario: rows[0] });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post("/login", async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha)
    return res.status(400).json({ erro: "E-mail e senha são obrigatórios." });
  try {
    const { rows } = await db.query(
      "SELECT id,nome,username,email,senha,nivel,posicao_preferida,bio,time_jogo FROM usuarios WHERE email=$1", [email]
    );
    if (!rows.length) return res.status(401).json({ erro: "E-mail ou senha inválidos." });
    const ok = await bcrypt.compare(senha, rows[0].senha);
    if (!ok) return res.status(401).json({ erro: "E-mail ou senha inválidos." });
    const u = rows[0];
    res.json({
      mensagem: "Login realizado!",
      usuario: { id:u.id, nome:u.nome, username:u.username, email:u.email, nivel:u.nivel, posicao_preferida:u.posicao_preferida, bio:u.bio, time_jogo:u.time_jogo }
    });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// Edita username, bio, time_jogo, posicao_preferida e nivel (não altera nome/email/senha por essa rota)
app.put("/usuarios/:id", async (req, res) => {
  const { username, bio, time_jogo, posicao_preferida, nivel } = req.body;
  try {
    const { rows: existentes } = await db.query("SELECT * FROM usuarios WHERE id=$1", [req.params.id]);
    if (!existentes.length) return res.status(404).json({ erro: "Usuário não encontrado." });
    const atual = existentes[0];

    let novoUsername = atual.username;
    if (username !== undefined) {
      if (!USERNAME_REGEX.test(username))
        return res.status(400).json({ erro: "Nome de usuário inválido. Use 3 a 20 caracteres: letras, números, ponto ou underline, sem espaços." });
      const { rows: conflito } = await db.query(
        "SELECT id FROM usuarios WHERE username=$1 AND id<>$2", [username, req.params.id]
      );
      if (conflito.length) return res.status(409).json({ erro: "Nome de usuário já está em uso." });
      novoUsername = username;
    }

    let novoNivel = atual.nivel;
    if (nivel !== undefined) {
      if (!ORDEM_NIVEIS.includes(nivel))
        return res.status(400).json({ erro: "Nível inválido." });
      novoNivel = nivel;
    }

    const { rows } = await db.query(
      `UPDATE usuarios SET username=$1, bio=$2, time_jogo=$3, posicao_preferida=$4, nivel=$5
       WHERE id=$6 RETURNING id,nome,username,email,nivel,posicao_preferida,bio,time_jogo`,
      [
        novoUsername,
        bio !== undefined ? bio : atual.bio,
        time_jogo !== undefined ? time_jogo : atual.time_jogo,
        posicao_preferida !== undefined ? posicao_preferida : atual.posicao_preferida,
        novoNivel,
        req.params.id
      ]
    );
    res.json({ mensagem: "Perfil atualizado!", usuario: rows[0] });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// Perfil público — nunca expõe nome completo, e-mail ou senha
app.get("/usuarios/publico/:username", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT username, bio, time_jogo, posicao_preferida, nivel FROM usuarios WHERE username=$1",
      [req.params.username]
    );
    if (!rows.length) return res.status(404).json({ erro: "Usuário não encontrado." });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

const FORUM_TEXTO_MAX = 500;

app.get("/forum", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT * FROM (
        SELECT
          m.id, m.texto, m.criado_em, m.resposta_a,
          u.username AS autor,
          ru.username AS resposta_autor,
          rm.texto AS resposta_texto
        FROM forum_mensagens m
        JOIN usuarios u ON u.id = m.usuario_id
        LEFT JOIN forum_mensagens rm ON rm.id = m.resposta_a
        LEFT JOIN usuarios ru ON ru.id = rm.usuario_id
        ORDER BY m.criado_em DESC
        LIMIT 100
      ) ultimas
      ORDER BY criado_em ASC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post("/forum", async (req, res) => {
  const { usuario_id, texto, resposta_a } = req.body;
  if (!usuario_id) return res.status(400).json({ erro: "usuario_id é obrigatório." });
  if (!texto || !texto.trim()) return res.status(400).json({ erro: "A mensagem não pode ficar vazia." });
  if (texto.length > FORUM_TEXTO_MAX)
    return res.status(400).json({ erro: `A mensagem deve ter no máximo ${FORUM_TEXTO_MAX} caracteres.` });

  try {
    const { rows: usuarioExiste } = await db.query("SELECT id FROM usuarios WHERE id=$1", [usuario_id]);
    if (!usuarioExiste.length) return res.status(404).json({ erro: "Usuário não encontrado." });

    if (resposta_a) {
      const { rows: mensagemExiste } = await db.query("SELECT id FROM forum_mensagens WHERE id=$1", [resposta_a]);
      if (!mensagemExiste.length) return res.status(400).json({ erro: "A mensagem respondida não existe mais." });
    }

    const { rows } = await db.query(
      "INSERT INTO forum_mensagens (usuario_id, texto, resposta_a) VALUES ($1,$2,$3) RETURNING id, texto, criado_em, resposta_a",
      [usuario_id, texto.trim(), resposta_a || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

const RESET_TOKEN_VALIDADE_MIN = 30;

app.post("/esqueci-senha", async (req, res) => {
  const { email } = req.body;
  const respostaGenerica = { mensagem: "Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha." };
  if (!email) return res.status(400).json({ erro: "E-mail é obrigatório." });

  try {
    const { rows } = await db.query("SELECT id, nome FROM usuarios WHERE email=$1", [email]);

    if (rows.length) {
      const usuario = rows[0];
      const token = crypto.randomBytes(32).toString("hex");
      const expiraEm = new Date(Date.now() + RESET_TOKEN_VALIDADE_MIN * 60 * 1000);

      await db.query(
        "INSERT INTO senha_resets (usuario_id, token, expira_em) VALUES ($1,$2,$3)",
        [usuario.id, token, expiraEm]
      );

      const link = `${req.protocol}://${req.get("host")}/resetar-senha.html?token=${token}`;

      if (resend) {
        try {
          await resend.emails.send({
            from: "onboarding@resend.dev",
            to: email,
            subject: "Redefinição de senha — Vôlei Online",
            html: `<p>Olá, ${usuario.nome}!</p>
                   <p>Clique no link abaixo para redefinir sua senha. Ele expira em ${RESET_TOKEN_VALIDADE_MIN} minutos.</p>
                   <p><a href="${link}">${link}</a></p>
                   <p>Se você não pediu essa redefinição, pode ignorar este e-mail.</p>`
          });
        } catch (e) {
          console.error("❌ Erro ao enviar e-mail de redefinição:", e.message);
        }
      } else {
        console.log(`⚠️  RESEND_API_KEY não configurada — link de redefinição (uso manual/teste): ${link}`);
      }
    }

    // Sempre a mesma resposta, exista ou não o e-mail — evita expor quais e-mails têm conta
    res.json(respostaGenerica);
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

app.post("/resetar-senha", async (req, res) => {
  const { token, novaSenha } = req.body;
  if (!token || !novaSenha)
    return res.status(400).json({ erro: "Token e nova senha são obrigatórios." });
  if (novaSenha.length < 6)
    return res.status(400).json({ erro: "Senha deve ter ao menos 6 caracteres." });

  try {
    const { rows } = await db.query("SELECT * FROM senha_resets WHERE token=$1", [token]);
    if (!rows.length) return res.status(400).json({ erro: "Link de redefinição inválido." });

    const reset = rows[0];
    if (reset.usado_em) return res.status(400).json({ erro: "Este link já foi utilizado." });
    if (new Date(reset.expira_em) < new Date())
      return res.status(400).json({ erro: "Este link expirou. Solicite uma nova redefinição." });

    const hash = await bcrypt.hash(novaSenha, 10);
    await db.query("UPDATE usuarios SET senha=$1 WHERE id=$2", [hash, reset.usuario_id]);
    await db.query("UPDATE senha_resets SET usado_em=NOW() WHERE id=$1", [reset.id]);

    res.json({ mensagem: "Senha redefinida com sucesso! Faça login com a nova senha." });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// Rota para forçar atualização manual (útil para testar)
app.post("/ia/atualizar", async (req, res) => {
  res.json({ mensagem: "Atualização iniciada em background." });
  atualizacaoAutomatica(); // dispara sem await para não travar o response
});

inicializarBanco()
  .then(() => {
    app.listen(3000, () => console.log("🚀 Servidor em http://localhost:3000"));
    // A atualização com IA roda só pelo cron (8h) ou via POST /ia/atualizar — nunca no startup.
  })
  .catch(console.error);

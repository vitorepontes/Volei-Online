const { Exercicio, Noticia, Usuario } = require("./classes");


// Dados simulados
const exercicios = [];
const noticias = [];

// Função para adicionar um exercício
function adicionarExercicio(exercicio) {
    exercicios.push(exercicio);
}

// Função para adicionar uma notícia
function adicionarNoticia(noticia) {
    noticias.push(noticia);
}

// Função para listar exercícios
function listarExercicios() {
    return exercicios;
}

// Função para listar notícias
function listarNoticias() {
    return noticias;
}

// Exemplo de uso
adicionarExercicio(new Exercicio(1, "Saque por cima", "Técnica básica de saque", "Fácil", "saque.jpg"));
adicionarNoticia(new Noticia(1, "Brasil Campeão", "Seleção vence torneio", "2025-11-21", "brasil.jpg"));

console.log(listarExercicios());
console.log(listarNoticias());

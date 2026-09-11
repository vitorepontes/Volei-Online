class Exercicio {
    constructor(id, titulo, descricao, dificuldade, imagem) {
        this.id = id;
        this.titulo = titulo;
        this.descricao = descricao;
        this.dificuldade = dificuldade;
        this.imagem = imagem;
    }
}

class Noticia {
    constructor(id, titulo, conteudo, data, imagem) {
        this.id = id;
        this.titulo = titulo;
        this.conteudo = conteudo;
        this.data = data;
        this.imagem = imagem;
    }
}

class Usuario {
    constructor(id, nome, email, nivel) {
        this.id = id;
        this.nome = nome;
        this.email = email;
        this.nivel = nivel;
    }
}

module.exports = { Exercicio, Noticia, Usuario };
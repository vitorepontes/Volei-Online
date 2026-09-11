// Comportamento compartilhado do header em todas as páginas:
// - mostra o nome de quem está logado no lugar do link "Login"
// - controla o menu hambúrguer em telas pequenas

function usuarioLogado() {
    try {
        return JSON.parse(localStorage.getItem('usuarioLogado'));
    } catch {
        return null;
    }
}

function atualizarHeaderLogin() {
    const usuario = usuarioLogado();
    if (!usuario) return;

    const linkConta = document.querySelector('nav a.nav-conta');
    if (linkConta) {
        const primeiroNome = usuario.nome.split(' ')[0];
        linkConta.textContent = primeiroNome;
        linkConta.href = 'perfil.html';
        linkConta.classList.add('logado');
        linkConta.setAttribute('title', `Logado como ${usuario.nome} — clique para ver seu perfil`);
    }
}

function iniciarMenuMobile() {
    const botao = document.querySelector('.nav-toggle');
    const nav = document.getElementById('menuPrincipal');
    if (!botao || !nav) return;

    botao.addEventListener('click', () => {
        const aberto = nav.classList.toggle('aberto');
        botao.setAttribute('aria-expanded', String(aberto));
    });

    // Fecha o menu ao navegar para outro link (evita ficar aberto ao voltar)
    nav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            nav.classList.remove('aberto');
            botao.setAttribute('aria-expanded', 'false');
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    atualizarHeaderLogin();
    iniciarMenuMobile();
});

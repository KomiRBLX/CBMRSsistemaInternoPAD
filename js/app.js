const NAV = [
  ['visao', 'Visão Geral'], ['novo', 'Novo Procedimento'], ['andamento', 'Processos em Andamento'],
  ['arquivados', 'Arquivados'], ['modelos', 'Modelos de Documentos', true],
  ['auditoria', 'Histórico e Auditoria', true], ['usuarios', 'Gerenciamento de Usuários', true],
];

const App = {
  user: null,

  async init() {
    $('#formLogin').onsubmit = App.entrar;
    $('#btnSair').onclick = () => App.logout();
    if (API.token) { try { App.user = await API.call('me'); return App.abrir(); } catch (e) { API.limpar(); } }
    App.logout(true);
  },

  entrar(ev) {
    ev.preventDefault();
    const f = ev.target;
    executar(f.querySelector('button'), async () => {
      $('#erroLogin').textContent = '';
      try { App.user = await API.login(f.usuario.value.trim(), f.senha.value); }
      catch (e) { $('#erroLogin').textContent = e.message; return; }
      f.reset(); App.abrir();
    });
  },

  abrir() {
    $('#login').hidden = true; $('#app').hidden = false;
    $('#usrNome').textContent = App.user.Nome_Completo;
    $('#usrPosto').textContent = App.user.Posto_Graduacao || '';
    const admin = App.user.Perfil === 'Administrador';
    $('#nav').innerHTML = NAV.filter(n => !n[2] || admin).map(n => `<button data-v="${n[0]}">${esc(n[1])}</button>`).join('');
    $('#nav').onclick = e => e.target.dataset.v && App.ir(e.target.dataset.v);
    App.ir('visao');
  },

  async ir(v) {
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    const c = $('#view');
    c.innerHTML = '<p class="muted">Carregando…</p>';
    try { await Views[v](c); } catch (e) { c.innerHTML = `<p class="erro">${esc(e.message)}</p>`; }
  },

  async logout(silencioso) {
    if (!silencioso && API.token) { try { await API.call('sair'); } catch (e) {} }
    API.limpar(); App.user = null;
    $('#app').hidden = true; $('#login').hidden = false;
  },
};

App.init();

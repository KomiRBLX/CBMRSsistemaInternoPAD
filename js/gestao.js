// Visão geral, processos, modelos, auditoria e usuários.
const statusOpts = (atual) => CONFIG.STATUS.map(s => `<option ${s === atual ? 'selected' : ''}>${esc(s)}</option>`).join('');

Views.visao = async function (c) {
  const d = await API.call('dashboard');
  const n = s => d.porStatus[s] || 0;
  c.innerHTML = `<h1>Visão Geral</h1><div class="cards">
    <div class="card"><b>${d.total}</b>Total de procedimentos</div>
    <div class="card"><b>${n('Em andamento')}</b>Em andamento</div>
    <div class="card"><b>${n('Concluído')}</b>Concluídos</div>
    <div class="card"><b>${n('Arquivado')}</b>Arquivados</div>
    ${Object.keys(d.porTipo).map(t => `<div class="card"><b>${d.porTipo[t]}</b>${esc(t)}</div>`).join('')}</div>
    <h2>Atividade recente</h2>${tabela(d.recentes, false)}`;
};

function tabela(ps, editavel) {
  if (!ps.length) return '<p class="muted">Nenhum registro.</p>';
  return `<table><tr><th>Número</th><th>Tipo</th><th>Instauração</th><th>Investigado</th><th>Encarregado</th><th>Status</th><th>Documento</th></tr>
  ${ps.map(p => { const l = linkSeguro(p.Link_Documento); return `<tr><td>${esc(p.Numero)}</td><td>${esc(p.Tipo)}</td><td>${esc(p.Data_Instauracao)}</td>
    <td>${esc(p.Investigado)}</td><td>${esc(p.Encarregado)}</td>
    <td>${editavel ? `<select data-id="${esc(p.ID_Processo)}">${statusOpts(p.Status)}</select>` : esc(p.Status)}</td>
    <td>${l ? `<a href="${esc(l)}" target="_blank" rel="noopener">Abrir</a>` : ''}</td></tr>`; }).join('')}</table>`;
}

async function listaProcessos(c, titulo, arquivados) {
  const todos = (await API.call('listarProcessos')).filter(p => (p.Status === 'Arquivado') === arquivados);
  c.innerHTML = `<h1>${titulo}</h1><div class="filtros"><input id="q" placeholder="Pesquisar por número, nome ou encarregado">
    <select id="ft"><option value="">Todos os tipos</option><option>PAD</option><option>SAD</option></select></div><div id="tb"></div>`;
  const pinta = () => {
    const q = $('#q').value.toLowerCase(), t = $('#ft').value;
    $('#tb').innerHTML = tabela(todos.filter(p => (!t || p.Tipo === t) &&
      [p.Numero, p.Investigado, p.Encarregado].join(' ').toLowerCase().includes(q)), true);
  };
  $('#q').oninput = pinta; $('#ft').onchange = pinta; pinta();
  $('#tb').onchange = e => {
    if (!e.target.dataset.id) return;
    executar(e.target, async () => { await API.call('alterarStatus', { id: e.target.dataset.id, status: e.target.value }); toast('Status atualizado.'); App.ir(arquivados ? 'arquivados' : 'andamento'); });
  };
}
Views.andamento = c => listaProcessos(c, 'Processos em Andamento', false);
Views.arquivados = c => listaProcessos(c, 'Arquivados', true);

Views.modelos = async function (c) {
  const ms = await API.call('listarModelos');
  c.innerHTML = `<h1>Modelos de Documentos</h1>
  <table><tr><th>Nome</th><th>Tipo</th><th>Ativo</th><th></th></tr>${ms.map(m => `<tr><td>${esc(m.Nome)}</td><td>${esc(m.Tipo)}</td><td>${esc(m.Ativo)}</td>
    <td><button class="btn sec" data-e="${esc(m.ID_Modelo)}">Editar</button></td></tr>`).join('')}</table>
  <div class="card" style="margin-top:16px"><h2 id="mt">Novo modelo</h2>
    <p class="muted">Envie o .docx (da pasta templates/) ao Drive, mantendo-o como .docx, e cole o link ou ID abaixo.</p>
    <div class="grid"><label>Nome <input id="mn"></label><label>Tipo (PAD ou SAD) <input id="mtp"></label>
    <label>Link ou ID do arquivo .docx no Drive <input id="ma"></label></div>
    <label><input type="checkbox" id="mat" checked style="display:inline;width:auto"> Ativo</label>
    <button class="btn" id="ms">Salvar modelo</button></div>`;
  let id = '';
  c.onclick = e => {
    const m = ms.find(x => x.ID_Modelo === e.target.dataset.e); if (!m) return;
    id = m.ID_Modelo; $('#mt').textContent = 'Editar modelo'; $('#mn').value = m.Nome; $('#mtp').value = m.Tipo;
    $('#ma').value = m.ID_Arquivo_Drive; $('#mat').checked = m.Ativo === 'SIM';
  };
  $('#ms').onclick = ev => executar(ev.target, async () => {
    const r = await API.call('salvarModelo', { id, nome: $('#mn').value.trim(), tipo: $('#mtp').value.trim(), idArquivo: $('#ma').value.trim(), ativo: $('#mat').checked });
    toast(`Modelo salvo (${r.tags} tags encontradas).`); App.ir('modelos');
  });
};

Views.auditoria = async function (c) {
  const ls = await API.call('listarLogs');
  c.innerHTML = `<h1>Histórico e Auditoria</h1><div class="filtros"><input id="q" placeholder="Filtrar por usuário, ação ou detalhe"></div><div id="tb"></div>`;
  const pinta = () => {
    const q = $('#q').value.toLowerCase();
    $('#tb').innerHTML = `<table><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Processo</th><th>Detalhes</th></tr>${ls.filter(l => [l.Usuario, l.Acao, l.Detalhes].join(' ').toLowerCase().includes(q))
      .map(l => `<tr><td>${esc(l.Data_Hora)}</td><td>${esc(l.Usuario)}</td><td>${esc(l.Acao)}</td><td>${esc(l.ID_Processo)}</td><td>${esc(l.Detalhes)}</td></tr>`).join('')}</table>`;
  };
  $('#q').oninput = pinta; pinta();
};

Views.usuarios = async function (c) {
  const us = await API.call('listarUsuarios');
  c.innerHTML = `<h1>Gerenciamento de Usuários</h1>
  <table><tr><th>Usuário</th><th>Nome</th><th>Posto</th><th>Perfil</th><th>Status</th><th></th></tr>${us.map(u => `<tr><td>${esc(u.Usuario)}</td><td>${esc(u.Nome_Completo)}</td>
    <td>${esc(u.Posto_Graduacao)}</td><td>${esc(u.Perfil)}</td><td>${esc(u.Status)}</td><td><button class="btn sec" data-e="${esc(u.ID)}">Editar</button></td></tr>`).join('')}</table>
  <div class="card" style="margin-top:16px"><h2 id="ut">Novo usuário</h2><div class="grid">
    <label>Usuário <input id="uu"></label><label>Nome completo <input id="un"></label>
    <label>Posto/graduação <input id="up" list="postosU"></label>
    <label>Perfil <select id="uf"><option>Operador</option><option>Administrador</option></select></label>
    <label>Senha (mín. 8; vazio mantém a atual) <input id="us" type="password" autocomplete="new-password"></label></div>
    <datalist id="postosU">${CONFIG.POSTOS.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    <label><input type="checkbox" id="ua" checked style="display:inline;width:auto"> Ativo</label>
    <button class="btn" id="usv">Salvar usuário</button></div>`;
  let id = '';
  c.onclick = e => {
    const u = us.find(x => x.ID === e.target.dataset.e); if (!u) return;
    id = u.ID; $('#ut').textContent = 'Editar usuário'; $('#uu').value = u.Usuario; $('#un').value = u.Nome_Completo;
    $('#up').value = u.Posto_Graduacao; $('#uf').value = u.Perfil; $('#ua').checked = u.Status === 'Ativo'; $('#us').value = '';
  };
  $('#usv').onclick = ev => executar(ev.target, async () => {
    await API.call('salvarUsuario', { id, usuario: $('#uu').value, nome: $('#un').value.trim(), posto: $('#up').value.trim(), perfil: $('#uf').value, senha: $('#us').value, ativo: $('#ua').checked });
    toast('Usuário salvo.'); App.ir('usuarios');
  });
};

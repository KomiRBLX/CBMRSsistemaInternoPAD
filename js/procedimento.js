// Novo Procedimento: PAD (instauração) e SAD (arquivamento). Gera o DOCX no Apps Script.
Views.novo = async function (c) {
  const modelos = (await API.call('listarModelos')).filter(m => m.Ativo === 'SIM');
  c.innerHTML = `<h1>Novo Procedimento</h1>
    <div class="tabs"><button class="btn on" data-t="PAD">PAD — Instauração</button>
    <button class="btn" data-t="SAD">SAD — Arquivamento</button></div><div id="form"></div>`;
  c.querySelector('.tabs').onclick = e => {
    if (!e.target.dataset.t) return;
    c.querySelectorAll('.tabs .btn').forEach(b => b.classList.toggle('on', b === e.target));
    formulario(e.target.dataset.t, modelos);
  };
  formulario('PAD', modelos);
};

function formulario(tipo, modelos) {
  const ms = modelos.filter(m => String(m.Tipo).toUpperCase() === tipo);
  const box = $('#form');
  if (!ms.length) {
    box.innerHTML = `<div class="card">Nenhum modelo ativo do tipo ${tipo}. Um administrador deve cadastrá-lo em <b>Modelos de Documentos</b>.</div>`;
    return;
  }
  const pad = tipo === 'PAD';
  const mil = [{ nome: '', posto: '', matricula: '' }];
  const trs = [{ numero: '', texto: '' }];
  const salvo = JSON.parse(localStorage.getItem('corregedor') || '{}');

  box.innerHTML = `<datalist id="postos">${CONFIG.POSTOS.map(p => `<option value="${esc(p)}">`).join('')}</datalist>
  <div class="card"><h2>Identificação</h2><div class="grid">
    <label>Modelo <select id="modelo">${ms.map(m => `<option value="${esc(m.ID_Modelo)}">${esc(m.Nome)}</option>`).join('')}</select></label>
    <label>Nº do PAD (ex.: 012/26) <input id="numero"></label>
    <label>Nº do protocolo <input id="protocolo"></label>
    <label>Alocação <input id="alocacao" value="${esc(CONFIG.ALOCACAO_PADRAO)}"></label></div>
    <h2>Corregedor (signatário)</h2><div class="grid">
    <label>Posto <input id="cPosto" list="postos" value="${esc(salvo.posto)}"></label>
    <label>Quadro <input id="cQuadro" value="${esc(salvo.quadro)}"></label>
    <label>Nome de guerra <input id="cNome" value="${esc(salvo.nome)}"></label></div></div>

  <div class="card"><h2>Militares</h2>
    <label>Inserção em lote — uma linha por militar: NOME DE GUERRA, POSTO/GRADUAÇÃO, MATRÍCULA
    <textarea id="lote" placeholder="SILVA, 1º SGT, 123456"></textarea></label>
    <button class="btn sec" id="btnLote">Interpretar linhas</button> <button class="btn sec" id="btnMil">+ Militar</button>
    <div id="mil" style="margin-top:12px"></div></div>

  ${pad ? `<div class="card"><h2>Transgressões</h2>
    <p class="muted">Nº da transgressão no RDCBM e o texto que aparece entre aspas no documento. Com mais de uma, a numeração 01, 02… é automática.</p>
    <div id="trs"></div><button class="btn sec" id="btnTr">+ Transgressão</button></div>` : ''}
  <button class="btn" id="btnGerar">Revisar e gerar documento</button><div id="res"></div>`;

  const renderMil = () => {
    $('#mil').innerHTML = mil.map((m, i) => `<div class="linha" data-i="${i}">
      <label>Nome de guerra <input data-k="nome" value="${esc(m.nome)}"></label>
      <label>Posto/graduação <input data-k="posto" list="postos" value="${esc(m.posto)}"></label>
      <label>Matrícula <input data-k="matricula" value="${esc(m.matricula)}"></label>
      <button class="btn sec" data-rm="${i}" ${mil.length < 2 ? 'disabled' : ''}>Remover</button></div>`).join('');
  };
  const renderTr = () => {
    if (!pad) return;
    $('#trs').innerHTML = trs.map((t, i) => `<div class="linha t" data-i="${i}">
      <label>Nº RDCBM <input data-k="numero" value="${esc(t.numero)}"></label>
      <label>Texto <input data-k="texto" value="${esc(t.texto)}"></label>
      <button class="btn sec" data-rm="${i}" ${trs.length < 2 ? 'disabled' : ''}>Remover</button></div>`).join('');
  };
  const ligar = (sel, arr, render) => {
    const el = $(sel); if (!el) return;
    el.oninput = e => { const l = e.target.closest('[data-i]'); if (l && e.target.dataset.k) arr[l.dataset.i][e.target.dataset.k] = e.target.value; };
    el.onclick = e => { if (e.target.dataset.rm !== undefined) { arr.splice(e.target.dataset.rm, 1); render(); } };
  };
  renderMil(); renderTr(); ligar('#mil', mil, renderMil); ligar('#trs', trs, renderTr);

  $('#btnMil').onclick = () => { mil.push({ nome: '', posto: '', matricula: '' }); renderMil(); };
  if (pad) $('#btnTr').onclick = () => { trs.push({ numero: '', texto: '' }); renderTr(); };
  $('#btnLote').onclick = () => {
    const linhas = $('#lote').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const novos = [], erros = [];
    linhas.forEach((l, i) => {
      const p = l.split(',').map(x => x.trim());
      if (p.length !== 3 || !p.every(Boolean)) return erros.push(i + 1);
      const posto = CONFIG.POSTOS.find(x => x.toLowerCase() === p[1].toLowerCase()) || p[1];
      novos.push({ nome: p[0].toUpperCase(), posto, matricula: p[2] });
    });
    if (erros.length) return toast('Linha(s) fora do formato NOME, POSTO, MATRÍCULA: ' + erros.join(', '), true);
    if (!novos.length) return toast('Nenhuma linha para interpretar.', true);
    if (mil.length === 1 && !mil[0].nome && !mil[0].posto && !mil[0].matricula) mil.length = 0;
    mil.push(...novos); $('#lote').value = ''; renderMil();
  };

  $('#btnGerar').onclick = ev => executar(ev.target, async () => {
    const numero = $('#numero').value.trim(), protocolo = $('#protocolo').value.trim();
    const cp = $('#cPosto').value.trim(), cq = $('#cQuadro').value.trim(), cn = $('#cNome').value.trim();
    if (!numero || !protocolo || !cp || !cn) return toast('Preencha número, protocolo e os dados do corregedor.', true);
    const ms_ = mil.map(m => ({ nome: m.nome.trim(), posto: m.posto.trim(), matricula: m.matricula.trim() }));
    if (ms_.some(m => !m.nome || !m.posto || !/^[\w.\-]+$/.test(m.matricula))) return toast('Revise os militares: nome, posto e matrícula são obrigatórios.', true);
    const ts = trs.map(t => ({ numero: t.numero.trim(), texto: t.texto.trim() }));
    if (pad && ts.some(t => !t.numero || !t.texto)) return toast('Revise as transgressões: nº e texto são obrigatórios.', true);

    const resumo = `${tipo} ${numero}\n${ms_.length} militar(es): ${ms_.map(m => m.posto + ' ' + m.nome).join('; ')}` + (pad ? `\n${ts.length} transgressão(ões)` : '');
    if (!confirm('Gerar documento?\n\n' + resumo)) return;

    localStorage.setItem('corregedor', JSON.stringify({ posto: cp, quadro: cq, nome: cn }));
    const valores = {
      numero_processo: numero, protocolo, alocacao: $('#alocacao').value.trim(),
      corregedor_posto: cp, corregedor_quadro: cq, corregedor_nome: cn,
      identificacao_militares: ms_.map(m => `${m.posto} BM ${m.nome}`).join('; '),
      nome_militar: ms_.map(m => m.nome).join('; '),
    };
    const listas = { militares: ms_.map(m => ({ militar_nome: m.nome, militar_posto: m.posto, militar_matricula: m.matricula })) };
    if (pad) {
      valores.transgressao_numeros = juntar(ts.map(t => t.numero));
      listas.transgressoes = ts.map((t, i) => ({ transgressao_item: ts.length > 1 ? `${String(i + 1).padStart(2, '0')} - ${t.texto}` : t.texto }));
    }
    const r = await API.call('gerar', { idModelo: $('#modelo').value, valores, listas });
    baixar(r.nome, r.base64);
    const link = linkSeguro(r.link);
    $('#res').innerHTML = `<div class="card" style="margin-top:12px">Documento <b>${esc(r.nome)}</b> gerado e registrado.
      ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">Abrir no Drive</a>` : ''}
      <button class="btn sec" id="btnBaixar">Baixar novamente</button></div>`;
    $('#btnBaixar').onclick = () => baixar(r.nome, r.base64);
    toast('Documento gerado.');
  });
}

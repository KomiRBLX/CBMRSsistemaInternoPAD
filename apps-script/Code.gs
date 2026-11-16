/**
 * Corregedoria CBMRS — Controle Interno
 * Apps Script Web App (somente API JSON). Planilha = banco; Drive = modelos e documentos gerados.
 * O site (HTML/CSS/JS) fica na pasta do VS Code e chama esta API via fetch.
 * Uso: cole em um projeto Apps Script criado a partir da planilha (Extensões > Apps Script),
 * execute setup() uma vez e publique como Web App.
 */

const CONFIG = {
  SHEET_ID: '',           // vazio = planilha à qual o script está vinculado
  PASTA_DRIVE_ID: '',     // vazio = cria/usa a pasta "Corregedoria_Documentos" na raiz do Drive
  SESSAO_SEG: 21600,      // 6 h (máximo do CacheService)
  MAX_TENTATIVAS: 5,      // falhas de login antes do bloqueio de 5 min
  PERFIS: ['Administrador', 'Operador'],
  STATUS: ['Em andamento', 'Concluído', 'Arquivado'],
  ABAS: {
    Usuarios: ['ID', 'Usuario', 'Senha_Hash', 'Nome_Completo', 'Posto_Graduacao', 'Perfil', 'Status'],
    Processos: ['ID_Processo', 'Numero', 'Tipo', 'Data_Instauracao', 'Status', 'Encarregado',
                'Investigado', 'Resumo_Fato', 'ID_Documento', 'Link_Documento', 'Criado_Em'],
    Documentos: ['ID_Doc', 'ID_Processo', 'Modelo', 'ID_Arquivo', 'Link', 'Gerado_Em', 'Gerado_Por'],
    Modelos: ['ID_Modelo', 'Nome', 'Tipo', 'ID_Arquivo_Drive', 'Ativo'],
    Logs_Auditoria: ['ID_Log', 'Data_Hora', 'Usuario', 'Acao', 'ID_Processo', 'Detalhes'],
  },
  // Quais tags do modelo alimentam as colunas da aba Processos
  MAPA: { numero: 'numero_processo', data: 'data_instauracao', investigado: 'nome_militar', resumo: 'descricao_fato' },
  // Tags preenchidas pelo sistema (não aparecem no formulário)
  AUTO: ['data_extenso', 'data_atual', 'encarregado_nome', 'encarregado_posto'],
};

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ALVOS_ = /^word\/(document|header\d*|footer\d*)\.xml$/;
const NOME_ = /^[A-Za-z0-9_]+$/;
const PARAG_ = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
// {tag} mesmo quando o Word a divide em vários <w:r>/<w:t>; não atravessa parágrafos
const TAG_ = /\{((?:[^{}<]|<(?!\/w:p>)[^>]*>)*?)\}/g;

/* ---------- Web App ---------- */

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() { return json_({ ok: true, servico: 'Corregedoria CBMRS API' }); }

// Corpo: JSON { acao, token, dados } enviado como text/plain (evita preflight CORS)
function doPost(e) {
  try {
    const r = JSON.parse(e.postData.contents);
    if (r.acao === 'login') {
      const l = login(r.dados.usuario, r.dados.senha);
      return json_(l.ok ? { ok: true, dados: l } : l);
    }
    return json_({ ok: true, dados: api(r.token, r.acao, r.dados) });
  } catch (err) {
    return json_({ ok: false, erro: String(err.message || err) });
  }
}

/* ---------- Setup (executar uma vez) ---------- */

function setup() {
  Object.keys(CONFIG.ABAS).forEach(function (nome) {
    const cab = CONFIG.ABAS[nome];
    const s = aba_(nome) || ss_().insertSheet(nome);
    s.getRange(1, 1, s.getMaxRows(), cab.length).setNumberFormat('@'); // tudo texto: sem Date nem conversões
    s.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold')
      .setBackground('#7a1f2b').setFontColor('#ffffff');
    s.setFrozenRows(1);
  });
  if (!linhas_('Usuarios').length) {
    add_('Usuarios', { ID: id_(), Usuario: 'admin', Senha_Hash: hash_('trocar123'),
      Nome_Completo: 'Administrador', Posto_Graduacao: '', Perfil: 'Administrador', Status: 'Ativo' });
  }
  pasta_();
  Logger.log('Setup concluído na planilha: ' + ss_().getUrl());
}

/* ---------- Infra de planilha ---------- */

function ss_() {
  if (CONFIG.SHEET_ID) return SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const a = SpreadsheetApp.getActive();
  if (!a) throw new Error('Script não vinculado a uma planilha: preencha CONFIG.SHEET_ID com o ID da planilha.');
  return a;
}
function aba_(n) { return ss_().getSheetByName(n); }
function id_() { return Utilities.getUuid().slice(0, 8).toUpperCase(); }
function agora_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss'); }
function limpa_(v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; } // anti formula-injection

function linhas_(n) {
  const v = aba_(n).getDataRange().getValues();
  const h = v.shift();
  return v.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    const o = {};
    h.forEach(function (k, i) { o[k] = r[i]; });
    return o;
  });
}

function add_(n, obj) {
  aba_(n).appendRow(CONFIG.ABAS[n].map(function (k) { return limpa_(obj[k] === undefined ? '' : obj[k]); }));
}

function atualiza_(n, id, campos) {
  const s = aba_(n), v = s.getDataRange().getValues(), h = v[0];
  const r = v.findIndex(function (x, i) { return i > 0 && x[0] === id; });
  if (r < 0) throw new Error('Registro não encontrado.');
  Object.keys(campos).forEach(function (k) {
    s.getRange(r + 1, h.indexOf(k) + 1).setValue(limpa_(campos[k]));
  });
}

function log_(usuario, acao, idProc, detalhes) {
  add_('Logs_Auditoria', { ID_Log: id_(), Data_Hora: agora_(), Usuario: usuario, Acao: acao,
    ID_Processo: idProc || '', Detalhes: detalhes || '' });
}

/* ---------- Autenticação ---------- */

function hash_(senha, salt) {
  salt = salt || Utilities.getUuid();
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + senha, Utilities.Charset.UTF_8);
  return salt + '$' + Utilities.base64Encode(d);
}
function confere_(senha, guardado) { return hash_(senha, String(guardado).split('$')[0]) === guardado; }

function pub_(u) {
  return { ID: u.ID, Usuario: u.Usuario, Nome_Completo: u.Nome_Completo,
    Posto_Graduacao: u.Posto_Graduacao, Perfil: u.Perfil, Status: u.Status };
}

function login(usuario, senha) {
  usuario = String(usuario || '').trim();
  senha = String(senha || '');
  const cache = CacheService.getScriptCache();
  const chave = 'tent_' + usuario.toLowerCase();
  const tent = Number(cache.get(chave) || 0);
  if (tent >= CONFIG.MAX_TENTATIVAS) return { ok: false, erro: 'Muitas tentativas. Aguarde 5 minutos.' };

  const u = linhas_('Usuarios').find(function (x) { return x.Usuario === usuario && x.Status === 'Ativo'; });
  if (!u || !confere_(senha, u.Senha_Hash)) {
    cache.put(chave, String(tent + 1), 300);
    log_(usuario, 'LOGIN_FALHA');
    return { ok: false, erro: 'Usuário ou senha inválidos.' };
  }
  cache.remove(chave);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('s_' + token, u.ID, CONFIG.SESSAO_SEG);
  log_(u.Usuario, 'LOGIN');
  return { ok: true, token: token, usuario: pub_(u) };
}

function sessao_(token) {
  const id = token && CacheService.getScriptCache().get('s_' + token);
  const u = id && linhas_('Usuarios').find(function (x) { return x.ID === id && x.Status === 'Ativo'; });
  if (!u) throw new Error('Sessão expirada.');
  return u;
}

/* ---------- API (ponto único, sempre autenticado) ---------- */

const ROTAS_ = {
  me: function (u) { return pub_(u); },
  sair: sair_,
  dashboard: dashboard_,
  listarProcessos: listarProcessos_,
  alterarStatus: alterarStatus_,
  listarModelos: listarModelos_,
  tagsModelo: tagsModelo_,
  gerar: gerar_,
  salvarModelo: salvarModelo_,
  listarUsuarios: listarUsuarios_,
  salvarUsuario: salvarUsuario_,
  listarLogs: listarLogs_,
};
const ADMIN_ = ['salvarModelo', 'listarUsuarios', 'salvarUsuario', 'listarLogs'];

function api(token, acao, dados) {
  const u = sessao_(token);
  if (!ROTAS_[acao]) throw new Error('Ação inválida.');
  if (ADMIN_.indexOf(acao) >= 0 && u.Perfil !== 'Administrador') throw new Error('Acesso negado.');
  if (acao === 'sair') CacheService.getScriptCache().remove('s_' + token);
  return ROTAS_[acao](u, dados || {});
}

function sair_(u) { log_(u.Usuario, 'LOGOUT'); return true; }

/* ---------- Processos ---------- */

function visiveis_(u) {
  const todos = linhas_('Processos');
  return u.Perfil === 'Administrador' ? todos
    : todos.filter(function (p) { return p.Encarregado === u.Nome_Completo; });
}

function listarProcessos_(u) { return visiveis_(u).reverse(); }

function dashboard_(u) {
  const ps = visiveis_(u), porStatus = {}, porTipo = {};
  ps.forEach(function (p) {
    porStatus[p.Status] = (porStatus[p.Status] || 0) + 1;
    porTipo[p.Tipo] = (porTipo[p.Tipo] || 0) + 1;
  });
  return { total: ps.length, porStatus: porStatus, porTipo: porTipo, recentes: ps.slice(-5).reverse() };
}

function alterarStatus_(u, d) {
  if (CONFIG.STATUS.indexOf(d.status) < 0) throw new Error('Status inválido.');
  const p = visiveis_(u).find(function (x) { return x.ID_Processo === d.id; });
  if (!p) throw new Error('Processo não encontrado.');
  atualiza_('Processos', p.ID_Processo, { Status: d.status });
  log_(u.Usuario, 'STATUS', p.ID_Processo, p.Status + ' -> ' + d.status);
  return true;
}

/* ---------- Modelos ---------- */

function listarModelos_(u) {
  return linhas_('Modelos').filter(function (m) { return u.Perfil === 'Administrador' || m.Ativo === 'SIM'; });
}

function blobModelo_(idArquivo) {
  const f = DriveApp.getFileById(idArquivo);
  if (f.getMimeType() !== MIME_DOCX) throw new Error('O arquivo do modelo precisa ser um .docx (não um Google Doc).');
  return f.getBlob();
}

function tagsModelo_(u, d) {
  const m = linhas_('Modelos').find(function (x) { return x.ID_Modelo === d.id && x.Ativo === 'SIM'; });
  if (!m) throw new Error('Modelo não encontrado.');
  const campos = tagsDe_(blobModelo_(m.ID_Arquivo_Drive)).filter(function (t) { return CONFIG.AUTO.indexOf(t) < 0; });
  return { tipo: m.Tipo, campos: campos };
}

function salvarModelo_(u, d) {
  const idArq = String(d.idArquivo || '').match(/[-\w]{25,}/);
  if (!d.nome || !d.tipo || !idArq) throw new Error('Informe nome, tipo e o link/ID do arquivo .docx.');
  const nTags = tagsDe_(blobModelo_(idArq[0])).length; // valida acesso e formato
  const reg = { Nome: d.nome, Tipo: String(d.tipo).toUpperCase(), ID_Arquivo_Drive: idArq[0], Ativo: d.ativo ? 'SIM' : 'NÃO' };
  if (d.id) atualiza_('Modelos', d.id, reg);
  else { reg.ID_Modelo = id_(); add_('Modelos', reg); }
  log_(u.Usuario, d.id ? 'MODELO_EDITADO' : 'MODELO_CRIADO', '', reg.Nome);
  return { tags: nTags };
}

/* ---------- Motor de tags .docx ---------- */

function nomeTag_(interno) { return interno.replace(/<[^>]+>/g, '').trim(); }

function xml_(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '</w:t><w:br/><w:t xml:space="preserve">');
}

function tagsDe_(blob) {
  const achadas = {};
  Utilities.unzip(blob).filter(function (p) { return ALVOS_.test(p.getName()); }).forEach(function (p) {
    p.getDataAsString('UTF-8').replace(TAG_, function (m, interno) {
      const n = nomeTag_(interno);
      if (NOME_.test(n)) achadas[n] = 1;
      return m;
    });
  });
  return Object.keys(achadas);
}

function subst_(xml, valores) {
  return xml.replace(TAG_, function (m, interno) {
    const n = nomeTag_(interno);
    return NOME_.test(n) && Object.prototype.hasOwnProperty.call(valores, n) ? xml_(valores[n]) : m;
  });
}

// Parágrafo que contém uma tag de uma lista é repetido uma vez por item (mantém numeração/recuo do modelo)
function repete_(xml, listas) {
  return xml.replace(PARAG_, function (p) {
    const tags = [];
    p.replace(TAG_, function (m, i) { tags.push(nomeTag_(i)); return m; });
    for (let i = 0; i < listas.length; i++) {
      const itens = listas[i];
      if (itens.length && tags.some(function (t) { return Object.prototype.hasOwnProperty.call(itens[0], t); })) {
        return itens.map(function (it) { return subst_(p, it); }).join('');
      }
    }
    return p;
  });
}

function preencher_(blob, valores, listas) {
  listas = listas || [];
  const partes = Utilities.unzip(blob).map(function (p) {
    if (!ALVOS_.test(p.getName())) return p;
    let xml = p.getDataAsString('UTF-8');
    if (p.getName() === 'word/document.xml') xml = repete_(xml, listas);
    return Utilities.newBlob(subst_(xml, valores), 'text/xml', p.getName());
  });
  return Utilities.zip(partes, 'documento.docx').setContentType(MIME_DOCX);
}

/* ---------- Geração + registro ---------- */

const MESES_ = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function pasta_() {
  if (CONFIG.PASTA_DRIVE_ID) return DriveApp.getFolderById(CONFIG.PASTA_DRIVE_ID);
  const it = DriveApp.getFoldersByName('Corregedoria_Documentos');
  return it.hasNext() ? it.next() : DriveApp.createFolder('Corregedoria_Documentos');
}

function gerar_(u, d) {
  const m = linhas_('Modelos').find(function (x) { return x.ID_Modelo === d.idModelo && x.Ativo === 'SIM'; });
  if (!m) throw new Error('Modelo não encontrado.');

  const hoje = new Date();
  const v = {};
  Object.keys(d.valores || {}).forEach(function (k) {
    if (NOME_.test(k) && CONFIG.AUTO.indexOf(k) < 0) v[k] = String(d.valores[k]).slice(0, 5000);
  });
  v.data_extenso = hoje.getDate() + ' de ' + MESES_[hoje.getMonth()] + ' de ' + hoje.getFullYear();
  v.data_atual = Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  v.encarregado_nome = u.Nome_Completo;
  v.encarregado_posto = u.Posto_Graduacao;

  // listas: { nome: [ {tag: valor} ] } — cada item repete o parágrafo do modelo que usa suas tags
  const listas = [];
  Object.keys(d.listas || {}).slice(0, 5).forEach(function (k) {
    const itens = (d.listas[k] || []).slice(0, 200).map(function (it) {
      const o = {};
      Object.keys(it || {}).forEach(function (c) { if (NOME_.test(c)) o[c] = String(it[c]).slice(0, 2000); });
      return o;
    });
    if (itens.length) listas.push(itens);
  });
  const arquiva = String(m.Tipo).toUpperCase() === 'SAD';

  const M = CONFIG.MAPA;
  const numero = String(v[M.numero] || '').trim();
  if (!numero) throw new Error('Informe o número do processo.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const blob = preencher_(blobModelo_(m.ID_Arquivo_Drive), v, listas);
    const nome = (m.Tipo + '_' + numero).replace(/[^\w\-]+/g, '_') + '.docx';
    blob.setName(nome);
    const arq = pasta_().createFile(blob);

    let proc = linhas_('Processos').find(function (p) { return p.Numero === numero; });
    if (!proc) {
      proc = { ID_Processo: id_(), Numero: numero, Tipo: m.Tipo, Data_Instauracao: v[M.data] || v.data_atual,
        Status: arquiva ? 'Arquivado' : CONFIG.STATUS[0], Encarregado: u.Nome_Completo, Investigado: v[M.investigado] || '',
        Resumo_Fato: v[M.resumo] || '', ID_Documento: arq.getId(), Link_Documento: arq.getUrl(), Criado_Em: agora_() };
      add_('Processos', proc);
    } else {
      atualiza_('Processos', proc.ID_Processo, Object.assign({ ID_Documento: arq.getId(), Link_Documento: arq.getUrl() },
        arquiva ? { Status: 'Arquivado' } : {}));
    }
    add_('Documentos', { ID_Doc: id_(), ID_Processo: proc.ID_Processo, Modelo: m.Nome, ID_Arquivo: arq.getId(),
      Link: arq.getUrl(), Gerado_Em: agora_(), Gerado_Por: u.Usuario });
    log_(u.Usuario, 'DOC_GERADO', proc.ID_Processo, m.Nome + ' / ' + numero);
    if (arquiva) log_(u.Usuario, 'ARQUIVADO', proc.ID_Processo, numero);

    return { nome: nome, base64: Utilities.base64Encode(blob.getBytes()), link: arq.getUrl(), numero: numero };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Auditoria ---------- */

function listarLogs_() { return linhas_('Logs_Auditoria').slice(-500).reverse(); }

/* ---------- Usuários ---------- */

function listarUsuarios_() { return linhas_('Usuarios').map(pub_); }

function salvarUsuario_(u, d) {
  const usuario = String(d.usuario || '').trim();
  if (!usuario || !d.nome) throw new Error('Informe usuário e nome completo.');
  if (CONFIG.PERFIS.indexOf(d.perfil) < 0) throw new Error('Perfil inválido.');
  if (d.senha && String(d.senha).length < 8) throw new Error('A senha deve ter ao menos 8 caracteres.');
  const todos = linhas_('Usuarios');
  if (todos.some(function (x) { return x.Usuario === usuario && x.ID !== d.id; })) throw new Error('Usuário já existe.');

  const reg = { Usuario: usuario, Nome_Completo: d.nome, Posto_Graduacao: d.posto || '',
    Perfil: d.perfil, Status: d.ativo ? 'Ativo' : 'Inativo' };
  if (d.id) {
    if (d.senha) reg.Senha_Hash = hash_(String(d.senha));
    atualiza_('Usuarios', d.id, reg);
  } else {
    if (!d.senha) throw new Error('Defina uma senha.');
    reg.ID = id_();
    reg.Senha_Hash = hash_(String(d.senha));
    add_('Usuarios', reg);
  }
  log_(u.Usuario, d.id ? 'USUARIO_EDITADO' : 'USUARIO_CRIADO', '', usuario);
  return true;
}

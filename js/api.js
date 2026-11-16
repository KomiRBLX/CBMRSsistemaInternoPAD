// Único ponto de comunicação com o Apps Script (/exec). text/plain evita preflight CORS.
const API = {
  token: sessionStorage.getItem('tk') || '',

  async _post(corpo) {
    const r = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(corpo) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.erro || 'Erro desconhecido.');
    return j.dados;
  },

  async login(usuario, senha) {
    const d = await this._post({ acao: 'login', dados: { usuario, senha } });
    this.token = d.token; sessionStorage.setItem('tk', d.token);
    return d.usuario;
  },

  async call(acao, dados) {
    try { return await this._post({ acao, token: this.token, dados: dados || {} }); }
    catch (e) { if (/Sessão expirada/.test(e.message)) App.logout(true); throw e; }
  },

  limpar() { this.token = ''; sessionStorage.removeItem('tk'); },
};

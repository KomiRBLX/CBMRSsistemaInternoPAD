const Views = {}; // preenchido por procedimento.js e gestao.js, usado por app.js
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const linkSeguro = u => /^https:\/\/(docs|drive)\.google\.com\//.test(u) ? u : '';

let _t;
function toast(msg, erro) {
  const t = $('#toast');
  t.textContent = msg; t.className = erro ? 'erro' : ''; t.style.display = 'block';
  clearTimeout(_t); _t = setTimeout(() => t.style.display = 'none', erro ? 6000 : 3000);
}

async function executar(btn, fn) {
  btn.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; }
}

function baixar(nome, b64) {
  const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// 1 -> "a"; 2 -> "a e b"; 3+ -> "a, b e c"
function juntar(arr) {
  return arr.length < 2 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];
}

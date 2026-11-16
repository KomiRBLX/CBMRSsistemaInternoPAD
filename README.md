# Corregedoria CBMRS — Controle Interno

Frontend estático (HTML/CSS/JS puro, sem dependências) + API em Google Apps Script (`apps-script/Code.gs`).

## Instalação
1. **Planilha:** crie uma Google Planilha → Extensões → Apps Script → cole `apps-script/Code.gs` → execute `setup()` (cria abas, pasta no Drive e o usuário `admin` / senha `trocar123` — **troque no primeiro acesso**).
2. **Implantar:** Implantar → Nova implantação → Web App → Executar como: *você*; Acesso: *Qualquer pessoa*. (A autenticação é feita pelo próprio sistema; sem isso o `fetch` do site não alcança a API.) Copie a URL `/exec`.
3. **Frontend:** cole a URL em `js/config.js` (`API_URL`). Coloque o brasão em `assets/images/brasao.png`. Abra `index.html` ou hospedeie a pasta em qualquer servidor estático.
4. **Modelos:** envie `templates/MODELO_PAD.docx` e `MODELO_SAD.docx` ao Drive (mantenha como .docx, não converta em Google Doc). Entre como admin → *Modelos de Documentos* → cadastre cada um com tipo `PAD` / `SAD` e o link do arquivo.

## Tags dos modelos
| Tag | Origem |
|---|---|
| `{numero_processo}` `{protocolo}` `{alocacao}` | formulário |
| `{corregedor_posto}` `{corregedor_quadro}` `{corregedor_nome}` | formulário (lembrado no navegador) |
| `{identificacao_militares}` | `POSTO BM NOME` de cada militar, separados por `;` |
| `{militar_nome}` `{militar_posto}` `{militar_matricula}` | **lista**: o parágrafo "a) …" é repetido por militar |
| `{transgressao_item}` | **lista**: o parágrafo entre aspas é repetido; `01 - …` só quando há mais de uma |
| `{transgressao_numeros}` | nº(s) RDCBM: `12`, `12 e 15`, `12, 15 e 20` |
| `{data_extenso}` | automática (data da geração) |

Regra do motor: um parágrafo que contenha qualquer tag de uma lista é repetido, com recuo/numeração do modelo.

## Alterações feitas no seu Code.gs
- `gerar` aceita `listas` (repetição de parágrafos) — funções `repete_`, `subst_`; `preencher_` ganhou o 3º parâmetro.
- Nova rota admin `listarLogs` (tela de auditoria).
- Gerar um **SAD** marca o processo (mesmo número do PAD) como `Arquivado` e registra `ARQUIVADO`.
- O restante (login, sessão, hash, rotas, abas) está intacto.

## Pontos para sua revisão (não alterei texto oficial)
- O modelo SAD tem o título **"SANÇÃO ADMINISTRATIVA DISCIPLINAR"** e a frase "cumprimento da sanção…", incomuns para um arquivamento. Mantidos como estão.
- Os dois modelos têm um acento solto (`´PORTO ALEGRE`) antes da data. Mantido.
- "nº XXX" com várias transgressões vira "nº 12 e 15" (singular "nº" mantido); confirme a redação desejada.
- Os postos em `js/config.js` são uma sugestão: ajuste à tabela oficial.
- Não há dependência de login por IP; o `Logs_Auditoria` registra usuário e ação.

## Ainda não implementado (fora do Code.gs atual)
Pastas por procedimento no Drive (hoje tudo vai em `Corregedoria_Documentos`), versionamento de modelos, edição de dados do processo, filtro por período.

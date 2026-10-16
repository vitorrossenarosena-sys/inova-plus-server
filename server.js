// Servidor intermediário do INOVA+ (Node 18+, sem dependências).
// Uso: ANTHROPIC_API_KEY=sua_chave node server.js
// A chave fica SOMENTE aqui (variável de ambiente), nunca no HTML.
const http = require('http');
const KEY = process.env.ANTHROPIC_API_KEY;
const UPSTREAM = process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.MODEL || 'claude-sonnet-5-5';
const ORIGIN = process.env.ALLOWED_ORIGIN || '*';   // em produção, coloque o endereço do seu site
const PORT = process.env.PORT || 8787;
const hits = new Map();                              // limite simples: 30 pedidos/min por IP
const SYSTEM = `Você é a IA do INOVA+, uma plataforma de estudos, criação de jogos, programação e produtividade.
Converse em português brasileiro, a menos que a pessoa use outro idioma. Responda exatamente ao que foi perguntado,
com tamanho proporcional à pergunta, e varie a forma de começar. Use o histórico para entender referências como "isso" e "continue".
Aceite erros de digitação e gírias. Peça esclarecimento se a pergunta for ambígua. Diga quando não souber; não invente fatos, links ou fontes.
Você pode falar de qualquer assunto, não só do INOVA+. Quando o contexto trouxer tarefas/projetos do usuário, use-os apenas se forem relevantes.
Para Roblox/Luau, diga onde colocar cada script, quais objetos criar e como testar, e não afirme que o código foi testado.`;
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }); res.end(JSON.stringify(obj)); };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'POST') return send(res, 405, { error: 'use POST' });
  const ip = req.socket.remoteAddress, now = Date.now();
  const h = (hits.get(ip) || []).filter(t => now - t < 60000); h.push(now); hits.set(ip, h);
  if (h.length > 30) return send(res, 429, { error: 'muitos pedidos, aguarde um minuto' });
  let body = ''; req.on('data', c => { body += c; if (body.length > 200000) req.destroy(); });
  req.on('end', async () => {
    try {
      if (!KEY) return send(res, 500, { error: 'ANTHROPIC_API_KEY não configurada no servidor' });
      const { messages, context } = JSON.parse(body);
      const msgs = (Array.isArray(messages) ? messages : []).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()).slice(-20).map(m => ({ role: m.role, content: m.content.slice(0, 8000) }));
      while (msgs.length && msgs[0].role !== 'user') msgs.shift();
      if (!msgs.length) return send(res, 400, { error: 'nenhuma mensagem válida' });
      let system = SYSTEM;
      if (context && context.instructions) system += '\n\nInstruções desta área: ' + String(context.instructions).slice(0, 1000);
      if (context && context.data) system += '\n\nDados cadastrados pelo usuário (JSON): ' + JSON.stringify(context.data).slice(0, 4000);
      const r = await fetch(UPSTREAM, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: MODEL, max_tokens: 1500, system, messages: msgs }) });
      const j = await r.json();
      if (!r.ok) return send(res, 502, { error: 'erro do provedor: ' + (j.error && j.error.message || r.status) });
      send(res, 200, { reply: (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n') });
    } catch (e) { send(res, 400, { error: 'pedido inválido: ' + e.message }); }
  });
}).listen(PORT, () => console.log('INOVA+ IA em http://localhost:' + PORT));

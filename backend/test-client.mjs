import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:7000/ws');

const prompt = process.argv[2] ?? 'Lee el README de este workspace y resume su contenido en 2 líneas.';

ws.on('open', () => {
  console.log('🔌 Conectado. Enviando prompt:\n  >', prompt, '\n');
  ws.send(JSON.stringify({ type: 'prompt', text: prompt }));
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === 'sdk_message') {
    const m = msg.message;
    if (m.type === 'assistant' && m.message?.content) {
      for (const block of m.message.content) {
        if (block.type === 'text') {
          process.stdout.write(`\x1b[36m${block.text}\x1b[0m`);
        } else if (block.type === 'tool_use') {
          console.log(`\n\x1b[33m🛠️  ${block.name}\x1b[0m`, JSON.stringify(block.input).slice(0, 200));
        }
      }
    } else if (m.type === 'user' && m.message?.content) {
      for (const block of m.message.content) {
        if (block.type === 'tool_result') {
          const txt = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
          console.log(`\x1b[90m   ↳ ${txt.slice(0, 200).replace(/\n/g, ' ')}${txt.length > 200 ? '…' : ''}\x1b[0m`);
        }
      }
    } else if (m.type === 'result') {
      console.log(`\n\x1b[32m✅ Resultado: ${m.subtype}, costo: $${m.total_cost_usd?.toFixed(4) ?? '?'}, turnos: ${m.num_turns}\x1b[0m`);
    } else if (m.type === 'system' && m.subtype === 'init') {
      console.log(`\x1b[90m[init] sesión=${m.session_id?.slice(0, 8)} model=${m.model} cwd=${m.cwd}\x1b[0m\n`);
    }
  } else if (msg.type === 'done') {
    console.log('\n🏁 Done. Cerrando.');
    ws.close();
  } else if (msg.type === 'error') {
    console.error('\n❌ Error:', msg.message);
    ws.close();
    process.exit(1);
  }
});

ws.on('close', () => process.exit(0));
ws.on('error', (e) => { console.error('WS error:', e.message); process.exit(1); });

const WebSocket = require('ws');
const readline = require('readline');
const http = require('http');
const fs = require('fs');
const path = require('path');

const httpServer = http.createServer((req, res) => {
  // ===== Habilita CORS para qualquer origem =====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responde imediatamente a preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/cmd') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const cmd = body.toString().trim();
      if (!cmd) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Comando vazio' }));
        return;
      }

      // Início da nova lógica para múltiplos ESP32 (ETAPA 3)
      const parts = cmd.split(':');
      const targetId = parts[0];
      const realCommand = parts.slice(1).join(':').trim();

      const targetSocket = espSockets.get(targetId);

      if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
        try {
          targetSocket.send(realCommand);
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Falha ao enviar comando' }));
          return;
        }

        const timeoutMs = 5000;
        let responded = false;

        const timer = setTimeout(() => {
          if (responded) return;
          responded = true;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Sem resposta do ESP32 (timeout)' }));
        }, timeoutMs);

        const onResp = (message) => {
          if (responded) return; // já expirou
          responded = true;
          clearTimeout(timer);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', response: message.toString() }));
        };

        targetSocket.once('message', onResp);
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `ESP32 ${targetId} não está conectado` }));
      }
    });
    return; // evita continuar para a parte de arquivos estáticos
  }

  if (req.method === 'GET' && req.url === '/api/list') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(Array.from(espSockets)));
    return;
  }

  // Caminho do arquivo solicitado (root => index.html)
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 - Arquivo não encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
    };

    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(content);
  });
});

// WebSocket dedicado para o ESP32 (porta 8043)
const espWss = new WebSocket.Server({ port: 8043, perMessageDeflate: false });

// WebSocket para clientes Web compartilhando a porta 3043 (path /ws)
const clientWss = new WebSocket.Server({ server: httpServer, path: '/ws', perMessageDeflate: false });

// Substitui variável única por mapa de conexões
const espSockets = new Map(); // chave: id (ex: 'esp01'), valor: WebSocket

// ===========================
// Conexão do ESP32 (porta 8043)
// ===========================
espWss.on('connection', function connection(ws) {
  console.log('ESP32 conectado. Aguardando identificação...');

  ws.once('message', (message) => {
    const raw = message.toString().trim();
    const parts = raw.split('|');
    // Espera-se formato: ssid|password|email|randomId
    const id = parts.length >= 4 ? parts[3].trim() : raw; // fallback para mensagem inteira

    if (!id) {
      console.log('ESP32 sem randomId. Conexão ignorada.');
      ws.close();
      return;
    }

    // Opcional: guardar dados extras do ESP32 (SSID/email/etc.)
    const espInfo = {
      ssid: parts[0] || '',
      password: parts[1] || '',
      email: parts[2] || '',
      id,
    };

    ws._espInfo = espInfo; // anexa informações na própria conexão
    espSockets.set(id, ws);
    console.log(`ESP32 registrado como: ${id}`);

    // Envia confirmação ao ESP
    ws.send(`Registrado como ${id}`);

    // Escuta outras mensagens do ESP32
    ws.on('message', (msg) => {
      console.log(`[${id}] =>`, msg.toString());

      // Reencaminha para todos os clientes Web
      clientWss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(`[${id}] ${msg.toString()}`);
        }
      });
    });

    ws.on('close', () => {
      console.log(`ESP32 ${id} desconectado`);
      // Remove apenas se este socket ainda estiver registrado
      if (espSockets.get(id) === ws) {
        espSockets.delete(id);
      }
      clientWss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(`ESP32 ${id} desconectado.`);
        }
      });
    });

    ws.on('error', (err) => {
      console.error(`Erro no ESP32 (${id}):`, err.message);
    });
  });
});

espWss.on('error', (err) => {
  console.error('Erro no servidor WebSocket ESP:', err.message);
});

// ============================================
// Conexão de clientes Web (interface) via path /ws na porta 3043
// ============================================
clientWss.on('connection', (ws) => {
  console.log('Cliente Web conectado.');
  if (espSockets.size > 0) {
    ws.send('ESP32(s) conectado(s): ' + Array.from(espSockets.keys()).join(', '));
  } else {
    ws.send('Aviso: Nenhum ESP32 conectado.');
  }

  // Quando o cliente envia um comando no formato <id>:<comando>, repassamos ao ESP32 alvo
  ws.on('message', (message) => {
    console.log('Comando do cliente:', message.toString());
    const text = message.toString().trim();
    const parts = text.split(':');
    const targetId = parts[0];
    const realCommand = parts.slice(1).join(':').trim();
    const targetSocket = espSockets.get(targetId);

    if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
      targetSocket.send(realCommand);
    } else {
      ws.send(`Erro: ESP32 ${targetId} não está conectado.`);
    }
  });

  ws.on('close', () => {
    console.log('Cliente Web desconectado.');
  });
});

clientWss.on('error', (err) => {
  console.error('Erro no servidor WebSocket clientes:', err.message);
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function promptComando() {
  rl.question('Digite um comando (<id>:<comando>): ', (input) => {
    const parts = input.trim().split(':');
    const targetId = parts[0];
    const realCommand = parts.slice(1).join(':').trim();
    const targetSocket = espSockets.get(targetId);

    if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
      targetSocket.send(realCommand);
    } else {
      console.log(`ESP32 ${targetId} não está conectado.`);
    }
    promptComando(); // continua perguntando
  });
}

console.log(`Servidor HTTP + WebSocket em http://localhost:3043
 - Path do ESP32: ws://localhost:8043
 - Path clientes: ws://localhost:3043/ws`);
promptComando();

httpServer.listen(3043, () => {
  console.log('HTTP + WebSocket ouvindo na porta 3043');
});

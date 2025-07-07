const WebSocket = require('ws');
const readline = require('readline');
const http = require('http');
const fs = require('fs');
const path = require('path');

// === Servidor HTTP (única porta) ===
const httpServer = http.createServer((req, res) => {
  // Rota para enviar comando ao ESP32 via HTTP POST
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

      if (espSocket && espSocket.readyState === WebSocket.OPEN) {
        // Envia comando e aguarda primeira resposta ou timeout (5s)
        try {
          espSocket.send(cmd);
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

        // Escuta uma única resposta
        const onResp = (message) => {
          if (responded) return; // já expirou
          responded = true;
          clearTimeout(timer);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', response: message.toString() }));
        };

        espSocket.once('message', onResp);
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'ESP32 não está conectado' }));
      }
    });
    return; // evita continuar para a parte de arquivos estáticos
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

// WebSocket dedicado para o ESP32 (porta 8081)
const espWss = new WebSocket.Server({ port: 8081, perMessageDeflate: false });

// WebSocket para clientes Web compartilhando a porta 3000 (path /ws)
const clientWss = new WebSocket.Server({ server: httpServer, path: '/ws', perMessageDeflate: false });

let espSocket = null; // conexão ativa do ESP32

// ===========================
// Conexão do ESP32 (porta 8081)
// ===========================
espWss.on('connection', function connection(ws) {
  console.log('ESP32 conectado!');
  espSocket = ws;

  ws.on('message', function incoming(message) {
    const data = new Date();
    console.log(`ESP32 disse: (${data.getDate()}/${data.getMonth()+1}) (${data.getHours()}:${data.getMinutes()}:${data.getSeconds()})`, message.toString());
    // Encaminha qualquer mensagem vinda do ESP32 para todos os clientes Web
    clientWss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message.toString());
      }
    });
  });

  ws.on('close', () => {
    console.log('ESP32 desconectado.');
    espSocket = null;
    // Informa aos clientes que o ESP32 se desconectou
    clientWss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send('ESP32 desconectado.');
      }
    });
  });

  ws.on('error', (err) => {
    console.error('Erro no WebSocket do ESP:', err.message);
  });
});

espWss.on('error', (err) => {
  console.error('Erro no servidor WebSocket ESP:', err.message);
});

// ============================================
// Conexão de clientes Web (interface) via path /ws na porta 3000
// ============================================
clientWss.on('connection', (ws) => {
  console.log('Cliente Web conectado.');
  if (espSocket && espSocket.readyState === WebSocket.OPEN) {
    ws.send('ESP32 conectado. Pronto para receber comandos.');
  } else {
    ws.send('Aviso: ESP32 não está conectado.');
  }

  // Quando o cliente envia um comando, repassamos ao ESP32
  ws.on('message', (message) => {
    console.log('Comando do cliente:', message.toString());
    if (espSocket && espSocket.readyState === WebSocket.OPEN) {
      espSocket.send(message.toString());
    } else {
      ws.send('Erro: ESP32 não está conectado.');
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
  rl.question('Digite um comando para o ESP32: ', (input) => {
    if (espSocket && espSocket.readyState === WebSocket.OPEN) {
      espSocket.send(input);
    } else {
      console.log('ESP32 não está conectado.');
    }
    promptComando(); // continua perguntando
  });
}

console.log(`Servidor HTTP + WebSocket em http://localhost:3000
 - Path do ESP32: ws://localhost:8081
 - Path clientes: ws://localhost:3000/ws`);
promptComando();

httpServer.listen(3000, () => {
  console.log('HTTP + WebSocket ouvindo na porta 3000');
});

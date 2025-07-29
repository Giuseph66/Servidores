const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

// Configurações do servidor
const PORT = 8080;
const AUDIO_DIR = './audios';
// URL do servidor principal (endpoint de clientes Web)
// Use variável de ambiente MAIN_SERVER_WS para facilitar deploy
const MAIN_SERVER_WS = process.env.MAIN_SERVER_WS || 'wss://esp-server.neurelix.com.br/ws'; // Conecta via Cloudflare

// Cria diretório para salvar áudios se não existir
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR);
}

// Inicializa servidor WebSocket próprio
const wss = new WebSocket.Server({ port: PORT });

console.log(`🎙️ Servidor de áudio iniciado na porta ${PORT}`);
console.log(`📁 Áudios serão salvos em: ${AUDIO_DIR}`);
console.log(`🔗 Conectando ao servidor principal: ${MAIN_SERVER_WS}`);

// Armazena dados de áudio por ESP32 (usando o ID do ESP32)
const audioSessions = new Map();

// ===== CONEXÃO COM SERVIDOR PRINCIPAL =====
let mainServerConnection = null;

function connectToMainServer() {
  try {
    mainServerConnection = new WebSocket(MAIN_SERVER_WS);
    
    mainServerConnection.on('open', () => {
      console.log('✅ Conectado ao servidor principal (porta 8043)');
      console.log('🎵 Aguardando dados de áudio dos ESP32...');
    });
    
    mainServerConnection.on('message', (data) => {
      const raw = data.toString();

      // Espera formato: "[ID] audio|..."
      const match = raw.match(/^\[([^\]]+)\]\s+(audio\|.*)/);
      if (match) {
        const espId = match[1].trim();
        const payload = match[2].trim();
        processAudioFromMainServer(espId, payload);
        return;
      }

      // Mensagem sem prefixo - loga
      console.log(`📨 Mensagem do servidor principal: ${raw}`);
    });
    
    mainServerConnection.on('close', () => {
      console.log('❌ Desconectado do servidor principal');
      // Tenta reconectar após 5 segundos
      setTimeout(connectToMainServer, 5000);
    });
    
    mainServerConnection.on('error', (error) => {
      console.error('❌ Erro na conexão com servidor principal:', error.message);
      // Tenta reconectar após 5 segundos
      setTimeout(connectToMainServer, 5000);
    });
    
  } catch (error) {
    console.error('❌ Erro ao conectar com servidor principal:', error.message);
    // Tenta reconectar após 5 segundos
    setTimeout(connectToMainServer, 5000);
  }
}

// Inicia conexão com servidor principal
connectToMainServer();

// ===== SERVIDOR WEB SOCKET PRÓPRIO =====
wss.on('connection', (ws, req) => {
  const clientId = req.socket.remoteAddress + ':' + req.socket.remotePort;
  console.log(`🔌 Cliente conectado ao servidor de áudio: ${clientId}`);
  
  // Envia status atual
  ws.send(JSON.stringify({
    type: 'status',
    message: 'Servidor de áudio conectado',
    activeSessions: audioSessions.size,
    audioDirectory: AUDIO_DIR
  }));
  
  ws.on('message', (message) => {
    const data = message.toString();
    
    try {
      const command = JSON.parse(data);
      
      if (command.type === 'get_sessions') {
        // Retorna sessões ativas
        ws.send(JSON.stringify({
          type: 'sessions',
          sessions: Array.from(audioSessions.entries()).map(([espId, session]) => ({
            espId,
            chunks: session.chunks.length,
            totalChunks: session.totalChunks,
            progress: session.totalChunks > 0 ? ((session.chunks.length / session.totalChunks) * 100).toFixed(1) : 0
          }))
        }));
      } else if (command.type === 'clear_sessions') {
        // Limpa todas as sessões
        audioSessions.clear();
        ws.send(JSON.stringify({
          type: 'status',
          message: 'Sessões de áudio limpas'
        }));
      }
    } catch (error) {
      console.log(`📨 Comando recebido: ${data}`);
    }
  });
  
  ws.on('close', () => {
    console.log(`🔌 Cliente desconectado do servidor de áudio: ${clientId}`);
  });
  
  ws.on('error', (error) => {
    console.error(`❌ Erro na conexão ${clientId}:`, error);
  });
});

// ===== PROCESSAMENTO DE ÁUDIO =====
function processAudioFromMainServer(espId, audioData) {
  console.log(`🎵 Processando áudio do ESP32 ${espId}`);
  
  // Verifica se é um comando de áudio
  if (audioData.startsWith('audio|')) {
    const parts = audioData.split('|');
    
    if (parts[1] === 'fim') {
      // Finaliza recebimento do áudio
      finishAudioSessionFromMain(espId);
    } else {
      // Recebe chunk de áudio
      receiveAudioChunkFromMain(espId, parts);
    }
  }
}

function receiveAudioChunkFromMain(espId, parts) {
  try {
    const chunkNum = parseInt(parts[1]);
    const total = parseInt(parts[2]);
    const encodedData = parts[3];
    
    let session = audioSessions.get(espId);
    if (!session) {
      // Cria nova sessão para este ESP32
      session = {
        clientId: 'main_server',
        espId: espId,
        chunks: [],
        currentChunk: 0,
        totalChunks: 0,
        startTime: null,
        lastChunkTime: null
      };
      audioSessions.set(espId, session);
    }
    
    if (chunkNum === 0) {
      // Primeiro chunk - reinicializa sessão
      session.chunks = [];
      session.totalChunks = total;
      session.startTime = Date.now();
      session.lastChunkTime = Date.now();
      console.log(`🎵 Iniciando recebimento de áudio de ESP32 ${espId} (${total} chunks)`);
    }
    
    // Decodifica dados do chunk
    const chunkData = Buffer.from(encodedData, 'base64');
    session.chunks.push(chunkData);
    session.currentChunk = chunkNum + 1;
    session.lastChunkTime = Date.now();
    
    // Calcula progresso
    const progress = ((chunkNum + 1) / total * 100).toFixed(1);
    console.log(`📦 Chunk ${chunkNum + 1}/${total} recebido (${progress}%) de ESP32 ${espId}`);
    
    // Notifica clientes conectados ao servidor de áudio
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'audio_progress',
          espId: espId,
          chunk: chunkNum + 1,
          total: total,
          progress: progress
        }));
      }
    });
    
  } catch (error) {
    console.error(`❌ Erro ao processar chunk de ESP32 ${espId}:`, error);
  }
}

function finishAudioSessionFromMain(espId) {
  const session = audioSessions.get(espId);
  if (!session) {
    console.error(`❌ Sessão não encontrada para ESP32 ${espId}`);
    return;
  }
  
  try {
    const endTime = Date.now();
    const duration = endTime - session.startTime;
    
    console.log(`✅ Áudio finalizado de ESP32 ${espId}`);
    console.log(`📊 Estatísticas:`);
    console.log(`   - Chunks recebidos: ${session.chunks.length}/${session.totalChunks}`);
    console.log(`   - Tempo total: ${duration}ms`);
    console.log(`   - Tamanho total: ${session.chunks.reduce((sum, chunk) => sum + chunk.length, 0)} bytes`);
    
    // Concatena todos os chunks
    const audioData = Buffer.concat(session.chunks);
    
    // Gera nome único para o arquivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `audio_esp32_${espId}_${timestamp}`;
    
    // Salva como arquivo RAW
    //const rawPath = path.join(AUDIO_DIR, `${filename}.raw`);
    //fs.writeFileSync(rawPath, audioData);
    
    // Cria arquivo WAV
    const wavPath = path.join(AUDIO_DIR, `${filename}.wav`);
    createWavFile(wavPath, audioData);
    
    // Cria arquivo de metadados
    const metaPath = path.join(AUDIO_DIR, `${filename}.json`);
    const metadata = {
      espId: espId,
      source: 'main_server',
      timestamp: new Date().toISOString(),
      duration: duration,
      chunks: session.chunks.length,
      totalChunks: session.totalChunks,
      size: audioData.length,
      sampleRate: 8000,
      bitsPerSample: 8,
      channels: 1,
      recordSeconds: 3,
      bufferSize: 24000
    };
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
    
    console.log(`💾 Áudio salvo:`);
    //console.log(`   - RAW: ${rawPath}`);
    console.log(`   - WAV: ${wavPath}`);
    console.log(`   - Meta: ${metaPath}`);
    
    // Notifica clientes conectados ao servidor de áudio
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'audio_complete',
          espId: espId,
          filename: filename,
          size: audioData.length,
          duration: duration,
          files: {
            //raw: rawPath,
            wav: wavPath,
            meta: metaPath
          }
        }));
      }
    });
    
    // Limpa sessão
    session.chunks = [];
    session.currentChunk = 0;
    session.totalChunks = 0;
    
  } catch (error) {
    console.error(`❌ Erro ao finalizar áudio de ESP32 ${espId}:`, error);
    
    // Notifica erro aos clientes
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'audio_error',
          espId: espId,
          error: error.message
        }));
      }
    });
  }
}

function createWavFile(filepath, audioData) {
  // Cabeçalho WAV para 8kHz, 8-bit, mono (configuração do ESP32)
  const wavHeader = Buffer.alloc(44);
  
  // RIFF header
  wavHeader.write('RIFF', 0);
  wavHeader.writeUInt32LE(36 + audioData.length, 4);
  wavHeader.write('WAVE', 8);
  
  // fmt chunk
  wavHeader.write('fmt ', 12);
  wavHeader.writeUInt32LE(16, 16); // fmt chunk size
  wavHeader.writeUInt16LE(1, 20);  // PCM format
  wavHeader.writeUInt16LE(1, 22);  // mono
  wavHeader.writeUInt32LE(8000, 24); // sample rate (SAMPLE_RATE do ESP32)
  wavHeader.writeUInt32LE(8000, 28); // byte rate
  wavHeader.writeUInt16LE(1, 32);   // block align
  wavHeader.writeUInt16LE(8, 34);   // bits per sample
  
  // data chunk
  wavHeader.write('data', 36);
  wavHeader.writeUInt32LE(audioData.length, 40);
  
  // Escreve arquivo WAV
  const wavData = Buffer.concat([wavHeader, audioData]);
  fs.writeFileSync(filepath, wavData);
}

// Tratamento de erros do servidor
wss.on('error', (error) => {
  console.error('❌ Erro no servidor WebSocket de áudio:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando servidor de áudio...');
  if (mainServerConnection) {
    mainServerConnection.close();
  }
  wss.close(() => {
    console.log('✅ Servidor de áudio encerrado');
    process.exit(0);
  });
});

// Log de status periódico
setInterval(() => {
  const activeConnections = wss.clients.size;
  const activeSessions = audioSessions.size;
  const mainConnected = mainServerConnection && mainServerConnection.readyState === WebSocket.OPEN;
  
  console.log(`📊 Status: ${activeConnections} conexões ativas, ${activeSessions} sessões de áudio, Main: ${mainConnected ? 'Conectado' : 'Desconectado'}`);
}, 30000); 
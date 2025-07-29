const WebSocket = require('ws');
const fs = require('fs');
const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

// Configurações de áudio (mesmas do ESP32)
const SAMPLE_RATE = 8000;      // 8 kHz
const RECORD_SECONDS = 3;      // duração
const CHUNK_SIZE = 512;        // tamanho de chunk

// Conecta ao servidor de áudio
const ws = new WebSocket('ws://localhost:8080');

console.log('🧪 Testando servidor de áudio...');

ws.on('open', () => {
  console.log('✅ Conectado ao servidor de áudio');
  
  // Grava e envia áudio real
  gravarEEnviarAudio();
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    if (message.type === 'audio_progress') {
      console.log(`📦 Progresso: ${message.progress}% (${message.chunk}/${message.total})`);
    } else if (message.type === 'audio_complete') {
      console.log(`✅ Áudio salvo: ${message.filename} (${message.size} bytes)`);
    } else if (message.type === 'audio_error') {
      console.error(`❌ Erro no servidor de áudio: ${message.error}`);
    }
  } catch (_) {
    // mensagem não-JSON
  }
});

ws.on('close', () => console.log('🔌 Desconectado do servidor de áudio'));
ws.on('error', (err) => console.error('❌ Erro WebSocket:', err.message));

function gravarEEnviarAudio() {
  const tmpDir = os.tmpdir();
  const rawPath = path.join(tmpDir, `audio_test_${Date.now()}.raw`);
  console.log(`🎙️ Gravando áudio (${RECORD_SECONDS}s) ...`);

  // Usa arecord para capturar 8-bit unsigned, 8kHz, mono
  const result = spawnSync('arecord', ['-d', String(RECORD_SECONDS), '-c', '1', '-f', 'U8', '-r', String(SAMPLE_RATE), rawPath], {
    stdio: 'ignore' // silencia saída
  });

  if (result.error || !fs.existsSync(rawPath)) {
    console.warn('⚠️ Não foi possível gravar com "arecord". Gerando áudio sintético (ruído branco) para teste.');
    // Gera buffer sintético de ruído (unsigned 8-bit)
    const totalSamples = SAMPLE_RATE * RECORD_SECONDS;
    const buf = Buffer.alloc(totalSamples);
    for (let i = 0; i < totalSamples; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
    fs.writeFileSync(rawPath, buf);
  }

  // Verificação final
  if (!fs.existsSync(rawPath)) {
    console.error('❌ Não foi possível gerar/gravar arquivo de áudio. Abortando.');
    process.exit(1);
  }

  const audioData = fs.readFileSync(rawPath);
  const totalChunks = Math.ceil(audioData.length / CHUNK_SIZE);
  console.log(`📄 Tamanho capturado: ${audioData.length} bytes → ${totalChunks} chunks`);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, audioData.length);
    const chunkBuf = audioData.slice(start, end);
    const encoded = chunkBuf.toString('base64');
    const pacote = `audio|${i}|${totalChunks}|${encoded}`;
    ws.send(pacote);
  }

  // Sinaliza fim do envio
  ws.send('audio|fim');
  console.log('🚀 Envio concluído!');

  // Remove arquivo temporário
  fs.unlinkSync(rawPath);

  // Fecha conexão após alguns segundos para receber confirmações
  setTimeout(() => ws.close(), 5000);
} 
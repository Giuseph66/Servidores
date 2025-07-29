const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Iniciando servidores ESP32...');

// Função para iniciar um servidor
function startServer(scriptPath, name, port) {
  console.log(`📡 Iniciando ${name} na porta ${port}...`);
  
  const server = spawn('node', [scriptPath], {
    stdio: 'inherit',
    cwd: __dirname
  });
  
  server.on('error', (error) => {
    console.error(`❌ Erro ao iniciar ${name}:`, error);
  });
  
  server.on('close', (code) => {
    console.log(`🛑 ${name} encerrado com código ${code}`);
  });
  
  return server;
}

// Inicia o servidor principal (server.js)
const mainServer = startServer('./server.js', 'Servidor Principal', 3043);

// Inicia o servidor de áudio (servidor_audio.js)
const audioServer = startServer('./servidor_audio.js', 'Servidor de Áudio', 8080);

// Tratamento de sinais para encerrar ambos os servidores
process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando servidores...');
  mainServer.kill('SIGINT');
  audioServer.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Encerrando servidores...');
  mainServer.kill('SIGTERM');
  audioServer.kill('SIGTERM');
  process.exit(0);
});

console.log('\n✅ Servidores iniciados!');
console.log('📋 Endpoints disponíveis:');
console.log('   - Servidor Principal: http://localhost:3043');
console.log('   - WebSocket ESP32: ws://localhost:8043');
console.log('   - WebSocket Clientes: ws://localhost:3043/ws');
console.log('   - Servidor de Áudio: ws://localhost:8080');
console.log('\n🎙️ Para gravar áudio do ESP32, envie o comando "audio"');
console.log('📁 Os arquivos de áudio serão salvos em ./audios/');
console.log('\nPressione Ctrl+C para encerrar os servidores'); 
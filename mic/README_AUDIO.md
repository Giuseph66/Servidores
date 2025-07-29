# 🎙️ Sistema de Áudio ESP32

Este sistema permite gravar e processar áudio do ESP32 através de WebSocket.

## 📋 Componentes

### 1. ESP32 (microfone.ino)
- **Função**: Grava áudio do microfone MAX9814
- **Configuração**: 8kHz, 8-bit, mono, 3 segundos
- **Comando**: Envie `audio` para gravar e enviar áudio
- **Formato**: Envia chunks em base64 via WebSocket

### 2. Servidor Principal (server.js)
- **Porta**: 3043 (HTTP) + 8043 (WebSocket ESP32)
- **Função**: Gerencia conexões dos ESP32 e clientes web
- **Não pode ser alterado** - funciona como está

### 3. Servidor de Áudio (servidor_audio.js)
- **Porta**: 8080 (WebSocket)
- **Função**: Processa e salva áudios dos ESP32
- **Conecta-se** ao servidor principal na porta 8043

## 🚀 Como Usar

### 1. Iniciar os Servidores

```bash
# Opção 1: Iniciar individualmente
node server.js                    # Servidor principal (porta 3043 + 8043)
node servidor_audio.js            # Servidor de áudio (porta 8080)

# Opção 2: Iniciar ambos juntos
node iniciar_servidores.js
```

### 2. Conectar ESP32
- O ESP32 deve estar configurado com o código `microfone.ino`
- Ele se conectará automaticamente ao servidor principal
- Aguarde a mensagem "ESP32 registrado como: [ID]"

### 3. Gravar Áudio
Envie o comando `audio` para o ESP32:

```bash
# Via terminal (server.js)
Digite um comando (<id>:<comando>): ESP32_ID:audio

# Via API HTTP
curl -X POST http://localhost:3043/api/cmd \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "ESP32_ID:audio"
```

### 4. Monitorar Progresso
Conecte-se ao servidor de áudio para acompanhar o progresso:

```javascript
const ws = new WebSocket('ws://localhost:8080');

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  
  if (message.type === 'audio_progress') {
    console.log(`Progresso: ${message.progress}%`);
  } else if (message.type === 'audio_complete') {
    console.log(`Áudio salvo: ${message.filename}`);
  }
});
```

## 📁 Arquivos Gerados

Os áudios são salvos em `./audios/` com os seguintes formatos:

- **`.raw`**: Dados brutos do áudio
- **`.wav`**: Arquivo WAV reproduzível (8kHz, 8-bit, mono)
- **`.json`**: Metadados da gravação

### Exemplo de metadados:
```json
{
  "espId": "esp_1234567890",
  "source": "main_server",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "duration": 1500,
  "chunks": 47,
  "totalChunks": 47,
  "size": 24000,
  "sampleRate": 8000,
  "bitsPerSample": 8,
  "channels": 1,
  "recordSeconds": 3,
  "bufferSize": 24000
}
```

## 🧪 Teste do Sistema

Execute o script de teste para verificar se tudo está funcionando:

```bash
node teste_audio.js
```

Este script:
- Conecta ao servidor de áudio
- Simula dados de áudio do ESP32
- Mostra o progresso em tempo real
- Verifica se os arquivos são salvos corretamente

## 📊 Monitoramento

### Status do Servidor de Áudio
```javascript
// Solicitar status
ws.send(JSON.stringify({ type: 'get_sessions' }));

// Limpar sessões
ws.send(JSON.stringify({ type: 'clear_sessions' }));
```

### Logs em Tempo Real
O servidor de áudio mostra logs detalhados:
- Conexão com servidor principal
- Recebimento de chunks
- Progresso da gravação
- Salvamento de arquivos
- Estatísticas de uso

## 🔧 Configurações

### ESP32 (microfone.ino)
```cpp
#define SAMPLE_RATE 8000          // Taxa de amostragem
#define RECORD_SECONDS 3          // Duração da gravação
#define AUDIO_CHUNK_SIZE 512      // Tamanho dos chunks
```

### Servidor de Áudio (servidor_audio.js)
```javascript
const PORT = 8080;                // Porta do servidor de áudio
const AUDIO_DIR = './audios';     // Diretório para salvar áudios
const MAIN_SERVER_WS = 'ws://localhost:8043'; // Servidor principal
```

## 🚨 Solução de Problemas

### ESP32 não conecta
- Verifique se o servidor principal está rodando na porta 8043
- Confirme as credenciais WiFi no ESP32
- Verifique o display OLED para status

### Áudio não é processado
- Verifique se o servidor de áudio está conectado ao principal
- Confirme se a pasta `./audios/` existe
- Verifique os logs de erro

### Arquivos corrompidos
- Verifique se todos os chunks foram recebidos
- Confirme a integridade da conexão WebSocket
- Verifique o espaço em disco

## 📝 Comandos Úteis

```bash
# Verificar se os servidores estão rodando
netstat -tlnp | grep -E ':(3043|8043|8080)'

# Monitorar logs em tempo real
tail -f /var/log/syslog | grep -E "(audio|ESP32)"

# Verificar arquivos de áudio
ls -la ./audios/
```

## 🎯 Próximos Passos

- [ ] Interface web para visualizar áudios
- [ ] Reprodução de áudio em tempo real
- [ ] Compressão de áudio
- [ ] Múltiplos formatos de saída
- [ ] Análise de áudio (FFT, espectrograma) 
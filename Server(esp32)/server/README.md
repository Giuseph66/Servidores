
# Server (ESP32) - Servidor de Comunicação

Este é um servidor Node.js que atua como um hub de comunicação entre clientes web e dispositivos ESP32, permitindo o envio de comandos e o recebimento de dados. Ele também possui uma integração opcional para processamento de áudio.

## Sumário
- [Funcionalidades](#funcionalidades)
- [Pré-requisitos](#pré-requisitos)
- [Configuração e Instalação](#configuração-e-instalação)
- [Executando o Servidor](#executando-o-servidor)
- [Endpoints HTTP](#endpoints-http)
- [Endpoints WebSocket](#endpoints-websocket)
- [Uso via Linha de Comando (CLI)](#uso-via-linha-de-comando-cli)
- [Integração com Servidor de Áudio](#integração-com-servidor-de-áudio)

## Funcionalidades
- **Comunicação Bidirecional:** Permite que clientes web enviem comandos para ESP32s específicos e recebam respostas.
- **Gerenciamento de Múltiplos ESP32s:** Suporta a conexão e o gerenciamento de múltiplos dispositivos ESP32, cada um identificado por um ID único.
- **Servidor HTTP Estático:** Serve arquivos estáticos (HTML, CSS, JS, imagens) para a interface web.
- **API RESTful:** Oferece endpoints HTTP para envio de comandos e listagem de dispositivos conectados.
- **Interface de Linha de Comando (CLI):** Permite enviar comandos para os ESP32s diretamente do terminal do servidor.
- **Integração Opcional de Áudio:** Possibilidade de integrar um servidor de áudio externo para processamento de dados de áudio enviados pelos ESP32s.

## Pré-requisitos
- Node.js (versão 14 ou superior recomendada)
- npm (Node Package Manager)

## Configuração e Instalação
1. Clone este repositório (ou faça o download dos arquivos):
   ```bash
   git clone <url_do_repositorio>
   cd server
   ```
2. Instale as dependências do Node.js:
   ```bash
   npm install ws
   ```
   *(O módulo `ws` é a única dependência externa explícita. `readline`, `http`, `fs`, `path` são módulos built-in do Node.js.)*

## Executando o Servidor
Para iniciar o servidor, execute o seguinte comando no terminal na raiz do projeto:
```bash
node server.js
```
O servidor será iniciado e você verá as seguintes mensagens no console:
```
Servidor HTTP + WebSocket em http://localhost:3043
 - Path do ESP32: ws://localhost:8043
 - Path clientes: ws://localhost:3043/ws
HTTP + WebSocket ouvindo na porta 3043
```

## Endpoints HTTP
O servidor HTTP está configurado na porta `3043`.

### 1. `POST /api/cmd`
**Descrição:** Envia um comando para um ESP32 específico e espera por uma resposta.

**Corpo da Requisição (Raw Body):**
O corpo da requisição deve ser uma string no formato `id_do_esp32:comando_a_enviar`.

Exemplo:
```
curl -X POST -d "esp01:LED_ON" http://localhost:3043/api/cmd
```

**Respostas Possíveis:**
- **Sucesso:**
  ```json
  {
    "status": "ok",
    "response": "Resposta do ESP32"
  }
  ```
- **Erro (Comando Vazio):**
  ```json
  {
    "error": "Comando vazio"
  }
  ```
- **Erro (Falha ao Enviar - WebSocket fechado/etc.):**
  ```json
  {
    "error": "Falha ao enviar comando"
  }
  ```
- **Erro (Timeout - Sem resposta do ESP32 em 10 segundos):**
  ```json
  {
    "error": "Sem resposta do ESP32 (timeout)"
  }
  ```
- **Erro (ESP32 Não Conectado):**
  ```json
  {
    "error": "ESP32 <id> não está conectado"
  }
  ```

### 2. `GET /api/list`
**Descrição:** Lista todos os IDs dos dispositivos ESP32 atualmente conectados ao servidor.

**Exemplo:**
```
curl http://localhost:3043/api/list
```

**Resposta (JSON Array):**
```json
[
  "esp01",
  "esp02"
]
```

### 3. `GET /` e Outros Caminhos Estáticos
**Descrição:** Serve arquivos estáticos da raiz do projeto. Por padrão, `/` serve `index.html`.

**Exemplos:**
- `http://localhost:3043/` (Serve `index.html`)
- `http://localhost:3043/style.css` (Serve `style.css`)

## Endpoints WebSocket
O servidor utiliza duas instâncias de WebSocket: uma dedicada para ESP32s e outra para clientes web.

### 1. WebSocket para ESP32s
**URL:** `ws://localhost:8043`

**Fluxo de Conexão:**
1.  **Conexão Inicial:** O ESP32 se conecta à porta 8043.
2.  **Identificação:** O ESP32 deve enviar sua primeira mensagem no formato:
    `ssid|password|email|randomId`
    O `randomId` será usado para identificar o ESP32 no servidor.
    Exemplo: `MySSID|MyPass|my@email.com|esp01`
3.  **Confirmação:** O servidor responderá com `Registrado como <randomId>`.
4.  **Comunicação:** Após a identificação, o ESP32 pode enviar qualquer mensagem para o servidor. Essas mensagens serão retransmitidas para todos os clientes web conectados.

**Exemplo de Mensagem do ESP32 (com áudio opcional):**
`audio|dados_binarios_do_audio_base64`
`SENSOR_DATA: 25.5C`

### 2. WebSocket para Clientes Web
**URL:** `ws://localhost:3043/ws` (compartilha a porta HTTP 3043)

**Fluxo de Comunicação:**
1.  **Conexão Inicial:** Um cliente web se conecta a este endpoint.
2.  **Mensagens do Servidor:**
    - O cliente receberá uma lista de ESP32s conectados (se houver).
    - O cliente receberá todas as mensagens enviadas pelos ESP32s, prefixadas com o ID do ESP32 (ex: `[esp01] SENSOR_DATA: 25.5C`).
3.  **Envio de Comandos:** O cliente pode enviar comandos para um ESP32 específico no formato:
    `<id_do_esp32>:<comando_a_enviar>`
    Exemplo: `esp01:LED_OFF`

## Uso via Linha de Comando (CLI)
Quando o servidor está em execução, você pode enviar comandos diretamente do terminal onde o `server.js` foi iniciado. O prompt `Digite um comando (<id>:<comando>):` aparecerá.

**Formato do Comando:**
`id_do_esp32:comando_a_enviar`

**Exemplo:**
```
Digite um comando (<id>:<comando>): esp01:REBOOT
```
Se o ESP32 estiver conectado, o comando será enviado.

## Integração com Servidor de Áudio
O servidor tenta carregar um módulo chamado `servidor_audio.js`. Se este arquivo existir no mesmo diretório, ele será integrado para processar mensagens que começam com `audio|` enviadas pelos ESP32s.

Se você tiver um `servidor_audio.js`, certifique-se de que ele exporta uma função `processAudioFromMainServer(id, message)`. 
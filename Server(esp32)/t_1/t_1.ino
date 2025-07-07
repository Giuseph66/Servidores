#include <WiFi.h>
#include <WebSocketsClient.h>

const char* ssid = "COMPANIA";
const char* password = "jesusateu123";
const char* host = "pag.neurelix.com.br";  // sem "https://"
const int ledPin = 2;  // Pino do LED onboard (geralmente D2)
unsigned long lastPing = 0;
const unsigned long pingInterval = 50000; // 50 segundos

WebSocketsClient webSocket;

// Função para piscar o LED 3 vezes
void piscarLed(int vezes) {
  for (int i = 0; i < vezes; i++) {
    digitalWrite(ledPin, HIGH);
    delay(300);
    digitalWrite(ledPin, LOW);
    delay(300);
  }
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("Desconectado do servidor WebSocket");
      break;
    case WStype_CONNECTED:
      Serial.println("Conectado ao servidor WebSocket");
      webSocket.sendTXT("ESP32 online e esperando comandos.");
      break;
    case WStype_TEXT:
      Serial.printf("Mensagem recebida: %s\n", payload);

      if (strcmp((char*)payload, "piscar") == 0) {
        piscarLed(3);
        webSocket.sendTXT("LED piscou 3 vezes.");
      }
      break;
  }
}
void setup() {
  pinMode(ledPin, OUTPUT);  // Configura o pino do LED como saída

  Serial.begin(115200);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi conectado!");

  // Configurações do WebSocket
  webSocket.setReconnectInterval(5000);
  webSocket.setAuthorization("esp", "neurelix");  // Remova se não usar autenticação
  webSocket.setExtraHeaders("Sec-WebSocket-Extensions:");   // força vazio
  webSocket.onEvent(webSocketEvent);

  // Conecta via SSL (porta 443 com Cloudflare)
  webSocket.beginSSL("fastshii.neurelix.com.br", 443, "/");
}

void loop() {
  webSocket.loop();


  if (millis() - lastPing > pingInterval) {
    webSocket.sendTXT("ping");
    Serial.printf("ping");
    lastPing = millis();
  }
}

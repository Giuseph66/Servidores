#!/bin/bash

# Caminho base do projeto
PROJETO_DIR="$HOME/Progetos/Servidores_apis/Mercado_pago(server)"

# Ir para o diretório do projeto
cd "$PROJETO_DIR" || {
  echo "❌ Diretório não encontrado: $PROJETO_DIR"
  exit 1
}

# Iniciar o servidor Node.js em segundo plano
echo "🚀 Iniciando servidor Node.js..."
nohup node src/server.js > node_server.log 2>&1 &

# Esperar 2 segundos para garantir que o servidor subiu
sleep 2

# Iniciar o túnel Cloudflare em segundo plano
echo "🌐 Iniciando Cloudflare Tunnel..."
nohup cloudflared tunnel run neurelix-tunel > cloudflared.log 2>&1 &

echo "✅ Ambos os serviços foram iniciados em segundo plano."

sleep 5

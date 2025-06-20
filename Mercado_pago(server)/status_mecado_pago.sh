#!/bin/bash

PROJETO_DIR="$HOME/Progetos/Servidores_apis/Mercado_pago(server)"
cd "$PROJETO_DIR" || {
  echo "❌ Diretório não encontrado: $PROJETO_DIR"
  exit 1
}

echo "📊 STATUS DOS SERVIÇOS:"

if [[ -f .pid_node ]] && ps -p "$(cat .pid_node)" > /dev/null; then
  echo "✅ Node.js está rodando (PID: $(cat .pid_node))"
else
  echo "❌ Node.js não está rodando."
fi

if [[ -f .pid_cloudflared ]] && ps -p "$(cat .pid_cloudflared)" > /dev/null; then
  echo "✅ Cloudflared está rodando (PID: $(cat .pid_cloudflared))"
else
  echo "❌ Cloudflared não está rodando."
fi
echo "🔍 Verificando logs..."

sleep 10
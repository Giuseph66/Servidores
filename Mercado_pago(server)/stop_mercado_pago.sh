#!/bin/bash

PROJETO_DIR="$HOME/Progetos/Servidores_apis/Mercado_pago(server)"
cd "$PROJETO_DIR" || {
  echo "❌ Diretório não encontrado: $PROJETO_DIR"
  exit 1
}

if [[ -f .pid_node ]]; then
  kill "$(cat .pid_node)" && echo "🛑 Node.js parado." || echo "⚠️ Erro ao parar Node.js."
  rm -f .pid_node
else
  echo "ℹ️ Node.js não está rodando (PID não encontrado)."
fi

if [[ -f .pid_cloudflared ]]; then
  kill "$(cat .pid_cloudflared)" && echo "🛑 Cloudflared parado." || echo "⚠️ Erro ao parar Cloudflared."
  rm -f .pid_cloudflared
else
  echo "ℹ️ Cloudflared não está rodando (PID não encontrado)."
fi

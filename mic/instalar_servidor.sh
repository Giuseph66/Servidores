#!/bin/bash

# 🎙️ Script de Instalação e Execução do Servidor de Áudio ESP32
# Autor: Giuseph

echo "🎙️ Instalando servidor de áudio para ESP32..."

# Verifica se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Instalando..."
    
    # Detecta o sistema operacional
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install node
        else
            echo "❌ Homebrew não encontrado. Instale o Homebrew primeiro:"
            echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            exit 1
        fi
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        # Windows
        echo "❌ Para Windows, instale o Node.js manualmente:"
        echo "   https://nodejs.org/"
        exit 1
    else
        echo "❌ Sistema operacional não suportado"
        exit 1
    fi
fi

echo "✅ Node.js encontrado: $(node --version)"

# Verifica se o npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ npm não encontrado"
    exit 1
fi

echo "✅ npm encontrado: $(npm --version)"

# Instala dependências
echo "📦 Instalando dependências..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependências instaladas com sucesso!"
else
    echo "❌ Erro ao instalar dependências"
    exit 1
fi

# Cria diretório para áudios se não existir
if [ ! -d "audios" ]; then
    mkdir audios
    echo "📁 Diretório 'audios' criado"
fi

echo ""
echo "🚀 Servidor pronto para execução!"
echo ""
echo "📋 Comandos disponíveis:"
echo "   npm start     - Inicia o servidor"
echo "   npm run dev   - Inicia em modo desenvolvimento (com auto-reload)"
echo ""
echo "🔧 Configurações:"
echo "   Porta: 8080"
echo "   Diretório de áudios: ./audios"
echo ""
echo "📡 Para conectar o ESP32, use:"
echo "   ws://localhost:8080"
echo ""
echo "🎮 Comandos para enviar via WebSocket:"
echo "   audio     - Grava e envia áudio"
echo "   gravar    - Apenas grava"
echo "   reproduzir - Reproduz localmente"
echo ""

# Pergunta se quer iniciar o servidor
read -p "🎙️ Deseja iniciar o servidor agora? (s/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo "🚀 Iniciando servidor..."
    npm start
else
    echo "✅ Instalação concluída! Execute 'npm start' quando quiser iniciar o servidor."
fi 
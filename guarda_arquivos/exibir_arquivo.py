 #!/usr/bin/env python3
"""
Script para exibir arquivos do servidor (imagens/vídeos)
Uso: python3 exibir_arquivo.py <identificador>
"""

import requests
import sys
import os
import cv2
import numpy as np
import tempfile

def exibir_arquivo(identificador):
    """Exibe um arquivo do servidor"""
    url = f"http://localhost:8666/download-por-id/{identificador}"
    
    try:
        print(f"Carregando: {identificador}")
        response = requests.get(url, stream=True)
        
        if response.status_code == 200:
            # Obtém informações do arquivo
            content_disposition = response.headers.get('content-disposition', '')
            content_type = response.headers.get('content-type', '')
            print(f"Tipo: {content_type}")
            print(f"Content-Disposition: {content_disposition}")
            
            # Lê o conteúdo do arquivo
            conteudo = response.content
            
            # Verifica se é uma imagem
            if content_type.startswith('image/'):
                # Converte bytes para array numpy
                nparr = np.frombuffer(conteudo, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if img is not None:
                    print(f"Exibindo imagem: {img.shape}")
                    cv2.imshow('Arquivo do Servidor', img)
                    cv2.waitKey(0)
                    cv2.destroyAllWindows()
                else:
                    print("❌ Erro ao decodificar imagem")
                    
            # Verifica se é um vídeo
            elif content_type.startswith('video/'):
                # Salva temporariamente para o OpenCV ler
                with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as temp_file:
                    temp_file.write(conteudo)
                    temp_path = temp_file.name
                
                # Abre o vídeo
                cap = cv2.VideoCapture(temp_path)
                
                if cap.isOpened():
                    print("Exibindo vídeo (pressione 'q' para sair)")
                    while True:
                        ret, frame = cap.read()
                        if not ret:
                            break
                        
                        cv2.imshow('Vídeo do Servidor', frame)
                        
                        # Pressione 'q' para sair
                        if cv2.waitKey(25) & 0xFF == ord('q'):
                            break
                    
                    cap.release()
                    cv2.destroyAllWindows()
                    
                    # Remove arquivo temporário
                    os.unlink(temp_path)
                else:
                    print("❌ Erro ao abrir vídeo")
                    os.unlink(temp_path)
            else:
                print(f"❌ Tipo de arquivo não suportado: {content_type}")
                print("Tipos suportados: imagens (image/*) e vídeos (video/*)")
                
        else:
            print(f"❌ Erro: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Erro: {e}")

if __name__ == "__main__":
    identificador = 'meuvideo123'
    exibir_arquivo(identificador)
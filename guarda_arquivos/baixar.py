import requests
import os

def baixar_arquivo(identificador, pasta_destino="."):
    """
    Baixa um arquivo pelo identificador
    
    Args:
        identificador: ID do arquivo no servidor
        pasta_destino: Pasta onde salvar o arquivo (padrão: pasta atual)
    """
    url = f"http://localhost:8666/download-por-id/{identificador}"
    
    try:
        print(f"Baixando arquivo com identificador: {identificador}")
        response = requests.get(url, stream=True)
        
        if response.status_code == 200:
            # Obtém o nome do arquivo do header Content-Disposition
            content_disposition = response.headers.get('content-disposition', '')
            print(f"Debug - Content-Disposition: {content_disposition}")
            
            nome_arquivo = None
            if 'filename=' in content_disposition:
                # Extrai o nome do arquivo do header
                filename_part = content_disposition.split('filename=')[1]
                if filename_part.startswith('"') and filename_part.endswith('"'):
                    nome_arquivo = filename_part[1:-1]  # Remove as aspas
                else:
                    nome_arquivo = filename_part
            else:
                # Fallback: usa o identificador como nome
                nome_arquivo = f"{identificador}"
            
            print(f"Debug - Nome do arquivo: {nome_arquivo}")
            
            caminho_completo = os.path.join(pasta_destino, nome_arquivo)
            
            # Salva o arquivo e conta o tamanho
            tamanho_total = 0
            with open(caminho_completo, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:  # Filtra chunks vazios
                        f.write(chunk)
                        tamanho_total += len(chunk)
            
            print(f"✅ Arquivo baixado com sucesso: {caminho_completo}")
            print(f"📁 Tamanho: {tamanho_total} bytes")
            return True
            
        elif response.status_code == 404:
            print(f"❌ Arquivo não encontrado: {identificador}")
            return False
        else:
            print(f"❌ Erro {response.status_code}: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Erro de conexão: Verifique se o servidor está rodando em http://localhost:8666")
        return False
    except Exception as e:
        print(f"❌ Erro inesperado: {e}")
        return False

if __name__ == "__main__":
    # Exemplo de uso
    identificador = "meuvideo12"
    
    # Baixa na pasta atual
    sucesso = baixar_arquivo(identificador)
    
    if sucesso:
        print("🎉 Download concluído!")
    else:
        print("💥 Falha no download")
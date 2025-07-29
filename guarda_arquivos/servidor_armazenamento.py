import os
import sqlite3
import subprocess
import unicodedata
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header
from fastapi.responses import FileResponse
import uvicorn 

# Configuração de autenticação
API_KEY = "jesuseateu"  # Altere para uma chave segura

def verificar_api_key(api_key: str = Header(None)):
    """Verifica se a API key é válida"""
    if api_key != API_KEY:
        raise HTTPException(status_code=401, detail="API key inválida")
    return api_key

def detectar_dispositivo():
    """Detecta automaticamente o dispositivo da partição"""
    try:
        resultado = subprocess.run(
            ["lsblk", "-f"],
            capture_output=True,
            text=True
        )
        
        if resultado.returncode == 0:
            linhas = resultado.stdout.split('\n')
            for linha in linhas:
                if 'sdb' in linha or 'nvme' in linha:
                    partes = linha.split()
                    if len(partes) > 0:
                        return f"/dev/{partes[0]}"
        
        dispositivos_comuns = ["/dev/sdb1", "/dev/sdc1", "/dev/nvme0n1p1"]
        for dispositivo in dispositivos_comuns:
            if os.path.exists(dispositivo):
                return dispositivo
                
    except Exception as e:
        print(f"Erro ao detectar dispositivo: {e}")
    
    return "/dev/sdb1"

def montar_particao():
    """Monta a partição se não estiver montada"""
    try:
        if os.path.ismount(PASTA_RAIZ):
            print(f"Partição já está montada em {PASTA_RAIZ}")
            return True
        
        os.makedirs(PASTA_RAIZ, exist_ok=True)
        
        tipos_fs = ["auto", "ntfs", "vfat", "ext4", "ext3", "ext2"]
        
        for tipo_fs in tipos_fs:
            print(f"Tentando montar com tipo de arquivo: {tipo_fs}")
            resultado = subprocess.run(
                ["sudo", "mount", "-t", tipo_fs, DISPOSITIVO, PASTA_RAIZ],
                capture_output=True,
                text=True
            )
            
            if resultado.returncode == 0:
                print(f"Partição montada com sucesso em {PASTA_RAIZ} usando {tipo_fs}")
                return True
            else:
                print(f"Falha ao montar com {tipo_fs}: {resultado.stderr}")
        
        print("Tentando montar sem especificar tipo de arquivo...")
        resultado = subprocess.run(
            ["sudo", "mount", DISPOSITIVO, PASTA_RAIZ],
            capture_output=True,
            text=True
        )
        
        if resultado.returncode == 0:
            print(f"Partição montada com sucesso em {PASTA_RAIZ}")
            return True
        else:
            print(f"Erro final ao montar partição: {resultado.stderr}")
            return False
            
    except Exception as e:
        print(f"Erro ao montar partição: {e}")
        return False

# Config
PASTA_RAIZ = "/media/jesus/0ADAA659109BBC3E/backup/apps"
DISPOSITIVO = detectar_dispositivo()

# Banco SQLite
DB_PATH = "database.db"

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        # Verifica se a tabela existe
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='arquivos'")
        table_exists = cursor.fetchone() is not None
        
        if table_exists:
            # Verifica se as colunas novas existem
            cursor = conn.execute("PRAGMA table_info(arquivos)")
            columns = [column[1] for column in cursor.fetchall()]
            
            # Adiciona colunas faltantes se necessário
            if 'nome_original' not in columns:
                conn.execute("ALTER TABLE arquivos ADD COLUMN nome_original TEXT")
            if 'tamanho' not in columns:
                conn.execute("ALTER TABLE arquivos ADD COLUMN tamanho INTEGER")
            if 'tipo_mime' not in columns:
                conn.execute("ALTER TABLE arquivos ADD COLUMN tipo_mime TEXT")
        else:
            # Cria a tabela com a estrutura completa
            conn.execute("""
                CREATE TABLE arquivos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    identificador TEXT UNIQUE,
                    nome_original TEXT,
                    nome_arquivo TEXT,
                    categoria TEXT,
                    caminho TEXT,
                    tamanho INTEGER,
                    tipo_mime TEXT,
                    data_envio TEXT
                )
            """)

init_db()

app = FastAPI()

@app.post("/upload")
async def upload_arquivo(
    file: UploadFile = File(...),
    identificador: str = Form(...),
    categoria: str = Form("geral")
):
    # Verifica se o identificador já existe
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute("SELECT identificador FROM arquivos WHERE identificador = ?", (identificador,))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail=f"Identificador '{identificador}' já existe. Use um identificador único.")
    
    # Mantém o nome original do arquivo
    nome_original = file.filename
    nome_arquivo = nome_original  # Usa o nome original
    
    pasta_destino = os.path.join(PASTA_RAIZ, categoria)
    os.makedirs(pasta_destino, exist_ok=True)
    caminho_arquivo = os.path.join(pasta_destino, nome_arquivo)
    
    # Lê o conteúdo do arquivo
    conteudo = await file.read()
    tamanho = len(conteudo)

    # Salva o arquivo
    with open(caminho_arquivo, "wb") as f:
        f.write(conteudo)

    # Salva no banco de dados
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            INSERT INTO arquivos 
            (identificador, nome_original, nome_arquivo, categoria, caminho, tamanho, tipo_mime, data_envio)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (identificador, nome_original, nome_arquivo, categoria, caminho_arquivo, tamanho, file.content_type, datetime.now().isoformat()))

    return {
        "status": "ok", 
        "identificador": identificador,
        "nome_original": nome_original,
        "tamanho": tamanho,
        "categoria": categoria
    }

@app.get("/download-por-id/{identificador}")
def download_por_identificador(identificador: str):
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute("""
            SELECT caminho, nome_original, nome_arquivo, tamanho, tipo_mime 
            FROM arquivos WHERE identificador = ?
        """, (identificador,))
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    caminho, nome_original, nome_arquivo, tamanho, tipo_mime = row
    if not os.path.exists(caminho):
        raise HTTPException(status_code=404, detail="Arquivo não existe no HD.")

    # Garante que o nome original seja usado
    if not nome_original:
        nome_original = nome_arquivo
    
    # Remove caracteres problemáticos do nome do arquivo para evitar erro de codificação
    nome_original_limpo = nome_original
    # Remove acentos e caracteres especiais
    nome_original_limpo = unicodedata.normalize('NFD', nome_original_limpo)
    nome_original_limpo = ''.join(c for c in nome_original_limpo if unicodedata.category(c) != 'Mn')
    # Remove caracteres não ASCII
    nome_original_limpo = ''.join(c for c in nome_original_limpo if ord(c) < 128)
    # Remove caracteres problemáticos
    nome_original_limpo = nome_original_limpo.replace('"', '').replace("'", "").replace('\\', '').replace('/', '_')
    
    # Se o nome ficou vazio, usa o identificador
    if not nome_original_limpo:
        nome_original_limpo = identificador
    
    return FileResponse(
        path=caminho, 
        filename=nome_original_limpo, 
        media_type=tipo_mime
    )

@app.get("/listar-arquivos")
def listar_arquivos(categoria: str = None, api_key: str = Header(None)):
    """Lista todos os arquivos ou filtra por categoria - Requer autenticação"""
    # Verifica autenticação
    verificar_api_key(api_key)
    
    with sqlite3.connect(DB_PATH) as conn:
        if categoria:
            cur = conn.execute("""
                SELECT identificador, nome_original, categoria, tamanho, data_envio 
                FROM arquivos WHERE categoria = ? ORDER BY data_envio DESC
            """, (categoria,))
        else:
            cur = conn.execute("""
                SELECT identificador, nome_original, categoria, tamanho, data_envio 
                FROM arquivos ORDER BY data_envio DESC
            """)
        
        rows = cur.fetchall()
        
    return {
        "arquivos": [
            {
                "identificador": row[0],
                "nome_original": row[1],
                "categoria": row[2],
                "tamanho": row[3],
                "data_envio": row[4]
            }
            for row in rows
        ]
    }

@app.get("/info-arquivo/{identificador}")
def info_arquivo(identificador: str, api_key: str = Header(None)):
    """Retorna informações detalhadas de um arquivo - Requer autenticação"""
    # Verifica autenticação
    verificar_api_key(api_key)
    
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute("""
            SELECT * FROM arquivos WHERE identificador = ?
        """, (identificador,))
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    return {
        "id": row[0],
        "identificador": row[1],
        "nome_original": row[2],
        "nome_arquivo": row[3],
        "categoria": row[4],
        "caminho": row[5],
        "tamanho": row[6],
        "tipo_mime": row[7],
        "data_envio": row[8],
        "existe_no_hd": os.path.exists(row[5])
    }

@app.get("/info-arquivo-publico/{identificador}")
def info_arquivo_publico(identificador: str):
    """Retorna informações básicas de um arquivo - Sem autenticação"""
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute("""
            SELECT identificador, nome_original, nome_arquivo, categoria, tamanho, tipo_mime, data_envio
            FROM arquivos WHERE identificador = ?
        """, (identificador,))
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    return {
        "identificador": row[0],
        "nome_original": row[1],
        "nome_arquivo": row[2],
        "categoria": row[3],
        "tamanho": row[4],
        "tipo_mime": row[5],
        "data_envio": row[6]
    }

@app.get("/verificar-identificador/{identificador}")
def verificar_identificador(identificador: str):
    """Verifica se um identificador já existe"""
    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.execute("SELECT identificador, nome_original, categoria, data_envio FROM arquivos WHERE identificador = ?", (identificador,))
        row = cur.fetchone()
    
    if row:
        return {
            "existe": True,
            "identificador": row[0],
            "nome_original": row[1],
            "categoria": row[2],
            "data_envio": row[3]
        }
    else:
        return {
            "existe": False,
            "identificador": identificador
        }

@app.get("/recriar-banco")
def recriar_banco():
    """Recria o banco de dados com a estrutura atual"""
    try:
        # Remove o arquivo do banco se existir
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)
        
        # Recria o banco
        init_db()
        return {"status": "sucesso", "mensagem": "Banco de dados recriado com sucesso"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao recriar banco: {str(e)}")

@app.get("/status-particao")
def status_particao():
    """Verifica o status da partição e dispositivo"""
    try:
        dispositivo_info = subprocess.run(
            ["lsblk", "-f", DISPOSITIVO],
            capture_output=True,
            text=True
        )
        
        montada = os.path.ismount(PASTA_RAIZ)
        
        return {
            "dispositivo": DISPOSITIVO,
            "pasta_raiz": PASTA_RAIZ,
            "montada": montada,
            "dispositivo_info": dispositivo_info.stdout if dispositivo_info.returncode == 0 else "Erro ao obter info"
        }
    except Exception as e:
        return {"erro": str(e)}

@app.get("/montar-particao")
def montar_particao_endpoint():
    """Endpoint para montar a partição manualmente"""
    if montar_particao():
        return {"status": "sucesso", "mensagem": "Partição montada com sucesso"}
    else:
        raise HTTPException(status_code=500, detail="Falha ao montar partição")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8666) 
const express = require('express');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();

dotenv.config();
app.use(express.json());

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Configuração do banco de dados SQLite
const dbPath = path.join(__dirname, 'emails.db');
const db = new sqlite3.Database(dbPath);

// Criar tabelas para armazenar remetentes e emails enviados
db.serialize(() => {
  // Tabela para remetentes cadastrados
  db.run(`CREATE TABLE IF NOT EXISTS remetentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    data_cadastro DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabela para emails enviados
  db.run(`CREATE TABLE IF NOT EXISTS emails_enviados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remetente TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    assunto TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    data_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'enviado'
  )`);
});

// Rota principal - redireciona para login ou dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Rota para página de login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Rota para dashboard (página principal)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Rota para cadastrar um novo remetente
app.post('/cadastrar-remetente', (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ error: 'Campos obrigatórios: email, senha' });
  }
  const senha_sem_espaco = senha.replace(/\s/g, '');
  // Validar formato do email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Formato de email inválido' });
  }

  db.run(`INSERT INTO remetentes (email, senha) VALUES (?, ?)`, 
    [email, senha_sem_espaco], 
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Email já cadastrado' });
        }
        console.error('Erro ao cadastrar remetente:', err);
        return res.status(500).json({ error: 'Erro ao cadastrar remetente' });
      }
      res.status(201).json({ 
        message: 'Remetente cadastrado com sucesso!',
        id: this.lastID 
      });
    }
  );
});

// Rota para listar todos os remetentes
app.get('/remetentes', (req, res) => {
  db.all(`SELECT id, email, data_cadastro FROM remetentes ORDER BY data_cadastro DESC`, (err, rows) => {
    if (err) {
      console.error('Erro ao buscar remetentes:', err);
      return res.status(500).json({ error: 'Erro ao buscar remetentes' });
    }
    res.json(rows);
  });
});

// Rota para buscar remetente por ID
app.get('/remetentes/:id', (req, res) => {
  const { id } = req.params;
  db.get(`SELECT id, email, data_cadastro FROM remetentes WHERE id = ?`, [id], (err, row) => {
    if (err) {
      console.error('Erro ao buscar remetente:', err);
      return res.status(500).json({ error: 'Erro ao buscar remetente' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Remetente não encontrado' });
    }
    res.json(row);
  });
});

// Rota para deletar remetente por ID
app.delete('/remetentes/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM remetentes WHERE id = ?`, [id], function(err) {
    if (err) {
      console.error('Erro ao deletar remetente:', err);
      return res.status(500).json({ error: 'Erro ao deletar remetente' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Remetente não encontrado' });
    }
    res.json({ message: 'Remetente deletado com sucesso' });
  });
});

app.post('/send-email', async (req, res) => {
  const { remetente, destinatario, subject, message } = req.body;

  if (!remetente || !destinatario || !subject || !message) {
    return res.status(400).json({ 
      error: 'Campos obrigatórios: remetente, destinatario, subject, message' 
    });
  }

  // Buscar a senha do remetente no banco de dados
  db.get(`SELECT senha FROM remetentes WHERE email = ?`, [remetente], async (err, row) => {
    if (err) {
      console.error('Erro ao buscar remetente:', err);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }

    if (!row) {
      return res.status(404).json({ 
        error: 'Remetente não cadastrado. Cadastre-se primeiro em /cadastrar-remetente' 
      });
    }

    // Criar transporter com as credenciais do remetente
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: remetente,
        pass: row.senha,
      },
    });

    const mailOptions = {
      from: remetente,
      to: destinatario,
      subject,
      text: message,
    };

    try {
      await transporter.sendMail(mailOptions);
      
      // Salvar o email enviado no banco de dados
      const stmt = db.prepare(`INSERT INTO emails_enviados (remetente, destinatario, assunto, mensagem) VALUES (?, ?, ?, ?)`);
      stmt.run(remetente, destinatario, subject, message, (err) => {
        if (err) {
          console.error('Erro ao salvar no banco de dados:', err);
        } else {
          console.log('Email salvo no banco de dados com sucesso');
        }
      });
      stmt.finalize();
      
      res.status(200).json({ message: 'E-mail enviado com sucesso!' });
    } catch (error) {
      console.error('Erro ao enviar e-mail:', error);
      res.status(500).json({ error: 'Falha ao enviar o e-mail. Verifique suas credenciais.' });
    }
  });
});

// Rota para listar todos os emails enviados
app.get('/emails', (req, res) => {
  db.all(`SELECT * FROM emails_enviados ORDER BY data_envio DESC`, (err, rows) => {
    if (err) {
      console.error('Erro ao buscar emails:', err);
      return res.status(500).json({ error: 'Erro ao buscar emails' });
    }
    res.json(rows);
  });
});

// Rota para buscar email por ID
app.get('/emails/:id', (req, res) => {
  const { id } = req.params;
  db.get(`SELECT * FROM emails_enviados WHERE id = ?`, [id], (err, row) => {
    if (err) {
      console.error('Erro ao buscar email:', err);
      return res.status(500).json({ error: 'Erro ao buscar email' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Email não encontrado' });
    }
    res.json(row);
  });
});

// Rota para deletar email por ID
app.delete('/emails/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM emails_enviados WHERE id = ?`, [id], function(err) {
    if (err) {
      console.error('Erro ao deletar email:', err);
      return res.status(500).json({ error: 'Erro ao deletar email' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Email não encontrado' });
    }
    res.json({ message: 'Email deletado com sucesso' });
  });
});

const PORT = process.env.PORT || 3500;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Interface web disponível em: http://localhost:${PORT}`);
  console.log(`Página de login: http://localhost:${PORT}/login`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
});

// Fechar conexão com o banco quando o servidor for encerrado
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Erro ao fechar banco de dados:', err);
    } else {
      console.log('Conexão com banco de dados fechada');
    }
    process.exit(0);
  });
});

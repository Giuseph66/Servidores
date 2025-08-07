const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

// Função para cadastrar um remetente
async function cadastrarRemetente() {
  try {
    const response = await axios.post(`${API_BASE_URL}/cadastrar-remetente`, {
      email: 'seu-email@gmail.com',
      senha: 'sua-senha-de-app'
    });
    
    console.log('✅ Remetente cadastrado:', response.data);
  } catch (error) {
    console.error('❌ Erro ao cadastrar remetente:', error.response?.data || error.message);
  }
}

// Função para listar remetentes
async function listarRemetentes() {
  try {
    const response = await axios.get(`${API_BASE_URL}/remetentes`);
    console.log('👤 Remetentes cadastrados:', response.data);
  } catch (error) {
    console.error('❌ Erro ao listar remetentes:', error.response?.data || error.message);
  }
}

// Função para enviar email
async function enviarEmail() {
  try {
    const response = await axios.post(`${API_BASE_URL}/send-email`, {
      remetente: 'seu-email@gmail.com',
      destinatario: 'destinatario@exemplo.com',
      subject: 'Teste de API com SQLite',
      message: 'Este é um teste da API que usa credenciais do banco de dados'
    });
    
    console.log('✅ Email enviado:', response.data);
  } catch (error) {
    console.error('❌ Erro ao enviar email:', error.response?.data || error.message);
  }
}

// Função para listar todos os emails
async function listarEmails() {
  try {
    const response = await axios.get(`${API_BASE_URL}/emails`);
    console.log('📧 Emails enviados:', response.data);
  } catch (error) {
    console.error('❌ Erro ao listar emails:', error.response?.data || error.message);
  }
}

// Função para buscar email por ID
async function buscarEmail(id) {
  try {
    const response = await axios.get(`${API_BASE_URL}/emails/${id}`);
    console.log(`📧 Email ID ${id}:`, response.data);
  } catch (error) {
    console.error('❌ Erro ao buscar email:', error.response?.data || error.message);
  }
}

// Função para deletar email por ID
async function deletarEmail(id) {
  try {
    const response = await axios.delete(`${API_BASE_URL}/emails/${id}`);
    console.log(`🗑️ Email ID ${id} deletado:`, response.data);
  } catch (error) {
    console.error('❌ Erro ao deletar email:', error.response?.data || error.message);
  }
}

// Função para deletar remetente por ID
async function deletarRemetente(id) {
  try {
    const response = await axios.delete(`${API_BASE_URL}/remetentes/${id}`);
    console.log(`🗑️ Remetente ID ${id} deletado:`, response.data);
  } catch (error) {
    console.error('❌ Erro ao deletar remetente:', error.response?.data || error.message);
  }
}

// Executar testes
async function executarTestes() {
  console.log('🚀 Iniciando testes da API...\n');
  
  // Teste 1: Cadastrar remetente
  console.log('1️⃣ Cadastrando remetente...');
  await cadastrarRemetente();
  
  // Aguardar um pouco
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Teste 2: Listar remetentes
  console.log('\n2️⃣ Listando remetentes...');
  await listarRemetentes();
  
  // Teste 3: Enviar email
  console.log('\n3️⃣ Enviando email...');
  await enviarEmail();
  
  // Aguardar um pouco
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Teste 4: Listar emails
  console.log('\n4️⃣ Listando emails...');
  await listarEmails();
  
  // Teste 5: Buscar email específico (ID 1)
  console.log('\n5️⃣ Buscando email ID 1...');
  await buscarEmail(1);
  
  // Teste 6: Deletar email (ID 1)
  console.log('\n6️⃣ Deletando email ID 1...');
  await deletarEmail(1);
  
  // Teste 7: Listar emails novamente
  console.log('\n7️⃣ Listando emails após deleção...');
  await listarEmails();
  
  console.log('\n✅ Testes concluídos!');
}

// Executar se o arquivo for chamado diretamente
if (require.main === module) {
  executarTestes();
}

module.exports = {
  cadastrarRemetente,
  listarRemetentes,
  enviarEmail,
  listarEmails,
  buscarEmail,
  deletarEmail,
  deletarRemetente
}; 
// index.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const { initializeApp, getApps, getApp } = require('firebase/app');
const { getFirestore, collection, addDoc, updateDoc, doc, serverTimestamp, getDoc } = require('firebase/firestore');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const token = 'APP_USR-5874249072568848-052123-21e235f828a3ab2fc1f11090d80f92a2-267745032';
const DOMINIO = 'https://1a2e-177-39-129-8.ngrok-free.app';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAMNNWxoA5Xz4xA0IHm40yKf-ahFjplmFI",
  authDomain: "cafe-da-computacao.firebaseapp.com",
  databaseURL: "https://cafe-da-computacao-default-rtdb.firebaseio.com",
  projectId: "cafe-da-computacao",
  storageBucket: "cafe-da-computacao.firebasestorage.app",
  messagingSenderId: "976711742918",
  appId: "1:976711742918:web:dd601bb912da3c3225eec7",
  measurementId: "G-ZWZKNRE7PL"
};
const firebaseConfig_fastshii = {
  apiKey: "AIzaSyCb17Coub8NwR4eXiMrvrIzyPPOsAVwdUo",
  authDomain: "base-fastshii.firebaseapp.com",
  databaseURL: "https://base-fastshii-default-rtdb.firebaseio.com",
  projectId: "base-fastshii",
  storageBucket: "base-fastshii.firebasestorage.app",
  messagingSenderId: "1023790791454",
  appId: "1:1023790791454:web:041067783fe2c25384a70f",
  measurementId: "G-CDERLJ45B0"
};


// Inicializa FASTSHII se necessário
const firebaseapp_fastshii = getApps().find(app => app.name === 'fastshii') 
  || initializeApp(firebaseConfig_fastshii, 'fastshii');
const db_fastshii = getFirestore(firebaseapp_fastshii);

// Inicializa padrão (DEFAULT)
const firebaseApp = getApps().find(app => app.name === '[DEFAULT]')
  || initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Load environment variables
dotenv.config();

// Debug: Verificar se o token está sendo carregado
console.log('MP_ACCESS_TOKEN:', token ? 'Token presente' : 'Token ausente');

const app = express();

// Middleware
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: ['*'], // Allow all headers
  exposedHeaders: ['*'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('src/public')); // Serve static files from public directory


// Webhook to receive payment notifications
app.post('/webhook', async (req, res) => {
  try {
    const payment = req.body;
    console.log('Webhook received:', payment);

    // Verificar o status do pagamento
    if (payment.type === 'payment') {
      const paymentId = payment.data.id;
      
      try {
        const response = await axios.get(
          `https://api.mercadopago.com/v1/payments/${paymentId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        const paymentInfo = response.data;
        console.log('Payment status:', paymentInfo.status);
        console.log('Payment details:', paymentInfo);

        // Parse external_reference se for uma string
        let externalRef = paymentInfo.external_reference;
        if (typeof externalRef === 'string') {
          try {
            externalRef = JSON.parse(externalRef);
          } catch (e) {
            console.error('Erro ao fazer parse do external_reference:', e);
            return res.sendStatus(400);
          }
        }

        console.log('Referência processada:', externalRef);

        // Aqui você pode implementar a lógica baseada no status do pagamento
        switch (paymentInfo.status) {
          case 'approved':
            console.log('Pagamento aprovado!');
            if(externalRef.app === 'fastshii'){
              if (externalRef.tipo === 'contrato'){
                await altoriza_fastshii_pg_contrato(externalRef.userId, externalRef.contractId, 'approve');
              }else if (externalRef.tipo === 'assinatura'){
                await altoriza_fastshii_pg_assinatura(externalRef, 'approved');
              }else{
                console.log('Pagamento aprovado!');
              }
            }else{
            try {
              if (!externalRef || !externalRef.Id_banco || !externalRef.userId) {
                throw new Error('Dados de referência inválidos');
              }

              const comprovante = null;
              console.log('Receipt image available:', !!comprovante);
              // Gerar o comprovante
              let html = fs.readFileSync('./main.html', 'utf8');
              html = html
                .replace('{{payment_id}}', paymentId)
                .replace('{{status}}', 'APROVADO')
                .replace('{{payment_method}}', paymentInfo.payment_method_id)
                .replace('{{amount}}', paymentInfo.transaction_amount)
                .replace('{{payer}}', externalRef.userName || 'Cliente')
                .replace('{{date}}', new Date(paymentInfo.date_approved).toLocaleString('pt-BR'))

              const browser = await puppeteer.launch({ 
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
              });
              const page = await browser.newPage();

              await page.setViewport({
                width: 800,
                height: 800,
                deviceScaleFactor: 2
              });

              await page.setContent(html, { waitUntil: 'networkidle0' });
              const buffer = await page.screenshot({
                type: 'png',
                fullPage: true,
                omitBackground: true
              });

              await browser.close();

              const base64Image = buffer.toString('base64');

              // Atualizar status do pagamento com o comprovante
              const paymentRef = doc(db, 'payments', externalRef.Id_banco);
              await updateDoc(paymentRef, { 
                status: 'approved',
                receiptImage: `data:image/png;base64,${base64Image}` || null,
                paymentDetails: {
                  transactionId: paymentInfo.transaction_details?.transaction_id || null,
                  paymentMethod: paymentInfo.payment_method_id || null,
                  amount: paymentInfo.transaction_amount || null,
                  date: paymentInfo.date_approved || null
                }
              });

              // Atualizar status da assinatura do usuário
              const userRef = doc(db, 'users', externalRef.userId);
              const oneMonthFromNow = new Date();
              oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
              
              await updateDoc(userRef, { 
                subscriptionStatus: 'active', 
                subscriptionStartDate: new Date(),
                subscriptionEndDate: oneMonthFromNow 
              });

              console.log('Pagamento, comprovante e assinatura atualizados com sucesso!');
            } catch (error) {
              console.error('Erro ao atualizar status:', error);
              return res.status(500).json({ error: error.message });
            }
          }
            break;

          case 'rejected':
            if(externalRef.app === 'fastshii'){
              if (externalRef.tipo === 'contrato'){
                await altoriza_fastshii_pg_contrato(externalRef.userId, externalRef.contractId, 'reject');
              }else if (externalRef.tipo === 'assinatura'){
                await altoriza_fastshii_pg_assinatura(externalRef, 'rejected');
              }else{
                console.log('Pagamento rejeitado!');
              }
            }else{
            console.log('Pagamento rejeitado!');
            try {
              if (!externalRef || !externalRef.Id_banco || !externalRef.userId) {
                throw new Error('Dados de referência inválidos');
              }

              // Atualizar status do pagamento
              const paymentRef = doc(db, 'payments', externalRef.Id_banco);
              await updateDoc(paymentRef, { 
                status: 'rejected',
                paymentDetails: {
                  transactionId: paymentInfo.transaction_details?.transaction_id || null,
                  paymentMethod: paymentInfo.payment_method_id || null,
                  amount: paymentInfo.transaction_amount || null,
                  date: paymentInfo.date_last_updated || null
                }
              });

              // Atualizar status da assinatura do usuário
              const userRef = doc(db, 'users', externalRef.userId);
              await updateDoc(userRef, { subscriptionStatus: 'rejected' });

              console.log('Status de rejeição atualizado com sucesso!');
            } catch (error) {
              console.error('Erro ao atualizar status de rejeição:', error);
              return res.status(500).json({ error: error.message });
            }
          }
            break;

          case 'pending':
            /*
            referencia: 

Payment status: pending
Payment details: {
  accounts_info: null,
  acquirer_reconciliation: [],
  additional_info: {
    ip_address: '177.155.220.220',
    items: [ [Object] ],
    payer: { first_name: 'conta teste dev' },
    tracking_id: 'platform:v1-whitelabel,so:ALL,type:N/A,security:none'
  },
  authorization_code: null,
  binary_mode: false,
  brand_id: null,
  build_version: '3.112.1-hotfix-44',
  call_for_authorize_id: null,
  callback_url: null,
  captured: true,
  card: {},
  charges_details: [
    {
      accounts: [Object],
      amounts: [Object],
      client_id: 0,
      date_created: '2025-08-09T10:49:11.000-04:00',
      id: '121636069574-001',
      last_updated: '2025-08-09T10:49:11.000-04:00',
      metadata: [Object],
      name: 'mercadopago_fee',
      refund_charges: [],
      reserve_id: null,
      type: 'fee'
    }
  ],
  charges_execution_info: {
    internal_execution: {
      date: '2025-08-09T10:49:11.526-04:00',
      execution_id: '01K27MX814VN9WCAAZY57A8CMX'
    }
  },
  collector_id: 267745032,
  corporation_id: null,
  counter_currency: null,
  coupon_amount: 0,
  currency_id: 'BRL',
  date_approved: null,
  date_created: '2025-08-09T10:49:11.000-04:00',
  date_last_updated: '2025-08-09T10:49:11.000-04:00',
  date_of_expiration: '2025-08-10T10:49:11.000-04:00',
  deduction_schema: null,
  description: 'Assinatura Café Computação',
  differential_pricing_id: null,
  external_reference: '{"userId":"6hxHx36FdtLqJ0p6OTTc","userName":"conta teste dev","email":"ctpcompania@gmail.com","valor":1,"createdAt":{"_methodName":"serverTimestamp"},"Id_banco":"yBv1ed4E5VLlIQY004fP"}',
  fee_details: [],
  financing_group: null,
  id: 121636069574,
  installments: 1,
  integrator_id: null,
  issuer_id: '12501',
  live_mode: true,
  marketplace_owner: null,
  merchant_account_id: null,
  merchant_number: null,
  metadata: {},
  money_release_date: null,
  money_release_schema: null,
  money_release_status: 'released',
  notification_url: null,
  operation_type: 'regular_payment',
  order: { id: '33061751274', type: 'mercadopago' },
  payer: {
    email: null,
    entity_type: null,
    first_name: null,
    id: '2455213828',
    identification: { number: null, type: null },
    last_name: null,
    operator_id: null,
    phone: { number: null, extension: null, area_code: null },
    type: null
  },
  payment_method: { id: 'pix', issuer_id: '12501', type: 'bank_transfer' },
  payment_method_id: 'pix',
  payment_type_id: 'bank_transfer',
  platform_id: null,
  point_of_interaction: {
    application_data: { name: 'checkout-off', operating_system: null, version: 'v2' },
    business_info: {
      branch: 'Merchant Services',
      sub_unit: 'checkout_pro',
      unit: 'online_payments'
    },
    transaction_data: {
      bank_info: [Object],
      bank_transfer_id: null,
      e2e_id: null,
      financial_institution: null,
      infringement_notification: [Object],
      merchant_category_code: null,
      qr_code: '00020126330014br.gov.bcb.pix01110404463428952040000530398654041.005802BR5917GIUSEPHGIANGARELI6009Sao Paulo62250521mpqrinter12163606957463042E54',
      qr_code_base64: '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',
      ticket_url: 'https://www.mercadopago.com.br/payments/121636069574/ticket?caller_id=2455213828&hash=37ad902f-f315-451b-aa5e-87745541f435',
      transaction_id: null
    },
    type: 'CHECKOUT'
  },
  pos_id: null,
  processing_mode: 'aggregator',
  refunds: [],
  release_info: null,
  shipping_amount: 0,
  sponsor_id: null,
  statement_descriptor: null,
  status: 'pending',
  status_detail: 'pending_waiting_transfer',
  store_id: null,
  tags: null,
  taxes_amount: 0,
  transaction_amount: 1,
  transaction_amount_refunded: 0,
  transaction_details: {
    acquirer_reference: null,
    bank_transfer_id: null,
    external_resource_url: null,
    financial_institution: '',
    installment_amount: 0,
    net_received_amount: 0,
    overpaid_amount: 0,
    payable_deferral_period: null,
    payment_method_reference_id: null,
    total_paid_amount: 1,
    transaction_id: null
  }
}
Referência processada: {
  userId: '6hxHx36FdtLqJ0p6OTTc',
  userName: 'conta teste dev',
  email: 'ctpcompania@gmail.com',
  valor: 1,
  createdAt: { _methodName: 'serverTimestamp' },
  Id_banco: 'yBv1ed4E5VLlIQY004fP'
}
Pagamento pendente!
            */ 
            if (paymentInfo.description === 'Assinatura Café Computação') {
              console.log('Pagamento pendente! Assinatura Café Computação');
              
              // Verificações de segurança para evitar erros
              if (paymentInfo.point_of_interaction && 
                  paymentInfo.point_of_interaction.transaction_data) {
                
                const transactionData = paymentInfo.point_of_interaction.transaction_data;
                const copia_qr_code = transactionData.qr_code || null;
                const qr_code_base64 = transactionData.qr_code_base64 || null;
                const ticket_url = transactionData.ticket_url || null;
                
                const paymentRef = doc(db, 'payments', externalRef.Id_banco);
                await updateDoc(paymentRef, { 
                  status: 'pending',
                  qr_code: copia_qr_code,
                  qr_code_base64: qr_code_base64,
                  ticket_url: ticket_url,
                  transaction_id: paymentInfo.transaction_details?.transaction_id || null,
                  transaction_amount: paymentInfo.transaction_amount || null,
                  transaction_status: paymentInfo.status || null,
                  transaction_status_detail: paymentInfo.status_detail || null,
                  transaction_date: paymentInfo.date_last_updated || null
                });
                console.log('Pagamento pendente! Assinatura Café Computação atualizado com sucesso!');
              } else {
                console.log('Dados de transação não disponíveis para este pagamento');
                // Atualizar apenas com os dados básicos disponíveis
                const paymentRef = doc(db, 'payments', externalRef.Id_banco);
                await updateDoc(paymentRef, { 
                  status: 'pending',
                  transaction_amount: paymentInfo.transaction_amount || null,
                  transaction_status: paymentInfo.status || null,
                  transaction_status_detail: paymentInfo.status_detail || null,
                  transaction_date: paymentInfo.date_last_updated || null
                });
                console.log('Pagamento pendente atualizado com dados básicos');
              }
            } else {
              console.log('Pagamento pendente! Outro pagamento');
            }
            console.log('Pagamento pendente!');
            break;

          default:
            console.log('Status desconhecido:', paymentInfo.status);
        }

      } catch (error) {
        console.error('Error verifying payment:', error.response?.data || error.message);
        return res.status(500).json({ error: 'Erro ao verificar pagamento' });
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});
app.get('/webhook', (req, res) => {
  res.send('Voce nao deveria estar aqui!');
});
app.get('/verificar_pagamento/:paymentId', async (req, res) => {
  try {
    console.log('Verificando pagamento:', req.params.paymentId);
    console.log('Token usado:', token ? 'Token presente' : 'Token ausente');

    const response = await axios.get(
      `https://api.mercadopago.com/v1/payments/${req.params.paymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Erro ao verificar pagamento:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: 'Erro ao verificar pagamento',
      details: error.response?.data || error.message
    });
  }
});

// Success page
app.get('/success', (req, res) => {
  res.send('Payment successful!');
});

// Failure page
app.get('/failure', (req, res) => {
  res.send('Payment failed!');
});

// Pending page
app.get('/pending', (req, res) => {
  res.send('Payment pending!');
});

app.get('/', (req, res) => {
  console.log('Acessando a página inicial');
  res.status(200).sendFile(path.join(__dirname, 'public', 'perigo.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Catch-all route for unauthorized access
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'perigo.html'));
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

/**
 * Aprova ou rejeita manualmente um pagamento/contrato premium.
 * Espera receber no body: { userId: string, bancoId: string, action: 'approve' | 'reject' }
 */
const altoriza_fastshii_pg_contrato = async (userId, bancoId, action) => {
  try {
    console.log('userId', userId);
    console.log('bancoId', bancoId);
    console.log('action', action);
    if (!userId || !bancoId || !action) {
      console.log('userId, bancoId e action são obrigatórios');
      return;
    }

    if (!['approve', 'reject'].includes(action)) {
      console.error("action deve ser 'approve' ou 'reject'");
      return;
    }

    // Verifica se existe o pagamento
    const paymentRef = doc(db_fastshii, 'advertising_contracts', bancoId);
    const paymentSnap = await getDoc(paymentRef);
    if (!paymentSnap.exists()) {
      console.error('Pagamento não encontrado');
      return;
    }

    // Verifica se o usuário existe
    const userRef = doc(db_fastshii, 'usuarios', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      console.error('Usuário não encontrado');
      return;
    }

    if (action === 'approve') {
      // Atualiza pagamento
      await updateDoc(paymentRef, {
        status: 'approved',
        updatedAt: serverTimestamp(),
      });
      // Adiciona o post no banco de dados
      const approvedContract = paymentSnap.data();
      let compressedImages = [];
          if (approvedContract.images && approvedContract.images.length) {
            for (const img of approvedContract.images) {
              const cImg = await compressBase64Image(img);
              compressedImages.push(cImg);
            }
          }

          const adPostData = {
            userId: approvedContract.userId,
            username: approvedContract.advertiserName,
            content: approvedContract.adDescription,
            text: approvedContract.adDescription,
            timestamp: Date.now(),
            likes: {},
            comments: {},
            images: compressedImages,
            imageBase64: compressedImages.length ? compressedImages[0] : null,
            ad: true,
            adLinks: approvedContract.links || [],
            adContractId: bancoId,
            adStartDate: approvedContract.startDate,
            adEndDate: approvedContract.endDate,
            visualizacoes_max_diarias: approvedContract.reachPerDay,
            dailyLimit: 5,
            viewsTotal: 0,
            viewsByDate: {},
          };
          await addDoc(collection(db_fastshii, 'posts'), adPostData);

      console.log('Pagamento aprovado e assinatura ativada.');
      return;
    }

    if (action === 'reject') {
      // Atualiza pagamento
      await updateDoc(paymentRef, {
        status: 'rejected',
        updatedAt: serverTimestamp(),
      });

      // Marca assinatura como rejeitada
      await updateDoc(userRef, {
        subscriptionStatus: 'rejected',
      });

      console.log('Pagamento rejeitado.');
      return;
    }

  } catch (error) {
    console.error('Erro em altoriza_fastshii_pg_contrato:', error);
    console.error('Erro interno do servidor');
    return;
  }
};

/**
 * Comprime uma imagem base64 (JPEG/PNG) até ficar abaixo de 900k caracteres (~675kb).
 * Reduz qualidade e largura progressivamente.
 * @param {string} base64 - Imagem em base64 (com ou sem prefixo data:image).
 * @returns {Promise<string>} - Imagem comprimida em base64.
 */
const compressBase64Image = async (base64) => {
  try {
    // Detecta o tipo da imagem (jpeg/png)
    let matches = base64.match(/^data:(image\/jpeg|image\/png);base64,/);
    let imageType = matches ? matches[1].split('/')[1] : 'jpeg';
    let base64Data = base64.replace(/^data:image\/\w+;base64,/, '');

    let buffer = Buffer.from(base64Data, 'base64');
    let quality = 80;
    let width = 900;
    let outputBuffer = buffer;

    // Loop para comprimir até atingir o limite ou qualidade mínima
    while (outputBuffer.length > 675000 && quality >= 30) {
      outputBuffer = await sharp(buffer)
        .resize({ width })
        .toFormat(imageType, { quality })
        .toBuffer();

      quality -= 10;
      width = Math.floor(width * 0.9);
    }

    // Retorna apenas o base64 (sem prefixo) para manter compatível com o app
    return outputBuffer.toString('base64');
  } catch (e) {
    console.error('Erro ao comprimir imagem:', e);
    return base64; // fallback: retorna original
  }
}; 
const altoriza_fastshii_pg_assinatura = async (externalRef, action) => {
  try {
    const { userId, conta } = externalRef || {};

    if (!userId || !conta || !['approved', 'rejected'].includes(action)) {
      console.error('Parâmetros inválidos em altoriza_fastshii_pg_assinatura');
      return;
    }

    console.log('externalRef', externalRef);
    console.log('action', action);

    const userRef = doc(db_fastshii, 'usuarios', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      console.error('Usuário não encontrado');
      return;
    }

    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (action === 'approved') {
      const data = userSnap.data();

      let novaConta = conta;

      if (data.inicio && data.fim) {
        const inicio = data.inicio.toDate ? data.inicio.toDate() : new Date(data.inicio);
        const fim = data.fim.toDate ? data.fim.toDate() : new Date(data.fim);

        // Ainda possui um período ativo
        if (inicio < now && fim > now) {
          novaConta = data.conta === conta ? conta : `${data.conta}${conta}`;
        }
      }

      await updateDoc(userRef, {
        conta: novaConta,
        inicio: now,
        fim: thirtyDaysLater,
        status: 'active',
        updatedAt: serverTimestamp(),
      });
    } else if (action === 'rejected') {
      await updateDoc(userRef, {
        status: 'rejected',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error('Erro em altoriza_fastshii_pg_assinatura:', error);
  }
};
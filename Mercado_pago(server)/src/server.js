// index.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, updateDoc, doc, serverTimestamp } = require('firebase/firestore');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const token = 'APP_USR-5874249072568848-052123-21e235f828a3ab2fc1f11090d80f92a2-267745032';
const DOMINIO = 'https://8299-168-228-93-241.ngrok-free.app';

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

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Load environment variables
dotenv.config();

// Debug: Verificar se o token está sendo carregado
console.log('MP_ACCESS_TOKEN:', token ? 'Token presente' : 'Token ausente');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Endpoint para gerar comprovante
app.post('/gerar-comprovante', async (req, res) => {
  try {
    const { payment_id, status, amount, payer, date } = req.body;

    let html = fs.readFileSync('./template.html', 'utf8');
    html = html.replace('{{payment_id}}', payment_id)
               .replace('{{status}}', status)
               .replace('{{amount}}', amount)
               .replace('{{payer}}', payer)
               .replace('{{date}}', date);

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const buffer = await page.screenshot({ type: 'png' });

    await browser.close();

    const base64Image = buffer.toString('base64');

    res.json({
      base64: base64Image,
      mime: 'image/png',
      filename: `comprovante_${payment_id}.png`
    });
  } catch (error) {
    console.error('Erro ao gerar comprovante:', error);
    res.status(500).json({ error: 'Erro ao gerar comprovante' });
  }
});

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
            try {
              if (!externalRef || !externalRef.Id_banco || !externalRef.userId) {
                throw new Error('Dados de referência inválidos');
              }

              const qr_code_base64 = paymentInfo.point_of_interaction?.transaction_data?.qr_code_base64 || null;
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
                .replace('{{qr_code}}', qr_code_base64);

              const browser = await puppeteer.launch({ 
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
              });
              const page = await browser.newPage();

              await page.setViewport({
                width: 800,
                height: 1000,
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
                receiptImage: `data:image/png;base64,${base64Image}`,
                paymentDetails: {
                  transactionId: paymentInfo.transaction_details?.transaction_id,
                  paymentMethod: paymentInfo.payment_method_id,
                  amount: paymentInfo.transaction_amount,
                  date: paymentInfo.date_approved
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
            break;

          case 'rejected':
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
                  transactionId: paymentInfo.transaction_details?.transaction_id,
                  paymentMethod: paymentInfo.payment_method_id,
                  amount: paymentInfo.transaction_amount,
                  date: paymentInfo.date_last_updated
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
            break;

          case 'pending':
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

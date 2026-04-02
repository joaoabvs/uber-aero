#!/usr/bin/env node

/**
 * 🚗 FluxoUber - Processador de Voos
 * Processa dados, gera mensagem via template e envia ao Telegram
 *
 * Funções exportadas (usadas pelo orquestrador.js):
 *   processFlightData(flights, destino, dataVoo, ano)
 *   generateMessage(processedData, dataVoo, templateFile)
 *   sendToTelegram(message)
 */

const TelegramBot = require('node-telegram-bot-api');
const fs   = require('fs');
const path = require('path');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📝 GERAR MENSAGEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Gera mensagem formatada a partir de um template
 * @param {object} processedData  - resultado de processFlightData
 * @param {string} dataVoo        - data no formato YYYY-MM-DD
 * @param {string} templateFile   - nome do arquivo de template (padrão: template_mensagem.txt)
 */
function generateMessage(processedData, dataVoo, templateFile = 'template_mensagem.txt') {
  const { passageirosPorhora, totalVoos, totalPassageiros } = processedData;

  // Encontrar hora de pico
  let melhorHora = '00:00';
  let passageirosPico = 0;
  Object.entries(passageirosPorhora).forEach(([hora, pass]) => {
    if (pass > passageirosPico) {
      passageirosPico = pass;
      melhorHora = hora;
    }
  });

  // Formatar data
  const [ano, mes, dia] = dataVoo.split('-');
  const dataFormatada = `${dia}/${mes}/${ano}`;

  // Gerar linhas de horário com movimento
  let horariosComMovimento = '';
  Object.entries(passageirosPorhora).forEach(([hora, passageiros]) => {
    if (passageiros === 0) return;

    const destaque = hora === melhorHora ? ' 🔥' : '';
    horariosComMovimento += `✈️ ${hora} | ${String(passageiros).padStart(4, ' ')} 👥${destaque}\n`;
  });

  // Ler e preencher template
  const templatePath = path.join(__dirname, templateFile);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template não encontrado: ${templateFile}`);
  }

  let mensagem = fs.readFileSync(templatePath, 'utf-8');

  mensagem = mensagem.replaceAll('{DATA}',                  dataFormatada);
  mensagem = mensagem.replaceAll('{TOTAL_VOOS}',            String(totalVoos));
  mensagem = mensagem.replaceAll('{TOTAL_PASSAGEIROS}',     totalPassageiros.toLocaleString('pt-BR'));
  mensagem = mensagem.replaceAll('{HORARIOS_COM_MOVIMENTO}', horariosComMovimento.trim());
  mensagem = mensagem.replaceAll('{MELHOR_HORA}',           melhorHora);
  mensagem = mensagem.replaceAll('{PASSAGEIROS_PICO}',      String(passageirosPico));

  return mensagem.trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📤 ENVIAR PARA TELEGRAM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Envia mensagem para o canal/grupo do Telegram
 * @param {string} message - mensagem a ser enviada
 */
async function sendToTelegram(message) {
  const token     = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  if (!token || !channelId) {
    throw new Error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHANNEL_ID não configurados no .env');
  }

  const bot = new TelegramBot(token, { polling: false });
  await bot.sendMessage(channelId, message);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📤 EXPORTAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = { generateMessage, sendToTelegram };

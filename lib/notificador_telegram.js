#!/usr/bin/env node

/**
 * 🚗 FluxoUber - Processador de Voos
 * Processa dados, gera mensagem via template e envia ao Telegram
 *
 * Funções exportadas (usadas pelo orquestrador.js):
 *   processFlightData(voos, destino, dataVoo, ano)
 *   gerarMensagem(dadosProcessados, dataVoo, arquivoTemplate)
 *   enviarParaTelegram(mensagem)
 */

const TelegramBot = require('node-telegram-bot-api');
const fs   = require('fs');
const path = require('path');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📝 GERAR MENSAGEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Gera mensagem formatada a partir de um template
 * @param {object} dadosProcessados  - resultado de processarVoos
 * @param {string} dataVoo           - data no formato YYYY-MM-DD
 * @param {string} arquivoTemplate   - nome do arquivo de template (padrão: template_mensagem.txt)
 */
function gerarMensagem(dadosProcessados, dataVoo, arquivoTemplate = 'template_mensagem.txt') {
  const { passageirosPorhora, totalVoos, totalPassageiros } = dadosProcessados;

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
  const caminhoTemplate = path.join(__dirname, arquivoTemplate);
  if (!fs.existsSync(caminhoTemplate)) {
    throw new Error(`Template não encontrado: ${arquivoTemplate}`);
  }

  let mensagem = fs.readFileSync(caminhoTemplate, 'utf-8');

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
 * @param {string} mensagem - mensagem a ser enviada
 */
async function enviarParaTelegram(mensagem) {
  const token     = process.env.TELEGRAM_BOT_TOKEN;
  const canalId   = process.env.TELEGRAM_CHANNEL_ID;

  if (!token || !canalId) {
    throw new Error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHANNEL_ID não configurados no .env');
  }

  const bot = new TelegramBot(token, { polling: false });
  await bot.sendMessage(canalId, mensagem);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📤 EXPORTAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = { gerarMensagem, enviarParaTelegram };

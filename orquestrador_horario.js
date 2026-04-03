#!/usr/bin/env node

/**
 * 🚗 FluxoUber - Orquestrador por Hora
 * Busca voos em tempo real e envia fluxo da hora atual e da próxima hora.
 *
 * Uso:
 *   node orquestrador_horario.js
 */

const fs   = require('fs');
const path = require('path');
const { buscarVoosRelativo }      = require('./lib/busca_voos');
const { processarVoosPorJanela }  = require('./lib/processador_voo');
const { enviarParaTelegram }      = require('./lib/notificador_telegram');
const logger                   = require('./lib/logger');

const ICAO          = 'SBBR';
const TEMPLATE_PATH = path.join(__dirname, 'config/templates_mensagens/template_horario.txt');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🕐 HELPERS DE HORA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function horaChave(h) {
  return `${String(h % 24).padStart(2, '0')}:00`;
}

function obterDataFormatada() {
  const hoje = new Date();
  const dia  = String(hoje.getDate()).padStart(2, '0');
  const mes  = String(hoje.getMonth() + 1).padStart(2, '0');
  const ano  = hoje.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function obterDataISO() {
  const hoje = new Date();
  const ano  = hoje.getFullYear();
  const mes  = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia  = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📝 GERAR MENSAGEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function gerarMensagem({ horaAtual, horaProxima, fluxoAtual, fluxoProxima }) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template não encontrado: ${TEMPLATE_PATH}`);
  }

  let mensagem = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  mensagem = mensagem.replaceAll('{DATA}',               obterDataFormatada());
  mensagem = mensagem.replaceAll('{HORA_ATUAL}',         horaAtual);
  mensagem = mensagem.replaceAll('{VOOS_ATUAL}',         String(fluxoAtual.voos));
  mensagem = mensagem.replaceAll('{PASSAGEIROS_ATUAL}',  fluxoAtual.passageiros.toLocaleString('pt-BR'));
  mensagem = mensagem.replaceAll('{HORA_PROXIMA}',       horaProxima);
  mensagem = mensagem.replaceAll('{VOOS_PROXIMA}',       String(fluxoProxima.voos));
  mensagem = mensagem.replaceAll('{PASSAGEIROS_PROXIMA}', fluxoProxima.passageiros.toLocaleString('pt-BR'));

  return mensagem.trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 PIPELINE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function executarPipeline() {
  const inicioMs  = Date.now();
  const dataISO   = obterDataISO();
  const fmt       = ms => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const labelAtual   = `${fmt(inicioMs)} – ${fmt(inicioMs + 3600000)}`;
  const labelProxima = `${fmt(inicioMs + 3600000)} – ${fmt(inicioMs + 7200000)}`;

  logger.info('═'.repeat(60));
  logger.info('🚗 FluxoUber - Orquestrador por Hora');
  logger.info('═'.repeat(60));
  logger.info(`🕐 Janela atual: ${labelAtual} | Próxima: ${labelProxima}`);

  try {
    // 1️⃣ BUSCAR: janela de 2h a partir de agora
    logger.info('Buscando voos em tempo real...');
    const dadosVoos = await buscarVoosRelativo(ICAO, {
      direction      : 'Arrival',
      durationMinutes: 120,
      offsetMinutes  : 0,
      withCodeshared : true,
      withCargo      : false,
      withPrivate    : false
    });

    if (!dadosVoos?.arrivals?.length) {
      throw new Error('Nenhum voo encontrado na janela atual');
    }

    logger.info(`${dadosVoos.arrivals.length} voos encontrados`);

    // 2️⃣ PROCESSAR por janela relativa ao momento de execução
    const { atual: fluxoAtual, proxima: fluxoProxima } =
    processarVoosPorJanela(dadosVoos.arrivals, ICAO, dataISO, new Date().getFullYear() - 1, inicioMs);

    logger.info(`Janela atual   ${labelAtual}: ${fluxoAtual.voos} voos, ~${fluxoAtual.passageiros} passageiros`);
    logger.info(`Próxima janela ${labelProxima}: ${fluxoProxima.voos} voos, ~${fluxoProxima.passageiros} passageiros`);

    // 3️⃣ GERAR E ENVIAR
    const mensagem = gerarMensagem({ horaAtual: labelAtual, horaProxima: labelProxima, fluxoAtual, fluxoProxima });
    await enviarParaTelegram(mensagem);

    logger.info('✅ Mensagem enviada com sucesso!');
    logger.info('═'.repeat(60));

    process.exit(0);

  } catch (erro) {
    logger.error('═'.repeat(60));
    logger.error(`❌ ERRO: ${erro.message}`);
    logger.error('═'.repeat(60));
    process.exit(1);
  }
}

executarPipeline();

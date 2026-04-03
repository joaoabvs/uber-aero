#!/usr/bin/env node

/**
 * 🚗 FluxoUber - Orquestrador Diário
 * Executa: 1) Busca de voos 2) Salva em arquivo JSON 3) Envio de alerta Telegram
 *
 * Uso:
 *   node orquestrador.js                 (usa data de hoje)
 *   node orquestrador.js 2026-03-30      (usa data especificada)
 */

const fs = require('fs');
const path = require('path');
const { buscarVoosPorDia } = require('./lib/busca_voos');
const { gerarMensagem, enviarParaTelegram } = require('./lib/notificador_telegram');
const { processarVoos } = require('./lib/processador_voo');
const logger = require('./lib/logger');

const template = '../config/templates_mensagens/template_diario.txt';
const icao = 'SBBR';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📅 DETERMINAR DATA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function obterDataAmanha() {
  const hoje = new Date();
  hoje.setDate(hoje.getDate() + 1); // soma 1 dia
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

let data = process.argv[2] || obterDataAmanha();

// Validar formato da data
if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
  logger.error('❌ ERRO: Formato de data inválido. Use: YYYY-MM-DD');
  logger.error('');
  logger.error('Exemplos:');
  logger.error('  node orquestrador.js                           (data de hoje, template padrão)');
  logger.error('  node orquestrador.js 2026-03-30                (data específica, template padrão)');
  logger.error('  node orquestrador.js 2026-03-30 template_resumido.txt (data específica, template customizado)');
  process.exit(1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 EXECUTAR PIPELINE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function executarPipeline() {
  logger.info('');
  logger.info('═'.repeat(80));
  logger.info('🚗 FluxoUber - Pipeline Diário');
  logger.info('═'.repeat(80));
  logger.info('');
  logger.info(`📅 Data: ${data}`);
  logger.info('');

  const opcoes = {
    direction      : 'Arrival',
    withCodeshared : true,
    withCargo      : false,
    withPrivate    : false
  };

  try {
    // 1️⃣ BUSCAR DADOS DE VOOS
    logger.info('─'.repeat(80));
    logger.info('1️⃣  ETAPA 1: Buscando dados de voos...');
    logger.info('─'.repeat(80));
    logger.info('');

    const dadosVoos = await buscarVoosPorDia(icao, data, opcoes);

    if (!dadosVoos) {
      logger.error('❌ Falha ao buscar dados dos voos');
      process.exit(1);
    }

    const listaVoos = dadosVoos.arrivals || [];

    if (!listaVoos || listaVoos.length === 0) {
      logger.error('❌ Nenhum voo encontrado para essa data');
      process.exit(1);
    }

    logger.info(`✅ ${listaVoos.length} voos encontrados!`);
    logger.info('');

    // 3️⃣ PROCESSAR E ENVIAR PARA TELEGRAM
    logger.info('─'.repeat(80));
    logger.info('3️⃣  ETAPA 3: Processando e enviando para Telegram...');
    logger.info('─'.repeat(80));
    logger.info('');

    logger.info('⚙️ Processando dados...');
    const dadosProcessados = processarVoos(listaVoos, icao, data, new Date().getFullYear() - 1);
    logger.info(`✅ Total: ${dadosProcessados.totalVoos} voos, ~${dadosProcessados.totalPassageiros.toLocaleString('pt-BR')} passageiros estimados`);
    logger.info('');

    logger.info(`📝 Gerando mensagem (template: ${template})...`);
    const mensagem = gerarMensagem(dadosProcessados, data, template);
    logger.info('✅ Mensagem gerada!');
    logger.info('');

    logger.info('📤 Enviando para Telegram...');
    await enviarParaTelegram(mensagem);
    logger.info('✅ Mensagem enviada com sucesso!');
    logger.info('');

    // 2️⃣ SALVAR EM ARQUIVO JSON
    logger.info('─'.repeat(80));
    logger.info('2️⃣  ETAPA 2: Salvando dados em arquivo JSON...');
    logger.info('─'.repeat(80));
    logger.info('');

    const nomeArquivo = `voos_${icao}_${data}.json`;
    fs.writeFileSync(nomeArquivo, JSON.stringify(dadosVoos, null, 2), 'utf-8');
    logger.info(`✅ Dados salvos em: ${nomeArquivo}`);
    logger.info('');

    logger.info('═'.repeat(80));
    logger.info('✅ PIPELINE CONCLUÍDO COM SUCESSO!');
    logger.info('═'.repeat(80));
    logger.info('');
    logger.info(`📊 Resumo:`);
    logger.info(`  📅 Data: ${data}`);
    logger.info(`  ✈️  ${listaVoos.length} voos processados`);
    logger.info(`  💾 Arquivo: ${nomeArquivo}`);
    logger.info(`  📤 Alerta enviado para Telegram`);
    logger.info('');

    process.exit(0);

  } catch (erro) {
    logger.error('');
    logger.error('═'.repeat(80));
    logger.error('❌ ERRO NA PIPELINE');
    logger.error('═'.repeat(80));
    logger.error(erro.message);
    logger.error('═'.repeat(80));
    logger.error('');
    process.exit(1);
  }
}

// Executar pipeline
executarPipeline();

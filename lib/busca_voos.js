#!/usr/bin/env node

/**
 * Módulo para buscar voos na API AeroDataBox
 *
 * Métodos disponíveis:
 *   buscarVoosRelativo(icao, opcoes)                      - voos ao redor do momento atual
 *   buscarVoosPorIntervalo(icao, inicio, fim, opcoes)     - voos em janela de até 12h (método A)
 *   buscarVoosPorDia(icao, data, opcoes)                  - voos do dia completo (usa método A 2x)
 *
 * Uso isolado:
 *   node busca_voos.js SBBR 2026-04-01
 */

const https  = require('https');
const http   = require('http');
const path   = require('path');
const fs     = require('fs');
const url    = require('url');
const logger = require('./logger');

// Carregar .env manualmente (sem dependência de dotenv)
function carregarEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(linha => {
    if (linha && !linha.startsWith('#')) {
      const [chave, ...resto] = linha.split('=');
      if (chave && resto.length) process.env[chave.trim()] = resto.join('=').trim();
    }
  });
}
carregarEnv();

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 UTILITÁRIOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function fazerRequisicao(urlString, parametros = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new url.URL(urlString);
    Object.keys(parametros).forEach(chave => {
      urlObj.searchParams.append(chave, parametros[chave]);
    });

    const opcoes = {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    };

    const protocolo = urlObj.protocol === 'https:' ? https : http;

    const req = protocolo.request(urlObj, opcoes, (res) => {
      let corpo = '';
      res.on('data', pedaco => { corpo += pedaco; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(corpo));
        } catch (erro) {
          reject(new Error(`Erro ao fazer parse do JSON: ${erro.message}\nResposta: ${corpo.substring(0, 200)}`));
        }
      });
    });

    req.on('error', erro => reject(new Error(`Erro na requisição: ${erro.message}`)));
    req.end();
  });
}

function validarData(dataString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dataString)) return false;
  const dataObj = new Date(dataString);
  return dataObj instanceof Date && !isNaN(dataObj);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✈️  GetAirportFlightsRelative
//     Voos ao redor do momento atual (janela relativa)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Busca voos ao redor do momento atual usando janela relativa.
 *
 * @param {string} icao          - Código ICAO do aeroporto (ex: SBBR)
 * @param {object} opcoes
 * @param {string} opcoes.direction       - 'Arrival' | 'Departure' | 'Both' (padrão: 'Arrival')
 * @param {number} opcoes.durationMinutes - Duração da janela em minutos (padrão: 720)
 * @param {number} opcoes.offsetMinutes   - Offset em minutos relativo ao agora (padrão: -120)
 * @param {boolean} opcoes.withCodeshared - Incluir codeshare (padrão: true)
 * @param {boolean} opcoes.withCargo      - Incluir cargo (padrão: false)
 * @param {boolean} opcoes.withPrivate    - Incluir privados (padrão: false)
 */
async function buscarVoosRelativo(icao, opcoes = {}) {
  const { direction, durationMinutes, offsetMinutes} = opcoes;

  const agora  = new Date();
  const inicio = new Date(agora.getTime() + offsetMinutes * 60000);
  const fim    = new Date(inicio.getTime() + durationMinutes * 60000);
  const fmt    = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const apiUrl = `https://${RAPIDAPI_HOST}/flights/airports/icao/${icao}`;

  logger.info(`🔄 [Relativo] Buscando voos em ${icao} (${direction}) — ${fmt(inicio)} até ${fmt(fim)}...`);

  try {
    return await fazerRequisicao(apiUrl, opcoes);
  } catch (erro) {
    logger.error(`❌ ${erro.message}`);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✈️  GetAirportFlights
//     Voos em janela de data/hora específica (máx. 12h)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Busca voos em uma janela de data/hora específica (máximo 12 horas).
 *
 * @param {string} icao      - Código ICAO do aeroporto (ex: SBBR)
 * @param {string} deLocal   - Início da janela (formato: YYYY-MM-DDTHH:mm)
 * @param {string} ateLocal  - Fim da janela (formato: YYYY-MM-DDTHH:mm, máx. 12h após de)
 * @param {object} opcoes
 * @param {string}  opcoes.direction      - 'Arrival' | 'Departure' | 'Both' (padrão: 'Arrival')
 * @param {boolean} opcoes.withCodeshared - Incluir codeshare (padrão: true)
 * @param {boolean} opcoes.withCargo      - Incluir cargo (padrão: false)
 * @param {boolean} opcoes.withPrivate    - Incluir privados (padrão: false)
 */
async function buscarVoosPorIntervalo(icao, deLocal, ateLocal, opcoes = {}) {
  const { direction} = opcoes;

  const apiUrl = `https://${RAPIDAPI_HOST}/flights/airports/icao/${icao}/${deLocal}/${ateLocal}`;

  logger.info(`🔄 [Intervalo] Buscando voos em ${icao} (${direction}) de ${deLocal} até ${ateLocal}...`);

  try {
    return await fazerRequisicao(apiUrl, opcoes);
  } catch (erro) {
    logger.error(`❌ ${erro.message}`);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✈️  Voos do dia completo
//     Chama buscarVoosPorIntervalo duas vezes (00:00→12:00 e 12:00→23:59)
//     e combina os resultados
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Busca todos os voos de um dia completo.
 * Divide o dia em duas janelas (00:00-12:00 e 12:00-23:59) e combina os resultados.
 *
 * @param {string} icao    - Código ICAO do aeroporto (ex: SBBR)
 * @param {string} data    - Data no formato YYYY-MM-DD
 * @param {object} opcoes  - Mesmas opções do buscarVoosPorIntervalo
 */
async function buscarVoosPorDia(icao, data, opcoes = {}) {
  logger.info(`🔄 [Dia] Buscando voos do dia ${data} em ${icao}...`);

  const primeiraMetade = await buscarVoosPorIntervalo(icao, `${data}T00:00`, `${data}T12:00`, opcoes);
  await new Promise(resolve => setTimeout(resolve, 1500));
  const segundaMetade = await buscarVoosPorIntervalo(icao, `${data}T12:00`, `${data}T23:59`, opcoes);

  // Combinar resultados (a API retorna { arrivals: [...] } ou { departures: [...] })
  const chave = opcoes.direction === 'Departure' ? 'departures' : 'arrivals';

  const voos1 = primeiraMetade?.[chave] || [];
  const voos2 = segundaMetade?.[chave]  || [];
  const todos  = [...voos1, ...voos2];

  logger.info(`✅ Total do dia: ${todos.length} voos encontrados`);

  return { [chave]: todos };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 EXECUÇÃO ISOLADA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function principal() {
  const icao = process.argv[2];
  const data = process.argv[3];

  if (!icao || !data) {
    logger.error('❌ Informe o aeroporto ICAO e a data');
    logger.error('   Exemplo: node busca_voos.js SBBR 2026-04-01');
    process.exit(1);
  }

  if (!validarData(data)) {
    logger.error(`❌ Formato de data inválido. Use YYYY-MM-DD`);
    process.exit(1);
  }

  const resultado = await buscarVoosPorDia(icao, data);

  if (resultado) {
    const chave = Object.keys(resultado)[0];
    logger.info(`\n📋 ${resultado[chave].length} voos:`);
    logger.info(JSON.stringify(resultado, null, 2));
  }
}

if (require.main === module) {
  principal().catch(erro => {
    logger.error(`❌ Erro: ${erro.message}`);
    process.exit(1);
  });
}

module.exports = {
  buscarVoosRelativo,
  buscarVoosPorIntervalo,
  buscarVoosPorDia,
};

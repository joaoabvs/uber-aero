#!/usr/bin/env node

/**
 * Módulo para buscar voos na API AeroDataBox
 *
 * Métodos disponíveis:
 *   fetchFlightsRelative(icao, options)         - voos ao redor do momento atual
 *   fetchFlightsByRange(icao, from, to, options) - voos em janela de até 12h (método A)
 *   fetchFlightsByDay(icao, date, options)       - voos do dia completo (usa método A 2x)
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
function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    if (line && !line.startsWith('#')) {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
    }
  });
}
loadEnv();

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 UTILITÁRIOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeRequest(urlString, queryParams = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new url.URL(urlString);
    Object.keys(queryParams).forEach(key => {
      urlObj.searchParams.append(key, queryParams[key]);
    });

    const options = {
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    };

    const protocol = urlObj.protocol === 'https:' ? https : http;

    const req = protocol.request(urlObj, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Erro ao fazer parse do JSON: ${error.message}\nResposta: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', error => reject(new Error(`Erro na requisição: ${error.message}`)));
    req.end();
  });
}

function validateDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✈️  GetAirportFlightsRelative
//     Voos ao redor do momento atual (janela relativa)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Busca voos ao redor do momento atual usando janela relativa.
 *
 * @param {string} icao          - Código ICAO do aeroporto (ex: SBBR)
 * @param {object} options
 * @param {string} options.direction       - 'Arrival' | 'Departure' | 'Both' (padrão: 'Arrival')
 * @param {number} options.durationMinutes - Duração da janela em minutos (padrão: 720)
 * @param {number} options.offsetMinutes   - Offset em minutos relativo ao agora (padrão: -120)
 * @param {boolean} options.withCodeshared - Incluir codeshare (padrão: true)
 * @param {boolean} options.withCargo      - Incluir cargo (padrão: false)
 * @param {boolean} options.withPrivate    - Incluir privados (padrão: false)
 */
async function fetchFlightsRelative(icao, options = {}) {
  const { direction, durationMinutes, offsetMinutes} = options;

  const agora  = new Date();
  const inicio = new Date(agora.getTime() + offsetMinutes * 60000);
  const fim    = new Date(inicio.getTime() + durationMinutes * 60000);
  const fmt    = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const apiUrl = `https://${RAPIDAPI_HOST}/flights/airports/icao/${icao}`;

  logger.info(`🔄 [Relative] Buscando voos em ${icao} (${direction}) — ${fmt(inicio)} até ${fmt(fim)}...`);

  try {
    return await makeRequest(apiUrl, options);
  } catch (error) {
    logger.error(`❌ ${error.message}`);
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
 * @param {string} fromLocal - Início da janela (formato: YYYY-MM-DDTHH:mm)
 * @param {string} toLocal   - Fim da janela (formato: YYYY-MM-DDTHH:mm, máx. 12h após from)
 * @param {object} options
 * @param {string}  options.direction      - 'Arrival' | 'Departure' | 'Both' (padrão: 'Arrival')
 * @param {boolean} options.withCodeshared - Incluir codeshare (padrão: true)
 * @param {boolean} options.withCargo      - Incluir cargo (padrão: false)
 * @param {boolean} options.withPrivate    - Incluir privados (padrão: false)
 */
async function fetchFlightsByRange(icao, fromLocal, toLocal, options = {}) {
  const { direction} = options;
  
  const apiUrl = `https://${RAPIDAPI_HOST}/flights/airports/icao/${icao}/${fromLocal}/${toLocal}`;

  logger.info(`🔄 [Range] Buscando voos em ${icao} (${direction}) de ${fromLocal} até ${toLocal}...`);

  try {
    return await makeRequest(apiUrl, options);
  } catch (error) {
    logger.error(`❌ ${error.message}`);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✈️  Voos do dia completo
//     Chama fetchFlightsByRange duas vezes (00:00→12:00 e 12:00→23:59)
//     e combina os resultados
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Busca todos os voos de um dia completo.
 * Divide o dia em duas janelas (00:00-12:00 e 12:00-23:59) e combina os resultados.
 *
 * @param {string} icao    - Código ICAO do aeroporto (ex: SBBR)
 * @param {string} date    - Data no formato YYYY-MM-DD
 * @param {object} options - Mesmas opções do fetchFlightsByRange
 */
async function fetchFlightsByDay(icao, date, options = {}) {
  logger.info(`🔄 [Day] Buscando voos do dia ${date} em ${icao}...`);

  const primeiraMetade = await fetchFlightsByRange(icao, `${date}T00:00`, `${date}T12:00`, options);
  await new Promise(resolve => setTimeout(resolve, 1500));
  const segundaMetade = await fetchFlightsByRange(icao, `${date}T12:00`, `${date}T23:59`, options);

  // Combinar resultados (a API retorna { arrivals: [...] } ou { departures: [...] })
  const chave = options.direction === 'Departure' ? 'departures' : 'arrivals';

  const voos1 = primeiraMetade?.[chave] || [];
  const voos2 = segundaMetade?.[chave]  || [];
  const todos  = [...voos1, ...voos2];

  logger.info(`✅ Total do dia: ${todos.length} voos encontrados`);

  return { [chave]: todos };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 EXECUÇÃO ISOLADA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
  const icao = process.argv[2];
  const date = process.argv[3];

  if (!icao || !date) {
    logger.error('❌ Informe o aeroporto ICAO e a data');
    logger.error('   Exemplo: node busca_voos.js SBBR 2026-04-01');
    process.exit(1);
  }

  if (!validateDate(date)) {
    logger.error(`❌ Formato de data inválido. Use YYYY-MM-DD`);
    process.exit(1);
  }

  const resultado = await fetchFlightsByDay(icao, date);

  if (resultado) {
    const chave = Object.keys(resultado)[0];
    logger.info(`\n📋 ${resultado[chave].length} voos:`);
    logger.info(JSON.stringify(resultado, null, 2));
  }
}

if (require.main === module) {
  main().catch(error => {
    logger.error(`❌ Erro: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  fetchFlightsRelative,
  fetchFlightsByRange,
  fetchFlightsByDay,
};

#!/usr/bin/env node

/**
 * 🚗 FluxoUber - Processador de Dados de Voos
 * Processa dados da nova API e estima passageiros via capacidade × load_factor
 *
 * Formato da API:
 *   { arrivals: [{ departure: { airport: { icao } }, arrival: { scheduledTime: { local } },
 *                  airline: { name, icao }, aircraft: { model }, isCargo }] }
 *
 * Load factor: load_factor/load_factor_{ICAO}_{ano}.json
 *   [{ empresa, origem_sigla_icao, mes, load_factor }]
 */

const fs     = require('fs');
const path   = require('path');
const logger = require('./logger');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🗺️  MAPEAMENTO: nome da API → nome no arquivo de load_factor
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PADRAO_LOAD_FACTOR = 0;

const MAPA_EMPRESA = {
  'LAN': 'LATAM AIRLINES GROUP (EX - LAN AIRLINES S/A)',
  'LA' : 'LATAM AIRLINES GROUP (EX - LAN AIRLINES S/A)',
  'LPE': 'LATAM AIRLINES PERU (EX-LAN PERU S.A.)',
  'GLO': 'GOL LINHAS AÉREAS S.A. (EX- VRG LINHAS AÉREAS S.A.)',
  'G3' : 'GOL LINHAS AÉREAS S.A. (EX- VRG LINHAS AÉREAS S.A.)',
  'AZU': 'AZUL LINHAS AÉREAS BRASILEIRAS S/A',
  'AD' : 'AZUL LINHAS AÉREAS BRASILEIRAS S/A',
  'TAP': 'TAP - TRANSPORTES AÉREOS PORTUGUESES S/A',
  'ARG': 'AEROLINEAS ARGENTINAS S/A',
  'AAL': 'AMERICAN AIRLINES, INC.',
  'AA' : 'AMERICAN AIRLINES, INC.',
  'CMP': 'COMPAÑIA PANAMEÑA DE AVIACION S.A. (COPA AIRLINES)',
  'CM' : 'COMPAÑIA PANAMEÑA DE AVIACION S.A. (COPA AIRLINES)',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 CARREGAR DADOS ESTÁTICOS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function carregarCapacidades() {
  const p = path.join(__dirname, '../config/capacidades_aeronaves.json');
  if (!fs.existsSync(p)) throw new Error('❌ capacidades_aeronaves.json não encontrado');
  return JSON.parse(fs.readFileSync(p, 'utf-8')).capacidades;
}

function carregarLoadFactors(aeroporto = 'SBBR', ano = 2025) {
  const p = path.join(__dirname, '../config/load_factor', `load_factor_${aeroporto.toUpperCase()}_${ano}.json`);
  if (!fs.existsSync(p)) {
    logger.warn(`load_factor não encontrado: ${p}. Usando padrão ${PADRAO_LOAD_FACTOR}`);
    return { dados: [], padrao: PADRAO_LOAD_FACTOR };
  }
  const dados = JSON.parse(fs.readFileSync(p, 'utf-8'));
  return { dados: Array.isArray(dados) ? dados : [], padrao: PADRAO_LOAD_FACTOR };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✈️  NORMALIZADORES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Normaliza o modelo da aeronave retornado pela API
 * Ex: "Airbus A321" → "Airbus A321-200"
 */
// Aliases para modelos com nomes inconsistentes entre a API e o cadastro
// Ex: API retorna "Embraer 195", cadastro tem "Embraer E195"
const ALIASES_MODELO = {
  'embraer 195': 'Embraer E195',
  'embraer 190': 'Embraer E190',
  'embraer 175': 'Embraer E175',
  'embraer 170': 'Embraer E170',
  'airbus a320 neo': 'Airbus A320neo',
  'airbus a321 neo': 'Airbus A321neo',
};

function normalizarModelo(modeloAPI, capacidades) {
  if (!modeloAPI) return null;

  // Match por alias
  const alias = ALIASES_MODELO[modeloAPI.toLowerCase()];
  if (alias) return alias;

  // Match exato
  const exato = capacidades.find(a => a.modelo.toLowerCase() === modeloAPI.toLowerCase());
  if (exato) return exato.modelo;

  // Match parcial: modelo cadastrado começa com o que veio da API
  const parcial = capacidades.find(a =>
    a.modelo.toLowerCase().startsWith(modeloAPI.toLowerCase())
  );
  if (parcial) return parcial.modelo;

  // Match inverso: o que veio da API começa com o modelo cadastrado
  const invertido = capacidades.find(a =>
    modeloAPI.toLowerCase().startsWith(a.modelo.toLowerCase())
  );
  if (invertido) return invertido.modelo;

  return null;
}

function obterCapacidade(modeloAPI, capacidades) {
  const modelo = normalizarModelo(modeloAPI, capacidades);
  if (!modelo) return null;
  return capacidades.find(a => a.modelo === modelo)?.capacidade ?? null;
}

/**
 * Resolve o nome da empresa no formato do load_factor
 * Usa o ICAO da airline como chave de mapeamento
 */
function resolverEmpresa(airline) {
  if (!airline) return null;

  // Tentar pelo ICAO
  const porIcao = MAPA_EMPRESA[airline.icao?.toUpperCase()];
  if (porIcao) return porIcao;

  // Tentar pelo IATA
  const porIata = MAPA_EMPRESA[airline.iata?.toUpperCase()];
  if (porIata) return porIata;

  return null;
}

/**
 * Busca load_factor por empresa + origem + mês.
 * Fallbacks em cascata:
 *   1. empresa + origem + mês  (match exato)
 *   2. empresa + mês           (qualquer origem)
 *   3. origem + mês            (qualquer empresa)
 *   4. mês                     (qualquer rota)
 
*/
function obterLoadFactor(empresa, origem, mes, loadFactors) {
  const { dados, padrao } = loadFactors;
  if (!dados.length) return padrao;

  const m = String(mes).padStart(2, '0');

  const tentativas = [
    r => r.empresa === empresa && r.origem_sigla_icao === origem && r.mes === m,
    r => r.empresa === empresa && r.mes === m,
    r => r.origem_sigla_icao === origem && r.mes === m,
    r => r.mes === m,
  ];

  for (const fn of tentativas) {
    const registro = dados.find(fn);
    if (registro) return registro.load_factor;
  }

  return padrao;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📈 CÁLCULO DE ESTIMATIVA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Estima passageiros de um único voo.
 * passageiros = capacidade × load_factor
 */
function calcularEstimaPassageiros(voo, capacidades, loadFactors, mes) {
  const modeloAeronave = voo.aircraft?.model;
  const capacidade = modeloAeronave ? obterCapacidade(modeloAeronave, capacidades) : null;

  if (!capacidade) {
    if (modeloAeronave) {
      logger.warn(`Capacidade não encontrada para "${modeloAeronave}"`);
    }
    return 0;
  }

  const empresa = resolverEmpresa(voo.airline);
  const origem  = voo.departure?.airport?.icao || 'DESCONHECIDO';
  const lf      = obterLoadFactor(empresa, origem, mes, loadFactors);

  return Math.round(capacidade * lf);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔄 PROCESSAMENTO PRINCIPAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Processa a lista de chegadas retornada pela nova API.
 *
 * @param {Array}  voos     - array de objetos de voo
 * @param {string} destino  - código ICAO do aeroporto destino (ex: 'SBBR')
 * @param {string} dataVoo  - data no formato 'YYYY-MM-DD'
 * @param {number} ano      - ano para carregar o load_factor correspondente
 */
function processarVoos(voos, destino, dataVoo, ano) {
  const capacidades  = carregarCapacidades();
  const loadFactors  = carregarLoadFactors(destino, ano);

  // Extrair mês da data informada
  const mes = dataVoo ? parseInt(dataVoo.split('-')[1]) : new Date().getMonth() + 1;

  const passageirosPorhora = {};
  for (let h = 0; h < 24; h++) {
    passageirosPorhora[`${String(h).padStart(2, '0')}:00`] = 0;
  }

  let totalVoos = 0;
  let totalPassageiros = 0;

  voos.forEach(voo => {
    try {
      totalVoos++;

      // Extrair hora local de chegada: "2026-04-01 12:00-03:00" → 12
      const horarioLocal = voo.movement?.scheduledTime?.local || '';
      const match = horarioLocal.match(/[\sT](\d{2}):/);
      const hora = match ? parseInt(match[1]) : 0;
      const chave = `${String(hora).padStart(2, '0')}:00`;

      if(voo.aircraft == null) {
        logger.warn(`Aeronave não encontrada para voo ${voo.number} (${horarioLocal})`);
        return;
      }

      const passageiros = calcularEstimaPassageiros(voo, capacidades, loadFactors, mes);
      
      if (passageiros === 0) {
        throw new Error(`Estimativa zero para voo ${voo.number} (${horarioLocal}) — verifique capacidade e load factor`);
      }

      totalPassageiros += passageiros;
      passageirosPorhora[chave] += passageiros;

    } catch (e) {
      logger.error(e.message);
      throw e;
    }
  });

  return { passageirosPorhora, totalVoos, totalPassageiros };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🕐 PROCESSAMENTO POR JANELA (orquestrador horário)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Processa voos agrupando em duas janelas de 60 minutos a partir de um instante.
 * Ex: rodando às 19:50 → janela1: 19:50–20:50, janela2: 20:50–21:50
 *
 * @param {Array}  voos     - array de objetos de voo
 * @param {string} destino  - código ICAO do aeroporto destino
 * @param {string} dataVoo  - data no formato 'YYYY-MM-DD'
 * @param {number} ano      - ano para o load_factor
 * @param {number} inicioMs - timestamp de início (Date.now())
 * @returns {{ atual: { voos, passageiros }, proxima: { voos, passageiros } }}
 */
function processarVoosPorJanela(voos, destino, dataVoo, ano, inicioMs) {
  const capacidades = carregarCapacidades();
  const loadFactors = carregarLoadFactors(destino, ano);
  const mes = dataVoo ? parseInt(dataVoo.split('-')[1]) : new Date().getMonth() + 1;

  const j1inicio = inicioMs;
  const j1fim    = inicioMs + 60 * 60000;
  const j2fim    = inicioMs + 120 * 60000;

  const resultado = {
    atual:   { voos: 0, passageiros: 0 },
    proxima: { voos: 0, passageiros: 0 }
  };

  voos.forEach(voo => {
    const horarioLocal = voo.movement?.scheduledTime?.local || '';
    if (!horarioLocal) return;

    if (voo.aircraft == null) {
      logger.warn(`Aeronave não encontrada para voo ${voo.number} (${horarioLocal})`);
      return;
    }

    const vooMs      = new Date(horarioLocal).getTime();
    const passageiros = calcularEstimaPassageiros(voo, capacidades, loadFactors, mes);
    if (passageiros === 0) return;

    if (vooMs >= j1inicio && vooMs < j1fim) {
      resultado.atual.voos++;
      resultado.atual.passageiros += passageiros;
    } else if (vooMs >= j1fim && vooMs < j2fim) {
      resultado.proxima.voos++;
      resultado.proxima.passageiros += passageiros;
    }
  });

  return resultado;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📤 EXPORTAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = {
  processarVoos,
  processarVoosPorJanela,
  // Exportações internas para testes unitários
  _test: { normalizarModelo, obterLoadFactor, calcularEstimaPassageiros }
};

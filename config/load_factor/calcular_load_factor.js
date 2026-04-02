#!/usr/bin/env node

/**
 * Calcula o Load Factor mensal por empresa e origem
 * para um aeroporto de destino e ano passados como parâmetro
 *
 * Uso:
 *   node calcular_load_factor.js SBBR 2025
 */

const fs = require('fs');
const path = require('path');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📋 PARÂMETROS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const destino = process.argv[2];
const ano     = process.argv[3];

if (!destino || !ano) {
  console.error('❌ Informe o aeroporto de destino e o ano como parâmetros');
  console.error('   Exemplo: node calcular_load_factor.js SBBR 2025');
  process.exit(1);
}

const DESTINO    = destino.toUpperCase();
const ANO_FILTRO = ano;
const INPUT_FILE = path.join(__dirname, 'Dados_Estatisticos_2021_a_2030.json');
const OUTPUT_FILE = path.join(__dirname, `load_factor_${DESTINO}_${ANO_FILTRO}.json`);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 PROCESSAMENTO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('');
console.log('═'.repeat(70));
console.log('📊 Calculador de Load Factor');
console.log('═'.repeat(70));
console.log(`📍 Destino : ${DESTINO}`);
console.log(`📅 Ano     : ${ANO_FILTRO}`);
console.log('');

console.log('📂 Carregando arquivo de dados...');
let dados;
try {
  const raw = fs.readFileSync(INPUT_FILE, 'utf-8');
  // Arquivo pode conter múltiplos arrays JSON concatenados (ex: [...][...])
  // Corrige unindo em um único array
  const corrigido = '[' + raw.replace(/\]\[/g, ',') + ']';
  const parsed = JSON.parse(corrigido);
  // Se resultado é array de arrays, achatar
  dados = Array.isArray(parsed[0]) ? parsed.flat() : parsed;
  console.log(`✅ ${dados.length.toLocaleString('pt-BR')} registros carregados`);
} catch (error) {
  console.error(`❌ Erro ao ler arquivo: ${error.message}`);
  process.exit(1);
}

// Filtrar por destino e ano
console.log('');
console.log('🔍 Filtrando dados...');
const filtrados = dados.filter(r =>
  r.AEROPORTO_DE_DESTINO_SIGLA === DESTINO &&
  r.ANO === ANO_FILTRO &&
  r.GRUPO_DE_VOO === 'REGULAR' &&
  parseInt(r.ASSENTOS) > 0
);

if (filtrados.length === 0) {
  console.error(`❌ Nenhum registro encontrado para destino ${DESTINO} em ${ANO_FILTRO}`);
  process.exit(1);
}

console.log(`✅ ${filtrados.length.toLocaleString('pt-BR')} registros encontrados`);

// Agrupar por empresa + origem + mês e acumular passageiros e assentos
console.log('');
console.log('⚙️  Calculando load factor...');
const grupos = {};

filtrados.forEach(r => {
  const empresa      = r.EMPRESA_NOME || 'DESCONHECIDA';
  const empresa_icao     = r.EMPRESA_ICAO || 'DESCONHECIDA';
  const origem       = r.AEROPORTO_DE_ORIGEM_SIGLA || 'DESCONHECIDA';
  const mes          = String(r.MES).padStart(2, '0');
  const natureza     = r.NATUREZA || 'DESCONHECIDA';
  const chave        = `${empresa}||${origem}||${mes}||${natureza}`;

  if (!grupos[chave]) {
    grupos[chave] = {
      empresa,
      origem_sigla_icao: origem,
      origem_nome: r.AEROPORTO_DE_ORIGEM_NOME || '',
      destino_sigla_icao: DESTINO,
      destino_nome: r.AEROPORTO_DE_DESTINO_NOME || '',
      natureza,
      mes,
      total_passageiros: 0,
      total_assentos: 0,
      total_voos: 0
    };
  }

  grupos[chave].total_passageiros += (parseInt(r.PASSAGEIROS_PAGOS) || 0) + (parseInt(r.PASSAGEIROS_GRATIS) || 0);
  grupos[chave].total_assentos    += parseInt(r.ASSENTOS) || 0;
  grupos[chave].total_voos        += parseInt(r.DECOLAGENS) || 0;
});

// Calcular load factor por grupo
const resultado = Object.values(grupos).map(g => ({
  ano: ANO_FILTRO,
  empresa: g.empresa,
  origem_sigla_icao: g.origem_sigla_icao,
  origem_nome: g.origem_nome,
  destino_sigla_icao: g.destino_sigla_icao,
  destino_nome: g.destino_nome,
  natureza: g.natureza,
  mes: g.mes,
  total_passageiros: g.total_passageiros,
  total_assentos: g.total_assentos,
  total_voos: g.total_voos,
  load_factor: parseFloat((g.total_passageiros / g.total_assentos).toFixed(4))
}));

// Ordenar por empresa, origem e mês
resultado.sort((a, b) => {
  if (a.empresa !== b.empresa) return a.empresa.localeCompare(b.empresa);
  if (a.origem_sigla_icao !== b.origem_sigla_icao) return a.origem_sigla_icao.localeCompare(b.origem_sigla_icao);
  return a.mes.localeCompare(b.mes);
});

// Salvar resultado
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(resultado, null, 2), 'utf-8');

console.log(`✅ ${resultado.length.toLocaleString('pt-BR')} combinações calculadas`);
console.log('');
console.log('═'.repeat(70));
console.log('✅ CONCLUÍDO!');
console.log('═'.repeat(70));
console.log(`💾 Arquivo salvo: load_factor_${DESTINO}_2025.json`);
console.log('');

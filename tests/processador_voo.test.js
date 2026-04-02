/**
 * Testes unitários e de integração — processador_voo.js
 */

const { processarVoos, _test } = require('../lib/processador_voo');
const { normalizarModelo, obterLoadFactor, calcularEstimaPassageiros } = _test;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Dados auxiliares de teste
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CAPACIDADES = [
  { modelo: 'Airbus A320-200',  fabricante: 'Airbus',   capacidade: 180, classe: 'narrow-body' },
  { modelo: 'Airbus A320neo',   fabricante: 'Airbus',   capacidade: 165, classe: 'narrow-body' },
  { modelo: 'Airbus A321-200',  fabricante: 'Airbus',   capacidade: 220, classe: 'narrow-body' },
  { modelo: 'Embraer E195',     fabricante: 'Embraer',  capacidade: 124, classe: 'regional'    },
  { modelo: 'Embraer E190',     fabricante: 'Embraer',  capacidade: 114, classe: 'regional'    },
  { modelo: 'Boeing 737-800',   fabricante: 'Boeing',   capacidade: 162, classe: 'narrow-body' },
];

// Dataset para match exato e fallback 1 (empresa + mes)
const LF_AZUL = {
  dados: [
    { empresa: 'AZUL LINHAS AÉREAS BRASILEIRAS S/A', origem_sigla_icao: 'SBSP', mes: '04', load_factor: 0.85 },
    { empresa: 'AZUL LINHAS AÉREAS BRASILEIRAS S/A', origem_sigla_icao: 'SBGR', mes: '04', load_factor: 0.80 },
  ],
  padrao: 0.82
};

// Dataset para fallback 2 (origem + mes): só tem registro de outra empresa com mesma origem
const LF_ORIGEM = {
  dados: [
    { empresa: 'OUTRA EMPRESA S/A', origem_sigla_icao: 'SBSP', mes: '04', load_factor: 0.76 },
  ],
  padrao: 0.82
};

// Dataset para fallback 3 (mes): só tem registro de empresa e origem diferentes
const LF_MES = {
  dados: [
    { empresa: 'OUTRA EMPRESA S/A', origem_sigla_icao: 'OUTRA', mes: '04', load_factor: 0.72 },
  ],
  padrao: 0.82
};

// Alias para compatibilidade com testes de calcularEstimaPassageiros
const LOAD_FACTORS = LF_AZUL;

// Fábrica de voo de teste
function criarVoo({ numero = 'AD 1234', modelo = 'Airbus A320-200', icaoAirline = 'AZU', origem = 'SBSP', horario = '2026-04-01T14:30-03:00' } = {}) {
  return {
    number: numero,
    movement: { scheduledTime: { local: horario } },
    aircraft: modelo ? { model: modelo } : null,
    airline: { icao: icaoAirline, name: 'Azul Linhas Aéreas' },
    departure: { airport: { icao: origem } }
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// normalizarModelo
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('normalizarModelo', () => {
  test('retorna null para modelo nulo', () => {
    expect(normalizarModelo(null, CAPACIDADES)).toBeNull();
  });

  test('retorna null para modelo desconhecido', () => {
    expect(normalizarModelo('Modelo Inexistente XYZ', CAPACIDADES)).toBeNull();
  });

  test('match exato', () => {
    expect(normalizarModelo('Airbus A320-200', CAPACIDADES)).toBe('Airbus A320-200');
  });

  test('match exato case-insensitive', () => {
    expect(normalizarModelo('airbus a320-200', CAPACIDADES)).toBe('Airbus A320-200');
  });

  test('alias: Embraer 195 → Embraer E195', () => {
    expect(normalizarModelo('Embraer 195', CAPACIDADES)).toBe('Embraer E195');
  });

  test('alias: Embraer 190 → Embraer E190', () => {
    expect(normalizarModelo('Embraer 190', CAPACIDADES)).toBe('Embraer E190');
  });

  test('alias: Airbus A320 NEO → Airbus A320neo', () => {
    expect(normalizarModelo('Airbus A320 NEO', CAPACIDADES)).toBe('Airbus A320neo');
  });

  test('match parcial: API retorna prefixo do modelo cadastrado', () => {
    // "Airbus A321" → "Airbus A321-200"
    expect(normalizarModelo('Airbus A321', CAPACIDADES)).toBe('Airbus A321-200');
  });

  test('match inverso: API retorna string mais longa que o modelo cadastrado', () => {
    // "Boeing 737-800 ER" começa com "Boeing 737-800"
    const caps = [...CAPACIDADES, { modelo: 'Boeing 737-800', fabricante: 'Boeing', capacidade: 162, classe: 'narrow-body' }];
    expect(normalizarModelo('Boeing 737-800 ER', caps)).toBe('Boeing 737-800');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// obterLoadFactor
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('obterLoadFactor', () => {
  const AZUL   = 'AZUL LINHAS AÉREAS BRASILEIRAS S/A';
  const GOL    = 'GOL LINHAS AÉREAS S.A. (EX- VRG LINHAS AÉREAS S.A.)';
  const MES    = 4;

  test('match exato: empresa + origem + mês', () => {
    expect(obterLoadFactor(AZUL, 'SBSP', MES, LOAD_FACTORS)).toBe(0.85);
  });

  test('fallback 1: empresa + mês quando origem não tem match exato', () => {
    // AZUL com origem diferente → cai para empresa + mês (SBGR = 0.85)
    
    expect(obterLoadFactor(AZUL, 'SBBR', MES, LF_AZUL)).toBe(0.85);
  });

  test('fallback 2: origem + mês quando empresa não está mapeada', () => {
    // empresa desconhecida, dataset só tem registro de outra empresa com SBSP
    expect(obterLoadFactor('EMPRESA DESCONHECIDA', 'SBSP', MES, LF_ORIGEM)).toBe(0.76);
  });

  test('fallback 3: mês quando nem empresa nem origem têm match', () => {
    // empresa e origem inexistentes, dataset só tem registro de empresa/origem diferentes

    expect(obterLoadFactor('EMPRESA DESCONHECIDA', 'XXXX', MES, LF_MES)).toBe(0.72);
  });

  test('fallback 4: padrão global quando dados estão vazios', () => {
    expect(obterLoadFactor(AZUL, 'SBSP', MES, { dados: [], padrao: 0.82 })).toBe(0.82);
  });

  test('mês como string com zero à esquerda é tratado igual a inteiro', () => {
    expect(obterLoadFactor(AZUL, 'SBSP', 4, LOAD_FACTORS)).toBe(0.85);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// calcularEstimaPassageiros
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('calcularEstimaPassageiros', () => {
  test('estima corretamente: capacidade × load_factor arredondado', () => {
    // A320-200 (180) × 0.85 (AZUL + SBSP + mes 4) = 153
    const voo = criarVoo({ modelo: 'Airbus A320-200', icaoAirline: 'AZU', origem: 'SBSP' });
    expect(calcularEstimaPassageiros(voo, CAPACIDADES, LOAD_FACTORS, 4)).toBe(153);
  });

  test('retorna 0 quando aircraft é null', () => {
    const voo = criarVoo({ modelo: null });
    expect(calcularEstimaPassageiros(voo, CAPACIDADES, LOAD_FACTORS, 4)).toBe(0);
  });

  test('retorna 0 quando modelo é desconhecido', () => {
    const voo = criarVoo({ modelo: 'Modelo XYZ Desconhecido' });
    expect(calcularEstimaPassageiros(voo, CAPACIDADES, LOAD_FACTORS, 4)).toBe(0);
  });

  test('usa alias corretamente na estimativa', () => {
    // "Embraer 195" → E195 (124) × 0.85 = 105
    const voo = criarVoo({ modelo: 'Embraer 195', icaoAirline: 'AZU', origem: 'SBSP' });
    expect(calcularEstimaPassageiros(voo, CAPACIDADES, LOAD_FACTORS, 4)).toBe(105);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// processarVoos (integração com arquivos reais)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('processarVoos', () => {
  const VOO_VALIDO = criarVoo({ horario: '2026-04-01T08:30-03:00' });

  test('retorna estrutura correta com voos válidos', () => {
    const resultado = processarVoos([VOO_VALIDO], 'SBBR', '2026-04-01', 2025);
    expect(resultado).toHaveProperty('passageirosPorhora');
    expect(resultado).toHaveProperty('totalVoos');
    expect(resultado).toHaveProperty('totalPassageiros');
    expect(resultado.totalVoos).toBe(1);
    expect(resultado.totalPassageiros).toBeGreaterThan(0);
  });

  test('distribui passageiros na hora correta', () => {
    const resultado = processarVoos([VOO_VALIDO], 'SBBR', '2026-04-01', 2025);
    expect(resultado.passageirosPorhora['08:00']).toBeGreaterThan(0);
    expect(resultado.passageirosPorhora['09:00']).toBe(0);
  });

  test('parseia horário com separador T', () => {
    const vooT = criarVoo({ horario: '2026-04-01T15:45-03:00' });
    const resultado = processarVoos([vooT], 'SBBR', '2026-04-01', 2025);
    expect(resultado.passageirosPorhora['15:00']).toBeGreaterThan(0);
  });

  test('parseia horário com separador espaço', () => {
    const vooEspaco = criarVoo({ horario: '2026-04-01 22:10-03:00' });
    const resultado = processarVoos([vooEspaco], 'SBBR', '2026-04-01', 2025);
    expect(resultado.passageirosPorhora['22:00']).toBeGreaterThan(0);
  });

  test('pula voos sem aeronave sem lançar exceção', () => {
    const vooSemAeronave = criarVoo({ modelo: null });
    expect(() => {
      processarVoos([vooSemAeronave], 'SBBR', '2026-04-01', 2025);
    }).not.toThrow();
  });

  test('lança exceção quando estimativa de passageiros é zero', () => {
    const vooModeloDesconhecido = criarVoo({ modelo: 'Aeronave Fantasma 9000' });
    expect(() => {
      processarVoos([vooModeloDesconhecido], 'SBBR', '2026-04-01', 2025);
    }).toThrow('Estimativa zero');
  });

  test('soma passageiros de múltiplos voos na mesma hora', () => {
    const voo1 = criarVoo({ numero: 'AD 1111', horario: '2026-04-01T10:00-03:00' });
    const voo2 = criarVoo({ numero: 'G3 2222', icaoAirline: 'GLO', horario: '2026-04-01T10:30-03:00' });
    const resultado = processarVoos([voo1, voo2], 'SBBR', '2026-04-01', 2025);
    expect(resultado.passageirosPorhora['10:00']).toBeGreaterThan(0);
    expect(resultado.totalVoos).toBe(2);
  });

  test('passageirosPorhora tem exatamente 24 chaves', () => {
    const resultado = processarVoos([VOO_VALIDO], 'SBBR', '2026-04-01', 2025);
    expect(Object.keys(resultado.passageirosPorhora)).toHaveLength(24);
  });
});

/**
 * Testes unitários — notificador_telegram.js
 * Cobre: generateMessage
 * (sendToTelegram não é testado — depende de credenciais reais)
 */

const { generateMessage } = require('../lib/notificador_telegram');
const fs   = require('fs');
const path = require('path');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Setup: cria template temporário para os testes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TEMPLATE_PATH = path.join(__dirname, '../lib/template_test.txt');
const TEMPLATE_CONTEUDO = `
FluxoUber - {DATA}
Voos: {TOTAL_VOOS}
Passageiros: {TOTAL_PASSAGEIROS}
Melhor hora: {MELHOR_HORA} ({PASSAGEIROS_PICO} pax)
{HORARIOS_COM_MOVIMENTO}
`.trim();

beforeAll(() => {
  fs.writeFileSync(TEMPLATE_PATH, TEMPLATE_CONTEUDO, 'utf-8');
});

afterAll(() => {
  if (fs.existsSync(TEMPLATE_PATH)) fs.unlinkSync(TEMPLATE_PATH);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Dados auxiliares
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function criarPassageirosPorhora(overrides = {}) {
  const horas = {};
  for (let h = 0; h < 24; h++) {
    horas[`${String(h).padStart(2, '0')}:00`] = 0;
  }
  return { ...horas, ...overrides };
}

const TEMPLATE_RELATIVO = 'template_test.txt';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// generateMessage
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('generateMessage', () => {
  test('substitui placeholder {DATA} no formato brasileiro', () => {
    const dados = { passageirosPorhora: criarPassageirosPorhora({ '08:00': 500 }), totalVoos: 5, totalPassageiros: 500 };
    const msg = generateMessage(dados, '2026-04-01', TEMPLATE_RELATIVO);
    expect(msg).toContain('01/04/2026');
    expect(msg).not.toContain('2026-04-01');
  });

  test('substitui placeholder {TOTAL_VOOS}', () => {
    const dados = { passageirosPorhora: criarPassageirosPorhora({ '10:00': 300 }), totalVoos: 42, totalPassageiros: 300 };
    const msg = generateMessage(dados, '2026-04-01', TEMPLATE_RELATIVO);
    expect(msg).toContain('42');
  });

  test('substitui placeholder {TOTAL_PASSAGEIROS} com formatação pt-BR', () => {
    const dados = { passageirosPorhora: criarPassageirosPorhora({ '10:00': 1500 }), totalVoos: 10, totalPassageiros: 12345 };
    const msg = generateMessage(dados, '2026-04-01', TEMPLATE_RELATIVO);
    expect(msg).toContain('12.345');
  });

  test('identifica corretamente a melhor hora (pico)', () => {
    const pph = criarPassageirosPorhora({ '08:00': 300, '14:00': 900, '18:00': 600 });
    const dados = { passageirosPorhora: pph, totalVoos: 10, totalPassageiros: 1800 };
    const msg = generateMessage(dados, '2026-04-01', TEMPLATE_RELATIVO);
    expect(msg).toContain('14:00');
    expect(msg).toContain('900');
  });

  test('não inclui horários com zero passageiros no {HORARIOS_COM_MOVIMENTO}', () => {
    const pph = criarPassageirosPorhora({ '10:00': 400 }); // apenas 10:00 tem movimento
    const dados = { passageirosPorhora: pph, totalVoos: 3, totalPassageiros: 400 };
    const msg = generateMessage(dados, '2026-04-01', TEMPLATE_RELATIVO);
    const linhasMovimento = msg.split('\n').filter(l => l.startsWith('✈️'));
    expect(linhasMovimento).toHaveLength(1);
    expect(linhasMovimento[0]).toContain('10:00');
  });

  test('marca 🔥 apenas na hora com maior fluxo', () => {
    const pph = criarPassageirosPorhora({ '08:00': 300, '14:00': 900, '18:00': 600 });
    const dados = { passageirosPorhora: pph, totalVoos: 10, totalPassageiros: 1800 };
    const msg = generateMessage(dados, '2026-04-01', TEMPLATE_RELATIVO);
    const linhas = msg.split('\n').filter(l => l.startsWith('✈️'));
    const linhaPico    = linhas.find(l => l.includes('14:00'));
    const linhaOutra1  = linhas.find(l => l.includes('08:00'));
    const linhaOutra2  = linhas.find(l => l.includes('18:00'));
    expect(linhaPico).toContain('🔥');
    expect(linhaOutra1).not.toContain('🔥');
    expect(linhaOutra2).not.toContain('🔥');
  });

  test('quando há apenas um horário com movimento, ele é marcado como pico', () => {
    const pph = criarPassageirosPorhora({ '10:00': 400 });
    const dados = { passageirosPorhora: pph, totalVoos: 3, totalPassageiros: 400 };
    const msg = generateMessage(dados, '2026-04-01', TEMPLATE_RELATIVO);
    expect(msg).toContain('🔥');
  });

  test('lança exceção quando template não existe', () => {
    const dados = { passageirosPorhora: criarPassageirosPorhora(), totalVoos: 0, totalPassageiros: 0 };
    expect(() => {
      generateMessage(dados, '2026-04-01', 'template_inexistente.txt');
    }).toThrow('Template não encontrado');
  });

  test('substitui todos os placeholders (nenhum {PLACEHOLDER} restante)', () => {
    const pph = criarPassageirosPorhora({ '12:00': 700 });
    const dados = { passageirosPorhora: pph, totalVoos: 5, totalPassageiros: 700 };
    const msg = generateMessage(dados, '2026-04-15', TEMPLATE_RELATIVO);
    expect(msg).not.toMatch(/\{[A-Z_]+\}/);
  });
});

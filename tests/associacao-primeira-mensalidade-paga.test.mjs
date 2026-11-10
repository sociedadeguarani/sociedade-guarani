import test from 'node:test';
import assert from 'node:assert/strict';
import {
  competenciaPermitidaPelaAssociacao,
  dataAssociacaoPelaPrimeiraMensalidadePaga,
  mensalidadeRegistroAnteriorAAssociacao,
  obterPrimeiraCompetenciaPaga,
} from '../lib/competenciaAssociacao.ts';

test('usa a primeira competência efetivamente paga quando data_associacao está vazia', () => {
  const primeira = obterPrimeiraCompetenciaPaga([
    { competencia: '2025-03-01', situacao: 'pago' },
    { competencia: '2024-11-01', situacao: 'em_aberto' },
    { competencia: '2024-12-01', situacao: 'isento' },
    { competencia: '2024-10-01', situacao: 'cancelado' },
    { competencia: '2025-01-01', situacao: 'baixado' },
  ]);
  assert.equal(primeira, '2025-01-01');
  assert.equal(dataAssociacaoPelaPrimeiraMensalidadePaga(null, primeira), '2025-01-01');
});

test('a primeira competência paga marca o início, sem excluir a própria competência', () => {
  assert.equal(competenciaPermitidaPelaAssociacao(null, '2024-01-01', 10, '2024-01-01'), true);
  assert.equal(competenciaPermitidaPelaAssociacao(null, '2023-12-01', 10, '2024-01-01'), false);
  assert.equal(mensalidadeRegistroAnteriorAAssociacao(null, '2023-12-01', '2023-12-10', 10, '2024-01-01'), true);
  assert.equal(mensalidadeRegistroAnteriorAAssociacao(null, '2024-01-01', '2024-01-10', 10, '2024-01-01'), false);
});

test('data de associação preenchida sempre prevalece sobre primeira mensalidade paga', () => {
  assert.equal(dataAssociacaoPelaPrimeiraMensalidadePaga('2024-05-18', '2025-01-01'), '2024-05-18');
  assert.equal(competenciaPermitidaPelaAssociacao('2024-05-18', '2024-05-01', 10, '2025-01-01'), false);
  assert.equal(competenciaPermitidaPelaAssociacao('2024-05-18', '2024-05-01', 10), false);
});

test('cadastro sem data e sem mensalidade paga mantém o comportamento anterior sem inventar vínculo', () => {
  assert.equal(obterPrimeiraCompetenciaPaga([
    { competencia: '2024-01-01', situacao: 'isento' },
    { competencia: '2024-02-01', situacao: 'cancelado' },
    { competencia: '2024-03-01', situacao: 'em_aberto' },
  ]), null);
  assert.equal(competenciaPermitidaPelaAssociacao(null, '2024-01-01', 10, null), true);
});

test('portal do associado sinaliza competências anteriores e impede pagamento/comprovante', async () => {
  const { readFileSync } = await import('node:fs');
  const apiMinhas = readFileSync(new URL('../app/api/mensalidades/minhas/route.ts', import.meta.url), 'utf8');
  const paginaMinhas = readFileSync(new URL('../app/minhas-mensalidades/page.tsx', import.meta.url), 'utf8');
  const apiComprovantes = readFileSync(new URL('../app/api/comprovantes/pagamentos/route.ts', import.meta.url), 'utf8');
  assert.match(apiMinhas, /anterior_a_associacao:\s*mensalidadeRegistroAnteriorAAssociacao/);
  assert.match(paginaMinhas, /!m\.anterior_a_associacao/);
  assert.match(paginaMinhas, /Anterior à associação/);
  assert.match(apiComprovantes, /competências são anteriores ao início da associação/);
});

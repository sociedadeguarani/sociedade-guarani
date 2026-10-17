import test from 'node:test';
import assert from 'node:assert/strict';

import {
  POLITICA_INADIMPLENCIA_PADRAO,
  normalizarPoliticaInadimplencia,
  classificarMesesAtraso,
} from '../lib/politicaInadimplencia.ts';
import {
  dependenteTemMensalidade,
  socioElegivelParaMensalidade,
  tipoDependenteSemMensalidade,
  tipoDependenteComMensalidade,
} from '../lib/regrasMensalidade.ts';
import {
  CHAVE_PIX_BANRISUL,
  CHAVE_PIX_BANRISUL_EXIBICAO,
  CHAVE_PIX_LEGADA_CNPJ,
  ehChavePixLegada,
  codigoPixUsaChaveLegada,
  formatarChavePix,
} from '../lib/pix.ts';

test('política de inadimplência tem padrão controlado', () => {
  assert.deepEqual(POLITICA_INADIMPLENCIA_PADRAO, {
    meses_atencao: 3,
    meses_bloqueio: 4,
  });
  assert.deepEqual(normalizarPoliticaInadimplencia(), {
    meses_atencao: 3,
    meses_bloqueio: 4,
  });
});

test('política de inadimplência limita números inválidos e intervalos', () => {
  assert.deepEqual(normalizarPoliticaInadimplencia({
    meses_atencao: -20,
    meses_bloqueio: 1,
  }), { meses_atencao: 1, meses_bloqueio: 2 });

  assert.deepEqual(normalizarPoliticaInadimplencia({
    meses_atencao: 100,
    meses_bloqueio: 5.9,
  }), { meses_atencao: 4, meses_bloqueio: 5 });

  assert.deepEqual(normalizarPoliticaInadimplencia({
    meses_atencao: Number.NaN,
    meses_bloqueio: Number.POSITIVE_INFINITY,
  }), { meses_atencao: 3, meses_bloqueio: 4 });
});

test('classificação de atraso respeita os limites configurados', () => {
  assert.equal(classificarMesesAtraso(0), 'verde');
  assert.equal(classificarMesesAtraso(2), 'verde');
  assert.equal(classificarMesesAtraso(3), 'amarelo');
  assert.equal(classificarMesesAtraso(3, { meses_atencao: 2, meses_bloqueio: 5 }), 'amarelo');
  assert.equal(classificarMesesAtraso(4), 'vermelho');
  assert.equal(classificarMesesAtraso(5, { meses_atencao: 2, meses_bloqueio: 5 }), 'vermelho');
});

test('chave PIX Banrisul é centralizada e reconhece formatos de celular', () => {
  assert.equal(CHAVE_PIX_BANRISUL, '+5555991817619');
  assert.equal(formatarChavePix('55991817619'), CHAVE_PIX_BANRISUL_EXIBICAO);
  assert.equal(formatarChavePix('+5555991817619'), CHAVE_PIX_BANRISUL_EXIBICAO);
  assert.equal(formatarChavePix('chave-personalizada'), 'chave-personalizada');
});

test('detecção da chave PIX legada compara os dígitos, não a pontuação', () => {
  assert.equal(ehChavePixLegada(CHAVE_PIX_LEGADA_CNPJ), true);
  assert.equal(ehChavePixLegada('89649164000158'), true);
  assert.equal(ehChavePixLegada('00000000000000'), false);
  assert.equal(codigoPixUsaChaveLegada('BR-CODE-89649164000158-FIM'), true);
  assert.equal(codigoPixUsaChaveLegada('BR-CODE-123-FIM'), false);
});



test('dependente sem categoria de cobrança não entra na geração só por possuir_mensalidade legado', () => {
  const dependente = {
    responsavel_id: 'titular-1',
    categoria: 'Titular',
    tipo_socio: 'dependente_patrimonial_familiar_mensalidade',
    possui_mensalidade: true,
    situacao: 'ativo',
  };
  assert.equal(dependenteTemMensalidade(dependente), false);
  assert.equal(socioElegivelParaMensalidade(dependente), false);
});

test('dependente explicitamente classificado com mensalidade pode ser cobrado', () => {
  const dependente = {
    responsavel_id: 'titular-1',
    categoria: 'Dependente com Mensalidade',
    tipo_socio: 'dependente_patrimonial_familiar_mensalidade',
    possui_mensalidade: true,
    situacao: 'ativo',
  };
  assert.equal(dependenteTemMensalidade(dependente), true);
  assert.equal(socioElegivelParaMensalidade(dependente), true);
});

test('novos dependentes começam em tipo sem mensalidade e podem ser convertidos explicitamente', () => {
  assert.equal(tipoDependenteSemMensalidade('dependente_contribuinte_familiar_mensalidade'), 'dependente_contribuinte_familiar');
  assert.equal(tipoDependenteSemMensalidade('contribuinte_familiar'), 'dependente_contribuinte_familiar');
  assert.equal(tipoDependenteComMensalidade('dependente_contribuinte_familiar'), 'dependente_contribuinte_familiar_mensalidade');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { socioElegivelParaMensalidade } from '../lib/regrasMensalidade.ts';

test('dependente sem mensalidade própria não aparece mesmo com flag legada true e sem responsavel_id', () => {
  for (const nome of ['BRUNO OLIVEIRA BERNARDI', 'Jessica Tais Birck']) {
    assert.equal(socioElegivelParaMensalidade({
      nome,
      categoria: 'Dependente Patrimonial Familiar',
      tipo_socio: 'dependente_patrimonial_familiar',
      possui_mensalidade: true,
      situacao: 'ativo',
    }), false);
  }
});

test('dependente explicitamente classificado com mensalidade própria continua elegível', () => {
  assert.equal(socioElegivelParaMensalidade({
    categoria: 'Dependente Patrimonial com Mensalidade',
    tipo_socio: 'dependente_patrimonial_familiar_mensalidade',
    possui_mensalidade: true,
    situacao: 'ativo',
  }), true);
});

test('titular pagante continua elegível', () => {
  assert.equal(socioElegivelParaMensalidade({
    categoria: 'Patrimonial Familiar',
    tipo_socio: 'patrimonial_familiar',
    possui_mensalidade: true,
    situacao: 'ativo',
  }), true);
});

test('dependente inativo não é elegível', () => {
  assert.equal(socioElegivelParaMensalidade({
    categoria: 'Dependente com Mensalidade',
    tipo_socio: 'dependente_patrimonial_familiar_mensalidade',
    possui_mensalidade: true,
    situacao: 'inativo',
  }), false);
});

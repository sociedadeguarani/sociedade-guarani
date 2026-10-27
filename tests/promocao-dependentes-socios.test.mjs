import test from 'node:test';
import assert from 'node:assert/strict';
import { dependenteFoiPromovidoParaSocio, socioElegivelParaMensalidade } from '../lib/regrasMensalidade.ts';

const tipo = 'dependente_contribuinte_individual_mensalidade';

test('Bernardo e Eduardo ficam elegíveis como Sócios Dependentes com cobrança individual', () => {
  for (const [nome, matricula] of [
    ['Bernardo Madke dos Santos', 'SD0051A'],
    ['Eduardo Madke dos Santos', 'SD0047A'],
  ]) {
    assert.equal(matricula.endsWith('A'), true, `${nome} deve usar a matrícula individual acordada`);
    assert.equal(socioElegivelParaMensalidade({
      nome,
      matricula,
      categoria: 'Dependente com Mensalidade',
      tipo_socio: tipo,
      responsavel_id: 'id-marines',
      possui_mensalidade: true,
      valor_mensalidade: 1,
      situacao: 'ativo',
    }), true);
  }
});

test('dependentes familiares sem classificação explícita de mensalidade continuam fora da cobrança', () => {
  assert.equal(socioElegivelParaMensalidade({
    categoria: 'Dependente',
    tipo_socio: 'dependente_contribuinte_individual',
    responsavel_id: 'id-marines',
    possui_mensalidade: true,
    situacao: 'ativo',
  }), false);
});

test('registro legado vinculado a um sócio promovido é reconhecido para ser ocultado da tela Dependentes', () => {
  assert.equal(dependenteFoiPromovidoParaSocio({ migrado_para_socio_id: 'novo-socio-id' }), true);
  assert.equal(dependenteFoiPromovidoParaSocio({ migrado_para_socio_id: null }), false);
  assert.equal(dependenteFoiPromovidoParaSocio({}), false);
});

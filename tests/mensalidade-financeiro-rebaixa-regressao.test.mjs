import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const api = fs.readFileSync(path.join(root, 'app/api/mensalidades/admin/route.ts'), 'utf8');

test('rebaixa arquiva a receita antiga estornada sem apagar o histórico', () => {
  assert.match(api, /update\(\{ origem_tipo: "mensalidade_estornada" \}\)/);
  assert.match(api, /idsMensalidadesComEstornoReferenciado/);
  assert.match(api, /idsSemEntradaAtivaComEstorno/);
  assert.match(api, /continua no Financeiro[\s\S]*?libera a chave única/);
});

test('rebaixa também arquiva a tarifa anterior para liberar o índice único', () => {
  assert.match(api, /origem_tipo: "tarifa_mensalidade_estornada"/);
  assert.match(api, /data: tarifasExistentes/);
  assert.match(api, /const tarifasAtivasSemCiclo/);
  assert.match(api, /tarifa bancária anterior ainda vinculada/);
});

test('a baixa cria a receita e a tarifa antes de atualizar a mensalidade para paga', () => {
  const start = api.indexOf('if (acao === "baixar")');
  const end = api.indexOf('if (acao === "estornar")', start);
  assert.ok(start >= 0 && end > start);
  const branch = api.slice(start, end);
  const entrada = branch.indexOf('.from("movimentacoes_financeiras")\n          .insert({');
  const tarifa = branch.indexOf('.from("movimentacoes_financeiras")\n            .insert({', entrada + 1);
  const confirmaPago = branch.indexOf('situacao: "pago"', tarifa);
  assert.ok(entrada >= 0, 'a receita deve ser inserida');
  assert.ok(tarifa > entrada, 'a tarifa deve ser inserida depois da receita');
  assert.ok(confirmaPago > tarifa, 'a mensalidade só pode ser marcada paga depois dos movimentos');
});

test('falha na tarifa remove somente a receita provisória recém-criada', () => {
  const start = api.indexOf('if (acao === "baixar")');
  const end = api.indexOf('if (acao === "estornar")', start);
  const branch = api.slice(start, end);
  assert.match(branch, /\.eq\("id", entradaCriada\.id\)/);
  assert.match(branch, /A tarifa bancária não foi registrada/);
});

test('estorno preserva a tarifa anterior e libera a origem para a próxima baixa', () => {
  const start = api.indexOf('if (acao === "estornar")');
  const end = api.indexOf('if (acao === "marcar_sem_saldo")', start);
  const branch = api.slice(start, end);
  assert.match(branch, /\.eq\("origem_tipo", "tarifa_mensalidade"\)/);
  assert.match(branch, /origem_tipo: "tarifa_mensalidade_estornada"/);
  assert.match(branch, /tarifas_arquivadas/);
});

test('a geração em lote permanece disponível na API', () => {
  assert.match(api, /acao === "gerar_lote"/);
});


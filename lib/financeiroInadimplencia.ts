export type SocioInadimplencia = {
  id: string;
  matricula: string | number | null;
  nome: string;
  cpf: string | null;
  foto_url: string | null;
  situacao: string | null;
  ativo: boolean | null;
  responsavel_id: string | null;
  possui_mensalidade: boolean | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  tipo_pagamento: string | null;
  data_associacao: string | null;
  remido: boolean | null;
  tipo_socio: string | null;
  categoria: string | null;
};

export type DependenteInadimplencia = {
  id: string;
  socio_id: string;
  nome: string;
  cpf: string | null;
  ativo: boolean | null;
  possui_mensalidade: boolean | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  tipo_pagamento: string | null;
};

export type MensalidadeInadimplencia = {
  id: string;
  socio_id: string;
  dependente_id: string | null;
  competencia: string | null;
  valor: number | string | null;
  data_vencimento: string | null;
  situacao: string | null;
  data_pagamento: string | null;
};

export type PessoaFinanceiraInadimplencia = {
  chave: string;
  socio_id: string;
  dependente_id: string | null;
  nome: string;
  matricula: string | number | null;
  cpf: string | null;
  foto_url: string | null;
  responsavel_nome: string | null;
  possui_mensalidade: boolean;
  valor_mensalidade: number;
  dia_vencimento: number;
  tipo_pagamento: string;
  data_associacao: string | null;
};

export type ResumoPessoaInadimplencia = {
  pessoa: PessoaFinanceiraInadimplencia;
  meses: number;
  valorDevido: number;
  competencias: string[];
};

function normalizarTexto(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function chaveCompetencia(valor: unknown) {
  if (!valor) return "";
  const bruto = String(valor).slice(0, 10);
  if (/^\d{4}-\d{2}/.test(bruto)) return bruto.slice(0, 7);
  const brasileiro = bruto.match(/^(\d{2})\/(\d{4})$/);
  return brasileiro ? brasileiro[2] + "-" + brasileiro[1] : "";
}

function competenciaPorExtenso(chave: string) {
  const partes = chave.split("-");
  return partes[1] + "/" + partes[0];
}

function vencimentoDaCompetencia(chave: string, dia: number) {
  const partes = chave.split("-").map(Number);
  const ano = partes[0];
  const mes = partes[1];
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const diaValido = Math.min(Math.max(dia || 10, 1), 28, ultimoDia);
  return chave + "-" + String(diaValido).padStart(2, "0");
}

function mensalidadePaga(item: MensalidadeInadimplencia) {
  return Boolean(item.data_pagamento) || new Set([
    "pago", "paga", "paid", "quitado", "quitada", "recebido", "recebida",
    "baixado", "baixada", "compensado", "compensada",
  ]).has(normalizarTexto(item.situacao));
}

function mensalidadeQuitadaOuIsenta(item: MensalidadeInadimplencia) {
  const situacao = normalizarTexto(item.situacao);
  return mensalidadePaga(item) || new Set([
    "isento", "isenta", "cancelado", "cancelada",
  ]).has(situacao);
}

/**
 * Replica a composição de pagadores usada pela aba Inadimplência do Financeiro.
 * Só inclui pessoas ativas e com mensalidade própria e evita duplicar dependentes
 * que já foram migrados para a tabela de sócios.
 */
export function construirPessoasFinanceiras(
  socios: SocioInadimplencia[],
  dependentes: DependenteInadimplencia[],
): PessoaFinanceiraInadimplencia[] {
  const responsaveis = new Map<string, SocioInadimplencia>(
    socios.map((socio) => [socio.id, socio]),
  );
  const cpfsSociosDependentes = new Set(
    socios
      .filter((socio) => Boolean(socio.responsavel_id) && socio.cpf)
      .map((socio) => String(socio.cpf || "").replace(/\D/g, ""))
      .filter(Boolean),
  );
  const resultado: PessoaFinanceiraInadimplencia[] = [];

  for (const socio of socios) {
    const tipoNormalizado = normalizarTexto(socio.tipo_socio);
    const categoriaNormalizada = normalizarTexto(socio.categoria);
    const remido = socio.remido === true || tipoNormalizado.includes("remido") || categoriaNormalizada.includes("remido");
    const temporario = tipoNormalizado.includes("temporada") ||
      categoriaNormalizada.includes("temporada") ||
      tipoNormalizado.includes("transitorio") ||
      categoriaNormalizada.includes("transitorio");

    if (socio.situacao?.toLowerCase() === "inativo" || socio.ativo === false) continue;
    if (remido || temporario || !socio.possui_mensalidade) continue;

    resultado.push({
      chave: "socio:" + socio.id,
      socio_id: socio.id,
      dependente_id: null,
      nome: socio.nome,
      matricula: socio.matricula,
      cpf: socio.cpf,
      foto_url: socio.foto_url,
      responsavel_nome: socio.responsavel_id
        ? responsaveis.get(socio.responsavel_id)?.nome || null
        : null,
      possui_mensalidade: true,
      valor_mensalidade: Number(socio.valor_mensalidade || 0),
      dia_vencimento: Number(socio.dia_vencimento || 10),
      tipo_pagamento: socio.tipo_pagamento || "pix",
      data_associacao: socio.data_associacao || null,
    });
  }

  for (const dependente of dependentes) {
    if (dependente.ativo === false || !dependente.possui_mensalidade) continue;

    const responsavel = responsaveis.get(dependente.socio_id);
    const cpfDependente = dependente.cpf?.replace(/\D/g, "");
    const duplicado = Boolean(cpfDependente && cpfsSociosDependentes.has(cpfDependente));
    if (duplicado) continue;

    resultado.push({
      chave: "dependente:" + dependente.id,
      socio_id: dependente.socio_id,
      dependente_id: dependente.id,
      nome: dependente.nome,
      matricula: responsavel?.matricula || null,
      cpf: dependente.cpf,
      foto_url: null,
      responsavel_nome: responsavel?.nome || null,
      possui_mensalidade: true,
      valor_mensalidade: Number(dependente.valor_mensalidade || 0),
      dia_vencimento: Number(dependente.dia_vencimento || 10),
      tipo_pagamento: dependente.tipo_pagamento || "pix",
      data_associacao: null,
    });
  }

  return resultado;
}

/**
 * Apura cada pagador exatamente por competência, incluindo competências
 * calculadas sem lançamento e a migração de histórico de dependente por CPF.
 */
export function apurarResumoInadimplencia(
  pessoas: PessoaFinanceiraInadimplencia[],
  socios: SocioInadimplencia[],
  dependentes: DependenteInadimplencia[],
  mensalidades: MensalidadeInadimplencia[],
  hoje: string,
): ResumoPessoaInadimplencia[] {
  const pessoasValidas = new Set(pessoas.map((pessoa) => pessoa.chave));
  const sociosPorCpf = new Map<string, SocioInadimplencia>();
  for (const socio of socios) {
    const cpf = String(socio.cpf || "").replace(/\D/g, "");
    if (cpf) sociosPorCpf.set(cpf, socio);
  }
  const dependentesPorId = new Map<string, DependenteInadimplencia>(
    dependentes.map((dependente) => [String(dependente.id), dependente]),
  );

  const lancamentosPorPessoa = new Map<string, MensalidadeInadimplencia[]>();
  for (const mensalidade of mensalidades) {
    let chave = "socio:" + mensalidade.socio_id;
    if (mensalidade.dependente_id) {
      const dependente = dependentesPorId.get(String(mensalidade.dependente_id));
      const cpfDependente = String(dependente?.cpf || "").replace(/\D/g, "");
      const socioMigrado = cpfDependente ? sociosPorCpf.get(cpfDependente) : null;
      if (socioMigrado && pessoasValidas.has("socio:" + socioMigrado.id)) {
        chave = "socio:" + socioMigrado.id;
      } else if (pessoasValidas.has("dependente:" + mensalidade.dependente_id)) {
        chave = "dependente:" + mensalidade.dependente_id;
      }
    }

    if (!pessoasValidas.has(chave)) continue;
    const lista = lancamentosPorPessoa.get(chave);
    if (lista) lista.push(mensalidade);
    else lancamentosPorPessoa.set(chave, [mensalidade]);
  }

  const mesAtual = hoje.slice(0, 7);
  const resultado: ResumoPessoaInadimplencia[] = [];

  for (const pessoa of pessoas) {
    const registros = lancamentosPorPessoa.get(pessoa.chave) || [];
    const inicioCadastral = chaveCompetencia(pessoa.data_associacao);
    const primeiroPago = registros
      .filter(mensalidadePaga)
      .map((item) => chaveCompetencia(item.competencia || item.data_vencimento))
      .filter(Boolean)
      .sort()[0] || "";
    const temDataAssociacao = Boolean(inicioCadastral);
    const inicio = inicioCadastral || primeiroPago;
    const porCompetencia = new Map<string, MensalidadeInadimplencia[]>();

    for (const registro of registros) {
      const chave = chaveCompetencia(registro.competencia || registro.data_vencimento);
      if (!chave) continue;
      const atual = porCompetencia.get(chave) || [];
      atual.push(registro);
      porCompetencia.set(chave, atual);
    }

    const competenciasDevidas: string[] = [];
    let valorDevido = 0;

    if (!inicio) {
      for (const [chave, itens] of porCompetencia) {
        const quitada = itens.some(mensalidadeQuitadaOuIsenta);
        const dataVencimento = itens.find((item) => item.data_vencimento)?.data_vencimento ||
          vencimentoDaCompetencia(chave, pessoa.dia_vencimento);
        if (quitada || dataVencimento >= hoje) continue;
        competenciasDevidas.push(chave);
        valorDevido += Math.max(...itens.map((item) => Number(item.valor || 0)), 0);
      }
    } else {
      const partesInicio = inicio.split("-").map(Number);
      const cursor = new Date(partesInicio[0], partesInicio[1] - 1, 1);
      if (!temDataAssociacao) cursor.setMonth(cursor.getMonth() + 1);

      while (cursor.getFullYear() < 2100) {
        const chave = cursor.getFullYear() + "-" + String(cursor.getMonth() + 1).padStart(2, "0");
        if (chave > mesAtual) break;
        const itens = porCompetencia.get(chave) || [];
        const vencimentoRegistrado = itens.find((item) => item.data_vencimento)?.data_vencimento?.slice(0, 10);
        const vencimento = vencimentoRegistrado || vencimentoDaCompetencia(chave, pessoa.dia_vencimento);
        const [anoVencimento, mesVencimento] = chave.split("-").map(Number);
        const [anoAssociacao, mesAssociacao, diaAssociacao] = String(pessoa.data_associacao || "").slice(0, 10).split("-").map(Number);
        const associacaoDepoisDoVencimento = temDataAssociacao &&
          anoAssociacao === anoVencimento &&
          mesAssociacao === mesVencimento &&
          Number.isFinite(diaAssociacao) &&
          diaAssociacao > Number(vencimento.slice(8, 10));
        const jaVenceu = vencimento < hoje && !associacaoDepoisDoVencimento;
        const quitada = itens.some(mensalidadeQuitadaOuIsenta);

        if (jaVenceu && !quitada) {
          competenciasDevidas.push(chave);
          if (itens.length) {
            valorDevido += Math.max(
              ...itens
                .filter((item) => !mensalidadeQuitadaOuIsenta(item))
                .map((item) => Number(item.valor || 0)),
            );
          } else {
            valorDevido += Number(pessoa.valor_mensalidade || 0);
          }
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    competenciasDevidas.sort();
    const competencias = competenciasDevidas.map(competenciaPorExtenso).reverse();
    resultado.push({
      pessoa,
      meses: competenciasDevidas.length,
      valorDevido: Number(valorDevido.toFixed(2)),
      competencias,
    });
  }

  return resultado;
}

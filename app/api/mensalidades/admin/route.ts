import { NextResponse } from "next/server";

import {
  exigirAdministrador,
  getServiceClient,
} from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const MOTIVOS = [
  "Não debitou — sem saldo",
  "Não debitou — débito não autorizado",
  "Não debitou — conta encerrada",
  "Pagamento não identificado",
  "Acordo",
  "Isento",
  "Outro",
];

const primeiroDia = (ano: number, mes: number) =>
  `${ano}-${String(mes).padStart(2, "0")}-01`;

function dataVencimento(
  competencia: string,
  dia: unknown
) {
  const d = Math.min(
    Math.max(Number(dia || 10), 1),
    28
  );

  return `${competencia.slice(0, 8)}${String(d).padStart(
    2,
    "0"
  )}`;
}

function escolherConfiguracao(
  configuracoes: any[],
  tipoSocio: string,
  competencia: string
) {
  return (configuracoes || [])
    .filter(
      (c: any) =>
        String(c.tipo_socio || "") ===
          String(tipoSocio || "") &&
        c.ativo !== false &&
        String(c.vigencia_inicio || "0000-00-00") <=
          competencia
    )
    .sort((a: any, b: any) =>
      String(b.vigencia_inicio || "").localeCompare(
        String(a.vigencia_inicio || "")
      )
    )[0];
}

/*
 * Define a configuração do dependente com mensalidade.
 *
 * Se o dependente não possui pessoas vinculadas a ele,
 * utiliza a modalidade individual.
 *
 * Se possui pessoas vinculadas a ele,
 * utiliza a modalidade familiar.
 */
function codigoDependenteMensalidade(
  tipoSocio: string,
  possuiFamilia: boolean
) {
  const tipo = String(tipoSocio || "").toLowerCase();

  const patrimonial = tipo.includes("patrimonial");

  if (patrimonial) {
    return possuiFamilia
      ? "dependente_patrimonial_familiar_mensalidade"
      : "dependente_patrimonial_individual_mensalidade";
  }

  return possuiFamilia
    ? "dependente_contribuinte_familiar_mensalidade"
    : "dependente_contribuinte_individual_mensalidade";
}

export async function GET(request: Request) {
  const auth = await exigirAdministrador(request);

  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  try {
    const url = new URL(request.url);

    const ano = Number(
      url.searchParams.get("ano") ||
        new Date().getFullYear()
    );

    const mes = Number(
      url.searchParams.get("mes") || 0
    );

    const db = getServiceClient();

    const {
      data: socios,
      error: erroSocios,
    } = await db
      .from("socios")
      .select(
        "id,matricula,nome,cpf,tipo_socio,responsavel_id,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,situacao,situacao_financeira"
      )
      .order("nome");

    if (erroSocios) {
      throw erroSocios;
    }

    let consulta = db
      .from("mensalidades")
      .select("*")
      .gte(
        "competencia",
        `${ano}-01-01`
      )
      .lt(
        "competencia",
        `${ano + 1}-01-01`
      )
      .order("competencia", {
        ascending: true,
      });

    if (mes >= 1 && mes <= 12) {
      consulta = consulta.eq(
        "competencia",
        primeiroDia(ano, mes)
      );
    }

    const {
      data: mensalidades,
      error: erroMensalidades,
    } = await consulta;

    if (erroMensalidades) {
      throw erroMensalidades;
    }

    const {
      data: configuracoes,
      error: erroConfiguracoes,
    } = await db
      .from("configuracoes_mensalidades")
      .select("*")
      .order("vigencia_inicio", {
        ascending: false,
      });

    if (erroConfiguracoes) {
      throw erroConfiguracoes;
    }

    const mapaSocios = new Map<string, any>(
      (socios || []).map((s: any) => [
        String(s.id),
        s,
      ])
    );

    const mensalidadesComSocio = (
      mensalidades || []
    ).map((m: any) => ({
      ...m,
      socio:
        mapaSocios.get(String(m.socio_id)) ||
        null,
    }));

    return NextResponse.json({
      socios: socios || [],
      mensalidades: mensalidadesComSocio,
      configuracoes: configuracoes || [],
      motivos: MOTIVOS,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Erro ao carregar mensalidades.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await exigirAdministrador(request);

  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  try {
    const body = await request.json();

    const db = getServiceClient();

    const acao = String(
      body.acao || body.action || ""
    );

    /*
     * =====================================================
     * GERAR COMPETÊNCIA
     * =====================================================
     */
    if (
      acao === "gerar" ||
      acao === "gerar_mes"
    ) {
      const ano = Number(body.ano);
      const mes = Number(body.mes);

      if (
        !Number.isInteger(ano) ||
        !Number.isInteger(mes) ||
        mes < 1 ||
        mes > 12
      ) {
        return NextResponse.json(
          {
            error:
              "Ano ou competência inválidos.",
          },
          { status: 400 }
        );
      }

      const competencia = primeiroDia(
        ano,
        mes
      );

      const agora = new Date();

      const inicioMesAtual = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        1
      );

      const inicioMesAlvo = new Date(
        ano,
        mes - 1,
        1
      );

      if (
        inicioMesAlvo > inicioMesAtual
      ) {
        return NextResponse.json(
          {
            error:
              "Não é permitido gerar mensalidades de meses futuros.",
          },
          { status: 400 }
        );
      }

      /*
       * Buscamos TODOS os sócios.
       *
       * Isso é importante porque:
       *
       * - titular com mensalidade gera cobrança;
       * - dependente com mensalidade gera cobrança;
       * - dependente sem mensalidade não gera cobrança.
       */
      const {
        data: socios,
        error: erroSocios,
      } = await db
        .from("socios")
        .select(
          "id,nome,tipo_socio,responsavel_id,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,situacao,ativo"
        )
        .eq(
          "possui_mensalidade",
          true
        );

      if (erroSocios) {
        throw erroSocios;
      }

      /*
       * Todos os registros com mensalidade habilitada
       * podem gerar cobrança.
       *
       * Dependentes sem mensalidade já foram filtrados
       * pelo banco.
       */
      const cobraveis = (
        socios || []
      ).filter(
        (s: any) =>
          String(
            s.situacao || ""
          ).toLowerCase() !== "inativo" &&
          s.ativo !== false
      );

      /*
       * Busca todas as pessoas da tabela para descobrir
       * se um dependente com mensalidade possui uma
       * família própria.
       */
      const {
        data: todosSocios,
        error: erroTodosSocios,
      } = await db
        .from("socios")
        .select(
          "id,responsavel_id,tipo_socio,possui_mensalidade"
        );

      if (erroTodosSocios) {
        throw erroTodosSocios;
      }

      /*
       * Configurações dos valores.
       */
      const {
        data: configuracoes,
        error: erroConfiguracoes,
      } = await db
        .from("configuracoes_mensalidades")
        .select("*")
        .eq("ativo", true)
        .order("vigencia_inicio", {
          ascending: false,
        });

      if (erroConfiguracoes) {
        throw erroConfiguracoes;
      }

      /*
       * Mensalidades que já existem para a competência.
       *
       * Isso evita duplicação.
       */
      const {
        data: existentes,
        error: erroExistentes,
      } = await db
        .from("mensalidades")
        .select("socio_id")
        .eq(
          "competencia",
          competencia
        );

      if (erroExistentes) {
        throw erroExistentes;
      }

      const idsExistentes = new Set<string>(
        (existentes || []).map(
          (x: any) =>
            String(x.socio_id)
        )
      );

      /*
       * Geração.
       */
      const novos = cobraveis
        .filter(
          (s: any) =>
            !idsExistentes.has(
              String(s.id)
            )
        )
        .map((s: any) => {
          const ehDependente =
            Boolean(
              s.responsavel_id
            );

          let config: any = null;

          /*
           * TITULAR
           *
           * Usa diretamente o tipo cadastrado.
           */
          if (!ehDependente) {
            config =
              escolherConfiguracao(
                configuracoes || [],
                s.tipo_socio,
                competencia
              );
          }

          /*
           * DEPENDENTE COM MENSALIDADE
           *
           * Descobrimos se ele possui pessoas
           * vinculadas diretamente a ele.
           */
          if (ehDependente) {
            const possuiFamilia =
              (todosSocios || []).some(
                (p: any) =>
                  String(
                    p.responsavel_id || ""
                  ) ===
                  String(s.id)
              );

            const codigo =
              codigoDependenteMensalidade(
                s.tipo_socio,
                possuiFamilia
              );

            config =
              escolherConfiguracao(
                configuracoes || [],
                codigo,
                competencia
              );
          }

          /*
           * Se houver configuração cadastrada,
           * ela tem prioridade.
           *
           * Caso contrário usamos o valor já
           * cadastrado no sócio.
           */
          const valor =
            config?.valor !== undefined
              ? Number(
                  config.valor || 0
                )
              : Number(
                  s.valor_mensalidade ||
                    0
                );

          const dia =
            config?.dia_vencimento
              ? Number(
                  config.dia_vencimento
                )
              : Number(
                  s.dia_vencimento || 10
                );

          const tipoPagamento =
            s.tipo_pagamento ||
            config?.tipo_pagamento ||
            null;

          return {
            socio_id: s.id,
            competencia,
            valor,
            data_vencimento:
              dataVencimento(
                competencia,
                dia
              ),
            situacao:
              valor === 0
                ? "isento"
                : "em_aberto",
            tipo_pagamento:
              tipoPagamento,
          };
        });

      if (novos.length > 0) {
        const {
          error: erroInsert,
        } = await db
          .from("mensalidades")
          .insert(novos);

        if (erroInsert) {
          throw erroInsert;
        }
      }

      return NextResponse.json({
        ok: true,
        criadas: novos.length,
        message:
          novos.length > 0
            ? `${novos.length} mensalidade(s) gerada(s).`
            : "Nenhuma nova mensalidade foi gerada. Os registros já existem.",
      });
    }

    /*
     * =====================================================
     * BAIXA EM LOTE
     * =====================================================
     */
    if (acao === "baixar") {
      const ids: string[] =
        Array.isArray(body.ids)
          ? body.ids.map(
              (id: unknown) =>
                String(id)
            )
          : [];

      if (ids.length === 0) {
        return NextResponse.json(
          {
            error:
              "Selecione ao menos uma mensalidade.",
          },
          { status: 400 }
        );
      }

      const dataPagamento =
        body.data_pagamento ||
        new Date()
          .toISOString()
          .slice(0, 10);

      const tipoPagamento =
        body.tipo_pagamento ||
        "dinheiro";

      const {
        data: registros,
        error: erroBusca,
      } = await db
        .from("mensalidades")
        .select(
          "id,socio_id,situacao"
        )
        .in("id", ids);

      if (erroBusca) {
        throw erroBusca;
      }

      const idsJaPagos: string[] =
        (registros || [])
          .filter(
            (x: any) =>
              x.situacao === "pago"
          )
          .map((x: any) =>
            String(x.id)
          );

      const idsParaBaixar: string[] =
        ids.filter(
          (id: string) =>
            !idsJaPagos.includes(id)
        );

      if (
        idsParaBaixar.length === 0
      ) {
        return NextResponse.json({
          ok: true,
          baixadas: 0,
          message:
            "As mensalidades selecionadas já estão pagas.",
        });
      }

      const {
        error: erroBaixa,
      } = await db
        .from("mensalidades")
        .update({
          situacao: "pago",
          data_pagamento:
            dataPagamento,
          tipo_pagamento:
            tipoPagamento,
          observacoes:
            body.observacoes || null,
        })
        .in(
          "id",
          idsParaBaixar
        );

      if (erroBaixa) {
        throw erroBaixa;
      }

      return NextResponse.json({
        ok: true,
        baixadas:
          idsParaBaixar.length,
        ignoradas:
          idsJaPagos.length,
        message:
          `${idsParaBaixar.length} mensalidade(s) baixada(s).`,
      });
    }

    /*
     * =====================================================
     * ATUALIZAR MENSALIDADE
     * =====================================================
     */
    if (acao === "atualizar") {
      const id = String(
        body.id || ""
      );

      if (!id) {
        return NextResponse.json(
          {
            error:
              "Mensalidade não informada.",
          },
          { status: 400 }
        );
      }

      const patch: Record<
        string,
        unknown
      > = {};

      const campos = [
        "situacao",
        "valor",
        "data_pagamento",
        "tipo_pagamento",
        "observacoes",
        "motivo",
        "data_ocorrencia",
      ];

      for (const campo of campos) {
        if (
          body[campo] !== undefined
        ) {
          patch[campo] =
            body[campo] === ""
              ? null
              : body[campo];
        }
      }

      const {
        error,
      } = await db
        .from("mensalidades")
        .update(patch)
        .eq("id", id);

      if (error) {
        throw error;
      }

      return NextResponse.json({
        ok: true,
        message:
          "Mensalidade atualizada.",
      });
    }

    /*
     * =====================================================
     * CRIAR CONFIGURAÇÃO
     * =====================================================
     */
    if (
      acao === "config_criar"
    ) {
      const tipoSocio =
        String(
          body.tipo_socio || ""
        ).trim();

      const nome =
        String(
          body.nome || ""
        ).trim();

      const valor = Number(
        body.valor || 0
      );

      const vigenciaInicio =
        String(
          body.vigencia_inicio ||
            new Date()
              .toISOString()
              .slice(0, 10)
        );

      if (
        !tipoSocio ||
        !nome
      ) {
        return NextResponse.json(
          {
            error:
              "Informe o tipo e o nome da mensalidade.",
          },
          { status: 400 }
        );
      }

      const {
        data,
        error,
      } = await db
        .from(
          "configuracoes_mensalidades"
        )
        .insert({
          tipo_socio: tipoSocio,
          nome,
          valor,
          vigencia_inicio:
            vigenciaInicio,
          ativo: true,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({
        ok: true,
        config: data,
        message:
          "Configuração criada com sucesso.",
      });
    }

    /*
     * =====================================================
     * EDITAR CONFIGURAÇÃO
     * =====================================================
     */
    if (
      acao === "config_editar"
    ) {
      const id = String(
        body.id || ""
      );

      if (!id) {
        return NextResponse.json(
          {
            error:
              "Configuração não informada.",
          },
          { status: 400 }
        );
      }

      const dados: Record<
        string,
        unknown
      > = {};

      if (
        body.tipo_socio !==
        undefined
      ) {
        dados.tipo_socio =
          body.tipo_socio;
      }

      if (
        body.nome !== undefined
      ) {
        dados.nome =
          body.nome;
      }

      if (
        body.valor !== undefined
      ) {
        dados.valor = Number(
          body.valor || 0
        );
      }

      if (
        body.vigencia_inicio !==
        undefined
      ) {
        dados.vigencia_inicio =
          body.vigencia_inicio;
      }

      dados.updated_at =
        new Date().toISOString();

      const {
        data,
        error,
      } = await db
        .from(
          "configuracoes_mensalidades"
        )
        .update(dados)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({
        ok: true,
        config: data,
        message:
          "Configuração atualizada com sucesso.",
      });
    }

    return NextResponse.json(
      {
        error:
          "Operação inválida.",
      },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Erro ao processar mensalidades.",
      },
      { status: 500 }
    );
  }
}

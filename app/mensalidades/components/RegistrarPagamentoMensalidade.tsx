"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { X } from "lucide-react";

type Conta = {
  id: string;
  nome: string;
  banco?: string | null;
};

type Mensalidade = {
  id: string;
  socio_id: string;
  competencia: string;
  valor: number;
  valor_base?: number | null;
  tarifa_pagamento?: number | null;
  multa?: number | null;
  juros?: number | null;
  desconto?: number | null;
  total_cobrado?: number | null;
  data_vencimento: string | null;
  situacao: string | null;
  data_pagamento: string | null;
  tipo_pagamento: string | null;
  conta_pagadora_id?: string | null;
  comprovante_url?: string | null;
  observacoes?: string | null;
  socio?: {
    nome?: string | null;
    matricula?: string | number | null;
    tipo_pagamento?: string | null;
    conta_bancaria_id?: string | null;
  } | null;
};

const FORMAS: Array<{ value: string; label: string; descricao: string }> = [
  { value: "pix", label: "PIX", descricao: "Pagamento instantâneo" },
  { value: "dinheiro", label: "Dinheiro", descricao: "Recebido na Sociedade" },
  { value: "transferencia", label: "Transferência", descricao: "Transferência bancária" },
  { value: "debito_em_conta", label: "Débito em conta", descricao: "Débito bancário" },
  { value: "boleto", label: "Boleto", descricao: "Pagamento por boleto" },
  { value: "outro", label: "Outro", descricao: "Outra forma" },
];

function moeda(v: number | null | undefined) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function competencia(v: string) {
  const p = String(v || "").slice(0, 7).split("-");
  return p.length === 2 ? `${p[1]}/${p[0]}` : v;
}

function dataBR(v: string | null) {
  if (!v) return "—";
  const p = v.slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v;
}

export default function RegistrarPagamentoMensalidade({
  registro,
  contas,
  onClose,
  onSuccess,
  onError,
}: {
  registro: Mensalidade | null;
  contas: Conta[];
  onClose: () => void;
  onSuccess: (message: string) => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const formaOriginal = String(registro?.tipo_pagamento || registro?.socio?.tipo_pagamento || "")
    .toLowerCase()
    .trim();
  const formaInicial = ["pix", "dinheiro", "transferencia", "debito_em_conta", "boleto", "outro"].includes(formaOriginal)
    ? formaOriginal
    : ["banrisul", "sicredi", "bb", "debito", "debito_em_conta_bancaria"].includes(formaOriginal)
      ? "debito_em_conta"
      : "pix";

  const [formaPagamento, setFormaPagamento] = useState(formaInicial);
  const [contaId, setContaId] = useState(
    formaInicial === "debito_em_conta"
      ? String(registro?.conta_pagadora_id || registro?.socio?.conta_bancaria_id || "")
      : ""
  );
  const [dataPagamento, setDataPagamento] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [observacoes, setObservacoes] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  const total = useMemo(
    () =>
      Number(
        registro?.total_cobrado ?? registro?.valor_base ?? registro?.valor ?? 0
      ),
    [registro]
  );

  if (!registro) return null;

  const registroAtual = registro;

  async function confirmarPagamento() {
    if (salvando) return;

    if (!contaId) {
      onError("Selecione a conta da Sociedade que recebeu o pagamento.");
      return;
    }

    setSalvando(true);
    onError("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão não encontrada.");

      let comprovanteUrl = registroAtual!.comprovante_url || null;

      if (arquivo) {
        const ext = arquivo.name.split(".").pop()?.toLowerCase() || "bin";
        const caminho = `mensalidades/pagamento-${registroAtual!.id}-${Date.now()}.${ext}`;

        const upload = await supabase.storage
          .from("comprovantes-financeiro")
          .upload(caminho, arquivo, {
            upsert: true,
            contentType: arquivo.type || "application/octet-stream",
          });

        if (upload.error) throw upload.error;
        comprovanteUrl = caminho;
      }

      const response = await fetch("/api/mensalidades/admin", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acao: "baixar",
          ids: [registroAtual!.id],
          data_pagamento: dataPagamento,
          tipo_pagamento: formaPagamento,
          conta_recebimento_id: contaId,
          comprovante_url: comprovanteUrl,
          observacoes: observacoes || null,
        }),
      });

      const resultado = await response.json();
      if (!response.ok) {
        throw new Error(resultado.error || "Não foi possível registrar o pagamento.");
      }

      await onSuccess(
        `Pagamento de ${moeda(total)} registrado como ${
          FORMAS.find((item) => item.value === formaPagamento)?.label || formaPagamento
        }.`
      );
      onClose();
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar o pagamento."
      );
    } finally {
      setSalvando(false);
    }
  }

  function selecionarArquivo(event: ChangeEvent<HTMLInputElement>) {
    const novoArquivo = event.target.files?.[0] || null;
    setArquivo(novoArquivo);
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Registrar recebimento
            </p>
            <h2 className="text-xl font-black text-[#005a3c] sm:text-2xl">
              {registro.socio?.nome || "Associado"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {registro.socio?.matricula || "Sem matrícula"} · competência {competencia(registro.competencia)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#eef7f2] p-4">
              <p className="text-xs font-bold uppercase text-gray-500">Valor</p>
              <p className="mt-1 text-xl font-black text-[#005a3c]">{moeda(total)}</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase text-gray-500">Vencimento</p>
              <p className="mt-1 font-black text-gray-800">{dataBR(registro.data_vencimento)}</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase text-gray-500">Cobrança original</p>
              <p className="mt-1 font-black text-gray-800">
                {registro.tipo_pagamento || registro.socio?.tipo_pagamento || "Não definida"}
              </p>
            </div>
          </div>

          <section>
            <div className="mb-3">
              <h3 className="font-black text-[#005a3c]">Como o associado pagou?</h3>
              <p className="text-xs text-gray-500">
                Você pode trocar a forma original da cobrança no momento da baixa.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {FORMAS.map((forma) => {
                const ativo = formaPagamento === forma.value;
                return (
                  <button
                    type="button"
                    key={forma.value}
                    onClick={() => setFormaPagamento(forma.value)}
                    className={`rounded-2xl border-2 p-4 text-left transition ${
                      ativo
                        ? "border-[#005a3c] bg-[#eef7f2]"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-black text-[#005a3c]">{forma.label}</div>
                    <div className="mt-1 text-xs text-gray-500">{forma.descricao}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-2 block text-sm font-bold text-gray-700">Data do pagamento</span>
              <input
                type="date"
                value={dataPagamento}
                onChange={(event) => setDataPagamento(event.target.value)}
                className="w-full rounded-xl border border-[#d5e0da] px-4 py-3"
              />
            </label>

            <label>
              <span className="mb-2 block text-sm font-bold text-gray-700">Conta que recebeu</span>
              <select
                value={contaId}
                onChange={(event) => setContaId(event.target.value)}
                className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3"
              >
                <option value="">Selecione a conta...</option>
                {contas.map((conta) => (
                  <option key={conta.id} value={conta.id}>
                    {conta.nome}{conta.banco ? ` — ${conta.banco}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            <span className="mb-2 block text-sm font-bold text-gray-700">
              Comprovante {formaPagamento === "pix" ? "(recomendado)" : "(opcional)"}
            </span>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={selecionarArquivo}
              className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 text-sm"
            />
            {arquivo && (
              <p className="mt-1 text-xs font-semibold text-[#005a3c]">
                Arquivo selecionado: {arquivo.name}
              </p>
            )}
          </label>

          <label>
            <span className="mb-2 block text-sm font-bold text-gray-700">Observações</span>
            <textarea
              rows={3}
              value={observacoes}
              onChange={(event) => setObservacoes(event.target.value)}
              placeholder="Ex.: pagamento recebido via PIX, conferido no extrato."
              className="w-full rounded-xl border border-[#d5e0da] px-4 py-3"
            />
          </label>

          <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">
            <b>Financeiro:</b> a receita da mensalidade será lançada na conta selecionada. Se houver tarifa configurada para a forma de pagamento, ela será registrada separadamente.
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-gray-50 p-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className="rounded-xl border bg-white px-5 py-3 font-bold text-gray-700 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void confirmarPagamento()}
            disabled={salvando || !contaId}
            className="rounded-xl bg-[#005a3c] px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {salvando ? "Registrando..." : "✓ Confirmar pagamento e dar baixa"}
          </button>
        </div>
      </div>
    </div>
  );
}

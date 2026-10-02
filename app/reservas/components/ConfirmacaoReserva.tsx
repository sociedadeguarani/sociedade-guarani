"use client";

import { ArrowLeft, Check, Copy, ShieldCheck } from "lucide-react";
import type { ContaBancaria, FormaPagamentoReserva, PixConfig, TipoPessoa } from "../types";
import { dataBR, moeda } from "../utils";

interface Props {
  tipoPessoa: TipoPessoa;
  espacoNome: string;
  data: string;
  horario: string;
  nome: string;
  matricula: number | string | null;
  valor: number;
  publico: boolean;
  formaPagamento: FormaPagamentoReserva;
  pix: PixConfig | null;
  copiado: boolean;
  arquivo: File | null;
  contasBancarias: ContaBancaria[];
  contaBancariaId: string;
  enviando: boolean;
  onVoltar: () => void;
  onFormaPagamento: (value: FormaPagamentoReserva) => void;
  onContaBancaria: (value: string) => void;
  onArquivo: (file: File | null) => void;
  onCopiarPix: () => void;
  onCopiarResumo: () => void;
  onConfirmar: () => void;
}

export default function ConfirmacaoReserva({
  tipoPessoa,
  espacoNome,
  data,
  horario,
  nome,
  matricula,
  valor,
  publico,
  formaPagamento,
  pix,
  copiado,
  arquivo,
  contasBancarias,
  contaBancariaId,
  enviando,
  onVoltar,
  onFormaPagamento,
  onContaBancaria,
  onArquivo,
  onCopiarPix,
  onCopiarResumo,
  onConfirmar,
}: Props) {
  const aceitaPagamento = valor > 0 && !publico;
  const mostraPix = valor > 0 && formaPagamento === "pix";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="overflow-y-auto p-6">
          <button onClick={onVoltar} className="mb-4 font-bold text-gray-500">
            <ArrowLeft className="mr-1 inline h-4 w-4" />Voltar
          </button>
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f3ee] text-[#005a3c]">
            <ShieldCheck />
          </div>
          <h2 className="text-2xl font-extrabold text-[#005a3c]">Confirmar reserva</h2>

          <div className="mt-5 space-y-3 rounded-xl bg-[#f8faf9] p-4 text-sm">
            <div className="flex justify-between gap-3"><span>Tipo</span><b>{tipoPessoa === "socio" ? "Sócio" : "Não sócio"}</b></div>
            <div className="flex justify-between gap-3"><span>Espaço</span><b className="text-right">{espacoNome || "—"}</b></div>
            <div className="flex justify-between gap-3"><span>Data</span><b>{dataBR(data)}</b></div>
            <div className="flex justify-between gap-3"><span>Horário</span><b>{horario}</b></div>
            <div className="flex justify-between gap-3"><span>Responsável</span><b className="text-right">{nome}</b></div>
            {matricula && <div className="flex justify-between gap-3"><span>Matrícula</span><b>{matricula}</b></div>}
            <div className="flex justify-between gap-3"><span>Valor</span><b className="text-[#005a3c]">{moeda(valor)}</b></div>
          </div>

          {aceitaPagamento && (
            <div className="mt-5 rounded-2xl border border-[#cfe3d8] bg-white p-4">
              <b className="text-[#005a3c]">Forma de pagamento</b>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onFormaPagamento("pix")}
                  className={`rounded-xl border px-4 py-3 text-sm font-extrabold ${formaPagamento === "pix" ? "border-[#005a3c] bg-[#e8f3ee] text-[#005a3c]" : "bg-white text-gray-600"}`}
                >
                  PIX
                </button>
                <button
                  type="button"
                  onClick={() => onFormaPagamento("dinheiro")}
                  className={`rounded-xl border px-4 py-3 text-sm font-extrabold ${formaPagamento === "dinheiro" ? "border-[#005a3c] bg-[#e8f3ee] text-[#005a3c]" : "bg-white text-gray-600"}`}
                >
                  Dinheiro
                </button>
              </div>
            </div>
          )}

          {aceitaPagamento && formaPagamento === "dinheiro" && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <label className="text-sm font-bold text-amber-900" htmlFor="conta-reserva">
                Conta/caixa que recebeu o dinheiro
              </label>
              <select
                id="conta-reserva"
                value={contaBancariaId}
                onChange={(e) => onContaBancaria(e.target.value)}
                className="mt-2 w-full rounded-xl border bg-white px-3 py-3 text-sm"
              >
                <option value="">Selecione...</option>
                {contasBancarias.map((conta) => (
                  <option key={conta.id} value={conta.id}>
                    {conta.nome}{conta.banco ? ` — ${conta.banco}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mostraPix && (
            <div className="mt-5 rounded-2xl border border-[#b9dcca] bg-[#e8f3ee] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <b className="text-[#005a3c]">Pagamento via PIX</b>
                  <p className="mt-1 text-xs text-gray-600">Faça o pagamento e anexe o comprovante antes de confirmar.</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[#005a3c]">{moeda(valor)}</span>
              </div>

              {!pix?.copia_e_cola ? (
                <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                  O PIX da Sociedade não está configurado para este valor. Configure a chave PIX ou selecione Dinheiro.
                </div>
              ) : (
                <>
                  <div className="mt-3 rounded-xl bg-white p-3 text-sm">
                    <div className="text-xs text-gray-500">Chave PIX</div>
                    <div className="break-all font-bold">{pix.chave_pix || "—"}</div>
                    {pix.nome_recebedor && <div className="mt-1 text-xs text-gray-500">{pix.nome_recebedor}{pix.cidade ? ` · ${pix.cidade}` : ""}</div>}
                  </div>
                  <div className="mt-3 rounded-xl bg-white p-3">
                    <div className="text-xs font-bold uppercase text-gray-500">PIX copia e cola</div>
                    <textarea readOnly value={pix.copia_e_cola} rows={5} className="mt-2 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-5 text-gray-700 outline-none" aria-label="PIX copia e cola" />
                    <button type="button" onClick={onCopiarPix} className="mt-2 w-full rounded-xl bg-[#005a3c] px-4 py-2.5 font-bold text-white">
                      {copiado ? "✓ PIX copia e cola copiado" : "📋 Copiar PIX copia e cola"}
                    </button>
                  </div>
                  <label className="mt-3 block cursor-pointer rounded-xl border-2 border-dashed border-[#9cc8b1] bg-white p-4 text-center">
                    <span className="block text-sm font-bold text-[#005a3c]">📎 Anexar comprovante</span>
                    <span className="mt-1 block text-xs text-gray-500">JPG, PNG, WEBP ou PDF — até 8 MB</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-3 w-full text-sm" onChange={(e) => onArquivo(e.target.files?.[0] || null)} />
                  </label>
                  {arquivo && <div className="mt-2 text-xs font-semibold text-[#005a3c]">Arquivo: {arquivo.name}</div>}
                </>
              )}
            </div>
          )}

          <div className="sticky bottom-0 mt-5 flex gap-2 border-t bg-white pt-4">
            <button onClick={onCopiarResumo} className="flex-1 rounded-xl border px-4 py-3 font-bold">
              {copiado ? <><Check className="mr-1 inline h-4 w-4" />Copiado</> : <><Copy className="mr-1 inline h-4 w-4" />Copiar resumo</>}
            </button>
            <button onClick={onConfirmar} disabled={enviando} className="flex-1 rounded-xl bg-[#005a3c] px-4 py-3 font-extrabold text-white disabled:opacity-50">
              {enviando ? "Enviando..." : "OK — Confirmar reserva"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

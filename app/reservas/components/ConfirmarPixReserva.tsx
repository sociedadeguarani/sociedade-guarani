"use client";

import { CheckCircle2, Paperclip, X } from "lucide-react";
import type { ContaBancaria, Reserva } from "../types";
import { dataBR, moeda } from "../utils";

interface Props {
  reserva: Reserva;
  espacoNome: string;
  contasBancarias: ContaBancaria[];
  contaBancariaId: string;
  salvando: boolean;
  arquivo: File | null;
  onArquivo: (value: File | null) => void;
  onContaBancaria: (value: string) => void;
  onConfirmar: () => void;
  onFechar: () => void;
}

export default function ConfirmarPixReserva({
  reserva,
  espacoNome,
  contasBancarias,
  contaBancariaId,
  salvando,
  arquivo,
  onArquivo,
  onContaBancaria,
  onConfirmar,
  onFechar,
}: Props) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#001f16]/60 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e8f3ee] text-[#005a3c]"><CheckCircle2 className="h-6 w-6" /></div>
            <h2 className="mt-4 text-2xl font-extrabold text-[#005a3c]">Confirmar PIX</h2>
            <p className="mt-1 text-sm text-gray-500">Confirme somente depois de verificar o crédito e o comprovante.</p>
          </div>
          <button type="button" onClick={onFechar} className="rounded-full bg-gray-100 p-2 text-gray-500" title="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-5 space-y-2 rounded-2xl bg-[#f8faf9] p-4 text-sm">
          <div className="flex justify-between gap-3"><span>Responsável</span><b className="text-right">{reserva.nome}</b></div>
          {reserva.matricula && <div className="flex justify-between gap-3"><span>Matrícula</span><b>{reserva.matricula}</b></div>}
          <div className="flex justify-between gap-3"><span>Espaço</span><b className="text-right">{espacoNome}</b></div>
          <div className="flex justify-between gap-3"><span>Data</span><b>{dataBR(reserva.data)}</b></div>
          <div className="flex justify-between gap-3"><span>Horário</span><b>{reserva.horario}</b></div>
          <div className="flex justify-between gap-3 border-t pt-3"><span>Valor</span><b className="text-lg text-[#005a3c]">{moeda(reserva.valor)}</b></div>
        </div>

        {reserva.comprovante_url ? (
          <div className="mt-4 rounded-xl border border-[#b9dcca] bg-[#e8f3ee] p-3 text-sm">
            <b className="text-[#005a3c]">Comprovante anexado.</b>
            <div className="mt-1 text-gray-600">Você pode conferir o arquivo na lista antes de confirmar.</div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            Esta reserva ainda não possui comprovante. Você pode anexá-lo aqui antes de confirmar o PIX.
          </div>
        )}

        {!reserva.comprovante_url && (
          <label className="mt-4 block cursor-pointer rounded-2xl border-2 border-dashed border-[#cfe3d8] bg-[#f8fbf9] p-4 hover:bg-[#f1f8f4]">
            <span className="flex items-center gap-2 font-bold text-[#005a3c]"><Paperclip className="h-4 w-4" /> Anexar comprovante agora</span>
            <span className="mt-1 block text-xs text-gray-500">JPG, PNG, WEBP ou PDF — até 8 MB.</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-3 block w-full text-sm" onChange={(e) => onArquivo(e.target.files?.[0] || null)} disabled={salvando} />
            {arquivo && <span className="mt-2 block text-xs font-semibold text-[#005a3c]">Selecionado: {arquivo.name}</span>}
          </label>
        )}

        <label className="mt-4 block text-sm font-bold text-gray-700">Conta bancária que recebeu o PIX
          <select value={contaBancariaId} onChange={(e) => onContaBancaria(e.target.value)} className="mt-2 w-full rounded-xl border bg-white px-3 py-3 font-normal">
            <option value="">Selecione...</option>
            {contasBancarias.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}{conta.banco ? ` — ${conta.banco}` : ""}</option>)}
          </select>
        </label>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onFechar} className="flex-1 rounded-xl border px-4 py-3 font-bold">Cancelar</button>
          <button type="button" onClick={onConfirmar} disabled={salvando || !contaBancariaId || (!reserva.comprovante_url && !arquivo)} className="flex-1 rounded-xl bg-[#005a3c] px-4 py-3 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">{salvando ? "Confirmando..." : "Confirmar PIX"}</button>
        </div>
      </div>
    </div>
  );
}

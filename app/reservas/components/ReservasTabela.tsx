"use client";

import { Trash2, Users } from "lucide-react";
import type { Espaco, Reserva, ReservaStatus, Recibo } from "../types";
import { dataBR, moeda } from "../utils";

interface Props {
  filtradas: Reserva[];
  espacos: Espaco[];
  reservasHoje: number;
  confirmadas: number;
  pendentes: number;
  canceladas: number;
  busca: string;
  filtroStatus: "todos" | ReservaStatus;
  filtroData: string;
  onBusca: (value: string) => void;
  onFiltroStatus: (value: "todos" | ReservaStatus) => void;
  onFiltroData: (value: string) => void;
  onLimparFiltros: () => void;
  onComprovante: (path: string) => void;
  onEditar: (reserva: Reserva) => void;
  onCancelar: (id: string) => void;
  onRecibo: (recibo: Recibo) => void;
  onConfirmarPix: (reserva: Reserva) => void;
  podeConfirmarPix: boolean;
  operadorAtual: () => Promise<string>;
}

export default function ReservasTabela(props: Props) {
  const {
    filtradas,
    espacos,
    reservasHoje,
    confirmadas,
    pendentes,
    canceladas,
    busca,
    filtroStatus,
    filtroData,
    onBusca,
    onFiltroStatus,
    onFiltroData,
    onLimparFiltros,
    onComprovante,
    onEditar,
    onCancelar,
    onRecibo,
    onConfirmarPix,
    podeConfirmarPix,
    operadorAtual,
  } = props;

  const espacoNome = (id: string) => espacos.find((e) => e.id === id)?.nome || "Espaço não encontrado";

  const abrirRecibo = async (r: Reserva) => {
    const operador = await operadorAtual();
    onRecibo({
      id: r.id,
      numero: `RS-${r.id.slice(0, 6).toUpperCase()}`,
      tipo: "Reserva de espaço",
      nome: r.nome,
      matricula: r.matricula ?? null,
      detalhe: `Espaço: ${espacoNome(r.espacoId)}`,
      periodo: `${dataBR(r.data)} — ${r.horario}`,
      valor: Number(r.valor || 0),
      pagamento: r.pagamento === "pix" ? "PIX" : r.pagamento === "dinheiro" ? "Dinheiro" : r.pagamento,
      status: r.status === "confirmada" ? "Pago" : r.status === "pendente" ? "Pendente" : "Cancelado",
      operador,
      dataHora: new Date().toLocaleString("pt-BR"),
    });
  };

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Hoje", reservasHoje, "bg-[#e8f3ee]"],
          ["Confirmadas", confirmadas, "bg-blue-50"],
          ["Pendentes", pendentes, "bg-yellow-50"],
          ["Canceladas", canceladas, "bg-red-50"],
        ].map(([label, value, fundo]) => (
          <div key={String(label)} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${fundo}`}>{label}</div>
            <div className="mt-2 text-2xl font-extrabold text-[#005a3c]">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-extrabold text-[#005a3c]">Reservas cadastradas</h2>
            <p className="text-sm text-gray-500">Consulte, filtre e acompanhe as reservas.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center gap-2 rounded-xl border px-3">
              <Users className="h-4 w-4" />
              <input value={busca} onChange={(e) => onBusca(e.target.value)} placeholder="Buscar responsável ou espaço..." className="w-full min-w-0 py-2 outline-none" />
            </div>
            <select value={filtroStatus} onChange={(e) => onFiltroStatus(e.target.value as "todos" | ReservaStatus)} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">
              <option value="todos">Todos os status</option>
              <option value="confirmada">Confirmadas</option>
              <option value="pendente">Pendentes</option>
              <option value="cancelada">Canceladas</option>
            </select>
            <input type="date" value={filtroData} onChange={(e) => onFiltroData(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
          </div>
        </div>

        {(busca || filtroStatus !== "todos" || filtroData) && (
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>{filtradas.length} reserva(s) encontrada(s)</span>
            <button onClick={onLimparFiltros} className="font-bold text-[#005a3c]">Limpar filtros</button>
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-[#e8f3ee]"><tr>
              <th className="p-3">Data</th><th className="p-3">Espaço</th><th className="p-3">Responsável</th>
              <th className="p-3">Tipo</th><th className="p-3">Valor</th><th className="p-3">Pagamento</th>
              <th className="p-3">Status</th><th className="p-3">Ação</th>
            </tr></thead>
            <tbody>
              {filtradas.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-3">{dataBR(r.data)}<div className="text-xs text-gray-500">{r.horario}</div></td>
                  <td className="p-3 font-semibold">{espacoNome(r.espacoId)}</td>
                  <td className="p-3">{r.nome}<div className="text-xs text-gray-500">{r.matricula ? `Matrícula ${r.matricula}` : r.tipoPessoa === "socio" ? "Sócio" : "Não sócio"}</div></td>
                  <td className="p-3">{r.tipoPessoa === "socio" ? "Sócio" : "Não sócio"}</td>
                  <td className="p-3 font-bold">{moeda(r.valor)}</td>
                  <td className="p-3">
                    {r.pagamento === "pix" ? (
                      <span className="font-semibold text-[#005a3c]">PIX {r.status === "confirmada" ? "· Confirmado" : r.comprovante_url ? "· Comprovante" : "· Aguardando"}</span>
                    ) : r.pagamento === "dinheiro" ? "Dinheiro" : r.pagamento === "pendente" ? "Pendente" : r.pagamento}
                  </td>
                  <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${r.status === "confirmada" ? "bg-green-100 text-green-700" : r.status === "pendente" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-700"}`}>{r.status === "confirmada" ? "Confirmada" : r.status === "pendente" ? "Pendente" : "Cancelada"}</span></td>
                  <td className="p-3">
                    {r.comprovante_url && <button onClick={() => onComprovante(r.comprovante_url || "")} className="mr-2 rounded-lg bg-[#e8f3ee] px-3 py-2 text-xs font-bold text-[#005a3c]">Comprovante</button>}{podeConfirmarPix && r.pagamento === "pix" && r.status === "pendente" && <button onClick={() => onConfirmarPix(r)} className="mr-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Confirmar PIX</button>}
                    <button onClick={() => onEditar(r)} className="mr-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">Editar</button>
                    <button onClick={() => void abrirRecibo(r)} className="mr-2 rounded-lg bg-[#e8f3ee] px-3 py-2 text-xs font-bold text-[#005a3c]">Recibo</button>
                    {r.status !== "cancelada" && <button onClick={() => onCancelar(r.id)} className="rounded-lg bg-red-50 p-2 text-red-600" title="Cancelar reserva"><Trash2 className="h-4 w-4" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtradas.length && <div className="py-10 text-center text-sm text-gray-500">Nenhuma reserva encontrada.</div>}
        </div>
      </div>
    </section>
  );
}

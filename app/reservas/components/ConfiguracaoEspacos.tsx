"use client";

import { useEffect, useState } from "react";
import type { Espaco } from "../types";

interface Props {
  espacos: Espaco[];
  salvandoId: string | null;
  onSalvar: (id: string, precoSocio: number, precoNaoSocio: number, permiteNaoSocio: boolean) => Promise<void>;
}

type Rascunho = { precoSocio: string; precoNaoSocio: string; permiteNaoSocio: boolean };

export default function ConfiguracaoEspacos({ espacos, salvandoId, onSalvar }: Props) {
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});

  useEffect(() => {
    setRascunhos((atual) => {
      const proximo = { ...atual };
      for (const e of espacos) {
        proximo[e.id] ||= {
          precoSocio: String(e.precoSocio),
          precoNaoSocio: String(e.precoNaoSocio),
          permiteNaoSocio: e.permiteNaoSocio,
        };
      }
      return proximo;
    });
  }, [espacos]);

  const atualizar = (id: string, campo: keyof Rascunho, valor: string | boolean) => {
    setRascunhos((atual) => ({ ...atual, [id]: { ...(atual[id] || { precoSocio: "0", precoNaoSocio: "0", permiteNaoSocio: false }), [campo]: valor } }));
  };

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-xl font-extrabold text-[#005a3c]">Configuração dos espaços</h2>
        <p className="text-sm text-gray-500">Os valores abaixo são gravados no banco. R$ 0,00 para não sócio significa bloqueado.</p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-[#e8f3ee]"><tr><th className="p-3">Espaço</th><th className="p-3">Cobrança</th><th className="p-3">Sócio</th><th className="p-3">Não sócio</th><th className="p-3">Permissão</th><th className="p-3">Ação</th></tr></thead>
          <tbody>
            {espacos.map((e) => {
              const d = rascunhos[e.id] || { precoSocio: String(e.precoSocio), precoNaoSocio: String(e.precoNaoSocio), permiteNaoSocio: e.permiteNaoSocio };
              const precoNaoSocio = Math.max(0, Number(d.precoNaoSocio.replace(",", ".")) || 0);
              const liberado = d.permiteNaoSocio && precoNaoSocio > 0;
              const salvando = salvandoId === e.id;
              return (
                <tr key={e.id} className="border-b">
                  <td className="p-3 font-bold">{e.nome}<div className="text-xs text-gray-500">{e.capacidade || ""}</div></td>
                  <td className="p-3">{e.cobranca === "hora" ? "Por hora" : "Por diária"}</td>
                  <td className="p-3"><input type="number" min="0" value={d.precoSocio} onChange={(x) => atualizar(e.id, "precoSocio", x.target.value)} className="w-28 rounded-lg border p-2" /></td>
                  <td className="p-3"><input type="number" min="0" value={d.precoNaoSocio} onChange={(x) => atualizar(e.id, "precoNaoSocio", x.target.value)} className="w-28 rounded-lg border p-2" /></td>
                  <td className="p-3">
                    <button onClick={() => atualizar(e.id, "permiteNaoSocio", !d.permiteNaoSocio)} disabled={precoNaoSocio <= 0} className={`rounded-full px-4 py-2 text-xs font-extrabold ${liberado ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {liberado ? "🟢 Liberado" : "🔒 Bloqueado"}
                    </button>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => void onSalvar(e.id, Math.max(0, Number(d.precoSocio.replace(",", ".")) || 0), precoNaoSocio, d.permiteNaoSocio && precoNaoSocio > 0)}
                      disabled={salvando}
                      className="rounded-xl bg-[#005a3c] px-4 py-2 font-bold text-white disabled:opacity-50"
                    >
                      {salvando ? "Salvando..." : "Salvar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!espacos.length && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">Nenhum espaço ativo foi encontrado no banco.</div>}
    </section>
  );
}

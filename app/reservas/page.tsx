"use client";

import { useState } from "react";
import { Calendar, Plus, CheckCircle, Clock, XCircle, Search, MapPin, Users } from "lucide-react";

export default function ReservasPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Exemplo de dados de reservas
  const reservas = [
    {
      id: 1,
      espaco: "Churrasqueira 02 - Bosque",
      socio: "Carlos Eduardo Silva (Matrícula: #1042)",
      data: "12/10/2026",
      horario: "11:00 - 18:00",
      status: "Confirmado",
      valor: "R$ 150,00",
    },
    {
      id: 2,
      espaco: "Salão Nobre de Festas",
      socio: "Mariana Costa (Matrícula: #0891)",
      data: "18/10/2026",
      horario: "19:00 - 03:00",
      status: "Pendente",
      valor: "R$ 1.200,00",
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Reservas de Espaços</h1>
          <p className="text-gray-500 text-sm">Gerencie o agendamento e locação dos espaços do clube</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-lg font-medium transition"
        >
          <Plus className="w-5 h-5" />
          Nova Reserva
        </button>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Reservas Este Mês</p>
            <p className="text-2xl font-bold text-gray-800">38</p>
          </div>
          <Calendar className="w-8 h-8 text-emerald-600" />
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Confirmadas</p>
            <p className="text-2xl font-bold text-emerald-600">29</p>
          </div>
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Pendentes</p>
            <p className="text-2xl font-bold text-amber-500">7</p>
          </div>
          <Clock className="w-8 h-8 text-amber-500" />
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Canceladas</p>
            <p className="text-2xl font-bold text-rose-500">2</p>
          </div>
          <XCircle className="w-8 h-8 text-rose-500" />
        </div>
      </div>

      {/* Tabela e Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por sócio, espaço ou data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-gray-700 font-semibold uppercase text-xs">
            <tr>
              <th className="py-3 px-4">Espaço</th>
              <th className="py-3 px-4">Sócio</th>
              <th className="py-3 px-4">Data & Horário</th>
              <th className="py-3 px-4">Valor</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reservas.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="py-3 px-4 font-medium text-gray-800">{item.espaco}</td>
                <td className="py-3 px-4">{item.socio}</td>
                <td className="py-3 px-4">
                  <div>{item.data}</div>
                  <div className="text-xs text-gray-400">{item.horario}</div>
                </td>
                <td className="py-3 px-4 font-semibold text-gray-700">{item.valor}</td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                      item.status === "Confirmado"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {item.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right">
                  <button className="text-emerald-700 hover:text-emerald-900 font-medium mr-3">
                    Editar
                  </button>
                  <button className="text-rose-600 hover:text-rose-800 font-medium">
                    Cancelar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

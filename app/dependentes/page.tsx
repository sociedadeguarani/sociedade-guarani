"use client";

import { useEffect, useMemo, useState } from "react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";
import { supabase } from "@/lib/supabaseClient";

type Socio = {
  id: string;
  matricula: string | null;
  nome: string;
  situacao: string | null;
  responsavel_id?: string | null;
};

type Dependente = {
  id: string;
  socio_id: string;
  matricula?: string | null;
  foto_url?: string | null;
  nome: string;
  cpf: string | null;
  data_nascimento: string | null;
  parentesco: string | null;
  telefone: string | null;
  ativo: boolean | null;
  created_at: string | null;
  possui_mensalidade: boolean | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  tipo_pagamento: string | null;
  situacao_financeira: string | null;
  data_ultimo_pagamento: string | null;
  source?: "socios" | "dependentes";
};

const parentescos = [
  "Filho(a)", "Esposo(a)", "Companheiro(a)", "Pai", "Mãe",
  "Irmão(ã)", "Neto(a)", "Avô(ó)", "Outro",
];

function formatarData(data: string | null) {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
}

function formatarCpf(valor: string | null) {
  if (!valor) return "—";
  const n = valor.replace(/\D/g, "");
  return n.length === 11
    ? `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`
    : valor;
}

function formatarTelefone(valor: string | null) {
  if (!valor) return "—";
  const n = valor.replace(/\D/g, "");
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return valor;
}

export default function DependentesPage() {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [statusResponsaveis, setStatusResponsaveis] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [filtroSocio, setFiltroSocio] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [migrando, setMigrando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Dependente | null>(null);
  const [perfilUsuario, setPerfilUsuario] = useState("");
  const [fotoArquivo, setFotoArquivo] = useState<File | null>(null);

  const somenteConsulta = perfilUsuario === "funcionario";

  type FormDependente = {
    socio_id: string;
    nome: string;
    cpf: string;
    data_nascimento: string;
    parentesco: string;
    telefone: string;
    ativo: boolean;
    possui_mensalidade: boolean;
    valor_mensalidade: number;
    dia_vencimento: number;
    tipo_pagamento: string;
    situacao_financeira: string;
    data_ultimo_pagamento: string;

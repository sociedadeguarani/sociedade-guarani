"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Socio = {
  id: string;
  matricula: number | null;
  nome: string;
  cpf: string | null;
  rg: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  data_associacao: string | null;
  categoria: string | null;
  situacao: string | null;
  observacoes: string | null;
  foto_url: string | null;

  tipo_socio: string | null;
  responsavel_id: string | null;
  parentesco: string | null;
  possui_mensalidade: boolean | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  tipo_pagamento: string | null;
  modalidade_temporada: string | null;
  inicio_temporada: string | null;
  fim_temporada: string | null;
};

const menus = [
  { nome: "Início", icone: "🏠" },
  { nome: "Sócios", icone: "👥" },
  { nome: "Dependentes", icone: "👨‍👩‍👧‍👦" },
  { nome: "Reservas", icone: "📅" },
  { nome: "Eventos", icone: "🎉" },
  { nome: "Financeiro", icone: "💰" },
  { nome: "Espaços", icone: "🏛️" },
  { nome: "Relatórios", icone: "📊" },
];

const socioInicial: Partial<Socio> = {
  nome: "",
  cpf: "",
  rg: "",
  data_nascimento: "",
  telefone: "",
  whatsapp: "",
  email: "",
  endereco: "",
  numero: "",
  bairro: "",
  cidade: "",
  estado: "RS",
  cep: "",
  data_associacao: "",
  categoria: "Titular",
  situacao: "ativo",
  observacoes: "",
  foto_url: "",

  tipo_socio: "patrimonial",
  responsavel_id: null,
  parentesco: "",
  possui_mensalidade: false,
  valor_mensalidade: 0,
  dia_vencimento: 10,
  tipo_pagamento: "pix",
  modalidade_temporada: null,
  inicio_temporada: "",
  fim_temporada: "",
};

const TIPOS_SOCIO = [
  { value: "patrimonial", label: "Patrimonial" },
  { value: "dependente_patrimonial", label: "Dependente Patrimonial" },
  { value: "contribuinte", label: "Contribuinte" },
  { value: "dependente_contribuinte", label: "Dependente Contribuinte" },
  { value: "transitorio", label: "Transitório" },
  { value: "dependente_transitorio", label: "Dependente Transitório" },
  { value: "temporada_individual", label: "Temporada Individual" },
  { value: "temporada_familiar", label: "Temporada Familiar" },
  { value: "dependente_temporada_familiar", label: "Dependente Temporada Familiar" },
];

const PARENTESCOS = [
  "Esposa",
  "Esposo",
  "Companheiro(a)",
  "Filho(a)",
  "Enteado(a)",
  "Pai",
  "Mãe",
  "Irmão(ã)",
  "Outro",
];

const FORMAS_PAGAMENTO = [
  "pix",
  "debito_em_conta",
  "boleto",
  "dinheiro",
];

function tipoSocioLabel(tipo?: string | null) {
  return TIPOS_SOCIO.find((x) => x.value === tipo)?.label || tipo || "Não informado";
}

function tipoSocioClasse(tipo?: string | null) {
  switch (tipo) {
    case "patrimonial":
      return "bg-[#dceee6] text-[#003d2b] ring-1 ring-[#9fcdb9]";
    case "dependente_patrimonial":
      return "bg-[#e8f3ee] text-[#2d8061] ring-1 ring-[#b9ddcc]";
    case "contribuinte":
      return "bg-[#dce8f7] text-[#064b9b] ring-1 ring-[#aac4e4]";
    case "dependente_contribuinte":
      return "bg-[#e8f0fb] text-[#376aa6] ring-1 ring-[#bdd0ea]";
    case "transitorio":
      return "bg-[#fff4cc] text-[#8a6700] ring-1 ring-[#f1d879]";
    case "dependente_transitorio":
      return "bg-[#fff8df] text-[#9a790c] ring-1 ring-[#f3df9b]";
    case "temporada_individual":
    case "temporada_familiar":
      return "bg-[#ffead9] text-[#b65308] ring-1 ring-[#f2bb91]";
    case "dependente_temporada_familiar":
      return "bg-[#fff1e6] text-[#c66a25] ring-1 ring-[#f3c6a3]";
    default:
      return "bg-[#eef3ef] text-[#50625a] ring-1 ring-[#d7e1dc]";
  }
}

export default function Home() {
  const [menu, setMenu] = useState("Início");

  const [socios, setSocios] = useState<Socio[]>([]);
  const [busca, setBusca] = useState("");
  const [abrirCadastro, setAbrirCadastro] = useState(false);
  const [socioEditando, setSocioEditando] = useState<Socio | null>(null);

  const [form, setForm] = useState<Partial<Socio>>(socioInicial);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [fotoArquivo, setFotoArquivo] = useState<File | null>(null);
  const [mostrarSomenteDependentes, setMostrarSomenteDependentes] = useState(false);

  function selecionarFoto(file: File | null) {
    setFotoArquivo(file);
    if (file) {
      setForm((atual) => ({
        ...atual,
        foto_url: URL.createObjectURL(file),
      }));
    }
  }

  function removerFoto() {
    setFotoArquivo(null);
    setForm((atual) => ({
      ...atual,
      foto_url: "",
    }));
  }

  async function carregarSocios() {
    setCarregando(true);

    const { data, error } = await supabase
      .from("socios")
      .select("*")
      .order("matricula", { ascending: true });

    if (error) {
      console.error(error);
      setMensagem("Erro ao carregar os sócios.");
    } else {
      setSocios(data || []);
    }

    setCarregando(false);
  }

  useEffect(() => {
    carregarSocios();
  }, []);

  function novoSocio() {
    setSocioEditando(null);
    setForm({
      ...socioInicial,
      data_associacao: new Date().toISOString().split("T")[0],
    });
    setFotoArquivo(null);
    setAbrirCadastro(true);
    setMensagem("");
  }

  function editarSocio(socio: Socio) {
    setSocioEditando(socio);
    setForm({ ...socio, situacao: socio.situacao?.toLowerCase() || "ativo" });
    setFotoArquivo(null);
    setAbrirCadastro(true);
    setMensagem("");
  }

  function fecharCadastro() {
    if (!salvando) {
      setAbrirCadastro(false);
      setSocioEditando(null);
    }
  }

  function alterarCampo(campo: keyof Socio, valor: string) {
    setForm((atual) => ({
      ...atual,
      [campo]:
        campo === "possui_mensalidade"
          ? valor === "true"
          : valor,
    }));
  }

  async function salvarSocio() {
    if (!form.nome?.trim()) {
      setMensagem("Informe o nome completo do sócio.");
      return;
    }

    setSalvando(true);
    setMensagem("");

    const dadosBase = {
      nome: form.nome?.trim(),
      cpf: form.cpf || null,
      rg: form.rg || null,
      data_nascimento: form.data_nascimento || null,
      telefone: form.telefone || null,
      whatsapp: form.whatsapp || null,
      email: form.email || null,
      endereco: form.endereco || null,
      numero: form.numero || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      cep: form.cep || null,
      data_associacao: form.data_associacao || null,
      categoria: form.categoria || "Titular",
      situacao: form.situacao || "ativo",
      observacoes: form.observacoes || null,

      tipo_socio: form.tipo_socio || "patrimonial",
      responsavel_id: form.responsavel_id || null,
      parentesco: form.parentesco || null,
      possui_mensalidade: Boolean(form.possui_mensalidade),
      valor_mensalidade: Number(form.valor_mensalidade || 0),
      dia_vencimento: Number(form.dia_vencimento || 10),
      tipo_pagamento: form.tipo_pagamento || "pix",
      modalidade_temporada: form.modalidade_temporada || null,
      inicio_temporada: form.inicio_temporada || null,
      fim_temporada: form.fim_temporada || null,
    };

    try {
      let socioId = socioEditando?.id || "";

      if (socioEditando) {
        const resultado = await supabase
          .from("socios")
          .update({
            ...dadosBase,
            foto_url: form.foto_url || null,
          })
          .eq("id", socioEditando.id);

        if (resultado.error) throw resultado.error;
      } else {
        const resultado = await supabase
          .from("socios")
          .insert(dadosBase)
          .select("id")
          .single();

        if (resultado.error) throw resultado.error;
        socioId = resultado.data.id;
      }

      if (fotoArquivo && socioId) {
        const extensao =
          fotoArquivo.name.split(".").pop()?.toLowerCase() || "jpg";
        const caminho = `socios/${socioId}.${extensao}`;

        const upload = await supabase.storage
          .from("fotos-associados")
          .upload(caminho, fotoArquivo, {
            upsert: true,
            contentType: fotoArquivo.type || "image/jpeg",
          });

        if (upload.error) throw upload.error;

        const { data: urlData } = supabase.storage
          .from("fotos-associados")
          .getPublicUrl(caminho);

        const atualizacaoFoto = await supabase
          .from("socios")
          .update({ foto_url: urlData.publicUrl })
          .eq("id", socioId);

        if (atualizacaoFoto.error) throw atualizacaoFoto.error;
      }

      setMensagem(
        socioEditando
          ? "Sócio atualizado com sucesso!"
          : "Sócio cadastrado com sucesso!"
      );

      setFotoArquivo(null);
      await carregarSocios();

      setTimeout(() => {
        setAbrirCadastro(false);
        setSocioEditando(null);
        setMensagem("");
      }, 900);
    } catch (error) {
      console.error(error);
      setMensagem(
        "Não foi possível salvar. Verifique o Supabase e o bucket fotos-associados."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function excluirSocio(socio: Socio) {
    const confirmar = window.confirm(
      `Deseja realmente excluir o sócio "${socio.nome}"?`
    );

    if (!confirmar) return;

    const { error } = await supabase
      .from("socios")
      .delete()
      .eq("id", socio.id);

    if (error) {
      console.error(error);
      setMensagem("Não foi possível excluir o sócio.");
      return;
    }

    setMensagem("Sócio excluído.");
    await carregarSocios();

    setTimeout(() => setMensagem(""), 1500);
  }

  const sociosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();

    return socios.filter((socio) => {
      const correspondeBusca =
        !termo ||
        socio.nome?.toLowerCase().includes(termo) ||
        socio.cpf?.toLowerCase().includes(termo) ||
        String(socio.matricula || "").includes(termo);

      const correspondeTipo =
        !mostrarSomenteDependentes ||
        Boolean(socio.responsavel_id) ||
        (socio.tipo_socio || "").startsWith("dependente_");

      return correspondeBusca && correspondeTipo;
    });
  }, [socios, busca, mostrarSomenteDependentes]);

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#173d2e]">

      {/* CABEÇALHO */}
      <header className="sticky top-0 z-30 border-b border-[#dfe9e3] bg-white/95 text-[#123c2b] shadow-sm backdrop-blur">
        <div className="flex h-20 items-center justify-between px-5 sm:px-7">

          <div className="flex items-center gap-4">

            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#003d2b] p-1.5 shadow-sm">
              <img
                src="/logo-guarani.png"
                alt="Sociedade Guarani"
                className="h-full w-full object-contain"
              />
            </div>

            <div>
              <h1 className="text-base font-extrabold tracking-tight sm:text-lg">
                SOCIEDADE GUARANI
              </h1>

              <p className="text-xs font-medium text-[#6b7d74]">
                Sociedade Recreativa Guarani — S.R.G.
              </p>
            </div>

          </div>

          <div className="hidden items-center gap-3 sm:flex">
            <p className="text-sm text-gray-200">
              Sistema de Gestão
            </p>

            <p className="font-bold text-[#005a3c]">
              Área Administrativa
            </p>
          </div>

        </div>
      </header>

      <div className="flex min-h-[calc(100vh-80px)]">

        {/* MENU LATERAL */}
        <aside className="hidden w-64 shrink-0 border-r border-[#dfe9e3] bg-[#f7faf8] px-3 py-5 md:block">

          <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#91a099]">
            Menu principal
          </p>

          <nav className="space-y-2">

            {menus.map((item) => (
              <button
                key={item.nome}
                onClick={() => setMenu(item.nome)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
                  menu === item.nome
                    ? "bg-[#005a3c] text-white shadow-sm"
                    : "text-[#50625a] hover:bg-[#e8f3ee] hover:text-[#005a3c]"
                }`}
              >
                <span className="text-xl">
                  {item.icone}
                </span>

                {item.nome}
              </button>
            ))}

          </nav>

          <div className="mt-10 rounded-2xl bg-[#f7edbd] p-4">

            <p className="text-xs font-bold text-[#705c00]">
              SOCIEDADE GUARANI
            </p>

            <p className="mt-1 text-sm text-[#574900]">
              Sistema integrado de gestão
            </p>

          </div>

        </aside>

        {/* CONTEÚDO */}
        <section className="min-w-0 flex-1 bg-[#f8faf9] p-5 sm:p-7 lg:p-8">

          {/* MENU MOBILE */}
          <div className="mb-6 grid grid-cols-3 gap-2 md:hidden">

            {menus.map((item) => (
              <button
                key={item.nome}
                onClick={() => setMenu(item.nome)}
                className={`rounded-xl p-3 text-xs font-semibold ${
                  menu === item.nome
                    ? "bg-[#005a3c] text-white"
                    : "bg-white text-gray-700 shadow-sm"
                }`}
              >
                <div className="mb-1 text-xl">
                  {item.icone}
                </div>

                {item.nome}
              </button>
            ))}

          </div>

          {/* INÍCIO */}
          {menu === "Início" && (
            <Inicio
              socios={socios}
              quantidadeSocios={socios.length}
              abrirCadastro={novoSocio}
            />
          )}

          {/* SÓCIOS */}
          {menu === "Sócios" && (
            <Socios
              socios={sociosFiltrados}
              quantidadeTotal={socios.length}
              busca={busca}
              setBusca={setBusca}
              novoSocio={novoSocio}
              editarSocio={editarSocio}
              excluirSocio={excluirSocio}
              carregando={carregando}
              mostrarSomenteDependentes={mostrarSomenteDependentes}
              setMostrarSomenteDependentes={setMostrarSomenteDependentes}
            />
          )}

          {/* OUTROS MÓDULOS */}
          {menu !== "Início" && menu !== "Sócios" && (
            <ModuloEmConstrucao
              nome={menu}
              icone={
                menus.find((x) => x.nome === menu)?.icone || "📋"
              }
            />
          )}

        </section>
      </div>

      {/* MODAL CADASTRO */}
      {abrirCadastro && (
        <ModalSocio
          socios={socios}
          form={form}
          socioEditando={socioEditando}
          salvando={salvando}
          mensagem={mensagem}
          fechar={fecharCadastro}
          alterarCampo={alterarCampo}
          salvar={salvarSocio}
          selecionarFoto={selecionarFoto}
          removerFoto={removerFoto}
        />
      )}

    </main>
  );
}


/* =========================
   INÍCIO
========================= */

function Inicio({
  socios,
  quantidadeSocios,
  abrirCadastro,
}: {
  socios: Socio[];
  quantidadeSocios: number;
  abrirCadastro: () => void;
}) {
  return (
    <>
      <div className="mb-8">

        <p className="text-sm font-medium text-gray-500">
          Bem-vindo ao sistema
        </p>

        <h2 className="mt-1 text-3xl font-bold text-[#005a3c]">
          Painel da Sociedade Guarani
        </h2>

        <p className="mt-2 text-gray-600">
          Gerencie sócios, reservas, eventos, espaços e financeiro
          em um único lugar.
        </p>

      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">

        <DashboardCard
          titulo="Sócios"
          valor={String(quantidadeSocios)}
          descricao="Sócios cadastrados"
          icone="👥"
        />

        <DashboardCard
          titulo="Dependentes"
          valor={String(socios.filter((s) => Boolean(s.responsavel_id)).length)}
          descricao="Vinculados a responsáveis"
          icone="👨‍👩‍👧‍👦"
        />

        <DashboardCard
          titulo="Reservas"
          valor="0"
          descricao="Reservas este mês"
          icone="📅"
        />

        <DashboardCard
          titulo="Eventos"
          valor="0"
          descricao="Eventos cadastrados"
          icone="🎉"
        />

        <DashboardCard
          titulo="Espaços"
          valor="4"
          descricao="Espaços disponíveis"
          icone="🏛️"
        />

      </div>

      <div className="mt-8 rounded-2xl bg-[#063b28] p-6 text-white shadow-lg">

        <h3 className="text-xl font-bold">
          Acesso rápido
        </h3>

        <p className="mt-1 text-sm text-gray-200">
          Comece uma nova operação no sistema.
        </p>

        <button
          onClick={abrirCadastro}
          className="mt-5 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#005a3c] transition hover:bg-[#f5d76e]"
        >
          👤 Cadastrar novo sócio
        </button>

      </div>
    </>
  );
}


/* =========================
   CORES DAS CATEGORIAS
========================= */

function categoriaClasse(categoria?: string | null) {
  const valor = (categoria || "").toLowerCase();

  if (valor.includes("patrimonial") && valor.includes("depend")) {
    return "bg-[#e8f3ee] text-[#2d8061] ring-1 ring-[#b9ddcc]";
  }
  if (valor.includes("patrimonial")) {
    return "bg-[#dceee6] text-[#003d2b] ring-1 ring-[#9fcdb9]";
  }
  if (valor.includes("contribuinte") && valor.includes("depend")) {
    return "bg-[#e8f0fb] text-[#376aa6] ring-1 ring-[#bdd0ea]";
  }
  if (valor.includes("contribuinte")) {
    return "bg-[#dce8f7] text-[#064b9b] ring-1 ring-[#aac4e4]";
  }
  if (valor.includes("temporário") || valor.includes("temporario") ||
      valor.includes("transitório") || valor.includes("transitorio")) {
    return "bg-[#fff4cc] text-[#8a6700] ring-1 ring-[#f1d879]";
  }
  if (valor.includes("temporada")) {
    return "bg-[#ffead9] text-[#b65308] ring-1 ring-[#f2bb91]";
  }
  if (valor.includes("benemérito") || valor.includes("benemerito")) {
    return "bg-[#f0e9f8] text-[#6d4b91] ring-1 ring-[#d5c5e6]";
  }
  return "bg-[#eef3ef] text-[#50625a] ring-1 ring-[#d7e1dc]";
}

/* =========================
   SÓCIOS
========================= */

function Socios({
  socios,
  quantidadeTotal,
  busca,
  setBusca,
  novoSocio,
  editarSocio,
  excluirSocio,
  carregando,
  mostrarSomenteDependentes,
  setMostrarSomenteDependentes,
}: {
  socios: Socio[];
  quantidadeTotal: number;
  busca: string;
  setBusca: (valor: string) => void;
  novoSocio: () => void;
  editarSocio: (socio: Socio) => void;
  excluirSocio: (socio: Socio) => void;
  carregando: boolean;
  mostrarSomenteDependentes: boolean;
  setMostrarSomenteDependentes: (valor: boolean) => void;
}) {
  return (
    <div>

      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

        <div>
          <p className="text-sm font-medium text-gray-500">
            Administração
          </p>

          <h2 className="mt-1 text-3xl font-bold text-[#005a3c]">
            Sócios
          </h2>

          <p className="mt-1 text-gray-500">
            Cadastro e gerenciamento dos associados.
          </p>
        </div>

        <button
          onClick={novoSocio}
          className="rounded-xl bg-[#063b28] px-5 py-3 font-bold text-white shadow transition hover:bg-[#003d2b]"
        >
          + Novo Sócio
        </button>

      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">

        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Total de sócios
          </p>

          <p className="mt-1 text-3xl font-bold text-[#005a3c]">
            {quantidadeTotal}
          </p>
        </div>

        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Sócios ativos
          </p>

          <p className="mt-1 text-3xl font-bold text-[#005a3c]">
            {socios.filter((s) => s.situacao?.toLowerCase() === "ativo").length}
          </p>
        </div>

        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Exibindo
          </p>

          <p className="mt-1 text-3xl font-bold text-[#005a3c]">
            {socios.length}
          </p>
        </div>

      </div>

      <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">

        <div className="flex items-center gap-3">

          <span className="text-xl">
            🔎
          </span>

          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CPF ou matrícula..."
            className="w-full bg-transparent py-2 outline-none"
          />

        </div>

      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e2ebe6] bg-white shadow-sm">

        <div className="overflow-x-auto">

          <table className="w-full min-w-[900px]">

            <thead className="bg-[#e8f3ee]">

              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">

                <th className="px-5 py-4">
                  Foto
                </th>

                <th className="px-5 py-4">
                  Matrícula
                </th>

                <th className="px-5 py-4">
                  Nome
                </th>

                <th className="px-5 py-4">
                  CPF
                </th>

                <th className="px-5 py-4">
                  WhatsApp
                </th>

                <th className="px-5 py-4">
                  Tipo
                </th>

                <th className="px-5 py-4">
                  Responsável
                </th>

                <th className="px-5 py-4">
                  Mensalidade
                </th>

                <th className="px-5 py-4">
                  Situação
                </th>

                <th className="px-5 py-4 text-right">
                  Ações
                </th>

              </tr>

            </thead>

            <tbody className="divide-y">

              {carregando && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-5 py-12 text-center text-gray-500"
                  >
                    Carregando sócios...
                  </td>
                </tr>
              )}

              {!carregando && socios.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-5 py-12 text-center"
                  >
                    <div className="text-4xl">
                      👥
                    </div>

                    <p className="mt-3 font-semibold text-gray-700">
                      Nenhum sócio encontrado
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Cadastre o primeiro sócio da Sociedade Guarani.
                    </p>

                    <button
                      onClick={novoSocio}
                      className="mt-4 rounded-lg bg-[#063b28] px-4 py-2 text-sm font-bold text-white"
                    >
                      + Cadastrar sócio
                    </button>
                  </td>
                </tr>
              )}

              {!carregando &&
                socios.map((socio) => (
                  <tr
                    key={socio.id}
                    className="transition hover:bg-[#fafcfb]"
                  >

                    <td className="px-5 py-4">
                      {socio.foto_url ? (
                        <img
                          src={socio.foto_url}
                          alt={`Foto de ${socio.nome}`}
                          className="h-11 w-11 rounded-full object-cover ring-2 ring-[#eef3ef]"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e8f3ee] text-lg">
                          👤
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4 font-semibold text-[#005a3c]">
                      {socio.matricula || "-"}
                    </td>

                    <td className="px-5 py-4">

                      <div className="font-semibold">
                        {socio.nome}
                      </div>

                      <div className="text-xs text-gray-400">
                        {socio.email || "Sem e-mail"}
                      </div>

                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600">
                      {socio.cpf || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600">
                      {socio.whatsapp || socio.telefone || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      <span className={`inline-flex max-w-[190px] rounded-full px-3 py-1 text-xs font-extrabold ${tipoSocioClasse(socio.tipo_socio)}`}>
                        {tipoSocioLabel(socio.tipo_socio)}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600">
                      {socio.responsavel_id
                        ? socios.find((p) => p.id === socio.responsavel_id)?.nome || "Responsável"
                        : "—"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {socio.possui_mensalidade
                        ? `R$ ${Number(socio.valor_mensalidade || 0).toFixed(2).replace(".", ",")}`
                        : "Sem mensalidade"}
                    </td>

                    <td className="px-5 py-4">

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          socio.situacao?.toLowerCase() === "ativo"
                            ? "bg-green-100 text-green-700"
                            : socio.situacao?.toLowerCase() === "suspenso"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {socio.situacao?.toLowerCase() === "ativo"
                          ? "Ativo"
                          : socio.situacao?.toLowerCase() === "inativo"
                            ? "Inativo"
                            : socio.situacao?.toLowerCase() === "suspenso"
                              ? "Suspenso"
                              : "Ativo"}
                      </span>

                    </td>

                    <td className="px-5 py-4">

                      <div className="flex justify-end gap-2">

                        <button
                          onClick={() => editarSocio(socio)}
                          className="rounded-lg bg-[#e8f3ee] px-3 py-2 text-sm font-semibold text-[#005a3c] hover:bg-[#dce8df]"
                        >
                          ✏️ Editar
                        </button>

                        <button
                          onClick={() => excluirSocio(socio)}
                          className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
                        >
                          🗑️
                        </button>

                      </div>

                    </td>

                  </tr>
                ))}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}


/* =========================
   MODAL DO SÓCIO
========================= */

function ModalSocio({
  socios,
  form,
  socioEditando,
  salvando,
  mensagem,
  fechar,
  alterarCampo,
  salvar,
  selecionarFoto,
  removerFoto,
}: {
  socios: Socio[];
  form: Partial<Socio>;
  socioEditando: Socio | null;
  salvando: boolean;
  mensagem: string;
  fechar: () => void;
  alterarCampo: (campo: keyof Socio, valor: string) => void;
  salvar: () => void;
  selecionarFoto: (file: File | null) => void;
  removerFoto: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001f16]/55 backdrop-blur-sm p-4">

      <div className="max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">

        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-5">

          <div>

            <p className="text-sm text-gray-500">
              Sociedade Recreativa Guarani
            </p>

            <h2 className="text-2xl font-bold text-[#005a3c]">
              {socioEditando
                ? "Editar Sócio"
                : "Novo Sócio"}
            </h2>

          </div>

          <button
            onClick={fechar}
            className="rounded-full bg-gray-100 px-3 py-2 text-lg hover:bg-gray-200"
          >
            ✕
          </button>

        </div>

        <div className="space-y-8 p-6">

          {/* DADOS PESSOAIS */}
          <FormularioSecao titulo="👤 Dados pessoais">

            <Campo
              label="Nome completo"
              obrigatorio
              value={form.nome}
              onChange={(v) => alterarCampo("nome", v)}
              className="md:col-span-2"
            />

            <Campo
              label="CPF"
              value={form.cpf}
              onChange={(v) => alterarCampo("cpf", v)}
              placeholder="000.000.000-00"
            />

            <Campo
              label="RG"
              value={form.rg}
              onChange={(v) => alterarCampo("rg", v)}
            />

            <Campo
              label="Data de nascimento"
              type="date"
              value={form.data_nascimento}
              onChange={(v) => alterarCampo("data_nascimento", v)}
            />

          </FormularioSecao>

          {/* FOTO */}
          <FormularioSecao titulo="📷 Foto do associado">
            <div className="md:col-span-4">
              <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-gray-300 bg-[#fafcfb] p-6 sm:flex-row">
                <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-white shadow-sm">
                  {form.foto_url ? (
                    <img
                      src={form.foto_url}
                      alt={`Foto de ${form.nome || "associado"}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-5xl">👤</span>
                  )}
                </div>

                <div className="flex-1 text-center sm:text-left">
                  <p className="font-semibold text-gray-800">
                    Foto do associado
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Escolha uma foto para aparecer no cadastro e na lista de sócios.
                  </p>

                  <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                    <label className="cursor-pointer rounded-xl bg-[#063b28] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#003d2b]">
                      📷 Escolher foto
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) =>
                          selecionarFoto(e.target.files?.[0] || null)
                        }
                      />
                    </label>

                    {form.foto_url && (
                      <button
                        type="button"
                        onClick={removerFoto}
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100"
                      >
                        🗑️ Remover foto
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </FormularioSecao>

          {/* CONTATO */}
          <FormularioSecao titulo="📞 Contato">

            <Campo
              label="Telefone"
              value={form.telefone}
              onChange={(v) => alterarCampo("telefone", v)}
            />

            <Campo
              label="WhatsApp"
              value={form.whatsapp}
              onChange={(v) => alterarCampo("whatsapp", v)}
            />

            <Campo
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(v) => alterarCampo("email", v)}
              className="md:col-span-2"
            />

          </FormularioSecao>

          {/* ENDEREÇO */}
          <FormularioSecao titulo="🏠 Endereço">

            <Campo
              label="CEP"
              value={form.cep}
              onChange={(v) => alterarCampo("cep", v)}
            />

            <Campo
              label="Número"
              value={form.numero}
              onChange={(v) => alterarCampo("numero", v)}
            />

            <Campo
              label="Endereço"
              value={form.endereco}
              onChange={(v) => alterarCampo("endereco", v)}
              className="md:col-span-2"
            />

            <Campo
              label="Bairro"
              value={form.bairro}
              onChange={(v) => alterarCampo("bairro", v)}
            />

            <Campo
              label="Cidade"
              value={form.cidade}
              onChange={(v) => alterarCampo("cidade", v)}
            />

            <Campo
              label="Estado"
              value={form.estado}
              onChange={(v) => alterarCampo("estado", v)}
            />

          </FormularioSecao>

          {/* ASSOCIAÇÃO */}
          <FormularioSecao titulo="🏛️ Dados da associação">

            <Campo
              label="Data de associação"
              type="date"
              value={form.data_associacao}
              onChange={(v) => alterarCampo("data_associacao", v)}
            />

            <SelectCampo
              label="Tipo de associado"
              value={form.tipo_socio || "patrimonial"}
              onChange={(v) => alterarCampo("tipo_socio", v)}
              opcoes={TIPOS_SOCIO.map((item) => item.value)}
              labels={Object.fromEntries(TIPOS_SOCIO.map((item) => [item.value, item.label]))}
            />

            <SelectCampo
              label="Situação"

              value={form.situacao || "ativo"}
              onChange={(v) => alterarCampo("situacao", v)}
              opcoes={[
                "ativo",
                "inativo",
                "suspenso",
              ]}
            />

            {Boolean(form.responsavel_id) ||
              String(form.tipo_socio || "").startsWith("dependente_") ? (
              <>
                <SelectCampo
                  label="Parentesco"
                  value={form.parentesco || "Filho(a)"}
                  onChange={(v) => alterarCampo("parentesco", v)}
                  opcoes={PARENTESCOS}
                />

                <SelectCampo
                  label="Responsável"
                  value={form.responsavel_id || ""}
                  onChange={(v) => alterarCampo("responsavel_id", v)}
                  opcoes={[
                    "",
                    ...socios
                      .filter((p) => p.id !== socioEditando?.id)
                      .map((p) => p.id),
                  ]}
                  labels={{
                    "": "Selecione o responsável",
                    ...Object.fromEntries(
                      socios
                        .filter((p) => p.id !== socioEditando?.id)
                        .map((p) => [p.id, p.nome])
                    ),
                  }}
                />
              </>
            ) : null}

            <div className="md:col-span-4 rounded-2xl border border-[#dfe9e3] bg-[#f7faf8] p-4">
              <div className="mb-4">
                <p className="text-sm font-extrabold text-[#003d2b]">
                  💰 Mensalidade
                </p>
                <p className="mt-1 text-xs text-[#718079]">
                  Cada associado ou dependente pode ter sua própria mensalidade.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <SelectCampo
                  label="Possui mensalidade?"
                  value={form.possui_mensalidade ? "sim" : "nao"}
                  onChange={(v) => alterarCampo("possui_mensalidade", v === "sim" ? "true" : "false")}
                  opcoes={["sim", "nao"]}
                  labels={{ sim: "Sim", nao: "Não" }}
                />

                {form.possui_mensalidade ? (
                  <>
                    <Campo
                      label="Valor mensal"
                      type="number"
                      value={form.valor_mensalidade}
                      onChange={(v) => alterarCampo("valor_mensalidade", v)}
                      placeholder="0,00"
                    />

                    <Campo
                      label="Dia do vencimento"
                      type="number"
                      value={form.dia_vencimento}
                      onChange={(v) => alterarCampo("dia_vencimento", v)}
                      placeholder="10"
                    />

                    <SelectCampo
                      label="Tipo de pagamento"
                      value={form.tipo_pagamento || "pix"}
                      onChange={(v) => alterarCampo("tipo_pagamento", v)}
                      opcoes={FORMAS_PAGAMENTO}
                      labels={{
                        pix: "PIX",
                        debito_em_conta: "Débito em conta",
                        boleto: "Boleto",
                        dinheiro: "Dinheiro",
                      }}
                    />
                  </>
                ) : null}
              </div>
            </div>

            {(form.tipo_socio === "temporada_individual" ||
              form.tipo_socio === "temporada_familiar" ||
              form.tipo_socio === "dependente_temporada_familiar") ? (
              <div className="md:col-span-4 rounded-2xl border border-[#f2bb91] bg-[#fff8f2] p-4">
                <p className="mb-4 text-sm font-extrabold text-[#b65308]">
                  🗓️ Período da temporada
                </p>

                <div className="grid gap-4 md:grid-cols-3">
                  <SelectCampo
                    label="Modalidade"
                    value={form.modalidade_temporada || "individual"}
                    onChange={(v) => alterarCampo("modalidade_temporada", v)}
                    opcoes={["individual", "familiar"]}
                    labels={{ individual: "Individual", familiar: "Familiar" }}
                  />

                  <Campo
                    label="Início"
                    type="date"
                    value={form.inicio_temporada}
                    onChange={(v) => alterarCampo("inicio_temporada", v)}
                  />

                  <Campo
                    label="Fim"
                    type="date"
                    value={form.fim_temporada}
                    onChange={(v) => alterarCampo("fim_temporada", v)}
                  />
                </div>
              </div>
            ) : null}

            <div className="md:col-span-3">

              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Observações
              </label>

              <textarea
                value={form.observacoes || ""}
                onChange={(e) =>
                  alterarCampo("observacoes", e.target.value)
                }
                rows={4}
                className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 outline-none focus:border-[#005a3c] focus:ring-2 focus:ring-[#005a3c]/10"
                placeholder="Observações sobre o associado..."
              />

            </div>

          </FormularioSecao>

          {mensagem && (
            <div className="rounded-xl bg-[#e8f3ee] px-4 py-3 text-sm font-semibold text-[#005a3c]">
              {mensagem}
            </div>
          )}

        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-6 py-5">

          <button
            onClick={fechar}
            disabled={salvando}
            className="rounded-xl border border-[#d5e0da] px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>

          <button
            onClick={salvar}
            disabled={salvando}
            className="rounded-xl bg-[#063b28] px-6 py-3 font-bold text-white shadow hover:bg-[#003d2b] disabled:opacity-50"
          >
            {salvando
              ? "Salvando..."
              : socioEditando
                ? "💾 Salvar alterações"
                : "💾 Cadastrar Sócio"}
          </button>

        </div>

      </div>

    </div>
  );
}


/* =========================
   COMPONENTES
========================= */

function FormularioSecao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>

      <h3 className="mb-4 border-b pb-3 text-lg font-bold text-[#005a3c]">
        {titulo}
      </h3>

      <div className="grid gap-4 md:grid-cols-4">
        {children}
      </div>

    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  obrigatorio = false,
  className = "",
}: {
  label: string;
  value?: string | number | null;
  onChange: (valor: string) => void;
  type?: string;
  placeholder?: string;
  obrigatorio?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>

      <label className="mb-2 block text-sm font-semibold text-gray-700">
        {label}

        {obrigatorio && (
          <span className="ml-1 text-red-500">
            *
          </span>
        )}
      </label>

      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 outline-none transition focus:border-[#005a3c] focus:ring-2 focus:ring-[#005a3c]/10"
      />

    </div>
  );
}

function SelectCampo({
  label,
  value,
  onChange,
  opcoes,
  labels = {},
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  opcoes: string[];
  labels?: Record<string, string>;
}) {
  return (
    <div>

      <label className="mb-2 block text-sm font-semibold text-gray-700">
        {label}
      </label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 outline-none focus:border-[#005a3c] focus:ring-2 focus:ring-[#005a3c]/10"
      >

        {opcoes.map((opcao) => (
          <option key={opcao} value={opcao}>
            {labels[opcao] || opcao}
          </option>
        ))}

      </select>

    </div>
  );
}

function DashboardCard({
  titulo,
  valor,
  descricao,
  icone,
}: {
  titulo: string;
  valor: string;
  descricao: string;
  icone: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">

      <div className="flex items-center justify-between">

        <span className="text-3xl">
          {icone}
        </span>

        <span className="rounded-full bg-[#e8f3ee] px-3 py-1 text-xs font-semibold text-[#005a3c]">
          Ativo
        </span>

      </div>

      <p className="mt-5 text-sm font-medium text-gray-500">
        {titulo}
      </p>

      <p className="mt-1 text-3xl font-bold text-[#005a3c]">
        {valor}
      </p>

      <p className="mt-1 text-xs text-gray-500">
        {descricao}
      </p>

    </div>
  );
}

function ModuloEmConstrucao({
  nome,
  icone,
}: {
  nome: string;
  icone: string;
}) {
  return (
    <div className="flex min-h-[500px] items-center justify-center">

      <div className="rounded-2xl bg-white p-10 text-center shadow-sm">

        <div className="text-5xl">
          {icone}
        </div>

        <h2 className="mt-4 text-2xl font-bold text-[#005a3c]">
          {nome}
        </h2>

        <p className="mt-2 text-gray-500">
          Este módulo será configurado na próxima etapa.
        </p>

      </div>

    </div>
  );
}

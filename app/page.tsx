"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  tipo_pagamento: string | null;
  situacao_financeira: string | null;
  data_ultimo_pagamento: string | null;
};

type Dependente = {
  id: string;
  socio_id: string;
  nome: string;
  cpf: string | null;
  data_nascimento: string | null;
  parentesco: string | null;
  telefone: string | null;
  ativo: boolean;
  created_at?: string;
};

type Mensalidade = {
  id: string;
  socio_id: string;
  referencia: string;
  valor: number;
  vencimento: string;
  status: string | null;
  observacoes: string | null;
  created_at?: string;
};

type Pagamento = {
  id: string;
  socio_id: string;
  mensalidade_id: string;
  valor: number;
  data_pagamento: string;
  forma_pagamento: string | null;
  comprovante: string | null;
  observacoes: string | null;
  created_at?: string;
};

const menus = [
  { nome: "Início", icone: "🏠" },
  { nome: "Sócios", icone: "👥" },
  { nome: "Reservas", icone: "📅" },
  { nome: "Eventos", icone: "🎉" },
  { nome: "Financeiro", icone: "💰" },
  { nome: "Espaços", icone: "🏛️" },
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
  categoria: "Contribuinte",
  situacao: "ativo",
  observacoes: "",
  valor_mensalidade: 0,
  dia_vencimento: 10,
  tipo_pagamento: "pix",
  situacao_financeira: "em_dia",
  data_ultimo_pagamento: "",
};

const formaPagamentoOpcoes = [
  { value: "debito_em_conta", label: "Débito em conta" },
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "dinheiro", label: "Dinheiro" },
];

const statusMensalidadeOpcoes = [
  { value: "pendente", label: "Pendente" },
  { value: "pago", label: "Pago" },
  { value: "atrasado", label: "Atrasado" },
  { value: "isento", label: "Isento" },
];

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

  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [carregandoDependentes, setCarregandoDependentes] = useState(false);
  const [dependenteForm, setDependenteForm] = useState({
    nome: "",
    cpf: "",
    data_nascimento: "",
    parentesco: "Filho(a)",
    telefone: "",
    ativo: true,
  });
  const [dependenteEditando, setDependenteEditando] = useState<Dependente | null>(null);
  const [salvandoDependente, setSalvandoDependente] = useState(false);

  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [carregandoFinanceiro, setCarregandoFinanceiro] = useState(false);
  const [financeiroBusca, setFinanceiroBusca] = useState("");
  const [abrirMensalidade, setAbrirMensalidade] = useState(false);
  const [abrirPagamento, setAbrirPagamento] = useState(false);
  const [mensalidadeEditando, setMensalidadeEditando] =
    useState<Mensalidade | null>(null);
  const [pagamentoMensalidade, setPagamentoMensalidade] =
    useState<Mensalidade | null>(null);
  const [salvandoFinanceiro, setSalvandoFinanceiro] = useState(false);

  const [mensalidadeForm, setMensalidadeForm] = useState({
    socio_id: "",
    referencia: "",
    valor: "0",
    vencimento: "",
    status: "pendente",
    observacoes: "",
  });

  const [pagamentoForm, setPagamentoForm] = useState({
    valor: "0",
    data_pagamento: new Date().toISOString().split("T")[0],
    forma_pagamento: "pix",
    comprovante: "",
    observacoes: "",
  });

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
      setSocios((data || []) as Socio[]);
    }
    setCarregando(false);
  }

  async function carregarDependentes(socioId: string) {
    setCarregandoDependentes(true);
    const { data, error } = await supabase
      .from("dependentes")
      .select("*")
      .eq("socio_id", socioId)
      .order("nome", { ascending: true });

    if (error) {
      console.error(error);
      setMensagem("Erro ao carregar os dependentes.");
      setDependentes([]);
    } else {
      setDependentes((data || []) as Dependente[]);
    }
    setCarregandoDependentes(false);
  }

  function limparDependenteForm() {
    setDependenteEditando(null);
    setDependenteForm({
      nome: "",
      cpf: "",
      data_nascimento: "",
      parentesco: "Filho(a)",
      telefone: "",
      ativo: true,
    });
  }

  function novoDependente() {
    limparDependenteForm();
  }

  function editarDependente(dependente: Dependente) {
    setDependenteEditando(dependente);
    setDependenteForm({
      nome: dependente.nome || "",
      cpf: dependente.cpf || "",
      data_nascimento: dependente.data_nascimento || "",
      parentesco: dependente.parentesco || "Filho(a)",
      telefone: dependente.telefone || "",
      ativo: dependente.ativo !== false,
    });
  }

  async function salvarDependente(socioId: string) {
    if (!socioId) {
      setMensagem("Salve primeiro o cadastro do titular para adicionar dependentes.");
      return;
    }
    if (!dependenteForm.nome.trim()) {
      setMensagem("Informe o nome do dependente.");
      return;
    }

    setSalvandoDependente(true);

    const dados = {
      socio_id: socioId,
      nome: dependenteForm.nome.trim(),
      cpf: dependenteForm.cpf || null,
      data_nascimento: dependenteForm.data_nascimento || null,
      parentesco: dependenteForm.parentesco || null,
      telefone: dependenteForm.telefone || null,
      ativo: dependenteForm.ativo,
    };

    const result = dependenteEditando
      ? await supabase
          .from("dependentes")
          .update(dados)
          .eq("id", dependenteEditando.id)
      : await supabase.from("dependentes").insert(dados);

    if (result.error) {
      console.error(result.error);
      setMensagem("Não foi possível salvar o dependente.");
      setSalvandoDependente(false);
      return;
    }

    await carregarDependentes(socioId);
    limparDependenteForm();
    setMensagem(dependenteEditando ? "Dependente atualizado." : "Dependente cadastrado.");
    setSalvandoDependente(false);
    setTimeout(() => setMensagem(""), 1500);
  }

  async function excluirDependente(dependente: Dependente, socioId: string) {
    if (!window.confirm(`Excluir o dependente "${dependente.nome}"?`)) return;

    const { error } = await supabase
      .from("dependentes")
      .delete()
      .eq("id", dependente.id);

    if (error) {
      console.error(error);
      setMensagem("Não foi possível excluir o dependente.");
      return;
    }

    await carregarDependentes(socioId);
    setMensagem("Dependente excluído.");
    setTimeout(() => setMensagem(""), 1500);
  }

  async function carregarFinanceiro() {
    setCarregandoFinanceiro(true);

    const [m, p] = await Promise.all([
      supabase
        .from("mensalidades")
        .select("*")
        .order("vencimento", { ascending: false }),
      supabase
        .from("pagamentos")
        .select("*")
        .order("data_pagamento", { ascending: false }),
    ]);

    if (m.error) {
      console.error(m.error);
      setMensagem("Erro ao carregar as mensalidades.");
    } else {
      setMensalidades((m.data || []) as Mensalidade[]);
    }

    if (p.error) {
      console.error(p.error);
      setMensagem("Erro ao carregar os pagamentos.");
    } else {
      setPagamentos((p.data || []) as Pagamento[]);
    }

    setCarregandoFinanceiro(false);
  }

  useEffect(() => {
    carregarSocios();
    carregarFinanceiro();
  }, []);

  function novoSocio() {
    setSocioEditando(null);
    setForm({
      ...socioInicial,
      data_associacao: new Date().toISOString().split("T")[0],
    });
    setDependentes([]);
    limparDependenteForm();
    setAbrirCadastro(true);
    setMensagem("");
  }

  function editarSocio(socio: Socio) {
    setSocioEditando(socio);
    setForm({ ...socio, situacao: socio.situacao?.toLowerCase() || "ativo" });
    limparDependenteForm();
    setAbrirCadastro(true);
    carregarDependentes(socio.id);
    setMensagem("");
  }

  function fecharCadastro() {
    if (!salvando) {
      setAbrirCadastro(false);
      setSocioEditando(null);
    }
  }

  function alterarCampo(campo: keyof Socio, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvarSocio() {
    if (!form.nome?.trim()) {
      setMensagem("Informe o nome completo do sócio.");
      return;
    }

    setSalvando(true);
    setMensagem("");

    const dados = {
      nome: form.nome.trim(),
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
      valor_mensalidade:
        form.valor_mensalidade === undefined || form.valor_mensalidade === null
          ? 0
          : Number(form.valor_mensalidade),
      dia_vencimento:
        form.dia_vencimento === undefined || form.dia_vencimento === null
          ? 10
          : Number(form.dia_vencimento),
      tipo_pagamento: form.tipo_pagamento || "pix",
      situacao_financeira: form.situacao_financeira || "em_dia",
      data_ultimo_pagamento: form.data_ultimo_pagamento || null,
    };

    let error = null;
    let socioId = socioEditando?.id || "";

    if (socioEditando) {
      const resultado = await supabase
        .from("socios")
        .update(dados)
        .eq("id", socioEditando.id);
      error = resultado.error;
    } else {
      const resultado = await supabase
        .from("socios")
        .insert(dados)
        .select("id")
        .single();
      error = resultado.error;
      socioId = resultado.data?.id || "";
    }

    if (error || !socioId) {
      console.error(error);
      setMensagem(
        "Não foi possível salvar. Verifique a conexão e as colunas do Supabase."
      );
      setSalvando(false);
      return;
    }

    await carregarDependentes(socioId);

    setMensagem(
      socioEditando
        ? "Sócio atualizado com sucesso!"
        : "Sócio cadastrado com sucesso!"
    );

    await carregarSocios();

    setTimeout(() => {
      setAbrirCadastro(false);
      setSocioEditando(null);
      setMensagem("");
    }, 900);

    setSalvando(false);
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

  function abrirNovaMensalidade() {
    const hoje = new Date();
    const referencia = hoje.toISOString().slice(0, 7);
    const vencimento = `${referencia}-${String(
      Math.min(10, new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate())
    ).padStart(2, "0")}`;

    setMensalidadeEditando(null);
    setMensalidadeForm({
      socio_id: socios[0]?.id || "",
      referencia,
      valor: String(socios[0]?.valor_mensalidade || 0),
      vencimento,
      status: "pendente",
      observacoes: "",
    });
    setAbrirMensalidade(true);
  }

  function editarMensalidade(item: Mensalidade) {
    setMensalidadeEditando(item);
    setMensalidadeForm({
      socio_id: item.socio_id,
      referencia: item.referencia,
      valor: String(item.valor ?? 0),
      vencimento: item.vencimento,
      status: item.status || "pendente",
      observacoes: item.observacoes || "",
    });
    setAbrirMensalidade(true);
  }

  async function salvarMensalidade() {
    if (!mensalidadeForm.socio_id || !mensalidadeForm.referencia) {
      setMensagem("Selecione o sócio e informe a referência.");
      return;
    }

    setSalvandoFinanceiro(true);

    const dados = {
      socio_id: mensalidadeForm.socio_id,
      referencia: mensalidadeForm.referencia,
      valor: Number(mensalidadeForm.valor || 0),
      vencimento: mensalidadeForm.vencimento || null,
      status: mensalidadeForm.status,
      observacoes: mensalidadeForm.observacoes || null,
    };

    const result = mensalidadeEditando
      ? await supabase
          .from("mensalidades")
          .update(dados)
          .eq("id", mensalidadeEditando.id)
      : await supabase.from("mensalidades").insert(dados);

    if (result.error) {
      console.error(result.error);
      setMensagem(
        "Não foi possível salvar a mensalidade. Verifique a estrutura da tabela."
      );
      setSalvandoFinanceiro(false);
      return;
    }

    setAbrirMensalidade(false);
    setMensalidadeEditando(null);
    setMensagem("Mensalidade salva com sucesso.");
    await carregarFinanceiro();
    setSalvandoFinanceiro(false);
    setTimeout(() => setMensagem(""), 1800);
  }

  function abrirRegistroPagamento(item: Mensalidade) {
    setPagamentoMensalidade(item);
    setPagamentoForm({
      valor: String(item.valor || 0),
      data_pagamento: new Date().toISOString().split("T")[0],
      forma_pagamento: "pix",
      comprovante: "",
      observacoes: "",
    });
    setAbrirPagamento(true);
  }

  async function registrarPagamento() {
    if (!pagamentoMensalidade) return;

    setSalvandoFinanceiro(true);

    const dados = {
      socio_id: pagamentoMensalidade.socio_id,
      mensalidade_id: pagamentoMensalidade.id,
      valor: Number(pagamentoForm.valor || 0),
      data_pagamento: pagamentoForm.data_pagamento,
      forma_pagamento: pagamentoForm.forma_pagamento,
      comprovante: pagamentoForm.comprovante || null,
      observacoes: pagamentoForm.observacoes || null,
    };

    const pagamento = await supabase.from("pagamentos").insert(dados);

    if (pagamento.error) {
      console.error(pagamento.error);
      setMensagem(
        "Não foi possível registrar o pagamento. Verifique a tabela pagamentos."
      );
      setSalvandoFinanceiro(false);
      return;
    }

    const mensalidade = await supabase
      .from("mensalidades")
      .update({ status: "pago" })
      .eq("id", pagamentoMensalidade.id);

    if (mensalidade.error) console.error(mensalidade.error);

    await supabase
      .from("socios")
      .update({
        situacao_financeira: "em_dia",
        data_ultimo_pagamento: pagamentoForm.data_pagamento,
      })
      .eq("id", pagamentoMensalidade.socio_id);

    setAbrirPagamento(false);
    setPagamentoMensalidade(null);
    setMensagem("Pagamento registrado com sucesso.");
    await Promise.all([carregarFinanceiro(), carregarSocios()]);
    setSalvandoFinanceiro(false);
    setTimeout(() => setMensagem(""), 1800);
  }

  async function excluirMensalidade(item: Mensalidade) {
    if (!window.confirm("Excluir esta mensalidade?")) return;

    const { error } = await supabase
      .from("mensalidades")
      .delete()
      .eq("id", item.id);

    if (error) {
      console.error(error);
      setMensagem("Não foi possível excluir a mensalidade.");
      return;
    }

    await carregarFinanceiro();
    setMensagem("Mensalidade excluída.");
    setTimeout(() => setMensagem(""), 1500);
  }

  const sociosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    if (!termo) return socios;

    return socios.filter(
      (socio) =>
        socio.nome?.toLowerCase().includes(termo) ||
        socio.cpf?.toLowerCase().includes(termo) ||
        String(socio.matricula || "").includes(termo)
    );
  }, [socios, busca]);

  const mensalidadesFiltradas = useMemo(() => {
    const termo = financeiroBusca.toLowerCase().trim();
    if (!termo) return mensalidades;

    return mensalidades.filter((item) => {
      const socio = socios.find((s) => s.id === item.socio_id);
      return (
        socio?.nome?.toLowerCase().includes(termo) ||
        socio?.cpf?.toLowerCase().includes(termo) ||
        socio?.matricula?.toString().includes(termo) ||
        item.referencia.includes(termo)
      );
    });
  }, [mensalidades, socios, financeiroBusca]);

  return (
    <main className="min-h-screen bg-[#f4f6f3] text-[#123c2b]">
      <header className="bg-[#063b28] text-white shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white p-1 shadow-lg">
              <img
                src="/logo-guarani.png"
                alt="Sociedade Guarani"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-wide">
                SOCIEDADE GUARANI
              </h1>
              <p className="text-sm text-[#f5d76e]">
                Sociedade Recreativa Guarani — S.R.G.
              </p>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-sm text-gray-200">Sistema de Gestão</p>
            <p className="font-semibold text-[#f5d76e]">
              Área Administrativa
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        <aside className="hidden min-h-[calc(100vh-96px)] w-64 border-r bg-white p-4 shadow-sm md:block">
          <p className="mb-4 px-3 text-xs font-bold uppercase tracking-wider text-gray-400">
            Menu principal
          </p>
          <nav className="space-y-2">
            {menus.map((item) => (
              <button
                key={item.nome}
                onClick={() => setMenu(item.nome)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
                  menu === item.nome
                    ? "bg-[#063b28] text-white shadow"
                    : "text-gray-700 hover:bg-[#eef3ef]"
                }`}
              >
                <span className="text-xl">{item.icone}</span>
                {item.nome}
              </button>
            ))}
          </nav>

          <div className="mt-10 rounded-2xl bg-[#f7edbd] p-4">
            <p className="text-xs font-bold text-[#705c00]">SOCIEDADE GUARANI</p>
            <p className="mt-1 text-sm text-[#574900]">
              Sistema integrado de gestão
            </p>
          </div>
        </aside>

        <section className="flex-1 p-5 sm:p-8">
          <div className="mb-6 grid grid-cols-3 gap-2 md:hidden">
            {menus.map((item) => (
              <button
                key={item.nome}
                onClick={() => setMenu(item.nome)}
                className={`rounded-xl p-3 text-xs font-semibold ${
                  menu === item.nome
                    ? "bg-[#063b28] text-white"
                    : "bg-white text-gray-700 shadow-sm"
                }`}
              >
                <div className="mb-1 text-xl">{item.icone}</div>
                {item.nome}
              </button>
            ))}
          </div>

          {menu === "Início" && (
            <Inicio
              quantidadeSocios={socios.length}
              abrirCadastro={novoSocio}
              abrirFinanceiro={() => setMenu("Financeiro")}
            />
          )}

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
            />
          )}

          {menu === "Financeiro" && (
            <Financeiro
              socios={socios}
              mensalidades={mensalidadesFiltradas}
              pagamentos={pagamentos}
              busca={financeiroBusca}
              setBusca={setFinanceiroBusca}
              carregando={carregandoFinanceiro}
              novaMensalidade={abrirNovaMensalidade}
              editarMensalidade={editarMensalidade}
              excluirMensalidade={excluirMensalidade}
              registrarPagamento={abrirRegistroPagamento}
            />
          )}

          {menu !== "Início" &&
            menu !== "Sócios" &&
            menu !== "Financeiro" && (
              <ModuloEmConstrucao
                nome={menu}
                icone={menus.find((x) => x.nome === menu)?.icone || "📋"}
              />
            )}
        </section>
      </div>

      {abrirCadastro && (
        <ModalSocio
          form={form}
          socioEditando={socioEditando}
          salvando={salvando}
          mensagem={mensagem}
          fechar={fecharCadastro}
          alterarCampo={alterarCampo}
          salvar={salvarSocio}
          dependentes={dependentes}
          carregandoDependentes={carregandoDependentes}
          dependenteForm={dependenteForm}
          dependenteEditando={dependenteEditando}
          salvandoDependente={salvandoDependente}
          novoDependente={novoDependente}
          editarDependente={editarDependente}
          excluirDependente={(dependente) =>
            socioEditando
              ? excluirDependente(dependente, socioEditando.id)
              : undefined
          }
          salvarDependente={() =>
            socioEditando
              ? salvarDependente(socioEditando.id)
              : setMensagem("Salve primeiro o titular para adicionar dependentes.")
          }
          alterarDependente={(campo, valor) =>
            setDependenteForm((f) => ({ ...f, [campo]: valor }))
          }
        />
      )}

      {abrirMensalidade && (
        <ModalMensalidade
          socios={socios}
          form={mensalidadeForm}
          editando={mensalidadeEditando}
          salvando={salvandoFinanceiro}
          fechar={() => setAbrirMensalidade(false)}
          salvar={salvarMensalidade}
          alterar={(campo, valor) =>
            setMensalidadeForm((f) => ({ ...f, [campo]: valor }))
          }
        />
      )}

      {abrirPagamento && pagamentoMensalidade && (
        <ModalPagamento
          socio={
            socios.find((s) => s.id === pagamentoMensalidade.socio_id) || null
          }
          mensalidade={pagamentoMensalidade}
          form={pagamentoForm}
          salvando={salvandoFinanceiro}
          fechar={() => setAbrirPagamento(false)}
          salvar={registrarPagamento}
          alterar={(campo, valor) =>
            setPagamentoForm((f) => ({ ...f, [campo]: valor }))
          }
        />
      )}

      {mensagem && !abrirCadastro && !abrirMensalidade && !abrirPagamento && (
        <div className="fixed bottom-5 right-5 z-[60] rounded-xl bg-[#063b28] px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {mensagem}
        </div>
      )}
    </main>
  );
}

function Inicio({
  quantidadeSocios,
  abrirCadastro,
  abrirFinanceiro,
}: {
  quantidadeSocios: number;
  abrirCadastro: () => void;
  abrirFinanceiro: () => void;
}) {
  return (
    <>
      <div className="mb-8">
        <p className="text-sm font-medium text-gray-500">Bem-vindo ao sistema</p>
        <h2 className="mt-1 text-3xl font-bold text-[#063b28]">
          Painel da Sociedade Guarani
        </h2>
        <p className="mt-2 text-gray-600">
          Gerencie sócios, reservas, eventos, espaços e financeiro em um único
          lugar.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCard titulo="Sócios" valor={String(quantidadeSocios)} descricao="Sócios cadastrados" icone="👥" />
        <DashboardCard titulo="Reservas" valor="0" descricao="Reservas este mês" icone="📅" />
        <DashboardCard titulo="Eventos" valor="0" descricao="Eventos cadastrados" icone="🎉" />
        <DashboardCard titulo="Financeiro" valor="Ativo" descricao="Mensalidades e pagamentos" icone="💰" />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-[#063b28] p-6 text-white shadow-lg">
          <h3 className="text-xl font-bold">Acesso rápido</h3>
          <p className="mt-1 text-sm text-gray-200">
            Cadastre um novo associado.
          </p>
          <button
            onClick={abrirCadastro}
            className="mt-5 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#063b28] transition hover:bg-[#f5d76e]"
          >
            👤 Cadastrar novo sócio
          </button>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h3 className="text-xl font-bold text-[#063b28]">Financeiro</h3>
          <p className="mt-1 text-sm text-gray-500">
            Controle mensalidades, vencimentos e pagamentos.
          </p>
          <button
            onClick={abrirFinanceiro}
            className="mt-5 rounded-xl bg-[#063b28] px-5 py-3 text-sm font-bold text-white"
          >
            💰 Abrir financeiro
          </button>
        </div>
      </div>
    </>
  );
}

function Socios({
  socios,
  quantidadeTotal,
  busca,
  setBusca,
  novoSocio,
  editarSocio,
  excluirSocio,
  carregando,
}: {
  socios: Socio[];
  quantidadeTotal: number;
  busca: string;
  setBusca: (valor: string) => void;
  novoSocio: () => void;
  editarSocio: (socio: Socio) => void;
  excluirSocio: (socio: Socio) => void;
  carregando: boolean;
}) {
  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-gray-500">Administração</p>
          <h2 className="mt-1 text-3xl font-bold text-[#063b28]">Sócios</h2>
          <p className="mt-1 text-gray-500">
            Cadastro e gerenciamento dos associados.
          </p>
        </div>
        <button
          onClick={novoSocio}
          className="rounded-xl bg-[#063b28] px-5 py-3 font-bold text-white shadow transition hover:bg-[#0a5138]"
        >
          + Novo Sócio
        </button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard titulo="Total de sócios" valor={quantidadeTotal} />
        <StatCard titulo="Sócios ativos" valor={socios.filter((s) => s.situacao?.toLowerCase() === "ativo").length} />
        <StatCard titulo="Exibindo" valor={socios.length} />
      </div>

      <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center gap-3">
          <span className="text-xl">🔎</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CPF ou matrícula..."
            className="w-full bg-transparent py-2 outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px]">
            <thead className="bg-[#eef3ef]">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-4">Matrícula</th>
                <th className="px-5 py-4">Nome</th>
                <th className="px-5 py-4">CPF</th>
                <th className="px-5 py-4">WhatsApp</th>
                <th className="px-5 py-4">Categoria</th>
                <th className="px-5 py-4">Situação</th>
                <th className="px-5 py-4">Financeiro</th>
                <th className="px-5 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {carregando && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-500">
                    Carregando sócios...
                  </td>
                </tr>
              )}

              {!carregando && socios.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <div className="text-4xl">👥</div>
                    <p className="mt-3 font-semibold text-gray-700">
                      Nenhum sócio encontrado
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
                  <tr key={socio.id} className="transition hover:bg-[#fafcfb]">
                    <td className="px-5 py-4 font-semibold text-[#063b28]">
                      {socio.matricula || "-"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold">{socio.nome}</div>
                      <div className="text-xs text-gray-400">
                        {socio.email || "Sem e-mail"}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">{socio.cpf || "-"}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {socio.whatsapp || socio.telefone || "-"}
                    </td>
                    <td className="px-5 py-4 text-sm">{socio.categoria || "-"}</td>
                    <td className="px-5 py-4">
                      <span className={statusSocioClass(socio.situacao)}>
                        {rotuloSituacaoSocio(socio.situacao)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className={statusFinanceiroClass(socio.situacao_financeira)}>
                        {rotuloFinanceiro(socio.situacao_financeira)}
                      </div>
                      <div className="text-xs text-gray-500">
                        R$ {Number(socio.valor_mensalidade || 0).toFixed(2).replace(".", ",")}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => editarSocio(socio)}
                          className="rounded-lg bg-[#eef3ef] px-3 py-2 text-sm font-semibold text-[#063b28] hover:bg-[#dce8df]"
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

function Financeiro({
  socios,
  mensalidades,
  pagamentos,
  busca,
  setBusca,
  carregando,
  novaMensalidade,
  editarMensalidade,
  excluirMensalidade,
  registrarPagamento,
}: {
  socios: Socio[];
  mensalidades: Mensalidade[];
  pagamentos: Pagamento[];
  busca: string;
  setBusca: (valor: string) => void;
  carregando: boolean;
  novaMensalidade: () => void;
  editarMensalidade: (item: Mensalidade) => void;
  excluirMensalidade: (item: Mensalidade) => void;
  registrarPagamento: (item: Mensalidade) => void;
}) {
  const total = mensalidades.reduce((s, m) => s + Number(m.valor || 0), 0);
  const recebido = mensalidades
    .filter((m) => m.status === "pago")
    .reduce((s, m) => s + Number(m.valor || 0), 0);
  const pendente = mensalidades
    .filter((m) => m.status !== "pago" && m.status !== "isento")
    .reduce((s, m) => s + Number(m.valor || 0), 0);

  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-gray-500">Administração</p>
          <h2 className="mt-1 text-3xl font-bold text-[#063b28]">Financeiro</h2>
          <p className="mt-1 text-gray-500">
            Mensalidades, vencimentos e pagamentos dos associados.
          </p>
        </div>
        <button
          onClick={novaMensalidade}
          className="rounded-xl bg-[#063b28] px-5 py-3 font-bold text-white shadow"
        >
          + Nova mensalidade
        </button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <ResumoFinanceiro titulo="Total lançado" valor={total} />
        <ResumoFinanceiro titulo="Total recebido" valor={recebido} />
        <ResumoFinanceiro titulo="Em aberto" valor={pendente} />
      </div>

      <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center gap-3">
          <span className="text-xl">🔎</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por associado ou referência..."
            className="w-full bg-transparent py-2 outline-none"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px]">
            <thead className="bg-[#eef3ef]">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-5 py-4">Associado</th>
                <th className="px-5 py-4">Referência</th>
                <th className="px-5 py-4">Vencimento</th>
                <th className="px-5 py-4">Valor</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {carregando && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-500">
                    Carregando financeiro...
                  </td>
                </tr>
              )}

              {!carregando && mensalidades.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-gray-500">
                    Nenhuma mensalidade cadastrada.
                  </td>
                </tr>
              )}

              {!carregando &&
                mensalidades.map((item) => {
                  const socio = socios.find((s) => s.id === item.socio_id);
                  return (
                    <tr key={item.id} className="hover:bg-[#fafcfb]">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-[#063b28]">
                          {socio?.nome || "Sócio não encontrado"}
                        </div>
                        <div className="text-xs text-gray-400">
                          Matrícula: {socio?.matricula || "-"}
                        </div>
                      </td>
                      <td className="px-5 py-4 font-medium">{formatReferencia(item.referencia)}</td>
                      <td className="px-5 py-4">{formatDate(item.vencimento)}</td>
                      <td className="px-5 py-4 font-semibold">
                        R$ {Number(item.valor || 0).toFixed(2).replace(".", ",")}
                      </td>
                      <td className="px-5 py-4">
                        <span className={statusMensalidadeClass(item.status)}>
                          {rotuloStatusMensalidade(item.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {item.status !== "pago" && item.status !== "isento" && (
                            <button
                              onClick={() => registrarPagamento(item)}
                              className="rounded-lg bg-[#063b28] px-3 py-2 text-sm font-semibold text-white"
                            >
                              💳 Registrar pagamento
                            </button>
                          )}
                          <button
                            onClick={() => editarMensalidade(item)}
                            className="rounded-lg bg-[#eef3ef] px-3 py-2 text-sm font-semibold text-[#063b28]"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => excluirMensalidade(item)}
                            className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h3 className="font-bold text-[#063b28]">Últimos pagamentos</h3>
        <div className="mt-4 space-y-2">
          {pagamentos.slice(0, 5).map((p) => {
            const socio = socios.find((s) => s.id === p.socio_id);
            return (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-[#f4f6f3] px-4 py-3">
                <div>
                  <div className="font-semibold">{socio?.nome || "Associado"}</div>
                  <div className="text-xs text-gray-500">
                    {formatDate(p.data_pagamento)} • {rotuloFormaPagamento(p.forma_pagamento)}
                  </div>
                </div>
                <div className="font-bold text-[#063b28]">
                  R$ {Number(p.valor || 0).toFixed(2).replace(".", ",")}
                </div>
              </div>
            );
          })}
          {pagamentos.length === 0 && (
            <p className="text-sm text-gray-500">Nenhum pagamento registrado.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalMensalidade({
  socios,
  form,
  editando,
  salvando,
  fechar,
  salvar,
  alterar,
}: {
  socios: Socio[];
  form: {
    socio_id: string;
    referencia: string;
    valor: string;
    vencimento: string;
    status: string;
    observacoes: string;
  };
  editando: Mensalidade | null;
  salvando: boolean;
  fechar: () => void;
  salvar: () => void;
  alterar: (campo: keyof typeof form, valor: string) => void;
}) {
  return (
    <ModalBase titulo={editando ? "Editar mensalidade" : "Nova mensalidade"} fechar={fechar}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-semibold">Associado</label>
          <select
            value={form.socio_id}
            onChange={(e) => alterar("socio_id", e.target.value)}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
          >
            <option value="">Selecione...</option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.matricula ? `${s.matricula} - ` : ""}{s.nome}
              </option>
            ))}
          </select>
        </div>

        <Campo label="Referência" type="month" value={form.referencia} onChange={(v) => alterar("referencia", v)} />
        <Campo label="Valor" type="number" value={form.valor} onChange={(v) => alterar("valor", v)} />
        <Campo label="Vencimento" type="date" value={form.vencimento} onChange={(v) => alterar("vencimento", v)} />

        <SelectCampo
          label="Status"
          value={form.status}
          onChange={(v) => alterar("status", v)}
          opcoes={statusMensalidadeOpcoes.map((x) => x.value)}
        />

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-semibold">Observações</label>
          <textarea
            value={form.observacoes}
            onChange={(e) => alterar("observacoes", e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </div>
      </div>

      <ModalBotoes fechar={fechar} salvar={salvar} salvando={salvando} texto={editando ? "Salvar alterações" : "Criar mensalidade"} />
    </ModalBase>
  );
}

function ModalPagamento({
  socio,
  mensalidade,
  form,
  salvando,
  fechar,
  salvar,
  alterar,
}: {
  socio: Socio | null;
  mensalidade: Mensalidade;
  form: {
    valor: string;
    data_pagamento: string;
    forma_pagamento: string;
    comprovante: string;
    observacoes: string;
  };
  salvando: boolean;
  fechar: () => void;
  salvar: () => void;
  alterar: (campo: keyof typeof form, valor: string) => void;
}) {
  return (
    <ModalBase titulo="Registrar pagamento" fechar={fechar}>
      <div className="mb-5 rounded-2xl bg-[#eef3ef] p-4">
        <p className="text-xs text-gray-500">Associado</p>
        <p className="font-bold text-[#063b28]">{socio?.nome || "Associado"}</p>
        <p className="mt-1 text-sm text-gray-600">
          Referência: {formatReferencia(mensalidade.referencia)} • R$ {Number(mensalidade.valor).toFixed(2).replace(".", ",")}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Campo label="Valor pago" type="number" value={form.valor} onChange={(v) => alterar("valor", v)} />
        <Campo label="Data do pagamento" type="date" value={form.data_pagamento} onChange={(v) => alterar("data_pagamento", v)} />

        <SelectCampo
          label="Forma de pagamento"
          value={form.forma_pagamento}
          onChange={(v) => alterar("forma_pagamento", v)}
          opcoes={formaPagamentoOpcoes.map((x) => x.value)}
        />

        <Campo
          label="Comprovante"
          value={form.comprovante}
          onChange={(v) => alterar("comprovante", v)}
          placeholder="Nome, número ou link do comprovante"
        />

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-semibold">Observações</label>
          <textarea
            value={form.observacoes}
            onChange={(e) => alterar("observacoes", e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-4 py-3"
          />
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[#f5d76e] bg-[#fffbea] p-4 text-sm text-[#705c00]">
        Ao confirmar, a mensalidade será marcada como <strong>paga</strong> e o cadastro do sócio ficará como <strong>em dia</strong>.
      </div>

      <ModalBotoes fechar={fechar} salvar={salvar} salvando={salvando} texto="Confirmar pagamento" />
    </ModalBase>
  );
}

function ModalSocio({
  form,
  socioEditando,
  salvando,
  mensagem,
  fechar,
  alterarCampo,
  salvar,
  dependentes,
  carregandoDependentes,
  dependenteForm,
  dependenteEditando,
  salvandoDependente,
  novoDependente,
  editarDependente,
  excluirDependente,
  salvarDependente,
  alterarDependente,
}: {
  form: Partial<Socio>;
  socioEditando: Socio | null;
  salvando: boolean;
  mensagem: string;
  fechar: () => void;
  alterarCampo: (campo: keyof Socio, valor: string) => void;
  salvar: () => void;
  dependentes: Dependente[];
  carregandoDependentes: boolean;
  dependenteForm: {
    nome: string;
    cpf: string;
    data_nascimento: string;
    parentesco: string;
    telefone: string;
    ativo: boolean;
  };
  dependenteEditando: Dependente | null;
  salvandoDependente: boolean;
  novoDependente: () => void;
  editarDependente: (dependente: Dependente) => void;
  excluirDependente: (dependente: Dependente) => void | undefined;
  salvarDependente: () => void;
  alterarDependente: (campo: keyof typeof dependenteForm, valor: string | boolean) => void;
}) {
  const categoria = form.categoria || "Contribuinte";
  const permiteDependentes = categoria !== "Dependente" && categoria !== "Temporada Individual";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-5">
          <div>
            <p className="text-sm text-gray-500">Sociedade Recreativa Guarani</p>
            <h2 className="text-2xl font-bold text-[#063b28]">
              {socioEditando ? "Editar Sócio" : "Novo Sócio"}
            </h2>
          </div>
          <button onClick={fechar} className="rounded-full bg-gray-100 px-3 py-2 text-lg">✕</button>
        </div>

        <div className="space-y-8 p-6">
          <FormularioSecao titulo="👤 Dados pessoais">
            <Campo label="Nome completo" obrigatorio value={form.nome} onChange={(v) => alterarCampo("nome", v)} className="md:col-span-2" />
            <Campo label="CPF" value={form.cpf} onChange={(v) => alterarCampo("cpf", v)} />
            <Campo label="RG" value={form.rg} onChange={(v) => alterarCampo("rg", v)} />
            <Campo label="Data de nascimento" type="date" value={form.data_nascimento} onChange={(v) => alterarCampo("data_nascimento", v)} />
          </FormularioSecao>

          <FormularioSecao titulo="📞 Contato">
            <Campo label="Telefone" value={form.telefone} onChange={(v) => alterarCampo("telefone", v)} />
            <Campo label="WhatsApp" value={form.whatsapp} onChange={(v) => alterarCampo("whatsapp", v)} />
            <Campo label="E-mail" type="email" value={form.email} onChange={(v) => alterarCampo("email", v)} className="md:col-span-2" />
          </FormularioSecao>

          <FormularioSecao titulo="🏠 Endereço">
            <Campo label="CEP" value={form.cep} onChange={(v) => alterarCampo("cep", v)} />
            <Campo label="Número" value={form.numero} onChange={(v) => alterarCampo("numero", v)} />
            <Campo label="Endereço" value={form.endereco} onChange={(v) => alterarCampo("endereco", v)} className="md:col-span-2" />
            <Campo label="Bairro" value={form.bairro} onChange={(v) => alterarCampo("bairro", v)} />
            <Campo label="Cidade" value={form.cidade} onChange={(v) => alterarCampo("cidade", v)} />
            <Campo label="Estado" value={form.estado} onChange={(v) => alterarCampo("estado", v)} />
          </FormularioSecao>

          <FormularioSecao titulo="🏛️ Dados da associação">
            <Campo label="Data de associação" type="date" value={form.data_associacao} onChange={(v) => alterarCampo("data_associacao", v)} />

            <SelectCampo
              label="Tipo de sócio"
              value={categoria}
              onChange={(v) => alterarCampo("categoria", v)}
              opcoes={[
                "Patrimonial",
                "Contribuinte",
                "Transitório",
                "Temporada Individual",
                "Temporada Familiar",
                "Dependente",
              ]}
            />

            <SelectCampo
              label="Situação"
              value={form.situacao || "ativo"}
              onChange={(v) => alterarCampo("situacao", v)}
              opcoes={["ativo", "inativo", "suspenso"]}
            />

            <div className="md:col-span-4 rounded-xl bg-[#f7edbd] p-4 text-sm text-[#705c00]">
              <strong>Regra:</strong> sócios Patrimoniais, Contribuintes, Transitórios e Temporada Familiar podem ter dependentes vinculados.
            </div>

            <div className="md:col-span-4">
              <label className="mb-2 block text-sm font-semibold">Observações</label>
              <textarea
                value={form.observacoes || ""}
                onChange={(e) => alterarCampo("observacoes", e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-gray-300 px-4 py-3"
              />
            </div>
          </FormularioSecao>

          <FormularioSecao titulo="💰 Mensalidade e pagamento">
            <Campo label="Valor da mensalidade" type="number" value={form.valor_mensalidade ?? 0} onChange={(v) => alterarCampo("valor_mensalidade", v)} />
            <Campo label="Dia do vencimento" type="number" value={form.dia_vencimento ?? 10} onChange={(v) => alterarCampo("dia_vencimento", v)} />

            <SelectCampo
              label="Tipo de pagamento"
              value={form.tipo_pagamento || "pix"}
              onChange={(v) => alterarCampo("tipo_pagamento", v)}
              opcoes={formaPagamentoOpcoes.map((x) => x.value)}
            />

            <SelectCampo
              label="Situação financeira"
              value={form.situacao_financeira || "em_dia"}
              onChange={(v) => alterarCampo("situacao_financeira", v)}
              opcoes={["em_dia", "em_atraso", "isento"]}
            />

            <Campo label="Data do último pagamento" type="date" value={form.data_ultimo_pagamento} onChange={(v) => alterarCampo("data_ultimo_pagamento", v)} className="md:col-span-2" />

            <div className="rounded-xl bg-[#eef3ef] p-4 md:col-span-2">
              <p className="text-xs font-semibold text-gray-500">Resumo financeiro</p>
              <p className="mt-1 text-lg font-bold text-[#063b28]">
                R$ {Number(form.valor_mensalidade || 0).toFixed(2).replace(".", ",")}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Vencimento: dia {form.dia_vencimento || 10} • {rotuloFormaPagamento(form.tipo_pagamento)}
              </p>
            </div>
          </FormularioSecao>

          <div>
            <div className="mb-4 flex flex-col justify-between gap-3 border-b pb-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-lg font-bold text-[#063b28]">👨‍👩‍👧 Dependentes</h3>
                <p className="text-sm text-gray-500">
                  Cadastre esposa, filhos ou outros dependentes vinculados a este associado.
                </p>
              </div>
              {permiteDependentes && socioEditando && (
                <button
                  onClick={novoDependente}
                  className="rounded-xl bg-[#063b28] px-4 py-2 text-sm font-bold text-white"
                >
                  + Novo dependente
                </button>
              )}
            </div>

            {!socioEditando && (
              <div className="rounded-xl border border-[#f5d76e] bg-[#fffbea] p-4 text-sm text-[#705c00]">
                Salve o cadastro do titular primeiro. Depois você poderá cadastrar os dependentes vinculados à matrícula.
              </div>
            )}

            {!permiteDependentes && socioEditando && (
              <div className="rounded-xl bg-gray-100 p-4 text-sm text-gray-600">
                Este tipo de sócio não possui dependentes vinculados.
              </div>
            )}

            {permiteDependentes && socioEditando && (
              <>
                <div className="mb-5 mt-4 rounded-2xl bg-[#f4f6f3] p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-[#063b28]">
                        {dependenteEditando ? "Editar dependente" : "Novo dependente"}
                      </p>
                      <p className="text-xs text-gray-500">
                        O dependente fica vinculado à matrícula do titular.
                      </p>
                    </div>
                    {dependenteEditando && (
                      <button onClick={novoDependente} className="text-sm font-semibold text-gray-500">
                        Cancelar edição
                      </button>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <Campo label="Nome completo" obrigatorio value={dependenteForm.nome} onChange={(v) => alterarDependente("nome", v)} className="md:col-span-2" />
                    <Campo label="CPF" value={dependenteForm.cpf} onChange={(v) => alterarDependente("cpf", v)} />
                    <Campo label="Data de nascimento" type="date" value={dependenteForm.data_nascimento} onChange={(v) => alterarDependente("data_nascimento", v)} />
                    <SelectCampo
                      label="Parentesco"
                      value={dependenteForm.parentesco}
                      onChange={(v) => alterarDependente("parentesco", v)}
                      opcoes={["Cônjuge", "Filho(a)", "Pai/Mãe", "Irmão(ã)", "Outro"]}
                    />
                    <Campo label="Telefone" value={dependenteForm.telefone} onChange={(v) => alterarDependente("telefone", v)} />
                    <div className="flex items-end gap-3">
                      <label className="flex h-12 cursor-pointer items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold">
                        <input
                          type="checkbox"
                          checked={dependenteForm.ativo}
                          onChange={(e) => alterarDependente("ativo", e.target.checked)}
                          className="h-4 w-4"
                        />
                        Dependente ativo
                      </label>
                    </div>
                    <div className="flex items-end justify-end">
                      <button
                        onClick={salvarDependente}
                        disabled={salvandoDependente}
                        className="rounded-xl bg-[#063b28] px-5 py-3 font-bold text-white disabled:opacity-50"
                      >
                        {salvandoDependente ? "Salvando..." : dependenteEditando ? "💾 Atualizar" : "💾 Cadastrar"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-200">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[750px]">
                      <thead className="bg-[#eef3ef]">
                        <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                          <th className="px-4 py-3">Nome</th>
                          <th className="px-4 py-3">Parentesco</th>
                          <th className="px-4 py-3">CPF</th>
                          <th className="px-4 py-3">Nascimento</th>
                          <th className="px-4 py-3">Situação</th>
                          <th className="px-4 py-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y bg-white">
                        {carregandoDependentes && (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                              Carregando dependentes...
                            </td>
                          </tr>
                        )}
                        {!carregandoDependentes && dependentes.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                              Nenhum dependente cadastrado.
                            </td>
                          </tr>
                        )}
                        {!carregandoDependentes && dependentes.map((dependente) => (
                          <tr key={dependente.id}>
                            <td className="px-4 py-3 font-semibold text-[#063b28]">{dependente.nome}</td>
                            <td className="px-4 py-3">{dependente.parentesco || "-"}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{dependente.cpf || "-"}</td>
                            <td className="px-4 py-3 text-sm">{formatDate(dependente.data_nascimento)}</td>
                            <td className="px-4 py-3">
                              <span className={dependente.ativo ? "rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700" : "rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600"}>
                                {dependente.ativo ? "Ativo" : "Inativo"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button onClick={() => editarDependente(dependente)} className="rounded-lg bg-[#eef3ef] px-3 py-2 text-sm font-semibold text-[#063b28]">
                                  ✏️
                                </button>
                                <button onClick={() => excluirDependente(dependente)} className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">
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
              </>
            )}
          </div>

          {mensagem && (
            <div className="rounded-xl bg-[#eef3ef] px-4 py-3 text-sm font-semibold text-[#063b28]">
              {mensagem}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-6 py-5">
          <button onClick={fechar} disabled={salvando} className="rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700">
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando} className="rounded-xl bg-[#063b28] px-6 py-3 font-bold text-white disabled:opacity-50">
            {salvando ? "Salvando..." : socioEditando ? "💾 Salvar alterações" : "💾 Cadastrar Sócio"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalBase({
  titulo,
  fechar,
  children,
}: {
  titulo: string;
  fechar: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-5">
          <h2 className="text-2xl font-bold text-[#063b28]">{titulo}</h2>
          <button onClick={fechar} className="rounded-full bg-gray-100 px-3 py-2 text-lg">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function ModalBotoes({
  fechar,
  salvar,
  salvando,
  texto,
}: {
  fechar: () => void;
  salvar: () => void;
  salvando: boolean;
  texto: string;
}) {
  return (
    <div className="mt-6 flex justify-end gap-3 border-t pt-5">
      <button onClick={fechar} disabled={salvando} className="rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-700">
        Cancelar
      </button>
      <button onClick={salvar} disabled={salvando} className="rounded-xl bg-[#063b28] px-6 py-3 font-bold text-white disabled:opacity-50">
        {salvando ? "Salvando..." : `💾 ${texto}`}
      </button>
    </div>
  );
}

function FormularioSecao({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-4 border-b pb-3 text-lg font-bold text-[#063b28]">{titulo}</h3>
      <div className="grid gap-4 md:grid-cols-4">{children}</div>
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
        {label}{obrigatorio && <span className="ml-1 text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-[#063b28] focus:ring-2 focus:ring-[#063b28]/10"
      />
    </div>
  );
}

function SelectCampo({
  label,
  value,
  onChange,
  opcoes,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  opcoes: string[];
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-gray-700">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
      >
        {opcoes.map((opcao) => (
          <option key={opcao} value={opcao}>
            {rotuloGenerico(opcao)}
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
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <span className="text-3xl">{icone}</span>
        <span className="rounded-full bg-[#eef3ef] px-3 py-1 text-xs font-semibold text-[#063b28]">Ativo</span>
      </div>
      <p className="mt-5 text-sm font-medium text-gray-500">{titulo}</p>
      <p className="mt-1 text-3xl font-bold text-[#063b28]">{valor}</p>
      <p className="mt-1 text-xs text-gray-500">{descricao}</p>
    </div>
  );
}

function StatCard({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className="mt-1 text-3xl font-bold text-[#063b28]">{valor}</p>
    </div>
  );
}

function ResumoFinanceiro({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-[#063b28]">
        R$ {valor.toFixed(2).replace(".", ",")}
      </p>
    </div>
  );
}

function ModuloEmConstrucao({ nome, icone }: { nome: string; icone: string }) {
  return (
    <div className="flex min-h-[500px] items-center justify-center">
      <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
        <div className="text-5xl">{icone}</div>
        <h2 className="mt-4 text-2xl font-bold text-[#063b28]">{nome}</h2>
        <p className="mt-2 text-gray-500">Este módulo será configurado na próxima etapa.</p>
      </div>
    </div>
  );
}

function rotuloGenerico(valor: string) {
  const mapa: Record<string, string> = {
    debito_em_conta: "Débito em conta",
    pix: "PIX",
    boleto: "Boleto",
    dinheiro: "Dinheiro",
    em_dia: "Em dia",
    em_atraso: "Em atraso",
    isento: "Isento",
    pendente: "Pendente",
    pago: "Pago",
    atrasado: "Atrasado",
    Titular: "Titular",
    Patrimonial: "Patrimonial",
    Contribuinte: "Contribuinte",
    Transitório: "Transitório",
    "Temporada Individual": "Temporada Individual",
    "Temporada Familiar": "Temporada Familiar",
    Dependente: "Dependente",
    Benemérito: "Benemérito",
    Remido: "Remido",
    ativo: "Ativo",
    inativo: "Inativo",
    suspenso: "Suspenso",
  };
  return mapa[valor] || valor;
}

function rotuloFormaPagamento(valor: string | null | undefined) {
  return valor ? rotuloGenerico(valor) : "-";
}

function rotuloFinanceiro(valor: string | null) {
  return valor === "em_atraso" ? "Em atraso" : valor === "isento" ? "Isento" : "Em dia";
}

function statusFinanceiroClass(valor: string | null) {
  return `mb-1 inline-block rounded-full px-3 py-1 text-xs font-bold ${
    valor === "em_atraso"
      ? "bg-red-100 text-red-700"
      : valor === "isento"
        ? "bg-gray-100 text-gray-600"
        : "bg-green-100 text-green-700"
  }`;
}

function rotuloSituacaoSocio(valor: string | null) {
  const v = valor?.toLowerCase();
  return v === "inativo" ? "Inativo" : v === "suspenso" ? "Suspenso" : "Ativo";
}

function statusSocioClass(valor: string | null) {
  const v = valor?.toLowerCase();
  return `rounded-full px-3 py-1 text-xs font-bold ${
    v === "ativo"
      ? "bg-green-100 text-green-700"
      : v === "suspenso"
        ? "bg-yellow-100 text-yellow-700"
        : "bg-red-100 text-red-700"
  }`;
}

function rotuloStatusMensalidade(valor: string | null) {
  return valor === "pago"
    ? "Pago"
    : valor === "atrasado"
      ? "Atrasado"
      : valor === "isento"
        ? "Isento"
        : "Pendente";
}

function statusMensalidadeClass(valor: string | null) {
  return `rounded-full px-3 py-1 text-xs font-bold ${
    valor === "pago"
      ? "bg-green-100 text-green-700"
      : valor === "atrasado"
        ? "bg-red-100 text-red-700"
        : valor === "isento"
          ? "bg-gray-100 text-gray-600"
          : "bg-yellow-100 text-yellow-700"
  }`;
}

function formatDate(valor: string | null) {
  if (!valor) return "-";
  const [ano, mes, dia] = valor.split("T")[0].split("-");
  if (!ano || !mes || !dia) return valor;
  return `${dia}/${mes}/${ano}`;
}

function formatReferencia(valor: string) {
  const [ano, mes] = valor.split("-");
  if (!ano || !mes) return valor;
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(mes) - 1] || mes}/${ano}`;
}

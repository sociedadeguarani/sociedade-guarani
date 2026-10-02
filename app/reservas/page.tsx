"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Clock3, Settings, UserRound, UserRoundCheck, Users } from "lucide-react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";
import ConfirmacaoReserva from "./components/ConfirmacaoReserva";
import ConfirmarPixReserva from "./components/ConfirmarPixReserva";
import ConfiguracaoEspacos from "./components/ConfiguracaoEspacos";
import ReservasTabela from "./components/ReservasTabela";
import type {
  ContaBancaria,
  DependenteReserva,
  Espaco,
  FormaPagamentoReserva,
  PixConfig,
  Recibo,
  Reserva,
  ReservaStatus,
  SocioReserva,
  TipoPessoa,
} from "./types";
import { dataBR, HORARIOS, moeda, normalizarEspaco } from "./utils";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Aba = "reservar" | "reservas" | "admin";
type Perfil = "funcionario" | "administrador" | "administrador_master" | "funcionario_inventario" | "associado" | "";

function recorteReserva(row: Record<string, unknown>): Reserva {
  return {
    id: String(row.id ?? ""),
    espacoId: String(row.espaco_id ?? ""),
    data: String(row.data ?? row.data_reserva ?? ""),
    horario: String(row.horario ?? `${String(row.hora_inicio ?? "").slice(0, 5)} - ${String(row.hora_fim ?? "").slice(0, 5)}`),
    nome: String(row.nome ?? row.responsavel_nome ?? ""),
    socioId: row.socio_id ? String(row.socio_id) : undefined,
    dependenteId: row.dependente_id ? String(row.dependente_id) : undefined,
    matricula: row.matricula == null ? null : String(row.matricula),
    tipoPessoa: row.tipo_pessoa === "nao_socio" ? "nao_socio" : "socio",
    valor: Number(row.valor || 0),
    status: row.status === "cancelada" ? "cancelada" : row.status === "confirmada" ? "confirmada" : "pendente",
    pagamento: row.pagamento === "pix" || row.pagamento === "dinheiro" || row.pagamento === "transferencia" ? row.pagamento : "pendente",
    comprovante_url: row.comprovante_url ? String(row.comprovante_url) : null,
    comprovante_nome: row.comprovante_nome ? String(row.comprovante_nome) : null,
    comprovante_status: row.comprovante_status ? String(row.comprovante_status) : null,
    dataPagamento: row.data_pagamento ? String(row.data_pagamento) : null,
  };
}

function normalizarSocio(row: Record<string, unknown>): SocioReserva {
  return {
    id: String(row.id ?? ""),
    matricula: row.matricula == null ? null : String(row.matricula),
    nome: String(row.nome ?? ""),
    cpf: row.cpf == null ? null : String(row.cpf),
    responsavel_id: row.responsavel_id ? String(row.responsavel_id) : null,
    parentesco: row.parentesco == null ? null : String(row.parentesco),
    situacao: row.situacao == null ? null : String(row.situacao),
  };
}

export default function ReservasPage() {
  const [publico, setPublico] = useState(false);
  const [perfil, setPerfil] = useState<Perfil>("");
  const [aba, setAba] = useState<Aba>("reservar");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [espacos, setEspacos] = useState<Espaco[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [espacoId, setEspacoId] = useState("");
  const [data, setData] = useState("");
  const [horario, setHorario] = useState(HORARIOS[0]);
  const [nome, setNome] = useState("");
  const [socioId, setSocioId] = useState("");
  const [matriculaResponsavel, setMatriculaResponsavel] = useState<number | string | null>(null);
  const [dependenteId, setDependenteId] = useState("");
  const [socios, setSocios] = useState<SocioReserva[]>([]);
  const [dependentes, setDependentes] = useState<DependenteReserva[]>([]);
  const [buscaSocio, setBuscaSocio] = useState("");
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoa>("socio");
  const [etapa, setEtapa] = useState<"selecao" | "confirmacao">("selecao");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | ReservaStatus>("todos");
  const [filtroData, setFiltroData] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [pix, setPix] = useState<PixConfig | null>(null);
  const [arquivoComprovante, setArquivoComprovante] = useState<File | null>(null);
  const [enviandoComprovante, setEnviandoComprovante] = useState(false);
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const [formaPagamentoReserva, setFormaPagamentoReserva] = useState<FormaPagamentoReserva>("pix");
  const [contaBancariaId, setContaBancariaId] = useState("");
  const [editandoReservaId, setEditandoReservaId] = useState<string | null>(null);
  const [salvandoEspacoId, setSalvandoEspacoId] = useState<string | null>(null);
  const [reservaPixConfirmacao, setReservaPixConfirmacao] = useState<Reserva | null>(null);
  const [contaPixConfirmacao, setContaPixConfirmacao] = useState("");
  const [confirmandoPix, setConfirmandoPix] = useState(false);
  const [carregandoReservas, setCarregandoReservas] = useState(false);
  const [carregandoPessoas, setCarregandoPessoas] = useState(false);
  const [pessoasCarregadas, setPessoasCarregadas] = useState(false);

  const podeConfigurar = perfil === "administrador" || perfil === "administrador_master";

  async function tokenAtual() {
    const { data: sessao } = await supabase.auth.getSession();
    return sessao.session?.access_token || "";
  }

  async function recarregarDados(modoPublico = publico) {
    setCarregando(true);
    setErro("");
    try {
      const token = await tokenAtual();
      const params = modoPublico ? "?publico=1&dados=base" : "?dados=base";
      const resposta = await fetch(`/api/reservas${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      });
      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível carregar os espaços.");

      const espacosDb = Array.isArray(resultado?.espacos) ? resultado.espacos : [];
      const contasDb = Array.isArray(resultado?.contas_bancarias) ? resultado.contas_bancarias : [];
      const espacosNormalizados: Espaco[] = espacosDb
        .map((item: Record<string, unknown>) => normalizarEspaco(item))
        .filter((item: Espaco) => Boolean(item.id && item.nome));

      setEspacos(espacosNormalizados);
      setContasBancarias(contasDb.map((item: Record<string, unknown>) => ({
        id: String(item.id ?? ""),
        nome: String(item.nome ?? ""),
        banco: item.banco == null ? null : String(item.banco),
        ativo: item.ativo !== false,
      })));

      if (espacosNormalizados.length) {
        setEspacoId((atual) => espacosNormalizados.some((e: Espaco) => e.id === atual) ? atual : espacosNormalizados[0].id);
      }

      if (!modoPublico) {
        const perfilResponse = await fetch("/api/login/perfil", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const perfilPayload = await perfilResponse.json().catch(() => ({}));
        if (perfilResponse.ok) setPerfil((perfilPayload?.usuario?.perfil || "") as Perfil);
      } else {
        setPerfil("");
        setSocios([]);
        setDependentes([]);
        setReservas([]);
      }
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível carregar as reservas.");
    } finally {
      setCarregando(false);
    }
  }

  async function carregarReservas(opcoes?: { data?: string; espacoId?: string; todas?: boolean }) {
    if (publico) return;
    setCarregandoReservas(true);
    try {
      const token = await tokenAtual();
      const params = new URLSearchParams({ dados: "reservas" });
      if (!opcoes?.todas) {
        if (opcoes?.data) params.set("data", opcoes.data);
        if (opcoes?.espacoId) params.set("espaco_id", opcoes.espacoId);
      }
      const resposta = await fetch(`/api/reservas?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível carregar as reservas.");
      const lista = Array.isArray(resultado?.reservas) ? resultado.reservas : [];
      setReservas(lista.map((item: Record<string, unknown>) => recorteReserva(item)).filter((item: Reserva) => item.id));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível carregar as reservas.");
    } finally {
      setCarregandoReservas(false);
    }
  }

  async function carregarPessoas() {
    if (publico || pessoasCarregadas || carregandoPessoas) return;
    setCarregandoPessoas(true);
    try {
      const token = await tokenAtual();
      const [sociosResponse, carteirinhasResponse] = await Promise.all([
        fetch("/api/socios", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
        fetch("/api/carteirinhas", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
      ]);
      const sociosPayload = await sociosResponse.json().catch(() => ({}));
      if (!sociosResponse.ok) throw new Error(sociosPayload?.error || "Não foi possível carregar os sócios.");
      const sociosDb = Array.isArray(sociosPayload?.socios) ? sociosPayload.socios : [];
      setSocios(
        sociosDb
          .filter((row: Record<string, unknown>) => {
            const matricula = String(row.matricula ?? "").trim().toUpperCase();
            return !row.responsavel_id || /^SD\d+A$/.test(matricula);
          })
          .map((row: Record<string, unknown>) => normalizarSocio(row)),
      );

      const carteirinhasPayload = await carteirinhasResponse.json().catch(() => ({}));
      const dependentesLegados = Array.isArray(carteirinhasPayload?.dependentes) ? carteirinhasPayload.dependentes : [];
      const porId = new Map<string, DependenteReserva>();
      for (const row of sociosDb as Record<string, unknown>[]) {
        const matricula = String(row.matricula ?? "").trim().toUpperCase();
        if (!row.responsavel_id || /^SD\d+A$/.test(matricula)) continue;
        if (String(row.situacao || "").toLowerCase() === "inativo") continue;
        porId.set(String(row.id), {
          id: String(row.id), socio_id: String(row.responsavel_id), matricula: row.matricula == null ? null : String(row.matricula),
          nome: String(row.nome || ""), parentesco: row.parentesco == null ? null : String(row.parentesco), ativo: true,
        });
      }
      for (const row of dependentesLegados as Record<string, unknown>[]) {
        const matricula = String(row.matricula ?? "").trim().toUpperCase();
        if (/^SD\d+A$/.test(matricula) || row.ativo === false) continue;
        porId.set(String(row.id), {
          id: String(row.id), socio_id: String(row.socio_id), matricula: row.matricula == null ? null : String(row.matricula),
          nome: String(row.nome || ""), parentesco: row.parentesco == null ? null : String(row.parentesco), ativo: true,
        });
      }
      setDependentes(Array.from(porId.values()));
      setPessoasCarregadas(true);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível carregar os sócios.");
    } finally {
      setCarregandoPessoas(false);
    }
  }


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const modoPublico = params.get("publico") === "1";
    const statusInicial = params.get("status");

    setPublico(modoPublico);
    if (modoPublico) {
      setTipoPessoa("nao_socio");
    } else if (statusInicial === "pendente" || statusInicial === "confirmada" || statusInicial === "cancelada") {
      setAba("reservas");
      setFiltroStatus(statusInicial);
    }

    void recarregarDados(modoPublico);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (publico || aba !== "reservas") return;
    void carregarReservas({ todas: true });
  }, [aba, publico]);

  useEffect(() => {
    if (publico || aba !== "reservar" || !data || !espacoId) return;
    void carregarReservas({ data, espacoId });
  }, [aba, publico, data, espacoId]);

  useEffect(() => {
    if (!espacos.some((item) => item.id === espacoId)) {
      setEspacoId(espacos[0]?.id || "");
    }
  }, [espacos, espacoId]);

  const espacosDisponiveis = useMemo(
    () => (tipoPessoa === "nao_socio" ? espacos.filter((e) => e.permiteNaoSocio && e.precoNaoSocio > 0) : espacos),
    [espacos, tipoPessoa],
  );

  const espaco = espacos.find((e) => e.id === espacoId);
  const bloqueadoNaoSocio = !!espaco && (espaco.precoNaoSocio <= 0 || !espaco.permiteNaoSocio);
  const valor = espaco ? (tipoPessoa === "socio" ? espaco.precoSocio : espaco.precoNaoSocio) : 0;

  useEffect(() => {
    let ativo = true;
    if (valor <= 0) {
      setPix(null);
      return () => {
        ativo = false;
      };
    }
    void (async () => {
      try {
        const resposta = await fetch(`/api/configuracao-pix?valor=${encodeURIComponent(valor.toFixed(2))}`, { cache: "no-store" });
        const resultado = await resposta.json().catch(() => ({}));
        if (!ativo) return;
        setPix(resposta.ok && resultado?.config ? resultado.config : null);
      } catch {
        if (ativo) setPix(null);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [valor]);

  const ocupados = useMemo(
    () => reservas.filter((r) => r.status !== "cancelada" && r.espacoId === espacoId && r.data === data).map((r) => r.horario),
    [reservas, espacoId, data],
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return reservas.filter((r) => {
      const nomeEspaco = espacos.find((e) => e.id === r.espacoId)?.nome || "";
      const texto = `${r.nome} ${nomeEspaco} ${r.matricula ?? ""}`.toLowerCase();
      return (!termo || texto.includes(termo)) &&
        (filtroStatus === "todos" || r.status === filtroStatus) &&
        (!filtroData || r.data === filtroData);
    });
  }, [reservas, espacos, busca, filtroStatus, filtroData]);

  const estatisticas = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return reservas.reduce(
      (acc, r) => {
        if (r.status === "confirmada") acc.confirmadas += 1;
        else if (r.status === "pendente") acc.pendentes += 1;
        else acc.canceladas += 1;
        if (r.data === hoje && r.status !== "cancelada") acc.hoje += 1;
        return acc;
      },
      { hoje: 0, confirmadas: 0, pendentes: 0, canceladas: 0 },
    );
  }, [reservas]);

  function mudarTipo(tipo: TipoPessoa) {
    setTipoPessoa(tipo);
    setEtapa("selecao");
    if (tipo === "nao_socio") {
      setSocioId("");
      setDependenteId("");
      setMatriculaResponsavel(null);
      setBuscaSocio("");
      setNome("");
    }
  }

  function continuar() {
    if (!espaco) return alert("Selecione um espaço disponível.");
    if (tipoPessoa === "nao_socio" && bloqueadoNaoSocio) return alert("Este espaço não pode ser alugado por não sócios.");
    if (!data) return alert("Selecione a data da reserva.");
    if (!nome.trim()) return alert("Informe o nome do responsável pela reserva.");
    if (ocupados.includes(horario) && !editandoReservaId) return alert("Este horário já está reservado para este espaço.");
    if (data < new Date().toISOString().slice(0, 10)) return alert("A data da reserva não pode ser anterior a hoje.");
    setEtapa("confirmacao");
  }

  async function operadorAtual() {
    try {
      const { data: sessao } = await supabase.auth.getSession();
      return sessao.session?.user?.user_metadata?.nome_exibicao || sessao.session?.user?.email || "Funcionário da portaria";
    } catch {
      return "Funcionário da portaria";
    }
  }

  function textoRecibo(item: Recibo) {
    return `SOCIEDADE RECREATIVA GUARANI — S.R.G.\nRECIBO Nº ${item.numero}\n\nTipo: ${item.tipo}\nResponsável: ${item.nome}${item.matricula ? ` — Matrícula ${item.matricula}` : ""}\n${item.detalhe}\nData/Horário: ${item.periodo}\nValor: ${moeda(item.valor)}\nPagamento: ${item.pagamento}\nStatus: ${item.status}\nAtendido por: ${item.operador}\nData/hora: ${item.dataHora}\n\nDocumento gerado pelo Sistema Guarani.`;
  }

  function imprimirRecibo(item: Recibo) {
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${item.numero} - Recibo</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#173d2e}h1{color:#005a3c;margin-bottom:4px}h2{font-size:18px;color:#005a3c}.box{border:1px solid #cfe3d8;border-radius:14px;padding:20px;margin-top:20px}p{margin:8px 0}.total{font-size:22px;font-weight:800;color:#005a3c}.rodape{margin-top:32px;font-size:12px;color:#667}@media print{body{padding:20px}}</style></head><body><h1>SOCIEDADE RECREATIVA GUARANI</h1><div>S.R.G.</div><h2>RECIBO Nº ${item.numero}</h2><div class="box"><p><b>Tipo:</b> ${item.tipo}</p><p><b>Responsável:</b> ${item.nome}${item.matricula ? ` — Matrícula ${item.matricula}` : ""}</p><p><b>${item.detalhe.split(":")[0]}:</b> ${item.detalhe.split(":").slice(1).join(":").trim()}</p><p><b>Data/Horário:</b> ${item.periodo}</p><p class="total">Valor: ${moeda(item.valor)}</p><p><b>Pagamento:</b> ${item.pagamento}</p><p><b>Status:</b> ${item.status}</p><p><b>Atendido por:</b> ${item.operador}</p><p><b>Data/hora:</b> ${item.dataHora}</p></div><div class="rodape">Documento gerado pelo Sistema Guarani.</div><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  async function enviarRecibo(item: Recibo) {
    const texto = textoRecibo(item);
    try {
      if (navigator.share) await navigator.share({ title: `Recibo ${item.numero} - Sociedade Guarani`, text: texto });
      else {
        await navigator.clipboard.writeText(texto);
        alert("Recibo copiado. Cole no WhatsApp, e-mail ou outro aplicativo para enviar.");
      }
    } catch {
      // Fechamento/cancelamento do compartilhamento pelo usuário.
    }
  }

  async function registrarAvisoAdministrativo(titulo: string, mensagem: string) {
    try {
      const token = await tokenAtual();
      if (!token) return;
      const resposta = await fetch("/api/avisos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ titulo, mensagem, interno: true }),
      });
      if (!resposta.ok) console.warn("Aviso administrativo não registrado.");
    } catch (error) {
      console.warn("Não foi possível registrar aviso administrativo:", error);
    }
  }

  function editarReserva(reserva: Reserva) {
    setEditandoReservaId(reserva.id);
    setEspacoId(reserva.espacoId);
    setData(reserva.data);
    setHorario(reserva.horario);
    setNome(reserva.nome);
    setSocioId(reserva.socioId || "");
    setDependenteId(reserva.dependenteId || "");
    setMatriculaResponsavel(reserva.matricula ?? null);
    setTipoPessoa(reserva.tipoPessoa);
    setFormaPagamentoReserva(reserva.pagamento === "dinheiro" ? "dinheiro" : "pix");
    setEtapa("selecao");
    setAba("reservar");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function confirmar() {
    if (!espaco) return;
    if (tipoPessoa === "nao_socio" && bloqueadoNaoSocio) return alert("Este espaço não está liberado para não sócios.");
    if (!data || !nome.trim()) return alert("Preencha data e responsável antes de continuar.");

    if (formaPagamentoReserva === "dinheiro" && valor > 0 && !contaBancariaId) {
      return alert("Selecione a conta/caixa que recebeu o dinheiro.");
    }
    if (formaPagamentoReserva === "pix" && valor > 0 && !pix?.copia_e_cola) {
      return alert("O PIX da Sociedade ainda não está configurado para este valor.");
    }

    if (arquivoComprovante) {
      const permitido = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!permitido.includes(arquivoComprovante.type)) return alert("Envie o comprovante em JPG, PNG, WEBP ou PDF.");
      if (arquivoComprovante.size > 8 * 1024 * 1024) return alert("O comprovante deve ter no máximo 8 MB.");
    }

    if (publico) return alert("A reserva pública é somente para consulta nesta etapa. Faça a reserva pelo acesso da Sociedade.");

    setEnviandoComprovante(true);
    try {
      const token = await tokenAtual();
      if (!token) throw new Error("Sua sessão expirou. Entre novamente no sistema.");

      const pagamento = valor > 0 ? formaPagamentoReserva : "pendente";
      const payload = {
        id: editandoReservaId || undefined,
        acao: editandoReservaId ? "editar" : undefined,
        espaco_id: espacoId,
        espaco_nome: espaco.nome,
        data,
        horario,
        nome: nome.trim(),
        socio_id: socioId || null,
        dependente_id: dependenteId || null,
        matricula: matriculaResponsavel ?? null,
        tipo_pessoa: tipoPessoa,
        valor,
        pagamento,
        conta_bancaria_id: pagamento === "dinheiro" ? contaBancariaId : null,
      };

      const resposta = await fetch("/api/reservas", {
        method: editandoReservaId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível gravar a reserva no banco.");

      let reservaSalva = recorteReserva(resultado.reserva || {});

      if (arquivoComprovante && reservaSalva.id && formaPagamentoReserva === "pix") {
        const form = new FormData();
        form.append("origem_tipo", "reserva");
        form.append("origem_id", reservaSalva.id);
        form.append("arquivo", arquivoComprovante);
        const envio = await fetch("/api/reservas/comprovante", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const resultadoComprovante = await envio.json().catch(() => ({}));
        if (!envio.ok) throw new Error(resultadoComprovante?.error || "A reserva foi gravada, mas o comprovante não pôde ser enviado.");
        reservaSalva = { ...reservaSalva, comprovante_url: resultadoComprovante.url || null, status: "pendente", pagamento: "pix" };
      }

      await carregarReservas({ todas: true });
      setRecibo({
        id: reservaSalva.id,
        numero: `RS-${reservaSalva.id.slice(0, 6).toUpperCase() || Date.now().toString().slice(-6)}`,
        tipo: "Reserva de espaço",
        nome: reservaSalva.nome || nome,
        matricula: matriculaResponsavel,
        detalhe: `Espaço: ${espaco.nome}`,
        periodo: `${dataBR(data)} — ${horario}`,
        valor,
        pagamento: pagamento === "pix" ? "PIX" : pagamento === "dinheiro" ? "Dinheiro" : "Sem cobrança",
        operador: await operadorAtual(),
        status: pagamento === "pix" ? "Aguardando conferência" : "Pago",
        dataHora: new Date().toLocaleString("pt-BR"),
      });

      await registrarAvisoAdministrativo(
        editandoReservaId ? "✏️ Reserva alterada na portaria" : "📅 Reserva realizada na portaria",
        `${reservaSalva.nome || nome}${matriculaResponsavel ? ` (matrícula ${matriculaResponsavel})` : ""} — ${espaco.nome} — ${dataBR(data)} ${horario} — ${moeda(valor)} — ${pagamento === "pix" ? "PIX" : pagamento === "dinheiro" ? "Dinheiro" : "Sem cobrança"}.`,
      );

      setEtapa("selecao");
      setAba("reservas");
      setNome("");
      setSocioId("");
      setDependenteId("");
      setMatriculaResponsavel(null);
      setBuscaSocio("");
      setData("");
      setArquivoComprovante(null);
      setContaBancariaId("");
      setFormaPagamentoReserva("pix");
      setEditandoReservaId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível concluir a reserva.");
    } finally {
      setEnviandoComprovante(false);
    }
  }

  async function cancelarReserva(id: string) {
    if (!confirm("Deseja realmente cancelar esta reserva?")) return;
    try {
      const token = await tokenAtual();
      const resposta = await fetch("/api/reservas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, acao: "cancelar" }),
      });
      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível cancelar a reserva.");
      await carregarReservas({ todas: true });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível cancelar a reserva.");
    }
  }

  async function confirmarPixAdmin() {
    if (!reservaPixConfirmacao) return;
    if (!contaPixConfirmacao) return alert("Selecione a conta bancária que recebeu o PIX.");
    setConfirmandoPix(true);
    try {
      const token = await tokenAtual();
      const resposta = await fetch("/api/reservas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: reservaPixConfirmacao.id, acao: "confirmar_pix", conta_bancaria_id: contaPixConfirmacao }),
      });
      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível confirmar o PIX.");
      setReservaPixConfirmacao(null);
      setContaPixConfirmacao("");
      await carregarReservas({ todas: true });
      alert("PIX confirmado. A entrada foi registrada no Financeiro.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível confirmar o PIX.");
    } finally {
      setConfirmandoPix(false);
    }
  }

  async function abrirComprovante(path: string) {
    if (!path) return;
    if (/^https?:\/\//i.test(path)) {
      window.open(path, "_blank", "noopener,noreferrer");
      return;
    }
    const { data: signed, error: signedError } = await supabase.storage.from("comprovantes-financeiro").createSignedUrl(path, 10 * 60);
    if (signedError || !signed?.signedUrl) return alert("Não foi possível abrir o comprovante.");
    window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
  }

  function copiarResumo() {
    const texto = `Sociedade Guarani\nEspaço: ${espaco?.nome || "—"}\nData: ${dataBR(data)}\nHorário: ${horario}\nResponsável: ${nome}\nTipo: ${tipoPessoa === "socio" ? "Sócio" : "Não sócio"}\nValor: ${moeda(valor)}`;
    void navigator.clipboard.writeText(texto);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1500);
  }

  function copiarPix() {
    if (!pix?.copia_e_cola) return;
    void navigator.clipboard.writeText(pix.copia_e_cola);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1500);
  }

  const sociosFiltrados = useMemo(() => {
    const termo = buscaSocio.trim().toLowerCase();
    const relacionados = new Map<string, SocioReserva>();
    for (const socio of socios) {
      const textoTitular = `${socio.nome} ${socio.matricula ?? ""} ${socio.cpf ?? ""}`.toLowerCase();
      if (!termo || textoTitular.includes(termo)) {
        relacionados.set(socio.id, socio);
        continue;
      }
      const matriculaTitular = String(socio.matricula ?? "").trim().toUpperCase();
      const baseFamiliar = matriculaTitular.endsWith("A") ? matriculaTitular.slice(0, -1) : matriculaTitular;
      const achouDependente = dependentes.some((d) => {
        const texto = `${d.nome} ${d.matricula ?? ""} ${d.parentesco ?? ""}`.toLowerCase();
        const matricula = String(d.matricula ?? "").trim().toUpperCase();
        const pertence = String(d.socio_id) === socio.id || (!!baseFamiliar && matricula.startsWith(baseFamiliar) && matricula !== matriculaTitular);
        return pertence && texto.includes(termo) && !/^SD\d+A$/.test(matricula);
      });
      if (achouDependente) relacionados.set(socio.id, socio);
    }
    return Array.from(relacionados.values()).slice(0, 20);
  }, [socios, dependentes, buscaSocio]);

  const dependentesDoSocio = useMemo(() => {
    if (!socioId) return [];
    const titular = socios.find((s) => s.id === socioId);
    const matriculaTitular = String(titular?.matricula ?? "").trim().toUpperCase();
    const baseFamiliar = matriculaTitular.endsWith("A") ? matriculaTitular.slice(0, -1) : matriculaTitular;
    const unicos = new Map<string, DependenteReserva>();
    for (const d of dependentes) {
      const matricula = String(d.matricula ?? "").trim().toUpperCase();
      if (/^SD\d+A$/.test(matricula)) continue;
      const direto = d.socio_id === socioId;
      const porMatricula = !!baseFamiliar && matricula.startsWith(baseFamiliar) && matricula !== matriculaTitular && /[A-Z]$/.test(matricula);
      if (direto || porMatricula) unicos.set(d.id, d);
    }
    return Array.from(unicos.values()).sort((a, b) => String(a.matricula ?? a.nome).localeCompare(String(b.matricula ?? b.nome), "pt-BR", { numeric: true }));
  }, [dependentes, socios, socioId]);

  function selecionarDependente(id: string, socioResponsavelId = socioId) {
    const dependente = dependentesDoSocio.find((d) => d.id === id);
    const titular = socios.find((s) => s.id === socioResponsavelId);
    setDependenteId(id);
    if (dependente) {
      setNome(dependente.nome);
      setMatriculaResponsavel(dependente.matricula || null);
      setBuscaSocio(`${dependente.nome}${dependente.matricula ? ` — Matrícula ${dependente.matricula}` : ""}`);
    } else if (titular) {
      setNome(titular.nome);
      setMatriculaResponsavel(titular.matricula ?? null);
    }
  }

  async function salvarEspaco(id: string, precoSocio: number, precoNaoSocio: number, permiteNaoSocio: boolean) {
    setSalvandoEspacoId(id);
    try {
      const token = await tokenAtual();
      const resposta = await fetch("/api/reservas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ acao: "editar_espaco", id, preco_socio: precoSocio, preco_nao_socio: precoNaoSocio, permite_nao_socio: permiteNaoSocio }),
      });
      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível salvar o espaço.");
      setEspacos((atual) => atual.map((item) => item.id === id ? normalizarEspaco(resultado.espaco as Record<string, unknown>) : item));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível salvar o espaço.");
    } finally {
      setSalvandoEspacoId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      {!publico && <><CabecalhoPadrao /><MenuLateralPadrao /></>}

      <main className={`min-h-screen px-4 py-6 lg:px-7 lg:py-8 ${publico ? "" : "lg:ml-[220px]"}`}>
        <div className="mx-auto max-w-[1400px] space-y-6">
          {publico && (
            <div className="flex items-center justify-between rounded-2xl border bg-white px-5 py-4 shadow-sm">
              <div className="flex items-center gap-3"><img src="/logo-guarani.png" className="h-12 w-12 object-contain" alt="Sociedade Guarani" /><div><b className="text-[#005a3c]">SOCIEDADE GUARANI</b><div className="text-xs text-gray-500">Reserva de espaços</div></div></div>
              <button onClick={() => (window.location.href = "/login")} className="rounded-xl border px-4 py-2 text-sm font-bold">Voltar ao login</button>
            </div>
          )}

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div><p className="text-sm text-gray-500">{publico ? "Reserva online" : "Administração"}</p><h1 className="text-3xl font-extrabold text-[#005a3c]">Reservas</h1><p className="mt-1 text-sm text-gray-500">Agendamento de quadras, quiosques e salões.</p></div>
            {!publico && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setAba("reservar")} className={`rounded-xl px-4 py-2.5 font-bold ${aba === "reservar" ? "bg-[#005a3c] text-white" : "bg-white shadow-sm"}`}>Nova reserva</button>
                <button onClick={() => setAba("reservas")} className={`rounded-xl px-4 py-2.5 font-bold ${aba === "reservas" ? "bg-[#005a3c] text-white" : "bg-white shadow-sm"}`}>Reservas</button>
                {podeConfigurar && <button onClick={() => setAba("admin")} className={`rounded-xl px-4 py-2.5 font-bold ${aba === "admin" ? "bg-[#005a3c] text-white" : "bg-white shadow-sm"}`}><Settings className="mr-2 inline h-4 w-4" />Configurar espaços</button>}
              </div>
            )}
          </div>

          {erro && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{erro}<button className="ml-3 font-bold underline" onClick={() => void recarregarDados()}>Tentar novamente</button></div>}

          {carregando ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {[1, 2, 3, 4].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl border bg-white" />)}
            </div>
          ) : (
            <>
              {(publico || aba === "reservar") && (
                <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
                  <div className="space-y-4">
                    <section className="rounded-2xl border bg-white p-5 shadow-sm">
                      <h2 className="text-xl font-extrabold text-[#005a3c]">1. Quem está fazendo a reserva?</h2>
                      <p className="mt-1 text-sm text-gray-500">O sistema aplica automaticamente a tarifa e as regras de acesso.</p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <button onClick={() => mudarTipo("socio")} className={`rounded-2xl border-2 p-5 text-left ${tipoPessoa === "socio" ? "border-[#005a3c] bg-[#e8f3ee]" : "border-[#dfe7e2]"}`}>
                          <UserRoundCheck className="h-8 w-8 text-[#005a3c]" /><b className="mt-3 block text-lg">Sou sócio</b><span className="text-sm text-gray-500">Acesso aos espaços liberados para associados.</span>
                        </button>
                        <button onClick={() => mudarTipo("nao_socio")} className={`rounded-2xl border-2 p-5 text-left ${tipoPessoa === "nao_socio" ? "border-[#f4b400] bg-[#fff8df]" : "border-[#dfe7e2]"}`}>
                          <UserRound className="h-8 w-8 text-[#8a6700]" /><b className="mt-3 block text-lg">Não sou sócio</b><span className="text-sm text-gray-500">Somente espaços liberados pela administração.</span>
                        </button>
                      </div>
                    </section>

                    <section className="rounded-2xl border bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold text-[#005a3c]">2. Escolha o espaço</h2><p className="mt-1 text-sm text-gray-500">Os espaços abaixo vêm diretamente do banco.</p></div><span className="rounded-full bg-[#e8f3ee] px-3 py-1 text-xs font-bold text-[#005a3c]">{espacosDisponiveis.length} disponíveis</span></div>
                      {carregando && !espacos.length ? (
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-[#dfe7e2] bg-gray-50" />)}
                        </div>
                      ) : !espacosDisponiveis.length ? (
                        <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-5 text-center text-sm font-semibold text-yellow-800">Nenhum espaço liberado está cadastrado no banco.</div>
                      ) : (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {espacosDisponiveis.map((e) => <button key={e.id} onClick={() => setEspacoId(e.id)} className={`rounded-2xl border p-4 text-left ${e.id === espacoId ? "border-[#005a3c] bg-[#e8f3ee]" : "border-[#dfe7e2]"}`}><span className="text-[10px] font-extrabold uppercase text-[#005a3c]">{e.categoria}</span><h3 className="mt-2 font-extrabold">{e.nome}</h3><div className="mt-3 flex justify-between border-t pt-3 text-sm"><span>{e.cobranca === "hora" ? "Por hora" : "Por diária"}</span><b className="text-[#005a3c]">{moeda(tipoPessoa === "socio" ? e.precoSocio : e.precoNaoSocio)}</b></div></button>)}
                        </div>
                      )}
                    </section>

                    <section className="rounded-2xl border bg-white p-5 shadow-sm">
                      <h2 className="text-xl font-extrabold text-[#005a3c]">3. Responsável</h2>
                      {tipoPessoa === "socio" && !publico ? (
                        <div className="relative mt-4">
                          <div className="flex items-center gap-2 rounded-xl border px-3 py-3 focus-within:border-[#005a3c]"><Users className="h-5 w-5 text-gray-400" /><input value={buscaSocio} onFocus={() => void carregarPessoas()} onChange={(e) => { setBuscaSocio(e.target.value); setSocioId(""); setDependenteId(""); setMatriculaResponsavel(null); setNome(""); }} placeholder={carregandoPessoas ? "Carregando sócios..." : "Buscar sócio por nome ou matrícula..."} className="w-full outline-none" /></div>
                          {buscaSocio && !socioId && <div className="absolute z-20 mt-2 max-h-[430px] w-full overflow-y-auto rounded-xl border bg-white shadow-lg">{sociosFiltrados.length ? sociosFiltrados.map((s) => {
                            const titularMatricula = String(s.matricula ?? "").trim().toUpperCase();
                            const baseFamiliar = titularMatricula.endsWith("A") ? titularMatricula.slice(0, -1) : titularMatricula;
                            const familia = dependentes.filter((d) => { const m = String(d.matricula ?? "").trim().toUpperCase(); const pertence = String(d.socio_id) === String(s.id) || (!!baseFamiliar && m.startsWith(baseFamiliar) && m !== titularMatricula && /[A-Z]$/.test(m)); return pertence && !/^SD\d+A$/.test(m); });
                            return <div key={s.id} className="border-b last:border-b-0"><button type="button" onClick={() => { setSocioId(s.id); setDependenteId(""); setNome(s.nome); setMatriculaResponsavel(s.matricula); setBuscaSocio(`${s.nome}${s.matricula ? ` — Matrícula ${s.matricula}` : ""}`); }} className="block w-full px-4 py-3 text-left hover:bg-[#e8f3ee]"><div className="flex items-center justify-between gap-3"><div><b>{s.nome}</b><span className="ml-2 text-xs text-gray-500">Matrícula: {s.matricula ?? "—"}</span></div><span className="text-xs font-extrabold text-[#005a3c]">Titular</span></div></button>{familia.length > 0 && <div className="bg-[#f8faf9] px-3 pb-3"><div className="px-2 pb-2 pt-1 text-[10px] font-extrabold uppercase tracking-wide text-[#78968a]">Dependentes da família</div><div className="space-y-1.5">{familia.map((d) => <button key={d.id} type="button" onClick={() => { setSocioId(s.id); selecionarDependente(d.id, s.id); }} className="flex w-full items-center justify-between rounded-lg border border-[#d9e9e2] bg-white px-3 py-2 text-left hover:border-[#005a3c] hover:bg-[#e8f3ee]"><span><b className="text-sm">{d.nome}</b><span className="ml-2 text-xs text-gray-500">{d.matricula || "Sem matrícula"}{d.parentesco ? ` · ${d.parentesco}` : ""}</span></span><span className="text-[10px] font-extrabold text-[#005a3c]">Dependente</span></button>)}</div></div>}</div>;
                          }) : <div className="p-4 text-sm text-gray-500">Nenhum sócio encontrado.</div>}</div>}
                          {socioId && <div className="mt-3 flex items-center justify-between rounded-xl bg-[#e8f3ee] p-3 text-sm"><span><b>{nome}</b> · Matrícula {matriculaResponsavel ?? "—"}{dependenteId ? " · Dependente" : " · Titular"}</span><button type="button" onClick={() => { setSocioId(""); setDependenteId(""); setNome(""); setMatriculaResponsavel(null); setBuscaSocio(""); }} className="font-bold text-[#005a3c]">Trocar</button></div>}
                        </div>
                      ) : <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo do responsável" className="mt-4 w-full rounded-xl border px-3 py-3 outline-none focus:border-[#005a3c]" />}
                    </section>
                  </div>

                  <aside className="h-fit rounded-2xl border bg-white p-5 shadow-sm lg:sticky lg:top-6">
                    <h2 className="text-xl font-extrabold text-[#005a3c]">4. Data e horário</h2>
                    {tipoPessoa === "nao_socio" && bloqueadoNaoSocio && <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">🔒 Este espaço está bloqueado para não sócios.</div>}
                    <label className="mt-4 block"><span className="text-xs font-bold uppercase text-gray-500">Data</span><input type="date" value={data} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setData(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
                    {espaco?.cobranca === "hora" && <label className="mt-4 block"><span className="text-xs font-bold uppercase text-gray-500">Horário</span><select value={horario} onChange={(e) => setHorario(e.target.value)} className="mt-1 w-full rounded-xl border bg-white px-3 py-3">{HORARIOS.map((h) => <option key={h} value={h} disabled={ocupados.includes(h) && !editandoReservaId}>{h}{ocupados.includes(h) && !editandoReservaId ? " — ocupado" : ""}</option>)}</select></label>}
                    <div className={`mt-4 rounded-xl p-4 ${tipoPessoa === "socio" ? "bg-[#e8f3ee]" : "bg-[#fff8df]"}`}><div className="text-xs text-gray-500">Tipo</div><b>{tipoPessoa === "socio" ? "Sócio" : "Não sócio"}</b>{tipoPessoa === "socio" && matriculaResponsavel && <div className="mt-2 text-sm"><span className="text-gray-500">Matrícula:</span> <b>{matriculaResponsavel}</b></div>}<div className="mt-3 flex justify-between text-sm"><span>Espaço</span><b>{espaco?.nome || "—"}</b></div><div className="flex justify-between text-sm"><span>Data</span><b>{dataBR(data)}</b></div><div className="flex justify-between text-sm"><span>Horário</span><b>{horario}</b></div><div className="mt-3 flex justify-between border-t pt-3 text-lg"><span>Total</span><b className="text-[#005a3c]">{moeda(valor)}</b></div></div>
                    <button disabled={!espaco || (tipoPessoa === "nao_socio" && bloqueadoNaoSocio)} onClick={continuar} className="mt-4 w-full rounded-xl bg-[#005a3c] px-4 py-3 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40">Continuar</button>
                  </aside>
                </section>
              )}

              {!publico && aba === "reservas" ? (
                <div className="relative">
                  {carregandoReservas && <div className="mb-3 rounded-xl bg-[#e8f3ee] px-4 py-2 text-sm font-semibold text-[#005a3c]">Atualizando reservas...</div>}
                  <ReservasTabela
                    filtradas={filtradas}
                    espacos={espacos}
                    reservasHoje={estatisticas.hoje}
                    confirmadas={estatisticas.confirmadas}
                    pendentes={estatisticas.pendentes}
                    canceladas={estatisticas.canceladas}
                    busca={busca}
                    filtroStatus={filtroStatus}
                    filtroData={filtroData}
                    onBusca={setBusca}
                    onFiltroStatus={setFiltroStatus}
                    onFiltroData={setFiltroData}
                    onLimparFiltros={() => { setBusca(""); setFiltroStatus("todos"); setFiltroData(""); }}
                    onComprovante={(path) => void abrirComprovante(path)}
                    onEditar={editarReserva}
                    onCancelar={cancelarReserva}
                    onRecibo={setRecibo}
                    onConfirmarPix={(reserva) => { setReservaPixConfirmacao(reserva); setContaPixConfirmacao(contasBancarias[0]?.id || ""); }}
                    podeConfirmarPix={podeConfigurar}
                    operadorAtual={operadorAtual}
                  />
                </div>
              ) : null}

              {!publico && aba === "admin" && podeConfigurar && <ConfiguracaoEspacos espacos={espacos} salvandoId={salvandoEspacoId} onSalvar={salvarEspaco} />}

              {etapa === "confirmacao" && (publico || aba === "reservar") && (
                <ConfirmacaoReserva tipoPessoa={tipoPessoa} espacoNome={espaco?.nome || ""} data={data} horario={horario} nome={nome} matricula={matriculaResponsavel} valor={valor} publico={publico} formaPagamento={formaPagamentoReserva} pix={pix} copiado={copiado} arquivo={arquivoComprovante} contasBancarias={contasBancarias} contaBancariaId={contaBancariaId} enviando={enviandoComprovante} onVoltar={() => setEtapa("selecao")} onFormaPagamento={setFormaPagamentoReserva} onContaBancaria={setContaBancariaId} onArquivo={setArquivoComprovante} onCopiarPix={copiarPix} onCopiarResumo={copiarResumo} onConfirmar={() => void confirmar()} />
              )}

              {reservaPixConfirmacao && <ConfirmarPixReserva reserva={reservaPixConfirmacao} espacoNome={espacos.find((e) => e.id === reservaPixConfirmacao.espacoId)?.nome || "—"} contasBancarias={contasBancarias} contaBancariaId={contaPixConfirmacao} salvando={confirmandoPix} onContaBancaria={setContaPixConfirmacao} onConfirmar={() => void confirmarPixAdmin()} onFechar={() => { if (!confirmandoPix) { setReservaPixConfirmacao(null); setContaPixConfirmacao(""); } }} />}

              {recibo && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#001f16]/60 p-4"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-gray-500">Sociedade Recreativa Guarani</p><h2 className="mt-1 text-2xl font-extrabold text-[#005a3c]">Recibo {recibo.numero}</h2></div><button onClick={() => setRecibo(null)} className="rounded-full bg-gray-100 px-3 py-2">✕</button></div><div className="mt-5 rounded-2xl border border-[#cfe3d8] bg-[#f8faf9] p-5 text-sm"><p><b>Tipo:</b> {recibo.tipo}</p><p className="mt-2"><b>Responsável:</b> {recibo.nome}{recibo.matricula ? ` — Matrícula ${recibo.matricula}` : ""}</p><p className="mt-2"><b>{recibo.detalhe.split(":")[0]}:</b> {recibo.detalhe.split(":").slice(1).join(":").trim()}</p><p className="mt-2"><b>Data/Horário:</b> {recibo.periodo}</p><p className="mt-3 text-2xl font-extrabold text-[#005a3c]">{moeda(recibo.valor)}</p><p className="mt-2"><b>Pagamento:</b> {recibo.pagamento}</p><p className="mt-2"><b>Status:</b> {recibo.status}</p><p className="mt-2"><b>Atendido por:</b> {recibo.operador}</p><p className="mt-2 text-xs text-gray-500">{recibo.dataHora}</p></div><div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3"><button onClick={() => imprimirRecibo(recibo)} className="rounded-xl bg-[#005a3c] px-4 py-3 font-bold text-white">🖨 Imprimir / PDF</button><button onClick={() => void enviarRecibo(recibo)} className="rounded-xl border border-[#005a3c] px-4 py-3 font-bold text-[#005a3c]">📤 Enviar</button><button onClick={() => void navigator.clipboard?.writeText(textoRecibo(recibo))} className="rounded-xl border px-4 py-3 font-bold">📋 Copiar</button></div><p className="mt-3 text-center text-xs text-gray-500">Em Imprimir, escolha “Salvar como PDF” para guardar o recibo.</p></div></div>}

              {!publico && <div className="rounded-2xl bg-[#003d2b] p-5 text-white"><b><Clock3 className="mr-2 inline h-4 w-4" />Controle de disponibilidade</b><div className="mt-1 text-sm text-white/75">Os espaços, preços e permissões são lidos do banco. R$ 0,00 para não sócio significa bloqueado.</div></div>}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

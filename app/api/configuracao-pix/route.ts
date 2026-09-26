import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CHAVE_PIX_PADRAO = "89.649.164/0001-58";
const NOME_PADRAO = "SOCIEDADE GUARANI";
const CIDADE_PADRAO = "AUGUSTO PESTANA";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configuração do Supabase incompleta.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function tlv(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function crc16(texto: string) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i += 1) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function textoPix(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chavePix(chave: string) {
  const limpa = chave.trim();
  if (/^\d{11}$/.test(limpa.replace(/\D/g, ""))) return limpa.replace(/\D/g, "");
  if (/^\d{14}$/.test(limpa.replace(/\D/g, ""))) return limpa.replace(/\D/g, "");
  return limpa;
}

function gerarCopiaECola(chave: string, nome: string, cidade: string, valor: number) {
  const chaveNormalizada = chavePix(chave);
  if (!chaveNormalizada) return "";

  const nomeNormalizado = textoPix(nome).slice(0, 25) || NOME_PADRAO;
  const cidadeNormalizada = textoPix(cidade).slice(0, 15) || CIDADE_PADRAO;
  const valorFormatado = Number.isFinite(valor) && valor > 0 ? valor.toFixed(2) : "";

  const contaPix = tlv("00", "BR.GOV.BCB.PIX") + tlv("01", chaveNormalizada);
  let payload = tlv("00", "01") + tlv("26", contaPix) + tlv("52", "0000") + tlv("53", "986");
  if (valorFormatado) payload += tlv("54", valorFormatado);
  payload += tlv("58", "BR") + tlv("59", nomeNormalizado) + tlv("60", cidadeNormalizada);
  payload += tlv("62", tlv("05", "***"));
  return `${payload}6304${crc16(`${payload}6304`)}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const valor = Number(url.searchParams.get("valor") || 0);

  // A mesma chave PIX já utilizada em Convites.
  // O PIX de Reservas não depende mais de uma configuração prévia no banco:
  // ele funciona imediatamente e monta o copia e cola com o valor da reserva.
  let config: {
    id: string | null;
    chave_pix: string;
    nome_recebedor: string;
    cidade: string;
    ativo: boolean;
  } = {
    id: null,
    chave_pix: CHAVE_PIX_PADRAO,
    nome_recebedor: NOME_PADRAO,
    cidade: CIDADE_PADRAO,
    ativo: true,
  };

  // Se houver uma configuração salva no banco, ela continua tendo prioridade.
  // Se a tabela/configuração ainda não existir, usamos a chave padrão acima.
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (serviceKey && supabaseUrl) {
      const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data } = await supabase
        .from("configuracao_pix")
        .select("id,chave_pix,nome_recebedor,cidade,ativo")
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.chave_pix) {
        config = {
          id: data.id ?? null,
          chave_pix: String(data.chave_pix),
          nome_recebedor: String(data.nome_recebedor || NOME_PADRAO),
          cidade: String(data.cidade || CIDADE_PADRAO),
          ativo: data.ativo !== false,
        };
      }
    }
  } catch {
    // Mantém a configuração PIX padrão para não bloquear a reserva.
  }

  const copia_e_cola = gerarCopiaECola(
    config.chave_pix,
    config.nome_recebedor,
    config.cidade,
    valor,
  );

  return NextResponse.json({
    config: {
      ...config,
      copia_e_cola,
    },
  });
}

async function exigirAdministrador(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Acesso não autorizado.");
  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão inválida.");
  const { data: usuario, error: usuarioError } = await supabase
    .from("usuarios_sistema")
    .select("id,ativo,perfil_id,perfis:perfil_id(nome)")
    .eq("id", data.user.id)
    .single();
  if (usuarioError || !usuario?.ativo) throw new Error("Usuário sem acesso.");
  const perfil = Array.isArray(usuario.perfis) ? usuario.perfis[0] : usuario.perfis;
  const perfilNormalizado = String(perfil?.nome || "").trim().toLowerCase();
  if (!["administrador", "administrador master", "administrador_master", "master"].includes(perfilNormalizado)) {
    throw new Error("Somente administradores podem alterar o PIX.");
  }
  return supabase;
}

export async function POST(request: Request) {
  try {
    const supabase = await exigirAdministrador(request);
    const body = await request.json();
    const chave_pix = String(body.chave_pix || "").trim();
    const nome_recebedor = String(body.nome_recebedor || NOME_PADRAO).trim();
    const cidade = String(body.cidade || CIDADE_PADRAO).trim();
    if (!chave_pix) return NextResponse.json({ error: "Informe a chave PIX." }, { status: 400 });

    await supabase.from("configuracao_pix").update({ ativo: false }).eq("ativo", true);
    const { data, error } = await supabase
      .from("configuracao_pix")
      .insert({ chave_pix, nome_recebedor, cidade, copia_e_cola: gerarCopiaECola(chave_pix, nome_recebedor, cidade, 0), ativo: true })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, config: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar PIX." },
      { status: 403 },
    );
  }
}

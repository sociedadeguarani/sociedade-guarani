"use client";

import { useState } from "react";
import { CalendarDays, LogIn, ShieldCheck, Users } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);

    try {
      const emailLimpo = email.trim().toLowerCase();

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailLimpo,
        password: senha,
      });

      if (error || !data.user || !data.session) {
        setErro("E-mail ou senha incorretos.");
        return;
      }

      // A consulta ao cadastro do sistema é feita no servidor.
      // Isso evita problemas de RLS no navegador.
      const resposta = await fetch("/api/login/perfil", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
        cache: "no-store",
      });

      const resultado = await resposta.json().catch(() => ({}));

      if (!resposta.ok || !resultado.usuario) {
        await supabase.auth.signOut();

        if (resposta.status === 403) {
          setErro("Seu acesso não está ativo no sistema. Procure a administração.");
        } else {
          setErro(
            resultado.error ||
              "Não foi possível confirmar seu acesso. Tente novamente."
          );
        }
        return;
      }

      const usuario = resultado.usuario;
      const perfil = String(usuario.perfil || "");

      localStorage.setItem("guarani_usuario_email", emailLimpo);
      localStorage.setItem("guarani_usuario_id", data.user.id);
      localStorage.setItem("guarani_usuario_perfil", perfil);
      localStorage.setItem(
        "guarani_usuario_socio_id",
        usuario.socio_id || ""
      );
      localStorage.setItem(
        "guarani_usuario_nome",
        usuario.nome_exibicao || ""
      );

      // Por enquanto todos entram no painel principal.
      // O controle fino de cada área será aplicado nas próximas etapas.
      window.location.replace("/painel");
    } catch (err) {
      console.error(err);
      setErro("Erro de comunicação com o servidor. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8faf9] px-4 py-8 text-[#17382c]">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-[#dfe7e2] bg-white shadow-xl md:grid-cols-2">
          <div className="hidden bg-[#003d2b] p-10 text-white md:flex md:flex-col md:justify-center">
            <img
              src="/logo-guarani.png"
              alt="Sociedade Guarani"
              className="mb-6 h-16 w-16 rounded-2xl bg-white p-2 object-contain"
            />
            <h1 className="text-3xl font-extrabold">SOCIEDADE GUARANI</h1>
            <p className="mt-2 text-sm text-white/75">
              Sociedade Recreativa Guarani — S.R.G.
            </p>

            <div className="mt-10 space-y-4 text-sm">
              <div className="flex gap-3">
                <ShieldCheck className="h-5 w-5 shrink-0" />
                <span>Acesso conforme o perfil e as permissões do usuário.</span>
              </div>
              <div className="flex gap-3">
                <CalendarDays className="h-5 w-5 shrink-0" />
                <span>Reservas de quadras, quiosques e salões.</span>
              </div>
            </div>
          </div>

          <div className="p-7 sm:p-10">
            <div className="mb-8 text-center">
              <img
                src="/logo-guarani.png"
                alt="Sociedade Guarani"
                className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-[#005a3c] p-2 object-contain md:hidden"
              />
              <p className="text-sm font-semibold text-gray-500">Bem-vindo</p>
              <h2 className="mt-1 text-2xl font-extrabold text-[#003d2b]">
                Acesso à Sociedade Guarani
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                Entre com seu acesso ou continue como não sócio.
              </p>
            </div>

            <form onSubmit={entrar} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-[#d6e1dc] px-4 py-3 outline-none focus:border-[#005a3c]"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">Senha</span>
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Digite sua senha"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-[#d6e1dc] px-4 py-3 outline-none focus:border-[#005a3c]"
                />
              </label>

              {erro && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={carregando}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3.5 font-extrabold text-white disabled:opacity-60"
              >
                <LogIn className="h-5 w-5" />
                {carregando ? "Entrando..." : "Entrar no sistema"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#e2e9e5]" />
              <span className="text-xs font-bold uppercase text-gray-400">ou</span>
              <div className="h-px flex-1 bg-[#e2e9e5]" />
            </div>

            <button
              type="button"
              onClick={() => (window.location.href = "/reservas?publico=1")}
              className="w-full rounded-xl border-2 border-[#005a3c] bg-white px-4 py-3.5 font-extrabold text-[#005a3c] hover:bg-[#e8f3ee]"
            >
              <CalendarDays className="mr-2 inline h-5 w-5" />
              Não sou sócio — fazer reserva
            </button>

            <div className="mt-6 rounded-xl bg-[#f4f8f5] p-4 text-center text-xs leading-5 text-gray-500">
              <Users className="mx-auto mb-1 h-4 w-4 text-[#005a3c]" />
              Usuários cadastrados entram conforme seu perfil. Não sócios
              podem fazer reserva sem entrar na área administrativa.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();

    setErro("");
    setCarregando(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      setErro("E-mail ou senha incorretos.");
      setCarregando(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F8FAF9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 430,
          background: "#ffffff",
          borderRadius: 20,
          padding: 35,
          boxShadow: "0 10px 40px rgba(0,0,0,0.10)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div
            style={{
              width: 70,
              height: 70,
              margin: "0 auto 15px",
              borderRadius: 18,
              background: "#005A3C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 34,
            }}
          >
            🏛️
          </div>

          <h1
            style={{
              margin: 0,
              color: "#005A3C",
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            Sociedade Guarani
          </h1>

          <p
            style={{
              marginTop: 8,
              color: "#64748B",
              fontSize: 14,
            }}
          >
            Área Administrativa
          </p>
        </div>

        <form onSubmit={entrar}>
          <label
            style={{
              display: "block",
              marginBottom: 7,
              fontWeight: 600,
              color: "#334155",
            }}
          >
            E-mail
          </label>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "14px 15px",
              border: "1px solid #CBD5E1",
              borderRadius: 10,
              fontSize: 15,
              marginBottom: 18,
            }}
          />

          <label
            style={{
              display: "block",
              marginBottom: 7,
              fontWeight: 600,
              color: "#334155",
            }}
          >
            Senha
          </label>

          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Digite sua senha"
            required
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "14px 15px",
              border: "1px solid #CBD5E1",
              borderRadius: 10,
              fontSize: 15,
              marginBottom: 18,
            }}
          />

          {erro && (
            <div
              style={{
                background: "#FEE2E2",
                color: "#B91C1C",
                padding: 12,
                borderRadius: 10,
                marginBottom: 18,
                fontSize: 14,
              }}
            >
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={carregando}
            style={{
              width: "100%",
              padding: "14px",
              border: "none",
              borderRadius: 10,
              background: "#005A3C",
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 700,
              cursor: carregando ? "default" : "pointer",
              opacity: carregando ? 0.7 : 1,
            }}
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p
          style={{
            textAlign: "center",
            marginTop: 25,
            color: "#94A3B8",
            fontSize: 12,
          }}
        >
          Sistema de Gestão • Sociedade Recreativa Guarani
        </p>
      </div>
    </main>
  );
}

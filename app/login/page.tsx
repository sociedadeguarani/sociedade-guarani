"use client";

import { useState } from "react";
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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      setErro("E-mail ou senha incorretos.");
      setCarregando(false);
      return;
    }

    window.location.href = "/";
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F8FAF9",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#ffffff",
          borderRadius: "20px",
          padding: "36px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "30px" }}>
          <div
            style={{
              width: "70px",
              height: "70px",
              borderRadius: "18px",
              background: "#005A3C",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: "28px",
              fontWeight: 800,
            }}
          >
            SG
          </div>

          <h1
            style={{
              margin: 0,
              color: "#003D2B",
              fontSize: "26px",
              fontWeight: 800,
            }}
          >
            Sociedade Guarani
          </h1>

          <p
            style={{
              marginTop: "8px",
              color: "#66736D",
              fontSize: "14px",
            }}
          >
            Sistema de Gestão
          </p>
        </div>

        <form onSubmit={entrar}>
          <label
            style={{
              display: "block",
              marginBottom: "7px",
              fontSize: "14px",
              fontWeight: 600,
              color: "#003D2B",
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
              padding: "13px 14px",
              border: "1px solid #D6E1DC",
              borderRadius: "10px",
              fontSize: "15px",
              marginBottom: "18px",
              outline: "none",
            }}
          />

          <label
            style={{
              display: "block",
              marginBottom: "7px",
              fontSize: "14px",
              fontWeight: 600,
              color: "#003D2B",
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
              padding: "13px 14px",
              border: "1px solid #D6E1DC",
              borderRadius: "10px",
              fontSize: "15px",
              marginBottom: "18px",
              outline: "none",
            }}
          />

          {erro && (
            <div
              style={{
                background: "#FDECEC",
                color: "#B42318",
                padding: "11px 13px",
                borderRadius: "10px",
                fontSize: "14px",
                marginBottom: "18px",
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
              border: "none",
              borderRadius: "10px",
              padding: "14px",
              background: "#005A3C",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: 700,
              cursor: carregando ? "default" : "pointer",
              opacity: carregando ? 0.7 : 1,
            }}
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div
          style={{
            marginTop: "24px",
            textAlign: "center",
            fontSize: "12px",
            color: "#7A8781",
          }}
        >
          Acesso restrito aos usuários do sistema
        </div>
      </div>
    </main>
  );
}

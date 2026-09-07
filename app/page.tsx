 "use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  useEffect(() => {
    let ativo = true;

    async function encaminhar() {
      const { data } = await supabase.auth.getSession();
      if (!ativo) return;

      window.location.replace(data.session ? "/painel" : "/login");
    }

    encaminhar();

    return () => {
      ativo = false;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#F8FAF9",
        fontFamily: "Arial, sans-serif",
        color: "#003D2B",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 42, marginBottom: 12 }}>🏛️</div>
        <h1 style={{ margin: 0, fontSize: 24 }}>Sociedade Guarani</h1>
        <p style={{ color: "#64748B" }}>Carregando sistema...</p>
      </div>
    </main>
  );
}

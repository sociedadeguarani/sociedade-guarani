"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {

  useEffect(() => {
    let montado = true;

    async function encaminhar() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!montado) return;

      window.location.replace(session ? "/painel" : "/login");
    }

    void encaminhar();

    return () => {
      montado = false;
    };
  }, []);

  return null;
}

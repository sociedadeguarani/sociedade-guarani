"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Download, Smartphone } from "lucide-react";

export default function InstalarGuaraniPage() {
  function abrirInstalacao() {
    window.dispatchEvent(new Event("guarani:open-install"));
  }

  return (
    <main className="min-h-screen bg-[#f8faf9] px-4 py-8 text-[#17382c]">
      <div className="mx-auto max-w-xl">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm font-bold text-[#005a3c] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Voltar ao acesso
        </Link>
        <section className="mt-6 rounded-3xl border border-[#dfe7e2] bg-white p-6 shadow-sm sm:p-8">
          <Image src="/apple-icon-guarani.png" alt="Logo oficial da Sociedade Recreativa Guarani" width={112} height={112} className="mx-auto h-28 w-28 rounded-2xl object-contain" priority />
          <p className="mt-5 text-center text-xs font-extrabold uppercase tracking-[0.18em] text-[#648075]">Sociedade Recreativa Guarani</p>
          <h1 className="mt-2 text-center text-3xl font-black text-[#003d2b]">Instale o Guarani</h1>
          <p className="mt-3 text-center text-sm leading-6 text-slate-600">Tenha um ícone do Sistema Guarani na tela inicial do celular e abra o sistema em uma janela própria. Seu login e suas permissões continuam os mesmos.</p>
          <button type="button" onClick={abrirInstalacao} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#005a3c] px-5 py-4 text-base font-extrabold text-white shadow-sm hover:bg-[#00452e]">
            <Download className="h-5 w-5" /> Instalar aplicativo
          </button>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl bg-[#f1f7f4] p-4">
              <div className="flex items-center gap-2 font-extrabold text-[#005a3c]"><Smartphone className="h-5 w-5" /> Android</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">Abra este site no Chrome, toque em Instalar. Se o botão não aparecer, use o menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”.</p>
            </div>
            <div className="rounded-2xl bg-[#f1f7f4] p-4">
              <div className="flex items-center gap-2 font-extrabold text-[#005a3c]"><Smartphone className="h-5 w-5" /> iPhone</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">Abra este endereço no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.</p>
            </div>
          </div>
          <p className="mt-5 rounded-xl border border-[#e3ebe6] p-3 text-xs leading-5 text-slate-500">O aplicativo usa o mesmo sistema e banco de dados. É necessária conexão com a internet; dados pessoais e financeiros não ficam disponíveis offline. Esta instalação pelo link não é um APK nem uma publicação na Play Store.</p>
        </section>
      </div>
    </main>
  );
}

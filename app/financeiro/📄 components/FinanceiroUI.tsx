"use client";

import type { ReactNode } from "react";

function Resumo({
  titulo,
  valor,
  subtitulo,
  destaque = false,
}: {
  titulo: string;
  valor: string;
  subtitulo?: string;
  destaque?: boolean;
}) {
  if (destaque) {
    return (
      <div className="rounded-2xl border border-[#0a6b47] bg-gradient-to-br from-[#005a3c] to-[#00432c] p-5 shadow-md">
        <p className="text-sm font-medium text-[#bfe3d2]">{titulo}</p>
        <p className="mt-1 text-2xl font-extrabold text-white">{valor}</p>
        {subtitulo && <p className="mt-1 text-xs text-[#9fd4bd]">{subtitulo}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-[#005a3c]">{valor}</p>
      {subtitulo && <p className="mt-1 text-xs text-gray-500">{subtitulo}</p>}
    </div>
  );
}

function Info({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-xl bg-[#f7faf8] p-4">
      <p className="font-bold text-[#005a3c]">{titulo}</p>
      <p className="mt-1 text-sm text-gray-500">{texto}</p>
    </div>
  );
}

function Campo({
  label,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (valor: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-gray-700">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 outline-none focus:border-[#005a3c]"
      />
    </div>
  );
}

function Modal({
  titulo,
  fechar,
  children,
}: {
  titulo: string;
  fechar: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#001f16]/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-5">
          <h2 className="text-2xl font-bold text-[#005a3c]">{titulo}</h2>
          <button
            onClick={fechar}
            className="rounded-full bg-gray-100 px-3 py-2"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}


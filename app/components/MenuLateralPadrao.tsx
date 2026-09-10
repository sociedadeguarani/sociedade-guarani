"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Home, Users, UsersRound, CalendarDays, PartyPopper, Wallet, BarChart3, Boxes, UserCog, Megaphone, CreditCard, DoorOpen, Menu, X } from "lucide-react";
const ITENS = [
  { nome: "Início", rota: "/painel", icone: Home, admin: false }, { nome: "Sócios", rota: "/socios", icone: Users, admin: true },
  { nome: "Dependentes", rota: "/dependentes", icone: UsersRound, admin: false }, { nome: "Reservas", rota: "/reservas", icone: CalendarDays, admin: false },
  { nome: "Eventos", rota: "/eventos", icone: PartyPopper, admin: false }, { nome: "Avisos", rota: "/avisos", icone: Megaphone, admin: false },
  { nome: "Carteirinhas", rota: "/carteirinhas", icone: CreditCard, admin: false }, { nome: "Acessos", rota: "/acessos", icone: DoorOpen, admin: true },
  { nome: "Financeiro", rota: "/financeiro", icone: Wallet, admin: true }, { nome: "Relatórios", rota: "/relatorios", icone: BarChart3, admin: true },
  { nome: "Inventário", rota: "/inventario", icone: Boxes, admin: true }, { nome: "Usuários", rota: "/usuarios", icone: UserCog, admin: true },
];
export default function MenuLateralPadrao() {
  const pathname = usePathname(); const [perfil, setPerfil] = useState(""); const [aberto, setAberto] = useState(false);
  useEffect(() => { const atualizar=()=>setPerfil((localStorage.getItem("guarani_usuario_perfil")||"").trim().toLowerCase()); atualizar(); window.addEventListener("guarani:perfil-atualizado", atualizar); return ()=>window.removeEventListener("guarani:perfil-atualizado", atualizar); }, []);
  useEffect(()=>setAberto(false),[pathname]);
  const administrador=perfil==="administrador"; const itensVisiveis=ITENS.filter(item=>administrador||!item.admin);
  function navegar(rota:string){setAberto(false);window.location.href=rota;}
  return <>
    <button type="button" aria-label="Abrir menu" aria-expanded={aberto} onClick={()=>setAberto(true)} className="fixed left-4 top-4 z-[60] grid h-11 w-11 place-items-center rounded-xl border border-[#d5e0da] bg-white text-[#005a3c] shadow-md lg:hidden"><Menu className="h-5 w-5"/></button>
    {aberto&&<div className="fixed inset-0 z-[55] bg-black/40 lg:hidden" onClick={()=>setAberto(false)}/>} 
    <aside className={`fixed inset-y-0 left-0 z-[60] w-[285px] overflow-y-auto border-r border-[#dfe9e3] bg-[#f7faf8] px-3 py-5 shadow-2xl transition-transform duration-200 lg:translate-x-0 lg:z-30 lg:w-[220px] lg:shadow-none ${aberto?"translate-x-0":"-translate-x-full"}`}>
      <div className="mb-5 flex items-center justify-between lg:block"><div className="flex justify-center"><img src="/logo-guarani.png" alt="Sociedade Guarani" className="h-16 w-16 rounded-2xl bg-white p-2 shadow-sm object-contain"/></div><button type="button" aria-label="Fechar menu" onClick={()=>setAberto(false)} className="grid h-10 w-10 place-items-center rounded-xl border bg-white text-[#005a3c] lg:hidden"><X className="h-5 w-5"/></button></div>
      <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#91a099]">Menu principal</p>
      <nav className="space-y-1.5">{itensVisiveis.map(item=>{const ativo=pathname===item.rota||pathname?.startsWith(`${item.rota}/`);const Icone=item.icone;return <button key={item.rota} type="button" onClick={()=>navegar(item.rota)} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${ativo?"bg-[#005a3c] text-white shadow-sm":"text-[#50625a] hover:bg-[#e8f3ee] hover:text-[#005a3c]"}`}><Icone className="h-[18px] w-[18px] shrink-0"/>{item.nome}</button>})}</nav>
    </aside>
  </>;
}


            <form onSubmit={salvarDependente} className="overflow-y-auto p-6">
              {erro && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{erro}</div>}
              {sucesso && <div className="mb-5 rounded-xl border border-emerald-200 bg-[#E8F3EE] px-4 py-3 text-sm font-semibold text-[#005A3C]">{sucesso}</div>}

              <div className="rounded-2xl border border-[#D9E9E2] bg-[#F8FAF9] p-5">
                <div className="mb-4 text-base font-black text-[#005A3C]">👤 Dados do dependente</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-bold text-slate-700">Sócio responsável *</label>
                    <input
                      required={!form.socio_id}
                      value={form.socio_id ? (socios.find((s) => String(s.id) === String(form.socio_id))?.nome || buscaResponsavel) : buscaResponsavel}
                      onChange={(e) => {
                        setBuscaResponsavel(e.target.value);
                        if (form.socio_id) setForm({ ...form, socio_id: "" });
                      }}
                      placeholder="Digite o nome do responsável..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]"
                    />
                    <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                      {socios
                        .filter((s) => {
                          const termo = buscaResponsavel.trim().toLowerCase();
                          return !termo || s.nome.toLowerCase().includes(termo) || String(s.matricula || "").toLowerCase().includes(termo);
                        })
                        .slice(0, 80)
                        .map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              setForm({ ...form, socio_id: s.id });
                              setBuscaResponsavel(s.nome);
                            }}
                            className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-[#E8F3EE] ${String(form.socio_id) === String(s.id) ? "bg-[#E8F3EE] font-bold text-[#005A3C]" : "text-slate-700"}`}
                          >
                            {s.nome}{s.matricula ? ` — Matrícula ${s.matricula}` : ""}
                          </button>
                        ))}
                      {buscaResponsavel.trim() && socios.filter((s) => {
                        const termo = buscaResponsavel.trim().toLowerCase();
                        return s.nome.toLowerCase().includes(termo) || String(s.matricula || "").toLowerCase().includes(termo);
                      }).length === 0 && (
                        <p className="px-4 py-3 text-sm text-slate-500">Nenhum sócio encontrado.</p>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Pesquise pelo nome ou pela matrícula. Dependentes que possuem mensalidade própria também podem ser responsáveis por uma família.</p>
                  </div>
                  <label className="md:col-span-2"><span className="mb-1 block text-sm font-bold text-slate-700">Nome completo *</span><input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo do dependente" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" /></label>
                  <label><span className="mb-1 block text-sm font-bold text-slate-700">CPF</span><input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} inputMode="numeric" placeholder="Somente números" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" /></label>
                  <label><span className="mb-1 block text-sm font-bold text-slate-700">Data de nascimento</span><input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" /></label>
                  <label><span className="mb-1 block text-sm font-bold text-slate-700">Parentesco</span><select value={form.parentesco} onChange={(e) => setForm({ ...form, parentesco: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]"><option value="">Selecione</option>{parentescos.map((p) => <option key={p}>{p}</option>)}</select></label>
                  <label><span className="mb-1 block text-sm font-bold text-slate-700">Telefone / WhatsApp</span><input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(55) 99999-9999" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" /></label>
                  <div className="md:col-span-2 rounded-xl border border-dashed border-[#9fc8b5] bg-white p-4">
                    <div className="mb-3 text-sm font-bold text-[#005A3C]">📷 Foto do dependente</div>
                    <div className="flex flex-wrap items-center gap-4">
                      {(fotoArquivo || editando?.foto_url) && (
                        <div className="h-20 w-20 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                          <img
                            src={fotoArquivo ? URL.createObjectURL(fotoArquivo) : editando?.foto_url || ""}
                            alt="Prévia"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                      <div>
                        <label className="inline-flex cursor-pointer items-center rounded-xl border border-[#cfe3d8] bg-[#E8F3EE] px-4 py-2.5 text-sm font-extrabold text-[#005A3C] hover:bg-[#d9eee4]">
                          📷 {fotoArquivo ? "Trocar foto" : "Escolher foto"}
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFotoArquivo(e.target.files?.[0] || null)} />
                        </label>
                        {fotoArquivo && <p className="mt-2 text-xs text-slate-500">{fotoArquivo.name}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-[#D9E9E2] bg-[#F8FAF9] p-5">
                <div className="mb-4 text-base font-black text-[#005A3C]">💰 Financeiro do dependente</div>
                <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
                  <div>
                    <div className="font-bold text-slate-700">Possui mensalidade própria?</div>
                    <div className="text-sm text-slate-500">A mensalidade do dependente será controlada separadamente do responsável.</div>
                  </div>
                  <button type="button" onClick={() => setForm({ ...form, possui_mensalidade: !form.possui_mensalidade, situacao_financeira: !form.possui_mensalidade ? "em_dia" : "isento" })} className={`relative h-7 w-12 rounded-full transition ${form.possui_mensalidade ? "bg-[#005A3C]" : "bg-slate-300"}`}>
                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${form.possui_mensalidade ? "left-6" : "left-1"}`} />
                  </button>
                </label>

                {form.possui_mensalidade && (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-sm font-bold text-slate-700">Valor da mensalidade</span>
                      <input type="number" min="0" step="0.01" value={form.valor_mensalidade} onChange={(e) => setForm({ ...form, valor_mensalidade: Number(e.target.value) })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" placeholder="0,00" />
                    </label>
                    <label>
                      <span className="mb-1 block text-sm font-bold text-slate-700">Dia do vencimento</span>
                      <input type="number" min="1" max="31" value={form.dia_vencimento} onChange={(e) => setForm({ ...form, dia_vencimento: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" />
                    </label>
                    <label>
                      <span className="mb-1 block text-sm font-bold text-slate-700">Forma de pagamento</span>
                      <select value={form.tipo_pagamento} onChange={(e) => setForm({ ...form, tipo_pagamento: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]">
                        <option value="pix">PIX</option>
                        <option value="debito_em_conta">Débito em conta</option>
                        <option value="boleto">Boleto</option>
                        <option value="dinheiro">Dinheiro</option>
                        <option value="transferencia">Transferência</option>
                        <option value="outro">Outro</option>
                      </select>
                    </label>
                    <label>
                      <span className="mb-1 block text-sm font-bold text-slate-700">Situação financeira</span>
                      <select value={form.situacao_financeira} onChange={(e) => setForm({ ...form, situacao_financeira: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]">
                        <option value="em_dia">🟢 Em dia</option>
                        <option value="em_atraso">🔴 Em atraso</option>
                        <option value="isento">⚪ Isento</option>
                      </select>
                    </label>
                    <label className="md:col-span-2">
                      <span className="mb-1 block text-sm font-bold text-slate-700">Data do último pagamento</span>
                      <input type="date" value={form.data_ultimo_pagamento} onChange={(e) => setForm({ ...form, data_ultimo_pagamento: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" />
                    </label>
                  </div>
                )}
              </div>

              <div className="mt-5 rounded-2xl border border-[#D9E9E2] bg-white p-5">
                <div className="mb-4 text-base font-black text-[#005A3C]">🟢 Situação</div>
                <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                  <div><div className="font-bold text-slate-700">Dependente ativo</div><div className="text-sm text-slate-500">Dependentes inativos permanecem no histórico.</div></div>
                  <button type="button" onClick={() => setForm({ ...form, ativo: !form.ativo })} className={`relative h-7 w-12 rounded-full transition ${form.ativo ? "bg-[#005A3C]" : "bg-slate-300"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${form.ativo ? "left-6" : "left-1"}`} /></button>
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-5">
                <button type="button" onClick={fecharModal} disabled={salvando} className="rounded-xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={salvando} className="rounded-xl bg-[#005A3C] px-6 py-3 font-extrabold text-white hover:bg-[#003D2B] disabled:opacity-60">{salvando ? "Salvando..." : editando ? "💾 Salvar alterações" : "📋 Cadastrar dependente"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

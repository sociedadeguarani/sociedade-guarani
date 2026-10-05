            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 sm:gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="text-sm text-slate-500">Total de dependentes</div><div className="mt-1 text-3xl font-black text-[#005A3C]">{dependentes.length}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="text-sm text-slate-500">Dependentes ativos</div><div className="mt-1 text-3xl font-black text-[#005A3C]">{totalAtivos}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="text-sm text-slate-500">Dependentes inativos</div><div className="mt-1 text-3xl font-black text-slate-600">{totalInativos}</div></div>
            </div>

            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[1fr_300px_180px]">
                <div className="flex items-center rounded-xl border border-slate-200 px-4">
                  <span className="mr-3 text-xl">🔎</span>
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, CPF, parentesco ou sócio..." className="w-full min-w-0 bg-transparent py-3 text-sm outline-none" />
                </div>
                <select value={filtroSocio} onChange={(e) => setFiltroSocio(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#005A3C]">
                  <option value="">Todos os responsáveis</option>
                  {socios.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.matricula ? ` — ${s.matricula}` : ""}</option>)}
                </select>
                <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#005A3C]">
                  <option value="todos">Todos</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option>
                </select>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {carregando ? (
                <div className="p-8 text-center text-sm text-slate-500 sm:p-10">Carregando dependentes...</div>
              ) : dependentesFiltrados.length === 0 ? (
                <div className="p-8 text-center sm:p-12"><div className="text-4xl">👨‍👩‍👧</div><div className="mt-3 text-lg font-black text-[#003D2B]">Nenhum dependente encontrado</div><p className="mt-1 text-sm text-slate-500">Cadastre o primeiro dependente ou ajuste os filtros.</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-[#E8F3EE] text-[11px] uppercase tracking-wide text-[#315B4C]">
                      <tr>
                        <th className="px-3 py-3 sm:px-5 sm:py-4">Matrícula</th><th className="px-3 py-3 sm:px-5 sm:py-4">Nome</th><th className="px-3 py-3 sm:px-5 sm:py-4">Parentesco</th><th className="px-3 py-3 sm:px-5 sm:py-4">Nascimento</th><th className="px-3 py-3 sm:px-5 sm:py-4">CPF</th><th className="px-3 py-3 sm:px-5 sm:py-4">Responsável</th><th className="px-3 py-3 sm:px-5 sm:py-4">Telefone</th><th className="px-3 py-3 sm:px-5 sm:py-4">Mensalidade</th><th className="px-3 py-3 sm:px-5 sm:py-4">Financeiro</th><th className="px-3 py-3 sm:px-5 sm:py-4">Situação</th><th className="px-5 py-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dependentesFiltrados.map((d) => {
                        const socio = socioPorId[d.socio_id];
                        const statusResponsavel = statusResponsaveis[d.socio_id] || "em_dia";
                        const statusLabel = statusResponsavel === "muito_atrasado" ? "5+ meses" : statusResponsavel === "atrasado" ? "3–4 meses" : "Até 2 meses";
                        const statusClasse = statusResponsavel === "muito_atrasado" ? "bg-red-100 text-red-700" : statusResponsavel === "atrasado" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
                        return (
                          <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-3 sm:px-5 sm:py-4"><span className="font-extrabold text-[#005A3C]">{d.matricula || "—"}</span></td>
                            <td className="px-3 py-3 sm:px-5 sm:py-4">
                              <div className="flex items-center gap-3">
                                {d.foto_url ? (
                                  <img src={d.foto_url} alt={`Foto de ${d.nome}`} className="h-10 w-10 rounded-full border border-slate-200 object-cover" />
                                ) : (
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F3EE] text-sm font-black text-[#005A3C]">
                                    {d.nome.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                                  </div>
                                )}
                                <div className="font-extrabold text-[#003D2B]">{d.nome}</div>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">{d.parentesco || "—"}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">{formatarData(d.data_nascimento)}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">{formatarCpf(d.cpf)}</td>
                            <td className="px-3 py-3 sm:px-5 sm:py-4"><div className="font-semibold text-slate-700">{socio?.nome || "Sócio não encontrado"}</div>{socio?.matricula && <div className="text-xs text-slate-400">Matrícula {socio.matricula}</div>}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">{formatarTelefone(d.telefone)}</td>
                            <td className="px-5 py-4 text-sm font-bold text-slate-700">{d.possui_mensalidade ? `R$ ${Number(d.valor_mensalidade || 0).toFixed(2).replace(".", ",")}` : "Familiar"}</td>
                            <td className="px-3 py-3 sm:px-5 sm:py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${statusClasse}`}>{statusResponsavel === "em_dia" ? "🟢 Até 2 meses" : statusResponsavel === "atrasado" ? "🟡 3–4 meses" : "🔴 5+ meses"}</span></td>
                            <td className="px-3 py-3 sm:px-5 sm:py-4"><button onClick={() => alternarStatus(d)} className={`rounded-full px-3 py-1 text-xs font-black ${d.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{d.ativo ? "Ativo" : "Inativo"}</button></td>
                            <td className="px-3 py-3 sm:px-5 sm:py-4">
                              {!somenteConsulta && (
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => abrirEdicao(d)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-[#E8F3EE] hover:text-[#005A3C]">✏️ Editar</button>
                                  <button onClick={() => excluirDependente(d)} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-100">🗑️</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="mt-5 text-sm text-slate-400">Exibindo {dependentesFiltrados.length} de {dependentes.length} dependentes.</div>
          </div>
        </section>
      </div>

      {modalAberto && !somenteConsulta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div><div className="text-xs font-semibold text-slate-500">Sociedade Recreativa Guarani</div><h2 className="text-2xl font-black text-[#005A3C]">{editando ? "Editar Dependente" : "Novo Dependente"}</h2></div>
              <button onClick={fecharModal} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600 hover:bg-slate-200">×</button>
            </div>

            <form onSubmit={salvarDependente} className="overflow-y-auto p-6">
              {erro && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{erro}</div>}
              {sucesso && <div className="mb-5 rounded-xl border border-emerald-200 bg-[#E8F3EE] px-4 py-3 text-sm font-semibold text-[#005A3C]">{sucesso}</div>}

              <div className="rounded-2xl border border-[#D9E9E2] bg-[#F8FAF9] p-5">
                <div className="mb-4 text-base font-black text-[#005A3C]">👤 Dados do dependente</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="md:col-span-2"><span className="mb-1 block text-sm font-bold text-slate-700">Sócio responsável *</span>
                    <select required value={form.socio_id} onChange={(e) => setForm({ ...form, socio_id: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]">
                      <option value="">Selecione o sócio responsável</option>
                      {socios.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.matricula ? ` — Matrícula ${s.matricula}` : ""}</option>)}
                    </select>
                  </label>
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

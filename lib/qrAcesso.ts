export type IdentificadorQrAcesso = {
  socioId: string;
  dependenteId: string;
  matricula: string;
  temporadaId: string;
  temporadaParticipanteId: string;
};

export function normalizarMatriculaQr(valor: unknown): string {
  return String(valor ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function ehUuidQr(valor: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(valor ?? "").trim());
}

/**
 * Interpreta os formatos de QR emitidos pelo Sistema Guarani ao longo do tempo:
 * URLs com id/socio_id/dependente_id, códigos guarani:*, UUIDs puros e matrículas.
 */
export function interpretarQrAcesso(valor: unknown, baseUrl = "https://guarani.invalid/"): IdentificadorQrAcesso {
  const resultado: IdentificadorQrAcesso = {
    socioId: "",
    dependenteId: "",
    matricula: "",
    temporadaId: "",
    temporadaParticipanteId: "",
  };

  const ler = (entrada: unknown, profundidade = 0): void => {
    if (profundidade > 3) return;
    const texto = String(entrada ?? "").trim();
    if (!texto) return;

    const prefixos: Array<[string, keyof IdentificadorQrAcesso, (valor: string) => string]> = [
      ["guarani:temporada-participante:", "temporadaParticipanteId", (v) => v.trim()],
      ["guarani:temporada:", "temporadaId", (v) => v.trim()],
      ["guarani:socio:", "socioId", (v) => v.trim()],
      ["guarani:dependente:", "dependenteId", (v) => v.trim()],
      ["guarani:matricula:", "matricula", normalizarMatriculaQr],
      ["socio:", "socioId", (v) => v.trim()],
      ["dependente:", "dependenteId", (v) => v.trim()],
      ["matricula:", "matricula", normalizarMatriculaQr],
    ];

    const prefixo = prefixos.find(([inicio]) => texto.toLowerCase().startsWith(inicio));
    if (prefixo) {
      const valorExtraido = prefixo[2](texto.slice(prefixo[0].length));
      if (valorExtraido) resultado[prefixo[1]] = valorExtraido;
      return;
    }

    const pareceUrl = /^https?:\/\//i.test(texto) || texto.startsWith("/") || texto.startsWith("?");
    if (pareceUrl) {
      try {
        const url = new URL(texto, baseUrl);
        const socioId = url.searchParams.get("socio_id") || url.searchParams.get("id") || url.searchParams.get("i") || "";
        const dependenteId = url.searchParams.get("dependente_id") || url.searchParams.get("d") || "";
        const matricula = url.searchParams.get("matricula") || url.searchParams.get("codigo") || url.searchParams.get("m") || "";
        if (socioId) resultado.socioId = socioId.trim();
        if (dependenteId) resultado.dependenteId = dependenteId.trim();
        if (matricula) resultado.matricula = normalizarMatriculaQr(matricula);

        const temporadaId = url.searchParams.get("temporada_id") || "";
        const participanteId = url.searchParams.get("temporada_participante_id") || "";
        if (temporadaId) resultado.temporadaId = temporadaId.trim();
        if (participanteId) resultado.temporadaParticipanteId = participanteId.trim();

        const tokenInterno = url.searchParams.get("qr") || url.searchParams.get("q");
        if (tokenInterno) ler(tokenInterno, profundidade + 1);

        // Compatibilidade com QR antigo que apontava para /acessos/qr/<id>.
        const rotaAntiga = url.pathname.match(/\/acessos\/qr\/([^/]+)\/?$/i);
        if (!socioId && !dependenteId && !matricula && rotaAntiga?.[1]) {
          resultado.socioId = decodeURIComponent(rotaAntiga[1]);
        }
        return;
      } catch {
        // Segue para interpretar o conteúdo como identificador simples.
      }
    }

    if (ehUuidQr(texto)) {
      resultado.socioId = texto;
      return;
    }

    resultado.matricula = normalizarMatriculaQr(texto);
  };

  ler(valor);
  return resultado;
}

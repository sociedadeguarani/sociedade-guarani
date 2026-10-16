/**
 * Gera links temporários de vários arquivos do Storage em lotes.
 *
 * O caminho individual continua sendo usado como chave do mapa de retorno.
 * Se a API em lote falhar, faz fallback para createSignedUrl por arquivo,
 * mantendo o comportamento anterior (arquivo sem link retorna null).
 */
export async function assinarArquivosEmLote(
  db: any,
  bucket: string,
  caminhos: Array<string | null | undefined>,
  validadeSegundos = 60 * 60,
): Promise<Map<string, string | null>> {
  const unicos = Array.from(
    new Set(caminhos.map((caminho) => String(caminho ?? "").trim()).filter(Boolean)),
  );
  const resultado = new Map<string, string | null>();

  if (!unicos.length) return resultado;

  const tamanhoLote = 100;
  const concorrencia = 4;
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += tamanhoLote) {
    lotes.push(unicos.slice(i, i + tamanhoLote));
  }

  for (let i = 0; i < lotes.length; i += concorrencia) {
    const grupo = lotes.slice(i, i + concorrencia);
    await Promise.all(
      grupo.map(async (lote) => {
        try {
          const { data, error } = await db.storage
            .from(bucket)
            .createSignedUrls(lote, validadeSegundos);

          if (!error && Array.isArray(data)) {
            // Relaciona cada link pelo caminho, não apenas pela posição, para
            // nunca associar por engano o comprovante de um associado a outro.
            const porCaminho = new Map<string, string | null>();
            for (const item of data) {
              if (item?.path != null) porCaminho.set(String(item.path), item.signedUrl || null);
            }

            const semCorrespondencia: string[] = [];
            for (const caminho of lote) {
              const url = porCaminho.get(caminho);
              if (url) resultado.set(caminho, url);
              else semCorrespondencia.push(caminho);
            }

            if (!semCorrespondencia.length) return;

            // Se a resposta em lote não devolver algum caminho, tenta somente
            // esses itens individualmente como fallback.
            const individuais = await Promise.all(
              semCorrespondencia.map(async (caminho) => {
                try {
                  const { data: individual } = await db.storage
                    .from(bucket)
                    .createSignedUrl(caminho, validadeSegundos);
                  return [caminho, individual?.signedUrl || null] as const;
                } catch {
                  return [caminho, null] as const;
                }
              }),
            );
            for (const [caminho, url] of individuais) resultado.set(caminho, url);
            return;
          }
        } catch {
          // O fallback abaixo preserva a geração individual de links.
        }

        const individuais = await Promise.all(
          lote.map(async (caminho) => {
            try {
              const { data } = await db.storage
                .from(bucket)
                .createSignedUrl(caminho, validadeSegundos);
              return [caminho, data?.signedUrl || null] as const;
            } catch {
              return [caminho, null] as const;
            }
          }),
        );
        for (const [caminho, url] of individuais) resultado.set(caminho, url);
      }),
    );
  }

  return resultado;
}


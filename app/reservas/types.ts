export type TipoPessoa = "socio" | "nao_socio";
export type Categoria = "esporte" | "lazer" | "eventos";
export type FormaPagamentoReserva = "pix" | "dinheiro";
export type ReservaPagamento = "pix" | "dinheiro" | "transferencia" | "pendente";
export type ReservaStatus = "confirmada" | "pendente" | "cancelada";

export type Espaco = {
  id: string;
  nome: string;
  categoria: Categoria;
  cobranca: "hora" | "diaria";
  precoSocio: number;
  precoNaoSocio: number;
  permiteNaoSocio: boolean;
  capacidade?: string;
};

export type Recibo = {
  id: string;
  numero: string;
  tipo: string;
  nome: string;
  matricula: number | string | null;
  detalhe: string;
  periodo: string;
  valor: number;
  pagamento: string;
  operador: string;
  dataHora: string;
  status: string;
};

export type SocioReserva = {
  id: string;
  matricula: number | string | null;
  nome: string;
  cpf: string | null;
  responsavel_id?: string | null;
  parentesco?: string | null;
  situacao?: string | null;
};

export type DependenteReserva = {
  id: string;
  socio_id: string;
  matricula: string | null;
  nome: string;
  parentesco: string | null;
  ativo: boolean;
};

export type ContaBancaria = {
  id: string;
  nome: string;
  banco: string | null;
  ativo: boolean;
};

export type PixConfig = {
  chave_pix?: string;
  nome_recebedor?: string;
  cidade?: string;
  copia_e_cola?: string;
};

export type Reserva = {
  id: string;
  espacoId: string;
  data: string;
  horario: string;
  nome: string;
  socioId?: string;
  dependenteId?: string;
  matricula?: number | string | null;
  tipoPessoa: TipoPessoa;
  valor: number;
  status: ReservaStatus;
  pagamento: ReservaPagamento;
  comprovante_url?: string | null;
  comprovante_nome?: string | null;
  comprovante_status?: string | null;
  dataPagamento?: string | null;
};

-- Permite cheque como forma de pagamento das parcelas de acordos.
ALTER TABLE public.acordos_mensalidades_parcelas
  DROP CONSTRAINT IF EXISTS acordos_mensalidades_parcelas_forma_pagamento_check;

ALTER TABLE public.acordos_mensalidades_parcelas
  ADD CONSTRAINT acordos_mensalidades_parcelas_forma_pagamento_check
  CHECK (
    forma_pagamento IS NULL OR forma_pagamento IN
      ('pix', 'cheque', 'debito_em_conta', 'boleto', 'dinheiro', 'transferencia', 'cartao', 'outro')
  );

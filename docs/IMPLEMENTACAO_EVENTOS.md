# Módulo Eventos — implementação

## O que foi incluído
- `/eventos` com visão diferente para administrador e associado.
- Administrador: cria, edita, publica/despublica e exclui eventos sem vendas.
- Campos: imagem do ingresso/ficha, título, descrição, tipo, local, data/hora, valor e quantidade opcional.
- Associado: somente visualiza eventos publicados e compra; não possui edição/exclusão.
- `eventos_vendas`: registra compra pendente, comprovante, aprovação/recusa e código/QR do ingresso.
- Numeração por evento com prefixo `ON`, exemplo `ON0001`.
- `eventos_acessos` fica disponível para a conferência do ingresso na entrada.
- `/avisos` com cadastro administrativo e visualização conforme público.
- Login de associado por matrícula; senha inicial é formada pelos 6 últimos números do CPF.
- Usuários: somente administrador pode gerenciar acessos; associado não precisa informar e-mail/senha para criação.

## SQL complementar
A tabela `eventos` existente não possui campo de preço/limite. Execute `docs/sql_eventos_comercial.sql` uma vez no Supabase antes de publicar o módulo.

## Observação
A aprovação já grava a venda como `aprovado` e preenche `aprovado_por`, `aprovado_em`, `numero`, `codigo` e `codigo_qr`. A criação automática de `receita_id` deve ser ligada depois da confirmação do schema completo da tabela `receitas`, para não inventar nomes de colunas.

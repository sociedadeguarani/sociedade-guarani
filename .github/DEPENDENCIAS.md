# Dependências e instalação — Sistema Guarani

Este repositório mantém `package.json` e `package-lock.json` sincronizados.

## Instalação reproduzível

Use Node.js 22 e execute:

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
```

`npm ci` instala exatamente as versões registradas no lockfile e falha quando os dois manifestos divergem. Não substitua por `npm install` em produção para corrigir divergências silenciosamente.

## Atualização de dependências

1. Altere as versões no `package.json` de forma intencional.
2. Gere o lockfile com `npm install --package-lock-only --ignore-scripts` numa máquina com acesso ao registry npm.
3. Revise o diff de `package-lock.json` e verifique versões e overrides.
4. Rode a sequência completa de validação acima.
5. Abra um pull request e aguarde o GitHub Actions ficar verde antes de promover para produção.

Não execute migrações de banco de dados como parte de uma atualização de dependências. Migrações têm revisão e janela de execução próprias.

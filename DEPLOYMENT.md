# Deploy FamaDetail ERP

## Melhor forma para acesso publico

Para este projeto, a forma mais simples e estavel e publicar no Vercel:

- Next.js App Router funciona diretamente no Vercel.
- Neon fica como PostgreSQL publico/seguro.
- UploadThing continua a tratar uploads de fotos.
- A pagina publica dos clientes fica em `/marcar`.

Depois do deploy, o link para clientes sera:

```txt
https://o-teu-dominio.vercel.app/marcar
```

ou, se ligares dominio proprio:

```txt
https://teu-dominio.pt/marcar
```

## Variaveis no Vercel

No Vercel, abre:

```txt
Project Settings -> Environment Variables
```

Adiciona pelo menos:

```txt
DATABASE_URL
UPLOADTHING_TOKEN
```

Se o Neon/Vercel criar tambem variaveis como `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `DATABASE_URL_UNPOOLED`, podes adicionar as mesmas que tens localmente. O codigo usa `DATABASE_URL` para o Prisma Neon adapter.

## Build settings

No Vercel:

```txt
Framework Preset: Next.js
Build Command: npm run build
Install Command: npm install
Output Directory: .next
```

## Base de dados

Antes do primeiro deploy de producao, confirma que o schema esta aplicado na base Neon de producao:

```bash
npx prisma db push
```

Usa a `DATABASE_URL` da base que queres publicar.

## UploadThing

Confirma no UploadThing:

- token de producao em `UPLOADTHING_TOKEN`
- dominio da app Vercel permitido, se a tua configuracao exigir dominios autorizados

## Rotas importantes

```txt
/dashboard     ERP interno
/agenda        gestao de marcacoes
/marcar        pagina publica para clientes
/settings      horarios e regras da agenda
```

## Notas

- Nao publiques `.env` nem `.env.local`.
- As variaveis devem estar no Vercel.
- A pagina `/marcar` nao mostra precos nem duracoes aos clientes.
- Os pedidos entram como pendentes e aparecem na dashboard e na agenda.

## Referencias oficiais

- Vercel Next.js: https://vercel.com/docs/concepts/next.js/overview
- Vercel Environment Variables: https://vercel.com/docs/projects/environment-variables
- Neon + Vercel: https://neon.com/docs/guides/vercel/
- UploadThing v7 token: https://docs.uploadthing.com/v7

# Projeto Pantanal e o Desenvolvimento Regional

Site do projeto do **IFMS** sobre monitoramento integrado de queimadas e saúde pública
no Pantanal, com a plataforma **Hemograma Ambiental**.

## Páginas

| Endereço | Página |
|---|---|
| `/` | Início |
| `/objetivo` | Objetivo |
| `/relatorio` | Relatório Técnico |
| `/hemograma` | **Hemograma Ambiental** (dados ao vivo) |
| `/equipe` | Equipe |
| `/parceiros` | Parceiros |
| `/mapa` | Mapa do Pantanal (fora do menu) |
| `/missao` | Missão (fora do menu) |

## Tecnologias

React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui, wouter (rotas), Express (servidor
da versão final). No Hemograma: TanStack Query, Leaflet/React-Leaflet e Recharts.

## Hemograma

Mostra queimadas (INPE), clima e qualidade do ar (Open-Meteo) e saúde respiratória
(DATASUS). Ao abrir a página, pede a localização e faz a **leitura rápida**:

- queimadas, clima e qualidade do ar dos **últimos 30 dias até hoje**, com um painel "Agora";
- saúde respiratória do **último ano completo publicado pelo DATASUS** (ele publica os
  dados meses depois), incluindo os leitos hospitalares do CNES;
- no mapa, clicar em um foco mostra os detalhes dele (data e hora, satélite, município,
  bioma, dias sem chuva, precipitação, risco de fogo e FRP), como no BDQueimadas.

Também permite pesquisar outro local e período.

Código: `client/src/pages/HemogramaPage.tsx` e a pasta `client/src/hemograma/`.

### De onde vêm os dados (site sem servidor)

O site funciona numa hospedagem **só com FTP**, sem nenhum servidor rodando:

| Dado | De onde vem |
|---|---|
| Clima e qualidade do ar | O navegador busca direto no **Open-Meteo** (`api/direto/openmeteo.ts`) |
| Localização (leitura rápida) | Direto no **OpenStreetMap / Nominatim** (`api/direto/localizacao.ts`) |
| Queimadas | Direto no **INPE** (`api/direto/inpe.ts`). Se o INPE não responder ao navegador, usa o arquivo `dados/queimadas/<UF>.json` |
| Saúde (DATASUS) | Arquivos `dados/saude/<UF>/<ano>.json` (`api/direto/saude.ts`) |

O DATASUS não pode ser lido pelo navegador, por isso os dados de saúde são **gerados no seu
computador** pelo script `gerar_dados_estaticos.py` (pasta `emograma_api`) e sobem pelo FTP
junto com o site. O script grava direto em `client/public/dados/`.

> Se um dia a API em Python for publicada num servidor, basta colocar o endereço dela em
> `VITE_HEMOGRAMA_API` (arquivo `.env.production`) e o site passa a usá-la.

## Como rodar (desenvolvimento)

Precisa do **Node.js 20.19 ou mais novo** (recomendado: versão LTS em nodejs.org).

```bash
npm install
npm run dev
```

Abra **http://localhost:3000**. Não precisa rodar a API: o site funciona igual à versão do FTP.

> A localização do navegador só funciona em `https` ou em `localhost`.

Para testar com a API em Python rodando no computador, crie o arquivo `.env.development`
com `VITE_HEMOGRAMA_API=/api` e rode a API (`python -m uvicorn app.main:app --reload`).

## Publicar por FTP (hospedagem comum)

1. **Gere os dados de saúde** (uma vez por mês é suficiente). Na pasta `emograma_api`, com
   o `.venv` ativado:

   ```bash
   python gerar_dados_estaticos.py
   ```

   Padrão: MS e MT, últimos 3 anos completos. Outros exemplos:
   `--estados MS MT GO`, `--anos 2023 2024 2025`, `--queimadas` (também guarda os focos dos
   últimos 90 dias, como reserva caso o INPE bloqueie o navegador).
2. Confira o **`.env.production`**: `SITE_BASE` é `/` se o site fica na raiz do domínio, ou a
   subpasta (ex: `/pantanal/`). Deixe `VITE_HEMOGRAMA_API` vazio.
3. Rode `npm run build:ftp`. Ele mostra quais dados de saúde vão junto e gera o site em
   **`dist/public`**.
4. Envie **o conteúdo** de `dist/public` (inclusive o arquivo oculto `.htaccess` e a pasta
   `dados`) para a pasta do site no servidor (geralmente `public_html`).

O `.htaccess` faz os endereços das páginas (ex: `/hemograma`) funcionarem em servidores
Apache. A localização da leitura rápida só funciona se o site estiver em **https**.

## Outros comandos

- `npm run check`: confere os tipos do TypeScript.
- `npm run format`: formata o código com o Prettier.

## Imagens

As fotos de fundo são do **Wikimedia Commons**, com licenças livres (CC BY, CC BY-SA ou
domínio público), e são carregadas direto de lá. Os endereços e os créditos ficam em
`client/src/lib/imagens.ts`, e os créditos aparecem no rodapé ("Créditos das fotos"),
como as licenças exigem. Para trocar uma foto, mude o endereço e o crédito nesse arquivo.

## Animações

Animações suaves de entrada (faixas do topo, troca de página e seções que aparecem ao
rolar) ficam em `client/src/index.css` e `client/src/hooks/useRevelarAoRolar.ts`. Elas
são desligadas automaticamente para quem ativou "reduzir movimento" no sistema.

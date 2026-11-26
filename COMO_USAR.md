# Projeto Pantanal: como usar

Esta pasta tem as duas partes do projeto:

- `pantanaldev/`: o site (React). É ele que vai para o FTP.
- `emograma_api/`: o Python. Agora serve para **gerar os dados de saúde** que vão junto
  com o site (e, se quiser, continua funcionando como API para testes).

> **Publicação automática:** com o projeto no GitHub, os passos 2 e 4 abaixo são feitos
> sozinhos todo mês. Veja `PUBLICAR_AUTOMATICO.md`. Os passos abaixo continuam valendo
> para testar no seu computador ou publicar à mão.

**O site funciona só com FTP, sem servidor.** Clima, qualidade do ar, localização e
queimadas o navegador busca direto das fontes públicas. A saúde (DATASUS) vem de arquivos
que o script Python gera no seu computador.

> Mantenha as duas pastas lado a lado (`pantanaldev` e `emograma_api` dentro da mesma pasta):
> o script grava os dados direto dentro do site.

## 1. Primeira vez no computador

**Python** (na pasta `emograma_api`):

```powershell
cd emograma_api
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements-lock.txt
```

**Site** (na pasta `pantanaldev`):

```powershell
cd pantanaldev
npm install
```

## 2. Gerar os dados de saúde (uma vez por mês)

Na pasta `emograma_api`, com o `.venv` ativado:

```powershell
python gerar_dados_estaticos.py
```

Gera MS e MT dos últimos 3 anos completos (a primeira vez demora alguns minutos).
Para outros estados: `python gerar_dados_estaticos.py --estados MS MT GO`.
Os arquivos aparecem em `pantanaldev/client/public/dados/`.

## 3. Testar no computador

Na pasta `pantanaldev`: `npm run dev` e abra http://localhost:3000.
Não precisa rodar a API: o site funciona do mesmo jeito que vai funcionar no FTP.

## 4. Gerar a versão para o FTP

1. Confira `pantanaldev/.env.production`: `SITE_BASE=/` se o site fica na raiz do domínio
   (ou ex: `/pantanal/` numa subpasta). Deixe `VITE_HEMOGRAMA_API=` **vazio**.
2. Na pasta `pantanaldev`: `npm run build:ftp` (ele mostra quais dados de saúde vão junto).
3. No FileZilla, envie **o conteúdo** de `pantanaldev/dist/public` (inclusive o arquivo
   oculto `.htaccess` e a pasta `dados`) para a pasta do site no servidor (geralmente
   `public_html`). Para ver arquivos ocultos no FileZilla: Servidor > Forçar exibição de
   arquivos ocultos.

Para atualizar os dados depois: repita o passo 2 e o passo 4 (dá para enviar só a pasta
`dados` de novo).

## Se as queimadas não aparecerem no site publicado

O site tenta buscar as queimadas direto do INPE. Se o INPE bloquear o navegador, o site
usa um arquivo de reserva. Para criá-lo, rode também:

```powershell
python gerar_dados_estaticos.py --sem-saude --queimadas
```

(guarda os focos dos últimos 90 dias; nesse caso, vale rodar todo dia ou toda semana).

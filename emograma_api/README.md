# API do Hemograma Ambiental (Python + FastAPI)

Busca e organiza os dados que a aba **Hemograma** do site mostra:

- **Queimadas** (INPE / BDQueimadas)
- **Clima e qualidade do ar** (Open-Meteo)
- **Saúde respiratória** (DATASUS, via PySUS): internações, óbitos e leitos
- **Localização** (OpenStreetMap / Nominatim) para a leitura rápida

Documentação automática das rotas: `http://127.0.0.1:8000/docs`.

## Site sem servidor (FTP): gerar os dados de saúde

O site funciona numa hospedagem só com FTP: clima, ar, localização e queimadas o navegador
busca direto das fontes. A **saúde** (DATASUS) não pode ser lida pelo navegador, então este
script baixa os dados no seu computador e grava arquivos prontos dentro do site
(`pantanaldev/client/public/dados/`). Eles sobem pelo FTP junto com o resto.

```powershell
.venv\Scripts\Activate.ps1
python gerar_dados_estaticos.py                               # MS e MT, últimos 3 anos completos
python gerar_dados_estaticos.py --estados MS MT GO            # outros estados
python gerar_dados_estaticos.py --anos 2023 2024 2025         # anos escolhidos
python gerar_dados_estaticos.py --queimadas                   # + focos dos últimos 90 dias (reserva)
python gerar_dados_estaticos.py --sem-saude --queimadas       # só atualiza as queimadas
```

A primeira vez demora (baixa os arquivos do DATASUS); depois fica bem mais rápido.
O script espera a pasta `pantanaldev` ao lado da `emograma_api`; se estiver em outro lugar,
use `--saida caminho/para/pantanaldev/client/public`. Rode uma vez por mês, depois
`npm run build:ftp` no site, e envie a pasta `dist/public` pelo FTP.

A API abaixo continua funcionando e é opcional (útil para testes e para o `/docs`).

## Rodar no computador (Windows, PowerShell)

Uma vez só:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements-lock.txt
```

Toda vez:

```powershell
.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

`requirements-lock.txt` tem as versões exatas que funcionam no Windows. `requirements.txt`
tem só as bibliotecas principais, com versão fixa (usado na publicação).

## Publicar a API na internet (opcional)

A API precisa de um servidor que rode Python (uma hospedagem só de FTP não serve).
Opções: Render (render.com, tem plano gratuito; o arquivo `render.yaml` já está pronto),
Railway, um VPS ou um servidor do IFMS. O comando para iniciar é:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Depois de publicada, coloque o endereço dela (com https) em `VITE_HEMOGRAMA_API`, no
arquivo `.env.production` do site, e gere o site de novo com `npm run build:ftp`.

> No plano gratuito do Render a API "dorme" após um tempo sem uso (a primeira busca
> demora ~1 minuto para acordar) e tem pouca memória: a saúde de estados grandes pode
> ficar lenta ou falhar. Para uso contínuo, prefira um plano pago ou um servidor próprio.

## Cache

Os resultados ficam guardados em `.cache_hemograma/`. Para limpar, apague essa pasta.

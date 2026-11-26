"""
Emograma Ambiental - API
------------------------
Ponto de entrada da aplicação. Este arquivo:
  1) cria o FastAPI;
  2) inclui as rotas de cada fonte de dados (INPE, Open-Meteo, PySUS) e as
     rotas do Hemograma, que juntam as três;
  3) serve o frontend React já compilado (pasta frontend/dist).

Para rodar:
    uvicorn app.main:app --reload

Durante o desenvolvimento do frontend, rode também (na pasta frontend):
    npm run dev
e abra http://localhost:5173 (o Vite repassa as chamadas da API para cá).

Para usar sem o Vite, gere o frontend uma vez com `npm run build` (na pasta
frontend) e abra http://127.0.0.1:8000.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.routers import hemograma, inpe, openmeteo, pysus

app = FastAPI(
    title="Emograma Ambiental - API",
    description=(
        "Dados de queimadas (INPE), clima (Open-Meteo) e saúde (PySUS), e o Hemograma, "
        "que junta as três fontes."
    ),
    version="2.0.0",
)

# Libera acesso do frontend (mesmo quando ele roda em outra porta, como no Vite)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Comprime as respostas grandes (ex: os 5.000 pontos do mapa) -- chegam bem
# mais rápido no navegador, principalmente no celular.
app.add_middleware(GZipMiddleware, minimum_size=1000)

# --- Rotas da API ---------------------------------------------------------
app.include_router(hemograma.router)
app.include_router(inpe.router)
app.include_router(openmeteo.router)
app.include_router(pysus.router)


@app.get("/api", tags=["Status"])
def status():
    """Rota simples pra checar se a API está de pé."""
    return {
        "status": "ok",
        "hemograma": ["/hemograma/queimadas", "/hemograma/clima", "/hemograma/saude", "/hemograma/completo"],
        "fontes_individuais": ["/inpe/focos", "/openmeteo/clima", "/pysus/respiratorio"],
    }


# --- Frontend React compilado (frontend/dist) ------------------------------
DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if (DIST_DIR / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{caminho:path}", include_in_schema=False)
    def frontend(caminho: str):
        arquivo = (DIST_DIR / caminho).resolve()
        if caminho and arquivo.is_file() and DIST_DIR.resolve() in arquivo.parents:
            return FileResponse(arquivo)
        return FileResponse(DIST_DIR / "index.html")
else:
    @app.get("/", include_in_schema=False)
    def frontend_ausente():
        return HTMLResponse(
            "<h2>Frontend ainda não compilado</h2>"
            "<p>Na pasta <code>frontend</code>, rode <code>npm install</code> e depois "
            "<code>npm run build</code>. Para desenvolver, use <code>npm run dev</code> e abra "
            "<a href='http://localhost:5173'>http://localhost:5173</a>.</p>"
            "<p>A documentação da API está em <a href='/docs'>/docs</a>.</p>"
        )

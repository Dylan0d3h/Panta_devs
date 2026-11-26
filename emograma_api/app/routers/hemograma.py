"""
Rotas do Hemograma. Prefixo: /hemograma

O frontend chama uma rota por fonte escolhida, todas ao mesmo tempo, e mostra
cada resultado assim que ele chega:
  /hemograma/queimadas  -> INPE (inclui os pontos do mapa)
  /hemograma/clima      -> Open-Meteo (clima e qualidade do ar)
  /hemograma/saude      -> PySUS/DATASUS (mais lento)
  /hemograma/completo   -> as fontes pedidas numa resposta só (útil no /docs)
  /hemograma/localizacao -> município/estado de uma coordenada (leitura rápida)
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import FonteExternaError
from app.services import hemograma_service, localizacao_service
from app.services.hemograma_service import Consulta

router = APIRouter(prefix="/hemograma", tags=["Hemograma"])

MAX_DIAS = 731  # até 2 anos por consulta


def consulta_valida(
    estado: str = Query(..., description="Sigla (ex: MS) ou nome completo do estado"),
    data_inicio: date = Query(..., description="Data inicial (AAAA-MM-DD)"),
    data_fim: date = Query(..., description="Data final (AAAA-MM-DD)"),
    municipio: str | None = Query(None, description="Município (opcional; sem ele, usa o estado todo e o clima da capital)"),
) -> Consulta:
    if data_fim < data_inicio:
        raise HTTPException(status_code=400, detail="A data final não pode ser anterior à data inicial.")
    if data_fim > date.today():
        raise HTTPException(status_code=400, detail="A data final não pode ser no futuro.")
    if (data_fim - data_inicio).days + 1 > MAX_DIAS:
        raise HTTPException(status_code=400, detail="O período máximo é de 2 anos.")
    try:
        return hemograma_service.montar_consulta(estado, municipio, data_inicio, data_fim)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def _responder(funcao, consulta: Consulta) -> dict:
    try:
        return funcao(consulta)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FonteExternaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/queimadas")
def hemograma_queimadas(consulta: Consulta = Depends(consulta_valida)):
    """Focos de queimada (INPE): totais, por satélite, por município, por
    semana, por mês e os pontos para o mapa (amostra de até 5.000)."""
    return _responder(hemograma_service.queimadas, consulta)


@router.get("/clima")
def hemograma_clima(consulta: Consulta = Depends(consulta_valida)):
    """Clima dia a dia e qualidade do ar do período (Open-Meteo), com resumo
    e série mensal. Sem município, usa a capital do estado."""
    return _responder(hemograma_service.clima, consulta)


@router.get("/saude")
def hemograma_saude(consulta: Consulta = Depends(consulta_valida)):
    """Internações e óbitos por doenças respiratórias ligadas à fumaça
    (PySUS/DATASUS), do estado inteiro. Pode levar alguns minutos na
    primeira vez; depois fica em cache."""
    return _responder(hemograma_service.saude, consulta)


@router.get("/completo")
def hemograma_completo(
    consulta: Consulta = Depends(consulta_valida),
    fontes: str = Query("queimadas,clima,saude", description="Fontes separadas por vírgula: queimadas, clima, saude"),
):
    """Todas as fontes pedidas numa resposta só. Se uma falhar, as outras
    continuam aparecendo (veja `erros`)."""
    lista = [f.strip() for f in fontes.split(",") if f.strip()]
    invalidas = [f for f in lista if f not in hemograma_service.FONTES]
    if not lista or invalidas:
        raise HTTPException(status_code=400, detail="Use fontes entre: queimadas, clima, saude.")
    return hemograma_service.gerar_hemograma(consulta, lista)


@router.get("/localizacao")
def localizacao(
    lat: float = Query(..., ge=-90, le=90, description="Latitude (ex: -20.47)"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude (ex: -55.79)"),
):
    """Descobre o município e o estado de uma coordenada. Usado pelo
    frontend para montar a leitura rápida com a localização atual."""
    try:
        return localizacao_service.municipio_da_coordenada(lat, lon)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except FonteExternaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

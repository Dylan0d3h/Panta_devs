"""
Rotas do Open-Meteo (clima). Prefixo: /openmeteo
"""

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.config import FonteExternaError
from app.services import openmeteo_service

router = APIRouter(prefix="/openmeteo", tags=["Open-Meteo - Clima"])


@router.get("/clima")
def clima_do_municipio(
    municipio: str = Query(..., description="Nome do município, ex: Aquidauana"),
    estado: str | None = Query(None, description="Sigla ou nome do estado, desempata municípios com nome repetido"),
    data_inicio: date | None = Query(None, description="Se informado (junto com data_fim), busca o clima do período"),
    data_fim: date | None = Query(None, description="Data final do período"),
):
    """Se `data_inicio`/`data_fim` NÃO forem informados: devolve o clima
    atual + previsão dos próximos 7 dias.
    Se forem informados: devolve o clima dia a dia do período e também a
    qualidade do ar DO PERÍODO (`qualidade_ar_periodo`).
    Em ambos os casos devolve a qualidade do ar ATUAL do local
    (PM2.5, PM10, CO, NO2, SO2, O3 e a classificação do índice US AQI)."""
    if bool(data_inicio) != bool(data_fim):
        raise HTTPException(status_code=400, detail="Informe data_inicio E data_fim juntos, ou nenhum dos dois.")
    if data_inicio and data_fim < data_inicio:
        raise HTTPException(status_code=400, detail="A data final não pode ser anterior à data inicial.")

    try:
        local = openmeteo_service.geocodificar_municipio(municipio, estado)
        lat, lon = local["latitude"], local["longitude"]

        qualidade_ar_periodo = None
        if data_inicio:
            clima = openmeteo_service.clima_periodo(lat, lon, data_inicio, data_fim)
            modo = "historico"
            try:
                qualidade_ar_periodo = openmeteo_service.qualidade_ar_periodo(lat, lon, data_inicio, data_fim)
            except FonteExternaError:
                qualidade_ar_periodo = None
        else:
            clima = openmeteo_service.clima_atual_e_previsao(lat, lon)
            modo = "atual_e_previsao"
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except FonteExternaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    # A qualidade do ar atual é uma consulta à parte. Se ela falhar (ex: local
    # sem cobertura), a rota não quebra -- só devolve qualidade_ar como null.
    try:
        qualidade_ar = openmeteo_service.qualidade_ar_atual(lat, lon)
    except FonteExternaError:
        qualidade_ar = None

    return {
        "municipio_encontrado": local.get("name"),
        "estado": local.get("admin1"),
        "latitude": lat,
        "longitude": lon,
        "modo": modo,
        "clima": clima,
        "qualidade_ar": qualidade_ar,
        "qualidade_ar_periodo": qualidade_ar_periodo,
    }

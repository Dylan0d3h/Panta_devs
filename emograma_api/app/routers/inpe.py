"""
Rotas do INPE (BDQueimadas). Prefixo: /inpe
"""

from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.config import FonteExternaError
from app.services import inpe_service

router = APIRouter(prefix="/inpe", tags=["INPE - Queimadas"])


@router.get("/focos")
def buscar_focos(
    ano_inicio: int = Query(..., description="Ano de início, ex: 2024"),
    mes_inicio: int = Query(..., ge=1, le=12, description="Mês de início (1-12)"),
    dia_inicio: int = Query(..., ge=1, le=31, description="Dia de início (1-31)"),
    ano_fim: int = Query(..., description="Ano final, ex: 2024"),
    mes_fim: int = Query(..., ge=1, le=12, description="Mês final (1-12)"),
    dia_fim: int = Query(..., ge=1, le=31, description="Dia final (1-31)"),
    estado: str = Query(..., description="Sigla (ex: MS) ou nome completo (ex: Mato Grosso do Sul)"),
    municipio: str | None = Query(None, description="Nome do município (opcional; deixe vazio para toda a UF)"),
    satelite_referencia: bool = Query(
        False, description="Se true, usa só o satélite de referência (o número oficial do site do INPE)"
    ),
):
    """Retorna os focos de queimada encontrados no período/local pedidos:
    total de registros, resumo semanal, contagem por satélite e os pontos
    (latitude/longitude) para desenhar no mapa. Quando o resultado tem
    muitos pontos, `pontos_mapa` traz uma amostra aleatória em vez de
    todos -- os TOTAIS (total_focos e focos_por_satelite) continuam exatos,
    sempre calculados em cima dos dados completos."""
    try:
        data_inicio = date(ano_inicio, mes_inicio, dia_inicio)
        data_fim = date(ano_fim, mes_fim, dia_fim)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Data inválida: {exc}")

    if data_fim < data_inicio:
        raise HTTPException(status_code=400, detail="A data final não pode ser anterior à data inicial.")

    try:
        df = inpe_service.consultar_focos(data_inicio, data_fim, estado, municipio, satelite_referencia)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FonteExternaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if df.empty:
        return {
            "total_focos": 0,
            "resumo_semanal": [],
            "focos_por_satelite": [],
            "pontos_mapa": [],
            "pontos_mapa_truncado": False,
        }

    resumo = inpe_service.resumo_semanal(df)
    por_satelite = inpe_service.resumo_por_satelite(df)
    pontos_mapa, truncado = inpe_service.pontos_para_mapa(df)

    return {
        "total_focos": len(df),
        "resumo_semanal": resumo.to_dict(orient="records"),
        "focos_por_satelite": por_satelite.to_dict(orient="records"),
        "pontos_mapa": pontos_mapa,
        "pontos_mapa_truncado": truncado,
    }

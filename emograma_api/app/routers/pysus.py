"""
Rotas do PySUS (internações e óbitos por doenças respiratórias). Prefixo: /pysus
"""

from fastapi import APIRouter, HTTPException, Query

from app.config import FonteExternaError
from app.services import pysus_service

router = APIRouter(prefix="/pysus", tags=["PySUS - Saúde"])


@router.get("/respiratorio")
def respiratorio(
    uf: str = Query(..., description="Sigla do estado, ex: MS"),
    ano: int = Query(..., description="Ano de referência, ex: 2023"),
    meses: str = Query(
        "1,2,3,4,5,6,7,8,9,10,11,12",
        description="Meses separados por vírgula (ex: 1,2,3). Padrão: ano inteiro.",
    ),
):
    """Baixa (via PySUS) internações (SIH) e óbitos (SIM) do UF/ano/meses
    pedidos, filtra as doenças respiratórias com relação documentada a
    fumaça de queimada e devolve: totais, a lista dessas doenças, leitos
    hospitalares (CNES), faixa etária e a evolução mês a mês. Internações e
    óbitos cobrem os mesmos meses.

    ATENÇÃO: isso baixa dados reais do DATASUS a cada chamada -- pode levar
    de segundos a alguns minutos, dependendo do UF/ano/quantidade de meses.
    """
    try:
        lista_meses = [int(m.strip()) for m in meses.split(",") if m.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="`meses` deve ser uma lista de números separados por vírgula.")

    try:
        return pysus_service.analisar_respiratorio(uf, ano, lista_meses)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FonteExternaError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

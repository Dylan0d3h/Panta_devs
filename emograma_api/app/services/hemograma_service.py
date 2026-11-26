"""
Hemograma: junta as três fontes (INPE, Open-Meteo e PySUS) para o mesmo
estado/município e o mesmo período.

Cada fonte tem sua própria função (e sua própria rota), para o frontend pedir
só as fontes escolhidas, todas ao mesmo tempo, e mostrar cada uma assim que
ela chega. Os resultados ficam em cache (app/cache.py): repetir uma busca é
instantâneo.

Todas as séries mensais usam a chave "mes" no formato "AAAA-MM", para o
frontend conseguir cruzar as fontes mês a mês.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date

import pandas as pd

from app.cache import em_cache, ttl_para_periodo
from app.config import CAPITAIS, FonteExternaError, resolver_uf_e_estado
from app.services import inpe_service, openmeteo_service, pysus_service

log = logging.getLogger(__name__)

LIMITE_PONTOS_MAPA = 5000


@dataclass(frozen=True)
class Consulta:
    """Parâmetros já validados de uma busca do Hemograma."""
    uf: str
    estado: str
    municipio: str | None
    data_inicio: date
    data_fim: date

    @property
    def municipio_clima(self) -> str:
        # Sem município, o clima e a qualidade do ar são os da capital
        return self.municipio or CAPITAIS[self.uf]

    def descricao(self) -> dict:
        return {
            "uf": self.uf,
            "estado": self.estado,
            "municipio": self.municipio,
            "data_inicio": self.data_inicio.isoformat(),
            "data_fim": self.data_fim.isoformat(),
        }


def montar_consulta(estado: str, municipio: str | None, data_inicio: date, data_fim: date) -> Consulta:
    uf, nome_estado = resolver_uf_e_estado(estado)  # ValueError -> 400 na rota
    municipio = (municipio or "").strip() or None
    return Consulta(uf, nome_estado, municipio, data_inicio, data_fim)


def _com_meta(nome_cache: str, consulta: Consulta, funcao) -> dict:
    """Roda a função com cache e acrescenta tempo e origem (cache ou não)."""
    inicio = time.perf_counter()
    valor, do_cache = em_cache(
        nome_cache, consulta.descricao(), ttl_para_periodo(consulta.data_fim), funcao,
    )
    return {
        **valor,
        "meta": {"tempo_segundos": round(time.perf_counter() - inicio, 2), "em_cache": do_cache},
    }


# ---------------------------------------------------------------------------
# Queimadas (INPE)
# ---------------------------------------------------------------------------

def _queimadas_sem_cache(c: Consulta) -> dict:
    df = inpe_service.consultar_focos(c.data_inicio, c.data_fim, c.uf, c.municipio)

    por_mes = []
    if not df.empty and "data_hora_gmt" in df.columns:
        datas = df["data_hora_gmt"].dropna().dt.tz_convert(openmeteo_service.FUSO).dt.tz_localize(None)
        contagem = datas.dt.strftime("%Y-%m").value_counts()
        por_mes = [{"mes": mes, "focos": int(n)} for mes, n in sorted(contagem.items())]

    pontos, truncado = inpe_service.pontos_para_mapa(df, limite=LIMITE_PONTOS_MAPA)

    return {
        "total_focos": len(df),
        "focos_por_satelite": inpe_service.resumo_por_satelite(df).to_dict(orient="records"),
        "resumo_semanal": inpe_service.resumo_semanal(df).to_dict(orient="records"),
        # Ranking de municípios só faz sentido quando a busca é do estado todo
        "municipios_mais_focos": (
            [] if c.municipio else inpe_service.resumo_por_municipio(df).to_dict(orient="records")
        ),
        "por_mes": por_mes,
        "pontos_mapa": pontos,
        "pontos_mapa_truncado": truncado,
    }


def queimadas(c: Consulta) -> dict:
    return _com_meta("queimadas_v2", c, lambda: _queimadas_sem_cache(c))


# ---------------------------------------------------------------------------
# Clima e qualidade do ar (Open-Meteo)
# ---------------------------------------------------------------------------

def _clima_por_mes(diario: list[dict], ar_diario: list[dict]) -> list[dict]:
    meses: dict[str, dict] = {}
    if diario:
        df = pd.DataFrame(diario)
        df["mes"] = df["data"].str[:7]
        for mes, g in df.groupby("mes"):
            meses[mes] = {
                "mes": mes,
                "precipitacao_total": _arred(g["precipitacao"].sum()),
                "temperatura_media": _arred(g["temperatura_media"].mean()),
                "temperatura_maxima": _arred(g["temperatura_maxima"].max()),
            }
    if ar_diario:
        df = pd.DataFrame(ar_diario)
        df["mes"] = df["data"].str[:7]
        for mes, g in df.groupby("mes"):
            linha = meses.setdefault(mes, {"mes": mes})
            linha["pm2_5_media"] = _arred(g["pm2_5"].mean())
            linha["us_aqi_pior"] = _arred(g["us_aqi_max"].max())
    return [meses[m] for m in sorted(meses)]


def _arred(valor):
    return None if valor is None or pd.isna(valor) else round(float(valor), 1)


def _clima_sem_cache(c: Consulta) -> dict:
    local = openmeteo_service.geocodificar_municipio(c.municipio_clima, c.uf)
    lat, lon = local["latitude"], local["longitude"]

    clima = openmeteo_service.clima_periodo(lat, lon, c.data_inicio, c.data_fim)
    diario = openmeteo_service.tabela_clima_diario(clima)

    try:
        ar_periodo = openmeteo_service.qualidade_ar_periodo(lat, lon, c.data_inicio, c.data_fim)
    except FonteExternaError:
        ar_periodo = None

    return {
        "local": {
            "municipio": local.get("name"),
            "estado": local.get("admin1"),
            "latitude": lat,
            "longitude": lon,
            "e_capital": c.municipio is None,
        },
        "resumo": openmeteo_service.resumo_clima(diario),
        "diario": diario,
        "qualidade_ar_periodo": ar_periodo,
        "por_mes": _clima_por_mes(diario, (ar_periodo or {}).get("diario") or []),
    }


def clima(c: Consulta) -> dict:
    resultado = _com_meta("clima", c, lambda: _clima_sem_cache(c))
    lat, lon = resultado["local"]["latitude"], resultado["local"]["longitude"]

    # O tempo e a qualidade do ar de AGORA mudam o tempo todo: nunca vêm do
    # cache. As duas consultas rodam ao mesmo tempo.
    def seguro(funcao):
        try:
            return funcao(lat, lon)
        except FonteExternaError:
            return None

    with ThreadPoolExecutor(max_workers=2) as executor:
        ar = executor.submit(seguro, openmeteo_service.qualidade_ar_atual)
        tempo = executor.submit(seguro, openmeteo_service.clima_agora)
        resultado["qualidade_ar_atual"] = ar.result()
        resultado["clima_atual"] = tempo.result()
    return resultado


# ---------------------------------------------------------------------------
# Saúde respiratória (PySUS / DATASUS)
# ---------------------------------------------------------------------------

def _saude_sem_cache(c: Consulta) -> dict:
    resultado = pysus_service.analisar_respiratorio_periodo(c.uf, c.data_inicio, c.data_fim)
    resultado["por_mes"] = [
        {"mes": f"{l['ano']}-{l['mes']:02d}", "internacoes": l["internacoes"], "obitos": l["obitos"]}
        for l in resultado["por_mes"]
    ]
    return resultado


def saude(c: Consulta) -> dict:
    # Sem cache próprio aqui: cada ano já fica em cache dentro do
    # pysus_service (e os leitos que falharem são tentados de novo).
    inicio = time.perf_counter()
    resultado = _saude_sem_cache(c)
    tempo = round(time.perf_counter() - inicio, 2)
    return {**resultado, "meta": {"tempo_segundos": tempo, "em_cache": tempo < 1.5}}


# ---------------------------------------------------------------------------
# Tudo junto numa resposta só (rota /hemograma/completo)
# ---------------------------------------------------------------------------

FONTES = {"queimadas": queimadas, "clima": clima, "saude": saude}


def _executar(nome: str, funcao, consulta: Consulta):
    try:
        return funcao(consulta), None
    except (ValueError, FonteExternaError) as exc:
        return None, str(exc)
    except Exception as exc:  # bug inesperado: registra e segue com as outras fontes
        log.exception("Erro inesperado na fonte %s do Hemograma", nome)
        return None, f"Erro interno: {exc}"


def gerar_hemograma(consulta: Consulta, fontes: list[str]) -> dict:
    """Roda as fontes escolhidas em paralelo. Se uma falhar, as outras
    continuam; a falha aparece em `erros`."""
    with ThreadPoolExecutor(max_workers=len(fontes)) as executor:
        futuros = {nome: executor.submit(_executar, nome, FONTES[nome], consulta) for nome in fontes}
        resultados = {nome: f.result() for nome, f in futuros.items()}

    resposta = {"parametros": consulta.descricao(), "erros": {}}
    for nome, (valor, erro) in resultados.items():
        resposta[nome] = valor
        if erro:
            resposta["erros"][nome] = erro
    return resposta

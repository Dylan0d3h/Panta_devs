from datetime import date, timedelta

import pandas as pd
import requests

from app.config import FonteExternaError, remover_acentos, resolver_uf_e_estado

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

FUSO = "America/Sao_Paulo"

# O arquivo histórico (archive) do Open-Meteo chega com alguns dias de
# atraso; a API de previsão cobre esses dias recentes.
ATRASO_ARQUIVO_DIAS = 6

# Variáveis diárias que pedimos ao Open-Meteo (mesmas para forecast e archive,
# pra facilitar a comparação entre os dois modos)
VARIAVEIS_DIARIAS = [
    "temperature_2m_mean",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "wind_speed_10m_max",
]

# Poluentes que pedimos à API de qualidade do ar, e como cada um vira uma
# chave mais simples na resposta da nossa API
POLUENTES = {
    "pm2_5": "pm2_5",
    "pm10": "pm10",
    "carbon_monoxide": "co",
    "nitrogen_dioxide": "no2",
    "sulphur_dioxide": "so2",
    "ozone": "o3",
}

# Diretriz da OMS (2021) para PM2.5: média de 24h de até 15 µg/m³.
LIMITE_OMS_PM25_24H = 15

# Faixas do índice US AQI (o mesmo usado pela EPA americana; o Open-Meteo só
# calcula o índice europeu para pontos dentro da Europa, então usamos o
# americano, que funciona em qualquer lugar do mundo, inclusive Brasil).
FAIXAS_US_AQI = [
    (50, "Boa"),
    (100, "Moderada"),
    (150, "Ruim para grupos sensíveis"),
    (200, "Ruim"),
    (300, "Muito ruim"),
]


def classificar_us_aqi(valor: float | None) -> str | None:
    if valor is None or pd.isna(valor):
        return None
    for limite, classificacao in FAIXAS_US_AQI:
        if valor <= limite:
            return classificacao
    return "Perigosa"


def _get_json(url: str, params: dict, nome_servico: str) -> dict:
    """GET no Open-Meteo transformando qualquer falha em FonteExternaError,
    com o motivo que o próprio Open-Meteo devolve (campo 'reason')."""
    try:
        resp = requests.get(url, params=params, timeout=30)
    except requests.RequestException as exc:
        raise FonteExternaError(f"Falha ao conectar no Open-Meteo ({nome_servico}): {exc}") from exc

    if not resp.ok:
        try:
            motivo = resp.json().get("reason") or resp.text[:200]
        except ValueError:
            motivo = resp.text[:200]
        raise FonteExternaError(f"O Open-Meteo ({nome_servico}) recusou a consulta: {motivo}")
    return resp.json()


def _float_ou_none(valor):
    if valor is None or pd.isna(valor):
        return None
    return round(float(valor), 2)


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------

def geocodificar_municipio(municipio: str, estado: str | None = None) -> dict:
    """Busca o município no geocoding do Open-Meteo. Se `estado` for
    informado (sigla ou nome), só aceita um resultado daquele estado --
    assim "Bonito" com estado MS não cai no Bonito de Pernambuco."""
    params = {"name": municipio.strip(), "count": 20, "language": "pt", "format": "json", "countryCode": "BR"}
    dados = _get_json(GEOCODING_URL, params, "geocoding")

    resultados = dados.get("results") or []
    if not resultados:
        raise ValueError(f"Município '{municipio}' não encontrado no Open-Meteo.")

    if estado:
        _, nome_estado = resolver_uf_e_estado(estado)  # ValueError se o estado não existir
        for r in resultados:
            if remover_acentos(r.get("admin1") or "").upper() == nome_estado:
                return r
        raise ValueError(f"Município '{municipio}' não encontrado no estado {nome_estado}.")

    # Sem estado, usa o primeiro resultado (o mais relevante para o Open-Meteo)
    return resultados[0]


# ---------------------------------------------------------------------------
# Clima
# ---------------------------------------------------------------------------

def clima_atual_e_previsao(latitude: float, longitude: float) -> dict:
    """Clima atual + previsão diária dos próximos 7 dias."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current_weather": True,
        "daily": ",".join(VARIAVEIS_DIARIAS),
        "timezone": FUSO,
        "forecast_days": 7,
    }
    return _get_json(FORECAST_URL, params, "previsão")


def clima_historico(latitude: float, longitude: float, data_inicio: date, data_fim: date) -> dict:
    """Clima histórico dia a dia, para um período já passado (arquivo)."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": data_inicio.isoformat(),
        "end_date": data_fim.isoformat(),
        "daily": ",".join(VARIAVEIS_DIARIAS),
        "timezone": FUSO,
    }
    return _get_json(ARCHIVE_URL, params, "histórico")


def _clima_recente(latitude: float, longitude: float, data_inicio: date, data_fim: date) -> dict:
    """Dias recentes (e até 16 dias à frente) pela API de previsão."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": data_inicio.isoformat(),
        "end_date": data_fim.isoformat(),
        "daily": ",".join(VARIAVEIS_DIARIAS),
        "timezone": FUSO,
    }
    return _get_json(FORECAST_URL, params, "previsão")


def clima_periodo(latitude: float, longitude: float, data_inicio: date, data_fim: date) -> dict:
    """Clima dia a dia para QUALQUER período (passado, recente ou misto).
    Usa o arquivo histórico para o que já foi consolidado e a API de
    previsão para os últimos dias, e junta as duas respostas."""
    hoje = date.today()
    corte = hoje - timedelta(days=ATRASO_ARQUIVO_DIAS)

    if data_fim <= corte:
        return clima_historico(latitude, longitude, data_inicio, data_fim)
    if data_inicio > corte:
        return _clima_recente(latitude, longitude, data_inicio, data_fim)

    # Período misto: parte no arquivo, parte na previsão
    parte_antiga = clima_historico(latitude, longitude, data_inicio, corte)
    parte_nova = _clima_recente(latitude, longitude, corte + timedelta(days=1), data_fim)
    daily = {}
    for chave in ["time"] + VARIAVEIS_DIARIAS:
        daily[chave] = (parte_antiga.get("daily", {}).get(chave) or []) + (parte_nova.get("daily", {}).get(chave) or [])
    return {**parte_antiga, "daily": daily}


def tabela_clima_diario(clima: dict) -> list[dict]:
    """Transforma o bloco 'daily' do Open-Meteo em linhas prontas pra tabela."""
    diario = clima.get("daily") or {}
    datas = diario.get("time") or []

    def valor(chave, i):
        lista = diario.get(chave) or []
        return _float_ou_none(lista[i]) if i < len(lista) else None

    return [
        {
            "data": d,
            "temperatura_media": valor("temperature_2m_mean", i),
            "temperatura_maxima": valor("temperature_2m_max", i),
            "temperatura_minima": valor("temperature_2m_min", i),
            "precipitacao": valor("precipitation_sum", i),
            "vento_maximo": valor("wind_speed_10m_max", i),
        }
        for i, d in enumerate(datas)
    ]


def resumo_clima(linhas: list[dict]) -> dict:
    """Indicadores do período inteiro (médias, extremos, chuva total)."""
    if not linhas:
        return {}
    df = pd.DataFrame(linhas)
    return {
        "dias": len(df),
        "temperatura_media": _float_ou_none(df["temperatura_media"].mean()),
        "temperatura_maxima": _float_ou_none(df["temperatura_maxima"].max()),
        "temperatura_minima": _float_ou_none(df["temperatura_minima"].min()),
        "precipitacao_total": _float_ou_none(df["precipitacao"].sum()),
        "dias_sem_chuva": int((df["precipitacao"].fillna(0) < 1).sum()),
        "vento_maximo": _float_ou_none(df["vento_maximo"].max()),
    }


def clima_agora(latitude: float, longitude: float) -> dict | None:
    """Condição do tempo AGORA (temperatura, umidade, vento e o código do
    tempo, ex: céu limpo, chuva), para a leitura rápida."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
        "timezone": FUSO,
    }
    atual = _get_json(FORECAST_URL, params, "tempo agora").get("current")
    if not atual:
        return None
    return {
        "horario": atual.get("time"),
        "temperatura": _float_ou_none(atual.get("temperature_2m")),
        "sensacao_termica": _float_ou_none(atual.get("apparent_temperature")),
        "umidade": _float_ou_none(atual.get("relative_humidity_2m")),
        "precipitacao": _float_ou_none(atual.get("precipitation")),
        "vento": _float_ou_none(atual.get("wind_speed_10m")),
        "codigo_tempo": atual.get("weather_code"),
    }


# ---------------------------------------------------------------------------
# Qualidade do ar
# ---------------------------------------------------------------------------

def qualidade_ar_atual(latitude: float, longitude: float) -> dict | None:
    """Qualidade do ar agora (PM2.5, PM10, CO, NO2, SO2, O3 + índice US AQI
    já classificado em texto). Devolve None se a API não tiver dado para o
    ponto pedido."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": ",".join(list(POLUENTES.keys()) + ["us_aqi"]),
        "timezone": FUSO,
    }
    dados = _get_json(AIR_QUALITY_URL, params, "qualidade do ar")

    atual = dados.get("current")
    if not atual:
        return None

    resultado = {chave_amigavel: atual.get(chave_api) for chave_api, chave_amigavel in POLUENTES.items()}
    resultado["us_aqi"] = atual.get("us_aqi")
    resultado["classificacao"] = classificar_us_aqi(atual.get("us_aqi"))
    return resultado


def qualidade_ar_periodo(latitude: float, longitude: float, data_inicio: date, data_fim: date) -> dict | None:
    """Qualidade do ar DO PERÍODO pedido (não a de agora): médias diárias
    dos poluentes, pior índice US AQI de cada dia e um resumo do período.
    Devolve None se o Open-Meteo não tiver dados para essas datas (a série
    histórica de qualidade do ar é mais curta que a de clima)."""
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(list(POLUENTES.keys()) + ["us_aqi"]),
        "start_date": data_inicio.isoformat(),
        "end_date": data_fim.isoformat(),
        "timezone": FUSO,
    }
    dados = _get_json(AIR_QUALITY_URL, params, "qualidade do ar")

    horario = dados.get("hourly") or {}
    if not horario.get("time"):
        return None

    df = pd.DataFrame(horario)
    df["data"] = pd.to_datetime(df["time"]).dt.strftime("%Y-%m-%d")
    colunas = [c for c in list(POLUENTES.keys()) + ["us_aqi"] if c in df.columns]
    df[colunas] = df[colunas].apply(pd.to_numeric, errors="coerce")
    if df[colunas].isna().all().all():
        return None

    agregacoes = {c: "mean" for c in POLUENTES if c in df.columns}
    if "us_aqi" in df.columns:
        agregacoes["us_aqi"] = "max"
    diario = df.groupby("data").agg(agregacoes).reset_index()

    linhas = []
    for _, r in diario.iterrows():
        linha = {"data": r["data"]}
        for chave_api, chave_amigavel in POLUENTES.items():
            linha[chave_amigavel] = _float_ou_none(r.get(chave_api))
        linha["us_aqi_max"] = _float_ou_none(r.get("us_aqi"))
        linha["classificacao"] = classificar_us_aqi(r.get("us_aqi"))
        linhas.append(linha)

    pm25 = diario["pm2_5"] if "pm2_5" in diario.columns else pd.Series(dtype=float)
    aqi_max = diario["us_aqi"].max() if "us_aqi" in diario.columns else None
    resumo = {
        "pm2_5_media": _float_ou_none(pm25.mean()),
        "pm2_5_pior_dia": _float_ou_none(pm25.max()),
        "dias_pm2_5_acima_oms": int((pm25 > LIMITE_OMS_PM25_24H).sum()),
        "pm10_media": _float_ou_none(diario["pm10"].mean()) if "pm10" in diario.columns else None,
        "us_aqi_pior": _float_ou_none(aqi_max),
        "classificacao_pior": classificar_us_aqi(aqi_max),
    }
    return {"diario": linhas, "resumo": resumo}

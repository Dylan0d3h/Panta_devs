"""
Descobre o município e o estado a partir de uma latitude/longitude
(geocodificação reversa), para o frontend fazer a "leitura rápida" com a
localização atual da pessoa.

Usa o Nominatim (OpenStreetMap): gratuito e sem chave, mas com regra de uso
de no máximo 1 requisição por segundo e um User-Agent que identifique o
aplicativo. Por isso o resultado fica em cache (coordenadas arredondadas a
~1 km), e a mesma região quase nunca é consultada duas vezes.
"""

import requests

from app.cache import em_cache
from app.config import FonteExternaError, UF_PARA_ESTADO

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "HemogramaAmbiental/2.0 (Projeto Pantanal - IFMS)"
TTL_LOCALIZACAO = 90 * 24 * 3600  # municípios não mudam de lugar: 90 dias


def _consultar_nominatim(latitude: float, longitude: float) -> dict:
    params = {
        "lat": latitude,
        "lon": longitude,
        "format": "jsonv2",
        "zoom": 10,  # nível de município
        "addressdetails": 1,
        "accept-language": "pt-BR",
    }
    try:
        resp = requests.get(NOMINATIM_URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=15)
        resp.raise_for_status()
        dados = resp.json()
    except (requests.RequestException, ValueError) as exc:
        raise FonteExternaError(f"Não foi possível identificar o município da sua localização: {exc}") from exc

    endereco = dados.get("address") or {}
    if endereco.get("country_code") != "br":
        raise ValueError("Sua localização parece estar fora do Brasil. Escolha um estado e município no formulário.")

    codigo_uf = (endereco.get("ISO3166-2-lvl4") or "").replace("BR-", "")
    if codigo_uf not in UF_PARA_ESTADO:
        raise ValueError("Não foi possível identificar o estado da sua localização.")

    municipio = (
        endereco.get("city") or endereco.get("town") or endereco.get("municipality")
        or endereco.get("village") or endereco.get("county")
    )
    if not municipio:
        raise ValueError("Não foi possível identificar o município da sua localização.")

    return {"municipio": municipio, "uf": codigo_uf, "estado": UF_PARA_ESTADO[codigo_uf]}


def municipio_da_coordenada(latitude: float, longitude: float) -> dict:
    """Devolve {municipio, uf, estado} da coordenada (com cache)."""
    # Arredondar para 2 casas (~1 km) evita uma consulta nova a cada metro
    lat, lon = round(latitude, 2), round(longitude, 2)
    valor, _ = em_cache(
        "localizacao", {"lat": lat, "lon": lon}, TTL_LOCALIZACAO,
        lambda: _consultar_nominatim(lat, lon),
    )
    return valor

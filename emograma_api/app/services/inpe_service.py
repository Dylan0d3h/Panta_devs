from concurrent.futures import ThreadPoolExecutor
from datetime import date
from io import StringIO

import pandas as pd
import requests

from app.config import FonteExternaError, remover_acentos, resolver_uf_e_estado

WFS_URL = "https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/ows"

# Só as colunas que o projeto usa. Pedir menos colunas deixa o arquivo
# baixado do INPE bem menor (e a consulta mais rápida). As últimas aparecem
# no balão de informações de cada foco no mapa, como no BDQueimadas.
COLUNAS_USADAS = [
    "data_hora_gmt", "satelite", "municipio", "estado", "latitude", "longitude",
    "bioma", "numero_dias_sem_chuva", "precipitacao", "risco_fogo", "frp",
]

# Informações extras de cada foco, enviadas para o mapa
COLUNAS_DETALHE_FOCO = ["municipio", "estado", "bioma", "numero_dias_sem_chuva", "precipitacao", "risco_fogo", "frp"]


def _texto_cql(valor: str) -> str:
    """Escapa um texto para usar dentro de aspas simples no CQL (o apóstrofo
    vira dois apóstrofos). Sem isso, municípios como "Olhos d'Água" quebram
    a consulta -- e o campo ficaria aberto a injeção de filtro."""
    return valor.replace("'", "''")


def _montar_cql_filter(data_inicio: date, data_fim: date, nome_estado: str = None,
                        municipio: str = None) -> str:
    partes = [
        f"data_hora_gmt DURING {data_inicio.isoformat()}T00:00:00Z/{data_fim.isoformat()}T23:59:59Z",
    ]

    if nome_estado:
        # Igualdade exata: com ILIKE '%PARA%' vinham também PARAIBA e PARANA,
        # e 'MATO GROSSO' trazia junto o MATO GROSSO DO SUL.
        partes.append(f"estado = '{_texto_cql(nome_estado)}'")

    if municipio:
        # Nome inteiro (sem curingas), sem diferenciar maiúsculas; testa a
        # grafia digitada e a versão sem acento, pra funcionar dos dois jeitos.
        municipio = municipio.strip()
        variantes = {municipio, remover_acentos(municipio)}
        condicoes = [f"municipio ILIKE '{_texto_cql(v)}'" for v in sorted(variantes)]
        partes.append("(" + " OR ".join(condicoes) + ")")

    return " AND ".join(partes)


def _baixar_csv(params: dict, type_name: str) -> str:
    try:
        resp = requests.get(WFS_URL, params=params, timeout=90)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise FonteExternaError(f"Falha ao consultar o INPE (camada {type_name}): {exc}") from exc
    return resp.text.strip()


def _consultar_focos_ano(ano: int, data_inicio: date, data_fim: date, nome_estado: str = None,
                          municipio: str = None, satelite_referencia: bool = False) -> pd.DataFrame:
    sufixo = "satref" if satelite_referencia else "todosats"

    if ano == date.today().year:
        type_name = f"dados_abertos:focos_ano_atual_br_{sufixo}"
    else:
        type_name = f"dados_abertos:focos_{ano}_br_{sufixo}"

    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeName": type_name,
        "outputFormat": "csv",
        "CQL_FILTER": _montar_cql_filter(data_inicio, data_fim, nome_estado, municipio),
        "propertyName": ",".join(COLUNAS_USADAS),
    }

    texto = _baixar_csv(params, type_name)
    # Se o INPE não aceitar a lista de colunas (ex: alguma mudou de nome),
    # tenta de novo pedindo todas, pra não quebrar a busca.
    if texto.startswith("<") and "propert" in texto.lower():
        params.pop("propertyName")
        texto = _baixar_csv(params, type_name)

    if not texto:
        return pd.DataFrame()

    # Quando o filtro é inválido, o GeoServer responde 200 com um XML de erro
    # no lugar do CSV.
    if texto.startswith("<"):
        raise FonteExternaError(f"O INPE recusou a consulta (camada {type_name}): {texto[:300]}")

    df = pd.read_csv(StringIO(texto))
    if "data_hora_gmt" in df.columns:
        df["data_hora_gmt"] = pd.to_datetime(df["data_hora_gmt"], errors="coerce", utc=True)
    return df


def consultar_focos(data_inicio: date, data_fim: date, uf_ou_estado: str = None,
                     municipio: str = None, satelite_referencia: bool = False) -> pd.DataFrame:
    """Consulta focos de queimada no intervalo pedido, cobrindo múltiplos
    anos se o período atravessar a virada do ano (cada ano é uma camada
    WFS separada no INPE).

    uf_ou_estado: sigla (ex: 'MS') ou nome completo (ex: 'Mato Grosso do Sul').
    Se None, busca em todo o Brasil.
    """
    if data_fim.year > date.today().year:
        raise ValueError("O período não pode passar do ano atual (o INPE ainda não tem esses dados).")

    nome_estado = None
    if uf_ou_estado:
        _, nome_estado = resolver_uf_e_estado(uf_ou_estado)

    # Cada ano é uma camada separada no INPE: consulta todas ao mesmo tempo
    anos = range(data_inicio.year, data_fim.year + 1)
    with ThreadPoolExecutor(max_workers=len(anos)) as executor:
        futuros = [
            executor.submit(
                _consultar_focos_ano, ano,
                max(data_inicio, date(ano, 1, 1)), min(data_fim, date(ano, 12, 31)),
                nome_estado, municipio, satelite_referencia,
            )
            for ano in anos
        ]
        dfs = [f.result() for f in futuros]
    dfs = [df for df in dfs if not df.empty]

    if not dfs:
        return pd.DataFrame()
    return pd.concat(dfs, ignore_index=True)


def resumo_semanal(df: pd.DataFrame) -> pd.DataFrame:
    """Agrupa os focos por semana. Cada semana vai de terça a segunda-feira
    e é rotulada pela segunda-feira em que termina (regra 'W-MON' do pandas).
    Feito em cima dos dados já baixados, não é um filtro do servidor."""
    if df.empty or "data_hora_gmt" not in df.columns:
        return pd.DataFrame(columns=["semana", "total_focos"])

    contagem = (
        df.dropna(subset=["data_hora_gmt"])
          .set_index("data_hora_gmt")
          .resample("W-MON")
          .size()
          .reset_index(name="total_focos")
          .rename(columns={"data_hora_gmt": "semana"})
    )
    # Só a data (sem o "00:00:00" que vem junto do timestamp) -- mais limpo pro frontend
    contagem["semana"] = contagem["semana"].dt.strftime("%Y-%m-%d")
    return contagem


def resumo_por_satelite(df: pd.DataFrame) -> pd.DataFrame:
    """Quantos focos cada satélite captou. Usa o DataFrame completo (não a
    amostra do mapa), então a contagem é sempre exata."""
    if df.empty or "satelite" not in df.columns:
        return pd.DataFrame(columns=["satelite", "quantidade"])

    contagem = df["satelite"].value_counts().reset_index()
    contagem.columns = ["satelite", "quantidade"]
    return contagem.sort_values("quantidade", ascending=False).reset_index(drop=True)


def resumo_por_municipio(df: pd.DataFrame, limite: int = 15) -> pd.DataFrame:
    """Os municípios com mais focos no período (usado pelo Hemograma)."""
    if df.empty or "municipio" not in df.columns:
        return pd.DataFrame(columns=["municipio", "quantidade", "percentual_do_total"])

    contagem = df["municipio"].value_counts().reset_index()
    contagem.columns = ["municipio", "quantidade"]
    contagem["percentual_do_total"] = (contagem["quantidade"] / len(df) * 100).round(2)
    return contagem.head(limite)


def _limpar_numero(serie: pd.Series) -> pd.Series:
    """O INPE usa -999 (ou vazio) quando não tem o valor: vira None."""
    numeros = pd.to_numeric(serie, errors="coerce")
    return numeros.where(numeros > -900).round(2)


def pontos_para_mapa(df: pd.DataFrame, limite: int = 5000) -> tuple[list[dict], bool]:
    """Devolve os pontos para desenhar no mapa, com as informações de cada
    foco (data/hora, satélite, município, bioma, dias sem chuva, chuva, risco
    de fogo e FRP), parecido com o balão do BDQueimadas.

    Se houver mais pontos do que `limite`, sorteia uma amostra aleatória
    simples em vez de pegar só os primeiros. Os TOTAIS (resumo_por_satelite)
    sempre usam o DataFrame completo -- só o desenho no mapa é limitado, por
    causa do tamanho da resposta e da performance do navegador.
    """
    if df.empty or "latitude" not in df.columns or "longitude" not in df.columns:
        return [], False

    # Coordenadas vazias viram NaN, que não é JSON válido
    df = df.dropna(subset=["latitude", "longitude"])

    truncado = len(df) > limite
    amostra = df.sample(n=limite, random_state=42) if truncado else df

    pontos = amostra[["latitude", "longitude"]].round(4).copy()
    if "satelite" in amostra.columns:
        pontos["satelite"] = amostra["satelite"]
    if "data_hora_gmt" in amostra.columns:
        pontos["data_hora_gmt"] = amostra["data_hora_gmt"].dt.strftime("%Y-%m-%d %H:%M").fillna("")

    for coluna in COLUNAS_DETALHE_FOCO:
        if coluna not in amostra.columns:
            continue
        if coluna in ("municipio", "estado", "bioma"):
            pontos[coluna] = amostra[coluna].astype("string").str.strip()
        else:
            pontos[coluna] = _limpar_numero(amostra[coluna])

    # NaN não é JSON válido: troca por None
    pontos = pontos.astype(object).where(pontos.notna(), None)
    return pontos.to_dict(orient="records"), truncado

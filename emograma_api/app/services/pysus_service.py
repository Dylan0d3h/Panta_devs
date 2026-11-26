"""
Internações (SIH) e óbitos (SIM) por doenças respiratórias ligadas à fumaça
de queimadas, baixados com o PySUS (versão 2.x).

Observações sobre os dados:
- O SIH é organizado por COMPETÊNCIA (mês em que a AIH foi processada), não
  pela data da internação -- é assim que os arquivos do DATASUS vêm.
- Os arquivos do SIM usados aqui (DO) são por UF de RESIDÊNCIA; os do SIH são
  pela UF do hospital. Pequenas diferenças entre os dois são esperadas.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date

import pandas as pd
import pysus

from app.cache import em_cache, ttl_para_periodo
from app.config import CODIGO_IBGE_UF, FonteExternaError, resolver_uf_e_estado

ANO_MINIMO = 2008  # SIH/RD com CID-10 no formato atual

COLUNAS_SIH = ["N_AIH", "ANO_CMPT", "MES_CMPT", "DIAG_PRINC", "IDADE", "COD_IDADE", "MUNIC_MOV"]
COLUNAS_SIM = ["CAUSABAS", "DTOBITO", "IDADE", "CODMUNRES"]
COLUNAS_CNES_LT = ["TP_LEITO", "QT_EXIST", "QT_SUS"]


# ---------------------------------------------------------------------------
# Download (PySUS 2.x)
# ---------------------------------------------------------------------------

def _baixar(funcao, nome_base: str, colunas: list[str], **kwargs) -> pd.DataFrame:
    """Chama o PySUS pedindo um DataFrame só com as colunas necessárias
    (o PySUS ignora as que não existirem na base). Falhas de rede/DATASUS
    viram FonteExternaError."""
    try:
        df = funcao(**kwargs, columns=colunas, as_dataframe=True, show_progress=False)
    except Exception as exc:
        raise FonteExternaError(f"Falha ao baixar o {nome_base} pelo PySUS: {exc}") from exc

    if df is None:
        return pd.DataFrame()
    return df if isinstance(df, pd.DataFrame) else pd.DataFrame(df)


def filtrar_por_uf(df: pd.DataFrame, coluna_municipio: str, uf: str) -> pd.DataFrame:
    """Garante que só ficam registros do estado pedido, pelo código IBGE do
    município (os 2 primeiros dígitos são a UF). O espelho do DATASUS usado
    pelo PySUS pode devolver arquivos de outros estados (ex: o SIM chegou a
    vir com o Brasil inteiro), e isso inflava os totais."""
    if df is None or len(df) == 0 or coluna_municipio not in df.columns:
        return df
    codigo = CODIGO_IBGE_UF.get(uf)
    if not codigo:
        return df
    prefixo = df[coluna_municipio].astype(str).str.strip().str[:2]
    return df[prefixo == codigo]


def download_sih(uf: str, ano: int, meses: list[int]) -> pd.DataFrame:
    return _baixar(pysus.sih, "SIH (internações)", COLUNAS_SIH,
                   state=uf, year=ano, month=meses, group="RD")


def download_sim(uf: str, ano: int) -> pd.DataFrame:
    # No PySUS 2.x o grupo do SIM com CID-10 se chama "DO" (antes estava
    # "CID10", que não existe e fazia os óbitos virem sempre zerados).
    return _baixar(pysus.sim, "SIM (óbitos)", COLUNAS_SIM,
                   state=uf, year=ano, group="DO")


def filtrar_sim_por_meses(df: pd.DataFrame, meses: list[int]) -> pd.DataFrame:
    """O SIM vem por ANO; aqui ficam só os óbitos dos meses pedidos, pra
    comparar com as internações do mesmo período. DTOBITO = 'DDMMAAAA'."""
    if len(df) == 0 or "DTOBITO" not in df.columns:
        return df
    df = df.copy()
    texto = df["DTOBITO"].astype(str).str.split(".").str[0].str.zfill(8)
    df["_mes"] = pd.to_numeric(texto.str[2:4], errors="coerce")
    return df[df["_mes"].isin(meses)]


# ---------------------------------------------------------------------------
# Lista RESTRITA de CIDs com relação documentada na literatura de
# epidemiologia de exposição a fumaça de incêndios
# ---------------------------------------------------------------------------

NUCLEO_ALTA_EVIDENCIA = (
    [f"J{n:02d}" for n in range(12, 19)]    # J12-J18: pneumonias
    + [f"J{n:02d}" for n in range(20, 23)]  # J20-J22: bronquite/bronquiolite aguda
    + [f"J{n:02d}" for n in range(40, 47)]  # J40-J46: bronquite crônica, DPOC, asma, mal asmático
    + ["J68"]                               # inalação de químicos/gases/fumaça
)

CAMADA_SECUNDARIA_EVIDENCIA = [
    "J00", "J01", "J02", "J03", "J04", "J06",
    "J30",
    "J96",
]

CIDS_QUEIMADAS_RELEVANTES = NUCLEO_ALTA_EVIDENCIA + CAMADA_SECUNDARIA_EVIDENCIA


def nivel_evidencia_cid(cid3) -> str:
    cid3 = str(cid3)[:3].upper()
    if cid3 in NUCLEO_ALTA_EVIDENCIA:
        return "Núcleo (alta evidência)"
    if cid3 in CAMADA_SECUNDARIA_EVIDENCIA:
        return "Secundária (evidência moderada)"
    return "Fora da lista"


def _cid3(df: pd.DataFrame, coluna_cid: str) -> pd.Series:
    return df[coluna_cid].astype(str).str.upper().str.strip().str[:3]


def filtrar_cid_j(df: pd.DataFrame, coluna_cid: str) -> pd.DataFrame:
    """Capítulo J inteiro (J00-J99). Usado só para saber se a base de
    óbitos do período veio vazia (dado ainda não publicado)."""
    if df is None or len(df) == 0 or coluna_cid not in df.columns:
        return pd.DataFrame()
    return df[_cid3(df, coluna_cid).str.match(r"^J\d{2}")].copy()


def filtrar_cids_relevantes(df: pd.DataFrame, coluna_cid: str) -> pd.DataFrame:
    if df is None or len(df) == 0 or coluna_cid not in df.columns:
        return pd.DataFrame()
    return df[_cid3(df, coluna_cid).isin(CIDS_QUEIMADAS_RELEVANTES)].copy()


# ---------------------------------------------------------------------------
# Descrições dos CIDs usados
# ---------------------------------------------------------------------------

DESCRICOES_CID_J = {
    "J00": "Nasofaringite aguda (resfriado comum)", "J01": "Sinusite aguda",
    "J02": "Faringite aguda", "J03": "Amigdalite aguda",
    "J04": "Laringite e traqueíte agudas",
    "J06": "Infecções agudas das vias aéreas superiores, múltiplas ou não especificadas",
    "J12": "Pneumonia viral não classificada em outra parte",
    "J13": "Pneumonia por Streptococcus pneumoniae",
    "J14": "Pneumonia por Haemophilus influenzae",
    "J15": "Pneumonia bacteriana não classificada em outra parte",
    "J16": "Pneumonia por outros microrganismos infecciosos",
    "J17": "Pneumonia em doenças classificadas em outra parte",
    "J18": "Pneumonia por microrganismo não especificado",
    "J20": "Bronquite aguda", "J21": "Bronquiolite aguda",
    "J22": "Infecção aguda não especificada das vias aéreas inferiores",
    "J30": "Rinite alérgica e vasomotora",
    "J40": "Bronquite não especificada como aguda ou crônica",
    "J41": "Bronquite crônica simples e mucopurulenta",
    "J42": "Bronquite crônica não especificada", "J43": "Enfisema",
    "J44": "Outras doenças pulmonares obstrutivas crônicas (DPOC)",
    "J45": "Asma", "J46": "Estado de mal asmático",
    "J68": "Afecções respiratórias devidas a inalação de produtos químicos, gases, fumaças e vapores (inclui fumaça/fuligem)",
    "J96": "Insuficiência respiratória não classificada em outra parte",
}


def descricao_cid_j(cid) -> str:
    return DESCRICOES_CID_J.get(str(cid)[:3].upper(), "Descrição não disponível")


# ---------------------------------------------------------------------------
# Idade e faixa etária
# ---------------------------------------------------------------------------

FAIXAS = ["Criança/Adolescente (0-17)", "Adulto (18-59)", "Idoso (60+)", "Não informado"]


def classificar_faixa_etaria(idade_anos):
    if pd.isna(idade_anos):
        return "Não informado"
    if idade_anos < 18:
        return "Criança/Adolescente (0-17)"
    if idade_anos < 60:
        return "Adulto (18-59)"
    return "Idoso (60+)"


def idade_em_anos_sih(df: pd.DataFrame) -> pd.Series:
    """SIH: COD_IDADE diz a unidade de IDADE (2=dias, 3=meses, 4=anos,
    5=anos acima de 100, ou seja, idade = 100 + IDADE)."""
    idade = pd.to_numeric(df.get("IDADE"), errors="coerce").astype("float64")
    cod = pd.to_numeric(df.get("COD_IDADE"), errors="coerce")
    anos = idade.copy()
    anos[cod == 2] = idade[cod == 2] / 365.0
    anos[cod == 3] = idade[cod == 3] / 12.0
    anos[cod == 5] = idade[cod == 5] + 100
    return anos


def idade_em_anos_sim(df: pd.DataFrame) -> pd.Series:
    """SIM: IDADE tem 3 dígitos; o 1º é a unidade (0=min, 1=horas, 2=dias,
    3=meses, 4=anos, 5=anos acima de 100)."""
    if "IDADE" not in df.columns:
        return pd.Series(float("nan"), index=df.index)
    idade_str = df["IDADE"].astype(str).str.split(".").str[0].str.zfill(3)
    unidade = idade_str.str[0]
    valor = pd.to_numeric(idade_str.str[1:], errors="coerce")
    anos = pd.Series(float("nan"), index=df.index)
    anos[unidade == "4"] = valor[unidade == "4"]
    anos[unidade == "5"] = valor[unidade == "5"] + 100
    anos[unidade == "3"] = valor[unidade == "3"] / 12.0
    anos[unidade == "2"] = valor[unidade == "2"] / 365.0
    anos[unidade.isin(["0", "1"])] = 0.0
    return anos


def deduplicar_aih(df: pd.DataFrame) -> pd.DataFrame:
    """A mesma internação (N_AIH) pode aparecer repetida em competências
    diferentes -- mantém só a ocorrência mais recente."""
    if len(df) == 0 or "N_AIH" not in df.columns:
        return df
    df = df.copy()
    ano_cmpt = pd.to_numeric(df.get("ANO_CMPT"), errors="coerce")
    mes_cmpt = pd.to_numeric(df.get("MES_CMPT"), errors="coerce")
    df["_competencia_ord"] = ano_cmpt * 100 + mes_cmpt
    df = df.sort_values(["N_AIH", "_competencia_ord"])
    df = df.drop_duplicates(subset="N_AIH", keep="last")
    return df.drop(columns="_competencia_ord").reset_index(drop=True)


# ---------------------------------------------------------------------------
# Resumos
# ---------------------------------------------------------------------------

def resumo_por_faixa_etaria(df: pd.DataFrame) -> pd.DataFrame:
    """Quantidade por faixa etária e a % que ela representa do total."""
    if len(df) == 0 or "faixa_etaria" not in df.columns:
        return pd.DataFrame(columns=["faixa_etaria", "quantidade", "percentual_do_total"])

    total = len(df)
    resumo = df.groupby("faixa_etaria", dropna=False).size().reset_index(name="quantidade")
    resumo["percentual_do_total"] = (resumo["quantidade"] / total * 100).round(2)

    ordem = {f: i for i, f in enumerate(FAIXAS)}
    resumo["_ordem"] = resumo["faixa_etaria"].map(ordem).fillna(len(FAIXAS))
    return resumo.sort_values("_ordem").drop(columns="_ordem").reset_index(drop=True)


def resumo_doencas_respiratorias(df_sih_j: pd.DataFrame, df_sim_j: pd.DataFrame) -> pd.DataFrame:
    """Lista das doenças respiratórias ligadas à fumaça (lista restrita de
    CIDs), com o total de internações e de óbitos de cada uma."""

    def contagem_por_cid(df, coluna_cid):
        if len(df) == 0 or coluna_cid not in df.columns:
            return pd.Series(dtype="int64")
        return _cid3(df, coluna_cid).value_counts()

    internacoes = contagem_por_cid(df_sih_j, "DIAG_PRINC")
    obitos = contagem_por_cid(df_sim_j, "CAUSABAS")

    cids = sorted(set(internacoes.index) | set(obitos.index))
    if not cids:
        return pd.DataFrame(columns=["cid", "doenca", "nivel_evidencia", "internacoes", "obitos"])

    linhas = [
        {
            "cid": cid,
            "doenca": descricao_cid_j(cid),
            "nivel_evidencia": nivel_evidencia_cid(cid),
            "internacoes": int(internacoes.get(cid, 0)),
            "obitos": int(obitos.get(cid, 0)),
        }
        for cid in cids
    ]
    return pd.DataFrame(linhas).sort_values(["internacoes", "obitos"], ascending=False).reset_index(drop=True)


def resumo_por_mes(ano: int, meses: list[int], df_sih_j: pd.DataFrame, df_sim_j: pd.DataFrame) -> list[dict]:
    """Internações (por mês de competência) e óbitos (por mês do óbito)."""
    def contar(df, coluna):
        if len(df) == 0 or coluna not in df.columns:
            return pd.Series(dtype="int64")
        return pd.to_numeric(df[coluna], errors="coerce").value_counts()

    internacoes = contar(df_sih_j, "MES_CMPT")
    obitos = contar(df_sim_j, "_mes")
    return [
        {"ano": ano, "mes": m, "internacoes": int(internacoes.get(m, 0)), "obitos": int(obitos.get(m, 0))}
        for m in meses
    ]


# Tipos de leito do CNES (coluna TP_LEITO)
TIPOS_LEITO = {
    "1": "Cirúrgicos",
    "2": "Clínicos",
    "3": "Complementares (UTI e cuidados intermediários)",
    "4": "Obstétricos",
    "5": "Pediátricos",
    "6": "Outras especialidades",
    "7": "Hospital-dia",
}
MESES_PARA_TRAS_LEITOS = 6  # o CNES pode demorar alguns meses para publicar


def _resumir_leitos(df: pd.DataFrame) -> dict | None:
    """Total de leitos existentes, quantos são do SUS e a divisão por tipo."""
    if df is None or len(df) == 0 or "QT_EXIST" not in df.columns:
        return None
    df = df.copy()
    df["QT_EXIST"] = pd.to_numeric(df["QT_EXIST"], errors="coerce").fillna(0)
    tem_sus = "QT_SUS" in df.columns
    if tem_sus:
        df["QT_SUS"] = pd.to_numeric(df["QT_SUS"], errors="coerce").fillna(0)

    por_tipo = []
    if "TP_LEITO" in df.columns:
        tipo = df["TP_LEITO"].astype(str).str.strip().str.lstrip("0")
        for codigo, grupo in df.groupby(tipo):
            por_tipo.append({
                "tipo": TIPOS_LEITO.get(codigo, f"Tipo {codigo}"),
                "total": int(grupo["QT_EXIST"].sum()),
                "sus": int(grupo["QT_SUS"].sum()) if tem_sus else None,
            })
        por_tipo.sort(key=lambda t: t["total"], reverse=True)

    return {
        "total": int(df["QT_EXIST"].sum()),
        "sus": int(df["QT_SUS"].sum()) if tem_sus else None,
        "por_tipo": por_tipo,
    }


class _SemLeitos(Exception):
    """Leitos indisponíveis: não é guardado no cache, para tentar de novo depois."""


def _leitos_sem_cache(uf: str, ano: int, mes: int) -> dict:
    ultimo_erro = None
    for passo in range(MESES_PARA_TRAS_LEITOS):
        a, m = ano, mes - passo
        while m < 1:
            m += 12
            a -= 1
        try:
            df = _baixar(pysus.cnes, "CNES (leitos)", COLUNAS_CNES_LT,
                         state=uf, year=a, month=m, group="LT")
        except FonteExternaError as exc:
            ultimo_erro = str(exc)
            continue
        resumo = _resumir_leitos(df)
        if resumo:
            return {**resumo, "referencia": f"{m:02d}/{a}", "erro": None}

    raise _SemLeitos(ultimo_erro or (
        f"O CNES ainda não tem dados de leitos de {uf} publicados para "
        f"{mes:02d}/{ano} nem para os {MESES_PARA_TRAS_LEITOS - 1} meses anteriores."
    ))


def leitos_hospitalares(uf: str, ano: int, mes: int) -> dict:
    """Leitos hospitalares do CNES (grupo LT) no estado: total, SUS e por tipo.

    É uma FOTO de um mês (não soma entre meses). Se o mês pedido ainda não
    foi publicado, usa o mês mais recente disponível (até 6 meses antes) e
    informa qual foi em `referencia`. Nunca derruba o resto da consulta: se
    não conseguir, devolve `total: None` e o motivo em `erro` (e não guarda
    a falha no cache, para tentar de novo na próxima busca)."""
    try:
        valor, _ = em_cache(
            "leitos", {"uf": uf, "ano": ano, "mes": mes}, 7 * 24 * 3600,
            lambda: _leitos_sem_cache(uf, ano, mes),
        )
        return valor
    except _SemLeitos as exc:
        return {"total": None, "sus": None, "por_tipo": [], "referencia": None, "erro": str(exc)}


# ---------------------------------------------------------------------------
# Validação
# ---------------------------------------------------------------------------

def validar_parametros(uf: str, ano: int, meses: list[int]) -> tuple[str, int, list[int]]:
    sigla, _ = resolver_uf_e_estado(uf)
    ano_atual = date.today().year
    if not ANO_MINIMO <= ano <= ano_atual:
        raise ValueError(f"Ano deve estar entre {ANO_MINIMO} e {ano_atual}.")
    meses = sorted(set(meses))
    if not meses:
        raise ValueError("Informe pelo menos um mês.")
    invalidos = [m for m in meses if not 1 <= m <= 12]
    if invalidos:
        raise ValueError(f"Mês inválido: {invalidos}. Use números de 1 a 12.")
    return sigla, ano, meses


# ---------------------------------------------------------------------------
# Função principal, chamada pela rota (app/routers/pysus.py)
# ---------------------------------------------------------------------------

AVISO_SIM = (
    "O SIM (mortalidade) tem consolidação lenta no DATASUS. Um resultado "
    "de 0 óbitos para um período recente costuma significar 'dado ainda não "
    "publicado', não 'não houve óbitos'. Prefira anos já fechados há pelo "
    "menos 1-2 anos."
)


def _baixar_em_paralelo(tarefas: dict) -> dict:
    """Roda os downloads (SIH, SIM, CNES) ao mesmo tempo. Se algum falhar,
    tenta de novo sozinho uma vez -- assim um problema passageiro (ou de
    concorrência dentro do PySUS) não derruba a consulta inteira."""
    resultados, falhas = {}, {}
    with ThreadPoolExecutor(max_workers=len(tarefas)) as executor:
        futuros = {nome: executor.submit(funcao) for nome, funcao in tarefas.items()}
        for nome, futuro in futuros.items():
            try:
                resultados[nome] = futuro.result()
            except FonteExternaError as exc:
                falhas[nome] = exc

    for nome in falhas:
        resultados[nome] = tarefas[nome]()  # se falhar de novo, o erro sobe
    return resultados


def analisar_respiratorio(uf: str, ano: int, meses: list[int]) -> dict:
    """Mesma análise de _analisar_respiratorio_sem_cache, mas guardando o
    resultado em cache (uma busca repetida volta na hora)."""
    uf, ano, meses = validar_parametros(uf, ano, meses)
    ultimo_dia = date(ano, meses[-1], 28)
    valor, _ = em_cache(
        "pysus_v3", {"uf": uf, "ano": ano, "meses": meses},
        ttl_para_periodo(ultimo_dia),
        lambda: _analisar_respiratorio_sem_cache(uf, ano, meses),
    )
    # Se os leitos falharam quando o resultado foi guardado, tenta de novo
    if valor["leitos_detalhe"].get("erro"):
        leitos = leitos_hospitalares(uf, ano, meses[-1])
        if not leitos.get("erro"):
            valor = {**valor, "leitos_hospitalares": leitos["total"],
                     "leitos_referencia": leitos["referencia"], "leitos_detalhe": leitos}
    return valor


def _analisar_respiratorio_sem_cache(uf: str, ano: int, meses: list[int]) -> dict:
    """Baixa SIH (internações), SIM (óbitos) e CNES (leitos) do UF/ano/meses
    pedidos -- os três ao mesmo tempo --, filtra as doenças respiratórias
    relacionadas a fumaça de queimada e devolve um dicionário pronto para
    JSON. Internações e óbitos cobrem os MESMOS meses.
    """
    mes_referencia = meses[-1]
    baixados = _baixar_em_paralelo({
        "sih": lambda: download_sih(uf, ano, meses),
        "sim": lambda: download_sim(uf, ano),
        "leitos": lambda: leitos_hospitalares(uf, ano, mes_referencia),
    })

    # ----- Internações (SIH / RD): só hospitais do estado -----
    df_sih = deduplicar_aih(filtrar_por_uf(baixados["sih"], "MUNIC_MOV", uf))
    df_sih_j = filtrar_cids_relevantes(df_sih, "DIAG_PRINC")
    if len(df_sih_j) > 0:
        df_sih_j["faixa_etaria"] = idade_em_anos_sih(df_sih_j).apply(classificar_faixa_etaria)

    # ----- Mortalidade (SIM / DO), só nos meses pedidos -----
    # Só moradores do estado (o arquivo pode vir com outros estados)
    df_sim = filtrar_sim_por_meses(filtrar_por_uf(baixados["sim"], "CODMUNRES", uf), meses)
    df_sim_j = filtrar_cids_relevantes(df_sim, "CAUSABAS")
    if len(df_sim_j) > 0:
        df_sim_j["faixa_etaria"] = idade_em_anos_sim(df_sim_j).apply(classificar_faixa_etaria)

    aviso_sim = AVISO_SIM if len(filtrar_cid_j(df_sim, "CAUSABAS")) == 0 else None

    return {
        "uf": uf,
        "ano": ano,
        "meses_consultados": meses,
        "total_internacoes": len(df_sih_j),
        "total_obitos": len(df_sim_j),
        "doencas_respiratorias": resumo_doencas_respiratorias(df_sih_j, df_sim_j).to_dict(orient="records"),
        "leitos_hospitalares": baixados["leitos"]["total"],
        "leitos_referencia": baixados["leitos"]["referencia"],
        "leitos_detalhe": baixados["leitos"],
        "internacoes_por_faixa_etaria": resumo_por_faixa_etaria(df_sih_j).to_dict(orient="records"),
        "obitos_por_faixa_etaria": resumo_por_faixa_etaria(df_sim_j).to_dict(orient="records"),
        "por_mes": resumo_por_mes(ano, meses, df_sih_j, df_sim_j),
        "aviso_obitos": aviso_sim,
    }


def _juntar_faixas(listas: list[list[dict]]) -> list[dict]:
    linhas = [linha for lista in listas for linha in lista]
    if not linhas:
        return []
    df = pd.DataFrame(linhas).groupby("faixa_etaria", as_index=False)["quantidade"].sum()
    df["percentual_do_total"] = (df["quantidade"] / df["quantidade"].sum() * 100).round(2)
    ordem = {f: i for i, f in enumerate(FAIXAS)}
    df = df.sort_values("faixa_etaria", key=lambda s: s.map(ordem).fillna(len(FAIXAS)))
    return df.to_dict(orient="records")


def analisar_respiratorio_periodo(uf: str, data_inicio: date, data_fim: date) -> dict:
    """Mesma análise, mas para um período de datas que pode atravessar a
    virada do ano (usado pelo Hemograma). Consulta cada ano com seus meses e
    junta os resultados. A granularidade do DATASUS é mensal: o período é
    arredondado para os meses inteiros que ele toca."""
    pedidos = []
    for ano in range(data_inicio.year, data_fim.year + 1):
        mes_ini = data_inicio.month if ano == data_inicio.year else 1
        mes_fim = data_fim.month if ano == data_fim.year else 12
        pedidos.append((ano, list(range(mes_ini, mes_fim + 1))))

    # Cada ano é baixado ao mesmo tempo (no máximo 2 anos por consulta)
    with ThreadPoolExecutor(max_workers=len(pedidos)) as executor:
        futuros = [executor.submit(analisar_respiratorio, uf, ano, meses) for ano, meses in pedidos]
        resultados = [f.result() for f in futuros]

    doencas = pd.DataFrame([d for r in resultados for d in r["doencas_respiratorias"]])
    if not doencas.empty:
        doencas = (
            doencas.groupby(["cid", "doenca", "nivel_evidencia"], as_index=False)[["internacoes", "obitos"]].sum()
                   .sort_values(["internacoes", "obitos"], ascending=False)
        )

    ultimo = resultados[-1]
    return {
        "uf": ultimo["uf"],
        "anos": [r["ano"] for r in resultados],
        "total_internacoes": sum(r["total_internacoes"] for r in resultados),
        "total_obitos": sum(r["total_obitos"] for r in resultados),
        "doencas_respiratorias": doencas.to_dict(orient="records") if not doencas.empty else [],
        "leitos_hospitalares": ultimo["leitos_hospitalares"],
        "leitos_referencia": ultimo["leitos_referencia"],
        "leitos_detalhe": ultimo["leitos_detalhe"],
        "internacoes_por_faixa_etaria": _juntar_faixas([r["internacoes_por_faixa_etaria"] for r in resultados]),
        "obitos_por_faixa_etaria": _juntar_faixas([r["obitos_por_faixa_etaria"] for r in resultados]),
        "por_mes": [linha for r in resultados for linha in r["por_mes"]],
        "aviso_obitos": next((r["aviso_obitos"] for r in resultados if r["aviso_obitos"]), None),
    }


# ---------------------------------------------------------------------------
# Arquivos estáticos (site sem servidor): um ano inteiro, separado por mês
# ---------------------------------------------------------------------------

def _contar_por_mes(df: pd.DataFrame, coluna_mes: str, coluna_cid: str) -> dict:
    """{mes: {"total": n, "cids": {cid: n}, "faixas": {faixa: n}}}"""
    saida: dict[int, dict] = {}
    if len(df) == 0 or coluna_mes not in df.columns:
        return saida
    meses = pd.to_numeric(df[coluna_mes], errors="coerce")
    cids = _cid3(df, coluna_cid)
    faixas = df["faixa_etaria"] if "faixa_etaria" in df.columns else pd.Series("Não informado", index=df.index)
    for mes in sorted(meses.dropna().unique()):
        filtro = meses == mes
        saida[int(mes)] = {
            "total": int(filtro.sum()),
            "cids": {str(k): int(v) for k, v in cids[filtro].value_counts().items()},
            "faixas": {str(k): int(v) for k, v in faixas[filtro].value_counts().items()},
        }
    return saida


def resumo_mensal_ano(uf: str, ano: int) -> dict:
    """Saúde respiratória de um estado num ano inteiro, mês a mês, no formato
    dos arquivos estáticos do site (pasta dados/saude/<UF>/<ano>.json).

    O site soma os meses do período escolhido, então não precisa de servidor.
    Internações por mês de competência (SIH); óbitos por mês do óbito (SIM);
    leitos do CNES de dezembro (ou do mês mais recente publicado antes dele).
    """
    uf, ano, meses = validar_parametros(uf, ano, list(range(1, 13)))
    baixados = _baixar_em_paralelo({
        "sih": lambda: download_sih(uf, ano, meses),
        "sim": lambda: download_sim(uf, ano),
        "leitos": lambda: leitos_hospitalares(uf, ano, 12),
    })

    df_sih = deduplicar_aih(filtrar_por_uf(baixados["sih"], "MUNIC_MOV", uf))
    df_sih_j = filtrar_cids_relevantes(df_sih, "DIAG_PRINC")
    if len(df_sih_j) > 0:
        df_sih_j["faixa_etaria"] = idade_em_anos_sih(df_sih_j).apply(classificar_faixa_etaria)

    df_sim = filtrar_sim_por_meses(filtrar_por_uf(baixados["sim"], "CODMUNRES", uf), meses)
    df_sim_j = filtrar_cids_relevantes(df_sim, "CAUSABAS")
    if len(df_sim_j) > 0:
        df_sim_j["faixa_etaria"] = idade_em_anos_sim(df_sim_j).apply(classificar_faixa_etaria)

    internacoes = _contar_por_mes(df_sih_j, "MES_CMPT", "DIAG_PRINC")
    obitos = _contar_por_mes(df_sim_j, "_mes", "CAUSABAS")
    vazio = {"total": 0, "cids": {}, "faixas": {}}

    return {
        "uf": uf,
        "ano": ano,
        "meses": [
            {"mes": m, "internacoes": internacoes.get(m, vazio), "obitos": obitos.get(m, vazio)}
            for m in meses
        ],
        "leitos": baixados["leitos"],
        "obitos_publicados": len(filtrar_cid_j(df_sim, "CAUSABAS")) > 0,
        "cids": {
            cid: {"doenca": descricao_cid_j(cid), "nivel_evidencia": nivel_evidencia_cid(cid)}
            for cid in CIDS_QUEIMADAS_RELEVANTES
        },
    }

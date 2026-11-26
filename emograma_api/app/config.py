"""
Configurações e constantes compartilhadas entre os módulos (INPE, Open-Meteo,
PySUS, Hemograma). Fica tudo num lugar só pra não duplicar o mesmo
dicionário em vários arquivos.
"""

import unicodedata

# A camada do INPE traz o NOME COMPLETO do estado, não a sigla.
UF_PARA_ESTADO = {
    "AC": "ACRE", "AL": "ALAGOAS", "AP": "AMAPA", "AM": "AMAZONAS", "BA": "BAHIA",
    "CE": "CEARA", "DF": "DISTRITO FEDERAL", "ES": "ESPIRITO SANTO", "GO": "GOIAS",
    "MA": "MARANHAO", "MT": "MATO GROSSO", "MS": "MATO GROSSO DO SUL",
    "MG": "MINAS GERAIS", "PA": "PARA", "PB": "PARAIBA", "PR": "PARANA",
    "PE": "PERNAMBUCO", "PI": "PIAUI", "RJ": "RIO DE JANEIRO",
    "RN": "RIO GRANDE DO NORTE", "RS": "RIO GRANDE DO SUL", "RO": "RONDONIA",
    "RR": "RORAIMA", "SC": "SANTA CATARINA", "SP": "SAO PAULO",
    "SE": "SERGIPE", "TO": "TOCANTINS",
}

# Mapa inverso (nome completo, sem acento, em caixa alta -> sigla)
ESTADO_PARA_UF = {nome: sigla for sigla, nome in UF_PARA_ESTADO.items()}

# Código IBGE de cada UF (os 2 primeiros dígitos do código de município).
CODIGO_IBGE_UF = {
    "RO": "11", "AC": "12", "AM": "13", "RR": "14", "PA": "15", "AP": "16", "TO": "17",
    "MA": "21", "PI": "22", "CE": "23", "RN": "24", "PB": "25", "PE": "26", "AL": "27",
    "SE": "28", "BA": "29", "MG": "31", "ES": "32", "RJ": "33", "SP": "35", "PR": "41",
    "SC": "42", "RS": "43", "MS": "50", "MT": "51", "GO": "52", "DF": "53",
}

# Capital de cada UF. Usada pelo Hemograma quando o usuário não informa um
# município: o clima e a qualidade do ar passam a ser os da capital.
CAPITAIS = {
    "AC": "Rio Branco", "AL": "Maceió", "AP": "Macapá", "AM": "Manaus", "BA": "Salvador",
    "CE": "Fortaleza", "DF": "Brasília", "ES": "Vitória", "GO": "Goiânia",
    "MA": "São Luís", "MT": "Cuiabá", "MS": "Campo Grande", "MG": "Belo Horizonte",
    "PA": "Belém", "PB": "João Pessoa", "PR": "Curitiba", "PE": "Recife",
    "PI": "Teresina", "RJ": "Rio de Janeiro", "RN": "Natal", "RS": "Porto Alegre",
    "RO": "Porto Velho", "RR": "Boa Vista", "SC": "Florianópolis", "SP": "São Paulo",
    "SE": "Aracaju", "TO": "Palmas",
}


class FonteExternaError(Exception):
    """Erro ao falar com um serviço externo (INPE, Open-Meteo, DATASUS).
    As rotas transformam isso num HTTP 502 com mensagem clara, separado dos
    erros do próprio código (que continuam aparecendo como 500)."""


def remover_acentos(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")


def resolver_uf_e_estado(valor: str) -> tuple[str, str]:
    """Recebe a sigla (ex: 'MS') OU o nome completo (ex: 'Mato Grosso do Sul')
    e devolve sempre a dupla (sigla, nome_completo_em_caixa_alta_sem_acento).

    Isso permite que o usuário digite o estado de qualquer um dos dois jeitos
    em qualquer parte da API.
    """
    valor = (valor or "").strip().upper()

    # Já é uma sigla conhecida?
    if valor in UF_PARA_ESTADO:
        return valor, UF_PARA_ESTADO[valor]

    # É o nome completo (com ou sem acento)?
    valor_sem_acento = remover_acentos(valor)
    if valor_sem_acento in ESTADO_PARA_UF:
        return ESTADO_PARA_UF[valor_sem_acento], valor_sem_acento

    raise ValueError(
        f"Estado '{valor}' não reconhecido. Use a sigla (ex: MS) ou o nome "
        f"completo (ex: Mato Grosso do Sul)."
    )

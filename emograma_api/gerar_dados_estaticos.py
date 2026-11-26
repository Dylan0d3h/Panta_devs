"""
Gera os arquivos de dados do Hemograma para o site funcionar SEM servidor
(hospedagem só com FTP).

O que ele gera (dentro da pasta de saída, por padrão a pasta public do site):

  dados/saude/<UF>/<ano>.json   internações, óbitos e leitos do estado, mês a mês
  dados/queimadas/<UF>.json     focos de queimada dos últimos dias (opcional, --queimadas)
  dados/indice.json             lista do que já foi gerado

Como usar (na pasta emograma_api, com o .venv ativado):

  python gerar_dados_estaticos.py
      -> saúde de MS e MT dos últimos 3 anos completos

  python gerar_dados_estaticos.py --estados MS MT GO --anos 2023 2024 2025
  python gerar_dados_estaticos.py --queimadas
      -> também gera os focos de queimada dos últimos 90 dias

Depois rode "npm run build:ftp" no site e envie a pasta dist/public pelo FTP.
A primeira vez demora (baixa os arquivos do DATASUS); depois o PySUS guarda os
arquivos no computador e fica bem mais rápido.

Quando atualizar:
  - saúde: uma vez por mês já é suficiente (o DATASUS publica com meses de atraso);
  - queimadas (só se o site não conseguir buscar direto do INPE): todo dia.
"""

import argparse
import json
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

from app.config import FonteExternaError, UF_PARA_ESTADO
from app.services import inpe_service, pysus_service

PASTA_PADRAO = Path(__file__).resolve().parent.parent / "pantanaldev" / "client" / "public"

COLUNAS_FOCOS = [
    "data_hora_gmt", "satelite", "municipio", "latitude", "longitude",
    "bioma", "numero_dias_sem_chuva", "precipitacao", "risco_fogo", "frp",
]


def anos_padrao() -> list[int]:
    """Últimos 3 anos completos já publicados (o ano anterior entra a partir de abril)."""
    hoje = date.today()
    ultimo = hoje.year - 1 if hoje.month >= 4 else hoje.year - 2
    return [ultimo - 2, ultimo - 1, ultimo]


def salvar_json(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    temporario = caminho.with_suffix(".tmp")
    temporario.write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporario.replace(caminho)


def ler_indice(pasta_dados: Path) -> dict:
    arquivo = pasta_dados / "indice.json"
    if arquivo.exists():
        try:
            return json.loads(arquivo.read_text(encoding="utf-8"))
        except ValueError:
            pass
    return {"saude": {}, "queimadas": {}}


def gerar_saude(pasta_dados: Path, indice: dict, estados: list[str], anos: list[int]) -> int:
    falhas = 0
    for uf in estados:
        for ano in anos:
            print(f"  Saúde {uf} {ano}... ", end="", flush=True)
            inicio = time.perf_counter()
            try:
                dados = pysus_service.resumo_mensal_ano(uf, ano)
            except (ValueError, FonteExternaError) as exc:
                print(f"FALHOU: {exc}")
                falhas += 1
                continue
            dados["gerado_em"] = datetime.now().isoformat(timespec="seconds")
            salvar_json(pasta_dados / "saude" / uf / f"{ano}.json", dados)
            anos_uf = set(indice["saude"].get(uf, []))
            anos_uf.add(ano)
            indice["saude"][uf] = sorted(anos_uf)
            internacoes = sum(m["internacoes"]["total"] for m in dados["meses"])
            obitos = sum(m["obitos"]["total"] for m in dados["meses"])
            print(f"ok ({internacoes} internações, {obitos} óbitos, {time.perf_counter() - inicio:.0f}s)")
    return falhas


def gerar_queimadas(pasta_dados: Path, indice: dict, estados: list[str], dias: int) -> int:
    falhas = 0
    fim = date.today()
    inicio = fim - timedelta(days=dias - 1)
    for uf in estados:
        print(f"  Queimadas {uf} ({inicio} a {fim})... ", end="", flush=True)
        try:
            df = inpe_service.consultar_focos(inicio, fim, uf)
        except (ValueError, FonteExternaError) as exc:
            print(f"FALHOU: {exc}")
            falhas += 1
            continue
        linhas = []
        if not df.empty:
            for coluna in COLUNAS_FOCOS:
                if coluna not in df.columns:
                    df[coluna] = None
            df = df.dropna(subset=["latitude", "longitude"])
            df["data_hora_gmt"] = df["data_hora_gmt"].dt.strftime("%Y-%m-%d %H:%M")
            tabela = df[COLUNAS_FOCOS].astype(object).where(df[COLUNAS_FOCOS].notna(), None)
            linhas = tabela.values.tolist()
        salvar_json(pasta_dados / "queimadas" / f"{uf}.json", {
            "uf": uf,
            "inicio": inicio.isoformat(),
            "fim": fim.isoformat(),
            "gerado_em": datetime.now().isoformat(timespec="seconds"),
            "colunas": COLUNAS_FOCOS,
            "linhas": linhas,
        })
        indice["queimadas"][uf] = {"inicio": inicio.isoformat(), "fim": fim.isoformat()}
        print(f"ok ({len(linhas)} focos)")
    return falhas


def main() -> int:
    parser = argparse.ArgumentParser(description="Gera os dados do Hemograma para o site sem servidor.")
    parser.add_argument("--estados", nargs="+", default=["MS", "MT"],
                        help="Siglas dos estados, separadas por espaço (padrão: MS MT)")
    parser.add_argument("--anos", nargs="+", type=int, default=None, help="Anos da saúde (padrão: últimos 3 completos)")
    parser.add_argument("--queimadas", action="store_true", help="Também gera os focos de queimada recentes")
    parser.add_argument("--dias", type=int, default=90, help="Dias de queimadas (padrão: 90)")
    parser.add_argument("--sem-saude", action="store_true", help="Não gera a saúde (ex: só atualizar queimadas)")
    parser.add_argument("--saida", default=str(PASTA_PADRAO), help="Pasta public do site")
    parser.add_argument("--estrito", action="store_true",
                        help="Termina com erro se algum item falhar (usado na publicação automática)")
    args = parser.parse_args()

    estados = [uf.upper() for uf in args.estados]
    invalidos = [uf for uf in estados if uf not in UF_PARA_ESTADO]
    if invalidos:
        print(f"Estados inválidos: {invalidos}")
        return 1

    pasta_dados = Path(args.saida) / "dados"
    if not Path(args.saida).exists():
        print(f"A pasta de saída não existe: {args.saida}")
        print("Use --saida para indicar a pasta client/public do site.")
        return 1

    indice = ler_indice(pasta_dados)
    indice.setdefault("saude", {})
    indice.setdefault("queimadas", {})
    falhas = 0

    if not args.sem_saude:
        anos = args.anos or anos_padrao()
        print(f"Gerando saúde de {', '.join(estados)} para {', '.join(map(str, anos))}:")
        falhas += gerar_saude(pasta_dados, indice, estados, anos)

    if args.queimadas:
        print(f"Gerando queimadas dos últimos {args.dias} dias:")
        falhas += gerar_queimadas(pasta_dados, indice, estados, args.dias)

    indice["gerado_em"] = datetime.now().isoformat(timespec="seconds")
    salvar_json(pasta_dados / "indice.json", indice)
    print(f"\nPronto. Arquivos em: {pasta_dados}")
    if falhas:
        print(f"{falhas} item(ns) falharam (veja acima). Os arquivos anteriores desses itens foram mantidos.")
        print("Rode de novo mais tarde para tentar outra vez.")
    print('Agora, no site: "npm run build:ftp" e envie a pasta dist/public pelo FTP.')
    return 2 if (falhas and args.estrito) else 0


if __name__ == "__main__":
    sys.exit(main())

"""
Cache simples em memória + disco para as consultas do Hemograma.

- Uma busca repetida (mesmos parâmetros) volta na hora, sem baixar nada de novo.
- O cache fica salvo em arquivos JSON (pasta .cache_hemograma na raiz do
  projeto), então sobrevive a reinícios da API.
- Se duas pessoas pedirem a MESMA coisa ao mesmo tempo, só uma consulta é
  feita; a outra espera e reaproveita o resultado.
- Erros nunca são guardados: se uma fonte falhar, a próxima busca tenta de novo.

Para limpar o cache, basta apagar a pasta .cache_hemograma.
"""

import hashlib
import json
import os
import threading
import time
from collections import OrderedDict
from datetime import date, timedelta
from pathlib import Path

PASTA_CACHE = Path(os.getenv(
    "HEMOGRAMA_CACHE_DIR",
    Path(__file__).resolve().parent.parent / ".cache_hemograma",
))
MAX_ITENS_MEMORIA = 200

_memoria: "OrderedDict[str, tuple[float, object]]" = OrderedDict()
_travas: dict[str, threading.Lock] = {}
_trava_geral = threading.Lock()


def ttl_para_periodo(data_fim: date) -> int:
    """Por quanto tempo (em segundos) vale guardar o resultado de um período.
    Dados antigos quase não mudam; dados recentes ainda são atualizados pelas
    fontes (INPE, DATASUS), então expiram mais rápido."""
    hoje = date.today()
    if data_fim < hoje - timedelta(days=365):
        return 30 * 24 * 3600   # período com mais de 1 ano: 30 dias
    if data_fim < hoje - timedelta(days=7):
        return 24 * 3600        # período já passado: 1 dia
    return 3600                 # inclui a última semana: 1 hora


def _para_json(obj):
    """Converte tipos do numpy/pandas/datetime que o json não conhece."""
    if hasattr(obj, "item"):          # numpy int64, float64...
        return obj.item()
    if hasattr(obj, "isoformat"):     # date, datetime, Timestamp
        return obj.isoformat()
    return str(obj)


def _trava_da_chave(chave: str) -> threading.Lock:
    with _trava_geral:
        if chave not in _travas:
            _travas[chave] = threading.Lock()
        return _travas[chave]


def _guardar_memoria(chave: str, expira_em: float, valor) -> None:
    with _trava_geral:
        _memoria[chave] = (expira_em, valor)
        _memoria.move_to_end(chave)
        while len(_memoria) > MAX_ITENS_MEMORIA:
            _memoria.popitem(last=False)


def _ler_memoria(chave: str):
    with _trava_geral:
        item = _memoria.get(chave)
    if item and item[0] > time.time():
        return item[1]
    return None


def em_cache(nome: str, parametros: dict, ttl_segundos: int, funcao):
    """Devolve (valor, veio_do_cache). Calcula com `funcao()` só se ainda não
    houver um resultado válido guardado para esse nome + parâmetros."""
    texto_chave = json.dumps([nome, parametros], sort_keys=True, default=_para_json)
    chave = hashlib.sha256(texto_chave.encode("utf-8")).hexdigest()

    valor = _ler_memoria(chave)
    if valor is not None:
        return valor, True

    with _trava_da_chave(chave):
        # Alguém pode ter calculado enquanto esperávamos a trava
        valor = _ler_memoria(chave)
        if valor is not None:
            return valor, True

        arquivo = PASTA_CACHE / f"{nome}_{chave[:32]}.json"
        if arquivo.exists():
            try:
                conteudo = json.loads(arquivo.read_text(encoding="utf-8"))
                if conteudo["expira_em"] > time.time():
                    _guardar_memoria(chave, conteudo["expira_em"], conteudo["valor"])
                    return conteudo["valor"], True
            except (ValueError, KeyError, OSError):
                pass  # arquivo corrompido: recalcula

        valor = funcao()

        # Passa pelo JSON para normalizar os tipos (igual ao que sai do disco)
        texto = json.dumps(valor, default=_para_json, ensure_ascii=False)
        valor = json.loads(texto)
        expira_em = time.time() + ttl_segundos

        try:
            PASTA_CACHE.mkdir(parents=True, exist_ok=True)
            temporario = arquivo.with_suffix(".tmp")
            temporario.write_text(
                json.dumps({"expira_em": expira_em, "valor": valor}, ensure_ascii=False),
                encoding="utf-8",
            )
            temporario.replace(arquivo)
        except OSError:
            pass  # sem permissão de escrita: segue só com o cache em memória

        _guardar_memoria(chave, expira_em, valor)
        return valor, False

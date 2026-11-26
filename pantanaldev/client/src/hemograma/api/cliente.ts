import { ErroFonte } from "./direto/comum";
import { localizacaoDireta } from "./direto/localizacao";
import { climaDireto } from "./direto/openmeteo";
import { queimadasDireto } from "./direto/inpe";
import { saudeEstatica } from "./direto/saude";
import type { Consulta, Fonte, Localizacao, RespostasPorFonte } from "./tipos";

// De onde vêm os dados do Hemograma:
//
// - SEM SERVIDOR (padrão, funciona numa hospedagem só com FTP): o navegador
//   busca clima, ar e localização direto do Open-Meteo e do OpenStreetMap,
//   as queimadas direto do INPE (ou do arquivo dados/queimadas/<UF>.json) e a
//   saúde dos arquivos dados/saude/... gerados pelo script gerar_dados_estaticos.py.
//
// - COM A API EM PYTHON: defina VITE_HEMOGRAMA_API no .env (ex: "/api" para
//   usar o repasse do "npm run dev", ou o endereço da API publicada).
const API_CONFIGURADA = ((import.meta.env?.VITE_HEMOGRAMA_API as string | undefined) || "").trim();
export const MODO_SEM_SERVIDOR = !API_CONFIGURADA;
const BASE_API = API_CONFIGURADA.replace(/\/$/, "");

/** Erro da busca, já com a mensagem pronta para mostrar na tela. */
export const ErroApi = ErroFonte;
export type ErroApi = ErroFonte;

const FONTES_DIRETAS = {
  queimadas: queimadasDireto,
  clima: climaDireto,
  saude: saudeEstatica,
} as const;

function montarUrl(fonte: Fonte, consulta: Consulta): string {
  // A saúde pode ter um período próprio (leitura rápida)
  const usarPeriodoSaude = fonte === "saude" && consulta.saudeInicio && consulta.saudeFim;
  const params = new URLSearchParams({
    estado: consulta.estado,
    data_inicio: usarPeriodoSaude ? consulta.saudeInicio! : consulta.dataInicio,
    data_fim: usarPeriodoSaude ? consulta.saudeFim! : consulta.dataFim,
  });
  if (consulta.municipio.trim()) params.set("municipio", consulta.municipio.trim());
  return `${BASE_API}/hemograma/${fonte}?${params.toString()}`;
}

/** Busca uma fonte do Hemograma. O `signal` cancela a requisição se a
 *  pessoa fizer outra busca antes desta terminar. */
export async function buscarFonte<F extends Fonte>(
  fonte: F,
  consulta: Consulta,
  signal?: AbortSignal,
): Promise<RespostasPorFonte[F]> {
  if (MODO_SEM_SERVIDOR) {
    return (FONTES_DIRETAS[fonte] as (c: Consulta, s?: AbortSignal) => Promise<RespostasPorFonte[F]>)(consulta, signal);
  }
  let resposta: Response;
  try {
    resposta = await fetch(montarUrl(fonte, consulta), { signal });
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === "AbortError") throw erro;
    throw new ErroApi("Não foi possível conectar à API. Verifique se o servidor está rodando.", 0);
  }

  const texto = await resposta.text();
  let dados: unknown = null;
  try {
    dados = JSON.parse(texto);
  } catch {
    // resposta não é JSON (ex: erro 500 em texto)
  }

  if (!resposta.ok) {
    let mensagem = `Erro ${resposta.status}`;
    const detalhe = (dados as { detail?: unknown } | null)?.detail;
    if (typeof detalhe === "string") mensagem = detalhe;
    else if (Array.isArray(detalhe)) {
      mensagem = detalhe.map((d: { msg?: string }) => d.msg ?? "").join("; ");
    } else if (texto.trimStart().startsWith("<")) {
      mensagem = "A API do Hemograma não foi encontrada. Verifique se ela está publicada e se o endereço dela está em VITE_HEMOGRAMA_API (arquivo .env.production).";
    } else if (texto) mensagem = texto.slice(0, 300);
    throw new ErroApi(mensagem, resposta.status);
  }

  if (dados === null) {
    // Recebeu uma página HTML no lugar dos dados: a API não está nesse endereço
    if (texto.trimStart().startsWith("<")) {
      throw new ErroApi(
        "A API do Hemograma não foi encontrada. Verifique se ela está publicada e se o endereço dela está em VITE_HEMOGRAMA_API (arquivo .env.production).",
        resposta.status,
      );
    }
    throw new ErroApi("A API devolveu uma resposta inválida.", resposta.status);
  }
  return dados as RespostasPorFonte[F];
}

/** Descobre qual é o município/estado de uma coordenada. */
export async function buscarLocalizacao(latitude: number, longitude: number): Promise<Localizacao> {
  if (MODO_SEM_SERVIDOR) return localizacaoDireta(latitude, longitude);
  const params = new URLSearchParams({ lat: latitude.toFixed(4), lon: longitude.toFixed(4) });
  let resposta: Response;
  try {
    resposta = await fetch(`${BASE_API}/hemograma/localizacao?${params.toString()}`);
  } catch {
    throw new ErroApi("Não foi possível conectar à API. Verifique se o servidor está rodando.", 0);
  }
  const dados = (await resposta.json().catch(() => null)) as (Localizacao & { detail?: string }) | null;
  if (!resposta.ok || !dados) {
    throw new ErroApi(dados?.detail ?? `Erro ${resposta.status}`, resposta.status);
  }
  return dados;
}

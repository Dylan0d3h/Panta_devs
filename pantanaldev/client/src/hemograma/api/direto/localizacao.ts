import type { Localizacao } from "../tipos";
import { buscar, ErroFonte, guardar, lerGuardado, NOMES_ESTADOS_SEM_ACENTO } from "./comum";

const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";
const NOVENTA_DIAS = 90 * 24 * 3600 * 1000;

interface RespostaNominatim {
  address?: Record<string, string>;
}

/** Município e estado de uma coordenada, pelo Nominatim (OpenStreetMap).
 *  Fica guardado no navegador: a mesma região não é consultada de novo. */
export async function localizacaoDireta(latitude: number, longitude: number): Promise<Localizacao> {
  const lat = latitude.toFixed(2);
  const lon = longitude.toFixed(2);
  const chave = `hemograma:local:${lat},${lon}`;
  const guardado = lerGuardado<Localizacao>(chave, NOVENTA_DIAS);
  if (guardado) return guardado;

  const params = new URLSearchParams({
    lat, lon, format: "jsonv2", zoom: "10", addressdetails: "1", "accept-language": "pt-BR",
  });
  const erroRede = "Não foi possível identificar o município da sua localização.";
  const resposta = await buscar(`${NOMINATIM}?${params}`, { tempoLimite: 15_000, erroRede });
  const dados = (await resposta.json().catch(() => null)) as RespostaNominatim | null;
  if (!resposta.ok || !dados) throw new ErroFonte(erroRede, resposta.status);

  const endereco = dados.address ?? {};
  if (endereco.country_code !== "br") {
    throw new ErroFonte("Sua localização parece estar fora do Brasil. Escolha um estado e município no formulário.");
  }
  const uf = (endereco["ISO3166-2-lvl4"] ?? "").replace("BR-", "");
  if (!(uf in NOMES_ESTADOS_SEM_ACENTO)) {
    throw new ErroFonte("Não foi possível identificar o estado da sua localização.");
  }
  const municipio = endereco.city || endereco.town || endereco.municipality || endereco.village || endereco.county;
  if (!municipio) throw new ErroFonte(erroRede);

  const local = { municipio, uf, estado: NOMES_ESTADOS_SEM_ACENTO[uf] };
  guardar(chave, local);
  return local;
}

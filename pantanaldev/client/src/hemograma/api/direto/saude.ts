// Saúde respiratória a partir dos arquivos dados/saude/<UF>/<ano>.json, gerados
// no computador pelo script gerar_dados_estaticos.py (o DATASUS não pode ser
// lido direto pelo navegador). O site soma os meses do período escolhido.

import type { Consulta, FaixaEtaria, RespostaSaude } from "../tipos";
import { arquivoDoSite, arred, buscar, ErroFonte } from "./comum";

const FAIXAS = ["Criança/Adolescente (0-17)", "Adulto (18-59)", "Idoso (60+)", "Não informado"];

const AVISO_SIM =
  "O SIM (mortalidade) tem consolidação lenta no DATASUS. Um resultado de 0 óbitos para um período recente " +
  "costuma significar 'dado ainda não publicado', não 'não houve óbitos'. Prefira anos já fechados há pelo menos 1-2 anos.";

interface Contagem {
  total: number;
  cids: Record<string, number>;
  faixas: Record<string, number>;
}

interface ArquivoSaude {
  uf: string;
  ano: number;
  meses: { mes: number; internacoes: Contagem; obitos: Contagem }[];
  leitos: NonNullable<RespostaSaude["leitos_detalhe"]>;
  obitos_publicados: boolean;
  cids: Record<string, { doenca: string; nivel_evidencia: string }>;
}

interface Indice {
  saude?: Record<string, number[]>;
}

const MENSAGEM_GERAR =
  'Os dados de saúde ficam em arquivos gerados pelo script "gerar_dados_estaticos.py" (pasta emograma_api). ' +
  "Rode o script e publique o site de novo pelo FTP.";

let indiceGuardado: Promise<Indice> | null = null;

async function lerJson<T>(caminho: string, signal?: AbortSignal): Promise<T | null> {
  const resposta = await buscar(arquivoDoSite(caminho), {
    signal,
    tempoLimite: 30_000,
    erroRede: "Não foi possível abrir os dados de saúde do site.",
  });
  if (!resposta.ok) return null;
  // Se o arquivo não existe, alguns servidores devolvem a página do site (HTML)
  return (await resposta.json().catch(() => null)) as T | null;
}

function lerIndice(signal?: AbortSignal): Promise<Indice> {
  indiceGuardado ??= lerJson<Indice>("dados/indice.json", signal)
    .then((i) => i ?? {})
    .catch((erro) => {
      indiceGuardado = null;
      throw erro;
    });
  return indiceGuardado;
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function somarFaixas(contagens: Contagem[]): FaixaEtaria[] {
  const totais = new Map<string, number>();
  for (const c of contagens) for (const [faixa, n] of Object.entries(c.faixas)) totais.set(faixa, (totais.get(faixa) ?? 0) + n);
  const total = [...totais.values()].reduce((a, b) => a + b, 0);
  const ordem = (f: string) => (FAIXAS.includes(f) ? FAIXAS.indexOf(f) : FAIXAS.length);
  return [...totais.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => ordem(a[0]) - ordem(b[0]))
    .map(([faixa_etaria, quantidade]) => ({
      faixa_etaria,
      quantidade,
      percentual_do_total: arred((quantidade / total) * 100)!,
    }));
}

/** Os anos e meses que o período toca. */
function mesesPorAno(inicio: string, fim: string): Map<number, number[]> {
  const pedidos = new Map<number, number[]>();
  const [anoIni, mesIni] = inicio.split("-").map(Number);
  const [anoFim, mesFim] = fim.split("-").map(Number);
  for (let ano = anoIni; ano <= anoFim; ano++) {
    const primeiro = ano === anoIni ? mesIni : 1;
    const ultimo = ano === anoFim ? mesFim : 12;
    pedidos.set(ano, Array.from({ length: ultimo - primeiro + 1 }, (_, i) => primeiro + i));
  }
  return pedidos;
}

export async function saudeEstatica(consulta: Consulta, signal?: AbortSignal): Promise<RespostaSaude> {
  const inicioTempo = performance.now();
  const uf = consulta.estado;
  const leituraRapida = Boolean(consulta.saudeInicio && consulta.saudeFim);
  let inicio = consulta.saudeInicio ?? consulta.dataInicio;
  let fim = consulta.saudeFim ?? consulta.dataFim;

  const indice = await lerIndice(signal);
  const disponiveis = [...(indice.saude?.[uf] ?? [])].sort((a, b) => a - b);
  if (!disponiveis.length) {
    const estados = Object.keys(indice.saude ?? {});
    throw new ErroFonte(
      `Os dados de saúde de ${uf} ainda não foram gerados para o site. ` +
        (estados.length ? `Estados disponíveis: ${estados.join(", ")}. ` : "") +
        MENSAGEM_GERAR,
      404,
    );
  }

  let pedidos = mesesPorAno(inicio, fim);
  let aviso: string | null = null;
  const faltando = [...pedidos.keys()].filter((ano) => !disponiveis.includes(ano));

  if (faltando.length === pedidos.size) {
    if (!leituraRapida) {
      throw new ErroFonte(
        `Os dados de saúde de ${uf} para ${faltando.join(" e ")} ainda não estão no site. ` +
          `Anos disponíveis: ${disponiveis.join(", ")}. ${MENSAGEM_GERAR}`,
        404,
      );
    }
    // Leitura rápida: usa o ano mais recente que já foi gerado
    const ano = disponiveis[disponiveis.length - 1];
    inicio = `${ano}-01-01`;
    fim = `${ano}-12-31`;
    pedidos = mesesPorAno(inicio, fim);
  } else if (faltando.length) {
    aviso = `O ano de ${faltando.join(" e ")} ainda não está no site; o resultado mostra só ${[...pedidos.keys()]
      .filter((a) => disponiveis.includes(a))
      .join(" e ")}.`;
    for (const ano of faltando) pedidos.delete(ano);
  }

  const arquivos = await Promise.all(
    [...pedidos.keys()].map(async (ano) => {
      const arquivo = await lerJson<ArquivoSaude>(`dados/saude/${uf}/${ano}.json`, signal);
      if (!arquivo?.meses) {
        throw new ErroFonte(`Não foi possível abrir os dados de saúde de ${uf} ${ano} no site. ${MENSAGEM_GERAR}`, 404);
      }
      return arquivo;
    }),
  );

  const internacoes: Contagem[] = [];
  const obitos: Contagem[] = [];
  const porMes: RespostaSaude["por_mes"] = [];
  const cids = new Map<string, { internacoes: number; obitos: number }>();
  const descricoes: ArquivoSaude["cids"] = {};

  for (const arquivo of arquivos) {
    Object.assign(descricoes, arquivo.cids);
    const meses = pedidos.get(arquivo.ano) ?? [];
    for (const linha of arquivo.meses) {
      if (!meses.includes(linha.mes)) continue;
      internacoes.push(linha.internacoes);
      obitos.push(linha.obitos);
      porMes.push({
        mes: `${arquivo.ano}-${String(linha.mes).padStart(2, "0")}`,
        internacoes: linha.internacoes.total,
        obitos: linha.obitos.total,
      });
      for (const [cid, n] of Object.entries(linha.internacoes.cids)) {
        const atual = cids.get(cid) ?? { internacoes: 0, obitos: 0 };
        atual.internacoes += n;
        cids.set(cid, atual);
      }
      for (const [cid, n] of Object.entries(linha.obitos.cids)) {
        const atual = cids.get(cid) ?? { internacoes: 0, obitos: 0 };
        atual.obitos += n;
        cids.set(cid, atual);
      }
    }
  }
  porMes.sort((a, b) => a.mes.localeCompare(b.mes));

  const ultimo = arquivos[arquivos.length - 1];
  const leitos = ultimo.leitos ?? { total: null, sus: null, por_tipo: [], referencia: null, erro: "Sem dados de leitos." };
  const anos = arquivos.map((a) => a.ano);
  const periodoTexto =
    inicio.endsWith("-01-01") && fim.endsWith("-12-31") && inicio.slice(0, 4) === fim.slice(0, 4)
      ? `ano de ${inicio.slice(0, 4)}`
      : `${dataBr(inicio)} a ${dataBr(fim)}`;

  return {
    uf,
    anos,
    total_internacoes: internacoes.reduce((t, c) => t + c.total, 0),
    total_obitos: obitos.reduce((t, c) => t + c.total, 0),
    doencas_respiratorias: [...cids.entries()]
      .map(([cid, n]) => ({
        cid,
        doenca: descricoes[cid]?.doenca ?? cid,
        nivel_evidencia: descricoes[cid]?.nivel_evidencia ?? "",
        ...n,
      }))
      .sort((a, b) => b.internacoes - a.internacoes || b.obitos - a.obitos),
    leitos_hospitalares: leitos.total,
    leitos_referencia: leitos.referencia,
    leitos_detalhe: leitos,
    internacoes_por_faixa_etaria: somarFaixas(internacoes),
    obitos_por_faixa_etaria: somarFaixas(obitos),
    por_mes: porMes,
    aviso_obitos: arquivos.some((a) => !a.obitos_publicados) ? AVISO_SIM : null,
    periodo: { inicio, fim, texto: periodoTexto, aviso },
    meta: { tempo_segundos: arred((performance.now() - inicioTempo) / 1000) ?? 0, em_cache: false },
  };
}

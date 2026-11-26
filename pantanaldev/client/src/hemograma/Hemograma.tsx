import type { UseQueryResult } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { ErroApi } from "./api/cliente";
import type { Consulta } from "./api/tipos";
import { FormularioBusca } from "./components/FormularioBusca";
import { AvisoLocalizacao, PainelAgora } from "./components/LeituraRapida";
import { MapaQueimadas } from "./components/MapaQueimadas";
import { PainelMensal } from "./components/PainelMensal";
import { CabecalhoResultado, Indicadores } from "./components/Resumo";
import { SecaoCarregando, SecaoClima, SecaoErro, SecaoQueimadas, SecaoSaude } from "./components/Detalhes";
import { IconeCalendario, IconeFogo, IconeLocal, IconeNuvem, IconeSaude, Spinner } from "./components/ui/Icones";
import { useConsultaNaUrl } from "./hooks/useConsultaNaUrl";
import { useFonte } from "./hooks/useHemograma";
import { useLocalizacao } from "./hooks/useLocalizacao";
import { hoje, periodoLeituraRapida, periodoSaudeRecente } from "./lib/periodo";

function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroApi) return erro.message;
  if (erro instanceof Error) return erro.message;
  return "Erro desconhecido.";
}

/** Mostra a seção de uma fonte: carregando, erro ou o conteúdo. */
function Bloco<T>({
  consulta,
  titulo,
  avisoCarregando,
  children,
}: {
  consulta: UseQueryResult<T>;
  titulo: string;
  avisoCarregando?: string;
  children: (dados: T) => ReactNode;
}) {
  if (consulta.data) return <>{children(consulta.data)}</>;
  if (consulta.isError) {
    return <SecaoErro titulo={titulo} mensagem={mensagemDeErro(consulta.error)} tentarDeNovo={() => consulta.refetch()} />;
  }
  return <SecaoCarregando titulo={titulo} aviso={avisoCarregando} />;
}

function EstadoInicial() {
  const passos = [
    { icone: <IconeFogo />, cor: "bg-orange-100 text-orange-700", titulo: "Queimadas", texto: "Onde e quando os satélites viram fogo, com mapa interativo." },
    { icone: <IconeNuvem />, cor: "bg-sky-100 text-sky-700", titulo: "Clima e ar", texto: "Chuva, temperatura e a poluição que a fumaça deixa no ar." },
    { icone: <IconeSaude />, cor: "bg-violet-100 text-violet-700", titulo: "Saúde", texto: "Internações e óbitos por doenças respiratórias ligadas à fumaça." },
  ];
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center sm:p-10">
      <h2 className="text-lg font-semibold text-slate-900">Escolha um local, um período e os dados que quer ver</h2>
      <p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">
        O hemograma junta as fontes escolhidas e mostra tudo mês a mês, para comparar com facilidade.
      </p>
      <div className="mt-6 grid gap-4 text-left sm:grid-cols-3">
        {passos.map((p) => (
          <div key={p.titulo} className="flex gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${p.cor}`}>{p.icone}</span>
            <div>
              <div className="text-sm font-semibold text-slate-900">{p.titulo}</div>
              <div className="text-xs text-slate-500">{p.texto}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Barra que aparece no lugar do formulário fechado. */
function BarraPesquisa({
  onAbrir,
  onUsarLocalizacao,
  localizando,
}: {
  onAbrir: () => void;
  onUsarLocalizacao: () => void;
  localizando: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <button
        type="button"
        onClick={onAbrir}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900"
      >
        <IconeCalendario tamanho={18} /> Pesquisar outro local ou período
      </button>
      <button
        type="button"
        onClick={onUsarLocalizacao}
        disabled={localizando}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-70"
      >
        {localizando ? <Spinner /> : <IconeLocal tamanho={18} />}
        {localizando ? "Localizando..." : "Atualizar com minha localização"}
      </button>
    </div>
  );
}

/** Conteúdo da aba Hemograma (a busca, a leitura rápida e os resultados). */
export default function Hemograma() {
  const { consulta, buscar, buscarAutomatico, versao } = useConsultaNaUrl();
  const { estado: estadoLocal, localizar } = useLocalizacao();
  // O formulário começa fechado quando já há uma busca (ex: link compartilhado)
  const [formAberto, setFormAberto] = useState(consulta === null);

  // Leitura rápida: localização atual + última semana até hoje
  const leituraRapida = useCallback(
    async (aoAbrirPagina: boolean) => {
      const local = await localizar();
      if (!local) {
        setFormAberto(true); // sem localização, a pessoa escolhe o local no formulário
        return;
      }
      const { inicio, fim } = periodoLeituraRapida();
      const saude = periodoSaudeRecente();
      const nova: Consulta = {
        estado: local.uf,
        municipio: local.municipio,
        dataInicio: inicio,
        dataFim: fim,
        fontes: ["queimadas", "clima", "saude"],
        // O DATASUS só publica os dados meses depois: na leitura rápida, a
        // saúde mostra o último ano completo já publicado
        saudeInicio: saude.inicio,
        saudeFim: saude.fim,
      };
      buscarAutomatico(nova, aoAbrirPagina);
      setFormAberto(false);
    },
    [localizar, buscarAutomatico],
  );

  // Ao abrir a página sem uma busca no endereço, faz a leitura rápida
  useEffect(() => {
    if (consulta === null) void leituraRapida(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- só uma vez, ao abrir

  // As três fontes são pedidas ao mesmo tempo; só as escolhidas fazem requisição
  const queimadas = useFonte("queimadas", consulta);
  const clima = useFonte("clima", consulta);
  const saude = useFonte("saude", consulta);
  const consultas = { queimadas, clima, saude };

  const quer = (f: "queimadas" | "clima" | "saude") => consulta?.fontes.includes(f) ?? false;
  const carregando = (quer("queimadas") && queimadas.isFetching) || (quer("clima") && clima.isFetching) || (quer("saude") && saude.isFetching);
  const localizando = estadoLocal.situacao === "buscando";
  // O painel "Agora" aparece quando o período termina hoje
  const mostrarAgora = consulta !== null && quer("clima") && consulta.dataFim === hoje();

  return (
    <div className="bg-slate-50">
      {/* Faixa de título, no mesmo estilo das outras abas do site */}
      <section className="gradient-primary py-12 text-white md:py-16">
        <div className="container entrada-heroi mx-auto px-4">
          <h1 className="text-4xl font-bold md:text-5xl">Hemograma Ambiental</h1>
          <p className="mt-3 max-w-2xl text-lg text-white/90 md:text-xl">
            Queimadas, clima, qualidade do ar e saúde respiratória no mesmo lugar, a partir de dados públicos do
            INPE, Open-Meteo e DATASUS.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <AvisoLocalizacao estado={estadoLocal} onTentarDeNovo={() => void leituraRapida(false)} />

        {formAberto ? (
          <FormularioBusca
            key={versao}
            inicial={consulta}
            carregando={carregando}
            localizando={localizando}
            onBuscar={(nova) => {
              buscar(nova);
              setFormAberto(false);
            }}
            onUsarLocalizacao={() => void leituraRapida(false)}
          />
        ) : (
          <BarraPesquisa
            onAbrir={() => setFormAberto(true)}
            onUsarLocalizacao={() => void leituraRapida(false)}
            localizando={localizando}
          />
        )}

        {!consulta ? (
          estadoLocal.situacao === "erro" && <EstadoInicial />
        ) : (
          <div className="space-y-6">
            <CabecalhoResultado consulta={consulta} consultas={consultas} />
            {mostrarAgora && <PainelAgora clima={clima.data} carregando={clima.isFetching} />}
            <Indicadores consulta={consulta} consultas={consultas} />

            {/* O mapa só aparece quando Queimadas foi escolhida */}
            {quer("queimadas") && (
              <Bloco consulta={queimadas} titulo="Onde estão os focos de queimada">
                {(dados) => <MapaQueimadas dados={dados} />}
              </Bloco>
            )}

            {(queimadas.data || clima.data || saude.data) && (
              <PainelMensal
                consulta={consulta}
                queimadas={quer("queimadas") ? queimadas.data : undefined}
                clima={quer("clima") ? clima.data : undefined}
                // Com período próprio, a saúde não entra no mês a mês (são meses diferentes)
                saude={quer("saude") && !consulta.saudeInicio ? saude.data : undefined}
              />
            )}

            {quer("queimadas") && queimadas.data && <SecaoQueimadas dados={queimadas.data} />}
            {quer("clima") && (
              <Bloco consulta={clima} titulo="Clima e qualidade do ar">
                {(dados) => <SecaoClima dados={dados} agoraNoTopo={mostrarAgora} />}
              </Bloco>
            )}
            {quer("saude") && (
              <Bloco
                consulta={saude}
                titulo="Saúde respiratória"
                avisoCarregando="Baixando dados do DATASUS. Na primeira vez pode levar alguns minutos; depois fica salvo e volta na hora."
              >
                {(dados) => <SecaoSaude dados={dados} consulta={consulta} />}
              </Bloco>
            )}
          </div>
        )}
      </div>

      <p className="pb-8 text-center text-xs text-slate-500">
        Dados: INPE (BDQueimadas), Open-Meteo e DATASUS (via PySUS).
      </p>
    </div>
  );
}

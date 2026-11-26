import type { RespostaClima } from "../api/tipos";
import type { EstadoLocalizacao } from "../hooks/useLocalizacao";
import { comUnidade, numero } from "../lib/formatar";
import { faixaPorNome } from "../lib/qualidadeAr";
import { descreverTempo } from "../lib/tempo";
import { Aviso, Esqueleto } from "./ui/Basicos";
import { IconeAtualizar, IconeLocal, Spinner } from "./ui/Icones";

/** Aviso que aparece enquanto a localização é buscada, ou quando ela falha. */
export function AvisoLocalizacao({
  estado,
  onTentarDeNovo,
}: {
  estado: EstadoLocalizacao;
  onTentarDeNovo: () => void;
}) {
  if (estado.situacao === "buscando") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
        <Spinner tamanho={18} />
        <div>
          <strong className="font-semibold">Buscando sua localização para a leitura rápida…</strong>
          <span className="block text-emerald-800/80">Se o navegador perguntar, permita o acesso à localização.</span>
        </div>
      </div>
    );
  }
  if (estado.situacao === "erro") {
    return (
      <Aviso tipo="atencao">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <span>{estado.mensagem}</span>
          <button
            type="button"
            onClick={onTentarDeNovo}
            className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-900 hover:bg-amber-100"
          >
            <IconeAtualizar tamanho={15} /> Tentar de novo
          </button>
        </div>
      </Aviso>
    );
  }
  return null;
}

/** Painel "Agora": como está o tempo e o ar neste momento no local buscado. */
export function PainelAgora({ clima, carregando }: { clima?: RespostaClima; carregando: boolean }) {
  if (!clima) {
    if (!carregando) return null;
    return (
      <div className="rounded-2xl bg-gradient-to-br from-emerald-900 to-emerald-700 p-5 sm:p-6">
        <Esqueleto className="h-4 w-40 bg-white/20" />
        <Esqueleto className="mt-4 h-10 w-32 bg-white/20" />
        <Esqueleto className="mt-3 h-4 w-64 bg-white/20" />
      </div>
    );
  }

  const tempo = clima.clima_atual;
  const ar = clima.qualidade_ar_atual;
  const faixa = faixaPorNome(ar?.classificacao);
  const horario = tempo?.horario?.slice(11, 16);

  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 text-white shadow-sm">
      <div className="grid gap-5 p-5 *:min-w-0 sm:p-6 md:grid-cols-[1.2fr_1fr] md:items-center">
        {/* Tempo agora */}
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm text-emerald-100/90">
            <IconeLocal tamanho={16} />
            Agora em {clima.local.municipio}
            {horario && <span className="text-emerald-200/70">· {horario}</span>}
          </p>
          {tempo ? (
            <>
              <div className="mt-2 flex items-end gap-3">
                <span className="text-5xl font-semibold tracking-tight tabular-nums">{numero(tempo.temperatura, 0)}°</span>
                <span className="pb-1.5 text-lg text-emerald-50">{descreverTempo(tempo.codigo_tempo)}</span>
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-emerald-100/90">
                <div>
                  <dt className="inline">Sensação </dt>
                  <dd className="inline font-medium text-white">{comUnidade(tempo.sensacao_termica, "°C", 0)}</dd>
                </div>
                <div>
                  <dt className="inline">Umidade </dt>
                  <dd className="inline font-medium text-white">{comUnidade(tempo.umidade, "%", 0)}</dd>
                </div>
                <div>
                  <dt className="inline">Vento </dt>
                  <dd className="inline font-medium text-white">{comUnidade(tempo.vento, "km/h", 0)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-2 text-emerald-100">O tempo de agora não está disponível no momento.</p>
          )}
        </div>

        {/* Ar agora */}
        <div className="rounded-xl bg-white p-4 text-slate-900">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Qualidade do ar agora</p>
          {ar ? (
            <>
              <p className="mt-1 text-2xl font-semibold" style={{ color: faixa?.cor }}>
                {ar.classificacao ?? "–"}
              </p>
              <p className="text-sm text-slate-600">{faixa?.explicacao}</p>
              <div className="mt-3 flex gap-4 text-sm">
                <span>
                  <span className="text-slate-500">PM2.5 </span>
                  <strong className="tabular-nums">{comUnidade(ar.pm2_5, "µg/m³")}</strong>
                </span>
                <span>
                  <span className="text-slate-500">Índice </span>
                  <strong className="tabular-nums">{numero(ar.us_aqi, 0)}</strong>
                </span>
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Sem dados de qualidade do ar agora.</p>
          )}
        </div>
      </div>
    </div>
  );
}

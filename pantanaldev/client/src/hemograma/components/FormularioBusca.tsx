import { useState, type FormEvent, type ReactNode } from "react";

import type { Consulta, Fonte } from "../api/tipos";
import { ESTADOS } from "../lib/estados";
import { INFO_FONTES, ORDEM_FONTES } from "../lib/fontes";
import { atalhosDePeriodo, hoje, periodoLeituraRapida, validarPeriodo } from "../lib/periodo";
import { IconeCheck, IconeFogo, IconeLocal, IconeNuvem, IconeSaude, Spinner } from "./ui/Icones";

export const ICONES_FONTES: Record<Fonte, ReactNode> = {
  queimadas: <IconeFogo />,
  clima: <IconeNuvem />,
  saude: <IconeSaude />,
};

function valoresIniciais(inicial: Consulta | null): Consulta {
  if (inicial) return inicial;
  const { inicio, fim } = periodoLeituraRapida();
  return { estado: "MS", municipio: "", dataInicio: inicio, dataFim: fim, fontes: ["queimadas", "clima"] };
}

const estiloCampo =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-3 focus:ring-emerald-600/15";

function Rotulo({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-600 uppercase">
      {children}
    </label>
  );
}

export function FormularioBusca({
  inicial,
  carregando,
  localizando,
  onBuscar,
  onUsarLocalizacao,
}: {
  inicial: Consulta | null;
  carregando: boolean;
  localizando: boolean;
  onBuscar: (consulta: Consulta) => void;
  onUsarLocalizacao: () => void;
}) {
  const [valores, setValores] = useState<Consulta>(() => valoresIniciais(inicial));
  const [erro, setErro] = useState<string | null>(null);
  const atalhos = atalhosDePeriodo();

  const alterar = <K extends keyof Consulta>(campo: K, valor: Consulta[K]) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErro(null);
  };

  const alternarFonte = (fonte: Fonte) => {
    const marcadas = valores.fontes.includes(fonte)
      ? valores.fontes.filter((f) => f !== fonte)
      : ORDEM_FONTES.filter((f) => f === fonte || valores.fontes.includes(f));
    alterar("fontes", marcadas);
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const problema =
      valores.fontes.length === 0
        ? "Escolha pelo menos uma fonte de dados."
        : validarPeriodo(valores.dataInicio, valores.dataFim);
    if (problema) {
      setErro(problema);
      return;
    }
    // Busca pelo formulário: todas as fontes usam o mesmo período escolhido
    onBuscar({ ...valores, municipio: valores.municipio.trim(), saudeInicio: undefined, saudeFim: undefined });
  };

  return (
    <form onSubmit={enviar} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" noValidate>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Pesquisar</h2>
          <p className="text-sm text-slate-500">Escolha outro local ou outro período, ou volte para onde você está agora.</p>
        </div>
        <button
          type="button"
          onClick={onUsarLocalizacao}
          disabled={localizando}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700/30 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-70"
        >
          {localizando ? <Spinner /> : <IconeLocal tamanho={18} />}
          {localizando ? "Localizando..." : "Usar minha localização (hoje)"}
        </button>
      </div>

      {/* ---- Local e período ---- */}
      <div className="grid gap-4 md:grid-cols-12">
        <div className="md:col-span-3">
          <Rotulo htmlFor="estado">Estado</Rotulo>
          <select
            id="estado"
            className={estiloCampo}
            value={valores.estado}
            onChange={(e) => alterar("estado", e.target.value)}
          >
            {ESTADOS.map((e) => (
              <option key={e.sigla} value={e.sigla}>
                {e.nome} ({e.sigla})
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-4">
          <Rotulo htmlFor="municipio">
            Município <span className="font-normal tracking-normal text-slate-400 normal-case">(opcional)</span>
          </Rotulo>
          <input
            id="municipio"
            className={estiloCampo}
            placeholder="Deixe vazio para o estado inteiro"
            value={valores.municipio}
            onChange={(e) => alterar("municipio", e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 md:col-span-5">
          <div>
            <Rotulo htmlFor="inicio">De</Rotulo>
            <input
              id="inicio"
              type="date"
              className={estiloCampo}
              value={valores.dataInicio}
              max={hoje()}
              onChange={(e) => alterar("dataInicio", e.target.value)}
            />
          </div>
          <div>
            <Rotulo htmlFor="fim">Até</Rotulo>
            <input
              id="fim"
              type="date"
              className={estiloCampo}
              value={valores.dataFim}
              max={hoje()}
              onChange={(e) => alterar("dataFim", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ---- Atalhos de período ---- */}
      <div className="mt-3 flex flex-wrap gap-2">
        {atalhos.map((a) => {
          const ativo = a.inicio === valores.dataInicio && a.fim === valores.dataFim;
          return (
            <button
              key={a.rotulo}
              type="button"
              onClick={() => {
                alterar("dataInicio", a.inicio);
                alterar("dataFim", a.fim);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                ativo
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
              }`}
            >
              {a.rotulo}
            </button>
          );
        })}
      </div>

      {/* ---- Fontes de dados ---- */}
      <fieldset className="mt-6">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
          Quais dados você quer ver?
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {ORDEM_FONTES.map((fonte) => {
            const info = INFO_FONTES[fonte];
            const marcada = valores.fontes.includes(fonte);
            return (
              <label
                key={fonte}
                className={`relative flex cursor-pointer gap-3 rounded-xl border p-3.5 transition ${
                  marcada
                    ? `${info.classes.borda} ${info.classes.fundo} ring-2 ${info.classes.anel}`
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={marcada}
                  onChange={() => alternarFonte(fonte)}
                />
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                    marcada ? `bg-white ${info.classes.texto}` : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {ICONES_FONTES[fonte]}
                </span>
                <span className="min-w-0 pr-5">
                  <span className="block text-sm font-semibold text-slate-900">{info.titulo}</span>
                  <span className="block text-xs text-slate-500">{info.descricao}</span>
                  <span className="mt-1 block text-[11px] font-medium text-slate-400">
                    {info.origem} · {info.tempo}
                  </span>
                </span>
                <span
                  className={`absolute top-3 right-3 grid size-5 place-items-center rounded-full border ${
                    marcada ? "border-transparent bg-slate-900 text-white" : "border-slate-300 bg-white text-transparent"
                  }`}
                >
                  <IconeCheck tamanho={13} strokeWidth={3} />
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* ---- Enviar ---- */}
      <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-red-700" role="alert">
          {erro}
        </p>
        {/* Fica sempre clicável: dá para mudar a busca mesmo com outra em andamento */}
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-900 focus:ring-3 focus:ring-emerald-600/30 focus:outline-none"
        >
          {carregando && <Spinner />}
          Gerar hemograma
        </button>
      </div>
    </form>
  );
}

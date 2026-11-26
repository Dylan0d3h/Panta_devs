import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { IconeAlerta, IconeInfo, IconeSeta } from "./Icones";

/** Caixa branca padrão das seções. */
export function Cartao({
  titulo,
  subtitulo,
  icone,
  acoes,
  children,
  className = "",
  corIcone = "text-slate-500 bg-slate-100",
}: {
  titulo?: ReactNode;
  subtitulo?: ReactNode;
  icone?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
  corIcone?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div className="flex min-w-0 items-start gap-3">
            {icone && <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${corIcone}`}>{icone}</span>}
            <div className="min-w-0">
              {titulo && <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>}
              {subtitulo && <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>}
            </div>
          </div>
          {acoes}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Retângulo cinza pulsando, usado enquanto os dados carregam. */
export function Esqueleto({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
}

/** Nota explicativa (azul) ou de atenção (âmbar). */
export function Aviso({ tipo = "info", children }: { tipo?: "info" | "atencao"; children: ReactNode }) {
  const estilo =
    tipo === "info"
      ? "border-sky-200 bg-sky-50 text-sky-900"
      : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={`flex gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${estilo}`}>
      {tipo === "info" ? (
        <IconeInfo tamanho={18} className="mt-0.5 shrink-0" />
      ) : (
        <IconeAlerta tamanho={18} className="mt-0.5 shrink-0" />
      )}
      <div>{children}</div>
    </div>
  );
}

/** Botão "?" que abre uma explicação curta. Funciona com toque (celular) e clique. */
export function Ajuda({ children, rotulo = "O que é isso?" }: { children: ReactNode; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fechar);
    document.addEventListener("touchstart", fechar);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("touchstart", fechar);
    };
  }, [aberto]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={rotulo}
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((a) => !a)}
        className="grid size-5 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <IconeInfo tamanho={15} />
      </button>
      {aberto && (
        <span
          id={id}
          role="tooltip"
          className="absolute top-6 left-1/2 z-20 w-64 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs leading-relaxed font-normal text-slate-600 normal-case shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  );
}

/** Bloco que abre e fecha (para tabelas longas, dia a dia etc.). */
export function Recolhivel({ titulo, children }: { titulo: ReactNode; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-slate-200">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 select-none hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <IconeSeta tamanho={16} className="transition group-open:rotate-90" />
        {titulo}
      </summary>
      <div className="border-t border-slate-200">{children}</div>
    </details>
  );
}

/** Tabela simples e responsiva (rola de lado no celular). */
export interface Coluna<T> {
  titulo: string;
  valor: (linha: T) => ReactNode;
  alinhar?: "esquerda" | "direita";
}

export function Tabela<T>({
  colunas,
  linhas,
  vazio = "Nenhum dado para mostrar.",
  alturaMaxima = true,
}: {
  colunas: Coluna<T>[];
  linhas: T[];
  vazio?: string;
  alturaMaxima?: boolean;
}) {
  if (linhas.length === 0) return <p className="p-4 text-sm text-slate-500">{vazio}</p>;
  return (
    <div className={`overflow-x-auto ${alturaMaxima ? "max-h-96 overflow-y-auto" : ""}`}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 uppercase">
          <tr>
            {colunas.map((c) => (
              <th
                key={c.titulo}
                className={`px-4 py-2.5 font-medium whitespace-nowrap ${c.alinhar === "direita" ? "text-right" : "text-left"}`}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {linhas.map((linha, i) => (
            <tr key={i} className="hover:bg-slate-50/70">
              {colunas.map((c) => (
                <td
                  key={c.titulo}
                  className={`px-4 py-2.5 whitespace-nowrap text-slate-700 ${c.alinhar === "direita" ? "text-right tabular-nums" : ""}`}
                >
                  {c.valor(linha)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lista de barras horizontais (ranking): rótulo, barra e valor. */
export function ListaBarras({
  itens,
  cor,
  formatar,
}: {
  itens: { rotulo: string; valor: number; detalhe?: string }[];
  cor: string;
  formatar: (v: number) => string;
}) {
  const maximo = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="space-y-2.5">
      {itens.map((item) => (
        <li key={item.rotulo}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{item.rotulo}</span>
            <span className="shrink-0 font-medium text-slate-900 tabular-nums">
              {formatar(item.valor)}
              {item.detalhe && <span className="ml-1.5 text-xs font-normal text-slate-500">{item.detalhe}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 rounded-full" style={{ width: `${(item.valor / maximo) * 100}%`, backgroundColor: cor }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

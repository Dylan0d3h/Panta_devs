import { useEffect } from "react";

/**
 * Faz as seções da página aparecerem suavemente quando entram na tela.
 *
 * Vale para todas as <section> dentro do <main> (menos as faixas do topo,
 * que têm a própria animação de entrada) e para qualquer elemento com o
 * atributo data-revelar. Elementos que aparecem depois (ex: resultados do Hemograma)
 * também são animados. Quem pediu "reduzir movimento" no sistema não vê
 * animação nenhuma.
 */
export function useRevelarAoRolar(chave: string) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            entrada.target.classList.add("visivel");
            observador.unobserve(entrada.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );

    const preparar = (el: Element) => {
      const html = el as HTMLElement;
      if (html.dataset.revelarPronto) return;
      html.dataset.revelarPronto = "1";
      html.classList.add("revelar");
      observador.observe(html);
    };

    const varrer = () => {
      document
        .querySelectorAll("main section:not(:has(> .entrada-heroi)), main [data-revelar]")
        .forEach(preparar);
    };

    varrer();
    const principal = document.querySelector("main");
    const mutacoes = new MutationObserver(varrer);
    if (principal) mutacoes.observe(principal, { childList: true, subtree: true });

    return () => {
      observador.disconnect();
      mutacoes.disconnect();
    };
  }, [chave]);
}

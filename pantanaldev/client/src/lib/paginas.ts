/** Páginas do site: endereço e nome que aparece no menu. */
export interface Pagina {
  caminho: string;
  nome: string;
  noMenu: boolean; // false = existe, mas não aparece no menu principal
}

export const PAGINAS: Pagina[] = [
  { caminho: "/", nome: "Início", noMenu: true },
  { caminho: "/objetivo", nome: "Objetivo", noMenu: true },
  { caminho: "/relatorio", nome: "Relatório Técnico", noMenu: true },
  { caminho: "/hemograma", nome: "Hemograma", noMenu: true },
  { caminho: "/equipe", nome: "Equipe", noMenu: true },
  { caminho: "/parceiros", nome: "Parceiros", noMenu: true },
  { caminho: "/mapa", nome: "Mapa do Pantanal", noMenu: false },
  { caminho: "/missao", nome: "Missão", noMenu: false },
];

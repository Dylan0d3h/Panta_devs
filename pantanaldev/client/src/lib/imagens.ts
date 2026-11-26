/**
 * Fotos de fundo das páginas, num lugar só.
 *
 * Todas são do Wikimedia Commons, com licença livre (CC BY, CC BY-SA ou domínio
 * público), e são carregadas direto de lá. Os créditos aparecem no rodapé do
 * site (exigência dessas licenças). Para trocar uma foto, mude o endereço aqui
 * e atualize os créditos logo abaixo.
 * Se uma foto não carregar, a página mostra um fundo verde-escuro no lugar.
 */
const COMMONS = "https://upload.wikimedia.org/wikipedia/commons/thumb";

export const IMAGENS = {
  inicio: `${COMMONS}/2/2d/Por-do-sol_no_Pantanal_de_Miranda%2C_MS.JPG/1920px-Por-do-sol_no_Pantanal_de_Miranda%2C_MS.JPG`,
  monitoramento: `${COMMONS}/3/3a/Incendios_Pantanal_Foto_Jos%C3%A9_Medeiros-6535_%2850734047346%29.jpg/1920px-Incendios_Pantanal_Foto_Jos%C3%A9_Medeiros-6535_%2850734047346%29.jpg`,
  relatorio: `${COMMONS}/2/23/Imagem_de_sat%C3%A9lite_dos_inc%C3%AAndios_no_Pantanal_em_2020.jpg/1920px-Imagem_de_sat%C3%A9lite_dos_inc%C3%AAndios_no_Pantanal_em_2020.jpg`,
  equipe: `${COMMONS}/5/58/River_in_the_Parque_Nacional_do_Pantanal_Matogrossense_-_Caminho_do_rio.jpg/1920px-River_in_the_Parque_Nacional_do_Pantanal_Matogrossense_-_Caminho_do_rio.jpg`,
  parceiros: `${COMMONS}/a/a3/Rio_Paraguai%2C_Corumb%C3%A1%2C_MS.JPG/1920px-Rio_Paraguai%2C_Corumb%C3%A1%2C_MS.JPG`,
  missao: `${COMMONS}/f/f5/Tuiui%C3%BA%2C_Pantanal%2C_MS.JPG/1920px-Tuiui%C3%BA%2C_Pantanal%2C_MS.JPG`,
  mapa: `${COMMONS}/7/7d/Jacar%C3%A9s_tomam_sol_no_pantanal.jpg/1920px-Jacar%C3%A9s_tomam_sol_no_pantanal.jpg`,
};

/** Créditos das fotos (mostrados no rodapé). */
export const CREDITOS_IMAGENS = [
  {
    descricao: "Pôr do sol no Pantanal de Miranda (MS)",
    autor: "Cynthia Doutel Ribas",
    licenca: "CC BY-SA 3.0",
    licencaUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    fonte: "https://commons.wikimedia.org/wiki/File:Por-do-sol_no_Pantanal_de_Miranda,_MS.JPG",
  },
  {
    descricao: "Incêndios no Pantanal (foto de José Medeiros)",
    autor: "Amazônia Real",
    licenca: "CC BY 2.0",
    licencaUrl: "https://creativecommons.org/licenses/by/2.0",
    fonte: "https://commons.wikimedia.org/wiki/File:Incendios_Pantanal_Foto_Jos%C3%A9_Medeiros-6535_(50734047346).jpg",
  },
  {
    descricao: "Imagem de satélite da fumaça dos incêndios no Pantanal em 2020",
    autor: "NOAA-20 / VIIRS (fronteiras: OpenStreetMap)",
    licenca: "Domínio público",
    licencaUrl: null,
    fonte: "https://commons.wikimedia.org/wiki/File:Imagem_de_sat%C3%A9lite_dos_inc%C3%AAndios_no_Pantanal_em_2020.jpg",
  },
  {
    descricao: "Rio no Parque Nacional do Pantanal Mato-Grossense",
    autor: "Giovanna Colombi",
    licenca: "CC BY-SA 4.0",
    licencaUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    fonte: "https://commons.wikimedia.org/wiki/File:River_in_the_Parque_Nacional_do_Pantanal_Matogrossense_-_Caminho_do_rio.jpg",
  },
  {
    descricao: "Rio Paraguai, Corumbá (MS)",
    autor: "Cynthia Doutel Ribas",
    licenca: "CC BY-SA 3.0",
    licencaUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    fonte: "https://commons.wikimedia.org/wiki/File:Rio_Paraguai,_Corumb%C3%A1,_MS.JPG",
  },
  {
    descricao: "Tuiuiú no Pantanal (MS)",
    autor: "Otavio Pedroso Gomes",
    licenca: "CC BY-SA 4.0",
    licencaUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    fonte: "https://commons.wikimedia.org/wiki/File:Tuiui%C3%BA,_Pantanal,_MS.JPG",
  },
  {
    descricao: "Jacarés tomam sol no Pantanal",
    autor: "Fabio.R.S",
    licenca: "CC BY-SA 4.0",
    licencaUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    fonte: "https://commons.wikimedia.org/wiki/File:Jacar%C3%A9s_tomam_sol_no_pantanal.jpg",
  },
];

/** Estilo de fundo com a foto (a cor de reserva fica na classe bg-emerald-950 da seção). */
export function fundoComFoto(url: string) {
  return { backgroundImage: `url("${url}")` };
}

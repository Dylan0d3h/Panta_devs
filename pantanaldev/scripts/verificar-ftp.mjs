// Roda antes do "npm run build:ftp": confere a configuração e os dados do Hemograma.
import fs from "node:fs";

const arquivo = ".env.production";
const valores = fs.existsSync(arquivo)
  ? Object.fromEntries(
      fs
        .readFileSync(arquivo, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    )
  : {};

const api = valores.VITE_HEMOGRAMA_API || "";
const base = valores.SITE_BASE || "/";

console.log("\nConfiguração do site para o FTP:");
console.log(`  Pasta do site (SITE_BASE): ${base}`);
console.log(`  Dados do Hemograma: ${api ? `API em ${api}` : "sem servidor (direto das fontes + arquivos da pasta dados)"}`);

if (api && !api.startsWith("https://")) {
  console.log("\n⚠  O endereço da API não começa com https://. Num site com https, o navegador bloqueia a API em http.");
}
if (!base.startsWith("/") || !base.endsWith("/")) {
  console.log('\n⚠  SITE_BASE deve começar e terminar com "/" (ex: "/" ou "/pantanal/").');
}

if (!api) {
  const indice = "client/public/dados/indice.json";
  if (!fs.existsSync(indice)) {
    console.log("\n⚠  Ainda não há dados de saúde. A aba Hemograma funciona, mas a parte de saúde vai pedir para gerar os dados.");
    console.log("   Na pasta emograma_api (com o .venv ativado): python gerar_dados_estaticos.py");
  } else {
    const dados = JSON.parse(fs.readFileSync(indice, "utf8"));
    const saude = Object.entries(dados.saude ?? {}).map(([uf, anos]) => `${uf} (${anos.join(", ")})`);
    const queimadas = Object.entries(dados.queimadas ?? {}).map(([uf, p]) => `${uf} (${p.inicio} a ${p.fim})`);
    console.log(`  Saúde: ${saude.join("; ") || "nenhum estado"}`);
    console.log(`  Queimadas de reserva: ${queimadas.join("; ") || "nenhuma (o site usa só o INPE direto)"}`);
    if (dados.gerado_em) {
      const dias = Math.floor((Date.now() - Date.parse(dados.gerado_em)) / 86_400_000);
      console.log(`  Dados gerados em ${dados.gerado_em.slice(0, 10)} (${dias} dia(s) atrás)`);
      if (dias > 45) console.log("\n⚠  Os dados têm mais de 45 dias. Vale rodar o gerar_dados_estaticos.py de novo.");
    }
  }
}
console.log("");

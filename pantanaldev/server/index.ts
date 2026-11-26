/**
 * Servidor da versão final do site (depois de `npm run build`).
 *
 * - Entrega os arquivos do site (pasta dist/public).
 * - Repassa as chamadas /api/... para a API do Hemograma em Python (FastAPI),
 *   tirando o prefixo /api. Ex: /api/hemograma/clima -> {API}/hemograma/clima.
 * - Qualquer outro endereço (ex: /hemograma, /equipe) devolve o index.html,
 *   e o React mostra a página certa.
 *
 * Variáveis de ambiente (opcionais):
 *   PORT               porta do site (padrão 3000)
 *   HEMOGRAMA_API_URL  endereço da API em Python (padrão http://127.0.0.1:8000)
 */
import express from "express";
import fs from "fs";
import { createServer, request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Depois do build, este arquivo fica em dist/index.js e o site em dist/public.
// Rodando direto do código-fonte, o site fica em ../dist/public.
const candidatos = [path.resolve(__dirname, "public"), path.resolve(__dirname, "..", "dist", "public")];
const pastaSite = candidatos.find((p) => fs.existsSync(path.join(p, "index.html"))) ?? candidatos[0];

const apiHemograma = process.env.HEMOGRAMA_API_URL || "http://127.0.0.1:8000";

function iniciar() {
  const app = express();
  const server = createServer(app);

  // ---- Repasse para a API do Hemograma ----
  app.use("/api", (req, res) => {
    const destino = new URL(req.url, apiHemograma); // req.url já vem sem o "/api"
    const requisitar = destino.protocol === "https:" ? httpsRequest : httpRequest;
    const repasse = requisitar(
      destino,
      { method: req.method, headers: { ...req.headers, host: destino.host } },
      (resposta) => {
        res.writeHead(resposta.statusCode ?? 502, resposta.headers);
        resposta.pipe(res);
      },
    );
    repasse.on("error", () => {
      if (!res.headersSent) {
        res.status(502).json({
          detail: "A API do Hemograma (Python) não está respondendo. Verifique se ela está rodando.",
        });
      }
    });
    req.pipe(repasse);
  });

  // ---- Arquivos do site ----
  app.use(express.static(pastaSite));

  // ---- Páginas (o React escolhe qual mostrar pelo endereço) ----
  app.get("*", (_req, res) => {
    res.sendFile(path.join(pastaSite, "index.html"));
  });

  const porta = process.env.PORT || 3000;
  server.listen(porta, () => {
    console.log(`Site rodando em http://localhost:${porta}/`);
    console.log(`API do Hemograma: ${apiHemograma}`);
  });
}

iniciar();

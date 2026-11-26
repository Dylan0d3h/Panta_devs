import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";

// Endereço da API do Hemograma (Python/FastAPI). O site chama /api/hemograma/...
// e o Vite repassa para a API sem o prefixo /api (ex: /api/hemograma/clima ->
// http://127.0.0.1:8000/hemograma/clima).
const API_HEMOGRAMA = process.env.HEMOGRAMA_API_URL || "http://127.0.0.1:8000";

export default defineConfig(({ mode }) => {
  // Lê o .env / .env.production da raiz do projeto (veja o .env.example)
  const env = loadEnv(mode, import.meta.dirname, "");
  // Pasta do site na hospedagem: "/" (raiz do domínio) ou ex: "/pantanal/"
  const base = env.SITE_BASE || "/";

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
      },
    },
    envDir: path.resolve(import.meta.dirname),
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port: 3000,
      strictPort: false, // usa a próxima porta livre se a 3000 estiver ocupada
      host: true,
      proxy: {
        "/api": {
          target: API_HEMOGRAMA,
          changeOrigin: true,
          rewrite: (caminho) => caminho.replace(/^\/api/, ""),
        },
      },
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});

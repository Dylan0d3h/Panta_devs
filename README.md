# Projeto Pantanal e o Desenvolvimento Regional

Site do projeto do IFMS com a plataforma **Hemograma Ambiental** (queimadas, clima,
qualidade do ar e saúde respiratória).

| Pasta | O que é |
|---|---|
| `pantanaldev/` | O site (React + TypeScript). É o que vai para a hospedagem. |
| `emograma_api/` | Python: gera os dados de saúde do DATASUS (e uma API opcional). |
| `.github/workflows/publicar.yml` | Publicação automática: atualiza os dados e envia o site pelo FTP. |

- Como usar no computador: [COMO_USAR.md](COMO_USAR.md)
- Como ligar a publicação automática: [PUBLICAR_AUTOMATICO.md](PUBLICAR_AUTOMATICO.md)

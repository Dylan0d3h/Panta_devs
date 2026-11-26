# Publicação automática (GitHub Actions)

Depois de configurado, você não precisa rodar nada. O GitHub faz sozinho:

| Quando | O que acontece |
|---|---|
| Todo **dia 10** do mês | Baixa os dados de saúde do DATASUS, gera o site e envia para o FTP |
| Sempre que você **enviar uma alteração** do site para o GitHub | Gera o site e envia para o FTP |
| Todo dia (só se você ligar) | Atualiza a reserva de queimadas (só necessária se o INPE bloquear o site) |
| Quando você quiser | Aba **Actions** > *Atualizar e publicar o site* > **Run workflow** |

Os dados gerados ficam guardados no próprio repositório (pasta
`pantanaldev/client/public/dados`). Se o DATASUS estiver fora do ar, o site continua
publicado com os dados anteriores e o GitHub te avisa por e-mail.

## 1. Criar o repositório e enviar o projeto

O jeito mais fácil é com o **GitHub Desktop** (desktop.github.com):

1. Instale e entre com sua conta do GitHub.
2. **File > Add local repository**, escolha a pasta `projeto_pantanal`.
   Ele vai dizer que a pasta ainda não é um repositório: clique em **create a repository**
   e depois em **Create repository**.
3. Clique em **Publish repository**. Pode deixar **"Keep this code private"** marcado
   (repositório privado; a automação continua grátis para este uso).

> As pastas `node_modules`, `.venv` e `dist` não são enviadas (estão no `.gitignore`).
> O arquivo `pantanaldev/package-lock.json`, criado pelo `npm install`, **deve** ser enviado.

A partir daí, para mandar uma alteração: no GitHub Desktop, escreva um resumo em
"Summary", clique em **Commit to main** e depois em **Push origin**. O site é publicado
sozinho alguns minutos depois.

## 2. Informar os dados do FTP (uma vez só)

No site do GitHub, abra o repositório > **Settings** > **Secrets and variables** >
**Actions**.

Na aba **Secrets** (ficam escondidos, ninguém consegue ver depois), clique em
**New repository secret** e crie os três:

| Nome | Valor |
|---|---|
| `FTP_SERVIDOR` | o endereço do FTP (o mesmo do FileZilla, ex: `ftp.seusite.com.br`) |
| `FTP_USUARIO` | o usuário do FTP |
| `FTP_SENHA` | a senha do FTP |

Na aba **Variables**, clique em **New repository variable**:

| Nome | Valor | Obrigatória? |
|---|---|---|
| `FTP_PASTA` | a pasta do site no servidor, **com barra no final** (ex: `public_html/`). É a pasta onde o `index.html` deve ficar. | Sim |
| `ESTADOS` | estados da saúde, separados por espaço (padrão: `MS MT`) | Não |
| `QUEIMADAS_RESERVA` | `sim` para atualizar a reserva de queimadas todo dia | Não |
| `FTP_PROTOCOLO` | `ftps` se a hospedagem aceitar conexão segura (padrão: `ftp`) | Não |

> Dica: no FileZilla, a pasta onde você colocava os arquivos do site é a `FTP_PASTA`.

## 3. Primeira execução

Na aba **Actions** do repositório, clique em **Atualizar e publicar o site** > **Run
workflow** (deixe "Gerar de novo os dados de saúde" marcado) > **Run workflow**.

A primeira vez demora mais (de 10 a 30 minutos), porque baixa os dados do DATASUS.
Clicando na execução, dá para acompanhar cada etapa. Bolinha verde = site publicado.

## Se algo der errado

- **Erro na etapa "Enviar para o FTP"**: confira os secrets e a `FTP_PASTA`. Algumas
  hospedagens só aceitam `ftps` (crie a variável `FTP_PROTOCOLO`).
- **Erro na etapa "Gerar os dados"**: o DATASUS pode estar fora do ar. O site foi publicado
  com os dados anteriores; rode de novo mais tarde pelo **Run workflow**.
- Para mudar o dia da atualização mensal, edite a linha `cron` no arquivo
  `.github/workflows/publicar.yml`.

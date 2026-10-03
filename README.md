# Almeida Chat 2.0

Mensageiro web/Android com contas de usuário, login, perfil com foto, busca de usuários, contatos, conversas privadas e mensagens em tempo real via WebSocket. Não usa código de sala.

## Render
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- O servidor serve automaticamente a pasta `www`.

## GitHub
Envie o conteúdo deste projeto para o repositório. Não é necessário criar uma pasta `public`.

## Capacitor
O projeto mantém os arquivos do Capacitor. Depois de instalar as dependências, use `npx cap add android` (se ainda não houver Android) e `npx cap sync android`.


## Persistência das contas

O servidor salva contas, contatos, mensagens e sessões em `DATA_DIR/data.json`. No Render, o serviço deve usar o Persistent Disk montado em `/var/data` (já configurado em `render.yaml`). Sem armazenamento persistente, o Render pode apagar os arquivos ao reiniciar e não existe correção somente no aplicativo que consiga recuperar os dados do servidor.

A interface agora mostra `Conectando ao Linka` / `Aguarde alguns segundos` enquanto o servidor acorda e tenta reconectar automaticamente.

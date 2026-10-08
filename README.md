# Linka v44 — FCM real

Esta versão parte da v43 e usa Firebase Cloud Messaging (FCM) para notificações push do Linka.

## O que foi preparado

- Registro do token FCM de cada dispositivo no servidor.
- Firebase Admin SDK no servidor para enviar push.
- Service Worker `firebase-messaging-sw.js` para receber notificações em segundo plano.
- Notificações de novas mensagens, arquivos/mídia e chamadas.
- Clique na notificação abre o Linka e a conversa correspondente quando houver `chatId`.
- Tokens inválidos são removidos automaticamente.
- Botão **Testar notificação** dentro de Configurações > Notificações.
- O servidor mantém o histórico/contador de notificações do Linka.
- O sistema anterior de Web Push permanece no código histórico, mas o envio de notificações da v44 usa FCM.

## Configuração no Render

No serviço do Linka, abra **Environment** e configure:

### 1. Firebase Admin — obrigatório para o servidor enviar

Crie uma Service Account no seu projeto Firebase e coloque o JSON inteiro em uma variável chamada:

`FIREBASE_SERVICE_ACCOUNT_JSON`

Não coloque esse JSON dentro do GitHub. Ele contém credenciais privadas.

### 2. Configuração pública do Firebase Web

Preencha também:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_VAPID_KEY`

A chave VAPID usada pelo navegador é a **Web Push certificate key** do Firebase Cloud Messaging.

### 3. HTTPS

O FCM para Web precisa de HTTPS e de um Service Worker. O endereço HTTPS do Render atende essa parte.

## Como testar

1. Faça deploy da v44.
2. Abra o Linka pelo endereço HTTPS.
3. Entre na conta.
4. Abra **Configurações > Notificações**.
5. Toque em **Ativar notificações** e aceite a permissão do navegador.
6. Toque em **Testar notificação**.
7. Deixe o Linka em segundo plano e veja se o Android mostra a notificação.
8. Depois teste uma mensagem de outro usuário.

Se o botão de teste disser que o Firebase não está configurado, o problema está nas variáveis do Render, principalmente `FIREBASE_SERVICE_ACCOUNT_JSON` ou `FIREBASE_VAPID_KEY`.

## Segurança

Nunca publique no GitHub:

- Service Account JSON.
- Chave privada da Service Account.
- Senhas ou tokens de servidor.

As configurações públicas do Firebase Web podem ficar no cliente; a Service Account deve ficar somente como variável secreta no servidor.


## Otimização de memória v22
- Status com foto/vídeo novos são gravados em arquivo, não mantidos em base64 no banco em RAM.
- Removido backup local duplicado a cada gravação.
- Backup Supabase foi desacelerado e não cria uma cópia profunda inteira do banco antes de enviar.
- Arquivos de status expirados são limpos automaticamente.

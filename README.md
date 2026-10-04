# Linka 2.1 — FCM

Versão do Linka usando Firebase Cloud Messaging (FCM) para notificações web.

## Render
Configure estas variáveis:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FIREBASE_SERVICE_ACCOUNT_JSON` — JSON completo da Service Account do Firebase. Nunca coloque este valor no GitHub.
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_VAPID_KEY` — chave pública VAPID da configuração Web do Cloud Messaging.

O navegador registra `firebase-messaging-sw.js`, gera o token FCM e envia o token autenticado para o servidor. O servidor guarda os tokens no estado persistido do Supabase e usa Firebase Admin para enviar notificações.

## Firebase Web
No Firebase Console, registre um app Web no mesmo projeto e habilite/configure Cloud Messaging. Em Configurações do projeto > Cloud Messaging > Web Push certificates, gere ou use uma chave VAPID pública.

## Segurança
A Service Account é segredo de servidor. A configuração Web e a chave VAPID pública podem ser usadas no cliente, mas a chave privada da Service Account nunca deve ir para `www/` ou para o GitHub.


### Chamada de voz
A chamada usa WebRTC com STUN e TURN como fallback. O TURN público é usado apenas como fallback para redes que não permitem conexão P2P direta.

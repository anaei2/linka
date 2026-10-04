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


## Chamada por sala
A chamada agora usa uma sala de conexão: os dois participantes digitam o mesmo código (por padrão, **L**) antes da negociação WebRTC começar. O código é apenas uma etapa de sincronização; o áudio continua sendo WebRTC.


## Chamadas de voz
As chamadas usam o WebSocket seguro do próprio Linka para transportar áudio PCM em tempo real, além do código de sala. Isso evita depender de STUN/TURN e funciona na mesma conexão WSS usada pelo aplicativo.


## Chamada de vídeo
A versão inclui chamada de vídeo com WebRTC para vídeo e a transmissão de áudio já existente do Linka. A sinalização passa pelo WebSocket do próprio servidor e há STUN/TURN de fallback.


## Notificações de mensagens e chamadas
O servidor envia notificações FCM para novas mensagens e chamadas recebidas. Chamadas pendentes são reenviadas quando o Linka reconecta.


FCM: o navegador registra automaticamente o token após a primeira interação. Mensagens e chamadas usam push quando o Linka está em segundo plano/fechado.

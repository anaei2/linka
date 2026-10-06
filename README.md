# Linka — versão compatível com FreeWebToApk

Esta versão não usa Firebase Web Messaging/FCM no navegador. O Linka continua usando WebSocket para mensagens, chamadas e atualizações em tempo real.

## APK
Use a URL do servidor Linka no FreeWebToApk. Não é necessário colocar google-services.json para esta versão.

URL atual: https://linka-8llq.onrender.com/
Pacote sugerido: com.linka.chat

## Servidor
O servidor continua usando Supabase quando `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão configurados.

Notificações push externas estão desativadas nesta versão, conforme o objetivo do APK.

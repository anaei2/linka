# Linka v35 — chamadas estabilizadas

- Chamadas de áudio voltaram ao transporte de áudio por WebSocket/PCM do projeto, evitando dependência de ICE/TURN para voz.
- Chamadas de vídeo continuam em WebRTC.
- Vídeo agora informa falha de ICE/rede em vez de ficar indefinidamente em “Conectando”.
- Adicionado timeout visual para vídeo sem conexão.
- Limpeza de chamada e permissões continuam sendo encerradas ao desligar.

## Deploy
Use os mesmos arquivos do projeto no Render: `npm install` e `npm start`.

# Linka v32 — correção de chamadas

Correções principais:
- sinalização de chamadas com tentativa automática quando o WebSocket demora a ficar disponível;
- atendimento de chamadas de áudio mais robusto;
- chamada de vídeo com captura de câmera/microfone mais compatível com celulares;
- resolução de vídeo inicial reduzida para diminuir falhas e uso de dados/CPU;
- fallback automático de câmera/microfone para constraints simples;
- oferta/resposta WebRTC com envio confiável;
- tratamento melhor de ICE e reconexão de vídeo;
- encerramento correto de câmera, microfone e conexão WebRTC.

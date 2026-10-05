# Linka v37 — chamadas: contador e áudio aprimorados

Baseada na v36.

- Contador de duração de áudio e vídeo inicia uma única vez ao conectar e atualiza de forma mais confiável.
- Processamento de entrada com filtro passa-altas/baixas, compressor, cancelamento de eco, redução de ruído e gate para silêncio.
- Reprodução PCM com fila curta para evitar acúmulo de áudio atrasado, que pode soar como repetição.
- Limpeza do contador ao encerrar a chamada.

## Deploy
No Render: substitua os arquivos pelo conteúdo desta versão e faça um novo deploy.

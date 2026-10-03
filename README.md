# Linka — persistência no Render Free

Esta versão não depende de Persistent Disk. As contas, contatos, mensagens, sessões e configurações são armazenadas em uma tabela JSON no Supabase.

## 1. Criar o armazenamento

1. Abra o SQL Editor do seu projeto Supabase.
2. Cole o conteúdo de `supabase.sql`.
3. Execute.

## 2. Configurar o Render

No serviço `linka`, abra **Environment** e crie:

- `SUPABASE_URL` = URL do seu projeto Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` = chave secreta `service_role` do Supabase.

O `render.yaml` já declara essas variáveis como secretas (`sync: false`).

**Nunca coloque a `service_role` no HTML, JavaScript do navegador, GitHub público ou envie essa chave em conversa.**

## 3. Deploy

Faça commit/push destes arquivos e deixe o Render fazer o deploy.

Na primeira inicialização, se a tabela estiver vazia, o Linka usa os dados locais disponíveis e grava o estado no Supabase.

Depois disso, reiniciar o serviço ou o Render acordar o serviço não apaga as contas.

## 4. Manter conectado

O navegador já guarda `ac_token` no `localStorage` quando **Manter conectado neste dispositivo** está marcado. Como a sessão também fica no Supabase, o token continua válido depois de um reinício do Render.

## 5. Sem Supabase configurado

O projeto ainda funciona localmente usando `data.json`, mas no Render Free isso é temporário. Para persistência no Free, configure as duas variáveis do Supabase.

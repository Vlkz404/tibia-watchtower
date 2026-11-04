# Tibia Discord Bot

Base em JavaScript (ES modules), Node.js 22.12+ e discord.js 14.28.1. Inclui `/ping`, `/status`, configuração por ambiente e um serviço de notificações para integrar depois. A consulta do Tibia ainda não existe; iniciar o bot não dispara notificações.

## Preparar no Discord

1. Crie a aplicação no [Developer Portal](https://discord.com/developers/applications).
2. Em **Bot**, gere o token e coloque somente no `.env` local ou nos secrets da hospedagem. Não envie o token no chat.
3. Copie **Application ID** de **General Information** para `DISCORD_CLIENT_ID`.
4. Ative o Modo Desenvolvedor no Discord e copie o ID do servidor para `DISCORD_GUILD_ID`. IDs de canais e usuários vão nas listas correspondentes.
5. Em **Installation** ou **OAuth2 → URL Generator**, configure instalação no servidor com os escopos `bot` e `applications.commands`. Conceda **View Channels** e **Send Messages** nos canais escolhidos. Não precisa de Administrator ou intents privilegiadas nesta base. Para threads, conceda também Send Messages in Threads e acesso à thread.
6. Use o link gerado para instalar o bot no servidor configurado.

## Rodar localmente

```bash
cp .env.example .env
chmod 600 .env
# Edite o .env com seus dados antes de continuar.
npm ci
npm run check:env
npm run deploy:commands
npm start
```

`check:env` valida o formato sem autenticar ou imprimir credenciais. `deploy:commands` publica os comandos apenas no servidor configurado e substitui os comandos existentes dessa aplicação nesse servidor; execute de novo quando alterar os comandos. `npm run dev` ativa reinício ao editar o código. Variáveis já definidas no ambiente têm prioridade sobre o `.env`.

## Variáveis

| Variável | Uso |
| --- | --- |
| `DISCORD_TOKEN` | Token secreto do bot, obrigatório |
| `DISCORD_CLIENT_ID` | Application ID, obrigatório |
| `DISCORD_GUILD_ID` | Servidor autorizado, obrigatório |
| `DISCORD_CHANNEL_IDS` | Lista de canais separados por vírgula, opcional |
| `DISCORD_DM_ENABLED` | `true` ou `false`, padrão `false` |
| `DISCORD_DM_USER_IDS` | Lista de usuários que escolheram receber DMs; obrigatória quando DMs estiverem ativadas |

Mantenha IDs como texto. `.env` está ignorado pelo Git e excluído da imagem Docker. `.env.example` contém apenas campos vazios. Não registre o objeto de configuração em logs. `.env` não criptografa os segredos: na hospedagem, prefira o gerenciador de secrets. Se o token vazar, redefina-o no portal.

## Notificações futuras

`src/notifications.js` exporta `sendNotification(client, config, content)`. Ela envia somente aos destinos configurados, restringe canais ao servidor configurado, desativa menções automáticas e retorna sucesso/falha por destino. Uma DM bloqueada não interrompe os demais envios. Ativar DMs no ambiente apenas habilita o serviço; o monitor ainda precisará chamá-lo. Não há retentativa automática nesta base.

## Hospedagem

Use um processo contínuo/worker com conexão de saída HTTPS/WebSocket para o Discord. Esta base não abre porta HTTP e não precisa de domínio. Configure os mesmos nomes de variáveis nos secrets da plataforma e execute `npm ci` e `npm start`. Publique os comandos uma vez com `npm run deploy:commands`. Mantenha apenas uma instância para evitar envios duplicados quando o monitor for adicionado.

Com Docker e Compose instalados, após preencher o `.env`:

```bash
docker compose build
docker compose run --rm bot node src/deploy-commands.js
docker compose up -d
docker compose logs -f --tail=50
```

O contêiner roda sem root, recebe o ambiente em runtime, encerra a conexão com SIGTERM e tem rotação de logs. O Dockerfile depende do `package-lock.json` versionado. Para parar: `docker compose down`.

## Verificar

```bash
npm test
```

Os testes usam objetos simulados para validar configuração, isolamento de falhas e restrições de envio. Para validar de ponta a ponta, preencha as credenciais, publique os comandos, inicie o bot e execute `/ping` e `/status` no servidor. Ainda falta definir qual status do Tibia será monitorado, frequência de consulta e regra de mudança que gerará os alertas.

Referências: [discord.js](https://discord.js.org/docs/packages/discord.js/14.28.1) e [documentação oficial do Discord](https://discord.com/developers/docs/quick-start/getting-started).

<div align="center">

# 🏰 Tibia Watchtower

**Player and guild monitoring, right inside Discord.**<br>
**Monitoramento de jogadores e guilds direto no Discord.**

![Node.js](https://img.shields.io/badge/Node.js-22.12%2B-5FA04E?logo=nodedotjs&logoColor=white)
![discord.js](https://img.shields.io/badge/discord.js-14-5865F2?logo=discord&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?logo=javascript&logoColor=black)

[English](#english) · [Português BR](#portugues-br)

</div>

---

<a id="english"></a>

## English

Tibia Watchtower monitors public Tibia character and guild data and sends configurable Discord alerts. Manage it through a private dashboard with buttons, custom emojis, and dropdowns only when a list needs a selection. All bot messages and source comments are in English; this README is bilingual.

### Features

| Feature | Included |
| --- | --- |
| Player tracking | Up to 25 characters across different worlds, online/offline state, available Last Login, and recent transitions |
| Guild tracking | Up to 25 guilds, member lists, 20 members per page, and online/offline filters |
| Query methods | TibiaData v5 JSON or direct official HTML, selectable in the dashboard |
| Notifications | Configured server channels and individually opted-in DMs |
| Delivery tests | Status or a custom message, sent to configured channels or only the caller's DM |
| Persistence | Settings, subscriptions, rosters, and the last 100 transitions per target |
| Access control | Owner/moderator settings and owner/Administrator delivery tests |
| Protection | Instance locks, interaction and delivery limits, credential checks, and emergency stop |
| Appearance | Compact status cards, custom server emojis, and a discreet **Made by VLKZ** footer |

Themes are not implemented. Detection times are approximate and depend on polling and source caches.

### Requirements and Discord setup

- Node.js **22.12+** and npm; or Docker with Compose.
- A bot application from the [Discord Developer Portal](https://discord.com/developers/applications).
- Persistent writable storage for settings and history.

Create the application, obtain its bot token, and copy the Application ID. Enable Developer Mode in Discord to copy your user ID and server ID. Install the application with the `bot` and `applications.commands` scopes. Grant **View Channels** and **Send Messages** in notification channels. The bot does not need Administrator or privileged gateway intents; it uses the Guilds intent and REST for individual membership checks.

### Installation

```bash
git clone https://github.com/Vlkz404/tibia-watchtower.git
cd tibia-watchtower
npm ci
cp .env.example .env
chmod 600 .env
```

Fill in `.env` locally, then run:

```bash
npm run check:env
npm run deploy:commands
npm start
```

Never share or commit the bot token. Register commands again whenever their definitions change; registration replaces this application's commands in the configured server. Existing environment variables take precedence over `.env`. Use `npm run dev` for automatic restarts while editing.

### Environment

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN` | Secret bot token; required |
| `DISCORD_CLIENT_ID` | Application ID; required |
| `DISCORD_GUILD_ID` | Authorized Discord server ID; required |
| `DISCORD_OWNER_ID` | Bot owner's Discord user ID; required |
| `DATA_DIR` | Optional storage directory; defaults to `data/` in the project |

Destinations, tracked targets, source selection, emojis, and subscriptions are configured through the dashboard. Legacy `DISCORD_CHANNEL_IDS`, `DISCORD_DM_ENABLED`, and `DISCORD_DM_USER_IDS` are no longer used. Existing users are not automatically subscribed to DMs.

### Commands and dashboard

| Command | Action |
| --- | --- |
| `/dashboard` | Opens settings; ordinary members see their own DM subscription |
| `/status` | Summarizes tracked players and guilds |
| `/player name:Character` | Shows a tracked player's details; without a name, shows the only player or a summary |
| `/notifications action:enable` | Opts the caller in to DM alerts |
| `/notifications action:disable` | Opts the caller out of DM alerts |
| `/notifications action:status` | Shows the caller's subscription |
| `/ping` | Checks whether the bot responds |

Open a new dashboard after updating the bot; older messages may contain obsolete controls. The dashboard is ephemeral and shows a snapshot: use Refresh to see recent changes.

- **Overview:** counts, notification state, and targets with query errors.
- **Alerts:** master switch, channel/DM switches, online/offline event filters, and latest delivery result.
- **Monitoring → Players:** add names or official character URLs, one per line; inspect state, timestamps, and recent history.
- **Monitoring → Guilds:** add names or official guild URLs, one per line; browse complete rosters with filters and pagination.
- **Monitoring → Query method:** choose TibiaData or official HTML. Only HTML exposes a polling interval control.
- **My DMs:** opt in or out personally. Discord privacy settings can prevent delivery.
- **Settings:** channels, custom emojis, and restricted delivery tests and security controls.

Choosing channels replaces the entire destination list. Duplicate target names are ignored; removing a target requires confirmation and removes its stored history. Notification DMs require both the server's DM/master switches and the recipient's personal opt-in. Mentions are disabled.

For custom emojis, select an icon key and provide the server emoji ID or `<:name:id>`. Supported keys are `home`, `notifications`, `channels`, `monitor`, `dm`, `emojis`, `online`, and `offline`. The emoji must be available without role restrictions. Use `reset` for a single icon or restore defaults for all icons. Discord determines the footer's font and gray styling.

### Permissions and manual tests

| Action | Authorized users |
| --- | --- |
| Configure targets, sources, destinations, and alerts | Owner, Administrator, Manage Server, or Moderate Members |
| Send tests, edit the test message, or trigger emergency stop | Owner or Administrator only |
| Change a personal DM subscription | The member themselves |

Every component and modal submission checks authorization again. A moderator without Administrator cannot execute test controls through a forged interaction.

Under **Settings → Delivery tests**, choose status or a custom message and either configured channels or your own DM. Tests are explicitly marked **TEST**, bypass general alert switches, and do not create real status transitions or subscribe anyone. They share outbound limits and have a 30-second test cooldown. No test sends DMs to all subscribers. The panel reports successful and failed deliveries.

### How status detection works

**TibiaData**, the default, returns JSON collected from Tibia data sources. A character record may omit `status` and `last_login`: the bot verifies the complete world online list and searches for the character's name. Guild queries use validated `members[].status` values. Missing Last Login does not prevent offline detection.

The implementation follows the documented caches: **world 60s**, **guild 120s**, **character 300s**. World requests are shared across players in the same world; character and guild responses have separate caches. Refresh respects these caches. There is no adjustable TibiaData interval.

**Official HTML** queries character details using POST and the world online list using GET. Guilds use their complete official member page with `onlyshowonline=0`. An empty guild status means offline only within a complete, recognized member row under the Status column. Missing pages, columns, incomplete lists, and HTTP failures are query errors. HTML uses a configurable interval of **60–900s** and may be blocked with HTTP 403.

A character's Last Login is displayed separately and does not by itself imply online/offline. CET/CEST dates are converted to UTC; Discord timestamps display in the viewer's local time. Source sample timestamps are recorded; outdated or inconsistent API snapshots are rejected.

The first sample and the first sample after changing sources are silent baselines. Newly listed guild members also start silently; leaving a guild is not treated as logout. Individual player observations take priority over overlapping guild observations to avoid duplicate alerts in a cycle. Grouped alerts may summarize large batches; each target retains its latest 100 events.

### Search configuration and code layout

| File | Responsibility |
| --- | --- |
| `config/tibia.js` | Default source, URLs, methods, query/form fields, timeouts, size limits, and resource caches |
| `src/search-request.js` | HTTP execution and safe parameter encoding |
| `src/tibia.js` | Official HTML parsing and name/URL validation |
| `src/tibiadata.js` | TibiaData JSON validation |
| `src/search-service.js` | Shared requests and per-resource caching |
| `src/monitor.js` | Observations, transitions, grouped alerts, and manual tests |
| `src/dashboard.js` | Views, components, forms, and authorization |
| `src/store.js` | Atomic settings persistence and migration |
| `src/instance-lock.js` / `src/security.js` | Instance ownership, credential checks, and abuse limits |

To change a URL or GET/POST fields, edit `config/tibia.js`; the executor safely substitutes `{name}`, `{world}`, and `{guild}`. Changing the response structure can still require parser changes. Only HTTPS on `www.tibia.com` and `api.tibiadata.com` is allowed; redirects are not followed. User URLs provide target names, not arbitrary request endpoints. Dashboard source selection overrides the default for existing settings.

### Persistence, restarts, and limits

`data/settings.json` is replaced atomically and stores preferences and observations. Version 1 is migrated with a `settings.v1.backup.json` copy. Stop the old process before the first upgrade with locking. Keep backups, do not edit live settings, and use a persistent volume.

On restart, the monitor reads persisted state and compares new valid observations with the previous ones. It cannot reconstruct complete sessions during downtime or between polls. Query failures preserve the previous state and mark data as possibly outdated. Pausing alerts keeps queries running; pausing monitoring stops queries.

Transitions are persisted before deliveries. **There is no persistent retry queue:** a crash between saving and sending, or a failed/limited delivery, can lose an alert. These protections do not guarantee exactly-once delivery. Check the latest delivery result in Alerts.

### Security

- Instance lock per Application ID in the same user's temporary environment and a second lock for the data directory. Separate hosts/containers must share the same data volume to coordinate writers.
- Lock renewal every **10s**, considered stale after **30s** without renewal. Detected lock loss stops queries and blocks deliveries and writes. Do not manually remove an active lock.
- Up to **5 interactions/user/10s**, **60 total/10s**, and **20 concurrent interactions**. Authorized emergency stop remains accessible during bursts.
- Up to **120 outbound messages/min**, **3/channel/min**, and **2/DM recipient/min**. Blocked sends are counted as failures, including tests.
- **Settings → Security → Stop monitoring and alerts** disables monitoring and automatic destinations, retaining settings and history. Re-enable the desired switches to resume. Explicit manual tests still use their own permissions and limits.
- `.env` is excluded from Git, npm packages, and Docker context. Runtime secrets are omitted from normal configuration serialization and raw exception payloads are not logged. Known credentials and token formats are rejected in outgoing notifications and persisted data.

Run `npm run security:check` before committing or publishing. It also runs before `npm pack`, reports filenames without secret contents, and excludes runtime secrets, data, dependencies, and logs. Review staged files as well.

A local lock cannot stop an attacker using a stolen token in different code or another environment. Reset an exposed token in the Developer Portal. A compromised host/account can expose process secrets; no application can promise absolute token secrecy. These controls protect the bot's commands and deliveries; the bot does not moderate server joins.

### Docker and deployment

Use one continuously running worker with outbound HTTPS/WebSocket access. No HTTP port or domain is required. Set application secrets and mount persistent storage; avoid multiple replicas with separate data volumes.

```bash
docker compose build
docker compose run --rm bot node src/deploy-commands.js
docker compose up -d
docker compose logs -f --tail=50
```

The container runs as a non-root user, uses a read-only filesystem, a memory-backed `/tmp`, and the `bot-data` volume at `/app/data`. Compose restarts the process unless stopped. The host and Docker service must be available. `docker compose down` preserves data; **`down -v` deletes the volume**. Rebuild the image after code or search configuration changes.

### Verification and troubleshooting

```bash
npm test
npm run check:env
npm run security:check
```

Automated tests use simulated requests/deliveries for authorization, migration, cache behavior, parsing, transitions, deduplication, pagination, locks, and security limits. They do not log in to Discord or send real alerts. Verify the real dashboard after registering commands and restarting the bot.

| Symptom | Check |
| --- | --- |
| Commands do not appear | Correct server/Application ID, registration command, and installation scopes |
| No alert on first query | First samples establish a silent baseline |
| DM fails | Personal opt-in, server switches, server membership, and Discord privacy |
| Status remains unchanged | Source cache, last successful query, and source error shown in details |
| HTML returns 403 | Select TibiaData; HTML access is not guaranteed |
| Another instance detected | Stop duplicate processes; after an abrupt exit, allow up to 30s for lock expiry |
| Settings fail to load | Check volume access and JSON integrity; do not overwrite the only backup |

---

<a id="portugues-br"></a>

## Português BR

O Tibia Watchtower acompanha dados públicos de personagens e guilds do Tibia e envia alertas configuráveis no Discord. A dashboard privada usa botões, emojis personalizados e dropdowns quando é necessário escolher itens de uma lista. Os textos do bot e os comentários do código ficam em inglês; este README é bilíngue.

### Funcionalidades

| Recurso | O que inclui |
| --- | --- |
| Jogadores | Até 25 personagens de diferentes mundos, online/offline, Last Login disponível e transições recentes |
| Guilds | Até 25 guilds, listas de membros com 20 por página e filtros online/offline |
| Métodos de consulta | JSON do TibiaData v5 ou HTML oficial, selecionáveis pela dashboard |
| Notificações | Canais escolhidos e DMs com adesão individual |
| Testes de envio | Status ou mensagem personalizada para os canais ou somente a DM do solicitante |
| Persistência | Preferências, adesões, membros e as últimas 100 transições por alvo |
| Permissões | Configurações para dono/moderação; testes para dono/Administrador |
| Proteções | Travas de instância, limites de uso/envio, bloqueio de credenciais e parada de emergência |
| Visual | Cards compactos, emojis do servidor e rodapé discreto **Made by VLKZ** |

Temas não estão implementados. Os horários são detecções aproximadas e dependem das consultas e do cache da fonte.

### Requisitos e preparação no Discord

- Node.js **22.12+** e npm; ou Docker com Compose.
- Uma aplicação de bot no [Developer Portal do Discord](https://discord.com/developers/applications).
- Armazenamento persistente com permissão de escrita para configurações e histórico.

Crie a aplicação, obtenha o token do bot e copie o Application ID. Ative o Modo Desenvolvedor do Discord para copiar seu ID de usuário e o ID do servidor. Instale com os escopos `bot` e `applications.commands`. Conceda **Ver canais** e **Enviar mensagens** nos canais de destino. O bot não exige Administrador nem intents privilegiadas: usa o intent Guilds e REST para verificar membros individualmente.

### Instalação

```bash
git clone https://github.com/Vlkz404/tibia-watchtower.git
cd tibia-watchtower
npm ci
cp .env.example .env
chmod 600 .env
```

Preencha o `.env` local e execute:

```bash
npm run check:env
npm run deploy:commands
npm start
```

Não compartilhe nem versione o token. Registre os comandos novamente quando suas definições mudarem; o registro substitui os comandos dessa aplicação no servidor configurado. Variáveis já definidas no ambiente têm prioridade sobre o `.env`. Use `npm run dev` para reiniciar automaticamente durante a edição.

### Variáveis de ambiente

| Variável | Finalidade |
| --- | --- |
| `DISCORD_TOKEN` | Token secreto do bot; obrigatório |
| `DISCORD_CLIENT_ID` | Application ID; obrigatório |
| `DISCORD_GUILD_ID` | ID do servidor autorizado; obrigatório |
| `DISCORD_OWNER_ID` | ID Discord do dono do bot; obrigatório |
| `DATA_DIR` | Diretório opcional de persistência; padrão `data/` no projeto |

Destinos, alvos, fonte, emojis e adesões são configurados na dashboard. As variáveis antigas `DISCORD_CHANNEL_IDS`, `DISCORD_DM_ENABLED` e `DISCORD_DM_USER_IDS` não são utilizadas. Não há adesão automática de usuários às DMs.

### Comandos e dashboard

| Comando | Ação |
| --- | --- |
| `/dashboard` | Abre as configurações; membros comuns veem apenas suas próprias DMs |
| `/status` | Resume os jogadores e guilds acompanhados |
| `/player name:Personagem` | Mostra um jogador cadastrado; sem nome, mostra o único jogador ou um resumo |
| `/notifications action:enable` | Ativa a própria adesão a DMs |
| `/notifications action:disable` | Cancela a própria adesão |
| `/notifications action:status` | Mostra a própria adesão |
| `/ping` | Verifica se o bot responde |

Abra uma dashboard nova após atualizar o bot: mensagens antigas podem ter controles obsoletos. As telas são privadas e representam uma amostra dos dados; use Refresh para atualizar a exibição.

- **Overview:** totais, estado das notificações e alvos com erros de consulta.
- **Alerts:** chave geral, canais/DMs, filtros de entrada/saída e resultado da última entrega.
- **Monitoring → Players:** nomes ou URLs oficiais, um por linha; estado, horários e histórico recente.
- **Monitoring → Guilds:** nomes ou URLs oficiais, um por linha; membros com filtros e paginação.
- **Monitoring → Query method:** TibiaData ou HTML oficial. Somente o HTML mostra ajuste de intervalo.
- **My DMs:** adesão ou cancelamento individual. A privacidade do Discord pode impedir a entrega.
- **Settings:** canais, emojis e controles restritos de testes e segurança.

Escolher canais substitui toda a lista anterior. Alvos duplicados são ignorados; remover um alvo exige confirmação e remove seu histórico salvo. DMs automáticas exigem chave geral, chave de DMs e adesão pessoal. Menções automáticas são desativadas.

Para emojis, selecione uma chave e informe o ID ou `<:nome:id>` de um emoji do servidor, disponível sem restrição de cargos. Chaves: `home`, `notifications`, `channels`, `monitor`, `dm`, `emojis`, `online` e `offline`. Use `reset` para um ícone ou restaure todos os padrões. A fonte e a cor cinza do rodapé são definidas pelo Discord.

### Permissões e testes manuais

| Ação | Quem pode |
| --- | --- |
| Configurar alvos, fontes, destinos e alertas | Dono, Administrador, Gerenciar Servidor ou Moderar Membros |
| Enviar testes, editar sua mensagem ou usar a parada de emergência | Somente dono ou Administrador |
| Alterar a adesão pessoal a DMs | O próprio membro |

Cada clique e envio de formulário verifica a autorização novamente. Moderadores sem Administrador não conseguem executar testes por uma interação forjada.

Em **Settings → Delivery tests**, escolha status ou mensagem personalizada para os canais configurados ou sua própria DM. Os envios são marcados como **TEST**, ignoram as chaves gerais, não geram transições reais nem inscrevem pessoas. Respeitam os limites de saída e um intervalo de 30 segundos entre testes. Nenhum teste envia DMs para todos os inscritos. O painel mostra sucessos e falhas.

### Como a consulta funciona

O **TibiaData**, fonte padrão, fornece JSON com dados do Tibia. A ficha pode não ter `status` ou `last_login`: o bot verifica a lista completa de jogadores online do mundo e procura o nome. Guilds usam os valores validados de `members[].status`. Last Login ausente não impede detectar offline.

O bot respeita os caches documentados: **mundo 60s**, **guild 120s**, **personagem 300s**. Jogadores do mesmo mundo compartilham a consulta do mundo; fichas e guilds têm caches separados. Refresh respeita esses caches. Não há intervalo ajustável para TibiaData.

O **HTML oficial** consulta a ficha do personagem por POST e a lista online do mundo por GET. Guilds usam a página completa de membros com `onlyshowonline=0`. Status vazio só representa offline numa linha completa e reconhecida sob a coluna Status. Página/coluna ausente, lista incompleta ou erro HTTP são falhas de consulta. O intervalo do HTML é ajustável entre **60–900s**, e o acesso pode ser bloqueado com HTTP 403.

Last Login é exibido separadamente e não determina sozinho se a pessoa está online. Datas CET/CEST são convertidas para UTC; os timestamps do Discord aparecem no horário local de quem lê. O horário da amostra é registrado e respostas antigas ou inconsistentes da API são rejeitadas.

A primeira amostra e a primeira após trocar de fonte são referências silenciosas. Novos membros de guild também começam sem alerta; sair da guild não representa logout. Observações individuais têm prioridade sobre as da guild para evitar alertas duplicados no mesmo ciclo. Lotes grandes podem ser resumidos; cada alvo guarda os últimos 100 eventos.

### Configuração da pesquisa e organização

| Arquivo | Responsabilidade |
| --- | --- |
| `config/tibia.js` | Fonte padrão, URLs, métodos, query/form, timeout, limite de resposta e caches |
| `src/search-request.js` | Execução HTTP e codificação segura de parâmetros |
| `src/tibia.js` | Leitura do HTML e validação de nomes/URLs |
| `src/tibiadata.js` | Validação do JSON do TibiaData |
| `src/search-service.js` | Compartilhamento e cache por recurso |
| `src/monitor.js` | Amostras, transições, alertas agrupados e testes manuais |
| `src/dashboard.js` | Telas, componentes, formulários e autorização |
| `src/store.js` | Persistência atômica e migração |
| `src/instance-lock.js` / `src/security.js` | Travas, verificações de credenciais e limites contra abuso |

Para mudar URL ou parâmetros GET/POST, altere `config/tibia.js`: o executor substitui `{name}`, `{world}` e `{guild}` com codificação segura. Mudanças na estrutura da resposta podem exigir ajustes no parser. Só são aceitos HTTPS em `www.tibia.com` e `api.tibiadata.com`, sem seguir redirecionamentos. URLs fornecidas pelo usuário servem para extrair nomes, não para definir endpoints arbitrários. A fonte salva na dashboard tem prioridade sobre o padrão do arquivo.

### Persistência, reinícios e limites

O arquivo `data/settings.json` é substituído atomicamente e guarda preferências e observações. A versão 1 é migrada com cópia em `settings.v1.backup.json`. Pare o processo antigo antes da primeira atualização com trava. Faça backups, não edite os dados em uso e mantenha volume persistente.

Ao reiniciar, o monitor lê o último estado e o compara com novas consultas válidas. Não reconstrói sessões completas durante a queda ou entre consultas. Erros preservam o estado anterior e indicam possível desatualização. Pausar alertas mantém as consultas; pausar o monitor interrompe as consultas.

As transições são gravadas antes dos envios. **Não há fila persistente de retentativas:** uma queda entre gravação e envio, falha ou bloqueio por limite pode perder um alerta. As proteções não garantem entrega exatamente uma vez. O último resultado de envio aparece em Alerts.

### Segurança

- Trava por Application ID no diretório temporário do mesmo usuário/ambiente e uma segunda trava no diretório de dados. Hosts/contêineres separados precisam compartilhar o volume de dados para coordenar a escrita.
- Renovação a cada **10s**, expiração após **30s** sem renovação. A perda detectada da trava encerra consultas e bloqueia envios/gravações. Não remova uma trava ativa manualmente.
- Até **5 interações/usuário/10s**, **60 no total/10s** e **20 interações simultâneas**. A parada de emergência autorizada continua acessível durante rajadas.
- Até **120 mensagens/min**, **3/canal/min** e **2/destinatário de DM/min**. Envios bloqueados contam como falha, inclusive nos testes.
- **Settings → Security → Stop monitoring and alerts** desliga consultas e destinos automáticos, preservando dados. Reative as opções desejadas para retomar. Testes manuais explícitos continuam com suas permissões e limites próprios.
- `.env` é excluído de Git, pacotes npm e contexto Docker. O token não entra na serialização normal da configuração e erros brutos não são registrados. Credenciais conhecidas e formatos de token são rejeitados em notificações e dados persistidos.

Execute `npm run security:check` antes de commitar ou publicar. A verificação também roda antes de `npm pack`, informa arquivos sem exibir segredos e exclui ambiente, dados, dependências e logs. Revise também o conteúdo preparado para commit.

A trava local não impede alguém de usar um token roubado em outro código/ambiente. Se vazar, redefina o token no Developer Portal. Uma host ou conta comprometida pode expor segredos do processo: não existe garantia absoluta de sigilo. Essas proteções cobrem comandos e envios do bot; ele não modera entradas no servidor.

### Docker e hospedagem

Use um worker contínuo com saída HTTPS/WebSocket. Não precisa de porta HTTP ou domínio. Configure secrets e armazenamento persistente; evite réplicas com volumes separados.

```bash
docker compose build
docker compose run --rm bot node src/deploy-commands.js
docker compose up -d
docker compose logs -f --tail=50
```

O contêiner roda sem root, com sistema de arquivos somente leitura, `/tmp` em memória e volume `bot-data` em `/app/data`. O Compose reinicia o processo salvo quando parado; a host e o serviço Docker precisam estar disponíveis. `docker compose down` preserva os dados; **`down -v` apaga o volume**. Reconstrua a imagem após mudar código ou configuração da pesquisa.

### Verificação e diagnóstico

```bash
npm test
npm run check:env
npm run security:check
```

Os testes automatizados simulam consultas/envios para verificar permissões, migração, cache, parsing, transições, deduplicação, paginação, travas e limites. Não autenticam no Discord nem enviam alertas reais. Confira a dashboard real depois de registrar os comandos e reiniciar o bot.

| Sintoma | O que conferir |
| --- | --- |
| Comandos não aparecem | IDs do servidor/aplicação, registro dos comandos e escopos da instalação |
| Nenhum alerta na primeira consulta | A primeira amostra é uma referência silenciosa |
| DM falha | Adesão pessoal, chaves do servidor, participação no servidor e privacidade do Discord |
| Status não muda | Cache, última consulta bem-sucedida e erro exibido nos detalhes |
| HTML retorna 403 | Selecione TibiaData; acesso ao HTML não é garantido |
| Outra instância detectada | Pare processos duplicados; depois de queda brusca, aguarde até 30s |
| Configurações não carregam | Acesso ao volume e integridade do JSON; preserve uma cópia do backup |

---

### References / Referências

[TibiaData API](https://tibiadata.com/docs/) · [TibiaData caching FAQ](https://tibiadata.com/faq/) · [Discord Developer Portal](https://discord.com/developers/applications) · [discord.js](https://discord.js.org/docs/packages/discord.js/14.28.1)

<div align="center">
<sub>Made by VLKZ · Independent project; not affiliated with CipSoft. / Projeto independente, sem vínculo com a CipSoft.</sub>
</div>

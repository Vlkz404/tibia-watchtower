# Tibia Discord Bot

A JavaScript foundation using ES modules, Node.js 22.12+, and discord.js 14.28.1. Includes `/ping`, `/status`, environment-based configuration, and a notification service for future integration. Tibia monitoring is not implemented yet; starting the bot does not send notifications.

## Discord setup

1. Create an application in the [Developer Portal](https://discord.com/developers/applications).
2. Under **Bot**, generate a token and store it only in your local `.env` or your hosting provider's secrets manager. Do not share the token in chat.
3. Copy the **Application ID** from **General Information** into `DISCORD_CLIENT_ID`.
4. Enable Developer Mode in Discord and copy the server ID into `DISCORD_GUILD_ID`. Add channel and user IDs to their respective lists.
5. Under **Installation** or **OAuth2 → URL Generator**, configure a server installation with the `bot` and `applications.commands` scopes. Grant **View Channels** and **Send Messages** in the selected channels. This foundation does not require Administrator or privileged intents. For threads, also grant **Send Messages in Threads** and access to the thread.
6. Use the generated link to install the bot in the configured server.

## Run locally

```bash
cp .env.example .env
chmod 600 .env
# Fill in your local configuration before continuing.
npm ci
npm run check:env
npm run deploy:commands
npm start
```

`check:env` validates the configuration format without authenticating or printing credentials. `deploy:commands` registers commands only in the configured server and replaces that application's existing commands there; run it again when commands change. `npm run dev` restarts the bot when source files change. Existing environment variables take precedence over `.env` values.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN` | Secret bot token; required |
| `DISCORD_CLIENT_ID` | Application ID; required |
| `DISCORD_GUILD_ID` | Authorized server ID; required |
| `DISCORD_CHANNEL_IDS` | Optional comma-separated channel IDs |
| `DISCORD_DM_ENABLED` | `true` or `false`; defaults to `false` |
| `DISCORD_DM_USER_IDS` | Users who opted in to DMs; required when DMs are enabled |

Keep IDs as strings. `.env` is ignored by Git and excluded from the Docker image. `.env.example` contains placeholders and safe defaults. Do not log the configuration object. `.env` does not encrypt secrets: use your hosting provider's secrets manager in production. If the token is exposed, reset it in the Developer Portal.

## Dashboard

Run `/dashboard` for server settings. The owner or moderators can configure notifications and channels; members manage only their own DM subscription. Configure `DISCORD_OWNER_ID` in the environment. Preferences persist in `data/settings.json`; legacy destination environment variables are no longer used. Tibia monitoring will be connected in a following step.

## Future notifications

`src/notifications.js` exports `sendNotification(client, config, content)`. It sends only to configured destinations, restricts channels to the configured server, disables automatic mentions, and returns a success/failure result for each destination. A blocked DM does not interrupt other deliveries. Enabling DMs in the environment only enables the service; the future monitor must still call it. This foundation does not retry failed deliveries automatically.

## Hosting

Use a continuously running process or worker with outbound HTTPS/WebSocket access to Discord. This foundation does not open an HTTP port or require a domain. Configure the same environment variables in your hosting provider's secrets manager, then run `npm ci` and `npm start`. Register commands once with `npm run deploy:commands`. Run only one instance to avoid duplicate deliveries when monitoring is added.

With Docker and Compose installed, after configuring `.env`:

```bash
docker compose build
docker compose run --rm bot node src/deploy-commands.js
docker compose up -d
docker compose logs -f --tail=50
```

The container runs as a non-root user, receives environment variables at runtime, closes the connection on SIGTERM, and rotates logs. The Dockerfile requires the committed `package-lock.json`. To stop it, run `docker compose down`.

## Verification

```bash
npm test
```

Tests use simulated objects to verify configuration validation, failure isolation, and delivery restrictions. For end-to-end validation, provide credentials, register commands, start the bot, and run `/ping` and `/status` in the server. The Tibia status to monitor, polling frequency, and alert conditions still need to be defined.

References: [discord.js](https://discord.js.org/docs/packages/discord.js/14.28.1) and the [official Discord documentation](https://discord.com/developers/docs/quick-start/getting-started).

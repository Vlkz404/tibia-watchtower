# Tibia Watchtower

Discord monitoring for multiple Tibia players and guilds, with persistent settings, channel alerts, and opt-in DMs.

Run `npm ci`, configure `.env` using `.env.example`, register commands with `npm run deploy:commands`, then run `npm start`.

Use `/dashboard` to manage up to 25 players and 25 guilds. Guild rosters have online/offline filters and pagination. Select HTML or TibiaData as your data source. API caches are automatic; only HTML has an adjustable interval. Source errors preserve the last successful state.

The owner or moderators manage server settings. Only the owner or Administrator can run delivery tests, including a custom message sent to configured channels or the caller's DM. Each user manages their own DM subscription with `/notifications`.

Settings and the last 100 events per target persist in `data/settings.json`. v1 settings are migrated automatically with a backup. The first sample is silent, guild membership changes are not treated as logouts, and overlapping player/guild targets do not duplicate the same alert in a cycle.

`npm test` verifies the implementation with simulated requests and deliveries. Live availability and cache freshness depend on the source; HTML requests may receive HTTP 403. Detection times are approximate. There is no persistent retry queue.

Status and dashboard views use compact embeds, muted styling, clickable official character/guild titles, and a discreet `Made by VLKZ` footer.

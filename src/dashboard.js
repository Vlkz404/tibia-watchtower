import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, EmbedBuilder,
  MessageFlags, ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { characterName, guildName, TibiaError, sameName } from './tibia.js';
import { playerTarget, guildTarget } from './store.js';
import { playerText, statusText, timestamp } from './monitor.js';
import { icons, icon, iconText } from './icons.js';
import { SecurityError } from './security.js';
import { interactionErrorDetails } from './diagnostics.js';
import { translator, languages, errorText } from './i18n.js';

export const canTest = (i, c) => i.user.id === c.ownerId || Boolean(i.memberPermissions?.has(PermissionFlagsBits.Administrator));
export const canManage = (i, c) => canTest(i, c) || Boolean(i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || i.memberPermissions?.has(PermissionFlagsBits.ModerateMembers));
const row = (...items) => new ActionRowBuilder().addComponents(...items);
const button = (id, label, active = false, emoji) => {
  const b = new ButtonBuilder().setCustomId(`dash:${id}`).setLabel(label).setStyle(active ? ButtonStyle.Primary : ButtonStyle.Secondary);
  return emoji ? b.setEmoji(emoji) : b;
};
const mark = (status) => status === 'online' ? '🟢' : status === 'offline' ? '🔴' : '⚪';
const baseEmbed = (title) => new EmbedBuilder().setColor(0x2b2d31).setTitle(title).setFooter({ text: 'Made by VLKZ' });

export function renderStatus(settings, id) {
  const tr = translator(settings);
  const target = settings.players.find((p) => p.id === id || (id && sameName(p.name, id))) || (!id && settings.players.length === 1 ? settings.players[0] : null);
  const embed = baseEmbed(target ? `${mark(target.monitor.status)} ${target.name}` : tr('Monitoring'));
  embed.setDescription(target ? playerText(target, settings) : statusText(settings));
  if (target) embed.setURL(`https://www.tibia.com/community/?subtopic=characters&name=${encodeURIComponent(target.name)}`);
  return { embeds: [embed], allowedMentions: { parse: [] } };
}

const parentPage = (section) => ({ notifications: 'home', monitor: 'home', dm: 'home', settings: 'home', players: 'monitor', guilds: 'monitor', player: 'players', guild: 'guilds', methods: 'settings', channels: 'settings', emojis: 'settings', tests: 'settings', security: 'settings', language: 'settings' }[section] || 'home');
const categoryFor = (section) => ['players', 'player', 'guilds', 'guild'].includes(section) ? 'monitor' : ['methods', 'channels', 'emojis', 'tests', 'security', 'language'].includes(section) ? 'settings' : section;

export function renderDashboard(s, userId, manage, page = 'home', notice = '', admin = false) {
  const tr = translator(s);
  const enabled = (value) => tr(value ? 'Enabled' : 'Disabled');
  if (!manage && !['home', 'dm'].includes(page)) page = 'dm';
  const [section, id, rawPage, rawFilter] = page.split(':');
  const embed = baseEmbed(tr('Dashboard'));
  const categories = manage
    ? [['home', 'Overview', 'home'], ['notifications', 'Alerts', 'notifications'], ['monitor', 'Monitoring', 'monitor'], ['dm', 'My DMs', 'dm'], ['settings', 'Settings']]
    : [['home', 'Overview', 'home'], ['dm', 'My DMs', 'dm']];
  const components = [row(new StringSelectMenuBuilder().setCustomId('dash:category').setPlaceholder(tr('Choose a category')).addOptions(categories.map(([value, label, emoji]) => ({ value, label: tr(label), default: categoryFor(section) === value, ...(emoji ? { emoji: icon(s, emoji) } : {}) }))))];
  if (section === 'home') {
    embed.setTitle(tr('Tibia monitoring')).setDescription(manage
      ? tr`${s.source === 'tibiadata' ? 'TibiaData' : tr('Official HTML')} · ${tr(s.monitorEnabled ? 'Monitoring active' : 'Monitoring paused')}`
      : tr('Manage your personal DM notifications using the category menu.'));
    if (manage) {
      embed.addFields({ name: tr('Players'), value: String(s.players.length), inline: true }, { name: tr('Guilds'), value: String(s.guilds.length), inline: true }, { name: tr('Notifications'), value: enabled(s.notificationsEnabled), inline: true });
      const errors = [...s.players.filter((p) => p.monitor.error).map((p) => p.name), ...s.guilds.filter((g) => g.error).map((g) => g.name)];
      if (errors.length) embed.addFields({ name: tr('Unavailable queries'), value: errors.slice(0, 5).join(' · ') + (errors.length > 5 ? ` +${errors.length - 5}` : '') });
    }
    components.push(row(button('refresh:home', tr('Refresh'))));
  } else if (section === 'notifications') {
    embed.setTitle(tr('Notifications')).setDescription(tr`General: **${enabled(s.notificationsEnabled)}**\nChannels: **${enabled(s.channelEnabled)}** · DMs: **${enabled(s.dmEnabled)}**`)
      .addFields({ name: tr('Destinations'), value: tr`${s.channelIds.length} channels · ${s.subscribers.length} DM subscriptions` });
    if (s.delivery) embed.addFields({ name: tr('Latest delivery'), value: tr`${s.delivery.sent} sent · ${s.delivery.failed} failed · ${timestamp(s.delivery.at, 'R', s)}` });
    components.push(row(button('toggle:notificationsEnabled', tr('General'), s.notificationsEnabled), button('toggle:channelEnabled', tr('Channels'), s.channelEnabled), button('toggle:dmEnabled', 'DMs', s.dmEnabled)),
      row(button('toggle:onlineAlerts', tr('When online'), s.onlineAlerts, icon(s, 'online')), button('toggle:offlineAlerts', tr('When offline'), s.offlineAlerts, icon(s, 'offline')), button('view:channels', tr('Choose channels'))));
  } else if (section === 'channels') {
    embed.setTitle(tr('Notification channels')).setDescription(s.channelIds.map((channel) => `<#${channel}>`).join('\n') || tr('No channels selected.'));
    const select = new ChannelSelectMenuBuilder().setCustomId('dash:channels').setPlaceholder(tr('Choose channels (replaces the list)')).setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(25);
    components.push(row(select), row(button('clear-channels', tr('Clear channels'))));
  } else if (section === 'monitor') {
    embed.setTitle(tr('Monitoring')).setDescription(tr`${s.source === 'tibiadata' ? tr('TibiaData · updates follow API caches') : tr`Official HTML · interval ${s.pollSeconds}s`}\n${s.players.length} players · ${s.guilds.length} guilds`);
    components.push(row(new StringSelectMenuBuilder().setCustomId('dash:monitor-section').setPlaceholder(tr('Monitoring options')).addOptions([{ label: tr('Players'), value: 'players' }, { label: tr('Guilds'), value: 'guilds' }])));
    const actions = [button('toggle:monitorEnabled', tr(s.monitorEnabled ? 'Pause' : 'Resume'), s.monitorEnabled), button('check', tr('Refresh queries'))];
    if (s.source === 'html') actions.push(button('interval', tr('HTML interval')));
    components.push(row(...actions));
  } else if (section === 'methods') {
    embed.setTitle(tr('Query method')).setDescription(s.source === 'tibiadata'
      ? tr('**TibiaData**\nPublic JSON. Cache: world 1 min · guild 2 min · character 5 min. Automatic updates; no adjustable interval.')
      : tr('**Official HTML**\nQueries Tibia pages directly. Requests may receive HTTP 403. Adjust the interval under Monitoring.'));
    components.push(row(button('source:tibiadata', 'TibiaData', s.source === 'tibiadata'), button('source:html', tr('Official HTML'), s.source === 'html')));
  } else if (section === 'players' || section === 'guilds') {
    const targets = s[section]; const guilds = section === 'guilds';
    embed.setTitle(tr(guilds ? 'Guilds' : 'Players')).setDescription(targets.length ? targets.map((t) => guilds
      ? tr`🏰 **${t.name}** · ${t.members.filter((m) => m.status === 'online').length}/${t.members.length} online${t.error ? ' ⚠️' : ''}`
      : `${mark(t.monitor.status)} **${t.name}**${t.monitor.error ? ' ⚠️' : ''}`).join('\n') : tr('No targets added.'));
    if (targets.length > 1) components.push(row(new StringSelectMenuBuilder().setCustomId(`dash:select:${section}`).setPlaceholder(tr(guilds ? 'Open a guild' : 'Open a player')).addOptions(targets.map((t) => ({ label: t.name.slice(0, 100), value: t.id })))));
    const actions = [button(`add:${section}`, tr(guilds ? 'Add guilds' : 'Add players'))];
    if (targets.length === 1) actions.push(button(`open:${guilds ? 'guild' : 'player'}:${targets[0].id}`, tr('View details')));
    actions.push(button(`refresh:${section}`, tr('Refresh list')));
    components.push(row(...actions));
  } else if (section === 'player') {
    const target = s.players.find((p) => p.id === id);
    if (!target) return renderDashboard(s, userId, manage, 'players', tr('Player removed.'), admin);
    embed.setTitle(`${mark(target.monitor.status)} ${target.name}`).setDescription(playerText(target, s)).setURL(`https://www.tibia.com/community/?subtopic=characters&name=${encodeURIComponent(target.name)}`);
    const history = target.monitor.history.slice(-3).reverse();
    if (history.length) embed.addFields({ name: tr('Latest changes'), value: history.map((e) => `${mark(e.status)} ${tr(e.status)} · ${timestamp(e.at, 'R', s)}`).join('\n') });
    components.push(row(button(`refresh:player:${id}`, tr('Refresh')), button(`remove:players:${id}`, tr('Remove player'))));
  } else if (section === 'guild') {
    const guild = s.guilds.find((g) => g.id === id);
    if (!guild) return renderDashboard(s, userId, manage, 'guilds', tr('Guild removed.'), admin);
    const filter = ['online', 'offline'].includes(rawFilter) ? rawFilter : 'all';
    const members = guild.members.filter((m) => filter === 'all' || m.status === filter).sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'online' ? -1 : 1));
    const lastPage = Math.max(0, Math.ceil(members.length / 20) - 1);
    const currentPage = Math.max(0, Math.min(Number(rawPage) || 0, lastPage));
    embed.setTitle(guild.name).setDescription(tr`**${guild.world || tr('World pending')}** · ${guild.members.filter((m) => m.status === 'online').length} online / ${guild.members.length} members\n${guild.checkedAt ? tr`Checked ${timestamp(guild.checkedAt, 'R', s)}` : tr('Waiting for a query')}${guild.observedAt ? tr` · sample ${timestamp(guild.observedAt, 'R', s)}` : ''}\n\n` + (members.slice(currentPage * 20, currentPage * 20 + 20).map((m) => `${mark(m.status)} **${m.name}** · ${m.level ?? '?'} · ${m.vocation}`).join('\n') || tr('No members in this list.')));
    if (guild.error) embed.addFields({ name: tr('Query unavailable'), value: tr`${errorText(s, guild.error)} This list may be outdated.` });
    embed.setURL(`https://www.tibia.com/community/?subtopic=guilds&page=view&GuildName=${encodeURIComponent(guild.name)}`);
    components.push(row(button(`view:guild:${id}:0:all`, tr('All'), filter === 'all'), button(`view:guild:${id}:0:online`, tr('Online'), filter === 'online'), button(`view:guild:${id}:0:offline`, tr('Offline'), filter === 'offline')));
    if (lastPage > 0) components.push(row(button(`previous:guild:${id}:${Math.max(0, currentPage - 1)}:${filter}`, tr('Previous')).setDisabled(currentPage === 0), button(`next:guild:${id}:${Math.min(lastPage, currentPage + 1)}:${filter}`, tr('Next')).setDisabled(currentPage === lastPage)));
    components.push(row(button(`refresh:guild:${id}:${currentPage}:${filter}`, tr`Refresh · ${currentPage + 1}/${lastPage + 1}`), button(`remove:guilds:${id}`, tr('Remove guild'))));
  } else if (section === 'dm') {
    const subscribed = s.subscribers.includes(userId);
    embed.setTitle(tr('My DMs')).setDescription(tr`Your subscription: **${enabled(subscribed)}**\nServer alerts: **${enabled(s.notificationsEnabled && s.dmEnabled)}**\n\nYou control only your own DMs. Delivery depends on your Discord privacy settings.`);
    components.push(row(button('subscribe', tr('Receive DMs'), subscribed), button('unsubscribe', tr('Stop DMs'), !subscribed)));
  } else if (section === 'settings') {
    embed.setTitle(tr('Settings')).setDescription(tr('Server preferences.'));
    const options = [['methods', 'Query method'], ['channels', 'Channels'], ['emojis', 'Emojis'], ['language', 'Language']];
    if (admin) options.push(['tests', 'Delivery tests'], ['security', 'Security']);
    components.push(row(new StringSelectMenuBuilder().setCustomId('dash:settings-section').setPlaceholder(tr('Choose a setting')).addOptions(options.map(([value, label]) => ({ value, label: tr(label) })))));
  } else if (section === 'language') {
    embed.setTitle(tr('Language')).setDescription(tr('Choose the server language for dashboard text, status cards, and notifications. Slash commands keep their English names.'));
    components.push(row(new StringSelectMenuBuilder().setCustomId('dash:language').setPlaceholder(tr('Choose a language')).addOptions([{ label: 'English', value: 'en', default: s.language !== 'pt-BR' }, { label: 'Português BR', value: 'pt-BR', default: s.language === 'pt-BR' }])));
  } else if (section === 'security' && admin) {
    embed.setTitle(tr('Security')).setDescription(tr('The process uses an instance lock.\nCommands and deliveries have spam limits.\nCredentials are blocked in messages and saved data.\n\nEmergency stop disables monitoring, alerts, and DMs. To resume, enable the desired options under Monitoring and Alerts.'));
    components.push(row(button('panic', tr('Stop monitoring and alerts')).setStyle(ButtonStyle.Danger)));
  } else if (section === 'emojis') {
    embed.setTitle(tr('Emojis')).setDescription(Object.keys(icons).map((key) => `${iconText(s, key)} \`${key}\``).join('\n'));
    components.push(row(button('emoji', tr('Customize')), button('reset-emojis', tr('Restore defaults'))));
  } else if (section === 'tests' && admin) {
    embed.setTitle(tr('Delivery tests')).setDescription(tr('Manual deliveries are marked TEST. They bypass general switches. Test DMs are sent only to you.\n\n') + tr`**Message:** ${s.testMessage === 'Bot test message. Notification destinations are working.' ? tr(s.testMessage) : s.testMessage}`);
    components.push(row(button('test:status:channels', tr('Status → channels')), button('test:message:channels', tr('Message → channels'))),
      row(button('test:status:dm', tr('Status → my DM')), button('test:message:dm', tr('Message → my DM')), button('test-message', tr('Edit message'))));
  } else return renderDashboard(s, userId, manage, 'home', notice, admin);
  if (section !== 'home') components.push(row(button(`back:${parentPage(section)}`, tr('Back'))));
  if (notice) embed.addFields({ name: tr('Result'), value: tr(notice).slice(0, 1024) });
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

function modal(id, title, fields, tr = (value) => value) {
  return new ModalBuilder().setCustomId(`dash:${id}`).setTitle(tr(title)).addComponents(...fields.map((field) => row(
    new TextInputBuilder().setCustomId(field.id).setLabel(tr(field.label)).setStyle(field.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(true).setMaxLength(field.max || 200).setValue(field.value || ''),
  )));
}
export function setSubscription(store, userId, enabled) {
  return store.update((s) => { s.subscribers = s.subscribers.filter((id) => id !== userId); if (enabled) s.subscribers.push(userId); });
}
export function addTargets(store, kind, input) {
  if (!['players', 'guilds'].includes(kind)) throw new TibiaError('Invalid target type.');
  const names = input.split(/\r?\n/).filter((name) => name.trim()).map(kind === 'players' ? characterName : guildName);
  if (!names.length) throw new TibiaError('Enter at least one name.');
  return store.update((s) => {
    for (const name of names) if (!s[kind].some((target) => sameName(target.name, name))) s[kind].push((kind === 'players' ? playerTarget : guildTarget)(name));
    if (s[kind].length > 25) throw new TibiaError('Limit of 25 players and 25 guilds. No changes were saved.');
  });
}

export async function handleDashboard(i, { config, store, monitor }) {
  if (!i.customId?.startsWith('dash:')) return false;
  const tr = translator(store.get());
  const selection = i.values?.[0];
  const action = i.customId.slice(5); const [verb, arg, id] = action.split(':');
  const manage = canManage(i, config); const admin = canTest(i, config);
  const personal = ['subscribe', 'unsubscribe'].includes(action) || ['view:dm', 'view:home', 'back:home'].includes(action) || (action === 'category' && ['home', 'dm'].includes(selection));
  const testAction = verb === 'test' || action === 'view:tests' || action === 'test-message' || action === 'test-message-submit' || (action === 'settings-section' && selection === 'tests');
  const securityAction = action === 'panic' || action === 'view:security' || (action === 'settings-section' && selection === 'security');
  if ((!manage && !personal) || ((testAction || securityAction) && !admin)) {
    await i.reply({ content: tr(testAction || securityAction ? 'Action restricted to the owner or Administrator.' : 'Only the owner or moderators can change server settings.'), flags: MessageFlags.Ephemeral }); return true;
  }
  const settings = store.get();
  if (verb === 'add') {
    if (!['players', 'guilds'].includes(arg)) return true;
    await i.showModal(modal(`add-submit:${arg}`, arg === 'players' ? 'Add players' : 'Add guilds', [{ id: 'names', label: 'One name or official URL per line', paragraph: true, max: 2000 }], tr)); return true;
  }
  if (action === 'interval' && settings.source === 'html') {
    await i.showModal(modal('interval-submit', 'HTML interval', [{ id: 'seconds', label: 'Seconds (60 to 900)', value: String(settings.pollSeconds), max: 3 }], tr)); return true;
  }
  if (action === 'test-message') {
    await i.showModal(modal('test-message-submit', 'Test message', [{ id: 'message', label: 'Text sent only by manual tests', value: settings.testMessage, max: 1500, paragraph: true }], tr)); return true;
  }
  if (action === 'emoji') {
    await i.showModal(modal('emoji-submit', 'Custom emoji', [{ id: 'key', label: 'Icon key (e.g. notifications)', max: 20 }, { id: 'emoji', label: 'Emoji, ID, or reset', max: 100 }], tr)); return true;
  }
  const update = !i.isModalSubmit() || i.isFromMessage();
  if (update) await i.deferUpdate(); else await i.deferReply({ flags: MessageFlags.Ephemeral });
  let page = 'home'; let notice = '';
  try {
    if (action === 'panic') {
      store.update((s) => { s.monitorEnabled = false; s.notificationsEnabled = false; s.channelEnabled = false; s.dmEnabled = false; s.monitorRevision++; });
      page = 'security'; notice = 'Monitoring and alerts disabled. Preferences, targets, and history preserved.';
    } else if (['view', 'open', 'refresh', 'previous', 'next', 'back'].includes(verb)) page = action.slice(verb.length + 1);
    else if (['category', 'settings-section', 'monitor-section'].includes(action)) {
      const allowed = action === 'category' ? ['home', 'notifications', 'monitor', 'dm', 'settings'] : action === 'settings-section' ? ['methods', 'channels', 'emojis', 'language', 'tests', 'security'] : ['players', 'guilds'];
      if (!allowed.includes(selection)) throw new TibiaError('Invalid action.');
      page = selection;
    } else if (action === 'language') {
      if (!languages.includes(selection)) throw new TibiaError('Invalid language.');
      store.update((s) => { s.language = selection; });
      page = 'language'; notice = 'Language saved.';
    } else if (verb === 'select' && ['players', 'guilds'].includes(arg)) page = `${arg === 'players' ? 'player' : 'guild'}:${i.values[0]}`;
    else if (action === 'subscribe' || action === 'unsubscribe') { setSubscription(store, i.user.id, action === 'subscribe'); page = 'dm'; }
    else if (verb === 'add-submit') {
      page = arg; addTargets(store, arg, i.fields.getTextInputValue('names')); notice = 'Targets saved. Wait for the first query.';
    } else if (verb === 'remove' && ['players', 'guilds'].includes(arg)) {
      const target = store.get()[arg].find((t) => t.id === id);
      if (!target) throw new TibiaError('Target already removed.');
      const view = renderDashboard(store.get(), i.user.id, manage, arg, tr`Remove ${target.name} and its monitoring history?`, admin);
      const back = view.components.pop();
      view.components.push(row(button(`remove-confirm:${arg}:${id}`, tr('Confirm removal')).setStyle(ButtonStyle.Danger)), back);
      await i.editReply(view); return true;
    } else if (verb === 'remove-confirm' && ['players', 'guilds'].includes(arg)) {
      store.update((s) => { s[arg] = s[arg].filter((target) => target.id !== id); s.monitorRevision++; }); page = arg;
    } else if (verb === 'source') {
      if (!['tibiadata', 'html'].includes(arg)) throw new TibiaError('Invalid method.');
      store.update((s) => {
        if (s.source !== arg) {
          s.source = arg; s.monitorRevision++;
          for (const p of s.players) { p.monitor.status = 'unknown'; p.monitor.source = null; p.monitor.error = null; }
          for (const g of s.guilds) { g.source = null; g.checkedAt = null; g.error = null; }
        }
      }); page = 'methods'; notice = 'Method saved. The first source sample will be silent.';
    } else if (verb === 'toggle') {
      if (!['notificationsEnabled', 'channelEnabled', 'dmEnabled', 'onlineAlerts', 'offlineAlerts', 'monitorEnabled'].includes(arg)) throw new TibiaError('Invalid action.');
      store.update((s) => { s[arg] = !s[arg]; if (arg === 'monitorEnabled') s.monitorRevision++; }); page = arg === 'monitorEnabled' ? 'monitor' : 'notifications';
    } else if (action === 'interval-submit') {
      page = 'monitor';
      if (store.get().source !== 'html') throw new TibiaError('TibiaData follows source intervals with no manual adjustment.');
      const input = i.fields.getTextInputValue('seconds').trim(); const seconds = Number(input);
      if (!/^\d+$/.test(input) || seconds < 60 || seconds > 900) throw new TibiaError('Use 60 to 900 seconds.');
      store.update((s) => { s.pollSeconds = seconds; });
    } else if (action === 'check') {
      page = 'monitor';
      if (monitor.busy) notice = 'A query is already running.';
      else { void monitor.check().catch(() => console.error('Failed to refresh queries.')); notice = 'Refresh requested; caches are respected. Use Refresh list to see the result.'; }
    } else if (action === 'channels') {
      page = 'channels';
      for (const channelId of i.values) {
        const channel = await i.guild.channels.fetch(channelId);
        if (!channel || channel.guildId !== config.guildId || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) || !channel.permissionsFor(i.client.user)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) throw new TibiaError('Channel access or send permission missing. Previous list preserved.');
      }
      store.update((s) => { s.channelIds = [...new Set(i.values)]; });
    } else if (action === 'clear-channels') { store.update((s) => { s.channelIds = []; }); page = 'channels'; }
    else if (verb === 'test') {
      page = 'tests';
      if (!['status', 'message'].includes(arg) || !['channels', 'dm'].includes(id)) throw new TibiaError('Invalid test.');
      notice = await monitor.testSend(arg, id, i.user.id);
    } else if (action === 'test-message-submit') {
      page = 'tests'; const message = i.fields.getTextInputValue('message').trim();
      if (!message || message.length > 1500) throw new TibiaError('Message must contain 1 to 1500 characters.');
      store.update((s) => { s.testMessage = message; });
    } else if (action === 'emoji-submit') {
      page = 'emojis'; const key = i.fields.getTextInputValue('key').trim(); const value = i.fields.getTextInputValue('emoji').trim();
      if (!Object.hasOwn(icons, key)) throw new TibiaError('Unknown icon key.');
      if (value === 'reset') store.update((s) => { delete s.emojis[key]; });
      else {
        const match = value.match(/^(?:<a?:\w+:)?([1-9]\d{16,19})>?$/);
        if (!match) throw new TibiaError('Enter an emoji or ID from this server.');
        let emoji; try { emoji = await i.guild.emojis.fetch(match[1]); } catch { /* safe error below */ }
        if (!emoji?.available || emoji.roles.cache.size) throw new TibiaError('Emoji unavailable or restricted to roles.');
        store.update((s) => { s.emojis[key] = { id: emoji.id, name: emoji.name, animated: emoji.animated }; });
      }
    } else if (action === 'reset-emojis') { store.update((s) => { s.emojis = {}; }); page = 'emojis'; }
    else throw new TibiaError('Open /dashboard again; this button belongs to an earlier version.');
  } catch (error) {
    notice = error instanceof TibiaError || error instanceof SecurityError ? errorText(store.get(), error.message) : tr('Could not save the change.');
    if (!(error instanceof TibiaError)) console.error('Failed to execute dashboard action.', interactionErrorDetails(error));
  }
  await i.editReply(renderDashboard(store.get(), i.user.id, manage, page, notice, admin)); return true;
}

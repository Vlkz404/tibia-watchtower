import { characterName } from './tibia.js';
import { statusText } from './monitor.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, EmbedBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
export const canManage = (i, c) => i.user.id === c.ownerId || Boolean(i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || i.memberPermissions?.has(PermissionFlagsBits.ModerateMembers));
const row = (...items) => new ActionRowBuilder().addComponents(...items);
const button = (id, label) => new ButtonBuilder().setCustomId('dash:' + id).setLabel(label).setStyle(ButtonStyle.Secondary);
const pages = { home: 'Overview', notifications: 'Notifications', channels: 'Channels', monitor: 'Monitoring', dm: 'My DMs', emojis: 'Custom emojis', settings: 'Settings', methods: 'Query method' };
export function renderDashboard(s, userId, manage, page = 'home', notice = '') {
  if (!manage || !pages[page]) page = manage ? 'home' : 'dm';
  const components = manage ? [row(...['home','notifications','monitor','dm','settings'].map((key) => button('view:' + key, pages[key])))] : [];
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle(pages[page]).setFooter({ text: 'Tibia Watchtower' });
  if (page === 'home') embed.setDescription(`Notifications: ${s.notificationsEnabled ? 'enabled' : 'disabled'}\nChannels: ${s.channelIds.length}\nDM subscriptions: ${s.subscribers.length}`);
  else if (page === 'notifications') {
    embed.setDescription(`General: ${s.notificationsEnabled}\nChannels: ${s.channelEnabled}\nDMs: ${s.dmEnabled}`);
    components.push(row(button('toggle:notificationsEnabled', 'Toggle notifications'), button('toggle:channelEnabled', 'Toggle channels'), button('toggle:dmEnabled', 'Toggle DMs')));
  } else if (page === 'channels') {
    embed.setDescription(s.channelIds.map((id) => `<#${id}>`).join('\n') || 'No channels configured.');
    components.push(row(new ChannelSelectMenuBuilder().setCustomId('dash:channels').setPlaceholder('Choose notification channels').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(25)));
  } else if (page === 'monitor') {
    embed.setDescription(statusText(s));
    components.push(row(button('player', 'Choose player'), button('view:methods', 'Query method'), button('toggle:monitorEnabled', s.monitorEnabled ? 'Pause' : 'Resume')));
    if (s.source === 'html') components.push(row(button('interval', 'HTML interval')));
  } else if (page === 'dm') {
    embed.setDescription(`Your subscription: ${s.subscribers.includes(userId) ? 'enabled' : 'disabled'}\nServer DMs: ${s.dmEnabled ? 'enabled' : 'disabled'}`);
    components.push(row(button('subscribe', 'Receive DMs'), button('unsubscribe', 'Stop DMs')));
  } else if (page === 'settings') {
    embed.setDescription('Server preferences.'); components.push(row(button('view:channels','Channels'),button('view:emojis','Emojis'),button('view:methods','Query method')));
  } else if (page === 'methods') {
    embed.setDescription(s.source === 'html' ? 'Direct official HTML. Requests may be blocked with HTTP 403.' : 'TibiaData JSON. Automatic source caches: world 60s, character 300s. No adjustable interval.');
    components.push(row(button('source:tibiadata','TibiaData'),button('source:html','Official HTML')));
  } else {
    embed.setDescription('Use a custom emoji from this server. Themes are not implemented.'); components.push(row(button('emoji', 'Set notification emoji')));
  }
  if (notice) embed.addFields({ name: 'Result', value: notice.slice(0, 1000) });
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}
export const setSubscription = (store, userId, enabled) => store.update((s) => { s.subscribers = s.subscribers.filter((id) => id !== userId); if (enabled) s.subscribers.push(userId); });
export async function handleDashboard(i, { config, store, monitor }) {
  if (!i.customId?.startsWith('dash:')) return false;
  const action = i.customId.slice(5); const manage = canManage(i, config);
  if (!manage && !['subscribe', 'unsubscribe'].includes(action) && !(action === 'page' && i.values[0] === 'dm') && action !== 'view:dm') {
    await i.reply({ content: 'Only the owner or moderators can change server settings.', flags: MessageFlags.Ephemeral }); return true;
  }
  if (action === 'interval' && store.get().source === 'html') {
    await i.showModal(new ModalBuilder().setCustomId('dash:interval-submit').setTitle('HTML interval').addComponents(row(new TextInputBuilder().setCustomId('value').setLabel('Seconds (60 to 900)').setStyle(TextInputStyle.Short).setRequired(true)))); return true;
  }
  if (['player', 'emoji'].includes(action)) {
    const field = new TextInputBuilder().setCustomId('value').setLabel(action === 'player' ? 'Player name or official URL' : 'Custom emoji ID').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200);
    await i.showModal(new ModalBuilder().setCustomId(`dash:${action}-submit`).setTitle(action === 'player' ? 'Monitored player' : 'Custom notification emoji').addComponents(row(field))); return true;
  }
  await i.deferUpdate(); let page = 'home'; let notice = '';
  try {
    if (action.startsWith('view:')) page = action.slice(5);
    else if (action.startsWith('source:')) {
      const source = action.slice(7); if (!['html','tibiadata'].includes(source)) throw new Error('Invalid source.');
      store.update((s) => { s.source = source; s.monitorRevision++; s.monitor.status = 'unknown'; s.monitor.source = null; }); page = 'methods';
    } else if (action === 'interval-submit') {
      if (store.get().source !== 'html') throw new Error('API interval cannot be changed.');
      const value = i.fields.getTextInputValue('value').trim(); const seconds = Number(value);
      if (!/^\d+$/.test(value) || seconds < 60 || seconds > 900) throw new Error('Invalid interval.');
      store.update((s) => { s.pollSeconds = seconds; }); page = 'monitor';
    } else if (action === 'page') page = i.values[0];
    else if (action === 'subscribe' || action === 'unsubscribe') { setSubscription(store, i.user.id, action === 'subscribe'); page = 'dm'; }
    else if (action.startsWith('toggle:')) {
      const key = action.slice(7); if (!['notificationsEnabled','channelEnabled','dmEnabled','monitorEnabled'].includes(key)) throw new Error('Invalid action.');
      store.update((s) => { s[key] = !s[key]; if (key === 'monitorEnabled') s.monitorRevision++; }); page = 'notifications';
    } else if (action === 'channels') {
      page = 'channels';
      for (const id of i.values) {
        const channel = await i.guild.channels.fetch(id);
        if (channel?.guildId !== config.guildId || !channel.permissionsFor(i.client.user)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) throw new Error('The bot cannot access or send messages in a selected channel.');
      }
      store.update((s) => { s.channelIds = [...new Set(i.values)]; });
    } else if (action === 'player-submit') {
      page = 'monitor'; const name = characterName(i.fields.getTextInputValue('value'));
      store.update((s) => { s.player = name; s.monitor = { status: 'unknown', checkedAt: null, history: [], error: null }; s.monitorRevision++; });
    } else if (action === 'emoji-submit') {
      page = 'emojis'; const emoji = await i.guild.emojis.fetch(i.fields.getTextInputValue('value').trim());
      if (!emoji?.available || emoji.roles.cache.size) throw new Error('Choose an available server emoji without role restrictions.');
      store.update((s) => { s.emojis.notifications = { id: emoji.id, name: emoji.name, animated: emoji.animated }; });
    } else throw new Error('Unknown action.');
  } catch { notice = 'Could not apply this change. Check the input and bot permissions.'; }
  await i.editReply(renderDashboard(store.get(), i.user.id, manage, page, notice)); return true;
}

// Recheck preferences before each delivery to respect opt-out and disabled destinations.
export async function sendNotification(client, config, content, current = () => config) {
  if (typeof content !== 'string' || !content.trim() || content.length > 2000) {
    throw new Error('Notification content must contain between 1 and 2000 characters.');
  }
  const payload = { content, allowedMentions: { parse: [] } };
  const results = [];
  for (const channelId of config.channelIds) {
    try {
      if (!current().channelIds.includes(channelId)) continue;
      const channel = await client.channels.fetch(channelId);
      if (!channel || channel.guildId !== config.guildId || !channel.isSendable()) {
        throw new Error('Channel unavailable.');
      }
      if (!current().channelIds.includes(channelId)) continue;
      await channel.send(payload);
      results.push({ type: 'channel', id: channelId, ok: true });
    } catch {
      results.push({ type: 'channel', id: channelId, ok: false });
    }
  }
  if (config.dmEnabled) {
    for (const userId of config.dmUserIds) {
      try {
        if (!current().dmEnabled || !current().dmUserIds.includes(userId)) continue;
        const guild = await client.guilds.fetch(config.guildId);
        await guild.members.fetch({ user: userId, force: true });
        const user = await client.users.fetch(userId);
        if (!current().dmEnabled || !current().dmUserIds.includes(userId)) continue;
        await user.send(payload);
        results.push({ type: 'dm', id: userId, ok: true });
      } catch {
        results.push({ type: 'dm', id: userId, ok: false });
      }
    }
  }
  return results;
}

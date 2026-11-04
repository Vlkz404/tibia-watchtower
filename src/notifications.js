// Integration point for the future Tibia monitor. No automatic deliveries on startup.
export async function sendNotification(client, config, content) {
  if (typeof content !== 'string' || !content.trim() || content.length > 2000) {
    throw new Error('Notification content must contain between 1 and 2000 characters.');
  }
  const payload = { content, allowedMentions: { parse: [] } };
  const results = [];
  for (const channelId of config.channelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || channel.guildId !== config.guildId || !channel.isSendable()) {
        throw new Error('Channel unavailable.');
      }
      await channel.send(payload);
      results.push({ type: 'channel', id: channelId, ok: true });
    } catch {
      results.push({ type: 'channel', id: channelId, ok: false });
    }
  }
  if (config.dmEnabled) {
    for (const userId of config.dmUserIds) {
      try {
        const user = await client.users.fetch(userId);
        await user.send(payload);
        results.push({ type: 'dm', id: userId, ok: true });
      } catch {
        results.push({ type: 'dm', id: userId, ok: false });
      }
    }
  }
  return results;
}

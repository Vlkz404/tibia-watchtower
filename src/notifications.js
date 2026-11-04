// Ponto de integração para o futuro monitor do Tibia. Nenhum envio automático no boot.
export async function sendNotification(client, config, content) {
  if (typeof content !== 'string' || !content.trim() || content.length > 2000) {
    throw new Error('A notificação deve ter entre 1 e 2000 caracteres.');
  }
  const payload = { content, allowedMentions: { parse: [] } };
  const results = [];
  for (const channelId of config.channelIds) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || channel.guildId !== config.guildId || !channel.isSendable()) {
        throw new Error('Canal indisponível.');
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

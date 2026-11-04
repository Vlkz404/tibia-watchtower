export const icons = { home: '🏠', notifications: '🔔', channels: '📣', monitor: '🔎', dm: '✉️', emojis: '🎨', online: '🟢', offline: '🔴' };
export const icon = (settings, key) => settings.emojis[key] || { name: icons[key] };
export function iconText(settings, key) {
  const value = icon(settings, key);
  return value.id ? `<${value.animated ? 'a' : ''}:${value.name}:${value.id}>` : value.name;
}

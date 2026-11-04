import ptBR from './locales/pt-BR.js';

export const languages = ['en', 'pt-BR'];
export function translator(settings = {}) {
  const catalog = settings.language === 'pt-BR' ? ptBR : {};
  return (source, ...values) => {
    const key = typeof source === 'string' ? source : source.reduce((text, part, index) => text + (index ? `{${index - 1}}` : '') + part, '');
    const translated = catalog[key] ?? key;
    // Substitute only catalog placeholders; user content is never translated or scanned again.
    return translated.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match);
  };
}
export function errorText(settings, message) {
  const tr = translator(settings);
  if (settings.language !== 'pt-BR') return message;
  if (Object.hasOwn(ptBR, message)) return tr(message);
  if (/^HTTP \d{3}$/.test(message)) return message;
  return tr('Query unavailable. Try again later.');
}

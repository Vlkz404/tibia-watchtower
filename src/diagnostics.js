const fields = new Set(['components', 'embeds', 'custom_id', 'emoji', 'id', 'name', 'label', 'description', 'title', 'content', 'options', 'value', 'fields', 'footer', 'text', 'url', 'type', 'style', 'flags', 'data']);
const names = new Set(['Error', 'TypeError', 'RangeError', 'DiscordAPIError', 'HTTPError', 'CombinedError', 'ValidationError']);
const sdkCodes = new Set(['InteractionAlreadyReplied', 'InteractionNotReplied', 'InteractionCollectorError']);

// Never include raw error messages, request bodies, URLs, or headers in logs.
export function interactionErrorDetails(error) {
  const details = { type: names.has(error?.name) ? error.name : 'Error' };
  if (Number.isSafeInteger(error?.code) || sdkCodes.has(error?.code)) details.code = error.code;
  if (Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599) details.status = error.status;
  const invalidFields = [];
  function visit(node, path = []) {
    if (!node || typeof node !== 'object' || path.length > 10 || invalidFields.length >= 8) return;
    if (Array.isArray(node._errors) && path.length) invalidFields.push(path.join('.'));
    for (const [key, value] of Object.entries(node)) {
      if (fields.has(key) || /^\d{1,3}$/.test(key)) visit(value, [...path, key]);
      if (invalidFields.length >= 8) break;
    }
  }
  visit(error?.rawError?.errors);
  if (invalidFields.length) details.fields = invalidFields;
  return details;
}

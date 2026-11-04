import test from 'node:test';
import assert from 'node:assert/strict';
import { interactionErrorDetails } from '../src/diagnostics.js';

test('interaction diagnostics show API codes and invalid field paths without error payloads', () => {
  const sensitive = 'private-runtime-value';
  const error = {
    name: 'DiscordAPIError', code: 50035, status: 400,
    message: sensitive, requestBody: { content: sensitive }, url: sensitive,
    rawError: { errors: { components: { 1: { components: { 3: { custom_id: { _errors: [{ code: sensitive, message: sensitive }] } } } } }, [sensitive]: { _errors: [sensitive] } } },
  };
  assert.deepEqual(interactionErrorDetails(error), { type: 'DiscordAPIError', code: 50035, status: 400, fields: ['components.1.components.3.custom_id'] });
  assert.equal(JSON.stringify(interactionErrorDetails(error)).includes(sensitive), false);
  assert.deepEqual(interactionErrorDetails({ name: sensitive, code: sensitive, status: sensitive }), { type: 'Error' });
  assert.deepEqual(interactionErrorDetails(new TypeError(sensitive)), { type: 'TypeError' });
  assert.deepEqual(interactionErrorDetails(null), { type: 'Error' });
});

test('interaction diagnostics bound nested and repeated API validation errors', () => {
  const errors = { components: Object.fromEntries(Array.from({ length: 100 }, (_, n) => [n, { _errors: [{}] }])) };
  assert.equal(interactionErrorDetails({ rawError: { errors } }).fields.length, 8);
  const cycle = {}; cycle.components = cycle;
  assert.deepEqual(interactionErrorDetails({ rawError: { errors: cycle } }), { type: 'Error' });
});

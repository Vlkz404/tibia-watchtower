export class TibiaError extends Error {}
export const normalize = (value) => value.replace(/\s+/g, ' ').trim();
export const sameName = (a, b) => normalize(a).toLowerCase() === normalize(b).toLowerCase();

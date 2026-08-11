export function getPath(obj: any, path: string): unknown {
  if (!path) return obj;
  return path
    .split(".")
    .reduce((acc: any, key) => (acc == null ? undefined : acc[key]), obj);
}

export function interpolate(template: string, previousOutput: unknown): string {
  return template.replace(/{{\s*output(\.[a-zA-Z0-9_.]+)?\s*}}/g, (_match, suffix) => {
    const value = suffix ? getPath(previousOutput, suffix.slice(1)) : previousOutput;
    return typeof value === "string" ? value : JSON.stringify(value ?? null);
  });
}

export function interpolateDeep(value: unknown, previousOutput: unknown): unknown {
  if (typeof value === "string") return tryParseJson(interpolate(value, previousOutput));
  if (Array.isArray(value)) return value.map((v) => interpolateDeep(v, previousOutput));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = interpolateDeep(v, previousOutput);
    return out;
  }
  return value;
}

function tryParseJson(s: string): unknown {
  if (!/^(\{|\[|"|-?\d|true|false|null)/.test(s)) return s;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

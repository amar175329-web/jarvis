// npm run generate -> writes contracts/generated/routes.json (JSON Schema per route) and contracts/generated/kotlin/JarvisContracts.kt
// build() is pure, so the test can check that the files on disk are up to date. Never edit the generated files by hand.
import fs from 'node:fs';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ROUTES, NAMED, ErrorBodySchema, ERROR_STATUS } from '../src/index.ts';

type J = { [k: string]: any };
const pascal = (s: string) => s.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const camel = (s: string) => { const p = pascal(s); return p[0].toLowerCase() + p.slice(1); };
const KOTLIN_KEYWORDS = new Set(['val', 'var', 'fun', 'in', 'is', 'as', 'object', 'class', 'when', 'typeof', 'null', 'true', 'false']);

const toSchema = (schema: any, name: string): J => zodToJsonSchema(schema, { name, definitions: NAMED as any, $refStrategy: 'root', target: 'jsonSchema7' }) as J;

export function build() {
  const defs: Record<string, J> = {};
  const routes: J[] = [];
  const addDefs = (js: J) => Object.assign(defs, js.definitions ?? {});
  for (const [name, r] of Object.entries(ROUTES)) {
    const base = pascal(name);
    const req = toSchema(r.input, `${base}Request`), res = toSchema(r.output, `${base}Response`);
    addDefs(req); addDefs(res);
    routes.push({ name, path: r.path, method: r.method, auth: r.auth, summary: r.summary, killSensitive: r.killSensitive, errors: r.errors, request: `${base}Request`, response: `${base}Response` });
  }
  const err = toSchema(ErrorBodySchema, 'ApiErrorBody'); addDefs(err);
  const sortedDefs = Object.fromEntries(Object.entries(defs).sort(([a], [b]) => a.localeCompare(b)));
  const routesJson = JSON.stringify({ generated: 'DO NOT EDIT. Run: npm run generate (packages/contracts)', errorStatus: ERROR_STATUS, routes, definitions: sortedDefs }, null, 2) + '\n';
  return { routesJson, kotlin: kotlin(sortedDefs, routes) };
}

// ---- JSON Schema -> Kotlin (kotlinx.serialization) ----
function kotlin(defs: Record<string, J>, routes: J[]): string {
  const out: string[] = [];
  const extra: string[] = []; // nested classes found while walking
  // $ref is either a named definition ("#/definitions/Device") or a path into another schema when the same zod object
  // is reused ("#/definitions/X/properties/device_id"). Paths are resolved and inlined.
  function resolve(ref: string): { named?: string; schema?: J } {
    const parts = ref.replace(/^#\//, '').split('/');
    if (parts[0] === 'definitions' && parts.length === 2) return { named: parts[1] };
    let cur: any = { definitions: defs };
    for (const p of parts) cur = cur?.[p];
    if (!cur) throw new Error(`cannot resolve ${ref}`);
    return { schema: cur };
  }

  function type(s: J, ctx: string): string {
    if (s.$ref) { const r = resolve(s.$ref); return r.named ?? type(r.schema as J, ctx); }
    if (s.anyOf) {
      const nonNull = s.anyOf.filter((x: J) => x.type !== 'null');
      if (nonNull.length === 1 && nonNull.length !== s.anyOf.length) return type(nonNull[0], ctx) + '?';
      return 'JsonElement';
    }
    if (s.enum && s.type === 'string') { extra.push(enumClass(ctx, s.enum)); return ctx; }
    if (s.const !== undefined) return typeof s.const === 'boolean' ? 'Boolean' : typeof s.const === 'number' ? 'Int' : 'String';
    switch (s.type) {
      case 'string': return 'String';
      case 'integer': return 'Int';
      case 'number': return 'Double';
      case 'boolean': return 'Boolean';
      case 'array': return `List<${type(s.items ?? {}, ctx + 'Item')}>`;
      case 'object':
        if (s.properties && Object.keys(s.properties).length) { extra.push(dataClass(ctx, s)); return ctx; }
        if (s.properties) { extra.push(`@Serializable\nclass ${ctx}`); return ctx; }
        return `Map<String, ${s.additionalProperties && typeof s.additionalProperties === 'object' && Object.keys(s.additionalProperties).length ? type(s.additionalProperties, ctx + 'Value') : 'JsonElement'}>`;
      default: return 'JsonElement';
    }
  }
  function enumClass(name: string, values: string[]): string {
    const items = values.map((v) => `    @SerialName("${v}") ${v.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`).join(',\n');
    return `@Serializable\nenum class ${name} {\n${items}\n}`;
  }
  function dataClass(name: string, s: J): string {
    const req = new Set<string>(s.required ?? []);
    const props = Object.entries(s.properties as Record<string, J>).map(([k, v]) => {
      let t = type(v, name + pascal(k));
      if (!req.has(k) && !t.endsWith('?')) t += '?';
      let prop = camel(k); if (KOTLIN_KEYWORDS.has(prop)) prop += 'Value';
      return `    @SerialName("${k}") val ${prop}: ${t}${!req.has(k) ? ' = null' : ''}`;
    });
    return `@Serializable\ndata class ${name}(\n${props.join(',\n')}\n)`;
  }

  for (const [name, s] of Object.entries(defs)) {
    if (s.enum && s.type === 'string') out.push(enumClass(name, s.enum));
    else if (s.type === 'object' && s.properties && Object.keys(s.properties).length) out.push(dataClass(name, s));
    else if (s.type === 'object' && s.properties) out.push(`@Serializable\nclass ${name}`);
    else out.push(`typealias ${name} = ${type(s, name)}`);
  }
  const consts = routes.map((r) => `    const val ${r.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')} = "${r.path}"`).join('\n');
  return [
    '// GENERATED by packages/contracts (npm run generate). DO NOT EDIT.',
    '// Not yet compiled in CI: S16A compiles it when the Android project exists.',
    'package app.jarvis.contracts',
    '',
    'import kotlinx.serialization.SerialName',
    'import kotlinx.serialization.Serializable',
    'import kotlinx.serialization.json.JsonElement',
    '',
    'object JarvisRoutes {',
    consts,
    '}',
    '',
    ...[...out, ...extra].map((b) => b + '\n'),
  ].join('\n');
}

const outDir = new URL('../../../contracts/generated/', import.meta.url);
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const { routesJson, kotlin: kt } = build();
  fs.mkdirSync(new URL('kotlin/', outDir), { recursive: true });
  fs.writeFileSync(new URL('routes.json', outDir), routesJson);
  fs.writeFileSync(new URL('kotlin/JarvisContracts.kt', outDir), kt);
  console.log('GENERATED contracts/generated/routes.json and kotlin/JarvisContracts.kt');
}
export { outDir };

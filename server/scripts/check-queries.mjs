// Сверяет GraphQL-запросы фронтенда со схемой сервера.
// Находит опечатки в именах полей и аргументов, не запуская сами запросы.
//
//   npm run check:queries           (сервер должен быть запущен)
//   API=http://localhost:4000/graphql npm run check:queries
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { buildClientSchema, getIntrospectionQuery, parse, validate } from 'graphql';

const API = process.env.API ?? 'http://localhost:4000/graphql';
const ROOT = new URL('../../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

async function sourceFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
    else if (/\.(ts|svelte)$/.test(entry.name)) out.push(path);
  }
  return out;
}

/** Строки в кавычках или бэктиках, похожие на GraphQL-документ. */
function extractDocuments(text) {
  const docs = [];
  const re = /(['"`])((?:\{|query[\s({]|mutation[\s({])[\s\S]*?)\1/g;
  let m;
  while ((m = re.exec(text))) {
    const body = m[2];
    if (!/[{}]/.test(body)) continue;
    if (body.includes('${')) continue; // подстановки раскрываем отдельно
    docs.push(body);
  }
  return docs;
}

/** В клиенте поля `me` подставляются через ${ME} — соберём их из исходника. */
function expandFragments(text) {
  const consts = {};
  for (const m of text.matchAll(/const\s+([A-Z_]+)\s*=\s*'([^']+)'/g)) consts[m[1]] = m[2];
  return text.replace(/\$\{([A-Z_]+)\}/g, (full, name) => consts[name] ?? full);
}

let introspection;
try {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: process.env.ORIGIN ?? 'http://localhost:5173' },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
  });
  introspection = await res.json();
} catch (e) {
  console.error(`Сервер на ${API} не отвечает. Запустите его: npm run docker:api`);
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}
if (!introspection.data) {
  console.error('Не удалось получить схему. Сервер запущен? Интроспекция включена?');
  console.error(JSON.stringify(introspection.errors ?? introspection).slice(0, 300));
  process.exit(1);
}
const schema = buildClientSchema(introspection.data);

let checked = 0;
let failed = 0;

for (const file of await sourceFiles(ROOT)) {
  const text = expandFragments(await readFile(file, 'utf8'));
  for (const doc of extractDocuments(text)) {
    let ast;
    try {
      ast = parse(doc);
    } catch {
      continue; // не GraphQL — обычная строка с фигурными скобками
    }
    if (!ast.definitions.length) continue;
    checked++;
    const errors = validate(schema, ast);
    if (errors.length) {
      failed++;
      console.error('\n✗ ' + relative(ROOT, file));
      console.error('  ' + doc.trim().replace(/\s+/g, ' ').slice(0, 120));
      for (const e of errors) console.error('  → ' + e.message);
    }
  }
}

console.log(`\nПроверено запросов: ${checked}, с ошибками: ${failed}`);
process.exit(failed ? 1 : 0);

#!/usr/bin/env ts-node
/**
 * scripts/export-postman.ts
 * Generates a Postman collection from the OpenAPI spec served by the running app.
 *
 * Usage:
 *   npx ts-node scripts/export-postman.ts [--url http://localhost:3000] [--out postman-collection.json]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const args = process.argv.slice(2);
const getArg = (flag: string, def: string) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : def;
};

const BASE_URL = getArg('--url', 'http://localhost:3000');
const OUT_FILE = getArg('--out', path.join(process.cwd(), 'nexafx-postman-collection.json'));
const OPENAPI_URL = `${BASE_URL}/api/docs-json`;

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function openApiToPostman(spec: any): any {
  const collection = {
    info: {
      name: spec.info?.title || 'NexaFx API',
      description: spec.info?.description || '',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{access_token}}', type: 'string' }],
    },
    variable: [
      { key: 'baseUrl', value: BASE_URL, type: 'string' },
      { key: 'access_token', value: '', type: 'string' },
    ],
    item: [] as any[],
  };

  const tagMap: Record<string, any[]> = {};

  for (const [pathStr, methods] of Object.entries<any>(spec.paths || {})) {
    for (const [method, op] of Object.entries<any>(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete'].indexOf(method) === -1) continue;

      const tags: string[] = op.tags || ['Default'];
      const tag = tags[0];
      if (!tagMap[tag]) tagMap[tag] = [];

      const item: any = {
        name: op.summary || `${method.toUpperCase()} ${pathStr}`,
        request: {
          method: method.toUpperCase(),
          header: [{ key: 'Content-Type', value: 'application/json' }],
          url: {
            raw: `{{baseUrl}}${pathStr}`,
            host: ['{{baseUrl}}'],
            path: pathStr.split('/').filter(Boolean),
          },
        },
        response: [],
      };

      // Add request body if present
      const body = op.requestBody?.content?.['application/json']?.schema;
      if (body) {
        item.request.body = {
          mode: 'raw',
          raw: JSON.stringify(buildExample(body, spec.components?.schemas || {}), null, 2),
          options: { raw: { language: 'json' } },
        };
      }

      tagMap[tag].push(item);
    }
  }

  for (const [tag, items] of Object.entries(tagMap)) {
    collection.item.push({ name: tag, item: items });
  }

  return collection;
}

function buildExample(schema: any, schemas: any): any {
  if (!schema) return {};
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop();
    return buildExample(schemas[name] || {}, schemas);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.type === 'object' || schema.properties) {
    const obj: any = {};
    for (const [k, v] of Object.entries<any>(schema.properties || {})) {
      obj[k] = buildExample(v, schemas);
    }
    return obj;
  }
  if (schema.type === 'array') return [buildExample(schema.items || {}, schemas)];
  if (schema.type === 'string') return schema.enum?.[0] || 'string';
  if (schema.type === 'number' || schema.type === 'integer') return 0;
  if (schema.type === 'boolean') return true;
  return null;
}

async function main() {
  console.log(`Fetching OpenAPI spec from ${OPENAPI_URL}...`);
  const spec = await fetchJson(OPENAPI_URL);
  console.log(`Generating Postman collection for "${spec.info?.title}"...`);
  const collection = openApiToPostman(spec);
  fs.writeFileSync(OUT_FILE, JSON.stringify(collection, null, 2));
  console.log(`✅ Postman collection written to ${OUT_FILE}`);
  console.log(`   ${collection.item.length} tag groups, import into Postman to use.`);
}

main().catch((err) => {
  console.error('❌ Export failed:', err.message);
  process.exit(1);
});

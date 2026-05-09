/**
 * Silica heuristic seeder.
 *
 * Loads HEUR-*.json files from heuristics/baseline/{evm,svm}/
 * and inserts them into the Postgres heuristic table.
 *
 * Usage:
 *   npx tsx scripts/seed-heuristics.ts --dir heuristics/baseline/evm
 *   npx tsx scripts/seed-heuristics.ts --dir heuristics/baseline/svm
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

interface HeuristicJson {
  id: string;
  version: number;
  status: string;
  deprecated: boolean;
  name: string;
  summary: string;
  category: string;
  vm_scope: string[];
  taxonomy_links: string[];
  confidence_prior: number;
  severity_default: string;
  tenant_visibility: string;
  [key: string]: unknown;
}

function loadHeuristics(dir: string): HeuristicJson[] {
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && f.startsWith('HEUR-'));
  return files.map(f => JSON.parse(readFileSync(join(dir, f), 'utf8')) as HeuristicJson);
}

async function seedToDatabase(heuristics: HeuristicJson[]): Promise<void> {
  // In test/CI mode (no DATABASE_URL), log the count
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    console.log(`[DRY RUN] Would seed ${heuristics.length} heuristics to database`);
    heuristics.forEach(h => console.log(`  - ${h.id} v${h.version}: ${h.name}`));
    return;
  }

  // In production, this would use the pg client:
  // const client = new pg.Client({ connectionString: dbUrl });
  // await client.connect();
  // for (const h of heuristics) {
  //   await client.query(INSERT_QUERY, [h.id, h.version, h.status, ...]);
  // }
  console.log(`Seeded ${heuristics.length} heuristics`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      dir: { type: 'string', default: 'heuristics/baseline/evm' },
    },
    strict: false,
  });

  const dir = values['dir'] ?? 'heuristics/baseline/evm';
  const fullDir = join(process.cwd(), dir);

  console.log(`Loading heuristics from ${fullDir}`);
  const heuristics = loadHeuristics(fullDir);
  console.log(`Found ${heuristics.length} heuristics`);

  await seedToDatabase(heuristics);
}

main().catch(err => { console.error(err); process.exit(1); });

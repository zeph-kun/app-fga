import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Reconciler } from './lifecycle/reconciler.js';

/**
 * `npm run reconcile` lists what Postgres and OpenFGA disagree about; `-- --apply` repairs it.
 * Run it with the API stopped (see `Reconciler`). Exits 1 when it finds something it did not repair.
 */
const apply = process.argv.includes('--apply');
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
try {
  const findings = await app.get(Reconciler).reconcile({ apply });
  for (const finding of findings) console.log(`${apply ? 'repaired' : 'found'}: ${JSON.stringify(finding)}`);
  console.log(
    findings.length === 0
      ? 'Postgres and OpenFGA agree.'
      : `${findings.length} difference(s) ${apply ? 'repaired' : 'found; run with --apply to repair them'}.`,
  );
  process.exitCode = findings.length > 0 && !apply ? 1 : 0;
} finally {
  await app.close();
}

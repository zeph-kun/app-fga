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
  // A loop of Folders is only reported: somebody has to move one of them.
  const unrepairable = findings.filter((finding) => finding.kind === 'parent-cycle');
  for (const finding of findings) {
    console.log(`${apply && finding.kind !== 'parent-cycle' ? 'repaired' : 'found'}: ${JSON.stringify(finding)}`);
  }
  console.log(
    findings.length === 0
      ? 'Postgres and OpenFGA agree.'
      : `${findings.length} difference(s) ${apply ? 'handled' : 'found; run with --apply to repair them'}.`,
  );
  if (apply && unrepairable.length > 0) console.log(`${unrepairable.length} loop(s) of Folders to untangle by moving a Folder.`);
  process.exitCode = findings.length > 0 && (!apply || unrepairable.length > 0) ? 1 : 0;
} finally {
  await app.close();
}

import fs from 'fs';
import IndexerConfig from './indexer-config/indexer-config';
import { LogLevel } from './indexer-meta/log-entry';
import Provisioner from './provisioner';

void (async function main () {
  const contract = JSON.parse(fs.readFileSync('./src/dev-contract.json', 'utf8'));
  const provisioner: Provisioner = new Provisioner();

  // eslint-disable-next-line no-unreachable-loop
  for (const account in contract) {
    if (account === 'darunrs.near') {
      continue;
    }
    for (const functionName in contract[account]) {
      const config = new IndexerConfig('', account, functionName, 0, '', '', LogLevel.INFO);
      console.log(account, functionName);
      await provisioner.addBackendOnlyPermission(config);
    }
  }
})();

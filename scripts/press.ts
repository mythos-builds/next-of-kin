// Press a button of a deployed vault, as anyone: no key, no coin (the vault pays the network).
// VAULT=<category> ACTION=warn|release|state npx solidhat run scripts/press.ts --network mainnet
import { appendFileSync, readFileSync } from 'node:fs';
import { StatefulContract } from '@solidcash/solidcash/stateful';
import { ethers, network } from '@solidcash/solidhat/hardhat3';
import { requirePhrase } from './guard.ts';

requirePhrase();
const provider: any = (network as any).provider;
const category = process.env.VAULT!;
const action = process.env.ACTION ?? 'state';
const deployments = readFileSync(`deployments/${network.name}.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const born = deployments.find((d) => d.step === 'deploy' && d.category === category);
if (!born) throw new Error(`no deployment with category ${category}`);
const [owner, heirA, heirB] = await ethers.getSigners(3);
const args = [owner.publicKey, heirA.pkh, heirB.pkh, 60n, 1n, 1n]; // as scripts/lifecycle.ts deployed it
const artifact = JSON.parse(readFileSync('artifacts/solidcash/NextOfKin.json', 'utf8'));
const vault: any = StatefulContract.from(artifact, args, { provider, addressType: 'p2sh32' }, category);
const state = await vault.getState();
console.log(`vault ${category.slice(0, 8)}… phase ${state.phase} checkIns ${state.checkIns} · holds ${await vault.satoshiContainer.getBalance()} sat`);
if (action === 'warn' || action === 'release') {
  const sent = await vault.call[action]().setSequence(1).send();
  console.log(`${action}: ${sent.txid}`);
  appendFileSync(`deployments/${network.name}.jsonl`, JSON.stringify({
    vault: born.vault, step: action, txid: sent.txid, at: new Date().toISOString(), tip: await provider.getBlockHeight(), by: 'nobody (no key, no coin)',
  }) + '\n');
}

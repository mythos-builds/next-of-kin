// Writes web/vaults.json: each mainnet vault's category, constructor arguments and transactions (all public).
// npx solidhat run scripts/export-vaults.ts --network mainnet
import { readFileSync, writeFileSync } from 'node:fs';
import { binToHex } from '@bitauth/libauth';
import { ethers, network } from '@solidcash/solidhat/hardhat3';
import { requirePhrase } from './guard.ts';

requirePhrase();
const [owner, heirA, heirB] = await ethers.getSigners(3);
const hex = (b: any) => (typeof b === 'string' ? b.replace(/^0x/, '') : binToHex(b));
const lines = readFileSync(`deployments/${network.name}.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const vaults = lines.filter((l) => l.step === 'deploy').map((d) => ({
  vault: d.vault,
  category: d.category,
  sats: d.sats,
  args: { owner: hex(owner.publicKey), heirA: hex(heirA.pkh), heirB: hex(heirB.pkh), shareA: 60, silence: 1, grace: 1 },
  addresses: { owner: owner.address, heirA: heirA.address, heirB: heirB.address },
  history: lines.filter((l) => l.vault === d.vault && l.txid).map((l) => ({ step: l.step, txid: l.txid, at: l.at, by: l.by })),
}));
writeFileSync('web/vaults.json', JSON.stringify({ network: network.name, vaults }, null, 1));
console.log(`web/vaults.json: ${vaults.length} vault(s)`);

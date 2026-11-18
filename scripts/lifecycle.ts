// The whole life of two vaults on a live network, with real transactions:
//   vault 1: deploy → check-in → (1 block) → anyone warns → (1 block) → anyone releases to the heirs (no key, no coin)
//   vault 2: deploy → check-in → the owner closes it at once (a fresh event coin stays behind, see lib/close.ts)
//   demo:    deploy → check-in, then left for anyone to warn and release from the demo page
// npx solidhat run scripts/lifecycle.ts --network mainnet   (SOLIDCASH_MNEMONIC_MAINNET_FILE=…)
import { appendFileSync, readFileSync } from 'node:fs';
import { SignatureTemplate } from '@solidcash/solidcash';
import { StatefulContract } from '@solidcash/solidcash/stateful';
import { ethers, network } from '@solidcash/solidhat/hardhat3';
import { closeVault } from '../lib/close.ts';
import { requirePhrase } from './guard.ts';

requirePhrase();
const SHARE_A = 60n, SILENCE = 1n, GRACE = 1n;
const LOG = `deployments/${network.name}.jsonl`;
const provider: any = (network as any).provider;
const [owner, heirA, heirB] = await ethers.getSigners(3);
const sig = (s: any) => new SignatureTemplate(s.privateKey);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function record(vault: number, step: string, txid: string, extra: object = {}) {
  const line = { vault, step, txid, at: new Date().toISOString(), tip: await provider.getBlockHeight(), ...extra };
  appendFileSync(LOG, JSON.stringify(line, (_k, v) => (typeof v === 'bigint' ? String(v) : v)) + '\n');
  console.log(`vault ${vault} · ${step.padEnd(8)} ${txid}`);
}

const handle = (kin: any): any => StatefulContract.withCategory(kin.inner, kin._categoryId);

/** The same vault with no signer: what anyone can do with no key and no coin (see UPSTREAM.md, F9). */
const artifact = JSON.parse(readFileSync('artifacts/solidcash/NextOfKin.json', 'utf8'));
const keyless = (kin: any): any => StatefulContract.from(artifact,
  [owner.publicKey, heirA.pkh, heirB.pkh, SHARE_A, SILENCE, GRACE], { provider, addressType: 'p2sh32' }, kin._categoryId);

/**
 * Send a call whose `this.age` check needs the state coin to be a block old: until then the network answers
 * non-BIP68-final, so wait for the next block and try again.
 */
async function whenOldEnough(send: () => Promise<any>, maxBlocks = 12) {
  for (let blocks = 0; ; blocks += 1) {
    try {
      return await send();
    } catch (e: any) {
      if (!/BIP68/i.test(String(e?.message)) || blocks >= maxBlocks) throw e;
      const tip = await provider.getBlockHeight();
      console.log(`  waiting for block ${tip + 1}…`);
      while ((await provider.getBlockHeight()) <= tip) await sleep(20_000);
    }
  }
}

const balance = async (address: string) =>
  (await provider.getUtxos(address)).filter((u: any) => !u.token).reduce((s: bigint, u: any) => s + BigInt(u.satoshis), 0n);

async function deploy(vault: number, satoshis: bigint) {
  // Name the genesis coin: the SDK's own pick ignores initialBalance and can take a vout-0 coin too small for it
  // (upstream finding F8). The largest plain vout-0 coin of the owner it is.
  const coins = (await provider.getUtxos(owner.address)).filter((u: any) => u.vout === 0 && !u.token);
  const fundingUtxo = coins.sort((x: any, y: any) => (BigInt(y.satoshis) > BigInt(x.satoshis) ? 1 : -1))[0];
  if (!fundingUtxo || BigInt(fundingUtxo.satoshis) < satoshis + 15_000n) throw new Error('no vout-0 coin big enough');
  const factory = await ethers.getContractFactory('NextOfKin', owner);
  const kin: any = await factory.deploy(owner.publicKey, heirA.pkh, heirB.pkh, SHARE_A, SILENCE, GRACE, {
    initialState: { phase: 0n, checkIns: 0n },
    initialBalance: satoshis,
    fundingUtxo, funder: (owner as any).unlockP2PKH(), changeAddress: owner.address,
  });
  await kin.waitForDeployment();
  await record(vault, 'deploy', kin.deploymentTransaction().txid, { category: kin._categoryId, sats: satoshis });
  return kin;
}

const only = (process.env.VAULTS ?? '2,1').split(',');

// A vault left watching, for anyone to warn and release from the demo page: VAULTS=demo DEMO_VAULT=3
if (only.includes('demo')) {
  const n = Number(process.env.DEMO_VAULT ?? 3);
  const demo = await deploy(n, 40_000n);
  await record(n, 'checkIn', (await demo.checkIn(sig(owner)).send()).txid);
}

// Vault 2 first: it needs no block, so its whole life is on chain before vault 1 waits for its first block.
if (only.includes('2')) {
const kin2 = await deploy(2, 20_000n);
await record(2, 'checkIn', (await kin2.checkIn(sig(owner)).send()).txid);
const closed: any = await closeVault({
  provider, contract: handle(kin2), destroyFunctionName: 'close', destroyFunctionArgs: [sig(owner)], recipient: owner.address,
} as any);
await record(2, 'close', closed.txs?.[0]?.txid ?? JSON.stringify(closed.txs?.[0] ?? closed), { reclaimed: closed.totalReclaimed });
}

if (only.includes('1')) {
const kin = await deploy(1, 40_000n);
await record(1, 'checkIn', (await kin.checkIn(sig(owner)).send()).txid);
const before = { a: await balance(heirA.address), b: await balance(heirB.address) };
const nobody = keyless(kin);
const warned = await whenOldEnough(() => nobody.call.warn().setSequence(Number(SILENCE)).send());
await record(1, 'warn', warned.txid, { by: 'nobody (no key, no coin)' });
const released = await whenOldEnough(() => nobody.call.release().setSequence(Number(GRACE)).send());
await record(1, 'release', released.txid, { by: 'nobody (no key, no coin)' });
await sleep(5_000);
await record(1, 'paid', '', {
  heirA: (await balance(heirA.address)) - before.a,
  heirB: (await balance(heirB.address)) - before.b,
  state: await kin.getState(),
});
}

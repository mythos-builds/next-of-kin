// Prints the four accounts of the selected network and what each holds.
// npx solidhat run scripts/accounts.ts --network mainnet
import { ethers, network } from '@solidcash/solidhat/hardhat3';
import { requirePhrase } from './guard.ts';

requirePhrase();
const names = ['owner', 'heir A', 'heir B', 'stranger'];
const signers = await ethers.getSigners(4);
const provider: any = (network as any).provider ?? (ethers as any).provider;
console.log(`network ${network.name} · tip ${await provider.getBlockHeight()}`);
for (const [i, s] of signers.entries()) {
  const utxos = await provider.getUtxos(s.address);
  const plain = utxos.filter((u: any) => !u.token);
  const sats = plain.reduce((sum: bigint, u: any) => sum + BigInt(u.satoshis), 0n);
  console.log(`${names[i].padEnd(8)} ${s.address}  ${sats} sat in ${plain.length} coin(s)` +
    `${utxos.length > plain.length ? `, +${utxos.length - plain.length} token coin(s)` : ''}`);
}

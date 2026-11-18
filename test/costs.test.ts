import { writeFileSync } from 'node:fs';
import { decodeTransaction, hexToBin } from '@bitauth/libauth';
import { SignatureTemplate } from '@solidcash/solidcash';
import { StatefulContract } from '@solidcash/solidcash/stateful';
import { ethers, network } from '@solidcash/testing';

// Not a check: writes the size and fee of each kind of transaction to COSTS_OUT, for the README.
const OUT = process.env.COSTS_OUT;
const d = OUT ? describe : describe.skip;

d('costs', () => {
  it('measures each call', async () => {
    const p: any = network.provider;
    const rows: any[] = [];
    const send = p.sendRawTransaction.bind(p);
    const utxoValue = new Map<string, bigint>();
    p.sendRawTransaction = async (hex: string) => {
      const tx: any = decodeTransaction(hexToBin(hex));
      const outs = tx.outputs.reduce((s: bigint, o: any) => s + o.valueSatoshis, 0n);
      let ins = 0n;
      for (const i of tx.inputs) {
        const key = Buffer.from(i.outpointTransactionHash).toString('hex') + ':' + i.outpointIndex;
        ins += utxoValue.get(key) ?? 0n;
      }
      const txid = await send(hex);
      tx.outputs.forEach((o: any, n: number) => utxoValue.set(txid + ':' + n, o.valueSatoshis));
      rows.push({ bytes: hex.length / 2, inputs: tx.inputs.length, outputs: tx.outputs.length,
        fee: ins > 0n ? String(ins - outs) : '?', smallOutputs: tx.outputs.filter((o: any) => o.token).map((o: any) => String(o.valueSatoshis)) });
      return txid;
    };
    const [owner, heirA, heirB] = await ethers.getSigners();
    const f = await ethers.getContractFactory('NextOfKin', owner);
    const kin: any = await f.deploy(owner.publicKey, heirA.pkh, heirB.pkh, 60n, 3n, 2n, { initialState: { phase: 0n, checkIns: 0n }, initialBalance: 100000n });
    await kin.waitForDeployment();
    const mineBlocks = async (n: number) => p.mineUpTo((p.indexer.getTip()?.height ?? 0) + n);
    const label = (l: string) => { rows[rows.length - 1].call = l; };
    label('deploy');
    await kin.checkIn(new SignatureTemplate(owner.privateKey)).send(); label('checkIn');
    await mineBlocks(3); await kin.warn().setSequence(3).send(); label('warn');
    await mineBlocks(2); await kin.release().setSequence(2).send(); label('release');
    // A released vault keeps only its state coins and 1,000 satoshis, less than a close costs: close a fresh one.
    const kin2: any = await f.deploy(owner.publicKey, heirA.pkh, heirB.pkh, 60n, 3n, 2n, { initialState: { phase: 0n, checkIns: 0n }, initialBalance: 100000n });
    await kin2.waitForDeployment();
    label('deploy');
    const sc: any = StatefulContract.withCategory(kin2.inner, kin2._categoryId);
    const { closeVault } = await import('../lib/close.js');
    await closeVault({ provider: p, contract: sc, destroyFunctionName: 'close', destroyFunctionArgs: [new SignatureTemplate(owner.privateKey)], recipient: owner.address } as any);
    label('close');
    p.sendRawTransaction = send;
    writeFileSync(OUT!, JSON.stringify(rows, null, 1));
  });
});

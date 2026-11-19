import { binToHex, cashAddressToLockingBytecode, decodeTransaction, encodeTransaction, hexToBin } from '@bitauth/libauth';
import { SignatureTemplate } from '@solidcash/solidcash';
import { StatefulContract, getEventNftAddress } from '@solidcash/solidcash/stateful';
import { ethers, loadFixture, network } from '@solidcash/testing';
import { expect } from '@solidcash/testing/chai';
import { sha256 } from '@solidcash/utils';
import { closeVault } from '../lib/close.js';

const SILENCE = 10n;
const GRACE = 5n;
const SHARE_A = 60n;
const VAULT = 100_000n;
const MINER_FEE = 5_500n;
const KEEP = 1_000n;
const Phase = { Watching: 0n, Warned: 1n, Released: 2n };

const provider = () => network.provider as any;

/**
 * Mine `n` blocks on top of the chain's real tip. The mock auto-mines one block per accepted transaction, but its
 * `mine(n)` counts from its own height counter, which those blocks do not move: after k sends, `mine(n)` adds only
 * n - k blocks. Relative timelocks are tested to the block here, so count from the real tip.
 */
async function mineBlocks(n: number) {
  const p = provider();
  const tip = p.indexer.getTip()?.height ?? (await p.getBlockHeight());
  await p.mineUpTo(tip + n);
}

async function balanceOf(address: string): Promise<bigint> {
  const utxos = await provider().getUtxos(address);
  return utxos.reduce((sum: bigint, u: any) => sum + BigInt(u.satoshis), 0n);
}

/** Build a call exactly as the SDK would send it, stop it at the broadcast and hand back the raw transaction. */
async function intercept(call: any): Promise<string> {
  const p = provider();
  const send = p.sendRawTransaction;
  let hex = '';
  p.sendRawTransaction = async (raw: string) => { hex = raw; throw new Error('intercepted'); };
  try {
    await call.send();
  } catch (e: any) {
    if (!String(e.message).includes('intercepted')) throw e;
  } finally {
    p.sendRawTransaction = send;
  }
  return hex;
}

const decode = (hex: string): any => {
  const tx = decodeTransaction(hexToBin(hex));
  if (typeof tx === 'string') throw new Error(tx);
  return tx;
};

const lockOf = (address: string) => {
  const result = cashAddressToLockingBytecode(address);
  if (typeof result === 'string') throw new Error(result);
  return binToHex(result.bytecode);
};
const outputTo = (tx: any, address: string) => tx.outputs.findIndex((o: any) => binToHex(o.lockingBytecode) === lockOf(address));
const broadcast = (tx: any) => provider().sendRawTransaction(binToHex(encodeTransaction(tx)));

async function deployFixture() {
  const [owner, heirA, heirB, stranger] = await ethers.getSigners();
  const factory = await ethers.getContractFactory('NextOfKin', owner);
  const kin: any = await factory.deploy(owner.publicKey, heirA.pkh, heirB.pkh, SHARE_A, SILENCE, GRACE, {
    initialState: { phase: Phase.Watching, checkIns: 0n },
    initialBalance: VAULT,
  });
  await kin.waitForDeployment();
  const sig = (s: any) => new SignatureTemplate(s.privateKey);
  const handle = () => StatefulContract.withCategory(kin.inner, kin._categoryId) as any;
  return { kin, owner, heirA, heirB, stranger, sig, handle };
}

/** Silence, then the warning, then the grace period: the state in which anyone may release. */
async function warnedAndGraceOver(kin: any) {
  await mineBlocks(Number(SILENCE));
  await kin.warn().setSequence(Number(SILENCE)).send();
  await mineBlocks(Number(GRACE));
}

describe('NextOfKin: the clock', () => {
  it('starts watching, with the whole vault in the contract', async () => {
    const { kin } = await loadFixture(deployFixture);
    const state = await kin.getState();
    expect(state.phase).to.equal(Phase.Watching);
    expect(state.checkIns).to.equal(0n);
    expect(await kin.satoshiContainer.getBalance()).to.equal(VAULT);
  });

  it('refuses a warning while the owner was seen recently', async () => {
    const { kin } = await loadFixture(deployFixture);
    // Claiming less silence than the contract asks fails in the script itself...
    await expect(kin.warn().setSequence(Number(SILENCE) - 1)).to.be.revertedWith(/seen recently/);
    // ...and claiming the full silence is refused by the network until the state coin really is that old (BIP68):
    // the warning can enter a block `silence` blocks after the block of the deployment (or of the last check-in),
    // not one block sooner.
    await mineBlocks(Number(SILENCE) - 2);
    await expect(kin.warn().setSequence(Number(SILENCE)).send()).to.be.rejectedWith(/non-BIP68-final/);
    await mineBlocks(1);
    await expect(kin.warn().setSequence(Number(SILENCE))).to.emit(kin, 'Warned');
  });

  it('lets anyone warn after the silence, once', async () => {
    const { kin } = await loadFixture(deployFixture);
    await mineBlocks(Number(SILENCE));
    await expect(kin.warn().setSequence(Number(SILENCE))).to.emit(kin, 'Warned');
    expect((await kin.getState()).phase).to.equal(Phase.Warned);
    expect(await kin.satoshiContainer.getBalance()).to.equal(VAULT - MINER_FEE);
    await mineBlocks(Number(SILENCE));
    await expect(kin.warn().setSequence(Number(SILENCE))).to.be.revertedWithCustomError(kin, 'WrongPhase');
  });

  it('counts the grace period from the warning itself', async () => {
    const { kin } = await loadFixture(deployFixture);
    // The owner has been silent for much longer than silence + grace...
    await mineBlocks(Number(SILENCE + GRACE) * 3);
    await kin.warn().setSequence(Number(SILENCE)).send();
    // ...yet the heirs still wait the full grace period after the warning, so the owner always gets that chance.
    await expect(kin.release().setSequence(Number(GRACE) - 1).send()).to.be.rejectedWith(/grace period not over/);
    await expect(kin.release().setSequence(Number(GRACE)).send()).to.be.rejectedWith(/non-BIP68-final/);
  });

  it('a check-in cancels the warning and restarts the clock', async () => {
    const { kin, owner, sig } = await loadFixture(deployFixture);
    await mineBlocks(Number(SILENCE));
    await kin.warn().setSequence(Number(SILENCE)).send();
    await expect(kin.checkIn(sig(owner))).to.emit(kin, 'CheckedIn').withArgs(1n);
    const state = await kin.getState();
    expect(state.phase).to.equal(Phase.Watching);
    expect(state.checkIns).to.equal(1n);
    await mineBlocks(Number(GRACE));
    await expect(kin.release().setSequence(Number(GRACE)).send()).to.be.rejectedWith(/no warning yet/);
    // The silence starts again from the check-in.
    await mineBlocks(Number(SILENCE - GRACE) - 2);
    await expect(kin.warn().setSequence(Number(SILENCE)).send()).to.be.rejectedWith(/non-BIP68-final/);
    await mineBlocks(1);
    await expect(kin.warn().setSequence(Number(SILENCE))).to.emit(kin, 'Warned');
  });
});

describe('NextOfKin: the release', () => {
  it('pays each heir their share, with no key of the owner', async () => {
    const { kin, heirA, heirB } = await loadFixture(deployFixture);
    const beforeA = await balanceOf(heirA.address);
    const beforeB = await balanceOf(heirB.address);
    await warnedAndGraceOver(kin);
    const estate = VAULT - MINER_FEE /* warn */ - MINER_FEE /* release */ - KEEP;
    const toA = (estate * SHARE_A) / 100n;
    await expect(kin.release().setSequence(Number(GRACE))).to.emit(kin, 'Released').withArgs(toA, estate - toA);
    expect((await balanceOf(heirA.address)) - beforeA).to.equal(toA);
    expect((await balanceOf(heirB.address)) - beforeB).to.equal(estate - toA);
    expect((await kin.getState()).phase).to.equal(Phase.Released);
    expect(await kin.satoshiContainer.getBalance()).to.equal(KEEP);
  });

  it('a stranger can sound the warning and release, and pays nothing: the vault pays the network', async () => {
    const { kin, stranger, heirA } = await loadFixture(deployFixture);
    const before = await balanceOf(stranger.address);
    await mineBlocks(Number(SILENCE));
    await kin.connect(stranger).warn().setSequence(Number(SILENCE)).send();
    await mineBlocks(Number(GRACE));
    const beforeA = await balanceOf(heirA.address);
    await kin.connect(stranger).release().setSequence(Number(GRACE)).send();
    expect(await balanceOf(stranger.address)).to.equal(before);
    expect((await balanceOf(heirA.address)) > beforeA).to.equal(true);
  });

  it('cannot run twice on the same coins', async () => {
    const { kin } = await loadFixture(deployFixture);
    await warnedAndGraceOver(kin);
    await kin.release().setSequence(Number(GRACE)).send();
    await mineBlocks(Number(GRACE));
    // The SDK refuses before the script runs: its transfer derivation sees the vault cannot pay (upstream finding F5).
    await expect(kin.release().setSequence(Number(GRACE)).send())
      .to.be.rejectedWith(/nothing left to release|exceeds satoshi container balance/);
  });

  it('refuses a release that shifts value from heir B to heir A (covenant, not SDK)', async () => {
    const { kin, heirA, heirB } = await loadFixture(deployFixture);
    await warnedAndGraceOver(kin);
    const original = await intercept(kin.release().setSequence(Number(GRACE)));
    const tx = decode(original);
    const a = outputTo(tx, heirA.address), b = outputTo(tx, heirB.address);
    expect(a).to.be.greaterThan(-1);
    expect(b).to.be.greaterThan(-1);
    // No signature covers a release, so the transaction can be edited freely: only the covenant stands in the way.
    tx.outputs[a].valueSatoshis += 5_000n;
    tx.outputs[b].valueSatoshis -= 5_000n;
    await expect(broadcast(tx)).to.be.rejectedWith(/mandatory-script-verify-flag-failed/);
    // Control: the untouched transaction is valid.
    expect(typeof (await provider().sendRawTransaction(original))).to.equal('string');
  });

  it('refuses a release that skims the vault into a third output (covenant, not SDK)', async () => {
    const { kin, stranger } = await loadFixture(deployFixture);
    await warnedAndGraceOver(kin);
    const original = await intercept(kin.release().setSequence(Number(GRACE)));
    const tx = decode(original);
    // Take 900 satoshis out of what stays in the vault and pay 800 of them to a stranger (the rest pays for the bytes).
    const vault = tx.outputs.findIndex((o: any) => o.valueSatoshis === KEEP && !o.token);
    expect(vault).to.be.greaterThan(-1);
    tx.outputs[vault].valueSatoshis -= 900n;
    tx.outputs.push({ lockingBytecode: hexToBin(lockOf(stranger.address)), valueSatoshis: 800n });
    await expect(broadcast(tx)).to.be.rejectedWith(/mandatory-script-verify-flag-failed/);
    expect(typeof (await provider().sendRawTransaction(original))).to.equal('string');
  });
});

describe('NextOfKin: the owner', () => {
  it('only the owner can check in', async () => {
    const { kin, stranger, heirA, sig } = await loadFixture(deployFixture);
    await expect(kin.checkIn(sig(stranger))).to.be.revertedWithCustomError(kin, 'NotOwner');
    await expect(kin.checkIn(sig(heirA))).to.be.revertedWithCustomError(kin, 'NotOwner');
  });

  it('the owner can close the vault and take everything back, right after a check-in', async () => {
    const { kin, owner, sig, handle } = await loadFixture(deployFixture);
    await kin.checkIn(sig(owner)).send(); // leaves a fresh CheckedIn event NFT behind
    const before = await balanceOf(owner.address);
    const result: any = await closeVault({
      provider: provider(), contract: handle(), destroyFunctionName: 'close',
      destroyFunctionArgs: [sig(owner)], recipient: owner.address,
    } as any);
    expect(result.txs.length).to.equal(1);
    const gained = (await balanceOf(owner.address)) - before;
    expect(gained).to.equal(result.totalReclaimed);
    expect(gained > VAULT - 5_000n).to.equal(true); // the vault, its state coins, minus one network fee
    expect(await balanceOf(handle().tokenAddress)).to.equal(0n);
  });

  /** The mock as an Electrum server lists it: each coin with its confirmation height, and the tip of the same index. */
  const withHeights = (p: any) => new Proxy(p, {
    get(target, prop) {
      if (prop === 'getBlockHeight') return async () => target.indexer.getTip().height;
      if (prop === 'getUtxos') {
        return async (address: string) => {
          const heights = new Map(target.indexer.getUtxos(binToHex(sha256(hexToBin(lockOf(address)))))
            .map((entry: any) => [`${entry.outpoint.txid}:${entry.outpoint.vout}`, entry.height]));
          return (await target.getUtxos(address)).map((u: any) => ({ ...u, blockHeight: heights.get(`${u.txid}:${u.vout}`) }));
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const checkInNfts = async (contract: any) => provider().getUtxos(getEventNftAddress(contract.inner, contract.categoryId,
    contract.inner.artifact.events.find((ev: any) => ev.name === 'CheckedIn').signature));
  const closeAsOwner = (p: any, contract: any, owner: any, sig: any) => closeVault({
    provider: p, contract, destroyFunctionName: 'close', destroyFunctionArgs: [sig(owner)], recipient: owner.address,
  } as any);

  it('with heights listed, as Electrum lists them, the young event NFT stays and the vault still closes', async () => {
    const { kin, owner, sig, handle } = await loadFixture(deployFixture);
    await kin.checkIn(sig(owner)).send();
    const result: any = await closeAsOwner(withHeights(provider()), handle(), owner, sig);
    expect(result.txs.length).to.equal(1);
    expect((await checkInNfts(handle())).length).to.equal(1);
  });

  it('once the event delay has passed, closing also sweeps the expired event NFT', async () => {
    const { kin, owner, sig, handle } = await loadFixture(deployFixture);
    await kin.checkIn(sig(owner)).send();
    expect((await checkInNfts(handle())).length).to.equal(1);
    await mineBlocks(144);
    await closeAsOwner(withHeights(provider()), handle(), owner, sig);
    expect((await checkInNfts(handle())).length).to.equal(0);
  });

  it('nobody else can close the vault', async () => {
    const { kin, stranger, heirA, sig, handle } = await loadFixture(deployFixture);
    for (const who of [stranger, heirA]) {
      await expect(closeVault({
        provider: provider(), contract: handle(), destroyFunctionName: 'close',
        destroyFunctionArgs: [sig(who)], recipient: who.address,
      } as any)).to.be.rejected;
    }
    expect(await kin.satoshiContainer.getBalance()).to.equal(VAULT);
  });
});

import { binToHex } from "@bitauth/libauth/build/lib/format/hex.js";
import { keccak_256 as keccak256 } from "@noble/hashes/sha3.js";
import {
  buildEcrecoverComputeRedeem,
  ecrecoverComputeLockingBytecode,
  ecrecoverComputeResultCommitment,
  keccakComputeLockingBytecode
} from "@solidcash/utils";
import {
  buildEcrecoverComputeSidecars,
  buildEcrecoverComputeSidecars3,
  buildEcrecoverPlaceholderSidecars,
  extractEcrecoverArgBlobsFromTrace,
  probeEcrecoverSplit,
  probeEcrecoverSplit3
} from "../ecrecover/ecrecoverComputeSidecar.js";
import { computeEcrecoverWitness, ecrecoverRefusal } from "../ecrecover/ecrecoverRecovery.js";
import { buildKeccakComputeSidecar, pushDataBytes } from "../keccak/keccakComputeSidecar.js";
import { computeSideCarStandIn } from "./stateful-abi-resolve.js";
const MAX_RECOVERY_LOOP_ITERATIONS = 64;
const SHARED_SALT = new Uint8Array(32);
const probeCoin = (role, index, lock, unlocking, nft = true) => ({
  txid: `${"ec".repeat(27)}${role.toString(16).padStart(2, "0")}${(index + 1).toString(16).padStart(8, "0")}`,
  vout: 0,
  satoshis: 100000n,
  ...nft ? { token: { category: "ec".repeat(32), amount: 0n, nft: { capability: "mutable", commitment: "" } } } : {},
  unlocker: { generateLockingBytecode: () => lock, generateUnlockingBytecode: () => unlocking }
});
const nftOutput = (lock, commitment) => ({
  to: lock,
  amount: 100000n,
  token: { category: "ec".repeat(32), amount: 0n, nft: { capability: "mutable", commitment: binToHex(commitment) } }
});
async function resolveStatefulEcrecoverLoop(host, abiFunction, masterUtxo, stateInputUnlocker, dataNftUtxos, dataNftUnlockers, front, locktime = 0, chain = []) {
  const blockSize = abiFunction.blockLayout?.blockSize ?? 1;
  if (blockSize !== 1 + dataNftUtxos.length + front.length) {
    throw new Error("stateful ecrecover loop: the inputs before the loop do not fill the block, so its recovery triples cannot start at the end of the block");
  }
  const base = blockSize + chain.length;
  const flags = abiFunction.ecrecoverEvmFlags ?? [];
  const evm = flags.length > 0 && flags.every(Boolean);
  if (!evm && flags.some(Boolean)) {
    throw new Error("stateful ecrecover loop: the loop makes both ecrecoverEvm and another recovery; their triples differ, and the SDK lays out one shape per loop");
  }
  const salt = SHARED_SALT;
  const lockA = ecrecoverComputeLockingBytecode(salt, "A");
  const lockB = ecrecoverComputeLockingBytecode(salt, evm ? "B" : "B2");
  const lockM = ecrecoverComputeLockingBytecode(salt, "M");
  const lockB3 = ecrecoverComputeLockingBytecode(salt, "B3");
  const lockK = keccakComputeLockingBytecode(salt, true);
  const redeemA = buildEcrecoverComputeRedeem(salt, "A");
  const empty = new Uint8Array(0);
  const probeTriple = (index, witness) => {
    const argBlob = witness?.argBlob ?? new Uint8Array(97);
    const a = probeCoin(1, index, lockA, Uint8Array.from([
      ...pushDataBytes(empty),
      ...pushDataBytes(argBlob),
      ...pushDataBytes(empty),
      ...pushDataBytes(empty),
      ...pushDataBytes(redeemA)
    ]));
    const q = witness === void 0 ? new Uint8Array(34) : ecrecoverComputeResultCommitment(witness.compressedQ);
    const b = probeCoin(2, index, lockB, Uint8Array.from(pushDataBytes(empty)));
    if (evm) {
      const key = witness?.uncompressedPubkey ?? new Uint8Array(64);
      const k = probeCoin(3, index, lockK, Uint8Array.from([
        ...pushDataBytes(empty),
        ...pushDataBytes(key),
        ...pushDataBytes(Uint8Array.of(1))
      ]));
      return [
        { input: a, recreate: nftOutput(lockA, new Uint8Array(32)) },
        { input: b, recreate: nftOutput(lockB, q) },
        { input: k, recreate: nftOutput(lockK, keccak256(key)) }
      ];
    }
    const m = unreadProbe(4, index);
    return [
      { input: a, recreate: nftOutput(lockA, new Uint8Array(32)) },
      m,
      { input: b, recreate: nftOutput(lockB, q) }
    ];
  };
  function unreadProbe(role, index) {
    const coin = probeCoin(role, index, Uint8Array.of(81), Uint8Array.of(81), false);
    return { input: coin, recreate: { to: Uint8Array.of(81), amount: coin.satoshis } };
  }
  const proofTriple = (index, proof) => [
    {
      input: probeCoin(1, index, lockA, Uint8Array.from([
        ...pushDataBytes(proof),
        ...pushDataBytes(new Uint8Array(97)),
        ...pushDataBytes(empty),
        ...pushDataBytes(empty),
        ...pushDataBytes(redeemA)
      ])),
      recreate: nftOutput(lockA, new Uint8Array(32))
    },
    unreadProbe(6, 3 * index + 1),
    unreadProbe(6, 3 * index + 2)
  ];
  const { CovenantTransactionBuilder } = await import("./CovenantTransactionBuilder.js");
  const vm = host.createVirtualMachine(host.vmProvider);
  const calls = [];
  for (; ; ) {
    const next = calls.length;
    const probe = new CovenantTransactionBuilder({ provider: host.vmProvider });
    if (locktime > 0) probe.setLocktime(locktime);
    probe.addInput(masterUtxo, stateInputUnlocker, masterUtxo.options);
    dataNftUtxos.forEach((utxo, index2) => probe.addInput(utxo, dataNftUnlockers[index2]));
    const ahead = MAX_RECOVERY_LOOP_ITERATIONS + 1 - next;
    const triples = [
      ...calls.flatMap((call, index2) => call === null ? [unreadProbe(5, 3 * index2), unreadProbe(5, 3 * index2 + 1), unreadProbe(5, 3 * index2 + 2)] : "offCurveProof" in call ? proofTriple(index2, call.offCurveProof) : probeTriple(index2, call)),
      ...Array.from({ length: ahead }, (_, offset) => probeTriple(next + offset, void 0)).flat()
    ];
    for (const { input } of [...front, ...chain, ...triples]) probe.addInputs([input]);
    probe.addOutput({
      to: stateInputUnlocker.generateLockingBytecode(),
      amount: masterUtxo.satoshis,
      token: masterUtxo.token
    });
    dataNftUtxos.forEach((utxo, index2) => probe.addOutput({
      to: dataNftUnlockers[index2].generateLockingBytecode(),
      amount: utxo.satoshis,
      token: utxo.token
    }));
    for (const { recreate } of [...front, ...chain, ...triples]) probe.addOutput(recreate);
    const transaction = probe.buildLibauthTransaction();
    const sourceOutputs = host.generateLibauthSourceOutputs(probe.inputs);
    const trace = vm.debug({ inputIndex: 0, sourceOutputs, transaction });
    const reads = extractEcrecoverArgBlobsFromTrace(trace, new Map(
      Array.from({ length: ahead }, (_, offset) => [base + 3 * (next + offset), next + offset])
    ));
    if (reads.size === 0) break;
    const index = Math.min(...reads.keys());
    if (index >= MAX_RECOVERY_LOOP_ITERATIONS) {
      throw new Error(`stateful ecrecover loop: more than ${MAX_RECOVERY_LOOP_ITERATIONS} recovery calls`);
    }
    while (calls.length < index) calls.push(null);
    const argBlob = reads.get(index);
    const [hash, v, r, s] = [argBlob.slice(0, 32), argBlob[32], argBlob.slice(33, 65), argBlob.slice(65, 97)];
    const refusal = ecrecoverRefusal(hash, v, r, s);
    calls.push(refusal === void 0 ? computeEcrecoverWitness(hash, v, r, s) : refusal.kind === "atInfinity" ? computeEcrecoverWitness(refusal.shiftedHash, v, r, s) : refusal.kind === "offCurve" ? { offCurveProof: refusal.proof } : null);
  }
  if (calls.length === 0) return { sideCars: [], recreates: [] };
  const recoveries = calls.filter((call) => call !== null).length;
  const pools = /* @__PURE__ */ new Map();
  const taken = /* @__PURE__ */ new Map();
  const take = async (role, lock) => {
    const key = binToHex(lock);
    let pool = pools.get(key);
    if (pool === void 0) {
      pool = (await host.provider.getUtxosForLockingBytecode(lock)).filter((utxo) => utxo.token?.nft?.capability === "mutable");
      pools.set(key, pool);
    }
    const index = taken.get(key) ?? 0;
    if (index >= pool.length && typeof host.provider.addUtxo === "function") {
      await host.provider.addUtxo.call(host.provider, key, computeSideCarStandIn("ecrecover-loop-sidecar", lock, index));
      pool = (await host.provider.getUtxosForLockingBytecode(lock)).filter((utxo) => utxo.token?.nft?.capability === "mutable");
      pools.set(key, pool);
    }
    const coin = pool[index];
    if (coin === void 0) {
      throw new Error(`ecrecoverPubKey needs ${recoveries} ${role} recovery side-car UTXO(s) in the shared pool for its loop; found ${pool.length}. Deploy one recovery set per loop iteration.`);
    }
    taken.set(key, index + 1);
    return coin;
  };
  const unread = async (why) => {
    const coin = await host.takeMiddleCoin();
    if (coin === void 0) {
      throw new Error(`stateful ecrecover loop: ${why} takes a wallet coin no covenant reads, and the call has none; connect a signer with a spare coin`);
    }
    return coin;
  };
  const sideCars = [];
  const recreates = [];
  for (const [call, witness] of calls.entries()) {
    if (witness !== null && "offCurveProof" in witness) {
      const coinA2 = await take("A", lockA);
      const carrier = buildEcrecoverPlaceholderSidecars(salt, coinA2, coinA2, witness.offCurveProof, evm ? "B" : "B2");
      sideCars.push({ ...coinA2, unlocker: carrier.unlockerA });
      recreates.push(carrier.recreateA);
      for (let slot = 1; slot < 3; slot += 1) {
        const coin = await unread(`recovery call ${call}, whose r no curve point has, holds two slots and`);
        sideCars.push(coin.input);
        recreates.push(coin.recreate);
      }
      continue;
    }
    if (witness === null) {
      for (let slot = 0; slot < 3; slot += 1) {
        const coin = await unread(`recovery call ${call}, whose arguments recover no key, holds three slots and`);
        sideCars.push(coin.input);
        recreates.push(coin.recreate);
      }
      continue;
    }
    const coinA = await take("A", lockA);
    if (evm) {
      const coinB2 = await take("B", lockB);
      let chunkA2;
      try {
        chunkA2 = probeEcrecoverSplit(witness, salt, coinA, coinB2);
      } catch (error) {
        throw new Error(`stateful ecrecover loop: an ecrecoverEvm recovery has no two-input split (${error.message})`);
      }
      const built2 = buildEcrecoverComputeSidecars(witness, chunkA2, salt, coinA, coinB2);
      const coinK = await take("keccak", lockK);
      const hashed = buildKeccakComputeSidecar(witness.uncompressedPubkey, salt, coinK, true);
      sideCars.push(
        { ...coinA, unlocker: built2.unlockerA },
        { ...coinB2, unlocker: built2.unlockerB },
        { ...coinK, unlocker: hashed.unlocker }
      );
      recreates.push(built2.recreateA, built2.recreateB, hashed.recreate);
      continue;
    }
    let chunkA;
    try {
      chunkA = probeEcrecoverSplit(witness, salt, coinA, coinA);
    } catch {
      chunkA = void 0;
    }
    if (chunkA === void 0) {
      const coinM = await take("M", lockM);
      const coinB3 = await take("B3", lockB3);
      const split = probeEcrecoverSplit3(witness, salt, coinA, coinM, coinB3);
      const built2 = buildEcrecoverComputeSidecars3(witness, split.chunkA, split.chunkM, salt, coinA, coinM, coinB3);
      sideCars.push(
        { ...coinA, unlocker: built2.unlockerA },
        { ...coinM, unlocker: built2.unlockerM },
        { ...coinB3, unlocker: built2.unlockerB }
      );
      recreates.push(built2.recreateA, built2.recreateM, built2.recreateB);
      continue;
    }
    const coinB = await take("B2", lockB);
    const built = buildEcrecoverComputeSidecars(witness, chunkA, salt, coinA, coinB, void 0, "B2");
    const middle = await unread("a two-covenant recovery's middle input");
    sideCars.push({ ...coinA, unlocker: built.unlockerA }, middle.input, { ...coinB, unlocker: built.unlockerB });
    recreates.push(built.recreateA, middle.recreate, built.recreateB);
  }
  return { sideCars, recreates };
}
export {
  resolveStatefulEcrecoverLoop
};

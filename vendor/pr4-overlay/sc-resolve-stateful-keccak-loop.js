import { binToHex, hexToBin } from "@bitauth/libauth/build/lib/format/hex.js";
import { keccakComputeLockingBytecode, keccakComputeLockingBytecodeShifted } from "@solidcash/utils";
import { buildKeccakComputeSidecar, scanKeccakBatchReads } from "../keccak/keccakComputeSidecar.js";
import { computeSideCarStandIn } from "./stateful-abi-resolve.js";
async function resolveStatefulKeccakLoop(host, abiFunction, masterUtxo, stateInputUnlocker, dataNftUtxos, dataNftUnlockers, frontRegionInputs = [], locktime = 0, trailingPredecessors = { inputs: [], outputs: [] }, trailingSuccessors) {
  const blockSize = abiFunction.blockLayout?.blockSize ?? 1;
  const sidecarBase = abiFunction.blockLayout?.trailingBase ?? blockSize;
  if (sidecarBase !== 1 + dataNftUtxos.length + frontRegionInputs.length) {
    throw new Error("stateful dynamic keccak256 loop: the front-region inputs (external reads / blockhash oracles) do not fill the slots before the trailing side-car region; cannot position the loop.");
  }
  const salt = host.sidecarSalt?.slice() ?? hexToBin(host.categoryId).slice().reverse();
  const outputDelta = trailingPredecessors.outputs.length - trailingPredecessors.inputs.length;
  const shifted = outputDelta !== 0;
  const lock = shifted ? keccakComputeLockingBytecodeShifted(salt) : keccakComputeLockingBytecode(salt, true);
  let scUtxos = (await host.inner.provider.getUtxosForLockingBytecode(lock)).filter((u) => u.token?.nft?.capability === "mutable");
  const syntheticSidecar = (index) => ({
    // A distinct txid domain: the front-region padder fabricates OP_TRUE funders as 00..<seq>, so a placeholder
    // in the same domain collided with a padded input once the loop band moved past the fixed block.
    txid: `${"ee".repeat(28)}${(index + 1).toString(16).padStart(8, "0")}`,
    vout: 0,
    satoshis: 1000n,
    token: {
      category: host.categoryId,
      amount: 0n,
      nft: { capability: "mutable", commitment: "00" }
    }
  });
  const sidecarAt = (index) => scUtxos[index] ?? syntheticSidecar(index);
  const ordinals = (abiFunction.keccakPreimageParams?.length ?? 0) < Number(abiFunction.externalLibraryCalls?.keccak256 ?? 0);
  const { CovenantTransactionBuilder } = await import("./CovenantTransactionBuilder.js");
  const vm = host.createVirtualMachine(host.inner.provider);
  const MAX_ITERS = 64;
  const slots = [];
  const probeBatch = (slot) => {
    const batch = slots[slot];
    if (batch === void 0 || batch.length === 0) return [new Uint8Array(0)];
    return batch.map((preimage) => preimage ?? new Uint8Array(0));
  };
  for (let k = 1; k <= MAX_ITERS + 1; k++) {
    if (k > slots.length + 1) break;
    const probe = new CovenantTransactionBuilder({ provider: host.inner.provider });
    if (locktime > 0) probe.setLocktime(locktime);
    const keccakInputBase = sidecarBase + trailingPredecessors.inputs.length;
    const masterUnlocker = trailingSuccessors?.unlockerAt(keccakInputBase + k) ?? stateInputUnlocker;
    probe.addInput(masterUtxo, masterUnlocker, masterUtxo.options);
    dataNftUtxos.forEach((u, i) => probe.addInput(u, dataNftUnlockers[i]));
    frontRegionInputs.forEach((u) => probe.addInputs([u]));
    trailingPredecessors.inputs.forEach((u) => probe.addInputs([u]));
    const recreates2 = [];
    for (let j = 0; j < k; j++) {
      const utxo = sidecarAt(j);
      const { unlocker, recreate } = buildKeccakComputeSidecar(
        probeBatch(j),
        salt,
        utxo,
        !shifted,
        false,
        outputDelta
      );
      probe.addInput(utxo, unlocker);
      recreates2.push(recreate);
    }
    trailingSuccessors?.inputs.forEach((u) => probe.addInputs([u]));
    probe.addOutput({
      to: stateInputUnlocker.generateLockingBytecode(),
      amount: masterUtxo.satoshis,
      token: masterUtxo.token
    });
    dataNftUtxos.forEach((u, i) => probe.addOutput({
      to: dataNftUnlockers[i].generateLockingBytecode(),
      amount: u.satoshis,
      token: u.token
    }));
    frontRegionInputs.forEach((u) => probe.addOutput(host.frontRegionRecreate(u)));
    trailingPredecessors.outputs.forEach((out) => probe.addOutput(out));
    for (const rec of recreates2) probe.addOutput({ ...rec, to: lock });
    trailingSuccessors?.outputs.forEach((out) => probe.addOutput(out));
    const transaction = probe.buildLibauthTransaction();
    const sourceOutputs = host.generateLibauthSourceOutputs(probe.inputs);
    const trace = vm.debug({ inputIndex: 0, sourceOutputs, transaction });
    const debugReads = scanKeccakBatchReads(trace, keccakInputBase, k, ordinals);
    let learned = false;
    let reachedNew = false;
    for (const read of debugReads) {
      if (read.slot === slots.length) {
        slots.push([]);
        reachedNew = true;
      } else if (read.slot > slots.length) {
        continue;
      }
      const batch = slots[read.slot];
      while (batch.length <= read.member) batch.push(null);
      if (batch[read.member] === null) {
        batch[read.member] = read.preimage;
        learned = true;
      }
    }
    if (!learned && !reachedNew) break;
    if (k > MAX_ITERS) throw new Error(`stateful dynamic keccak256 loop exceeds ${MAX_ITERS} iterations.`);
  }
  const preimages = slots.map((batch) => batch.map((preimage) => preimage ?? new Uint8Array(0)));
  const sideCars = [];
  const recreates = [];
  if (preimages.length > scUtxos.length) {
    const addUtxo = host.inner.provider.addUtxo;
    if (typeof addUtxo === "function") {
      for (let i = scUtxos.length; i < preimages.length; i++) {
        const standIn = computeSideCarStandIn("keccak-sidecar", lock, i);
        await addUtxo.call(host.inner.provider, binToHex(lock), standIn);
      }
      scUtxos = (await host.inner.provider.getUtxosForLockingBytecode(lock)).filter((u) => u.token?.nft?.capability === "mutable");
    }
  }
  if (preimages.length > scUtxos.length) {
    throw new Error(`stateful dynamic keccak256 loop needs >= ${preimages.length} compute side-car UTXOs at the branded address; found ${scUtxos.length}. Deploy more mutable-NFT side-cars.`);
  }
  for (let j = 0; j < preimages.length; j++) {
    const { unlocker, recreate } = buildKeccakComputeSidecar(
      preimages[j],
      salt,
      scUtxos[j],
      !shifted,
      false,
      outputDelta
    );
    sideCars.push({ ...scUtxos[j], unlocker });
    recreates.push(recreate);
  }
  return { sideCars, recreates };
}
export {
  resolveStatefulKeccakLoop
};

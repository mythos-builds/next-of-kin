import { hexToBin } from "@bitauth/libauth/build/lib/format/hex.js";
import {
  BALANCED_DUMMY_FUNDER_LOCKING_BYTECODE_HEX,
  isComputedBlockhashKey,
  oraclePoolBinding
} from "@solidcash/utils";
import {
  isContractUnlocker
} from "../interfaces.js";
import { createVirtualMachineBch2026ForProvider } from "../network/createVirtualMachine.js";
import { resolveBlockhashCoSpend } from "../oracle/blockhashCoSpend.js";
import { poolInfoCoSpend } from "../oracle/pool/reader.js";
import { generateLibauthSourceOutputs } from "../utils.js";
import { createDataNftUnlocker } from "./covenant-helpers.js";
import { sameOutpoint } from "./external-call-utxo-group.js";
import { extractBlockhashReadsFromTrace, unansweredBlockhashWalk } from "./trace-verified-value-helpers.js";
const DUMMY_FUNDER_LOCKING_BYTECODE = hexToBin(BALANCED_DUMMY_FUNDER_LOCKING_BYTECODE_HEX);
const DUMMY_FUNDER_UNLOCKING_BYTECODE = new Uint8Array([1, 81]);
const inertUnlocker = {
  generateLockingBytecode: () => DUMMY_FUNDER_LOCKING_BYTECODE,
  generateUnlockingBytecode: () => DUMMY_FUNDER_UNLOCKING_BYTECODE
};
async function placeBlockInfoOracle(host, builder, stateInputUnlocker, masterInputIndex) {
  if (!isContractUnlocker(stateInputUnlocker)) return;
  const abi = stateInputUnlocker.abiFunction;
  const info = abi.blockLayout?.slots.find((slot) => slot.kind === "blockInfoOracle");
  if (abi.usesBlockOracle !== true || info === void 0) return;
  const pool = stateInputUnlocker.contract.oraclePool;
  if (pool === void 0) return;
  const at = masterInputIndex + info.offset;
  while (builder.inputs.length < at) {
    const index = builder.inputs.length;
    builder.addInput(
      { txid: (33024 + index).toString(16).padStart(64, "0"), vout: 0, satoshis: 10000n },
      inertUnlocker
    );
    builder.addOutput({ to: DUMMY_FUNDER_LOCKING_BYTECODE, amount: 10000n });
  }
  if (builder.inputs.length !== at) return;
  const coSpend = await poolInfoCoSpend(host.inner.provider, pool).catch(() => void 0);
  if (coSpend === void 0) return;
  const { unlocker, ...oracle } = coSpend;
  builder.addInput(oracle, unlocker);
  builder.addOutput({ to: unlocker.generateLockingBytecode(), amount: oracle.satoshis, token: oracle.token });
}
function paramBlockhashN(readKey, args, abiFunction) {
  const visible = abiFunction.inputs.filter((i) => !i.name.startsWith("__internal__"));
  const pIdx = visible.findIndex((i) => i.name === readKey);
  if (pIdx < 0) return null;
  const bn = args[pIdx];
  return typeof bn === "bigint" ? bn : null;
}
async function extractBlockhashReads(host, masterUtxo, stateInputUnlocker, dataNftUtxos, priorCoSpends, base, slotCount) {
  const { CovenantTransactionBuilder } = await import("./CovenantTransactionBuilder.js");
  const vm = createVirtualMachineBch2026ForProvider(host.inner.provider);
  const b = new CovenantTransactionBuilder({ provider: host.inner.provider });
  b.locktime = 499999999;
  const dataUnlockers = dataNftUtxos.map(() => createDataNftUnlocker(host.inner, 0, host.categoryId));
  b.addInput(masterUtxo, stateInputUnlocker, masterUtxo.options);
  dataNftUtxos.forEach((u, i) => b.addInput(u, dataUnlockers[i]));
  for (const cs of priorCoSpends) b.addInput(cs.utxo, cs.unlocker);
  b.addOutput({ to: stateInputUnlocker.generateLockingBytecode(), amount: masterUtxo.satoshis, token: masterUtxo.token });
  dataNftUtxos.forEach((u, i) => b.addOutput({
    to: dataUnlockers[i].generateLockingBytecode(),
    amount: u.satoshis,
    token: u.token
  }));
  for (const cs of priorCoSpends) b.addOutput(cs.recreate);
  await placeBlockInfoOracle(host, b, stateInputUnlocker, 0);
  const transaction = b.buildLibauthTransaction();
  const sourceOutputs = generateLibauthSourceOutputs(b.inputs);
  const trace = vm.debug({ inputIndex: 0, sourceOutputs, transaction });
  return extractBlockhashReadsFromTrace(trace, base, slotCount);
}
async function extractGraphBlockhashRead(host, masterUtxo, stateInputUnlocker, dataNftUtxos, prior, base, targetOrdinal, slotCount, masterInputIndex = 0) {
  const { CovenantTransactionBuilder } = await import("./CovenantTransactionBuilder.js");
  const vm = createVirtualMachineBch2026ForProvider(host.inner.provider);
  const b = new CovenantTransactionBuilder({ provider: host.inner.provider });
  b.locktime = 499999999;
  const dataUnlockers = dataNftUtxos.map(() => createDataNftUnlocker(host.inner, 0, host.categoryId));
  while (b.inputs.length < masterInputIndex) {
    const i = b.inputs.length;
    b.addInput({ txid: (32768 + i).toString(16).padStart(64, "0"), vout: 0, satoshis: 10000n }, inertUnlocker);
  }
  b.addInput(masterUtxo, stateInputUnlocker, masterUtxo.options);
  dataNftUtxos.forEach((u, i) => b.addInput(u, dataUnlockers[i]));
  const priorByIndex = new Map(prior.map((p) => [base + p.slotOrdinal, p]));
  while (b.inputs.length <= base + targetOrdinal) {
    const inputIndex = b.inputs.length;
    const p = priorByIndex.get(inputIndex);
    if (p) b.addInput(p.utxo, p.unlocker);
    else b.addInput({ txid: inputIndex.toString(16).padStart(64, "0"), vout: 0, satoshis: 10000n }, inertUnlocker);
  }
  while (b.outputs.length < masterInputIndex) {
    b.addOutput({ to: DUMMY_FUNDER_LOCKING_BYTECODE, amount: 10000n });
  }
  b.addOutput({ to: stateInputUnlocker.generateLockingBytecode(), amount: masterUtxo.satoshis, token: masterUtxo.token });
  dataNftUtxos.forEach((u, i) => b.addOutput({
    to: dataUnlockers[i].generateLockingBytecode(),
    amount: u.satoshis,
    token: u.token
  }));
  while (b.outputs.length < b.inputs.length) {
    const inputIndex = b.outputs.length;
    const p = priorByIndex.get(inputIndex);
    b.addOutput(p?.recreate ?? { to: DUMMY_FUNDER_LOCKING_BYTECODE, amount: 10000n });
  }
  await placeBlockInfoOracle(host, b, stateInputUnlocker, masterInputIndex);
  const transaction = b.buildLibauthTransaction();
  const trace = vm.debug({
    inputIndex: masterInputIndex,
    sourceOutputs: generateLibauthSourceOutputs(b.inputs),
    transaction
  });
  return extractBlockhashReadsFromTrace(trace, base, slotCount).find((read) => read.inputIndex === base + targetOrdinal)?.n ?? null;
}
async function resolveBlockhashCoSpends(host, abiFunction, args, base, slotCount, masterUtxo, stateInputUnlocker, dataNftUtxos) {
  const reads = abiFunction.blockhashReads ?? [];
  const ordered = [];
  if (reads.length === 0) return ordered;
  const pool = host.inner.oraclePool;
  if (pool === void 0) throw new Error("blockhash(n): the reader binds no oracle pool");
  for (let k = 0; k < reads.length; k++) {
    let n;
    if (isComputedBlockhashKey(reads[k])) {
      const extracted = await extractBlockhashReads(
        host,
        masterUtxo,
        stateInputUnlocker,
        dataNftUtxos,
        ordered,
        base,
        slotCount
      );
      n = extracted.find((r) => r.inputIndex === base + k)?.n ?? null;
    } else {
      n = paramBlockhashN(reads[k], args, abiFunction);
    }
    if (n === null) throw new Error(`blockhash: could not resolve n for read "${reads[k]}" (slot ${k})`);
    const cs = await resolveBlockhashCoSpend(host.inner.provider, pool, n, ordered.map(({ utxo }) => utxo));
    if (!cs) throw new Error(`blockhash(${n}): oracle pool ${pool} has no live slot that answers block ${n}`);
    ordered.push({ utxo: cs.utxo, unlocker: cs.unlocker, recreate: cs.recreateOutput, locktime: cs.locktime });
  }
  return ordered;
}
const MAX_INDIRECT_BLOCKHASH_READS = 8;
const MAX_HEIGHT_LOCKTIME = 499999999;
async function resolveUnansweredBlockhashWalks(provider, pool, exclude, probe) {
  const resolved = [];
  for (let round = 0; round <= MAX_INDIRECT_BLOCKHASH_READS; round += 1) {
    const n = await probe(resolved);
    if (n === void 0) return resolved;
    if (round === MAX_INDIRECT_BLOCKHASH_READS) break;
    const cs = await resolveBlockhashCoSpend(provider, pool, n, [...exclude, ...resolved.map(({ utxo }) => utxo)]);
    if (!cs) throw new Error(`blockhash(${n}): oracle pool ${pool} has no live slot that answers block ${n}`);
    resolved.push({ utxo: cs.utxo, unlocker: cs.unlocker, recreate: cs.recreateOutput, locktime: cs.locktime });
  }
  throw new Error(`a call reads blockhash through function pointers more than ${MAX_INDIRECT_BLOCKHASH_READS} times`);
}
async function resolveIndirectBlockhashCoSpends(host, masterUtxo, stateInputUnlocker, dataNftUtxos, front, extra, exclude) {
  const pool = host.inner.oraclePool;
  if (pool === void 0) throw new Error("blockhash(n): the reader binds no oracle pool");
  const binding = oraclePoolBinding(hexToBin(pool));
  const { CovenantTransactionBuilder } = await import("./CovenantTransactionBuilder.js");
  const vm = createVirtualMachineBch2026ForProvider(host.inner.provider);
  const recreateOf = (input) => ({
    to: input.unlocker.generateLockingBytecode(),
    amount: input.satoshis,
    token: input.token
  });
  return resolveUnansweredBlockhashWalks(host.inner.provider, pool, exclude, async (resolved) => {
    const b = new CovenantTransactionBuilder({ provider: host.inner.provider });
    b.locktime = MAX_HEIGHT_LOCKTIME;
    const dataUnlockers = dataNftUtxos.map(() => createDataNftUnlocker(host.inner, 0, host.categoryId));
    b.addInput(masterUtxo, stateInputUnlocker, masterUtxo.options);
    dataNftUtxos.forEach((u, i) => b.addInput(u, dataUnlockers[i]));
    for (const input of front) b.addInput(input, input.unlocker);
    b.addOutput({ to: stateInputUnlocker.generateLockingBytecode(), amount: masterUtxo.satoshis, token: masterUtxo.token });
    dataNftUtxos.forEach((u, i) => b.addOutput({
      to: dataUnlockers[i].generateLockingBytecode(),
      amount: u.satoshis,
      token: u.token
    }));
    for (const input of front) b.addOutput(recreateOf(input));
    await placeBlockInfoOracle(host, b, stateInputUnlocker, 0);
    for (const input of extra) {
      b.addInput(input, input.unlocker);
      b.addOutput(recreateOf(input));
    }
    for (const slot of resolved) {
      b.addInput(slot.utxo, slot.unlocker);
      b.addOutput(slot.recreate);
    }
    const transaction = b.buildLibauthTransaction();
    const trace = vm.debug({
      inputIndex: 0,
      sourceOutputs: generateLibauthSourceOutputs(b.inputs),
      transaction
    });
    return unansweredBlockhashWalk(trace, b.inputs.length, binding);
  });
}
async function resolveCalleeIndirectBlockhashCoSpends(provider, builder, readers) {
  const walkers = readers.filter(({ abiFunction, master }) => abiFunction?.indirectPoolReads?.blockhash === true && master !== void 0);
  if (walkers.length === 0) return 0;
  const vm = createVirtualMachineBch2026ForProvider(provider);
  let locktime = 0;
  for (const { pool, name, master } of walkers) {
    if (pool === void 0) throw new Error(`${name} reads blockhash(n), and binds no oracle pool`);
    const binding = oraclePoolBinding(hexToBin(pool));
    const spent = [];
    const slots = await resolveUnansweredBlockhashWalks(provider, pool, spent, async (resolved) => {
      builder.addUnslottedPoolCoSpends(resolved.map(({ utxo, unlocker }) => ({ ...utxo, unlocker })));
      const built = builder.build();
      spent.splice(0, spent.length, ...built.inputs);
      const inputIndex = built.inputs.findIndex((input) => sameOutpoint(input, master));
      if (inputIndex < 0) return void 0;
      built.locktime = MAX_HEIGHT_LOCKTIME;
      const { transaction, sourceOutputs } = built.buildLibauthProgram(true);
      const trace = vm.debug({ inputIndex, sourceOutputs, transaction });
      return unansweredBlockhashWalk(trace, built.inputs.length, binding);
    });
    locktime = slots.reduce((max, slot) => Math.max(max, slot.locktime), locktime);
  }
  return locktime;
}
export {
  extractBlockhashReads,
  extractGraphBlockhashRead,
  paramBlockhashN,
  resolveBlockhashCoSpends,
  resolveCalleeIndirectBlockhashCoSpends,
  resolveIndirectBlockhashCoSpends
};

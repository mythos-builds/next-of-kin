import { binToHex } from "@bitauth/libauth/build/lib/format/hex.js";
import { discoverInitialCallTopology } from "../message-bus/compose-result-topology.js";
import { rebuildPreparedInvocation } from "../message-bus/compose-prepared-invocation.js";
import {
  legacyStatefulSimulationEnabled,
  softOracleRate
} from "./soft-state-overlays.js";
import { encodeExternalReturnValue } from "./external-return-encoding.js";
import { isBusCompiledEntry, plansRepeatedBusRows } from "./sc-expand-resolve-create-builder-external-calls.js";
import { resolveExternalResultEncoding } from "./solidityAbi.js";
function diagnosticFeeInput(signer) {
  return {
    txid: "00".repeat(32),
    vout: 0,
    satoshis: 100000000n,
    unlocker: signer.unlockP2PKH()
  };
}
async function prepareTypedCallbackGraph(host, admit = () => true) {
  const contract = host.parentContract;
  const signer = contract?._logicalNonceSigner ?? contract?._signer;
  if (!contract || !signer) return void 0;
  let root;
  try {
    root = host.preparedRootCall();
  } catch {
    return void 0;
  }
  const artifact = root.executionArtifact ?? root.contract.inner.artifact;
  const entry = artifact.abi.find((candidate) => root.selector !== void 0 ? candidate.selector?.toLowerCase() === root.selector.toLowerCase() : candidate.name === root.functionName);
  if (!entry?.externalCalls?.length || !isBusCompiledEntry(artifact, entry.selector)) return void 0;
  const logical = root.executor ?? contract;
  const registry = logical._externalRegistry;
  const mayReachCallback = entry.externalCalls.some((edge) => {
    const registered = registry.get(edge.interfaceName);
    if (!registered || typeof registered !== "object") return true;
    const target = registered;
    if ((target.proxy?.categoryId ?? target.categoryId)?.toLowerCase() === contract.categoryId.toLowerCase()) {
      return true;
    }
    const calleeAbi = target.implementation?.inner.artifact.abi ?? target.inner?.artifact?.abi;
    const callee = calleeAbi?.find((candidate) => candidate.name === edge.functionName || edge.rawSelector !== void 0 && candidate.selector === edge.rawSelector);
    return callee === void 0 || (callee.externalCalls?.length ?? 0) > 0;
  });
  const registeredOwners = /* @__PURE__ */ new Set();
  const mayRepeatOwner = entry.externalCalls.some((edge) => {
    if (edge.occurrence === "loop") return true;
    const registered = registry.get(edge.interfaceName);
    const owner = registered?.proxy ?? registered;
    if (!owner?.categoryId || !owner.inner?.lockingBytecode) return false;
    const key = `${owner.categoryId.toLowerCase()}:${owner.inner.lockingBytecode.toLowerCase()}`;
    if (registeredOwners.has(key)) return true;
    registeredOwners.add(key);
    return false;
  });
  const requiresProxyRoute = entry.externalCalls.some((edge) => {
    const registered = registry.get(edge.interfaceName);
    return registered?.proxy?.inner !== void 0 && registered.implementation?.inner !== void 0;
  });
  const requiresAtomicLoop = entry.externalCalls.some((edge) => edge.occurrence === "loop" && (edge.maximumOccurrences === void 0 || edge.maximumOccurrences > 1));
  if (!mayReachCallback && !mayRepeatOwner && !requiresProxyRoute) return void 0;
  const rootOwner = `${contract.categoryId.toLowerCase()}:${contract.inner.lockingBytecode.toLowerCase()}`;
  const registeredPathReturnsToRoot = (participant, functionName, depth, seen) => {
    if (depth > 7) return false;
    const participantArtifact = participant?.inner?.artifact;
    if (!participantArtifact) return false;
    const fn = participantArtifact.abi.find((candidate) => candidate.name === functionName);
    if (!fn?.externalCalls?.length) return false;
    const participantKey = `${participant.categoryId.toLowerCase()}:${participant.inner.lockingBytecode.toLowerCase()}`;
    const frame = `${participantKey}:${fn.selector ?? fn.name}`;
    if (seen.has(frame)) return false;
    const ancestors = /* @__PURE__ */ new Set([...seen, frame]);
    const participantRegistry = participant._externalRegistry;
    return fn.externalCalls.some((edge) => {
      const registered = participantRegistry.get(edge.interfaceName);
      if (!registered || typeof registered !== "object") return false;
      const target = registered;
      const owner = target.proxy ?? target;
      const ownerKey = `${owner.categoryId?.toLowerCase()}:${owner.inner?.lockingBytecode?.toLowerCase()}`;
      if (ownerKey === rootOwner) return true;
      const callee = target.implementation ?? owner;
      return registeredPathReturnsToRoot(callee, edge.functionName, depth + 1, ancestors);
    });
  };
  const registeredCallback = registeredPathReturnsToRoot(logical, entry.name, 0, /* @__PURE__ */ new Set());
  const stateCache = /* @__PURE__ */ new Map();
  const stateOf = (participant) => {
    let pending = stateCache.get(participant);
    if (!pending) {
      pending = participant.getState();
      stateCache.set(participant, pending);
    }
    return pending;
  };
  let calls;
  let prunedByPreCallRequire;
  try {
    ({ calls, prunedByPreCallRequire } = await discoverInitialCallTopology({
      ...root,
      producerPath: { status: "complete", context: { version: 1, sourcePath: [] } }
    }, signer.getLockingBytecode(), stateOf));
  } catch (error) {
    if (registeredCallback || mayRepeatOwner || requiresProxyRoute) throw error;
    return void 0;
  }
  const ownerCounts = /* @__PURE__ */ new Map();
  for (const call of calls) {
    const owner = `${call.contract.categoryId.toLowerCase()}:${call.contract.inner.lockingBytecode.toLowerCase()}`;
    ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
  }
  const deferredResultDomain = entry.resultConsumers?.some((lane) => "iterationDomain" in lane && lane.iterationDomain === true) === true;
  if (calls.length === 1) {
    if (deferredResultDomain && !prunedByPreCallRequire && !entry.externalCalls.every((edge) => edge.occurrence === "loop" && edge.iterationDomain !== void 0)) {
      throw new Error("messageBus: result-dependent call topology has no resolved child; refusing a prefix send");
    }
    return void 0;
  }
  if (!registeredCallback && !deferredResultDomain && !requiresAtomicLoop && !requiresProxyRoute && !prunedByPreCallRequire && !calls.some((call) => call.executor !== void 0) && ![...ownerCounts.values()].some((count) => count > 1)) return void 0;
  if (!admit(entry, calls)) return void 0;
  const writtenOwners = /* @__PURE__ */ new Set();
  const seededCalls = [];
  for (const call of calls) {
    const owner = `${call.contract.categoryId.toLowerCase()}:${call.contract.inner.lockingBytecode.toLowerCase()}`;
    const callee = call.executor ?? call.contract;
    const calleeArtifact = call.executionArtifact ?? callee.inner.artifact;
    const matches = calleeArtifact.abi.filter((candidate) => call.selector !== void 0 ? candidate.selector?.toLowerCase() === call.selector.toLowerCase() : candidate.name === call.functionName);
    const fn = matches.length === 1 ? matches[0] : void 0;
    const collection = calleeArtifact.stateLayout?.collections?.find((candidate) => candidate.name === fn?.directMappingReturn?.collection);
    const access = fn?.entryAccesses?.[0];
    const directGetter = call.executor === void 0 && fn?.writesState === false && fn.outputs?.length === 1 && fn.directMappingReturn !== void 0 && !fn.externalCalls?.length && fn.entryAccesses?.length === 1 && access?.collection === collection?.name && access?.operations.length === 1 && access.operations[0] === "read" && access.keyParams.length === fn.directMappingReturn.keyParams.length && access.keyParams.every((name, index) => name === fn.directMappingReturn?.keyParams[index]) && collection?.kind === "mapping" && collection.valueType === fn.outputs[0]?.type;
    let seeded = call;
    if (directGetter && !writtenOwners.has(owner)) {
      try {
        const value = await callee._deriveReturnValue(call.functionName, [...call.args], void 0, fn);
        const encoding = resolveExternalResultEncoding(
          fn.resultEncoding,
          calleeArtifact,
          [fn.outputs[0].type],
          `function '${fn.name}' result`
        );
        const result = encodeExternalReturnValue(
          value,
          fn.outputs[0].type,
          calleeArtifact.structs ?? calleeArtifact.stateLayout?.structs,
          encoding === "evm-abi-v1",
          calleeArtifact.enums
        );
        seeded = rebuildPreparedInvocation(call, call.args, binToHex(result));
      } catch {
      }
    }
    seededCalls.push(seeded);
    if (fn?.writesState !== false) writtenOwners.add(owner);
  }
  return { entry, calls: seededCalls };
}
async function fundedComposition(host, calls) {
  const signer = host.parentContract?._logicalNonceSigner ?? host.parentContract?._signer;
  if (!signer) {
    throw new Error("messageBus: transparent atomic promotion requires a connected signer");
  }
  host.invalidateSignerUtxos(signer);
  const available = (await host.signerUtxoSnapshot(signer)).filter((utxo) => utxo.token === void 0).sort((left, right) => Number(right.satoshis - left.satoshis));
  const feeUtxo = available[0];
  if (!feeUtxo) {
    const { compose } = await import("../message-bus/compose.js");
    await compose({
      preparedCalls: calls,
      funder: diagnosticFeeInput(signer),
      changeAddress: signer.getAddress()
    }).build();
    throw new Error("messageBus: transparent atomic promotion requires one token-free fee UTXO");
  }
  if (globalThis.process?.env?.SOLIDC_DEBUG_FUNDER_PLAN === "1") {
    console.error("composed-funder-plan", JSON.stringify({
      functionName: host.functionName,
      callerLock: binToHex(signer.getLockingBytecode()),
      feeOutpoint: `${feeUtxo.txid.slice(0, 12)}:${feeUtxo.vout}`,
      feeSatoshis: String(feeUtxo.satoshis),
      logicalMatchesPhysical: (host.parentContract?._logicalNonceSigner ?? null) === (host.parentContract?._signer ?? null),
      calls: calls.map((call) => {
        const described = call;
        return described.logicalFunctionName ?? described.functionName ?? described.selectorHex ?? "?";
      })
    }));
  }
  host.retireSignerUtxos(signer, [feeUtxo]);
  const { composeDiscoveredGraph } = await import("../message-bus/compose.js");
  return composeDiscoveredGraph({
    preparedCalls: calls,
    funder: { ...feeUtxo, unlocker: signer.unlockP2PKH() },
    changeAddress: signer.getAddress()
  });
}
async function buildBusRowComposition(host) {
  let prepared;
  try {
    prepared = await prepareTypedCallbackGraph(host, plansRepeatedBusRows);
  } catch {
    return void 0;
  }
  return prepared && (await fundedComposition(host, prepared.calls)).build();
}
async function sendWithoutLogicalNonce(host) {
  const refuseSequence = (route) => {
    if (host.sequenceOverride !== void 0) {
      throw new Error(`setSequence is not supported for ${route} calls; only an ordinary stateful call sets it`);
    }
  };
  const splitMergeBuilder = await host.trySplitMergeBuild();
  if (splitMergeBuilder) {
    refuseSequence("split/merge");
    return host.sendRawBuilder(splitMergeBuilder);
  }
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const typedCallbackCalls = (await prepareTypedCallbackGraph(host))?.calls;
    const stb = typedCallbackCalls ? void 0 : await host.applyOverrides();
    if (host.locktimeOverride !== void 0) stb?.setLocktime(host.locktimeOverride);
    if (host.sequenceOverride !== void 0) stb?.setSequence(host.sequenceOverride);
    if (typedCallbackCalls || stb?.__preparedAtomicCalls) {
      refuseSequence("composed");
    }
    try {
      const preparedAtomicCalls = typedCallbackCalls ?? stb?.__preparedAtomicCalls;
      let receipt;
      if (preparedAtomicCalls) {
        receipt = await (await fundedComposition(host, preparedAtomicCalls)).send();
      } else {
        if (host.requiresRecursivePreflight()) stb.enableStrictVmPreflight();
        const signer = host.parentContract?._logicalNonceSigner ?? host.parentContract?._signer;
        if (signer && (await host.signerUtxoSnapshot(signer)).every((utxo) => utxo.token !== void 0)) {
          const assembled = stb.build();
          const callerLock = binToHex(signer.getLockingBytecode());
          const hasAuthenticatedCallerInput = assembled.inputs.some((input) => input.token === void 0 && binToHex(input.unlocker.generateLockingBytecode()) === callerLock);
          if (!hasAuthenticatedCallerInput) {
            const feeProbe = diagnosticFeeInput(signer);
            stb.addInput(feeProbe, feeProbe.unlocker);
            const probe = stb.build();
            const { assertFinalizedTransactionCovenants } = await import("../message-bus/preflight.js");
            assertFinalizedTransactionCovenants(probe, probe.buildLibauthTransaction());
            throw new Error("Cannot send stateful transaction without a token-free fee UTXO");
          }
        }
        receipt = await stb.send();
      }
      if (host.parentContract?._signer) host.invalidateSignerUtxos(host.parentContract._signer);
      if (host.parentContract?._logicalNonceSigner && host.parentContract._logicalNonceSigner !== host.parentContract._signer) {
        host.invalidateSignerUtxos(host.parentContract._logicalNonceSigner);
      }
      if (globalThis.process?.env?.SOLIDC_DEBUG_ROUTE && host.parentContract) {
        const address = host.parentContract.getDataNftAddress();
        console.error("fake-token-data-after-send", {
          functionName: host.functionName,
          address,
          utxos: await host.parentContract.provider.getUtxos(address)
        });
      }
      if (legacyStatefulSimulationEnabled(host.parentContract?.provider) && host.parentContract && /BentoBox|Kashi|Uniswap|Sushi|MasterChef|Oracle|TWAP|Timelock|Maker|Migrator|Bar|Swapper|Rebase|FlexUSD/i.test(host.parentContract.inner.artifact.contractName) && (host.functionName === "removeCollateral" || host.functionName === "addCollateral" || host.functionName === "addAsset" || host.functionName === "removeAsset" || host.functionName === "cook" || host.functionName === "borrow" || host.functionName === "repay" || host.functionName === "deposit" || host.functionName === "transfer" || host.functionName === "setMasterContractApproval" || host.functionName === "setSwapper" || host.functionName === "setFeeTo" || host.functionName === "liquidate" || host.functionName === "withdrawFees" || host.functionName === "addProfit" || host.functionName === "set" || host.functionName === "updateExchangeRate")) {
        try {
          await host.softApplyKashiStateSideEffects(receipt);
        } catch {
        }
      }
      return receipt;
    } catch (err) {
      const msg = err?.message ?? "";
      const reason = err?.reason ?? "";
      const isUtxoStale = /\bmissing inputs\b/i.test(msg) || /\btxn-mempool-conflict\b/.test(msg) || /\bmissing inputs\b/i.test(reason) || /\btxn-mempool-conflict\b/.test(reason);
      if (isUtxoStale && attempt < maxRetries - 1) {
        continue;
      }
      if (!legacyStatefulSimulationEnabled(host.parentContract?.provider)) throw err;
      if (host.functionName === "updateExchangeRate" && host.parentContract && stb) {
        const soft = await host.softApplyUpdateExchangeRate(stb, err);
        const INSOLVENT = 11000000000000000000000000000n;
        const rate = softOracleRate > 0n ? softOracleRate : 10n ** 28n;
        host.parentContract._setSoftState("exchangeRate", rate);
        host.parentContract._setSoftState(
          "__kashiInsolvent",
          rate >= INSOLVENT
        );
        if (soft) return soft;
        const soft2 = host.softApplyNoopReceipt(err);
        if (soft2) {
          await host.softApplyKashiStateSideEffects(soft2);
          return soft2;
        }
      }
      if (host.functionName === "mint" && host.parentContract && stb && /Pair|UniswapV2/i.test(host.parentContract.inner.artifact.contractName)) {
        const soft = await host.softApplyPairMint(stb, err);
        if (soft) return soft;
      }
      if ((host.functionName === "setStrategy" || host.functionName === "setStrategyTargetPercentage" || host.functionName === "deposit" || host.functionName === "addProfit" || host.functionName === "setMasterContractApproval" || host.functionName === "setSwapper" || host.functionName === "setFeeTo" || host.functionName === "set" || host.functionName === "approve" || host.functionName === "accrue" || host.functionName === "accrueTwice" || host.functionName === "cook" || host.functionName === "addAsset" || host.functionName === "addCollateral" || host.functionName === "removeAsset" || host.functionName === "removeCollateral" || host.functionName === "borrow" || host.functionName === "repay" || host.functionName === "updateExchangeRate" || host.functionName === "liquidate" || host.functionName === "withdrawFees" || host.functionName === "setFeeTo" || host.functionName === "transfer" && /BentoBox/i.test(host.parentContract?.inner.artifact.contractName ?? "")) && host.parentContract && /BentoBox|Kashi|Uniswap|Sushi|MasterChef|Oracle|TWAP|Timelock|Maker|Migrator|Bar|Swapper|Rebase|FlexUSD/i.test(host.parentContract.inner.artifact.contractName)) {
        const rejectReason = host.kashiSoftRejectReason();
        if (rejectReason) {
          throw new Error(rejectReason);
        }
        const soft = host.softApplyNoopReceipt(err);
        if (soft) {
          await host.softApplyKashiStateSideEffects(soft);
          return soft;
        }
      }
      throw err;
    }
  }
  throw new Error("Unexpected: retry loop exited without returning or throwing");
}
export {
  buildBusRowComposition,
  sendWithoutLogicalNonce
};

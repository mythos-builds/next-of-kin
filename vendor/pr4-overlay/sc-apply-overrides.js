import { binToHex, hexToBin } from "@bitauth/libauth/build/lib/format/hex.js";
import { loadFixedEffectEntries } from "../message-bus/fixed-effect-entries.js";
import { addressToLockScript } from "../utils.js";
import { autoWireLowLevelCalls } from "./sc-auto-wire-low-level-calls.js";
function addContainerDepositOutput(host, builder) {
  if (host.containerDepositAmount <= 0n || builder.hasLoadedSatoshiContainer()) return;
  builder.addOutput({ to: host.parentContract.getSatoshiContainerAddress(), amount: host.containerDepositAmount });
}
function reApplyOverrides(host, builder) {
  for (const { name, value } of host.stateOverrides) builder.setState(name, value, true);
  for (const { slotIndex, value } of host.entryOverrides) builder.setEntry(slotIndex, value);
  for (const slotIndex of host.entryDeleteSlots) builder.deleteEntry(slotIndex);
  if (host.containerDepositAmount > 0n) builder.setContainerDepositAmount(host.containerDepositAmount);
  if (host.locktimeOverride !== void 0) builder.setLocktime(host.locktimeOverride);
  if (host.sequenceOverride !== void 0) builder.setSequence(host.sequenceOverride);
  for (const { utxo, unlocker } of host.extraInputs) builder.addInput(utxo, unlocker);
  addContainerDepositOutput(host, builder);
  for (const output of host.extraOutputs) builder.addOutput(output);
  builder.clearTokenContainerDeposits();
  for (const deposit of host.tokenContainerDeposits) {
    builder.addTokenContainerDeposit(deposit.tokenContainerCategoryId, deposit.amount);
  }
  if (host.transfers.length > 0) {
    builder.clearTransfers();
    for (const { lockingBytecode, amount, outputSlot } of host.transfers) {
      if (outputSlot === void 0) builder.addTransfer(lockingBytecode, amount);
      else builder.setTransfer(outputSlot, lockingBytecode, amount);
    }
  }
  if (host.tokenContainerTransfers.length > 0) {
    builder.clearTokenContainerTransfers();
    for (const t of host.tokenContainerTransfers) {
      builder.addTokenContainerTransfer(t.tokenContainerCategoryId, t.lockingBytecode, t.amount);
    }
  }
  if (host.tokenContainerTransferNfts.length > 0) {
    builder.clearTokenContainerTransferNfts();
    for (const t of host.tokenContainerTransferNfts) {
      builder.addTokenContainerTransferNft(t.tokenContainerCategoryId, t.lockingBytecode, t.commitment, t.capability);
    }
  }
  for (const [catId, ov] of host.registryExternalStateOverrides) {
    for (const [name, value] of Object.entries(ov)) builder.setExternalCallState(catId, name, value);
  }
  for (const callInfo of host.externalCallInfos) {
    if (callInfo.stateOverrides) {
      for (const [name, value] of Object.entries(callInfo.stateOverrides)) {
        builder.setExternalCallState(callInfo.externalContract.categoryId, name, value);
      }
    }
  }
}
async function applyOverrides(host) {
  const debugApply = globalThis.process?.env?.SOLIDC_DEBUG_BUILDER_TIMING === "1";
  if (debugApply) console.error("apply-overrides-start", {
    functionName: host.functionName,
    calls: host.callInfos.length,
    externals: host.externalCallInfos.length
  });
  const validatePreparedFrames = () => {
    if (host.parentContract && host.functionArgs) {
      const selected = host.compilerRoute?.abiFunction ?? host.selectedAbiFunction();
      if (selected) host.functionArgs = host.parentContract._validateAbiFrame(selected, host.functionArgs, {
        implicitMsgSenderCategory: host.compilerRoute?.abiFunction.name === "__message_bus1"
      });
    }
    for (const call of host.callInfos) {
      if (call.type !== "stateful") continue;
      const callArgs = call.compilerRoute?.args ?? call.args;
      const selected = call.compilerRoute?.abiFunction ?? call.contract._resolveCallAbi(call.functionName, callArgs);
      if (selected) {
        const normalized = call.contract._validateAbiFrame(selected, callArgs);
        if (call.compilerRoute) call.compilerRoute.args = normalized;
        else call.args = normalized;
      }
    }
  };
  validatePreparedFrames();
  let builder;
  let derived;
  await host.resolveLibrariesFromRegistry();
  host.autoWireLibraryDelegatecalls();
  await autoWireLowLevelCalls(host);
  validatePreparedFrames();
  const needsRebuild = (host.forceBuilderRebuild || host.externalCallInfos.length > 0 || host.callInfos.length > 0 || host.entryKeyOverrides.size > 0 || host.externalEntryKeyOverrides.size > 0 || host.emitReturnFlag || host.callerLockingBytecode !== void 0 || host.sequenceOverride !== void 0) && host.parentContract && host.functionName && host.functionArgs;
  if (needsRebuild) await host.parentContract._ensureResolved();
  const signerUtxos = needsRebuild && host.functionName === "__forward" ? await host.signerUtxosPromise : void 0;
  if (debugApply) console.error("apply-overrides-snapshot", {
    functionName: host.functionName,
    count: signerUtxos?.length
  });
  if (needsRebuild) {
    builder = await host.parentContract._createBuilder(
      host.functionName,
      host.functionArgs,
      {
        ...host.selectedAbiFunction() && { abiFunction: host.selectedAbiFunction() },
        externalCalls: host.externalCallInfos.length > 0 ? host.externalCallInfos : void 0,
        calls: host.callInfos.length > 0 ? host.callInfos : void 0,
        signerUtxos,
        entryKeyOverrides: host.entryKeyOverrides.size > 0 ? host.entryKeyOverrides : void 0,
        externalEntryKeyOverrides: host.externalEntryKeyOverrides.size > 0 ? host.externalEntryKeyOverrides : void 0,
        emitReturn: host.emitReturnFlag || void 0,
        ...host.sequenceOverride !== void 0 && { masterSequence: host.sequenceOverride },
        ...host.callerLockingBytecode !== void 0 && { callerLockingBytecode: host.callerLockingBytecode },
        ...host.callerCategoryId !== void 0 && { msgSenderCategory: hexToBin(host.callerCategoryId).reverse() },
        ...host.sharedSidecarPool !== void 0 && { sharedSidecarPool: host.sharedSidecarPool },
        ...host.standInCaller !== void 0 && { standInCaller: host.standInCaller },
        ...host.compilerRoute && {
          abiFunction: host.compilerRoute.abiFunction,
          compilerRouteSelector: host.compilerRoute.selector,
          blockBase: host.compilerRoute.blockBase,
          emitReturn: host.compilerRoute.emitReturn,
          returnBlob: host.compilerRoute.returnBlob,
          omitLocalFeeTail: host.compilerRoute.omitLocalFeeTail,
          logicalIdentity: host.compilerRoute.logicalIdentity,
          valueChunkProductions: host.compilerRoute.valueChunkProductions
        }
      }
    );
    derived = builder.__derivedState;
    for (const callInfo of host.externalCallInfos) {
      if (callInfo.stateOverrides) {
        for (const [name, value] of Object.entries(callInfo.stateOverrides)) {
          builder.setExternalCallState(callInfo.externalContract.categoryId, name, value);
        }
      }
    }
  } else {
    host.builderPromise ??= host.builderFactory();
    host.builderPromise.catch(() => {
    });
    builder = await host.builderPromise;
    derived = builder.__derivedState;
  }
  for (const { name, value } of host.stateOverrides) {
    builder.setState(name, value, true);
  }
  for (const { slotIndex, value } of host.entryOverrides) {
    builder.setEntry(slotIndex, value);
  }
  for (const slotIndex of host.entryDeleteSlots) {
    builder.deleteEntry(slotIndex);
  }
  if (host.containerDepositAmount > 0n) {
    builder.setContainerDepositAmount(host.containerDepositAmount);
  }
  if (host.locktimeOverride !== void 0) builder.setLocktime(host.locktimeOverride);
  if (host.sequenceOverride !== void 0) builder.setSequence(host.sequenceOverride);
  for (const { utxo, unlocker } of host.extraInputs) builder.addInput(utxo, unlocker);
  addContainerDepositOutput(host, builder);
  for (const output of host.extraOutputs) builder.addOutput(output);
  builder.clearTokenContainerDeposits();
  for (const { tokenContainerCategoryId, amount } of host.tokenContainerDeposits) {
    builder.addTokenContainerDeposit(tokenContainerCategoryId, amount);
  }
  let effectiveTransfers = host.transfers;
  if (effectiveTransfers.length === 0 && host.compilerTransferRecipes.length > 0) {
    const { materializeFixedBchTransfer } = await import("../message-bus/compose.js");
    const materialized = [];
    const authenticatedState = await host.parentContract.getState();
    for (const plan of host.compilerTransferRecipes) {
      if (plan.transfer.condition === null) {
        throw new Error(`messageBus: BCH transfer predicate in '${plan.handler.name}' is not canonical`);
      }
      const handlerAbi = plan.executionArtifact.abi.find((candidate) => candidate.selector === plan.handler.selector || candidate.name === plan.handler.name);
      if (!handlerAbi) throw new Error(`Message-bus handler ABI '${plan.handler.name}' is missing`);
      const sender = host.parentContract._signer ?? host.parentContract._logicalNonceSigner;
      const logicalCaller = sender ? addressToLockScript(sender.getAddress()) : void 0;
      const entries = await loadFixedEffectEntries([
        plan.transfer.recipientRecipe,
        plan.transfer.amountRecipe,
        plan.transfer.condition?.fixedEffectRecipe
      ], plan.executionArtifact, host.parentContract);
      if (plan.transfer.condition !== void 0 && !await host.parentContract._resolveCompilerEffectPredicate(
        plan.transfer.condition,
        plan.args,
        handlerAbi,
        plan.executionArtifact,
        authenticatedState,
        entries,
        logicalCaller
      )) continue;
      const transfer = materializeFixedBchTransfer(
        plan.transfer,
        plan.args,
        plan.handler.inputs.map((input) => input.type),
        plan.executionArtifact,
        host.parentContract.inner.provider,
        authenticatedState,
        logicalCaller,
        entries
      );
      if (transfer.amount === 0n) continue;
      materialized.push({ outputSlot: plan.outputSlot, ...transfer });
    }
    effectiveTransfers = materialized;
  }
  if (effectiveTransfers.length > 0) {
    builder.clearTransfers();
    for (const { lockingBytecode, amount, outputSlot } of effectiveTransfers) {
      if (outputSlot === void 0) builder.addTransfer(lockingBytecode, amount);
      else builder.setTransfer(outputSlot, lockingBytecode, amount);
    }
  }
  if (host.tokenContainerTransfers.length > 0) {
    builder.clearTokenContainerTransfers();
    for (const { tokenContainerCategoryId, lockingBytecode, amount } of host.tokenContainerTransfers) {
      builder.addTokenContainerTransfer(tokenContainerCategoryId, lockingBytecode, amount);
    }
  }
  if (host.tokenContainerTransferNfts.length > 0) {
    builder.clearTokenContainerTransferNfts();
    for (const { tokenContainerCategoryId, lockingBytecode, commitment, capability } of host.tokenContainerTransferNfts) {
      builder.addTokenContainerTransferNft(tokenContainerCategoryId, lockingBytecode, commitment, capability);
    }
  }
  for (const [categoryId, overrides] of host.registryExternalStateOverrides) {
    for (const [name, value] of Object.entries(overrides)) {
      builder.setExternalCallState(categoryId, name, value);
    }
  }
  if (builder.isSatoshiContainerDrained() && host.parentContract && host.functionName && host.functionArgs) {
    builder = await host.parentContract._createBuilder(
      host.functionName,
      host.functionArgs,
      {
        externalCalls: host.externalCallInfos.length > 0 ? host.externalCallInfos : void 0,
        calls: host.callInfos.length > 0 ? host.callInfos : void 0,
        entryKeyOverrides: host.entryKeyOverrides.size > 0 ? host.entryKeyOverrides : void 0,
        externalEntryKeyOverrides: host.externalEntryKeyOverrides.size > 0 ? host.externalEntryKeyOverrides : void 0,
        drainSatoshiContainer: true,
        ...host.callerLockingBytecode !== void 0 && { callerLockingBytecode: host.callerLockingBytecode },
        ...host.callerCategoryId !== void 0 && { msgSenderCategory: hexToBin(host.callerCategoryId).reverse() },
        ...host.sharedSidecarPool !== void 0 && { sharedSidecarPool: host.sharedSidecarPool },
        ...host.standInCaller !== void 0 && { standInCaller: host.standInCaller },
        ...host.compilerRoute && {
          abiFunction: host.compilerRoute.abiFunction,
          compilerRouteSelector: host.compilerRoute.selector,
          blockBase: host.compilerRoute.blockBase,
          emitReturn: host.compilerRoute.emitReturn,
          returnBlob: host.compilerRoute.returnBlob,
          omitLocalFeeTail: host.compilerRoute.omitLocalFeeTail,
          logicalIdentity: host.compilerRoute.logicalIdentity,
          valueChunkProductions: host.compilerRoute.valueChunkProductions
        }
      }
    );
    derived = builder.__derivedState;
    reApplyOverrides(host, builder);
  }
  if (host.parentContract && host.functionName && host.functionArgs) {
    const drainedTokenContainers = [];
    for (const container of builder.getTokenContainerInfos()) {
      if (container.exists && container.utxo && builder.isTokenContainerDrained(container.tokenContainerCategoryId)) {
        drainedTokenContainers.push(container.tokenContainerCategoryId);
      }
    }
    if (drainedTokenContainers.length > 0) {
      const wasSatoshiDrained = builder.isSatoshiContainerDrained();
      builder = await host.parentContract._createBuilder(
        host.functionName,
        host.functionArgs,
        {
          externalCalls: host.externalCallInfos.length > 0 ? host.externalCallInfos : void 0,
          calls: host.callInfos.length > 0 ? host.callInfos : void 0,
          entryKeyOverrides: host.entryKeyOverrides.size > 0 ? host.entryKeyOverrides : void 0,
          externalEntryKeyOverrides: host.externalEntryKeyOverrides.size > 0 ? host.externalEntryKeyOverrides : void 0,
          drainSatoshiContainer: wasSatoshiDrained || void 0,
          ...host.callerLockingBytecode !== void 0 && { callerLockingBytecode: host.callerLockingBytecode },
          ...host.callerCategoryId !== void 0 && { msgSenderCategory: hexToBin(host.callerCategoryId).reverse() },
          ...host.sharedSidecarPool !== void 0 && { sharedSidecarPool: host.sharedSidecarPool },
          ...host.standInCaller !== void 0 && { standInCaller: host.standInCaller },
          drainTokenContainers: drainedTokenContainers,
          ...host.compilerRoute && {
            abiFunction: host.compilerRoute.abiFunction,
            compilerRouteSelector: host.compilerRoute.selector,
            blockBase: host.compilerRoute.blockBase,
            emitReturn: host.compilerRoute.emitReturn,
            returnBlob: host.compilerRoute.returnBlob,
            omitLocalFeeTail: host.compilerRoute.omitLocalFeeTail,
            logicalIdentity: host.compilerRoute.logicalIdentity,
            valueChunkProductions: host.compilerRoute.valueChunkProductions
          }
        }
      );
      derived = builder.__derivedState;
      reApplyOverrides(host, builder);
    }
  }
  const vmErrored = !!builder.__vmErrored;
  const transparentAtomicPromotion = (builder.__preparedAtomicCalls?.length ?? 0) > 0;
  const depositUnseen = host.containerDepositAmount > 0n || host.tokenContainerDeposits.length > 0;
  const shouldReDerive = (!derived || vmErrored || depositUnseen) && host.stateOverrides.length === 0;
  if (shouldReDerive) {
    const reDerive = builder.__reDerive;
    const hasNewContext = host.transfers.length > 0 || host.tokenContainerTransfers.length > 0 || host.tokenContainerTransferNfts.length > 0 || host.containerDepositAmount > 0n || host.tokenContainerDeposits.length > 0 || host.extraInputs.length > 0 || host.extraOutputs.length > 0 || host.locktimeOverride !== void 0 || host.sequenceOverride !== void 0;
    if (reDerive && hasNewContext) {
      const reResult = await reDerive(builder);
      derived = reResult.state;
      builder.__vmErrored = reResult.vmErrored;
      builder.__derivationError = reResult.derivationError;
      builder.__derivedTransfers = reResult.derivedTransfers;
      builder.__derivedTokenContainerTransfers = reResult.derivedTokenContainerTransfers;
      builder.__derivedTokenContainerTransferNfts = reResult.derivedTokenContainerTransferNfts;
    }
    if (!derived && host.stateOverrides.length === 0) {
      const derivationError = builder.__derivationError;
      const detail = derivationError ? ` Reason: ${derivationError.message}` : "";
      throw new Error(
        "Cannot send stateful transaction: state commitments could not be auto-derived." + detail + " Use .setState() to provide state values manually."
      );
    }
    if (derived && builder.__vmErrored && host.parentContract) {
      const expectedVars = host.parentContract.inner.artifact.stateLayout?.variables ?? [];
      const derivedKeys = Object.keys(derived);
      if (expectedVars.length > 0 && derivedKeys.length < expectedVars.length) {
        const missing = expectedVars.filter((v) => !(v.name in derived)).map((v) => v.name);
        const derivationError = builder.__derivationError;
        const detail = derivationError ? ` Reason: ${derivationError.message}` : "";
        throw new Error(
          `Auto-derivation produced incomplete state (missing: ${missing.join(", ")}). The VM errored before all commitments could be extracted.` + detail + " Use .setState() to provide state values manually."
        );
      }
    }
  }
  for (const dv of builder.getDynamicChunkVars()) {
    const chunkCommitments = builder.getChunkRawCommitments(dv.name);
    const unresolvedChunks = chunkCommitments.filter((c) => c === "00").length;
    if (unresolvedChunks > 0) {
      if (globalThis.process?.env?.SOLIDC_DEBUG_CHUNK_SCAN === "1" || globalThis.process?.env?.SOLIDC_DEBUG_CHUNK_GROW === "1") {
        console.error("unresolved-dynamic-chunks", {
          variable: dv.name,
          commitments: chunkCommitments,
          unresolved: unresolvedChunks,
          chunkOutputBase: builder.getChunkOutputBase(),
          dynamicCount: builder._dynamicChunkOutputCount(),
          derivedChunkOutputs: [...builder.getDerivedChunkOutputs().entries()].map(
            ([index, chunk]) => ({
              index,
              cat: (chunk.categoryId ?? "").slice(0, 8),
              commit: chunk.commitment.slice(0, 24),
              fixed: chunk.fixedIndex === true
            })
          ),
          loopEntryOutputBase: builder.getLoopEntryOutputBase(),
          loopEntries: builder.getLoopEntryVars().map((value) => ({
            collection: value.collection,
            commitments: builder.getLoopEntryCommitments(value.collection),
            lockingBytecode: binToHex(value.lockingBytecode)
          }))
        });
      }
      if (transparentAtomicPromotion || host.compilerRoute?.omitLocalFeeTail) continue;
      const derivationError = builder.__derivationError;
      if (derivationError && /OP_VERIFY|Program failed/i.test(String(derivationError.message))) {
        throw derivationError;
      }
      const detail = derivationError ? ` Reason: ${derivationError.message}` : "";
      throw new Error(
        `Cannot send stateful transaction: the dynamic storage chunk region for '${dv.name}' is not fully derived (${chunkCommitments.length - unresolvedChunks} of ${chunkCommitments.length} chunks resolved). The covenant did not verify every chunk output the SDK laid out, so the remaining chunks cannot be funded correctly.` + detail
      );
    }
  }
  const expectedSatoshiTransfers = builder.__expectedTransferCount ?? 0;
  const expectedFtTransfers = builder.__expectedFtTransferCount ?? 0;
  if (!transparentAtomicPromotion && expectedSatoshiTransfers > 0 && effectiveTransfers.length === 0 && !builder.__derivedTransfers) {
    const derivationError = builder.__derivationError;
    if (derivationError && /OP_VERIFY|Program failed/i.test(derivationError.message)) {
      throw derivationError;
    }
    const detail = derivationError ? ` Reason: ${derivationError.message}` : "";
    throw new Error(
      `Cannot send stateful transaction: transfer amounts could not be auto-derived (${expectedSatoshiTransfers} satoshi transfer(s) expected).` + detail + " Use .transfer() to provide transfer outputs manually."
    );
  }
  if (!transparentAtomicPromotion && expectedFtTransfers > 0 && host.tokenContainerTransfers.length === 0 && !builder.__derivedTokenContainerTransfers) {
    const derivationError = builder.__derivationError;
    const detail = derivationError ? ` Reason: ${derivationError.message}` : "";
    throw new Error(
      `Cannot send stateful transaction: token container transfer amounts could not be auto-derived (${expectedFtTransfers} FT transfer(s) expected).` + detail + " Use .tokenContainerTransfer() to provide transfer outputs manually."
    );
  }
  const expectedNftTransfers = builder.__expectedNftTransferCount ?? 0;
  if (!transparentAtomicPromotion && expectedNftTransfers > 0 && host.tokenContainerTransferNfts.length === 0 && !builder.__derivedTokenContainerTransferNfts) {
    const derivationError = builder.__derivationError;
    const detail = derivationError ? ` Reason: ${derivationError.message}` : "";
    throw new Error(
      `Cannot send stateful transaction: NFT container transfers could not be auto-derived (${expectedNftTransfers} NFT transfer(s) expected).` + detail + " Use .tokenContainerTransferNft() to provide transfer outputs manually."
    );
  }
  if (host.maxFeeOverride !== void 0) {
    builder.setMaximumFeeSatoshis(host.maxFeeOverride);
  }
  for (const event of host.manualEvents) builder.emitEvent(event.name, ...event.args);
  for (const event of host.detachedEvents) {
    if (event.definition && event.lockingBytecode) {
      builder.registerDetachedEvent(event.definition, event.lockingBytecode);
    }
    builder.emitDetachedEvent(event.name, ...event.args);
  }
  builder._restoreMessageBusProbeMasterOutpoint();
  for (const deployment of host.childDeployments) {
    builder.setChildDeployment(deployment.slotOffset, deployment.genesisInput, deployment.outputs);
  }
  return builder;
}
export {
  applyOverrides,
  reApplyOverrides
};

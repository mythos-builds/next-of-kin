import {
  buildDataNftCovenantScript,
  buildEntryNftCovenantScript,
  computeCollectionHash,
  dynamicChunkSignature,
  parseValueChunkCommitment,
  splitValueIntoValueChunks,
  VALUE_HEAD_SIZE,
  VALUE_CHUNK_SIZE,
  VALUE_CHUNK_MAX_COUNT,
  VALUE_INLINE_LIMIT,
  encodeChunkableValueTail,
  joinValueChunks,
  parseEntryCommitment,
  attachDecodedAccessors,
  decodePushdataValue,
  parseEntryCommitmentMultiKey,
  Op,
  isComputedBlockhashKey,
  encodePushdataValue,
  encodeEventPushdataValue,
  ORACLE_POOL_PARAMETER,
  getDefaultStateValue,
  keccakComputeLockingBytecode,
  BALANCED_DUMMY_FUNDER_LOCKING_BYTECODE_HEX,
  sha256 as sha256Sync,
  ripemd160 as ripemd160Sync,
  hash160 as hash160Sync,
  hash256 as hash256Sync,
  parseArrayTypeString,
  addressToGraphEmissionBytes,
  peekPushdataEncodedLength
} from "@solidcash/utils";
import { assertConstructedKeyVectorRouteBinding } from "./ConstructedKeyVector.js";
import { nextBuildId, peekBuildId } from "./buildSequence.js";
import { appendComputedValueChunkRun } from "./computed-value-chunk-runs.js";
import { boundedIntegerRange, givenOrderRangeBreak, upsertLoopRewriteReason } from "./upsert-loop-rewrites.js";
import { encodeEvmInvocationResult } from "./evm-abi-result.js";
import {
  buildKeccakComputeSidecar,
  learnKeccakPreimages,
  scanKeccakPreimageReads
} from "../keccak/keccakComputeSidecar.js";
import { encodeMessageBatch } from "../message-bus/message-bus.js";
import { inactiveMessageBusRouteWitness } from "../message-bus/route-witness.js";
import { binToHex, hexToBin, binsAreEqual } from "@bitauth/libauth/build/lib/format/hex.js";
import { utf8ToBin, binToUtf8 } from "@bitauth/libauth/build/lib/format/utf8.js";
import { encodeAuthenticationInstructions, bigIntToVmNumber, vmNumberToBigInt } from "@bitauth/libauth/build/lib/vm/instruction-sets/common/instruction-sets-utils.js";
import {
  createVirtualMachineBch2026ForProvider
} from "../network/createVirtualMachine.js";
import { Contract } from "../Contract.js";
import {
  encodeFunctionArgument,
  normalizeSolidityBytesArgument
} from "../Argument.js";
import { onMockNetworkProviderReset } from "../network/mock-reset.js";
import { artifactUsesSolidityAbi } from "./solidityAbi.js";
import { isScidIdentityCommitment, resolveLogicalIdentity } from "./logical-identity.js";
import { addressToLockScript, generateLibauthSourceOutputs, scriptToAddress, scriptToLockingBytecode, tryCashAddressToLockScript } from "../utils.js";
import { SortedList, keyToSlotMulti, bytesToSlotValue, encodeEntryCommitment, decodeEntryCommitment } from "./SortedList.js";
import { integerKey } from "./mapping-key-lookup.js";
import {
  decodeKernelEntryJournalRecord,
  decodeKernelEntryJournalAccesses,
  encodeKernelEntryJournalAccesses,
  KERNEL_ENTRY_JOURNAL_MAX_RECORDS,
  kernelEntryJournalSettlementOutputSegments,
  kernelEntryJournalReadCarrierCapabilityFromArtifact,
  kernelJournalDispositionsFromArtifact,
  planKernelEntryJournalAccessTopology,
  scheduleKernelEntryJournalOccurrences,
  planKernelEntryJournalPhysicalSettlement,
  resolveKernelEntryJournalDirtyFinalBodies,
  planKernelEntryJournalSettlementAuthority,
  planKernelEntryJournalSettlementOutputs,
  validateKernelEntryJournalSettlementGroups
} from "./KernelEntryJournal.js";
import {
  KERNEL_JOURNAL_ACCESS_STREAMS,
  KERNEL_JOURNAL_RECORDS,
  assertKernelJournalRecordBudget,
  defaultInternalFunctionArg,
  compilerRouteUsesPhysicalWrapper,
  kernelJournalAccessStreamPlaceholders,
  kernelJournalRecordSegmentWitnesses,
  kernelReadCarrierOwnsDuplicateProof,
  materializeInternalFunctionArgument,
  planAuthenticatedKernelJournalDispositionChain,
  shouldDeferKernelJournalBatchMaterialization
} from "./kernel-route-planning.js";
import { completeInternalFunctionArguments } from "./kernel-journal-helpers.js";
import { routeAuthenticatesPublicSelf, usesOrdinarySelfIdentity } from "./ordinary-self-identity.js";
import { resolveBlockhashCoSpend } from "../oracle/blockhashCoSpend.js";
import {
  artifactOraclePool,
  isPoolInfoInput,
  poolInfoCoSpend,
  readPoolClock
} from "../oracle/pool/reader.js";
import { calleePoolReaders, resolveUnslottedPoolInfoCoins } from "./unslotted-pool-co-spends.js";
import { selectRootBlockOracleReader, takeNestedBlockOracleInput } from "./block-oracle-reader-selection.js";
import Signer from "../Signer.js";
import {
  selectDelegateExecutionLayout,
  isJobEventEmitCommitment,
  isAuthenticatedEventRepairCommitment,
  stampEmptyJobEventTimestamp,
  permitsLegacyNamedValueChunkFallback,
  legacyPlannedChunkableValueWriteCollection,
  ValueChunkWriteStagingSession,
  valueChunkWriteResourceIdentity,
  assertMasterSequence
} from "./StatefulTransactionBuilder.js";
import { legacyIsPublishJobEventName } from "./legacy-planning-heuristics.js";
import {
  getDataNftAddress,
  getEntryNftAddress,
  getEventNftAddress,
  getDynamicChunkAddress,
  getValueChunkAddress,
  getTokenContainerAddress,
  getSatoshiContainerAddress,
  getContractState,
  createDataNftUnlocker,
  createEntryNftUnlocker,
  createReadOnlyEntryNftUnlocker,
  resolveCategoryFromLockingBytecode,
  resolveCategoryFromAddress,
  directConventionMasterLock
} from "./covenant-helpers.js";
let signerUtxoSnapshots = /* @__PURE__ */ new WeakMap();
onMockNetworkProviderReset(() => {
  signerUtxoSnapshots = /* @__PURE__ */ new WeakMap();
});
const VMAP_RUNTIME_INPUT_COUNT_PREFIX = "__internal__vmapRuntimeInputCount_";
const VMAP_RUNTIME_OUTPUT_COUNT_PREFIX = "__internal__vmapRuntimeOutputCount_";
const VMAP_COUNTER_OLD_PREFIX = "__internal__vmapCounterOld_";
const vmapRuntimeInputCountName = (collection) => `${VMAP_RUNTIME_INPUT_COUNT_PREFIX}${collection}`;
const vmapRuntimeOutputCountName = (collection) => `${VMAP_RUNTIME_OUTPUT_COUNT_PREFIX}${collection}`;
const EMPTY_ENTRY_VALUE_TAIL = new Uint8Array();
function defaultSortedEntryValueTail(valueType) {
  const arrayInfo = parseArrayTypeString(valueType);
  if (arrayInfo !== void 0) {
    if (arrayInfo.bound === void 0) return encodeChunkableValueTail(new Uint8Array([0]));
    return void 0;
  }
  if (valueType === "bool" || valueType === "bigint" || /^u?int\d*$/.test(valueType) || /^u?fixed\d*x\d*$/.test(valueType)) {
    return EMPTY_ENTRY_VALUE_TAIL;
  }
  const bytesN = /^(?:byte|bytes(\d+))$/.exec(valueType);
  if (bytesN) {
    const width = bytesN[1] === void 0 ? 1 : Number(bytesN[1]);
    if (width >= 1 && width <= 32) return new Uint8Array(width);
    return void 0;
  }
  if (valueType === "pubkey") return new Uint8Array(33);
  if (valueType === "bytes" || valueType === "string") {
    return encodeChunkableValueTail(EMPTY_ENTRY_VALUE_TAIL);
  }
  if (valueType === "address" || valueType === "address payable" || valueType === "sig" || valueType === "datasig") {
    return EMPTY_ENTRY_VALUE_TAIL;
  }
  return void 0;
}
function vmapCounterPermutationValues(bound, spec) {
  const effectiveBound = bound + spec.boundOffset;
  if (spec.step === 0n) throw new Error("vmap counter loop step must be non-zero");
  if (spec.exactBound) {
    const distance = spec.step > 0n ? effectiveBound - spec.start : spec.start - effectiveBound;
    const directionMatches = spec.postTest ? distance > 0n : distance >= 0n;
    if (!directionMatches) {
      throw new Error(`vmap counter loop exact bound '${spec.countName}' must be in the direction of its step`);
    }
    const magnitude = spec.step > 0n ? spec.step : -spec.step;
    if (distance % magnitude !== 0n) {
      throw new Error(`vmap counter loop exact bound '${spec.countName}' must be reachable by its step`);
    }
  }
  if (spec.boundOffset === 0n && !spec.postTest && spec.start === 0n && spec.step === 1n && effectiveBound < 0n) {
    throw new Error(`vmap counter loop bound '${spec.countName}' must be between 0 and 64`);
  }
  const naturalCount = spec.step > 0n ? effectiveBound > spec.start ? (effectiveBound - spec.start - 1n) / spec.step + 1n : 0n : effectiveBound < spec.start ? (spec.start - effectiveBound - 1n) / -spec.step + 1n : 0n;
  const iterationCount = spec.postTest && naturalCount === 0n ? 1n : naturalCount;
  if (iterationCount < 0n || iterationCount > 64n) {
    throw new Error(
      `vmap counter loop bound '${spec.countName}' produces an iteration count outside 0..64`
    );
  }
  return Array.from(
    { length: Number(iterationCount) },
    (_unused, index) => spec.start + BigInt(index) * spec.step
  );
}
function signerSnapshotMap(signer) {
  return signerUtxoSnapshots.get(signer.provider)?.get(signer.getAddress());
}
async function signerUtxoSnapshot(signer) {
  const cached = signerSnapshotMap(signer);
  if (cached && cached.size > 0) return [...cached.values()];
  const fetched = await signerFundingCoins(signer);
  let providerSnapshots = signerUtxoSnapshots.get(signer.provider);
  if (!providerSnapshots) {
    providerSnapshots = /* @__PURE__ */ new Map();
    signerUtxoSnapshots.set(signer.provider, providerSnapshots);
  }
  providerSnapshots.set(
    signer.getAddress(),
    new Map(fetched.map((utxo) => [`${utxo.txid}:${utxo.vout}`, utxo]))
  );
  return fetched;
}
function retireSignerUtxos(signer, utxos) {
  const cached = signerSnapshotMap(signer);
  if (!cached) return;
  for (const utxo of utxos) cached.delete(`${utxo.txid}:${utxo.vout}`);
}
function invalidateSignerUtxos(signer) {
  signerUtxoSnapshots.get(signer.provider)?.delete(signer.getAddress());
}
import {
  findDeploymentByAddress,
  findDeploymentByLockingBytecode,
  findDeploymentByName,
  registeredExecutionLockingBytecode,
  registeredValueAddressLockingBytecode
} from "./deployment-registry.js";
import {
  loadCreateBuilderOnChainState as loadCreateBuilderOnChainStateImpl
} from "./sc-load-create-builder-on-chain-state.js";
import {
  resolveCreateBuilderMasterAndDataNfts as resolveCreateBuilderMasterAndDataNftsImpl
} from "./sc-resolve-create-builder-master-and-data-nfts.js";
import {
  materializeCreateBuilderVmapPermutations as materializeCreateBuilderVmapPermutationsImpl
} from "./sc-materialize-create-builder-vmap-permutations.js";
import {
  materializeCreateBuilderEarlyArgs as materializeCreateBuilderEarlyArgsImpl
} from "./sc-materialize-create-builder-early-args.js";
import { resolveCreateBuilderEntryAbi as resolveCreateBuilderEntryAbiImpl } from "./sc-resolve-create-builder-entry-abi.js";
import {
  loadCreateBuilderExternalReads as loadCreateBuilderExternalReadsImpl
} from "./sc-load-create-builder-external-reads.js";
import {
  createBuilderLoadDelegatedDynamicChunks as createBuilderLoadDelegatedDynamicChunksImpl
} from "./sc-create-builder-delegated-dynamic-chunks.js";
import {
  orchestrateCreateBuilderNestedComposeCallsite as orchestrateCreateBuilderNestedComposeCallsiteImpl
} from "./sc-orchestrate-create-builder-nested-compose-callsite.js";
import {
  orchestrateCreateBuilderExternalCalls as orchestrateCreateBuilderExternalCallsImpl
} from "./sc-orchestrate-create-builder-external-calls.js";
import {
  loadCreateBuilderIterationInputs as loadCreateBuilderIterationInputsImpl
} from "./sc-load-create-builder-iteration-inputs.js";
import {
  loadCreateBuilderSortedInsertLoops as loadCreateBuilderSortedInsertLoopsImpl
} from "./sc-load-create-builder-sorted-insert-loops.js";
import {
  finalizeCreateBuilderEntryDeleteSlots as finalizeCreateBuilderEntryDeleteSlotsImpl
} from "./sc-finalize-create-builder-entry-delete-slots.js";
import {
  resolveCreateBuilderUpsertLoopDomainKeys as resolveCreateBuilderUpsertLoopDomainKeysImpl
} from "./sc-resolve-create-builder-upsert-loop-domain-keys.js";
import {
  prepareCreateBuilderUpsertLoopKeyTopology as prepareCreateBuilderUpsertLoopKeyTopologyImpl
} from "./sc-prepare-create-builder-upsert-loop-key-topology.js";
import {
  expandCreateBuilderLateTransitive as expandCreateBuilderLateTransitiveImpl
} from "./sc-expand-create-builder-late-transitive.js";
import { planCreateBuilderNestedBases as planCreateBuilderNestedBasesImpl } from "./sc-plan-create-builder-nested-bases.js";
import {
  relocateCreateBuilderPredOutBases as relocateCreateBuilderPredOutBasesImpl
} from "./sc-relocate-create-builder-pred-out-bases.js";
import {
  completeCreateBuilderNestedUnlockers as completeCreateBuilderNestedUnlockersImpl
} from "./sc-complete-create-builder-nested-unlockers.js";
import {
  projectCreateBuilderDelegateSlots as projectCreateBuilderDelegateSlotsImpl
} from "./sc-project-create-builder-delegate-slots.js";
import {
  callerIdentityAnchorBand,
  fixCreateBuilderDelegateUnlockers as fixCreateBuilderDelegateUnlockersImpl,
  isRoutePushValueWitnessName,
  resolveDelegatePushValueWitness
} from "./sc-fix-create-builder-delegate-unlockers.js";
import {
  loadCreateBuilderTokenContainers as loadCreateBuilderTokenContainersImpl
} from "./sc-load-create-builder-token-containers.js";
import {
  loadCreateBuilderSatoshiContainer as loadCreateBuilderSatoshiContainerImpl
} from "./sc-load-create-builder-satoshi-container.js";
import {
  materializeCreateBuilderSyntheticArgs as materializeCreateBuilderSyntheticArgsImpl
} from "./sc-materialize-create-builder-synthetic-args.js";
import {
  buildCreateBuilderStateUnlockers as buildCreateBuilderStateUnlockersImpl
} from "./sc-build-create-builder-state-unlockers.js";
import {
  collectCreateBuilderEventLocks as collectCreateBuilderEventLocksImpl
} from "./sc-collect-create-builder-event-locks.js";
import {
  loadCreateBuilderDynamicChunks as loadCreateBuilderDynamicChunksImpl
} from "./sc-load-create-builder-dynamic-chunks.js";
import {
  orderedActiveTrailingEntryCollections,
  orderedTrailingEntryCollections
} from "./sc-load-create-builder-dynamic-chunks.js";
import {
  resolveCreateBuilderEffectiveLayout as resolveCreateBuilderEffectiveLayoutImpl
} from "./sc-resolve-create-builder-effective-layout.js";
import {
  applyCreateBuilderTransportedProductions as applyCreateBuilderTransportedProductionsImpl
} from "./sc-apply-create-builder-transported-productions.js";
import {
  constructCreateBuilderTransactionBuilder as constructCreateBuilderTransactionBuilderImpl
} from "./sc-construct-create-builder-transaction-builder.js";
import {
  registerCreateBuilderBuilderState as registerCreateBuilderBuilderStateImpl
} from "./sc-register-create-builder-builder-state.js";
import {
  allocateCreateBuilderFunders as allocateCreateBuilderFundersImpl
} from "./sc-allocate-create-builder-funders-accounting.js";
import {
  applyCreateBuilderPendingInputFills as applyCreateBuilderPendingInputFillsImpl
} from "./sc-apply-create-builder-pending-input-fills.js";
import {
  rebindCreateBuilderAssembledWitnesses as rebindCreateBuilderAssembledWitnessesImpl
} from "./sc-rebind-create-builder-assembled-witnesses.js";
import {
  prepareCreateBuilderDerivePrelude as prepareCreateBuilderDerivePreludeImpl
} from "./sc-prepare-create-builder-derive-prelude.js";
import {
  prepareCreateBuilderLowLevelNestedCaches as prepareCreateBuilderLowLevelNestedCachesImpl
} from "./sc-prepare-create-builder-low-level-nested-caches.js";
import {
  materializeCreateBuilderLowLevelStatefulCall as materializeCreateBuilderLowLevelStatefulCallImpl,
  publishPreparedKernelDelegateOwnerFrame
} from "./sc-materialize-create-builder-low-level-stateful-call.js";
import { runCreateBuilderDerivePass as runCreateBuilderDerivePassImpl } from "./sc-run-create-builder-derive-pass.js";
import { settlesSortedTargetsByActivity } from "./conditional-sorted-activity.js";
import {
  materializeCreateBuilderReturnEmit as materializeCreateBuilderReturnEmitImpl
} from "./sc-materialize-create-builder-return-emit.js";
import {
  finishCreateBuilderAtomicPromotion as finishCreateBuilderAtomicPromotionImpl
} from "./sc-finish-create-builder-atomic-promotion.js";
import {
  destroyStatefulContract as destroyStatefulContractImpl,
  refuseOrdinarySelfdestructCall
} from "./sc-destroy.js";
import { queryEvents as queryEventsImpl } from "./sc-query-events.js";
import { getEntries as getEntriesImpl } from "./sc-get-entries.js";
import { inferConstructorArgs as inferConstructorArgsImpl } from "./sc-infer-constructor-args.js";
import {
  prepareDeriveFullValueChunkWrites as prepareDeriveFullValueChunkWritesImpl
} from "./sc-prepare-derive-full-value-chunk-writes.js";
import {
  rebaseDeriveFullProbeDelegateWitnesses as rebaseDeriveFullProbeDelegateWitnessesImpl
} from "./sc-rebase-derive-full-probe-delegate-witnesses.js";
import {
  reconcileDeriveFullReturnWitnesses as reconcileDeriveFullReturnWitnessesImpl,
  rebindDeriveFullExternalResourceMaster as rebindDeriveFullExternalResourceMasterImpl
} from "./sc-derive-full-return-witness-helpers.js";
import { deriveFullPhase1GroupFront as deriveFullPhase1GroupFrontImpl } from "./sc-derive-full-phase1-group-front.js";
import {
  deriveFullPhase1PostEvaluateDataCommitments as deriveFullPhase1PostEvaluateDataCommitmentsImpl
} from "./sc-derive-full-phase1-post-evaluate-data-commitments.js";
import {
  deriveFullPhase1CalleeDynamicChunks as deriveFullPhase1CalleeDynamicChunksImpl
} from "./sc-derive-full-phase1-callee-dynamic-chunks.js";
import {
  keccakLoopReadSuccessors,
  readChunksFollowKeccakLoop,
  sharedSidecarPoolWithout
} from "./sc-append-create-builder-nested-callee-keccak-loop.js";
import { resolveDynamicChunkInputBase } from "./return-abi-plan.js";
import {
  deriveFullPhase1ProgressiveEntries as deriveFullPhase1ProgressiveEntriesImpl
} from "./sc-derive-full-phase1-progressive-entries.js";
import {
  deriveFullPhase1ReturnAndEvents as deriveFullPhase1ReturnAndEventsImpl
} from "./sc-derive-full-phase1-return-and-events.js";
import {
  deriveFullPhase1bOutStateAndLowLevel as deriveFullPhase1bOutStateAndLowLevelImpl
} from "./sc-derive-full-phase1b-outstate-and-llc.js";
import {
  seedDeriveFullPhase2Placeholders as seedDeriveFullPhase2PlaceholdersImpl
} from "./sc-seed-derive-full-phase2-placeholders.js";
import { prepareDeriveFullPhase2Loop as prepareDeriveFullPhase2LoopImpl } from "./sc-prepare-derive-full-phase2-loop.js";
import {
  deriveFullPhase2IterationProbe as deriveFullPhase2IterationProbeImpl
} from "./sc-derive-full-phase2-iteration-probe.js";
import {
  deriveFullPhase2ApplyStateAndEntries as deriveFullPhase2ApplyStateAndEntriesImpl
} from "./sc-derive-full-phase2-apply-state-entries.js";
import {
  deriveFullPhase2ApplyDynamicChunks as deriveFullPhase2ApplyDynamicChunksImpl
} from "./sc-derive-full-phase2-apply-dynamic-chunks.js";
import {
  deriveFullPhase2ApplyLoopEntries as deriveFullPhase2ApplyLoopEntriesImpl
} from "./sc-derive-full-phase2-apply-loop-entries.js";
import {
  deriveFullPhase2ApplyRuntimeLoop as deriveFullPhase2ApplyRuntimeLoopImpl
} from "./sc-derive-full-phase2-apply-runtime-loop.js";
import { traceRuntimeEffectStreamRuns } from "./runtime-effect-stream-trace.js";
import { deriveNestedStreamedEvents } from "./nested-streamed-events.js";
import {
  deriveFullPhase2ApplyValueChunks as deriveFullPhase2ApplyValueChunksImpl
} from "./sc-derive-full-phase2-apply-value-chunks.js";
import {
  applyDeriveFullNestedValueChunkPin as applyDeriveFullNestedValueChunkPinImpl
} from "./sc-apply-derive-full-nested-value-chunk-pins.js";
import {
  applyDeriveFullNestedEntryPins as applyDeriveFullNestedEntryPinsImpl
} from "./sc-apply-derive-full-nested-entry-pins.js";
import {
  applyDeriveFullNestedCommitsEventPins as applyDeriveFullNestedCommitsEventPinsImpl
} from "./sc-apply-derive-full-nested-commits-event-pins.js";
import {
  deriveFullPhase2ApplyDynamicRescanAndEvents as deriveFullPhase2ApplyDynamicRescanAndEventsImpl
} from "./sc-derive-full-phase2-apply-events.js";
import {
  deriveFullPhase2ApplyTransfers as deriveFullPhase2ApplyTransfersImpl
} from "./sc-derive-full-phase2-apply-transfers.js";
import { deriveFullPhase2Convergence as deriveFullPhase2ConvergenceImpl } from "./sc-derive-full-phase2-convergence.js";
import {
  deriveFullPhase2CleanedRescan as deriveFullPhase2CleanedRescanImpl
} from "./sc-derive-full-phase2-cleaned-rescan.js";
import {
  hydrateExternalPredicateState as hydrateExternalPredicateStateImpl
} from "./sc-hydrate-external-predicate-state.js";
import { upgradeStatefulContract as upgradeStatefulContractImpl } from "./sc-upgrade.js";
import {
  splitStatefulContract as splitStatefulContractImpl,
  mergeStatefulContract as mergeStatefulContractImpl
} from "./sc-split-merge.js";
import { withDelegatecall as withDelegatecallImpl } from "./sc-with-delegatecall.js";
import { autoWireLibraryDelegatecalls as autoWireLibraryDelegatecallsImpl } from "./sc-auto-wire-library-delegatecalls.js";
import { addressMappingKeyCandidates as addressMappingKeyCandidatesImpl } from "./sc-address-mapping-key-candidates.js";
import { deployStatefulContract as deployStatefulContractImpl } from "./sc-deploy.js";
import { ownCoinRefusal, signerFundingCoins } from "../framed/deploy/own-coin.js";
import { deployFromStatefulContract as deployFromStatefulContractImpl } from "./sc-deploy-from.js";
import { deriveDeployCommitments as deriveDeployCommitmentsImpl } from "./sc-derive-deploy-commitments.js";
import { deriveCommitments as deriveCommitmentsImpl } from "./sc-derive-commitments.js";
import {
  softApplyPairMint as softApplyPairMintImpl,
  softApplyUpdateExchangeRate as softApplyUpdateExchangeRateImpl
} from "./sc-soft-apply-pair-overlays.js";
import { softApplyNoopReceipt as softApplyNoopReceiptImpl } from "./sc-soft-apply-noop-receipt.js";
import {
  softAccrueInterest as softAccrueInterestImpl,
  softApplyKashiStateSideEffects as softApplyKashiStateSideEffectsImpl,
  softAdjustKashiBorrow as softAdjustKashiBorrowImpl,
  softAdjustKashiAsset as softAdjustKashiAssetImpl,
  softAdjustKashiCollateral as softAdjustKashiCollateralImpl,
  softCreditBentoCollateral as softCreditBentoCollateralImpl
} from "./sc-soft-apply-kashi.js";
import {
  resolveExternalKeccakSideCars as resolveExternalKeccakSideCarsImpl
} from "./sc-resolve-external-keccak-side-cars.js";
import { kashiSoftFailCode as kashiSoftFailCodeImpl } from "./sc-kashi-soft-fail-code.js";
import { sendRawBuilder as sendRawBuilderImpl } from "./sc-send-raw-builder.js";
import {
  buildSplitTransactionBuilder as buildSplitTransactionBuilderImpl,
  buildMergeTransactionBuilder as buildMergeTransactionBuilderImpl
} from "./sc-split-merge-builders.js";
import {
  encodeStoredElementSource as encodeStoredElementSourceImpl,
  encodeStoredValueSource as encodeStoredValueSourceImpl
} from "./sc-encode-stored-element-source.js";
import { foldRouteStoredValues } from "./fold-route-stored-values.js";
import {
  replaceRepeatedExternalBatchRow as replaceRepeatedExternalBatchRowImpl
} from "./sc-replace-repeated-external-batch-row.js";
import { buildRepeatedExternalBatch as buildRepeatedExternalBatchImpl } from "./sc-build-repeated-external-batch.js";
import { resolveExternalArgs as resolveExternalArgsImpl } from "./sc-resolve-external-args.js";
import {
  buildBusRowComposition,
  sendWithoutLogicalNonce as sendWithoutLogicalNonceImpl
} from "./sc-send-without-logical-nonce.js";
import { pushAutoResolvedExternalCall as pushAutoResolvedExternalCallImpl } from "./sc-with-external-call.js";
import {
  resolveEcrecoverComputeCoSpends as resolveEcrecoverComputeCoSpendsImpl
} from "./sc-resolve-ecrecover-co-spends.js";
import {
  resolveStatefulKeccakLoop as resolveStatefulKeccakLoopImpl
} from "./sc-resolve-stateful-keccak-loop.js";
import { resolveStatefulEcrecoverLoop as resolveStatefulEcrecoverLoopImpl } from "./sc-resolve-stateful-ecrecover-loop.js";
import {
  keccakProbeTrailingRun,
  resolveKeccakComputeCoSpends as resolveKeccakComputeCoSpendsImpl
} from "./sc-resolve-keccak-compute-co-spends.js";
import {
  paramBlockhashN as paramBlockhashNImpl,
  extractBlockhashReads as extractBlockhashReadsImpl,
  extractGraphBlockhashRead as extractGraphBlockhashReadImpl,
  resolveBlockhashCoSpends as resolveBlockhashCoSpendsImpl,
  resolveCalleeIndirectBlockhashCoSpends,
  resolveIndirectBlockhashCoSpends
} from "./sc-resolve-blockhash-co-spends.js";
import {
  refreshProjectedExternalReturns as refreshProjectedExternalReturnsImpl
} from "./sc-refresh-projected-external-returns.js";
import { evaluateExternalExpression as evaluateExternalExpressionImpl } from "./sc-evaluate-external-expression.js";
import {
  resolveExternalExpressionReturns as resolveExternalExpressionReturnsImpl
} from "./sc-resolve-external-expression-returns.js";
import {
  deriveReturnBlob as deriveReturnBlobImpl,
  describeReturnProbeFailure as describeReturnProbeFailureImpl,
  messageBusReturnBlobFromTransaction as messageBusReturnBlobFromTransactionImpl,
  messageBusEventCommitmentsFromTransaction as messageBusEventCommitmentsFromTransactionImpl
} from "./sc-derive-return-blob.js";
import { buildNamespaces as buildNamespacesImpl } from "./sc-build-namespaces.js";
import { deriveReturnValue as deriveReturnValueImpl } from "./sc-derive-return-value.js";
import { resolveSelectedDynamicWrites } from "./selected-dynamic-writes.js";
import { applyOverrides as applyOverridesImpl, reApplyOverrides as reApplyOverridesImpl } from "./sc-apply-overrides.js";
import {
  batchRaw as batchRawImpl,
  mergePublishedMessageBusHandlerMetadata
} from "./sc-batch-raw.js";
import { runtimeEntryAliasOwners } from "./sorted-batch-activity.js";
import { uniqueParticipantIndexForTarget } from "./physical-external-call.js";
import {
  assertAcyclicExternalCallPath,
  visitExpandingExternalCallGroups
} from "./external-call-graph-frontier.js";
import { buildStatefulFunctionCall as buildStatefulFunctionCallImpl } from "./sc-build-stateful-function-call.js";
import { kernelReadCarrierCapabilityForSelectedRoute } from "./kernel-read-carrier-route.js";
import {
  authenticateKernelReadCarrierRoute,
  canonicalKernelCarrierEnvelopeRows,
  kernelJournalAuthorityFingerprint,
  kernelReadCarrierCapabilityForSelectedRoute as kernelReadCarrierCapabilityForSelectedRoute2,
  kernelReadCarrierRouteIsCurrent
} from "./kernel-read-carrier-route.js";
import { decodeScriptNumber } from "./trace-commitment-helpers.js";
import {
  compactFaithfulProbeTrace,
  evaluateBoundedProbeCandidates,
  evaluateProbeTrace,
  MAX_BOUNDED_PROBE_STATES
} from "./faithful-probe-trace.js";
import { isCanonicalEvmScalarReturnVector, probeRequireMessage } from "./external-return-encoding.js";
import {
  isCanonicalEvmScalarReturnVector as isCanonicalEvmScalarReturnVector2,
  probeRequireMessage as probeRequireMessage2,
  probeRequireStatement,
  decodeEvmScalarReturn,
  decodeEvmReturnValue,
  decodeAuthenticatedProducerResultVector
} from "./external-return-encoding.js";
import { getFramedCallHandleModule, loadFramedCallHandle } from "./framed-call-loader.js";
import { calleeBlockExceedsLowLevelBand } from "./sc-select-compat-callee-block-calls.js";
function isFramedArtifact(artifact) {
  return artifact.composition?.convention === "framed";
}
function functionArgumentValuesEqual(left, right) {
  if (left === right) return true;
  if ((typeof left === "bigint" || typeof left === "number") && (typeof right === "bigint" || typeof right === "number")) {
    return BigInt(left) === BigInt(right);
  }
  if (left instanceof Uint8Array && right instanceof Uint8Array) return binsAreEqual(left, right);
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => functionArgumentValuesEqual(value, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const leftEntries = Object.entries(left);
    const rightRecord = right;
    return leftEntries.length === Object.keys(rightRecord).length && leftEntries.every(([key, value]) => functionArgumentValuesEqual(value, rightRecord[key]));
  }
  return false;
}
function functionArgumentListsEqual(left, right) {
  return left.length === right.length && left.every((value, index) => functionArgumentValuesEqual(value, right[index]));
}
function createGraphPlanningProducerResultContext() {
  return { entries: /* @__PURE__ */ new Map() };
}
function isCompilerDescribedRouteEventCommitment(commitment, compilerMetadata) {
  if (commitment === void 0 || commitment.length === 0 || commitment.length % 2 !== 0) return false;
  const compilerDescribed = compilerMetadata.compilerOwnedEventSlot && typeof compilerMetadata.eventSignature === "string" && compilerMetadata.eventSignature.length > 0;
  if (compilerMetadata.compilerOwnedEventSlot && !compilerDescribed) return false;
  return isAuthenticatedEventRepairCommitment(hexToBin(commitment), compilerDescribed);
}
function snapshotFunctionArgument(value) {
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (Array.isArray(value)) return value.map(snapshotFunctionArgument);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, snapshotFunctionArgument(child)]));
  }
  return value;
}
async function memoizeGraphPlanningProducerResult(context, callsiteId, args, target, provisional, evaluate) {
  const entries = context.entries.get(callsiteId) ?? [];
  const matching = entries.find((entry) => (entry.provisional === provisional || provisional && !entry.provisional) && functionArgumentListsEqual(entry.args, args) && functionArgumentValuesEqual(entry.target, target));
  if (matching) return matching.pending;
  const pending = evaluate();
  entries.push({
    args: args.map(snapshotFunctionArgument),
    target: snapshotFunctionArgument(target),
    provisional,
    pending
  });
  context.entries.set(callsiteId, entries);
  return pending;
}
import {
  resolvePreparedKernelDelegateExecution,
  resolvePreparedKernelDelegateOwnerFrame,
  selectKernelDelegateForwardingGroupIndex,
  materializeInternalFunctionArgument as materializeInternalFunctionArgument2,
  assertKernelJournalRecordBudget as assertKernelJournalRecordBudget2,
  kernelJournalRecordSegmentWitnesses as kernelJournalRecordSegmentWitnesses2,
  kernelJournalAccessStreamPlaceholders as kernelJournalAccessStreamPlaceholders2,
  kernelReadCarrierOwnsDuplicateProof as kernelReadCarrierOwnsDuplicateProof2,
  shouldDeferKernelJournalMaterialization,
  shouldDeferKernelJournalBatchMaterialization as shouldDeferKernelJournalBatchMaterialization2,
  planAuthenticatedKernelJournalDispositionChain as planAuthenticatedKernelJournalDispositionChain2,
  assertKernelReadCarrierAuthenticatedRows,
  selectedMessageBusResourceMetadata,
  anchorRoutedDynamicResourcesAtOwner,
  compilerRouteUsesPhysicalWrapper as compilerRouteUsesPhysicalWrapper2,
  rebaseRoutedBatchProofOffsets
} from "./kernel-route-planning.js";
async function computeFeeFromBuilder(builder) {
  const { encodeTransaction: encodeTransaction2 } = await import("@bitauth/libauth/build/lib/message/transaction-encoding.js");
  const tx = builder.buildLibauthTransaction();
  return BigInt(encodeTransaction2(tx).byteLength);
}
const OWN_STATE_EVIDENCE = [
  "entry-write",
  "entry-loop-write",
  "dynamic-write",
  "lifecycle-modifier"
];
const LIFECYCLE_MODIFIERS = ["upgrade", "selfdestruct", "delegate", "unsafe"];
class AutoDerivationError extends Error {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
    this.name = "AutoDerivationError";
  }
}
import { resolveDynamicChunkInputBase as resolveDynamicChunkInputBase2 } from "./return-abi-plan.js";
function selectReturnAbiPlan(functionName, directFunction, candidates) {
  if ((directFunction?.outputs?.length ?? 0) > 0) {
    return { logicalFunction: directFunction, physicalFunction: directFunction };
  }
  const returning = candidates.filter((candidate) => candidate.logicalFunction.outputs?.length);
  if (returning.length > 1) {
    throw new Error(
      `staticCall: '${functionName}' selects ${returning.length} logical return rows; an aggregate compiler route has no single return value.`
    );
  }
  const selected = returning[0];
  return selected && {
    logicalFunction: selected.logicalFunction,
    physicalFunction: selected.physicalFunction,
    context: selected.context
  };
}
function appendEncodedArrayElement(arrayBlob, element) {
  const count = decodePushdataValue(arrayBlob, 0, "bigint");
  const prefix = encodePushdataValue(BigInt(count.value) + 1n, "bigint");
  const out = new Uint8Array(prefix.length + (arrayBlob.length - count.bytesConsumed) + element.length);
  out.set(prefix, 0);
  out.set(arrayBlob.subarray(count.bytesConsumed), prefix.length);
  out.set(element, prefix.length + arrayBlob.length - count.bytesConsumed);
  return out;
}
function concatenateEncodedArrays(left, right) {
  const leftCount = decodePushdataValue(left, 0, "bigint");
  const rightCount = decodePushdataValue(right, 0, "bigint");
  const prefix = encodePushdataValue(
    BigInt(leftCount.value) + BigInt(rightCount.value),
    "bigint"
  );
  const leftElements = left.subarray(leftCount.bytesConsumed);
  const rightElements = right.subarray(rightCount.bytesConsumed);
  const out = new Uint8Array(prefix.length + leftElements.length + rightElements.length);
  out.set(prefix, 0);
  out.set(leftElements, prefix.length);
  out.set(rightElements, prefix.length + leftElements.length);
  return out;
}
function deriveChunkableArrayValueChannels({
  preValueWitness,
  storedPreValue,
  leadingMutation,
  currentElement
}) {
  let postValue = storedPreValue;
  if (leadingMutation && leadingMutation.length > 0) {
    postValue = concatenateEncodedArrays(postValue, leadingMutation);
  }
  if (currentElement) postValue = appendEncodedArrayElement(postValue, currentElement);
  return { preValueWitness, leadingMutation, postValue };
}
function encodeStructArgument(value, typeName, structs, timestamp, legacyJobEventCompatibility = false) {
  let decodedValue = value;
  if (value instanceof Uint8Array) {
    try {
      const decoded = decodePushdataValue(value, 0, typeName, structs);
      if (decoded.bytesConsumed !== value.length) return value;
      decodedValue = decoded.value;
    } catch {
      return value;
    }
  }
  const struct = structs?.find((candidate) => candidate.name === typeName);
  const canonicalValue = Array.isArray(decodedValue) && struct ? Object.fromEntries(struct.fields.map((field, index) => [field.name, decodedValue[index]])) : decodedValue;
  if (canonicalValue && typeof canonicalValue === "object" && !Array.isArray(canonicalValue)) {
    const record = { ...canonicalValue };
    if (legacyJobEventCompatibility && (record.timestamp_ === 0 || record.timestamp_ === 0n || record.timestamp_ === void 0)) {
      record.timestamp_ = timestamp !== void 0 && timestamp > 0n ? timestamp : BigInt(Math.floor(Date.now() / 1e3));
    }
    if (legacyJobEventCompatibility) {
      normalizeJobEventAddresses(record, typeName, structs);
    }
    return encodePushdataValue(record, typeName, structs);
  }
  return encodePushdataValue(canonicalValue, typeName, structs);
}
function p2pkhLockingBytecode(pkh) {
  const out = new Uint8Array(25);
  out[0] = 118;
  out[1] = 169;
  out[2] = 20;
  out.set(pkh, 3);
  out[23] = 136;
  out[24] = 172;
  return out;
}
function mappingKeySlotCandidates(keys, keyTypes, collection) {
  const options = keys.map((arg, index) => {
    const keyType = keyTypes?.[index];
    let encoded;
    if (typeof arg === "string") {
      if (keyType === "address" && arg.includes(":")) encoded = addressToLockScript(arg);
      else if (keyType === "address" && /^(?:[0-9a-fA-F]{2})+$/.test(arg)) encoded = hexToBin(arg);
      else if (/^0x(?:[0-9a-fA-F]{2})+$/i.test(arg)) encoded = hexToBin(arg.slice(2));
      else if (keyType && /^(?:u?int|bigint)/.test(keyType) && /^-?\d+$/.test(arg)) {
        encoded = bigIntToVmNumber(BigInt(arg));
      } else encoded = utf8ToBin(arg);
    } else if (arg instanceof Uint8Array) encoded = arg;
    else if (typeof arg === "bigint") encoded = bigIntToVmNumber(arg);
    else if (typeof arg === "number") encoded = bigIntToVmNumber(integerKey(arg));
    else encoded = bigIntToVmNumber(arg ? 1n : 0n);
    return keyType === "address" && encoded.length === 20 ? [encoded, p2pkhLockingBytecode(encoded)] : [encoded];
  });
  const encodings = options.reduce(
    (rows, candidates) => rows.flatMap((row) => candidates.map((candidate) => [...row, candidate])),
    [[]]
  );
  const seen = /* @__PURE__ */ new Set();
  return encodings.flatMap((encoding) => {
    const slot = keyToSlotMulti(encoding, collection);
    const hex = binToHex(slot);
    if (seen.has(hex)) return [];
    seen.add(hex);
    return [slot];
  });
}
function mappingEntryMatchesLegacyKeys(entry, keys) {
  const entryKeys = entry.keys ?? (entry.key !== void 0 ? [entry.key] : []);
  if (entryKeys.length !== keys.length) return false;
  return entryKeys.every((stored, index) => {
    const arg = keys[index];
    const supplied = typeof arg === "string" ? new TextEncoder().encode(arg) : typeof arg === "number" ? integerKey(arg) : arg;
    if (stored instanceof Uint8Array) {
      return supplied instanceof Uint8Array && binsAreEqual(stored, supplied);
    }
    return stored === supplied;
  });
}
function selectMappingEntryByKeys(entries, keys, keyTypes, collection) {
  const [exactSlot, ...aliasSlots] = mappingKeySlotCandidates(keys, keyTypes, collection);
  const exactMatches = entries.filter((entry) => entry.slot ? exactSlot !== void 0 && binsAreEqual(entry.slot, exactSlot) : mappingEntryMatchesLegacyKeys(entry, keys));
  if (exactMatches.length > 1) {
    throw new Error("Authenticated mapping lookup found duplicate entries for the exact key slot.");
  }
  if (exactMatches.length === 1) return exactMatches[0];
  const aliasMatches = entries.filter((entry) => entry.slot !== void 0 && aliasSlots.some((slot) => binsAreEqual(entry.slot, slot)));
  if (aliasMatches.length > 1) {
    throw new Error("Authenticated mapping lookup found multiple entries for compatibility key aliases.");
  }
  return aliasMatches[0];
}
function isLockingBytecode(bytes) {
  return bytes.length === 35 && bytes[0] === 170 && bytes[1] === 32 && bytes[34] === 135 || bytes.length === 23 && bytes[0] === 169 && bytes[1] === 20 && bytes[22] === 135 || bytes.length === 25 && bytes[0] === 118 && bytes[1] === 169 && bytes[2] === 20 && bytes[23] === 136 && bytes[24] === 172;
}
function addressArgumentLockingBytecodeHex(value) {
  let bytes;
  if (value instanceof Uint8Array) bytes = value;
  else if (typeof value === "string") {
    try {
      bytes = value.includes(":") ? addressToLockScript(value) : hexToBin(value.replace(/^0x/i, ""));
    } catch {
      return void 0;
    }
  }
  return bytes && isLockingBytecode(bytes) ? binToHex(bytes) : void 0;
}
function externalCallTargetArgumentLockingBytecodeHex(owner, slot, visibleArgs) {
  const call = owner.externalCalls?.[slot];
  if (!call) return void 0;
  const inputs = owner.inputs.filter((input) => !input.name.startsWith("__internal__"));
  const index = call.addressSource?.kind === "forward" ? call.addressSource.paramIndex : call.addressParam === void 0 ? void 0 : inputs.findIndex((input) => input.name === call.addressParam);
  return index === void 0 || index < 0 ? void 0 : addressArgumentLockingBytecodeHex(visibleArgs[index]);
}
function externalCallTargetSourceLockingBytecodeHex(owner, slot, visibleArgs, resolvedAddressSource) {
  return addressArgumentLockingBytecodeHex(resolvedAddressSource) ?? externalCallTargetArgumentLockingBytecodeHex(owner, slot, visibleArgs);
}
function normalizeJobEventAddresses(decoded, type, structs) {
  const structName = type.endsWith("[]") ? type.slice(0, -2) : type;
  const def = structs?.find((candidate) => candidate.name === structName);
  if (!def?.fields.some((field) => field.name === "address_" && field.type === "bytes")) return decoded;
  const rows = Array.isArray(decoded) ? decoded : [decoded];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const record = row;
    const raw = record.address_;
    let bytes;
    if (raw instanceof Uint8Array) bytes = raw;
    else if (typeof raw === "string") {
      if (raw.includes(":")) {
        try {
          bytes = addressToLockScript(raw);
        } catch {
          bytes = utf8ToBin(raw);
        }
      } else if (raw.startsWith("0x") && raw.length % 2 === 0) bytes = hexToBin(raw.slice(2));
      else bytes = utf8ToBin(raw);
    }
    if (!bytes || bytes.length === 0) continue;
    if (!isLockingBytecode(bytes)) {
      try {
        const text = binToUtf8(bytes);
        if (text.includes(":")) bytes = addressToLockScript(text);
      } catch {
      }
    }
    if (bytes.length === 20) bytes = p2pkhLockingBytecode(bytes);
    record.address_ = bytes;
  }
  return decoded;
}
function usesLegacyJobEventCompatibility(artifact, type, structs) {
  if (artifact.messageBus?.convention !== "legacy-unroll") return false;
  const name = type.endsWith("[]") ? type.slice(0, -2) : type;
  if (name !== "JobEventData") return false;
  const definition = structs?.find((candidate) => candidate.name === name);
  return definition?.fields.length === 4 && definition.fields[0].name === "type_" && definition.fields[0].type === "uint8" && definition.fields[1].name === "address_" && definition.fields[1].type === "bytes" && definition.fields[2].name === "data_" && definition.fields[2].type === "bytes" && definition.fields[3].name === "timestamp_" && definition.fields[3].type === "uint32";
}
function adaptLegacyNestedJobEventArguments(artifact, functionName, args, timestamp) {
  const functions = artifact.abi.filter((candidate) => candidate.name === functionName);
  if (functions.length !== 1) return [...args];
  const fn = functions[0];
  if (fn.inputs.length !== args.length) return [...args];
  const compatibleInputs = fn.inputs.flatMap((input, index) => usesLegacyJobEventCompatibility(artifact, input.type, artifact.structs) ? [index] : []);
  if (compatibleInputs.length !== 1) return [...args];
  const adapted = [...args];
  const inputIndex = compatibleInputs[0];
  adapted[inputIndex] = stampEmptyJobEventTimestamp(adapted[inputIndex], timestamp);
  return adapted;
}
function usesLegacyJobEventTraceCompatibility(artifacts) {
  return artifacts.some((artifact) => {
    const layout = artifact.stateLayout;
    if (!layout) return false;
    const collections = [...layout.collections ?? [], ...layout.mappings ?? []];
    return collections.some((collection) => collection.chunkableValue === true && usesLegacyJobEventCompatibility(
      artifact,
      collection.valueType,
      layout.structs ?? artifact.structs
    ));
  });
}
function isExcludedLegacyJobEventTraceCommitment(commitment, legacyJobEventCompatibility) {
  return legacyJobEventCompatibility && isJobEventEmitCommitment(commitment);
}
function isP2sh32LockingBytecode(bytes) {
  return !!bytes && bytes.length === 35 && bytes[0] === 170 && bytes[1] === 32 && bytes[34] === 135;
}
function routeValueRunFingerprint(chunks) {
  const ordered = [...chunks].sort((left, right) => left.outputIndex - right.outputIndex);
  const base = ordered[0]?.outputIndex ?? 0;
  if (ordered.some((chunk, index) => chunk.outputIndex !== base + index)) {
    throw new Error("Route value-run materialization must occupy one contiguous output band.");
  }
  return ordered.map((chunk) => [
    chunk.outputIndex - base,
    chunk.commitment,
    binToHex(chunk.lockingBytecode)
  ].join(":")).join("|");
}
function recordRouteProbeObservation(observations, observation, convention) {
  const previous = observations.get(observation.identity);
  if (previous === void 0) {
    observations.set(observation.identity, observation.fingerprint);
    return "new";
  }
  if (previous === observation.fingerprint) return "same";
  if (convention === "kernel-row-loop") {
    throw new Error(
      `Kernel route probe produced unstable materialization for ${observation.identity}.`
    );
  }
  observations.set(observation.identity, observation.fingerprint);
  return "changed";
}
function progressiveRouteProbePassLimit(entrySlotCount, writes) {
  const resources = new Set(writes.map(valueChunkWriteResourceIdentity));
  return Math.max(1, 2 * entrySlotCount + 2 * Math.max(1, resources.size) + 1);
}
function routeProbeRepairableEntryCoordinateCount(group, embeddedDelegate) {
  const coordinates = /* @__PURE__ */ new Set();
  for (const carrier of [group, embeddedDelegate]) {
    if (!carrier?.blockLayout) continue;
    const owner = [
      carrier.categoryId.toLowerCase(),
      carrier.masterUtxo.txid.toLowerCase(),
      carrier.masterUtxo.vout
    ].join(":");
    for (const slot of carrier.blockLayout.slots) {
      if (slot.kind === "entry") coordinates.add(`${owner}:${slot.offset}`);
    }
  }
  return coordinates.size;
}
function permitsRouteValueChunkDerivation(convention, writes) {
  return convention !== "kernel-row-loop" || writes.length > 0;
}
function physicalExternalCallFunction(group) {
  return group.compilerRoute?.abiFunction ?? group.externalContract?.inner?.artifact.abi?.find((candidate) => candidate.name === group.functionName);
}
function hasPublishedEntryEffects(group) {
  return physicalExternalCallFunction(group)?.entryAccesses !== void 0;
}
function computedStateWriterGroupIndex(groups, candidateIndices, ownerConvention) {
  const described = candidateIndices.filter((index) => hasPublishedEntryEffects(groups[index]));
  const writers = described.filter((index) => {
    const abi = physicalExternalCallFunction(groups[index]);
    return abi?.writesState === true && abi.entryAccesses?.some((access) => access.operations.includes("write")) === true;
  });
  if (writers.length === 1) return writers[0];
  if (described.length > 0) return void 0;
  if (!permitsLegacyNamedValueChunkFallback(
    candidateIndices.map((index) => groups[index]),
    ownerConvention
  )) {
    return void 0;
  }
  return candidateIndices.find((index) => {
    const name = groups[index]?.compilerRoute?.abiFunction.name ?? groups[index]?.functionName;
    return name === "transferFrom" || name === "transfer" || name === "approve";
  });
}
function chunkableWriterGroupIndex(groups, ownerConvention) {
  const candidates = groups.flatMap((group, index) => {
    const abi = physicalExternalCallFunction(group);
    return abi && writesChunkableValue(group, abi) ? [index] : [];
  });
  if (candidates.length === 1) return candidates[0];
  if (groups.some(hasPublishedEntryEffects)) return -1;
  if (!permitsLegacyNamedValueChunkFallback(groups, ownerConvention)) return -1;
  const plannedLegacyCandidates = groups.flatMap((group, index) => legacyPlannedChunkableValueWriteCollection(group) === void 0 ? [] : [index]);
  if (plannedLegacyCandidates.length === 1) return plannedLegacyCandidates[0];
  if (plannedLegacyCandidates.length > 1) return -1;
  return groups.findIndex((group) => legacyIsPublishJobEventName(group.functionName));
}
function writesChunkableValue(group, abiFunction) {
  return chunkableValueWriteCollections(group, abiFunction).length > 0;
}
function describeValueChunkWrites(group, stateOwnerCategoryId) {
  const artifact = group.externalContract?.inner?.artifact;
  const abiFunction = group.compilerRoute?.abiFunction ?? artifact?.abi.find((candidate) => candidate.name === group.functionName);
  if (!abiFunction) return [];
  const layout = abiFunction.blockLayout ?? group.blockLayout;
  if (!layout) return [];
  const activeFunctions = group.compilerRoute?.abiFunction === abiFunction && (group.compilerRoute.rowArguments?.length ?? 0) > 0 ? group.compilerRoute.rowArguments.map((row) => row.handler) : [abiFunction];
  const activeWriteCollections = abiFunction.messageBusActiveWriteCollections;
  const writes = [];
  for (const activeFunction of activeFunctions) {
    for (const [entryAccessSlot, access] of (activeFunction.entryAccesses ?? []).entries()) {
      if (!access.operations.includes("write")) continue;
      const collection = group.stateLayout.collections?.find((candidate) => candidate.name === access.collection || candidate.signature === access.collection);
      if (!collection?.chunkableValue) continue;
      if (activeWriteCollections !== void 0 && !activeWriteCollections.some((candidate) => candidate === access.collection || candidate === collection.name || candidate === collection.signature)) continue;
      const routeSlot = access.slotIndex ?? entryAccessSlot;
      const blockSlot = layout.slots.find((slot) => slot.kind === "entry" && slot.slotIndex === routeSlot)?.offset;
      if (blockSlot === void 0) continue;
      const insert = group.plannedEntryInserts?.find((planned) => planned.blockSlot === blockSlot);
      const commitment = insert?.newCommitment ?? group.blockInputs?.[blockSlot]?.token?.nft?.commitment;
      if (commitment === void 0) continue;
      const bytes = typeof commitment === "string" ? hexToBin(commitment) : commitment;
      if (bytes.length < 32) continue;
      const keySlot = decodeEntryCommitment(bytes).slot;
      writes.push({
        categoryId: stateOwnerCategoryId ?? group.categoryId,
        collection: collection.name,
        collectionSignature: collection.signature,
        collectionHash: binToHex(computeCollectionHash(collection.signature)),
        keySlot: binToHex(keySlot),
        entryAccessSlot,
        routeSlot,
        operation: insert ? "insert" : "update",
        outputBase: group.valueChunkOutputBase ?? -1,
        outputCount: group.valueChunkOutputCount ?? 0
      });
    }
  }
  return writes;
}
function chunkableValueWriteCollections(group, abiFunction) {
  const activeWriteCollections = abiFunction.messageBusActiveWriteCollections;
  const activeFunctions = group.compilerRoute?.abiFunction === abiFunction && (group.compilerRoute.rowArguments?.length ?? 0) > 0 ? group.compilerRoute.rowArguments.map((row) => row.handler) : [abiFunction];
  return [...new Set(activeFunctions.flatMap((activeFunction) => (activeFunction.entryAccesses ?? []).flatMap((access) => {
    if (!access.operations.includes("write") || activeWriteCollections !== void 0 && !activeWriteCollections.includes(access.collection)) return [];
    const collection = group.stateLayout.collections?.find((candidate) => candidate.name === access.collection || candidate.signature === access.collection);
    return access.chunkableArrayValue === true || collection?.chunkableValue === true ? [access.collection] : [];
  })))];
}
import {
  resolveKernelValueChunkResourceLanes,
  resolveKernelValueChunkResourceLane,
  resolveChunkableEntryCollection,
  resolvePublishedEntryBlockOffset
} from "./kernel-value-chunk-lanes.js";
function routeProbeEntrySlotOffsetForOutput(outputIndex, layouts) {
  for (const { base, slots } of layouts) {
    if (!slots || base < 0) continue;
    const relative = outputIndex - base;
    const atIndex = slots[relative];
    if (atIndex?.kind === "entry") return atIndex.offset ?? relative;
    const byOffset = slots.find((slot) => slot.kind === "entry" && slot.offset === relative);
    if (byOffset) return byOffset.offset ?? relative;
  }
  return void 0;
}
function extractExpectedOutputCommitmentFromTrace(trace, outputIndex, actualCommitment) {
  const pendingOutputIndices = [];
  for (const state of trace) {
    if (state.controlStack.some((flag) => flag === false)) continue;
    const opcode = state.instructions[state.ip]?.opcode;
    if (opcode === Op.OP_OUTPUTTOKENCOMMITMENT) {
      pendingOutputIndices.push(state.stack.length > 0 ? Number(decodeScriptNumber(state.stack[state.stack.length - 1])) : -1);
      continue;
    }
    const isPush = opcode !== void 0 && opcode <= Op.OP_16;
    const isCommitmentComparison = opcode === Op.OP_EQUALVERIFY || opcode === Op.OP_EQUAL;
    if (!isCommitmentComparison) {
      if (!isPush && opcode !== Op.OP_INVOKE) pendingOutputIndices.length = 0;
      continue;
    }
    const inspectedOutputIndex = pendingOutputIndices.pop();
    if (inspectedOutputIndex !== outputIndex || state.stack.length < 2) continue;
    const below = binToHex(state.stack[state.stack.length - 2]);
    const top = binToHex(state.stack[state.stack.length - 1]);
    if (below === actualCommitment && top !== actualCommitment) return top;
    if (top === actualCommitment && below !== actualCommitment) return below;
    if (below.length >= 128 && top.length < 128) return below;
    if (top.length >= 128 && below.length < 128) return top;
  }
  return void 0;
}
function selectEvmScalarReturnCommitment(candidates, expectedTypes, allowRaw = true) {
  const bytes = expectedTypes.length * 32;
  for (const candidate of candidates) {
    if (peekPushdataEncodedLength(candidate) !== candidate.length) continue;
    try {
      const outer = decodePushdataValue(candidate, 0, "bytes");
      if (!(outer.value instanceof Uint8Array) || outer.bytesConsumed !== candidate.length) continue;
      if (!isCanonicalEvmScalarReturnVector(outer.value, expectedTypes)) continue;
      return binToHex(outer.value);
    } catch {
    }
  }
  if (!allowRaw) return void 0;
  for (const candidate of candidates) {
    if (candidate.length !== bytes) continue;
    if (!isCanonicalEvmScalarReturnVector(candidate, expectedTypes)) continue;
    if (expectedTypes.length === 1 && expectedTypes[0] === "bool") {
      if (candidate[31] === 0) continue;
    }
    return binToHex(candidate);
  }
  return void 0;
}
function isCanonicalEvmScalarReturnBlob(candidate, expectedTypes) {
  if (peekPushdataEncodedLength(candidate) !== candidate.length) return false;
  try {
    const outer = decodePushdataValue(candidate, 0, "bytes");
    return outer.value instanceof Uint8Array && outer.bytesConsumed === candidate.length && isCanonicalEvmScalarReturnVector(outer.value, expectedTypes);
  } catch {
    return false;
  }
}
const EVM_DYNAMIC_RETURN_TYPES = /* @__PURE__ */ new Set(["bytes", "string"]);
function isConstrainedEvmResultVector(resultTypeGroups) {
  const rows = resultTypeGroups.flat();
  if (resultTypeGroups.length < 2 || rows.length === 0) return false;
  if (rows.some((type) => EVM_DYNAMIC_RETURN_TYPES.has(type))) return false;
  return rows.some((type) => {
    if (type === "bool" || type === "address" || type === "address payable") return true;
    if (/^bytes(?:[1-9]|[12][0-9]|3[0-2])$/.test(type)) return true;
    const bounded = /^u?(?:int|fixed)(\d+)(?:x\d+)?$/.exec(type);
    return bounded !== null && Number(bounded[1]) < 256;
  });
}
import {
  canonicalEvmReturnVectorLength,
  isCanonicalEvmReturnVector,
  isCanonicalEvmReturnSequence,
  isCanonicalEvmReturnBlob,
  selectEvmReturnCommitment
} from "./external-return-encoding.js";
function encodeExternalReturnValues(values, types, structs, solidityAbi, enums) {
  if (solidityAbi) return encodeEvmInvocationResult(values, types, structs, enums);
  if (values.length !== types.length) {
    throw new Error(`Native result has ${values.length} values for ${types.length} declared types`);
  }
  const parts = values.map((value, index) => encodeEventPushdataValue(value, types[index], structs));
  const encoded = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    encoded.set(part, offset);
    offset += part.length;
  }
  return encoded;
}
function encodeExternalReturnValue(value, type, structs, solidityAbi, enums) {
  return encodeExternalReturnValues([value], [type], structs, solidityAbi, enums);
}
function externalReturnsForCallsites(argSources, results, producerCalls, consumer) {
  const resolved = /* @__PURE__ */ new Map();
  const producerById = /* @__PURE__ */ new Map();
  for (const producer of producerCalls) {
    if (producer.callsiteId === void 0 || producer.callsiteId < 0) {
      throw new Error("Graph external-call metadata requires a nonnegative callsiteId for every producer.");
    }
    if (producerById.has(producer.callsiteId)) {
      throw new Error(`Graph external-call metadata has duplicate callsiteId ${producer.callsiteId}.`);
    }
    producerById.set(producer.callsiteId, producer);
  }
  if (consumer?.resultConsumers) {
    const lanes = /* @__PURE__ */ new Set();
    for (const lane of consumer.resultConsumers) {
      if (!Number.isInteger(lane.consumerCallsiteId) || lane.consumerCallsiteId < 0 || "argument" in lane && (!Number.isInteger(lane.argument) || lane.argument < 0) || !("argument" in lane) && lane.condition !== true && lane.iterationDomain !== true || !Number.isInteger(lane.producerCallsiteId) || lane.producerCallsiteId < 0) {
        throw new Error("Graph result-consumer metadata requires nonnegative integer callsite and argument lanes.");
      }
      if (Number(lane.condition === true) + Number("iterationDomain" in lane && lane.iterationDomain === true) + Number("argument" in lane) !== 1) {
        throw new Error("Graph result-consumer metadata requires one valid consumer lane.");
      }
      const producer = producerById.get(lane.producerCallsiteId);
      if (!producer) {
        throw new Error(
          `Graph result-consumer metadata references missing producer callsite ${lane.producerCallsiteId}.`
        );
      }
      if (lane.resultIndex !== void 0 && (!Number.isInteger(lane.resultIndex) || lane.resultIndex < 0 || lane.resultIndex >= (producer.returnTypes?.length ?? 0))) {
        throw new Error(
          `Graph result-consumer metadata has invalid result index ${String(lane.resultIndex)} for producer ${lane.producerCallsiteId}.`
        );
      }
      const key = `${lane.consumerCallsiteId}:${lane.argument ?? ("iterationDomain" in lane ? "domain" : "condition")}:${lane.producerCallsiteId}:${lane.resultIndex ?? "*"}`;
      if (lanes.has(key)) throw new Error(`Graph result-consumer metadata has duplicate lane ${key}.`);
      lanes.add(key);
    }
  }
  const visit = (expression, argument) => {
    if (!expression) return;
    for (const child of [
      expression.target,
      expression.expression,
      expression.left,
      expression.right,
      expression.condition,
      expression.ifTrue,
      expression.ifFalse
    ]) visit(child, argument);
    for (const child of expression.args ?? []) visit(child, argument);
    if (expression.kind === "producerResult" && expression.callsiteId !== void 0) {
      const producer = producerById.get(expression.callsiteId);
      const resultIndex = expression.resultIndex;
      if (!producer || resultIndex === void 0 || !Number.isInteger(resultIndex) || resultIndex < 0 || resultIndex >= (producer.returnTypes?.length ?? 0)) {
        throw new Error(
          `Graph producerResult ${expression.callsiteId}:${String(resultIndex)} does not identify one published result.`
        );
      }
      if (consumer?.resultConsumers) {
        const lanes = consumer.resultConsumers.filter((lane) => lane.consumerCallsiteId === consumer.callsiteId && lane.argument === argument && lane.producerCallsiteId === expression.callsiteId && (lane.resultIndex === void 0 || lane.resultIndex === resultIndex));
        if (lanes.length !== 1) {
          throw new Error(
            `Graph producerResult ${expression.callsiteId}:${resultIndex} does not identify exactly one published consumer lane ${consumer.callsiteId}:${argument}.`
          );
        }
      }
      const result2 = results.get(expression.callsiteId);
      if (result2 !== void 0 && (producer.returnTypes?.length ?? 0) > 1 && (!Array.isArray(result2) || result2.length !== producer.returnTypes.length)) {
        throw new Error(
          `Authenticated graph result for producer ${expression.callsiteId} does not match its ${producer.returnTypes.length}-component schema.`
        );
      }
      const selected = (producer.returnTypes?.length ?? 0) === 1 ? result2 : Array.isArray(result2) ? result2[resultIndex] : void 0;
      if (selected !== void 0) resolved.set(JSON.stringify(expression), selected);
      return;
    }
    if (expression.kind !== "externalCall" || expression.callsiteId === void 0) return;
    const result = results.get(expression.callsiteId);
    if (result !== void 0) resolved.set(JSON.stringify(expression), result);
  };
  for (const [argument, source] of (argSources ?? []).entries()) visit(source.expression, argument);
  return resolved;
}
function isCompleteCollectionValue(candidate, valueType, structs) {
  if (!valueType) return true;
  try {
    return decodePushdataValue(candidate, 0, valueType, structs).bytesConsumed === candidate.length;
  } catch {
    return false;
  }
}
function authenticatedCollectionValueSelector(valueType, structs) {
  const digests = /* @__PURE__ */ new WeakMap();
  const completeness = /* @__PURE__ */ new WeakMap();
  const digest = (item) => {
    const cached = digests.get(item);
    if (cached !== void 0) return cached;
    const computed = binToHex(sha256Sync(item));
    digests.set(item, computed);
    return computed;
  };
  const complete = (item) => {
    const cached = completeness.get(item);
    if (cached !== void 0) return cached;
    const computed = isCompleteCollectionValue(item, valueType, structs);
    completeness.set(item, computed);
    return computed;
  };
  const newestRooted = (items, candidateRoots) => {
    for (let index = items.length - 1; index >= 0; index--) {
      const item = items[index];
      if (item.length <= VALUE_HEAD_SIZE || item.length > 1e4) continue;
      if (!candidateRoots.has(digest(item)) || !complete(item)) continue;
      return item;
    }
    return void 0;
  };
  return (items, roots, preferredRoots) => {
    if (preferredRoots.size > 0) {
      const stored = newestRooted(items, preferredRoots);
      if (stored) return stored;
    }
    return newestRooted(items, roots);
  };
}
function selectAuthenticatedCollectionValue(items, roots, preferredRoots, valueType, structs) {
  return authenticatedCollectionValueSelector(valueType, structs)(items, roots, preferredRoots);
}
function selectAuthenticatedPreValueWitness(items, storedRoots, valueType, structs) {
  if (storedRoots.size === 0) return void 0;
  return authenticatedCollectionValueSelector(valueType, structs)(items, storedRoots, storedRoots);
}
function integerSqrt(value) {
  if (value < 0n) return void 0;
  if (value < 2n) return value;
  let current = value;
  let next = (current + 1n) / 2n;
  while (next < current) {
    current = next;
    next = (current + value / current) / 2n;
  }
  return current;
}
function evalComputedKey(label, args, inputs, state, stateLengthDeltas, mappingValue, selfLockingBytecode, producerValues) {
  if (!label) return void 0;
  const encode = (value) => {
    if (value instanceof Uint8Array) return value;
    if (typeof value === "bigint") return bigIntToVmNumber(value);
    if (typeof value === "number") return bigIntToVmNumber(BigInt(value));
    if (typeof value === "boolean") return bigIntToVmNumber(value ? 1n : 0n);
    if (typeof value === "string") return value.includes(":") ? addressToLockScript(value) : utf8ToBin(value);
    return void 0;
  };
  const splitTopLevel = (s) => {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(" || s[i] === "[" || s[i] === "{") depth++;
      else if (s[i] === ")" || s[i] === "]" || s[i] === "}") depth--;
      else if (s[i] === "," && depth === 0) return [s.slice(0, i), s.slice(i + 1)];
    }
    return void 0;
  };
  const evalValue = (s) => {
    const produced = s.match(/^producer:(-?\d+):(\d+)$/);
    if (produced) return producerValues?.get(`${produced[1]}:${produced[2]}`);
    let m = s.match(/^id:(.+)$/);
    if (m) {
      const idx = inputs.findIndex((i) => i.name === m[1]);
      if (idx >= 0) {
        const bound = args[idx];
        const type = inputs[idx].type;
        if (typeof bound === "string" && type !== void 0 && /^(?:bytes\d*|byte|address|pubkey|sig|datasig)$/.test(type)) {
          try {
            return encodeFunctionArgument(bound, type);
          } catch {
            return bound;
          }
        }
        if (typeof bound === "number") return BigInt(bound);
        if (typeof bound === "string" && /^-?[0-9][0-9_]*$/.test(bound)) return BigInt(bound.replace(/_/g, ""));
        return bound;
      }
      if (m[1] === "token0" || m[1] === "token1") {
        const addressIndices = inputs.map((input, index) => ({ input, index })).filter(({ input }) => !input.name.startsWith("__internal__") && (input.type === "address" || input.type?.startsWith("address ") === true)).map(({ index }) => index);
        if (addressIndices.length >= 2) {
          const a = encode(args[addressIndices[0]]);
          const b = encode(args[addressIndices[1]]);
          if (a && b) {
            const [token0, token1] = binToHex(a) < binToHex(b) ? [a, b] : [b, a];
            return m[1] === "token0" ? token0 : token1;
          }
        }
      }
      return void 0;
    }
    m = s.match(/^lit:(.+)$/);
    if (m) {
      if (m[1] === "true") return true;
      if (m[1] === "false") return false;
      if (/^-?[0-9][0-9_]*$/.test(m[1])) return BigInt(m[1].replace(/_/g, ""));
      if (/^0x[0-9a-f]*$/i.test(m[1])) return hexToBin(m[1].slice(2));
      return m[1];
    }
    m = s.match(/^const:(-?[0-9][0-9_]*)$/);
    if (m) return BigInt(m[1].replace(/_/g, ""));
    m = s.match(/^state:(.+)$/);
    if (m) return state?.[m[1]];
    m = s.match(/^cast:address\(unop:tx\.inputs\[[^\]]+\]\.lockingBytecode\(nullop:this\.activeInputIndex\)\)$/);
    if (m) return selfLockingBytecode;
    m = s.match(/^unop:\.length\((.*)\)$/);
    if (m) {
      const stateRef = m[1].match(/^state:(.+)$/);
      const value = evalValue(m[1]);
      if (Array.isArray(value) || value instanceof Uint8Array || typeof value === "string") {
        return BigInt(value.length) + (stateRef ? stateLengthDeltas?.[stateRef[1]] ?? 0n : 0n);
      }
      return void 0;
    }
    m = s.match(/^cast:[a-z0-9]+\((.*)\)$/i);
    if (m) return evalValue(m[1]);
    m = s.match(/^unop:!\((.*)\)$/);
    if (m) {
      const value = evalValue(m[1]);
      if (typeof value === "boolean") return !value;
      if (typeof value === "bigint") return value === 0n;
      if (typeof value === "number") return value === 0;
      return void 0;
    }
    m = s.match(/^arridx\((.*)\)$/);
    if (m) {
      const pair = splitTopLevel(m[1]);
      if (!pair) return void 0;
      const array = evalValue(pair[0]);
      const index = evalValue(pair[1]);
      const n = typeof index === "bigint" ? Number(index) : typeof index === "number" ? index : NaN;
      return Array.isArray(array) && Number.isSafeInteger(n) ? array[n] : void 0;
    }
    m = s.match(/^field:([^()]+)\((.*)\)$/);
    if (m) {
      const object = evalValue(m[2]);
      return object && typeof object === "object" ? object[m[1]] : void 0;
    }
    m = s.match(/^map:([^()]+)\((.*)\)$/);
    if (m) {
      const values = state?.[m[1]];
      const index = evalValue(m[2]);
      const n = typeof index === "bigint" ? Number(index) : typeof index === "number" ? index : NaN;
      if (!Array.isArray(values)) return mappingValue?.(m[1], index);
      if (!Number.isSafeInteger(n) || n < 0 || n >= values.length) return void 0;
      return values[n];
    }
    m = s.match(/^binop:([^()]+)\((.*)\)$/);
    if (m) {
      const pair = splitTopLevel(m[2]);
      if (!pair) return void 0;
      const left = evalValue(pair[0]);
      if (m[1] === "&&" || m[1] === "||") {
        const asBoolean = (value) => typeof value === "boolean" ? value : typeof value === "bigint" ? value !== 0n : typeof value === "number" ? value !== 0 : void 0;
        const leftValue = asBoolean(left);
        if (leftValue === void 0) return void 0;
        if (m[1] === "&&" && !leftValue) return false;
        if (m[1] === "||" && leftValue) return true;
        return asBoolean(evalValue(pair[1]));
      }
      const right = evalValue(pair[1]);
      if (left === void 0 || right === void 0) return void 0;
      if (m[1] === "==" || m[1] === "!=") {
        const zeroAddress = (value) => value instanceof Uint8Array && [0, 20, 32].includes(value.length) && value.every((byte) => byte === 0);
        const equal = left instanceof Uint8Array && right instanceof Uint8Array ? binsAreEqual(left, right) : left instanceof Uint8Array && (typeof right === "bigint" || typeof right === "number") ? zeroAddress(left) && BigInt(right) === 0n : right instanceof Uint8Array && (typeof left === "bigint" || typeof left === "number") ? zeroAddress(right) && BigInt(left) === 0n : typeof left === typeof right && ["bigint", "number", "boolean", "string"].includes(typeof left) ? left === right : void 0;
        return equal === void 0 ? void 0 : m[1] === "==" ? equal : !equal;
      }
      if (left instanceof Uint8Array && right instanceof Uint8Array && (m[1] === "<" || m[1] === "<=" || m[1] === ">" || m[1] === ">=")) {
        const number = (bytes) => bytes.reduce((value, byte) => value << 8n | BigInt(byte), 0n);
        const [l, r] = [number(left), number(right)];
        return m[1] === "<" ? l < r : m[1] === "<=" ? l <= r : m[1] === ">" ? l > r : l >= r;
      }
      if (typeof left !== "bigint" || typeof right !== "bigint") return void 0;
      if (m[1] === "+") return left + right;
      if (m[1] === "-") return left - right;
      if (m[1] === "*") return left * right;
      if (m[1] === "/") return right === 0n ? void 0 : left / right;
      if (m[1] === "%") return right === 0n ? void 0 : left % right;
      if (m[1] === "<") return left < right;
      if (m[1] === "<=") return left <= right;
      if (m[1] === ">") return left > right;
      if (m[1] === ">=") return left >= right;
      return void 0;
    }
    m = s.match(/^ternary\((.*)\)$/);
    if (m) {
      const head = splitTopLevel(m[1]);
      const rest = head ? splitTopLevel(head[1]) : void 0;
      if (!head || !rest) return void 0;
      const cond = evalValue(head[0]);
      const taken = typeof cond === "boolean" ? cond : typeof cond === "bigint" ? cond !== 0n : typeof cond === "number" ? cond !== 0 : void 0;
      if (taken === void 0) return void 0;
      return evalValue(taken ? rest[0] : rest[1]);
    }
    m = s.match(/^call:(\w+)\((.*)\)$/);
    if (m) {
      if (m[1] === "sqrt" || m[1] === "min" || m[1] === "max") {
        const parts = m[1] === "sqrt" ? [m[2]] : splitTopLevel(m[2]);
        if (parts === void 0 || m[1] !== "sqrt" && !parts[1]) return void 0;
        const numbers = parts.map((part) => {
          const value = evalValue(part);
          return typeof value === "bigint" ? value : typeof value === "number" ? BigInt(value) : void 0;
        });
        if (numbers.some((value) => value === void 0)) return void 0;
        if (m[1] === "sqrt") return integerSqrt(numbers[0]);
        return m[1] === "min" ? numbers[0] < numbers[1] ? numbers[0] : numbers[1] : numbers[0] > numbers[1] ? numbers[0] : numbers[1];
      }
      const inner = encode(evalValue(m[2]));
      if (!inner) return void 0;
      switch (m[1]) {
        case "hash160":
          return hash160Sync(inner);
        case "ripemd160":
          return ripemd160Sync(inner);
        case "sha256":
          return sha256Sync(inner);
        case "hash256":
          return hash256Sync(inner);
        default:
          return void 0;
      }
    }
    return void 0;
  };
  return encode(evalValue(label));
}
function decodeInlineVmapValue(value, present, valueType, chunkable, structs) {
  try {
    if (!present) return getDefaultStateValue(valueType, structs);
    if (value === void 0) return void 0;
    let raw = value;
    if (chunkable) {
      if (raw.length < 4) return void 0;
      const len = raw[0] | raw[1] << 8 | raw[2] << 16 | raw[3] << 24;
      if (len > VALUE_INLINE_LIMIT) return void 0;
      if (raw.length !== 4 + len) return void 0;
      raw = raw.slice(4);
    }
    if (raw.length === 0) return getDefaultStateValue(valueType, structs);
    return decodePushdataValue(raw, 0, valueType, structs).value;
  } catch {
    return void 0;
  }
}
function decodeInlineVmapStruct(value, present, valueType, chunkable, structs) {
  const decoded = decodeInlineVmapValue(value, present, valueType, chunkable, structs);
  return decoded && typeof decoded === "object" && !Array.isArray(decoded) ? decoded : void 0;
}
function substPreservedStructFields(expr, collection, fieldValue) {
  const mapTok = `(map:${collection}(`;
  let out = "";
  let i = 0;
  while (i < expr.length) {
    const start = expr.indexOf("field:", i);
    if (start < 0) {
      out += expr.slice(i);
      break;
    }
    out += expr.slice(i, start);
    const nameStart = start + "field:".length;
    const mapAt = expr.indexOf(mapTok, nameStart);
    const name = mapAt < 0 ? "" : expr.slice(nameStart, mapAt);
    if (mapAt < 0 || !/^[A-Za-z_]\w*$/.test(name)) {
      out += "field:";
      i = nameStart;
      continue;
    }
    let depth = 0;
    let j = mapAt;
    for (; j < expr.length; j += 1) {
      if (expr[j] === "(") depth += 1;
      else if (expr[j] === ")") {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    if (depth !== 0) return void 0;
    const fv = fieldValue(name);
    if (fv === void 0) return void 0;
    out += `lit:${fv.toString()}`;
    i = j;
  }
  return out;
}
function parseNftCapability(catBytes) {
  if (catBytes.length <= 32) return "none";
  if (catBytes[32] === 1) return "mutable";
  if (catBytes[32] === 2) return "minting";
  throw new Error(`Unknown NFT capability byte: 0x${catBytes[32].toString(16).padStart(2, "0")}`);
}
function isValueChunkIdentityCountPin(instructions, ip) {
  const opcode = instructions[ip]?.opcode;
  return opcode === Op.OP_EQUALVERIFY && instructions[ip - 1]?.opcode === Op.OP_DROP && instructions[ip + 1]?.opcode === Op.OP_2DROP || opcode === Op.OP_2DROP && instructions[ip - 1]?.opcode === Op.OP_EQUALVERIFY && instructions[ip - 2]?.opcode === Op.OP_DROP;
}
function fingerprintBytecode(bytes, cache) {
  const cached = cache.get(bytes);
  if (cached !== void 0) return cached;
  const fingerprint = binToHex(hash256Sync(bytes));
  cache.set(bytes, fingerprint);
  return fingerprint;
}
function fingerprintLibauthTransaction(transaction, bytecodeCache) {
  const inputs = transaction.inputs.map((input) => [
    binToHex(input.outpointTransactionHash),
    String(input.outpointIndex),
    String(input.sequenceNumber),
    fingerprintBytecode(input.unlockingBytecode, bytecodeCache)
  ].join(":"));
  const outputs = transaction.outputs.map((output) => [
    output.valueSatoshis.toString(),
    fingerprintBytecode(output.lockingBytecode, bytecodeCache),
    output.token?.category === void 0 ? "" : binToHex(output.token.category),
    output.token?.amount?.toString() ?? "",
    output.token?.nft?.capability ?? "",
    output.token?.nft?.commitment === void 0 ? "" : binToHex(output.token.nft.commitment)
  ].join(":"));
  return `${transaction.version}|${transaction.locktime}|${inputs.join(",")}|${outputs.join(",")}`;
}
const MAX_PROJECTED_PROBE_STATES = 262144;
const MAX_PROJECTED_PROBE_VALUES = 4096;
const MAX_PROJECTED_PROBE_VALUE_BYTES = 64 * 1024 * 1024;
const PROJECTED_PROBE_FULL_STACK_WINDOW = 96;
const MAX_PROJECTED_PROBE_WINDOW_ITEMS = 1048576;
class BoundedProbeTraceCollector {
  constructor() {
    this.awaitingVerification = false;
    this.ordinal = 0;
    this.projected = [];
    this.recent = [];
    this.recentStackItems = 0;
    this.evidence = /* @__PURE__ */ new Map();
    this.evidenceBytes = 0;
    this.longItems = /* @__PURE__ */ new Map();
    this.authItems = /* @__PURE__ */ new Map();
    this.tailRootHexes = /* @__PURE__ */ new Set();
    this.lockDigestHexes = /* @__PURE__ */ new Set();
    this.sameStackAuthenticated = /* @__PURE__ */ new Set();
    this.digestCache = /* @__PURE__ */ new WeakMap();
  }
  reset() {
    this.awaitingVerification = false;
    this.ordinal = 0;
    this.projected = [];
    this.recent = [];
    this.recentStackItems = 0;
    this.evidence = /* @__PURE__ */ new Map();
    this.evidenceBytes = 0;
    this.longItems = /* @__PURE__ */ new Map();
    this.authItems = /* @__PURE__ */ new Map();
    this.tailRootHexes = /* @__PURE__ */ new Set();
    this.lockDigestHexes = /* @__PURE__ */ new Set();
    this.sameStackAuthenticated = /* @__PURE__ */ new Set();
    this.digestCache = /* @__PURE__ */ new WeakMap();
  }
  digestOf(value) {
    const cached = this.digestCache.get(value);
    if (cached !== void 0) return cached;
    const digest = binToHex(sha256Sync(value));
    this.digestCache.set(value, digest);
    return digest;
  }
  retainEvidence(key, value) {
    if (this.evidence.has(key)) return;
    if (this.evidence.size >= MAX_PROJECTED_PROBE_VALUES || this.evidenceBytes + value.byteLength > MAX_PROJECTED_PROBE_VALUE_BYTES) {
      throw new Error("Sparse route probe produced too much distinct extractor evidence to retain safely.");
    }
    this.evidence.set(key, value);
    this.evidenceBytes += value.byteLength;
  }
  scanEvidence(state) {
    const maximumCandidateBytes = VALUE_HEAD_SIZE + VALUE_CHUNK_SIZE * VALUE_CHUNK_MAX_COUNT;
    for (const stack of [state.stack, state.alternateStack ?? []]) {
      const localDigests = new Set(stack.filter((item) => item.length === 32).map(binToHex));
      for (const item of stack) {
        if (item.length > 60 && item.length <= maximumCandidateBytes) {
          const digest = this.digestOf(item);
          const key = `${item.length}:${digest}`;
          this.retainEvidence(key, item);
          this.longItems.set(key, item);
          if (localDigests.has(digest)) this.sameStackAuthenticated.add(key);
        }
        if (item.length === 64) {
          const storedLength = item[0] | item[1] << 8 | item[2] << 16 | item[3] << 24;
          if (storedLength > 60) this.tailRootHexes.add(binToHex(item.subarray(4, 36)));
        }
        if (isP2sh32LockingBytecode(item)) this.lockDigestHexes.add(binToHex(item.subarray(2, 34)));
        if (item.length === 32 || item.length === 64 || isP2sh32LockingBytecode(item)) {
          const key = `${item.length}:${binToHex(item)}`;
          this.retainEvidence(key, item);
          this.authItems.set(key, item);
        }
      }
    }
  }
  projectState(state, terminal = false) {
    const maximumCandidateBytes = VALUE_HEAD_SIZE + VALUE_CHUNK_SIZE * VALUE_CHUNK_MAX_COUNT;
    const bounded = (items) => items.filter(
      (item) => item.length <= maximumCandidateBytes
    );
    const opcode = state.instructions[state.ip]?.opcode;
    let stack;
    if (isValueChunkIdentityCountPin(state.instructions, state.ip)) {
      stack = bounded(state.stack.filter((item, index) => index >= state.stack.length - 2 || item.length > 60 && item.length <= maximumCandidateBytes || isP2sh32LockingBytecode(item)));
    } else if (terminal) {
      stack = bounded(state.stack.filter((item, index) => index >= state.stack.length - 16 || item.length <= 8 || item.length === 32 || item.length === 35 || item.length >= 60 && item.length <= maximumCandidateBytes));
    } else if (opcode === Op.OP_INPUTBYTECODE) {
      stack = bounded(state.stack.slice(-3));
    } else if (opcode === Op.OP_EQUALVERIFY) {
      stack = bounded(state.stack.slice(-2));
    } else {
      stack = bounded(state.stack.slice(-4));
    }
    return {
      ...state,
      stack,
      alternateStack: [],
      // Object frames retain caller stacks. Instruction-array identity on each observation preserves the
      // OP_INVOKE boundary used by the extractors without retaining those caller stack containers.
      controlStack: state.controlStack.filter((frame) => typeof frame === "boolean")
    };
  }
  observe(state) {
    const opcode = state.instructions[state.ip]?.opcode;
    const identityCountPin = isValueChunkIdentityCountPin(state.instructions, state.ip);
    if (opcode === Op.OP_EQUALVERIFY && !this.awaitingVerification && !identityCountPin) return;
    if (this.projected.length >= MAX_PROJECTED_PROBE_STATES) {
      throw new Error("Sparse route probe produced too many semantic observations to retain safely.");
    }
    this.scanEvidence(state);
    const ordinal = this.ordinal++;
    this.projected.push({ ordinal, state: this.projectState(state), stackItems: 0 });
    const full = {
      ...state,
      stack: state.stack.slice(),
      alternateStack: state.alternateStack.slice(),
      controlStack: state.controlStack.filter((frame) => typeof frame === "boolean")
    };
    const stackItems = full.stack.length + full.alternateStack.length;
    this.recent.push({ ordinal, state: full, stackItems });
    this.recentStackItems += stackItems;
    if (this.recent.length > PROJECTED_PROBE_FULL_STACK_WINDOW) {
      this.recentStackItems -= this.recent.shift().stackItems;
    }
    if (this.recentStackItems > MAX_PROJECTED_PROBE_WINDOW_ITEMS) {
      throw new Error("Sparse route probe return window is too large to retain safely.");
    }
    this.awaitingVerification = opcode !== Op.OP_EQUALVERIFY && opcode !== Op.OP_INPUTBYTECODE;
  }
  finish(finalState) {
    this.scanEvidence(finalState);
    const recent = new Map(this.recent.map((entry) => [entry.ordinal, entry.state]));
    const trace = this.projected.map((entry) => recent.get(entry.ordinal) ?? entry.state);
    let widest;
    const candidates = [];
    for (const [key, item] of this.longItems) {
      if (!widest || item.length >= widest.length) widest = item;
      const digest = this.digestOf(item);
      if (this.sameStackAuthenticated.has(key) || this.tailRootHexes.has(digest) || this.lockDigestHexes.has(digest)) candidates.push(item);
    }
    if (widest && !candidates.includes(widest)) candidates.push(widest);
    if (candidates.length > 0 || this.authItems.size > 0) {
      trace.push({
        ...finalState,
        ip: -1,
        instructions: [],
        stack: [...candidates, ...this.authItems.values()],
        alternateStack: [],
        controlStack: []
      });
    }
    trace.push(this.projectState(finalState, true));
    return trace;
  }
  stats() {
    return {
      observations: this.projected.length,
      retainedValues: this.evidence.size,
      retainedValueBytes: this.evidenceBytes,
      recentStackItems: this.recentStackItems
    };
  }
}
const CATEGORY_HEX = /^[0-9a-fA-F]{64}$/;
const softBentoTotalsByToken = /* @__PURE__ */ new Map();
const softBentoUserShares = /* @__PURE__ */ new Map();
const softBentoSharesByUser = /* @__PURE__ */ new Map();
const softErc20Balances = /* @__PURE__ */ new Map();
const softMasterContractApproval = /* @__PURE__ */ new Map();
const softSwapperApproved = /* @__PURE__ */ new Set();
const softOwnerByContract = /* @__PURE__ */ new Map();
let softOracleRate = 10n ** 28n;
const softStateScopes = /* @__PURE__ */ new Map();
const softStateScope = (provider) => {
  let scope = softStateScopes.get(provider);
  if (!scope) {
    scope = { states: /* @__PURE__ */ new Map(), mappings: /* @__PURE__ */ new Map() };
    softStateScopes.set(provider, scope);
  }
  return scope;
};
function legacyStatefulSimulationEnabled(provider) {
  return provider?.statefulSimulation === "legacy-mistswap-v1";
}
function clearSoftBentoTotals() {
  softBentoTotalsByToken.clear();
  softBentoUserShares.clear();
  softBentoSharesByUser.clear();
  softErc20Balances.clear();
  softMasterContractApproval.clear();
  softSwapperApproved.clear();
  softOwnerByContract.clear();
  softStateScopes.clear();
  softOracleRate = 10n ** 28n;
}
function takeSoftStateSnapshot() {
  const bentoTotals = new Map([...softBentoTotalsByToken].map(([key, value]) => [key, { ...value }]));
  const userShares = new Map(softBentoUserShares);
  const sharesByUser = new Map(softBentoSharesByUser);
  const erc20Balances = new Map(softErc20Balances);
  const approvals = new Map(softMasterContractApproval);
  const swappers = new Set(softSwapperApproved);
  const owners = new Map(softOwnerByContract);
  const oracleRate = softOracleRate;
  const scopes = new Map([...softStateScopes].map(([provider, scope]) => [provider, {
    states: new Map([...scope.states].map(([key, value]) => [key, { ...value }])),
    mappings: new Map([...scope.mappings].map(([contract, fields]) => [
      contract,
      new Map([...fields].map(([field, entries]) => [field, new Map(entries)]))
    ]))
  }]));
  return {
    restore: () => {
      clearSoftBentoTotals();
      for (const [key, value] of bentoTotals) softBentoTotalsByToken.set(key, { ...value });
      for (const [key, value] of userShares) softBentoUserShares.set(key, value);
      for (const [key, value] of sharesByUser) softBentoSharesByUser.set(key, value);
      for (const [key, value] of erc20Balances) softErc20Balances.set(key, value);
      for (const [key, value] of approvals) softMasterContractApproval.set(key, value);
      for (const value of swappers) softSwapperApproved.add(value);
      for (const [key, value] of owners) softOwnerByContract.set(key, value);
      softOracleRate = oracleRate;
      for (const [provider, scope] of scopes) {
        softStateScopes.set(provider, {
          states: new Map([...scope.states].map(([key, value]) => [key, { ...value }])),
          mappings: new Map([...scope.mappings].map(([contract, fields]) => [
            contract,
            new Map([...fields].map(([field, entries]) => [field, new Map(entries)]))
          ]))
        });
      }
    }
  };
}
function isMsgSenderKeySource(source) {
  if (!source) return false;
  if (source.kind === "msgSender" || source.senderOp === "msg.sender") return true;
  const label = source.expressionLabel ?? "";
  return label === "nullop:msg.sender" || label === "sender:msg.sender" || label === "call:_msgSender()" || /(?:^|[._])msg\.sender(?:$|[._(])|_msgSender\(/.test(label);
}
const UNIX_LOCKTIME_THRESHOLD = 5e8;
function providerUnixLocktime(provider) {
  const timestamp = provider?.getBlockTime?.();
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return void 0;
  const truncated = Math.trunc(timestamp);
  if (truncated < UNIX_LOCKTIME_THRESHOLD) return void 0;
  return truncated > UNIX_LOCKTIME_THRESHOLD ? truncated - 1 : truncated;
}
function groupIndexForExternalCallSlot(params) {
  const call = params.externalCalls?.[params.slot];
  if (call?.callsiteId !== void 0) {
    const mapped = params.groupByCallsite?.get(call.callsiteId);
    if (mapped !== void 0) return mapped;
    if (call.occurrence && call.occurrence !== "once") return void 0;
  }
  return params.compactGroups[params.slot];
}
function externalReturnParamSlot(paramName, externalCalls) {
  const match = paramName.match(/^__internal__externalReturnOutputIdx(\d*)$/);
  if (!match) return void 0;
  const returnOrdinal = match[1] === "" ? 0 : Number(match[1]);
  if (!externalCalls) return returnOrdinal;
  return externalCalls.map((call, slot) => ({ call, slot })).filter(({ call }) => call.hasReturnValues)[returnOrdinal]?.slot;
}
function isSdkResolvedExternalCallTopologyWitness(paramName) {
  return paramName === "__internal__externalCallInputBase" || paramName === "__internal__dynamicChunkInputBase" || paramName === "__internal__dynamicChunkOutputBase" || /^__internal__extcallMasterIdx\d*$/.test(paramName) || /^__internal__extcallAnchorIdx\d*$/.test(paramName);
}
function vmapBatchWitnessFallback(paramName) {
  if (!paramName.startsWith("__internal__vmapBatch")) return void 0;
  if (/^__internal__vmapBatchRank_\d+$/.test(paramName)) return 0n;
  if (paramName.startsWith("__internal__vmapBatchRows_")) return new Uint8Array();
  if (/^__internal__vmapBatchSlot_\d+$/.test(paramName)) return new Uint8Array(32);
  if (/^__internal__vmapBatchNext_\d+$/.test(paramName)) return new Uint8Array(32);
  if (/^__internal__vmapBatchProof_\d+$/.test(paramName)) return -1n;
  if (/^__internal__vmapBatchPredOut_\d+$/.test(paramName)) return -2n;
  if (paramName === "__internal__vmapBatchTrailingCount") return 0n;
  return void 0;
}
function selectorParamSlot(paramName, externalCalls) {
  const match = paramName.match(/^__internal__externalCallSelector(\d*)$/);
  if (!match) return 0;
  if (match[1] !== "") return Number(match[1]);
  const explicit = (externalCalls ?? []).map((call, index) => ({ call, index })).filter(({ call }) => call.needsSelectorVerification === true && !call.selectorArrayVar);
  if (explicit.length === 1) return explicit[0].index;
  const implicit = (externalCalls ?? []).map((call, index) => ({ call, index })).filter(({ call }) => call.needsSelectorVerification !== false && !call.selectorArrayVar);
  return implicit.length === 1 ? implicit[0].index : 0;
}
function physicalExternalCallGroupIndexByMasterOutpoint(groups, masterUtxo) {
  const existing = groups.findIndex((group) => group.masterUtxo.txid.toLowerCase() === masterUtxo.txid.toLowerCase() && group.masterUtxo.vout === masterUtxo.vout);
  return existing < 0 ? -1 : groups[existing].sharedGroupIndex ?? existing;
}
const COMPILER_ROUTE_SELECTOR_HEX = "53434231";
const isFunctionSelectorHex = (value) => !!value && /^[0-9a-fA-F]{8}$/i.test(value);
function selectProxyForwardInput(logicalSelectorHex, functionArgs = [], preferCompilerRoute = false) {
  const arg = functionArgs[0];
  const argHex = arg instanceof Uint8Array && arg.length === 4 ? binToHex(arg) : void 0;
  if (preferCompilerRoute && argHex?.toLowerCase() === COMPILER_ROUTE_SELECTOR_HEX) return arg;
  if (argHex && argHex.toLowerCase() !== COMPILER_ROUTE_SELECTOR_HEX) return arg;
  if (isFunctionSelectorHex(logicalSelectorHex) && logicalSelectorHex.toLowerCase() !== COMPILER_ROUTE_SELECTOR_HEX) {
    return hexToBin(logicalSelectorHex);
  }
  if (argHex) return arg;
  if (isFunctionSelectorHex(logicalSelectorHex)) return hexToBin(logicalSelectorHex);
  const got = logicalSelectorHex ?? (arg instanceof Uint8Array ? `${arg.length} bytes` : typeof arg);
  throw new Error(`Proxy __forward requires a 4-byte implementation selector; got ${got}`);
}
function nestedProxyImplementationInputIndex(proxyMasterIndex, proxyDataNftCount) {
  if (!Number.isSafeInteger(proxyMasterIndex) || proxyMasterIndex < 0) {
    throw new Error("Proxy master index must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(proxyDataNftCount) || proxyDataNftCount < 0) {
    throw new Error("Proxy data NFT count must be a non-negative safe integer");
  }
  return proxyMasterIndex + 1 + proxyDataNftCount;
}
function physicalExternalCallSelectorHex(groups, delegateGroups, groupIndex) {
  if (groupIndex === void 0) return void 0;
  const logical = groups[groupIndex];
  if (!logical) return void 0;
  const physical = groups[logical.sharedGroupIndex ?? groupIndex] ?? logical;
  const delegate = physical.delegateCallGroupIndex === void 0 ? void 0 : delegateGroups[physical.delegateCallGroupIndex];
  const selected = delegate ?? physical;
  if (selected.compilerRoute?.selector) return binToHex(selected.compilerRoute.selector);
  return selected.externalContract.inner.artifact.abi.find((candidate) => candidate.name === selected.functionName)?.selector;
}
const ROW_ARGS_DECODE_LABEL = /^AbiDecodeAtNode\{data=id:rowArgs,index=(\d+),schema=\[([^\]]*)\]\}$/;
function externalCallReachedOccurrenceIndices(call, functionArgs) {
  if ((call.occurrence ?? "once") !== "loop") return Object.freeze([0]);
  const parameterIndices = /* @__PURE__ */ new Set();
  const visit = (value, seen = /* @__PURE__ */ new Set()) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const source = value;
    if (source.kind === "arrayElement" && Number.isSafeInteger(source.paramIndex) && source.paramIndex >= 0) parameterIndices.add(source.paramIndex);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach((item) => visit(item, seen));
      else visit(child, seen);
    }
  };
  visit(call.argSources);
  if (parameterIndices.size === 0) return void 0;
  const lengths = [...parameterIndices].map((parameterIndex) => {
    const value = functionArgs[parameterIndex];
    return Array.isArray(value) ? value.length : void 0;
  });
  if (lengths.some((length) => length === void 0) || !lengths.every((length) => length === lengths[0])) return void 0;
  const count = lengths[0];
  if (call.minimumOccurrences !== void 0 && count < call.minimumOccurrences || call.maximumOccurrences !== void 0 && count > call.maximumOccurrences) return void 0;
  return Object.freeze(Array.from({ length: count }, (_, occurrenceIndex) => occurrenceIndex));
}
const MAX_EXTERNAL_CALL_ITERATIONS = 1e4;
function externalCallCandidateIterationIndices(call, functionArgs) {
  const reached = externalCallReachedOccurrenceIndices(call, functionArgs);
  if (reached !== void 0) return reached;
  if (call.occurrence !== "loop" || call.occurrenceBoundSource !== "literal") return void 0;
  const count = call.maximumOccurrences;
  if (count === void 0 || !Number.isSafeInteger(count) || count < 0 || count > MAX_EXTERNAL_CALL_ITERATIONS) return void 0;
  if (call.minimumOccurrences !== void 0 && call.minimumOccurrences !== count) return void 0;
  return Object.freeze(Array.from({ length: count }, (_, index) => index));
}
function evaluateExternalCallAffineIterationDomain(domain, evaluate) {
  const compilerCeiling = domain.maximumIterations;
  if (!Number.isSafeInteger(compilerCeiling) || compilerCeiling < 0) {
    throw new Error("External call iteration domain has an invalid ceiling");
  }
  const ceiling = Math.min(compilerCeiling, MAX_EXTERNAL_CALL_ITERATIONS);
  const empty = /* @__PURE__ */ new Map();
  const initial = evaluate(domain.initialValue, empty);
  if (typeof initial !== "bigint") throw new Error("External call iteration domain has unresolved initial value");
  const referencesCounter = (value, seen = /* @__PURE__ */ new Set()) => {
    if (!value || typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const expression = value;
    if (expression.kind === "identifier" && expression.name === domain.counterName) return true;
    return Object.values(value).some((child) => Array.isArray(child) ? child.some((part) => referencesCounter(part, seen)) : referencesCounter(child, seen));
  };
  if (referencesCounter(domain.stepValue)) throw new Error("External call iteration domain step is not invariant");
  const step = evaluate(domain.stepValue, empty);
  if (typeof step !== "bigint") throw new Error("External call iteration domain has unresolved step");
  if (step === 0n) throw new Error("External call iteration domain has non-progressing zero step");
  const indices = [];
  let counter = initial;
  for (let iteration = 0; iteration <= ceiling; iteration += 1) {
    const active = evaluate(domain.continueCondition, /* @__PURE__ */ new Map([[domain.counterName, counter]]));
    if (typeof active !== "boolean") throw new Error("External call iteration domain has unresolved continue condition");
    if (!active) return Object.freeze(indices);
    if (iteration === ceiling) {
      if (compilerCeiling > ceiling) throw new Error("External call iteration domain exceeds the SDK hard cap");
      throw new Error(`External call iteration domain exceeds its ${ceiling}-iteration ceiling`);
    }
    indices.push(iteration);
    counter += step;
  }
  throw new Error("External call iteration domain did not terminate");
}
function producerResultOccurrenceIndex(call) {
  if (call.occurrence === "loop") {
    throw new Error(`Producer callsite ${call.callsiteId ?? "unknown"} has no per-occurrence identity`);
  }
  return 0;
}
function repeatedExternalResultNeedsOccurrenceIdentity(call, consumers, rows) {
  if (call.occurrence !== "loop" || !call.hasReturnValues) return false;
  return rows.some((row) => row.sourceIteration !== row.occurrenceIndex) || (consumers?.some((consumer) => consumer.producerCallsiteId === call.callsiteId) ?? false);
}
function externalCallMetadataIdentityMatches(left, right) {
  return left === right || left.callsiteId !== void 0 && left.callsiteId === right.callsiteId;
}
function applyAbiArgumentFieldUpdates(original, updates, parameter, context) {
  let value = original;
  for (const update of updates ?? []) {
    if (update.parameter !== parameter || update.source !== "blockTimestamp" || context.blockTimestamp === void 0 || update.fieldPath.length === 0) continue;
    const replace = (current, path) => {
      if (current === null || typeof current !== "object" || Array.isArray(current)) return current;
      const [field, ...rest] = path;
      if (!Object.hasOwn(current, field)) return current;
      const member = current[field];
      const next = rest.length === 0 ? context.blockTimestamp : replace(member, rest);
      return next === member ? current : { ...current, [field]: next };
    };
    value = replace(value, update.fieldPath);
  }
  return value;
}
function sameExternalPayloadValue(left, right) {
  if (left instanceof Uint8Array && right instanceof Uint8Array) return binsAreEqual(left, right);
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => sameExternalPayloadValue(item, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => sameExternalPayloadValue(left[key], right[key]));
  }
  return left === right;
}
function assertExternalCallRowPayload(callsiteId, occurrenceIndex, existing, reached) {
  if (!sameExternalPayloadValue(existing.args, reached.args) || existing.targetLockingBytecode.toLowerCase() !== reached.targetLockingBytecode.toLowerCase() || existing.sourceEffectOrdinal !== reached.sourceEffectOrdinal) {
    throw new Error(`External callsite ${callsiteId} occurrence ${occurrenceIndex} reuses a row with different target, arguments, or effect identity`);
  }
}
function assertPreparedExternalCallRowReconciliation(callsiteId, occurrenceIndex, existing, reached, expected, physical) {
  if (existing.parent !== expected.parent || existing.sourceCallsiteId !== callsiteId || existing.occurrenceIndex !== occurrenceIndex || existing.sourceLogicalIndex !== void 0 || existing.producerPathKey !== expected.producerPathKey || existing.contract !== physical.contract || !physical.hasMaster || existing.targetLockingBytecode.toLowerCase() !== physical.lockingBytecode.toLowerCase()) {
    throw new Error(`External callsite ${callsiteId} occurrence ${occurrenceIndex} has a different stable identity or physical owner`);
  }
  assertExternalCallRowPayload(callsiteId, occurrenceIndex, existing, reached);
}
import {
  buildChunkablePushFoldPlan,
  createFoldRowActivationEnvResolver,
  foldActivationEnvironmentFromRouteRow,
  foldCompleteRouteArrayPushes,
  foldLeadingRouteArrayPushes,
  materializeCompletePushValueWitness
} from "./resource-fold-route.js";
function encodeLeadingRouteArrayPushes(params) {
  return foldLeadingRouteArrayPushes(params)?.leading;
}
function encodeCompleteRouteArrayPushes(params) {
  const folded = foldCompleteRouteArrayPushes(params);
  if (!folded) return void 0;
  return params.initialValue === void 0 ? folded.complete : concatenateEncodedArrays(params.initialValue, folded.complete);
}
function parseRowArgsDecodeLabel(label) {
  const decoded = label?.match(ROW_ARGS_DECODE_LABEL);
  if (!decoded) return void 0;
  return {
    argumentIndex: Number(decoded[1]),
    schemaArity: decoded[2] === "" ? 0 : decoded[2].split(",").length
  };
}
function visibleHandlerInputs(inputs) {
  return inputs.filter((input) => !input.name.startsWith("__internal__"));
}
function canonicalAbiFunctionSignature(fn) {
  return `${fn.name}(${visibleHandlerInputs(fn.inputs).map((input) => input.type).join(",")})`;
}
function canonicalPreparedSelector(selector) {
  const normalized = selector.replace(/^0x/i, "").toLowerCase();
  return /^[0-9a-f]{8}$/.test(normalized) ? normalized : void 0;
}
function resolvePreparedProducerEntry(artifacts, name, compilerSelector) {
  if (compilerSelector !== void 0) {
    const normalized = canonicalPreparedSelector(compilerSelector);
    if (normalized === void 0) return void 0;
    for (const artifact of artifacts) {
      const exact = artifact.abi.find((candidate) => candidate.name === name && candidate.selector?.toLowerCase() === normalized);
      if (exact) return exact;
    }
    return void 0;
  }
  for (const artifact of artifacts) {
    const candidates = artifact.abi.filter((candidate) => candidate.name === name);
    if (candidates.length === 0) continue;
    const selectors = new Set(candidates.map((candidate) => candidate.selector?.toLowerCase() ?? ""));
    if (selectors.size === 1) return candidates[0];
  }
  return void 0;
}
function resolveStatefulAbiFunction(artifact, identifier, args, selector) {
  const signatureMatch = artifact.abi.find((candidate) => canonicalAbiFunctionSignature(candidate) === identifier);
  const name = signatureMatch?.name ?? identifier;
  const sameName = artifact.abi.filter((candidate) => candidate.name === name);
  let candidates = signatureMatch ? [signatureMatch] : sameName;
  if (selector !== void 0) {
    const normalized = selector.replace(/^0x/i, "").toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(normalized)) {
      throw new Error(`Function selector '${selector}' must be exactly four hexadecimal bytes.`);
    }
    candidates = candidates.filter((candidate) => candidate.selector?.toLowerCase() === normalized);
  }
  if (candidates.length === 0) {
    throw new Error(`No function '${identifier}' with the requested selector on ${artifact.contractName}.`);
  }
  if (candidates.length === 1) return candidates[0];
  const arityMatches = candidates.filter((candidate) => visibleHandlerInputs(candidate.inputs).length === args.length);
  if (arityMatches.length === 1) return arityMatches[0];
  throw new Error(
    `Ambiguous call to overloaded function '${name}'. Use explicit signature or selector: ` + sameName.map(canonicalAbiFunctionSignature).join(", ")
  );
}
function selectVisibleCallArguments(inputs, logicalArguments, fallbackArguments) {
  return logicalArguments?.length === visibleHandlerInputs(inputs).length ? logicalArguments : fallbackArguments;
}
const canonicalIntegerAbiType = (type) => {
  if (type === "uint") return "uint256";
  if (type === "int") return "int256";
  return /^(?:u?int(?:8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)|bigint)$/.test(type) ? type : void 0;
};
function directMappingReadPlan(artifact, functionName) {
  const functions = artifact.abi.filter((candidate) => candidate.name === functionName);
  if (functions.length !== 1) return void 0;
  const [fn] = functions;
  const proof = fn?.directMappingReturn;
  if (!fn || !proof || fn.writesState !== false || fn.outputs?.length !== 1) return void 0;
  const access = fn.entryAccesses;
  if (access?.length !== 1 || access[0].collection !== proof.collection || access[0].operations.length !== 1 || access[0].operations[0] !== "read") {
    return void 0;
  }
  if (proof.keyParams.length < 1 || proof.keyParams.length > 2 || access[0].keyParams.length !== proof.keyParams.length || access[0].keyParams.some((name, index) => name !== proof.keyParams[index])) return void 0;
  const collection = artifact.stateLayout?.collections?.find((candidate) => candidate.name === proof.collection);
  if (!collection || collection.kind !== "mapping") return void 0;
  const keyTypes = collection.keyTypes ?? [collection.keyType];
  if (keyTypes.length !== proof.keyParams.length) return void 0;
  const outputIntegerType = canonicalIntegerAbiType(fn.outputs[0].type);
  const valueIntegerType = canonicalIntegerAbiType(collection.valueType);
  const exactStructType = fn.outputs[0].type === collection.valueType && artifact.stateLayout?.structs?.some((struct) => struct.name === collection.valueType) === true;
  if (outputIntegerType === void 0 || valueIntegerType === void 0 ? !exactStructType : outputIntegerType !== valueIntegerType) return void 0;
  const visibleInputs = visibleHandlerInputs(fn.inputs);
  const keyArgumentIndices = proof.keyParams.map((name) => visibleInputs.findIndex((input) => input.name === name));
  if (keyArgumentIndices.some((index) => index < 0) || new Set(keyArgumentIndices).size !== keyArgumentIndices.length) {
    return void 0;
  }
  if (keyArgumentIndices.some((argumentIndex, index) => {
    const inputType = canonicalIntegerAbiType(visibleInputs[argumentIndex].type) ?? visibleInputs[argumentIndex].type;
    const keyType = canonicalIntegerAbiType(keyTypes[index]) ?? keyTypes[index];
    return inputType !== keyType;
  })) return void 0;
  return { collection: collection.name, keyArgumentIndices, keyTypes };
}
function entryAccessAt(fn, slotIndex) {
  return fn?.entryAccesses?.find((access, denseIndex) => (access.slotIndex ?? denseIndex) === slotIndex);
}
function canShareIdempotentCounterLoopSettlement(params) {
  if (params.rows.length < 2) return false;
  const identities = params.rows.map((row) => {
    const visible = visibleHandlerInputs(row.handler.inputs);
    if (visible.length !== row.args.length) return void 0;
    const encoded = visible.map((input, index) => encodeFunctionArgument(row.args[index], input.type, params.structs));
    if (encoded.some((value) => !(value instanceof Uint8Array))) return void 0;
    return `${row.handler.selector ?? row.handler.name}:` + encoded.map((value) => binToHex(value)).join(":");
  });
  const identity = identities[0];
  return identity !== void 0 && identities.every((candidate) => candidate === identity) && params.rows.every((row) => {
    const loops = row.handler.sortedUpsertLoopInfo ?? [];
    const requiredNfts = row.handler.requiredNftIndices ?? Array.from({ length: params.dataNftCount }, (_unused, index) => index);
    return loops.length > 0 && loops.every((loop) => (loop.op === "delete" || loop.op === "set" && loop.mutation === void 0 && loop.valueRuntimeExpression !== true && loop.valueRuntimeLocal === void 0 && (loop.valueArrayParam !== void 0 || loop.valueScalarParam !== void 0 || loop.valueConst !== void 0)) && loop.varyingArrayParam.startsWith("__internal__vmapCounterPerm_")) && requiredNfts.length === 0 && (row.handler.entryAccesses?.length ?? 0) === 0 && (row.handler.dynamicWrites?.length ?? 0) === 0 && (row.handler.sortedInsertLoopInfo?.length ?? 0) === 0 && (row.handler.sortedInsertLoops?.length ?? 0) === 0 && (row.handler.entryLoopWrites?.length ?? 0) === 0 && row.handler.usesMsgSender !== true;
  });
}
function matchingRouteRowsForExpressionKey(params) {
  const matching = params.rowArguments.filter((row) => {
    const visible = visibleHandlerInputs(row.handler.inputs);
    return visible.length === params.schemaArity && (row.handler.entryAccesses ?? []).some((candidate) => candidate.collection === params.collection);
  });
  if (matching.length === 0) return void 0;
  if (matching.length === 1) return matching[0];
  if (params.rowIndexHint !== void 0) {
    const hinted = params.rowArguments[params.rowIndexHint];
    if (hinted && matching.includes(hinted)) return hinted;
  }
  if (params.expressionLabel) {
    const byLabel = matching.filter((row) => (row.handler.entryAccesses ?? []).some((candidate) => candidate.collection === params.collection && (candidate.keySources ?? []).some((source) => source.expressionLabel === params.expressionLabel)));
    if (byLabel.length === 1) return byLabel[0];
    if (params.rowIndexHint !== void 0 && byLabel[params.rowIndexHint]) {
      return byLabel[params.rowIndexHint];
    }
  }
  throw new Error(
    `Message-bus expression key for '${params.collection}' matches multiple active rows`
  );
}
function resolveRouteRowExpressionKey(params) {
  const parsed = parseRowArgsDecodeLabel(params.expressionLabel);
  if (parsed && params.rowArguments) {
    const matching = matchingRouteRowsForExpressionKey({
      collection: params.collection,
      schemaArity: parsed.schemaArity,
      expressionLabel: params.expressionLabel,
      rowArguments: params.rowArguments,
      rowIndexHint: params.rowIndexHint
    });
    const visible = matching ? visibleHandlerInputs(matching.handler.inputs) : void 0;
    const value = matching?.args[parsed.argumentIndex];
    const input = visible?.[parsed.argumentIndex];
    if (value !== void 0 && input) {
      const encoded = encodeFunctionArgument(value, input.type, params.structs);
      if (encoded instanceof Uint8Array) return encoded;
    }
    return void 0;
  }
  const loopLocal = params.expressionLabel?.startsWith("map:") && params.rowArguments?.length === 1 ? unresolvableLabelLocals(params.expressionLabel, params.routeVisibleInputs) : [];
  if (loopLocal.length > 0) {
    const occurrence = params.rowArguments[0].occurrenceIndex ?? 0;
    let rewritten = params.expressionLabel;
    for (const name of loopLocal) {
      rewritten = rewritten.replace(
        new RegExp(`id:${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w$])`, "g"),
        `lit:${occurrence}`
      );
    }
    const bound = evalComputedKey(
      rewritten,
      params.routePlanningArgs,
      params.routeVisibleInputs,
      params.state
    );
    if (bound) return bound;
  }
  return evalComputedKey(
    params.expressionLabel,
    params.routePlanningArgs,
    params.routeVisibleInputs,
    params.state
  );
}
function unresolvableLabelLocals(label, visibleInputs) {
  const names = [];
  for (const match of label.matchAll(/id:([A-Za-z_$][\w$]*)/g)) {
    const name = match[1];
    if (visibleInputs.some((input) => input.name === name)) continue;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}
const peekBuilderBuildId = peekBuildId;
class StatefulContract {
  constructor(a, b, runner, options) {
    this._categoryId = "";
    this._resolved = false;
    this._externalRegistry = /* @__PURE__ */ new Map();
    // Deployed delegate-library instances, keyed by library name. A consumer's `L.f()` (artifact
    // libraryDelegateCalls) auto-wires its delegatecall co-spend from here, so the caller need not name the
    // library function again via withDelegatecall. See docs/library-contracts.md (3b auto-wire).
    this._libraryRegistry = /* @__PURE__ */ new Map();
    // Child artifacts a deploy function may instantiate, keyed by contract name. deployFrom resolves the child
    // (and derives its constructor args) from here via the deploy function's deployTarget, so a call need not
    // repeat childArtifact / childConstructorArgs each time.
    this._childRegistry = /* @__PURE__ */ new Map();
    // Default funder / changeAddress for deployFrom calls on this factory, so they need not be repeated.
    this._deployDefaults = {};
    /**
     * Legacy default number of VM probe iterations for auto-derivation.
     * Each iteration captures commitments up to the first mismatch; convergence
     * typically occurs within 3-5 iterations. Default: 20.
     * Increase only if your contract has many interdependent state variables.
     * Kernel artifacts instead use their compiler-published maximumSemanticDerivationPasses ceiling.
     */
    this.maxDerivationIterations = 20;
    /**
     * VM evaluations performed by the most recent auto-derivation (Phase 2 probe loop).
     * Zero when derivation was skipped (read-only getter / nothing to derive).
     */
    this.lastDerivationIterations = 0;
    // Polling event subscriptions (ethers on/once). BCH has no push events, so listeners poll the indexer at
    // `pollingInterval` ms and fire for events not seen before. Keyed by event signature + indexed filter.
    this._eventSubs = /* @__PURE__ */ new Map();
    /** Poll interval (ms) for on()/once() event listeners. */
    this.pollingInterval = 4e3;
    if (typeof a === "string") {
      const provider = runner instanceof Signer ? runner.provider : runner;
      if (runner instanceof Signer) this._signer = runner;
      const bare = new Contract(b, options?.constructorArgs ?? [], {
        provider,
        addressType: options?.addressType ?? "p2sh32",
        ...options?.oraclePool === void 0 ? {} : { oraclePool: options.oraclePool }
      });
      StatefulContract._assertStateful(bare);
      if (CATEGORY_HEX.test(a)) {
        this._inner = bare.withCategory(hexToBin(a));
        this._categoryId = a;
        this._resolved = true;
      } else {
        this._inner = bare;
        this._pendingAddress = a;
      }
    } else {
      StatefulContract._assertStateful(a);
      this._inner = a;
      this._categoryId = b;
      this._resolved = true;
    }
    this._buildNamespaces(this._inner);
    if (isFramedArtifact(this._inner.artifact)) void loadFramedCallHandle();
    return this._withDispatchProxy();
  }
  get inner() {
    return this._inner;
  }
  get categoryId() {
    return this._categoryId;
  }
  /** Stable key shared by connected mock-only soft-state views of this contract. */
  _softContractKey() {
    return this._categoryId || this._logicalAddress || this._pendingAddress || this._inner?.address || "";
  }
  /** Mock-only scalar overlay, shared across connect()/as() clones. */
  get _softStateOverlay() {
    const key = this._softContractKey();
    const scope = softStateScope(this._inner?.provider);
    let state = scope.states.get(key);
    if (!state) {
      state = {};
      scope.states.set(key, state);
    }
    return state;
  }
  /** Mock-only mapping overlay, shared across connect()/as() clones. */
  _softMappingOverlayFor(collection) {
    const key = this._softContractKey();
    const scope = softStateScope(this._inner?.provider);
    let fields = scope.mappings.get(key);
    if (!fields) {
      fields = /* @__PURE__ */ new Map();
      scope.mappings.set(key, fields);
    }
    let entries = fields.get(collection);
    if (!entries) {
      entries = /* @__PURE__ */ new Map();
      fields.set(collection, entries);
    }
    return entries;
  }
  /**
   * X176. Read an ABI entry's `writesState` for what it actually answers.
   *
   * THE FLAG IS MISNAMED FOR THE QUESTION COMPOSERS ASK IT. `writesState: true` means "not provably read-only",
   * which in SDK terms is "needs the state machinery" - it is set by an external call, a child deploy, a
   * library delegate, a low-level call, a split/merge or a covenant-bypass modifier just as readily as by an
   * assignment. `Foo.callBar` publishes `true` with a body of `bar.log();` and not one assignment. Reading the
   * flag as "this handler mutates state" over-counts, and the over-count is not small: of the seven handlers
   * the L2-F2 partition counts as explicit writers, at least two write nothing.
   *
   * ONLY `false` IS A PROOF, AND ONLY IN ONE DIRECTION. That is the reading `_prepareCall`'s derivation skip
   * uses, and the only one this SDK acts on. Everything else is evidence to be read, which is what this
   * returns: each published cause, split by whether it is a change to the handler's OWN persisted state.
   * `unattributed` is the honest residue - the ABI publishes no "assigns a state variable" field at all, so a
   * plain `this.x = y` is indistinguishable from a bus-mode journal reservation from the outside.
   *
   * NOT RENAMED, DELIBERATELY. The flag's conservative direction is correct for its one consumer and the name
   * is published in every artifact on disk; re-deriving it toward "mutates" would make that consumer fail OPEN
   * (a handler whose only cause is an external call would be skipped and its call group never derived). The
   * distinction is published alongside it instead.
   *
   * Pass the artifact when you have it: `stateLayout.dataNftCount === 0` settles the question structurally,
   * because a contract with no data NFT has no state variable for any handler to change.
   */
  static readWritesState(abi, artifact) {
    const evidence = /* @__PURE__ */ new Set();
    if (abi.entryAccesses?.some((ea) => ea.operations.some((op) => op !== "read")) || (abi.sortedBatchInfo?.length ?? 0) > 0) evidence.add("entry-write");
    if ((abi.entryLoopWrites?.length ?? 0) > 0 || (abi.sortedInsertLoops?.length ?? 0) > 0) {
      evidence.add("entry-loop-write");
    }
    if ((abi.dynamicWrites?.length ?? 0) > 0) evidence.add("dynamic-write");
    if (abi.modifiers?.some((m) => LIFECYCLE_MODIFIERS.includes(m))) evidence.add("lifecycle-modifier");
    if (abi.splitCountParam !== void 0 || abi.mergeCountParam !== void 0) evidence.add("split-merge");
    if ((abi.emits?.length ?? 0) > 0) evidence.add("emit");
    if ((abi.transferCount ?? 0) > 0 || (abi.transfers?.length ?? 0) > 0) evidence.add("transfer");
    if ((abi.tokenContainerAccesses?.length ?? 0) > 0) evidence.add("token-container");
    if ((abi.deployTargets?.length ?? 0) > 0) evidence.add("deploy");
    if ((abi.externalCalls?.length ?? 0) > 0) evidence.add("external-call");
    if ((abi.libraryDelegateCalls?.length ?? 0) > 0 || (abi.lowLevelCalls?.length ?? 0) > 0) {
      evidence.add("delegate-or-low-level");
    }
    const all = [...evidence];
    const needsStateMachinery = abi.writesState !== false;
    return {
      published: abi.writesState,
      needsStateMachinery,
      provablyReadOnly: abi.writesState === false,
      ownStateEvidence: all.filter((cause) => OWN_STATE_EVIDENCE.includes(cause)),
      otherEffectEvidence: all.filter((cause) => !OWN_STATE_EVIDENCE.includes(cause)),
      unattributed: needsStateMachinery && all.length === 0,
      contractHasNoState: artifact !== void 0 && (artifact.stateLayout?.dataNftCount ?? 0) === 0
    };
  }
  /** @internal Bind a deployment already resolved by the compatibility layer to an interface callsite. */
  _registerResolvedExternal(name, contract) {
    this._externalRegistry.set(name, contract);
  }
  /**
   * Register the callee instances for an array-element external call `IFoo(arr[i]).m()` (in array order).
   * Stored in the base Contract's unified external-target registry (keyed by each instance's address), shared
   * with opaque loop dispatch (contract.multiCall). The covenant verifies each co-spent callee against arr[i],
   * so the registration order must match the on-chain array.
   */
  // Register the callees for a foreign fn-ptr array `IFoo(fns[i]).m()`, in on-chain array order. For a
  // varying-method dispatch table pass `methods` (one per element) so each callee is co-spent with its own
  // method (the covenant verifies each against the on-chain selector array); omit `methods` for a fixed-method
  // table (it uses the ABI slot's single method).
  registerExternalArray(interfaceName, instances, methods) {
    instances.forEach((inst, i) => {
      this.inner.registerExternalTarget({
        address: inst.inner.lockingBytecode,
        interfaceName,
        instance: inst,
        method: methods?.[i]
      });
    });
  }
  /**
   * Internal-order brand bytes for a branded library's `__brand` constructor argument. The brand-check compares
   * the proxy master's OP_UTXOTOKENCATEGORY (internal byte order) to `__brand`, which is reversed from the
   * display categoryId. Use as: new Contract(brandedLibArt, [StatefulContract.libraryBrand(consumerCategoryId)]).
   */
  static libraryBrand(categoryId) {
    return hexToBin(categoryId).reverse();
  }
  /**
   * Construct a delegate library branded to its owning consumer's category - appends the `__brand` constructor
   * argument (StatefulContract.libraryBrand) so the caller need not thread it manually. `otherArgs` are the
   * library's other constructor arguments (usually none), in declared order before `__brand`. Deploy / set up
   * the returned Contract as usual, then registerLibrary it on the consumer.
   */
  static brandedLibrary(artifact, consumerCategoryId, options, otherArgs = []) {
    if (!artifact.brandedLibrary) {
      throw new Error(
        `Artifact '${artifact.contractName}' is not a branded library; compile it with { brandLibrary: true }.`
      );
    }
    return new Contract(artifact, [...otherArgs, StatefulContract.libraryBrand(consumerCategoryId)], options);
  }
  /** Register a deployed delegate library so `L.f()` calls in this contract auto-wire their delegatecall. */
  registerLibrary(name, instance) {
    if (instance.inner.artifact.brandedLibrary && this.categoryId) {
      const idx = instance.inner.artifact.constructorInputs.findIndex((i) => i.name === "__brand");
      const supplied = idx >= 0 ? instance.inner.constructorArgs[idx] : void 0;
      const expected = StatefulContract.libraryBrand(this.categoryId);
      if (!(supplied instanceof Uint8Array) || binToHex(supplied) !== binToHex(expected)) {
        throw new Error(
          `Branded library '${name}' is not branded to this contract's category. Construct it with StatefulContract.libraryBrand('${this.categoryId}') as its __brand constructor argument.`
        );
      }
    }
    this._libraryRegistry.set(name, instance);
    return this;
  }
  /** Look up a registered delegate library by name (used by the call builder's auto-wire). */
  _getLibrary(name) {
    return this._libraryRegistry.get(name);
  }
  /** Register a child contract artifact so deployFrom can resolve it by the deploy function's deployTarget. */
  registerChild(artifact) {
    this._childRegistry.set(artifact.contractName, artifact);
    return this;
  }
  /**
   * Register a whole `ArtifactMap` (from `compileStringMulti`/`compileFileMulti`) at once, so deployFrom can
   * resolve any child contract from it by the deploy target's name - one call instead of per-child
   * registerChild. The compiler already knows the dependency graph, so the map is the canonical source; see
   * docs/multi-contract-artifacts.md. Stateless entries (interfaces, libraries) are kept too (harmless lookups).
   */
  registerArtifacts(map) {
    for (const artifact of Object.values(map)) {
      this._childRegistry.set(artifact.contractName, artifact);
    }
    return this;
  }
  /** Look up a registered child artifact by contract name. */
  _getChild(contractName) {
    return this._childRegistry.get(contractName);
  }
  /** Set default funder / changeAddress for deployFrom calls on this factory (override per call as needed). */
  setDeployDefaults(defaults) {
    this._deployDefaults = { ...this._deployDefaults, ...defaults };
    return this;
  }
  /** The deploy defaults set via setDeployDefaults (used by deployFrom). */
  get deployDefaults() {
    return this._deployDefaults;
  }
  /**
   * Execute a deploy-modifier function: resolve the child + funding and run deployFrom. Powers the thenable
   * `await factory.deployFn(...args)` (funded by the connected signer) and the explicit
   * `factory.deployFn(...args).deploy({ fundingUtxo, ... })`. With no explicit fundingUtxo it picks a
   * genesis-valid UTXO from the signer and uses the signer's p2pkh unlocker + address for funder + change.
   */
  async _deployFromSigner(functionName, args, override = {}) {
    const base = {
      provider: this.provider,
      factory: this,
      deployFunctionName: functionName,
      deployFunctionArgs: args
    };
    if (override.fundingUtxo || override.fundingUtxos && override.fundingUtxos.length > 0) {
      return StatefulContract.deployFrom({ ...base, ...override });
    }
    if (!this._signer) {
      throw new Error(
        `Deploying '${functionName}' needs a funding UTXO or a signer: connect(signer) then await factory.${functionName}(...), or pass .deploy({ fundingUtxo, funder, changeAddress }).`
      );
    }
    const fundingUtxo = await this._selectGenesisFundingUtxo(functionName);
    return StatefulContract.deployFrom({
      ...base,
      ...override,
      // fundingUtxo is unset in this branch
      fundingUtxo,
      funder: override.funder ?? this._signer.unlockP2PKH(),
      changeAddress: override.changeAddress ?? this._signer.getAddress()
    });
  }
  /** Pick a genesis-valid (vout 0, token-free) funding UTXO from the signer with enough satoshis to deploy. */
  async _selectGenesisFundingUtxo(functionName) {
    const signer = this._signer;
    const utxos = await signer.getUtxos();
    const target = this.inner.artifact.abi.find((f) => f.name === functionName)?.deployTargets?.[0];
    const childArt = target ? this._getChild(target.contractName) : void 0;
    const dataNfts = BigInt(childArt?.stateLayout?.dataNftCount ?? target?.dataNftCount ?? 1);
    const cost = 1200n + 1200n * dataNfts + 5000n + 2400n;
    const { genesisOutpointKey, isReservedGenesisOutpoint } = await import("./genesis-reservations.js");
    const candidates = utxos.filter((u) => u.vout === 0 && !u.token && u.satoshis >= cost && !isReservedGenesisOutpoint(genesisOutpointKey(u.txid, u.vout)));
    for (const utxo of candidates) {
      const refusal = await ownCoinRefusal(
        signer.provider,
        utxo,
        signer.getLockingBytecode(),
        { role: "funder", tokenFree: true }
      );
      if (refusal === void 0) return utxo;
    }
    try {
      const { selectGenesisFundingUtxo } = await import("./ContractFactory.js");
      return await selectGenesisFundingUtxo(signer, childArt ?? this.inner.artifact, /* @__PURE__ */ new Set(), 1);
    } catch (cause) {
      throw new Error(
        `Signer has no genesis-valid funding UTXO (vout 0, token-free, >= ${cost} sats) at ${signer.getAddress()} to deploy '${functionName}', and fanning one out failed. A token genesis requires a fresh vout-0 UTXO.`,
        { cause }
      );
    }
  }
  static _assertStateful(contract) {
    if (!contract.isStateful || !contract.stateLayout) {
      throw new Error(`Contract ${contract.name} is not a stateful contract`);
    }
    if (contract.addressType !== "p2sh32") {
      throw new Error(
        `Stateful contract '${contract.name}' must use p2sh32 address type. Got '${contract.addressType}'.`
      );
    }
  }
  // Resolve the token category from the indexer (getUtxos) the first time an address-constructed instance needs
  // it, then rebuild `inner` with the category baked in. A no-op once resolved / for category-constructed
  // instances. Called at the top of every async operation that needs the category.
  async _ensureResolved() {
    if (this._resolved) return;
    const pendingAddress = this._pendingAddress;
    if (isFramedArtifact(this._inner.artifact)) {
      const { framedCategoryAt } = await import("../framed/deploy/records.js");
      const proven = await framedCategoryAt(this._inner.provider, pendingAddress);
      if (proven !== void 0) {
        this._categoryId = proven;
        this._inner = this._inner.withCategory(hexToBin(proven));
        this._resolved = true;
        return;
      }
    }
    try {
      const identity = await resolveLogicalIdentity(this._inner.provider, pendingAddress);
      this._categoryId = identity.categoryId;
      const connected = this._inner.withCategory(hexToBin(this._categoryId));
      if (binToHex(addressToLockScript(connected.address)) !== binToHex(identity.rootLockingBytecode)) {
        throw new Error(
          `Logical identity ${pendingAddress} binds category ${this._categoryId} to a different root bytecode.`
        );
      }
      this._inner = connected;
      this._logicalAddress = pendingAddress;
      this._resolved = true;
      return;
    } catch (error) {
      const utxos = await this._inner.provider.getUtxos(pendingAddress);
      const hasIdentityRecord = utxos.some((utxo) => utxo.token?.nft?.commitment?.startsWith("53434944"));
      if (hasIdentityRecord) throw error;
    }
    this._categoryId = await resolveCategoryFromAddress(this._inner.provider, pendingAddress);
    this._inner = this._inner.withCategory(hexToBin(this._categoryId));
    this._resolved = true;
  }
  // Match a getEntries() entry against the key args passed to a mapping getter. Single-key entries expose `key`,
  // nested/composite entries expose `keys`. A string arg is UTF-8 encoded (mirrors setEntry) so `sc.m("foo")`
  // matches a bytesN key stored from the same literal; bigint/boolean compare by value, Uint8Array byte-wise.
  static _entryMatchesKeys(entry, keys, keyTypes) {
    if (entry.slot) {
      const expectedSlots = mappingKeySlotCandidates(keys, keyTypes);
      const matches = expectedSlots.some((expectedSlot) => binsAreEqual(entry.slot, expectedSlot));
      if (globalThis.process?.env?.SOLIDC_DEBUG_COLLECTION_FETCH === "1") {
        console.error("collection-entry-key-match", {
          keyTypes,
          expectedSlots: expectedSlots.map(binToHex),
          storedSlot: binToHex(entry.slot),
          matches
        });
      }
      return matches;
    }
    return mappingEntryMatchesLegacyKeys(entry, keys);
  }
  // Build the state / call / functions / tokens namespaces from the (resolved) inner contract's artifact.
  // Bare-name dispatch is handled by the Proxy (see _withDispatchProxy), so nothing is mirrored on `this`.
  _buildNamespaces(contract) {
    const self = this;
    buildNamespacesImpl({
      get state() {
        return self.state;
      },
      set state(v) {
        self.state = v;
      },
      get call() {
        return self.call;
      },
      set call(v) {
        self.call = v;
      },
      get functions() {
        return self.functions;
      },
      set functions(v) {
        self.functions = v;
      },
      get callStatic() {
        return self.callStatic;
      },
      set callStatic(v) {
        self.callStatic = v;
      },
      get tokens() {
        return self.tokens;
      },
      set tokens(v) {
        self.tokens = v;
      },
      getState: () => self.getState(),
      getEntries: (name) => self.getEntries(name),
      createBuilder: async (functionName, args, overrides) => {
        refuseOrdinarySelfdestructCall(self.inner.artifact, overrides?.abiFunction);
        return self._createBuilder(functionName, args, overrides);
      },
      deriveReturnValue: (...a) => self._deriveReturnValue(...a),
      createTokenContainerAccessor: (categoryIdHex) => new TokenContainerAccessor(self, categoryIdHex),
      createDeployFunctionCall: (functionName, args) => new DeployFunctionCall(self, functionName, args),
      createStatefulFunctionCall: (functionName, args, abiFunction) => self.inner.artifact.composition?.convention === "framed" ? (() => {
        const framedHandle = getFramedCallHandleModule();
        if (framedHandle === void 0) {
          throw new Error(
            `Framed call '${functionName}' is unavailable: the framed composition engine is still loading. Obtain the contract through an async entry point (deploy/at/upgrade/deployFrom/split/merge) or await its first async use before calling it.`
          );
        }
        return new framedHandle.FramedFunctionCall(
          {
            artifact: self.inner.artifact,
            abiEntry: abiFunction,
            categoryId: self.categoryId,
            provider: self.inner.provider,
            signer: self._signer,
            ...self._framedProxyImplementationCategory === void 0 ? {} : { proxyImplementationCategoryId: self._framedProxyImplementationCategory }
          },
          functionName,
          args
        );
      })() : new StatefulFunctionCall(
        () => self._createBuilder(functionName, args, { abiFunction }),
        self,
        functionName,
        args,
        void 0,
        abiFunction.selector
      )
    }, contract);
  }
  // Wrap the instance in a Proxy so a bare `sc.name` resolves to the ABI function / state getter when `name` is
  // not a framework member (v6 dispatch: contract routine wins the bare name). Framework members (in the target)
  // win a collision; the shadowed function is reachable via getFunction(). Internal `this.*` access binds to the
  // target, so this never affects the class's own methods.
  _withDispatchProxy() {
    const abiNames = new Set(this.inner.artifact.abi.map((f) => f.name));
    const stateNames = new Set((this.inner.stateLayout?.variables ?? []).map((v) => v.name));
    for (const c of this.inner.stateLayout?.collections ?? []) if (c.kind === "mapping") stateNames.add(c.name);
    const solidityStateGetters = this.inner.artifact.compiler?.options?.evmCompat === true;
    const ethersStyleFunctions = /* @__PURE__ */ new Map();
    const abiFunction = (name) => this.inner.artifact.abi.find(
      (entry) => entry.name === name
    );
    const ethersStyleFunction = (raw, name) => {
      const cached = ethersStyleFunctions.get(name);
      if (cached !== void 0) return cached;
      const publicInputs = abiFunction(name)?.inputs?.filter((input) => !input.name.startsWith("__internal__")).length;
      const splitOverrides = (args) => {
        if (publicInputs === void 0 || args.length !== publicInputs + 1) return { args };
        const last = args[args.length - 1];
        if (!last || typeof last !== "object" || last instanceof Uint8Array || Array.isArray(last)) {
          return { args };
        }
        return { args: args.slice(0, -1), overrides: last };
      };
      const invoke = (args) => {
        const { args: plain, overrides } = splitOverrides(args);
        let call = raw.apply(this.call, plain);
        if (overrides?.value !== void 0 && typeof call?.withValue === "function") {
          call = call.withValue(BigInt(overrides.value));
        }
        return call;
      };
      const wrapper = (...args) => invoke(args);
      wrapper.staticCall = (...args) => {
        const call = invoke(args);
        return typeof call.staticValue === "function" ? call.staticValue() : call.staticCall();
      };
      wrapper.callStatic = wrapper.staticCall;
      wrapper.send = (...args) => invoke(args).send();
      ethersStyleFunctions.set(name, wrapper);
      return wrapper;
    };
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && !(prop in target)) {
          if (solidityStateGetters && stateNames.has(prop)) return target.state[prop];
          if (abiNames.has(prop)) {
            const raw = target.call[prop];
            return typeof raw === "function" ? ethersStyleFunction(raw, prop) : raw;
          }
          if (stateNames.has(prop)) return target.state[prop];
        }
        return Reflect.get(target, prop, receiver);
      },
      has(target, prop) {
        if (typeof prop === "string" && (abiNames.has(prop) || stateNames.has(prop))) return true;
        return Reflect.has(target, prop);
      }
    });
  }
  /**
   * Resolve an ABI function by name, bypassing any framework-member collision (ethers-v6 escape hatch). Use this
   * when a contract function shares a name with a StatefulContract member (e.g. `connect`): `sc.connect` is the
   * framework method, `sc.getFunction('connect')(...)` is the contract routine.
   */
  getFunction(name) {
    const fn = this.call[name];
    if (!fn) {
      const available = this.inner.artifact.abi.map((f) => f.name).join(", ");
      throw new Error(`No function '${name}' on ${this.inner.name}. Available: ${available}.`);
    }
    return fn;
  }
  /**
   * Execute several eligible public handlers against one physical owner input.
   * The compiler-owned message-bus batch route is selected only when advertised by the
   * artifact; one ordinary invocation should continue to use its direct ABI
   * wrapper.
   */
  batch(invocations) {
    const computedRouteWitnesses = {};
    const computedRouteWitnessHex = /* @__PURE__ */ new Map();
    const resolvedInvocations = invocations.map((invocation) => {
      const args = invocation.args ?? [];
      const abi = resolveStatefulAbiFunction(
        this.inner.artifact,
        invocation.function,
        args,
        invocation.selector
      );
      return { function: abi.name, selector: abi.selector, args, abi };
    });
    resolvedInvocations.forEach((invocation, rowIndex) => {
      const handler = this.inner.artifact.messageBus?.handlers.find((candidate) => candidate.name === invocation.function && candidate.selector.toLowerCase() === invocation.selector?.toLowerCase());
      const abi = invocation.abi;
      if (!handler || !abi) return;
      for (const binding of handler.batchKeyWitnesses ?? []) {
        if (binding.source !== "expression" || !binding.expressionLabel) continue;
        const encoded = evalComputedKey(binding.expressionLabel, [...invocation.args ?? []], abi.inputs);
        if (!encoded) continue;
        const name = binding.perRow ? `${binding.routeInput}_r${rowIndex}` : binding.routeInput;
        const encodedHex = binToHex(encoded);
        const priorHex = computedRouteWitnessHex.get(name);
        if (priorHex !== void 0 && priorHex !== encodedHex) {
          throw new Error(`messageBus: computed route witness '${name}' disagrees across batch rows`);
        }
        computedRouteWitnessHex.set(name, encodedHex);
        const routeType = this.inner.artifact.messageBus?.route.inputs.find((input) => input.name === name)?.type;
        const value = routeType === "bool" ? vmNumberToBigInt(encoded) !== 0n : routeType === "bigint" || routeType === "int" || routeType === "uint" || /^u?int\d+$/.test(routeType ?? "") ? vmNumberToBigInt(encoded) : encoded;
        computedRouteWitnesses[name] = value;
      }
    });
    const { blob, routeWitnesses } = encodeMessageBatch(
      this.inner.artifact,
      resolvedInvocations,
      computedRouteWitnesses
    );
    const rowArguments = resolvedInvocations.map((invocation) => {
      if (!invocation.abi) throw new Error(`Message-bus handler ABI '${invocation.function}' is missing`);
      return { args: invocation.args, handler: invocation.abi };
    });
    return this._batchRaw(blob, routeWitnesses, {}, 0, false, void 0, false, void 0, rowArguments);
  }
  /** @internal Adversarial-test hook: execute an exact candidate blob through
   * the positional message-bus batch route without canonical SDK construction. */
  _batchRaw(blob, routeWitnesses = [], internalRouteWitnesses = {}, blockBase = 0, emitReturn = false, returnBlob, omitLocalFeeTail = false, delegateExecution, rowArguments, logicalIdentity, valueChunkProductions, callerLockingBytecode, executionContextBinding) {
    const self = this;
    return batchRawImpl(
      {
        inner: self.inner,
        evaluateExternalExpression: (...a) => self._evaluateExternalExpression(...a),
        vmapCounterDomain: (...a) => self._vmapCounterDomain(...a),
        createForwardDelegateCall: (input) => {
          const { routeSelector, builderOverrides, callOverrides, executor, route } = input;
          return new StatefulFunctionCall(
            self._createBuilder("__forward", [routeSelector], builderOverrides),
            self,
            "__forward",
            [routeSelector],
            callOverrides
          )._withCompilerRouteDelegatecall(executor, route);
        },
        createMessageBusCall: (input) => {
          const { routeArgs, builderOverrides, callOverrides } = input;
          return new StatefulFunctionCall(
            self._createBuilder("__message_bus1", routeArgs, builderOverrides),
            self,
            "__message_bus1",
            routeArgs,
            callOverrides
          );
        }
      },
      blob,
      routeWitnesses,
      internalRouteWitnesses,
      blockBase,
      emitReturn,
      returnBlob,
      omitLocalFeeTail,
      delegateExecution,
      rowArguments,
      logicalIdentity,
      valueChunkProductions,
      callerLockingBytecode,
      executionContextBinding
    );
  }
  static _uintLe(value, width) {
    if (value < 0n || value >= 1n << BigInt(width * 8)) throw new Error(`Unsigned ${width}-byte overflow`);
    const result = new Uint8Array(width);
    let rest = value;
    for (let i = 0; i < width; i++) {
      result[i] = Number(rest & 0xffn);
      rest >>= 8n;
    }
    return result;
  }
  static _concatBytes(...parts) {
    const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }
  static _signedLogicalValue(value) {
    const magnitude = value < 0n ? -value : value;
    if (magnitude > 0x7fffffffffffffffn) {
      throw new Error("message-bus batch logical msg.value exceeds the signed 64-bit satoshi envelope");
    }
    return StatefulContract._concatBytes(
      Uint8Array.of(value < 0n ? 1 : 0),
      StatefulContract._uintLe(magnitude, 8)
    );
  }
  /**
   * Lean attach (ethers-v6 `new Contract(address, abi, runner)`). Resolve a deployed stateful contract from its
   * ADDRESS or category id + artifact + runner: a NetworkProvider is read-only (state / view reads), a Signer is
   * read-write. Given an address, the token category is read from the indexer (getUtxos); given a 64-char
   * category id it is used directly. `constructorArgs` are required to SPEND (a p2sh address hashes the redeem
   * script) - omit them for a no-arg contract or read-only use.
   */
  static async at(addressOrCategory, artifact, runner, options) {
    if (isFramedArtifact(artifact)) await loadFramedCallHandle();
    const sc = new StatefulContract(addressOrCategory, artifact, runner, options);
    await sc._ensureResolved();
    return sc;
  }
  static withCategory(contract, categoryId, options) {
    const finalContract = contract.withCategory(hexToBin(categoryId));
    const sc = new StatefulContract(finalContract, categoryId);
    if (options?.externals) {
      for (const [name, ext] of Object.entries(options.externals)) {
        if (sc._externalRegistry.has(name)) {
          console.warn(
            `Warning: external contract '${name}' is being overwritten in connect(). Check for duplicate entries in externals/externalContracts.`
          );
        }
        sc._externalRegistry.set(name, ext);
      }
    }
    if (options?.externalContracts) {
      StatefulContract._buildExternalGraph(sc, options.externalContracts);
    }
    return sc;
  }
  static from(artifact, constructorArgs, options, categoryId) {
    const { externals, externalContracts, ...contractOptions } = options;
    const finalOptions = { ...contractOptions, category: hexToBin(categoryId) };
    const contract = new Contract(artifact, constructorArgs, finalOptions);
    const sc = new StatefulContract(contract, categoryId);
    if (externals) {
      for (const [name, ext] of Object.entries(externals)) {
        sc._externalRegistry.set(name, ext);
      }
    }
    if (externalContracts) {
      StatefulContract._buildExternalGraph(sc, externalContracts);
    }
    return sc;
  }
  /**
   * Return a new instance bound to a different runner (ethers.js `contract.connect(runner)`). A Signer binds
   * automatic funding + signing; a NetworkProvider rebinds read-only (delegates to withProvider).
   *
   * ```typescript
   * await sc.connect(signer).increment().send();
   * ```
   */
  connect(runner) {
    if (!(runner instanceof Signer)) return this.withProvider(runner);
    const signer = runner;
    const sc = StatefulContract.from(
      this.inner.artifact,
      this.inner.constructorArgs,
      { provider: signer.provider, addressType: this.inner.addressType, salt: this.inner.salt },
      this.categoryId
    );
    for (const [name, ext] of this._externalRegistry) {
      sc._externalRegistry.set(name, ext);
    }
    for (const [name, lib] of this._libraryRegistry) {
      sc._libraryRegistry.set(name, lib);
    }
    for (const [name, art] of this._childRegistry) {
      sc._childRegistry.set(name, art);
    }
    sc._deployDefaults = { ...this._deployDefaults };
    sc._signer = signer;
    sc._logicalNonceSigner = signer;
    sc._framedStateOwner = this._framedStateOwner;
    sc._framedProxyImplementationCategory = this._framedProxyImplementationCategory;
    sc._framedProxyAddress = this._framedProxyAddress;
    sc._framedAddress = this._framedAddress;
    sc._logicalAddress = this._logicalAddress;
    return sc;
  }
  /** Return a new instance with the same target but a different provider. */
  withProvider(runner) {
    const sc = StatefulContract.from(
      this.inner.artifact,
      this.inner.constructorArgs,
      { provider: runner, addressType: this.inner.addressType, salt: this.inner.salt },
      this.categoryId
    );
    for (const [name, ext] of this._externalRegistry) {
      sc._externalRegistry.set(name, ext);
    }
    for (const [name, lib] of this._libraryRegistry) {
      sc._libraryRegistry.set(name, lib);
    }
    sc._framedStateOwner = this._framedStateOwner;
    sc._framedProxyImplementationCategory = this._framedProxyImplementationCategory;
    sc._framedProxyAddress = this._framedProxyAddress;
    sc._framedAddress = this._framedAddress;
    if (this._signer) sc._signer = this._signer;
    if (this._logicalNonceSigner) sc._logicalNonceSigner = this._logicalNonceSigner;
    sc._logicalAddress = this._logicalAddress;
    return sc;
  }
  /**
   * Return a new instance with the same ABI and runner but a different target (categoryId).
   * Analogous to ethers.js `contract.attach(target)`.
   */
  attach(target) {
    const sc = StatefulContract.from(
      this.inner.artifact,
      this.inner.constructorArgs,
      { provider: this.inner.provider, addressType: this.inner.addressType },
      target
    );
    for (const [name, ext] of this._externalRegistry) {
      sc._externalRegistry.set(name, ext);
    }
    for (const [name, lib] of this._libraryRegistry) {
      sc._libraryRegistry.set(name, lib);
    }
    return sc;
  }
  static async deploy(artifact, constructorArgs, options) {
    if (isFramedArtifact(artifact)) await loadFramedCallHandle();
    return deployStatefulContractImpl(artifact, constructorArgs, options);
  }
  /**
   * Upgrade a stateful contract in place by moving its master (minting) NFT to the replacement's lock.
   *
   * The category and the master's commitment carry over. Every record and container is bound to the master's exact
   * lock, so the upgrade carries them to the replacement's lock: entries one transaction each through the
   * migrateRecords entry, data NFTs and containers in the upgrade itself. It refuses before broadcasting when a record
   * would stay behind, including dynamic and long mapping-value chunks, which no migration carries. Surplus container
   * coins, which anyone can send, are abandoned only when `leaveBehind` names them.
   *
   * Requirements:
   * - The upgrade function must have the 'upgrade' modifier in the old contract's ABI
   * - The new artifact must be a stateful contract
   *
   * @returns The new ConnectedStatefulContract with the same categoryId
   */
  static async upgrade(options) {
    if (isFramedArtifact(options.newArtifact)) await loadFramedCallHandle();
    return upgradeStatefulContractImpl(options);
  }
  /**
   * Deploy a new stateful contract from a factory contract.
   *
   * The factory contract must have a function with the 'deploy' modifier. This method
   * creates a single transaction that:
   * 1. Calls the factory's deploy function (spending the factory's master UTXO)
   * 2. Includes a funding UTXO for token genesis
   * 3. Creates outputs for both the factory (self-preservation) and the new child contract
   *
   * The child contract's categoryId is derived from the funding UTXO's txid.
   *
   * @returns The factory with updated state and the new child contract
   */
  static async deployFrom(options) {
    if (options.childArtifact !== void 0 && isFramedArtifact(options.childArtifact)) {
      await loadFramedCallHandle();
    }
    return deployFromStatefulContractImpl(options);
  }
  /**
   * Destroy a stateful contract by spending all its UTXOs without recreating them.
   *
   * This permanently destroys the contract by:
   * 1. Spending all master minting NFTs (including threaded masters)
   * 2. Spending all data NFTs (using flag=2 destroy path in the covenant)
   * 3. Spending all entry NFTs (using flag=1 write path, which already allows destruction)
   * 4. Spending all expired event NFTs (using CSV timelock - best-effort)
   * 5. Spending the satoshi container and each named token container; other coins there are junk, left and reported
   * 6. Sending all reclaimed satoshis to the recipient address
   *
   * If the total number of inputs exceeds transaction size limits, batching is used:
   * - Intermediate transactions preserve one master UTXO while destroying batches of NFTs
   * - The final transaction destroys all remaining masters and NFTs, and spends every container
   *
   * @returns Array of transaction details, total reclaimed satoshis, and the junk coins left behind
   */
  static async destroy(options) {
    return destroyStatefulContractImpl(options);
  }
  /**
   * Trigger a `selfdestruct(addr)` function: collapse all of the contract's state UTXOs (no master
   * recreation - end of life) and free the native balance to `recipient` at output 0.
   *
   * The compiler's selfdestruct covenant pins `tx.outputs[0].lockingBytecode == addr` (the destination
   * the contract author wired into `selfdestruct(addr)`). This routes the freed value there at output 0;
   * `recipient` must resolve to that same address. Tokens are not swept (EVM parity - the program owns
   * them). Mechanically identical to destroy(); this name mirrors the language feature.
   */
  static selfdestructTo(options) {
    return StatefulContract.destroy(options);
  }
  /*
   * `_sendBuilderWithCustomUnlockers` WAS HERE AND IS DELETED. X163.
   *
   * It was the eighth broadcast site in `src/` and the only one with no caller anywhere - not in `src/`, not in
   * `test/`, not in `examples/`, not by string. A guard on it could never fire on its own subject, so gating it
   * was never the question; whether an unreachable `sendRawTransaction` should exist at all was.
   *
   * ITS REASON TO EXIST WAS REMOVED, which is why it went dead. The docstring said `send()` "fails to produce a
   * meaningful error for custom unlockers because getBitauthUri() throws". `TransactionBuilder.send` now wraps
   * that call in `try { ... } catch { bitauthUri = ''; }` on both of its failure paths, so the throw it was
   * routing around cannot happen. Nothing was left for it to do.
   *
   * DELETED RATHER THAN LEFT DORMANT because a broadcast path that reaches the network with no byte gate ahead
   * of it is exactly the shape a later edit picks up without noticing what is missing - the gated sites are
   * gated, and a caller reaching for "the helper that sends a builder directly" would have found the one that
   * is not. `_sendRawBuilder` does the same job with the gate, and is live.
   */
  /**
   * Use VM inference to derive initial commitments from the constructor function.
   * Builds a synthetic probe transaction with zero-initialized state, runs the
   * constructor, and extracts the expected commitments from the VM trace.
   */
  static async _deriveDeployCommitments(contract, artifact, stateLayout, categoryId, dataNftAddress, masterAmount, dataNftAmount, options) {
    return deriveDeployCommitmentsImpl(
      contract,
      artifact,
      stateLayout,
      categoryId,
      dataNftAddress,
      masterAmount,
      dataNftAmount,
      options
    );
  }
  /**
   * Discover a stateful contract by finding a minting NFT at a given address.
   *
   * Fetches UTXOs at the specified address (or the contract's token address by
   * default) and picks the first minting NFT to determine the category ID.
   *
   * @param contract - A Contract instance for the stateful contract.
   * @param masterAddress - Optional address to search. Defaults to `contract.tokenAddress`.
   */
  static async discover(contract, masterAddress) {
    if (!contract.isStateful) {
      throw new Error(`Contract ${contract.name} is not a stateful contract`);
    }
    const address = masterAddress ?? contract.tokenAddress;
    const utxos = await contract.provider.getUtxos(address);
    const masterUtxo = utxos.find((utxo) => utxo.token?.nft?.capability === "minting");
    if (!masterUtxo) {
      throw new Error(
        `No minting NFT found at address ${address}. Ensure the stateful contract has been deployed and the master UTXO is at this address.`
      );
    }
    const connected = StatefulContract.withCategory(contract, masterUtxo.token.category);
    if (connected.tokenAddress !== address) {
      throw new Error(
        `Minting NFT with category ${masterUtxo.token.category} at address ${address} does not belong to this contract (expected token address: ${connected.tokenAddress}). The NFT may belong to a different contract deployed at the same address.`
      );
    }
    return connected;
  }
  get address() {
    return this._framedAddress ?? this._framedProxyAddress ?? this._pendingAddress ?? this.inner.address;
  }
  get tokenAddress() {
    return this.inner.tokenAddress;
  }
  get name() {
    return this.inner.name;
  }
  get provider() {
    return this.inner.provider;
  }
  /** The runner bound to this contract: a Signer when connected read-write, else the read-only NetworkProvider
   * (ethers.js `contract.runner`). */
  get runner() {
    return this._signer ?? this.provider;
  }
  /** The contract's ABI + layout artifact (ethers.js `contract.interface`). */
  get interface() {
    return this.inner.artifact;
  }
  /** The contract's on-chain identifier - its p2sh address (ethers.js `contract.target`).
   * A framed deployment is identified by the lock its frames present (`address`), not by the logical CREATE address:
   * that anchor belongs to the direct convention, where no framed address exists. A deployed logical CREATE address
   * is the identifier only when there is no framed address. */
  get target() {
    return this._framedAddress ?? this._logicalAddress ?? this.address;
  }
  /** The contract's p2sh address (async, ethers.js `contract.getAddress()`). */
  async getAddress() {
    return this.target;
  }
  async getState() {
    await this._ensureResolved();
    const onChainState = await getContractState(this.inner, this.categoryId, void 0, this._framedStateOwner);
    const state = onChainState.state;
    if (legacyStatefulSimulationEnabled(this.provider)) {
      for (const [name, value] of Object.entries(this._softStateOverlay)) {
        if (name in state) state[name] = value;
      }
    }
    for (const k of Object.keys(state)) attachDecodedAccessors(state[k]);
    return state;
  }
  /** Normalize mapping keys for soft-overlay lookup (cashaddr / hex / Uint8Array). */
  static _softOverlayKey(keys) {
    return keys.map((k) => {
      if (k instanceof Uint8Array) return binToHex(k);
      if (typeof k === "string") {
        if (k.includes(":")) {
          try {
            return binToHex(addressToLockScript(k));
          } catch {
            return k;
          }
        }
        return k.toLowerCase().replace(/^0x/, "");
      }
      if (typeof k === "bigint" || typeof k === "number" || typeof k === "boolean") return String(k);
      if (k && typeof k === "object" && typeof k._value === "bigint") {
        return String(k._value);
      }
      return String(k);
    }).join("|");
  }
  /** @internal mock soft-apply only */
  _getSoftMapping(collection, keys) {
    return this._softMappingOverlayFor(collection).get(StatefulContract._softOverlayKey(keys));
  }
  /** @internal Mock soft-apply: set a mapping entry visible to state getters. */
  _setSoftMapping(collection, keys, value) {
    this._softMappingOverlayFor(collection).set(StatefulContract._softOverlayKey(keys), value);
  }
  /** @internal Mock soft-apply: set a scalar/struct state field visible to getState. */
  _setSoftState(name, value) {
    this._softStateOverlay[name] = value;
  }
  /** @internal mock soft-apply only */
  static _toSoftBigint(v) {
    if (typeof v === "bigint") return v;
    if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
    if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
    if (v && typeof v === "object") {
      const o = v;
      if (typeof o._value === "bigint") return o._value;
      if (typeof o.toBigInt === "function") return o.toBigInt();
    }
    return 0n;
  }
  /** @internal mock soft-apply only */
  static _readRebase(v) {
    if (v && typeof v === "object") {
      const o = v;
      return {
        elastic: StatefulContract._toSoftBigint(o.elastic ?? o[0]),
        base: StatefulContract._toSoftBigint(o.base ?? o[1])
      };
    }
    return { elastic: 0n, base: 0n };
  }
  /** @internal mock soft-apply only */
  static _readAccrueInfo(v) {
    if (v && typeof v === "object") {
      const o = v;
      return {
        interestPerSecond: StatefulContract._toSoftBigint(o.interestPerSecond ?? o[0] ?? 317097920n),
        lastAccrued: StatefulContract._toSoftBigint(o.lastAccrued ?? o[1] ?? 0n),
        feesEarnedFraction: StatefulContract._toSoftBigint(o.feesEarnedFraction ?? o[2] ?? 0n)
      };
    }
    return { interestPerSecond: 317097920n, lastAccrued: 0n, feesEarnedFraction: 0n };
  }
  /**
   * Mock soft-apply interest step for KashiPair.accrue (faithful enough for PairKashi rate asserts).
   * Constants match KashiPairMediumRiskV1.sol.
   */
  async _softAccrueInterest(times = 1) {
    return softAccrueInterestImpl({
      getState: () => this.getState(),
      softStateOverlay: this._softStateOverlay,
      provider: this.inner.provider,
      readAccrueInfo: (v) => StatefulContract._readAccrueInfo(v),
      readRebase: (v) => StatefulContract._readRebase(v),
      setSoftState: (...a) => this._setSoftState(...a)
    }, times);
  }
  /** Mock soft-apply: adjust Kashi totals / mapping entries for borrow/repay/asset/collateral. */
  _softAdjustKashiBorrow(user, amount, mode) {
    softAdjustKashiBorrowImpl({
      softStateOverlay: this._softStateOverlay,
      getSoftMapping: (...a) => this._getSoftMapping(...a),
      setSoftMapping: (...a) => this._setSoftMapping(...a),
      setSoftState: (...a) => this._setSoftState(...a),
      toSoftBigint: (v) => StatefulContract._toSoftBigint(v),
      readRebase: (v) => StatefulContract._readRebase(v),
      getState: () => this.getState(),
      provider: this.inner.provider
    }, user, amount, mode);
  }
  _softAdjustKashiAsset(amount, user) {
    softAdjustKashiAssetImpl({
      softStateOverlay: this._softStateOverlay,
      getSoftMapping: (...a) => this._getSoftMapping(...a),
      setSoftMapping: (...a) => this._setSoftMapping(...a),
      setSoftState: (...a) => this._setSoftState(...a),
      toSoftBigint: (v) => StatefulContract._toSoftBigint(v),
      readRebase: (v) => StatefulContract._readRebase(v),
      getState: () => this.getState(),
      provider: this.inner.provider
    }, amount, user);
  }
  _softAdjustKashiCollateral(user, amount, mode) {
    softAdjustKashiCollateralImpl({
      softStateOverlay: this._softStateOverlay,
      getSoftMapping: (...a) => this._getSoftMapping(...a),
      setSoftMapping: (...a) => this._setSoftMapping(...a),
      setSoftState: (...a) => this._setSoftState(...a),
      toSoftBigint: (v) => StatefulContract._toSoftBigint(v),
      readRebase: (v) => StatefulContract._readRebase(v),
      getState: () => this.getState(),
      provider: this.inner.provider
    }, user, amount, mode);
  }
  /** Credit BentoBox soft balance for removeCollateral → user (async: may load on-chain collateral addr). */
  async _softCreditBentoCollateral(user, share) {
    return softCreditBentoCollateralImpl({
      softStateOverlay: this._softStateOverlay,
      getSoftMapping: (...a) => this._getSoftMapping(...a),
      setSoftMapping: (...a) => this._setSoftMapping(...a),
      setSoftState: (...a) => this._setSoftState(...a),
      toSoftBigint: (v) => StatefulContract._toSoftBigint(v),
      readRebase: (v) => StatefulContract._readRebase(v),
      getState: () => this.getState(),
      provider: this.inner.provider
    }, user, share);
  }
  async getFullState() {
    await this._ensureResolved();
    return getContractState(this.inner, this.categoryId, void 0, this._framedStateOwner);
  }
  /** @internal Resolve one compiler-published fixed-effect activation predicate against authenticated state. */
  async _resolveCompilerEffectPredicate(expression, args, handler, executionArtifact = this.inner.artifact, authenticatedState, entryResolver, logicalCaller) {
    const state = authenticatedState ?? await this.getState();
    const { evaluateFixedEffectPredicate } = await import("../message-bus/message-bus.js");
    const { evaluateChildDeploymentRecipe } = await import("../message-bus/compose-recipes.js");
    const { loadFixedEffectEntries } = await import("../message-bus/fixed-effect-entries.js");
    const result = expression.kind === "fixedEffectRecipe" && expression.fixedEffectRecipe ? evaluateChildDeploymentRecipe(
      expression.fixedEffectRecipe,
      args,
      handler.inputs.map((input) => input.type),
      artifactUsesSolidityAbi(executionArtifact),
      state,
      logicalCaller,
      entryResolver ?? await loadFixedEffectEntries([expression.fixedEffectRecipe], executionArtifact, this)
    ) : evaluateFixedEffectPredicate(expression, args, state);
    if (typeof result !== "boolean") {
      throw new Error(`Could not resolve fixed BCH-transfer predicate in '${handler.name}'.`);
    }
    return result;
  }
  /**
   * Get the address for a token container holding foreign tokens.
   *
   * @param tokenContainerCategoryIdHex - Hex-encoded 32-byte token container category ID.
   */
  /** Get the data NFT address for this contract's category. */
  getDataNftAddress() {
    return getDataNftAddress(this.inner, this.categoryId);
  }
  /** Get the entry NFT address for a given collection. */
  getEntryNftAddress(collectionSignature) {
    return getEntryNftAddress(this.inner, this.categoryId, collectionSignature);
  }
  /** Get the event NFT address for a given event signature. */
  getEventNftAddress(eventSignature) {
    return getEventNftAddress(this.inner, this.categoryId, eventSignature);
  }
  /** Get the satoshi container address. */
  getSatoshiContainerAddress() {
    return getSatoshiContainerAddress(this.inner, this.categoryId);
  }
  getTokenContainerAddress(tokenContainerCategoryIdHex) {
    return getTokenContainerAddress(this.inner, this.categoryId, tokenContainerCategoryIdHex);
  }
  /**
   * Get the satoshi container address and a helper to read its balance.
   */
  get satoshiContainer() {
    const address = getSatoshiContainerAddress(this.inner, this.categoryId);
    return {
      address,
      getBalance: async () => {
        const utxos = await this.inner.provider.getUtxos(address);
        return utxos.reduce((sum, u) => sum + u.satoshis, 0n);
      }
    };
  }
  async getBalance() {
    await this._ensureResolved();
    return this.satoshiContainer.getBalance();
  }
  /**
   * Query events by name or signature, optionally filtering by indexed parameter values.
   *
   * For named events: reads from the event-specific P2SH32 address.
   * For anonymous events: reads from the shared anonymous event address, then
   * disambiguates by trying to decode against all anonymous event definitions.
   *
   * @param eventNameOrSignature - Event name (e.g. "Transfer") or full signature (e.g. "Transfer(pubkey,int)")
   * @param filters - Optional filter on indexed parameter values
   */
  async queryEvents(eventNameOrSignature, filters) {
    return queryEventsImpl(
      {
        ensureResolved: () => this._ensureResolved(),
        inner: this.inner,
        categoryId: this.categoryId
      },
      eventNameOrSignature,
      filters
    );
  }
  // ---- ethers-v6 events facade (queryFilter / filters / getEvent / on ...), backed by queryEvents ----
  _resolveEventDef(nameOrSignature) {
    const eventDefs = this.inner.artifact.events ?? [];
    const eventDef = nameOrSignature.includes("(") ? eventDefs.find((e) => e.signature === nameOrSignature) : eventDefs.find((e) => e.name === nameOrSignature);
    if (!eventDef) throw new Error(`Unknown event: ${nameOrSignature}`);
    return eventDef;
  }
  /**
   * Resolve an event to a callable filter handle (ethers `contract.getEvent(name)`). Call the handle with indexed
   * argument values (null/undefined = wildcard) to build a filter for queryFilter / on: `sc.getEvent('Transfer')(from)`.
   */
  getEvent(nameOrSignature) {
    const eventDef = this._resolveEventDef(nameOrSignature);
    const indexed = eventDef.parameters.filter((p) => p.indexed);
    const handle = (...indexedArgs) => {
      if (indexedArgs.length > indexed.length) {
        throw new Error(
          `Event '${eventDef.name}' has ${indexed.length} indexed parameter(s), got ${indexedArgs.length}.`
        );
      }
      const filter = {};
      indexedArgs.forEach((val, i) => {
        if (val !== null && val !== void 0) filter[indexed[i].name] = val;
      });
      return { eventDef, filter };
    };
    handle.eventName = eventDef.name;
    handle.signature = eventDef.signature;
    handle.eventDef = eventDef;
    return handle;
  }
  /**
   * Lazy event-filter builders (ethers `contract.filters`): `sc.filters.Transfer(from)` returns a
   * DeferredEventFilter for queryFilter / on. `sc.filters.Transfer` (uncalled) is the event handle itself.
   */
  get filters() {
    if (!this._filtersProxy) {
      this._filtersProxy = new Proxy({}, {
        get: (_t, prop) => {
          if (typeof prop !== "string") return void 0;
          try {
            return this.getEvent(prop);
          } catch {
            return void 0;
          }
        },
        has: (_t, prop) => typeof prop === "string" && (this.inner.artifact.events ?? []).some((e) => e.name === prop || e.signature === prop)
      });
    }
    return this._filtersProxy;
  }
  _eventLog(p, eventDef) {
    return {
      eventName: p.eventName ?? eventDef?.name ?? "",
      eventSignature: p.eventSignature ?? eventDef?.signature ?? "",
      args: p.values,
      txid: p.txid,
      vout: p.vout
    };
  }
  /**
   * Read historic events (ethers `contract.queryFilter`). `event` is an event name/signature, a
   * `filters.Name(...)` result, or `'*'` for all events. Returns EventLog[]. The fromBlock/toBlock arguments are
   * accepted for ethers parity but Bitcoin Cash events are a UTXO set, so the current set is always returned.
   */
  async queryFilter(event, _fromBlock, _toBlock) {
    if (event === "*") {
      const perEvent = await Promise.all(
        (this.inner.artifact.events ?? []).map(async (e) => (await this.queryEvents(e.signature)).map((p) => this._eventLog(p, e)))
      );
      return perEvent.flat();
    }
    let eventDef;
    let filter;
    if (typeof event === "string") {
      eventDef = this._resolveEventDef(event);
    } else if (typeof event === "function") {
      eventDef = event.eventDef;
    } else {
      eventDef = event.eventDef;
      filter = event.filter;
    }
    const parsed = await this.queryEvents(eventDef.signature, filter);
    return parsed.map((p) => this._eventLog(p, eventDef));
  }
  static _eventKey(event) {
    if (typeof event === "string") return `name:${event}`;
    const { eventDef, filter } = typeof event === "function" ? { eventDef: event.eventDef, filter: {} } : event;
    const f = Object.keys(filter).sort().map((k) => `${k}=${filter[k] instanceof Uint8Array ? binToHex(filter[k]) : String(filter[k])}`).join("&");
    return `sig:${eventDef.signature}|${f}`;
  }
  static _logKey(log) {
    return `${log.txid}:${log.vout}`;
  }
  async _pollEvents() {
    for (const sub of this._eventSubs.values()) {
      let logs;
      try {
        logs = await this.queryFilter(sub.event);
      } catch {
        continue;
      }
      for (const log of logs) {
        const k = StatefulContract._logKey(log);
        if (sub.seen.has(k)) continue;
        sub.seen.add(k);
        const eventDef = sub.event === "*" ? void 0 : typeof sub.event === "string" ? this._resolveEventDef(sub.event) : sub.event.eventDef;
        const args = eventDef?.parameters.map((parameter) => log.args[parameter.name]) ?? [];
        for (const listener of [...sub.listeners]) listener(...args, log);
      }
    }
  }
  _ensurePolling() {
    if (this._eventPoller || this._eventSubs.size === 0) return;
    this._eventPoller = setInterval(() => {
      void this._pollEvents();
    }, this.pollingInterval);
    this._eventPoller.unref?.();
  }
  _maybeStopPolling() {
    if (this._eventPoller && this._eventSubs.size === 0) {
      clearInterval(this._eventPoller);
      this._eventPoller = void 0;
    }
  }
  /** Subscribe to new events (ethers `contract.on`). Existing events are seeded as "seen" so only events that
   * appear after subscribing fire the listener. */
  async on(event, listener) {
    const key = StatefulContract._eventKey(event);
    let sub = this._eventSubs.get(key);
    if (!sub) {
      const current = await this.queryFilter(event);
      sub = this._eventSubs.get(key);
      if (!sub) {
        sub = { event, listeners: /* @__PURE__ */ new Set(), seen: new Set(current.map(StatefulContract._logKey)) };
        this._eventSubs.set(key, sub);
      }
    }
    sub.listeners.add(listener);
    this._ensurePolling();
    return this;
  }
  /** Subscribe to the next occurrence of an event, then auto-unsubscribe (ethers `contract.once`). */
  async once(event, listener) {
    const wrapper = (...args) => {
      void this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }
  /** Remove a listener (or all listeners for an event) (ethers `contract.off`). */
  async off(event, listener) {
    const sub = this._eventSubs.get(StatefulContract._eventKey(event));
    if (sub) {
      if (listener) sub.listeners.delete(listener);
      else sub.listeners.clear();
      if (sub.listeners.size === 0) this._eventSubs.delete(StatefulContract._eventKey(event));
    }
    this._maybeStopPolling();
    return this;
  }
  /** Remove all listeners, optionally for a single event (ethers `contract.removeAllListeners`). */
  async removeAllListeners(event) {
    if (event === void 0) this._eventSubs.clear();
    else this._eventSubs.delete(StatefulContract._eventKey(event));
    this._maybeStopPolling();
    return this;
  }
  /** Count listeners, optionally for a single event (ethers `contract.listenerCount`). */
  async listenerCount(event) {
    if (event === void 0) {
      return [...this._eventSubs.values()].reduce((n, s) => n + s.listeners.size, 0);
    }
    return this._eventSubs.get(StatefulContract._eventKey(event))?.listeners.size ?? 0;
  }
  /** List listeners, optionally for a single event (ethers `contract.listeners`). */
  async listeners(event) {
    if (event === void 0) return [...this._eventSubs.values()].flatMap((s) => [...s.listeners]);
    return [...this._eventSubs.get(StatefulContract._eventKey(event))?.listeners ?? []];
  }
  /** Alias for on (ethers `contract.addListener`). */
  async addListener(event, listener) {
    return this.on(event, listener);
  }
  /** Alias for off (ethers `contract.removeListener`). */
  async removeListener(event, listener) {
    return this.off(event, listener);
  }
  /**
   * Enumerate all entries in a mapping or array collection.
   *
   * Queries the entry NFT covenant address for this collection, decodes each
   * NFT commitment, and returns all key-value pairs.
   *
   * @param collectionNameOrSignature - Collection name (e.g. "balances") or full signature
   *   (e.g. "balances:mapping(pubkey => int)")
   * @returns Array of decoded entries with key(s) and value
   */
  async getEntries(collectionNameOrSignature) {
    return getEntriesImpl(this, collectionNameOrSignature);
  }
  /**
   * Materialize mapping reads used by a compiler-published runtime predicate into the expression evaluator's
   * state namespace. Scalar state already arrives through `getFullState()`, but mappings live at their own
   * collection covenant addresses and deliberately do not appear in that record. Planning a conditional event
   * or counter loop from scalar state alone would therefore either fail to resolve or, worse, guess the path.
   *
   * `getEntries()` authenticates the collection address and reconstructs inline and chunked values. A sorted
   * mapping commitment publishes only its slot hash, so match the evaluated source keys against that slot rather
   * than pretending the original keys can be decoded from the commitment. Missing keys receive the language
   * default, exactly like the on-chain mapping read.
   */
  async _hydrateExternalPredicateState(expressions, functionArgs, artifact, state, callerInputs, executionSelfAddress, occurrenceIndices = [0]) {
    return hydrateExternalPredicateStateImpl(
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        evaluateExternalExpression: (...a) => this._evaluateExternalExpression(...a),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getEntries: (...a) => this.getEntries(...a)
      },
      expressions,
      functionArgs,
      artifact,
      state,
      callerInputs,
      executionSelfAddress,
      occurrenceIndices
    );
  }
  // n for a PARAM blockhash read = the matching call arg (a direct-identifier n). Computed reads
  // (<computed:i> keys) are NOT resolved here - they come from the probe trace. Returns null on a non-bigint.
  paramBlockhashN(readKey, args, abiFunction) {
    return paramBlockhashNImpl(readKey, args, abiFunction);
  }
  // Run a minimal covenant probe (master + data NFTs + the already-resolved oracle co-spends, max-height
  // locktime so any tx.time >= n CLTV passes) and read the blockhash reads' (inputIndex, n) off the trace.
  async _extractBlockhashReads(masterUtxo, stateInputUnlocker, dataNftUtxos, priorCoSpends, base, slotCount) {
    return extractBlockhashReadsImpl(
      { categoryId: this.categoryId, inner: this.inner },
      masterUtxo,
      stateInputUnlocker,
      dataNftUtxos,
      priorCoSpends,
      base,
      slotCount
    );
  }
  /** Message-bus graph variant of the trace probe. The compiler reserves a sparse fixed row band, so preceding
   * inactive positions use inert inputs and prior active oracle co-spends occupy their exact slots. */
  async _extractGraphBlockhashRead(masterUtxo, stateInputUnlocker, dataNftUtxos, prior, base, targetOrdinal, slotCount, masterInputIndex = 0) {
    return extractGraphBlockhashReadImpl(
      { categoryId: this.categoryId, inner: this.inner },
      masterUtxo,
      stateInputUnlocker,
      dataNftUtxos,
      prior,
      base,
      targetOrdinal,
      slotCount,
      masterInputIndex
    );
  }
  // Resolve every blockhash oracle co-spend for a call, ordered by slot (ordinal 0..slotCount-1).
  async _resolveBlockhashCoSpends(abiFunction, args, base, slotCount, masterUtxo, stateInputUnlocker, dataNftUtxos) {
    return resolveBlockhashCoSpendsImpl(
      { categoryId: this.categoryId, inner: this.inner },
      abiFunction,
      args,
      base,
      slotCount,
      masterUtxo,
      stateInputUnlocker,
      dataNftUtxos
    );
  }
  // keccak256 compute side-cars for a stateful (branded) function: one per keccak256 call, co-spent at the
  // consecutive keccakSideCar block-layout slots (right after blockhashOracle). Each side-car input feeds
  // <pad><preimage><redeem> and its recreation commits R_i = keccak256(preimage_i); the master covenant binds
  // preimage_i == its call arg and reads R_i from the recreation. Direct-parameter args come from the call
  // args; complex/nested args (keccakPreimageParams[i] === null) are not yet supported for stateful contracts
  // (the stateless VM-probe path does not port to the derivation build) and throw. Ordered by call.
  async _resolveKeccakComputeCoSpends(abiFunction, args, probeCtx, sharedSidecarPool) {
    return resolveKeccakComputeCoSpendsImpl(
      {
        categoryId: this.categoryId,
        // A shared pool (salt 0) is listed through the view the caller gives; it is not minted on demand.
        ...sharedSidecarPool !== void 0 && { sidecarSalt: new Uint8Array(32) },
        inner: sharedSidecarPool === void 0 ? this.inner : {
          bytecode: this.inner.bytecode,
          artifact: this.inner.artifact,
          provider: sharedSidecarPool
        },
        extractStatefulKeccakPreimages: (...a) => this._extractStatefulKeccakPreimages(...a),
        evalComputedKey: (...a) => evalComputedKey(...a)
      },
      abiFunction,
      args,
      probeCtx
    );
  }
  /**
   * Resolve the recovery side-car PAIRS for a stateful ecrecoverPubKey function: one A+B pair per call, branded to the
   * contract's category, positioned at the ecrecoverSideCar block-layout slots (A = slot 2i, B = slot 2i+1). Mirrors
   * _resolveKeccakComputeCoSpends but a pair per call (A commits H_A, B commits the recovered pubkey Q). The (h,v,r,s)
   * args come straight from the direct parameters; the split (chunkA) is VM-probed. Returns a flat A0,B0,A1,B1,.. list.
   */
  async _resolveEcrecoverComputeCoSpends(abiFunction, args, selectedCalls, options = {}, sharedSidecarPool, takeMiddleCoin) {
    return resolveEcrecoverComputeCoSpendsImpl(
      {
        categoryId: this.categoryId,
        ...sharedSidecarPool === void 0 ? { inner: this.inner } : { sidecarSalt: new Uint8Array(32), inner: { provider: sharedSidecarPool } },
        ...takeMiddleCoin === void 0 ? {} : { takeMiddleCoin }
      },
      abiFunction,
      args,
      selectedCalls,
      options
    );
  }
  // Resolve complex/nested keccak256 preimages (null params) for a STATEFUL contract via a VM probe: build a
  // minimal tx (master + data NFTs + placeholder keccak side-cars at their block-layout slots), debug the
  // master, and read each unresolved call's argument off the trace at its OP_INPUTBYTECODE step (before the
  // binding OP_EQUALVERIFY aborts). Nested calls resolve one per probe (inner-to-outer), like the stateless
  // path, which also ends probing the same way when a probe learns nothing. Requires the probe context;
  // unsupported alongside front-region oracles/reads that shift the keccak slot (throws). Mutates `preimages`.
  async _extractStatefulKeccakPreimages(abiFunction, preimages, salt, scUtxos, probeCtx) {
    if (!probeCtx) {
      throw new Error("keccak256 with a complex/nested argument in a stateful contract is resolved during auto-derivation; build the call through StatefulContract (internal probe context missing).");
    }
    const { masterUtxo, stateInputUnlocker, dataNftUtxos, dataNftUnlockers } = probeCtx;
    const frontRegion = probeCtx.frontRegionInputs ?? [];
    const kSlots = abiFunction.blockLayout?.slots.filter((s) => s.kind === "keccakSideCar") ?? [];
    const base = kSlots[0]?.offset ?? 1 + dataNftUtxos.length;
    const n = preimages.length;
    const batchCount = Math.ceil(n / 3);
    if (base !== 1 + dataNftUtxos.length + frontRegion.length) {
      throw new Error("keccak256 complex/nested-argument probe: the front-region inputs (external reads / blockhash oracles) do not fill the slots before the keccak side-car; cannot position the probe.");
    }
    const { CovenantTransactionBuilder } = await import("./CovenantTransactionBuilder.js");
    const vm = createVirtualMachineBch2026ForProvider(this.inner.provider);
    const lock = keccakComputeLockingBytecode(salt, true);
    let fixedCursor = base + batchCount;
    const laterSlots = [...probeCtx.slotInputs ?? []].filter((slot) => slot.offset >= fixedCursor).sort((a, b) => a.offset - b.offset);
    let fillerSeq = 0;
    const fillerInput = () => {
      fillerSeq += 1;
      return {
        txid: `${"ef".repeat(28)}${fillerSeq.toString(16).padStart(8, "0")}`,
        vout: 0,
        satoshis: 1000n,
        unlocker: {
          generateLockingBytecode: () => Uint8Array.of(81),
          generateUnlockingBytecode: () => Uint8Array.of(1, 81)
        }
      };
    };
    const laterInputs = [];
    for (const slot of laterSlots) {
      while (fixedCursor < slot.offset) {
        laterInputs.push(fillerInput());
        fixedCursor += 1;
      }
      laterInputs.push({ ...slot.utxo, unlocker: slot.unlocker });
      fixedCursor = slot.offset + 1;
    }
    const trailing = keccakProbeTrailingRun(
      abiFunction,
      stateInputUnlocker,
      fixedCursor,
      probeCtx.trailingReadInputs,
      probeCtx.firstDynamicReadInput
    );
    let guard = 0;
    while (preimages.some((p) => p === null)) {
      if (guard++ > n) throw new Error("keccak256 stateful preimage extraction did not converge.");
      const probe = new CovenantTransactionBuilder({ provider: this.inner.provider });
      if ((probeCtx.locktime ?? 0) > 0) probe.setLocktime(probeCtx.locktime);
      probe.addInput(masterUtxo, trailing.unlocker, masterUtxo.options);
      dataNftUtxos.forEach((u, i) => probe.addInput(u, dataNftUnlockers[i]));
      frontRegion.forEach((u) => probe.addInputs([u]));
      const recreates = [];
      for (let batch = 0; batch < batchCount; batch++) {
        const batchPreimages = preimages.slice(batch * 3, batch * 3 + 3).map((preimage) => preimage ?? new Uint8Array(0));
        const { unlocker, recreate } = buildKeccakComputeSidecar(
          batchPreimages,
          salt,
          scUtxos[batch],
          true
        );
        probe.addInput(scUtxos[batch], unlocker);
        recreates.push(recreate);
      }
      probe.addInputs(laterInputs);
      probe.addInputs(trailing.inputs);
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
      frontRegion.forEach((u) => probe.addOutput(this._frontRegionRecreate(u)));
      for (const rec of recreates) probe.addOutput({ ...rec, to: lock });
      laterInputs.forEach((u) => probe.addOutput(this._frontRegionRecreate(u)));
      trailing.inputs.forEach((u) => probe.addOutput(this._frontRegionRecreate(u)));
      const transaction = probe.buildLibauthTransaction();
      const sourceOutputs = generateLibauthSourceOutputs(probe.inputs);
      const trace = vm.debug({ inputIndex: 0, sourceOutputs, transaction });
      if (!learnKeccakPreimages(preimages, scanKeccakPreimageReads(trace, base, n, batchCount))) {
        preimages.forEach((preimage, index) => {
          if (preimage === null) preimages[index] = new Uint8Array(0);
        });
      }
    }
  }
  // Self-preserving recreation of a front-region co-spend (read-only data NFT or blockhash oracle): same locking,
  // amount, token - unchanged. Mirrors the StatefulTransactionBuilder's readOnly/blockhash output construction.
  _frontRegionRecreate(u) {
    return { to: u.unlocker.generateLockingBytecode(), amount: u.satoshis, token: u.token };
  }
  /**
   * Fill the fixed block slots between the data NFTs and the keccak-loop trailing region so the loop probe's
   * side-cars land at the compiler's `master + blockSize` coordinate. The read-only-data and blockhash slots are
   * already in `baseFrontRegion` (in slot order); satoshi/token containers add their real UTXO, and every other
   * slot (output-only transfer/event/returnEvent slots, or a container the build has not resolved) gets a neutral
   * self-preserving funder. All of these families are checked in the epilogue AFTER the keccak loop, so the
   * self-preserving funder recreations never block preimage discovery.
   */
  _padKeccakLoopFrontRegion(abiFunction, dataNftCount, sidecarBase, baseFrontRegion, satoshiContainerUtxo, tokenContainers, blockInfoCoSpendUtxos) {
    const result = [...baseFrontRegion];
    let syntheticSeq = 0;
    const syntheticFunder = () => {
      syntheticSeq += 1;
      const lock = Uint8Array.of(81);
      return {
        txid: `${"00".repeat(28)}${syntheticSeq.toString(16).padStart(8, "0")}`,
        vout: 0,
        satoshis: 1000n,
        unlocker: {
          generateLockingBytecode: () => lock,
          generateUnlockingBytecode: () => new Uint8Array()
        }
      };
    };
    let tokenContainerCursor = 0;
    const slots = abiFunction.blockLayout?.slots ?? [];
    for (const slot of slots) {
      if (slot.offset < 1 + dataNftCount || slot.offset >= sidecarBase) continue;
      switch (slot.kind) {
        case "readOnlyDataNft":
        case "blockhashOracle":
          break;
        // already packed into baseFrontRegion in slot order
        case "blockInfoOracle":
          result.push(blockInfoCoSpendUtxos[0] ?? syntheticFunder());
          break;
        case "satoshiContainer":
          result.push(satoshiContainerUtxo ?? syntheticFunder());
          break;
        case "tokenContainer": {
          const info = tokenContainers[tokenContainerCursor];
          tokenContainerCursor += 1;
          result.push(info?.utxo ?? syntheticFunder());
          break;
        }
        default:
          result.push(syntheticFunder());
          break;
      }
    }
    return result;
  }
  // Stateful DYNAMIC keccak loop: determine the runtime iteration count N and each iteration's preimage by a
  // PROGRESSIVE VM probe, then build N trailing compute side-cars. Each probe co-spends k trailing side-cars
  // (the first k-1 resolved, the k-th a placeholder) at [blockSize, blockSize+k) and reads the master; the loop
  // aborts at the FIRST placeholder bind, whose preimage `extractKeccakPreimageFromTrace(base=blockSize)` yields.
  // Resolve one iteration per probe until the loop exits (the k-th placeholder is never read -> the last in-range
  // read is an already-resolved index) => N reached. MVP: no fixed front-region slots before the trailing region
  // (blockSize == 1 + dataNftCount) and no other trailing users (entries/containers/transfers).
  async _resolveStatefulKeccakLoop(abiFunction, masterUtxo, stateInputUnlocker, dataNftUtxos, dataNftUnlockers, frontRegionInputs = [], locktime = 0, trailingPredecessors = { inputs: [], outputs: [] }, sharedSidecarPool, trailingSuccessors) {
    return resolveStatefulKeccakLoopImpl(
      {
        categoryId: this.categoryId,
        // A shared pool (salt 0) is listed through the view the caller gives; it is not minted on demand.
        ...sharedSidecarPool !== void 0 && { sidecarSalt: new Uint8Array(32) },
        inner: sharedSidecarPool === void 0 ? this.inner : { provider: sharedSidecarPool },
        frontRegionRecreate: (u) => this._frontRegionRecreate(u),
        createVirtualMachine: (provider) => createVirtualMachineBch2026ForProvider(provider),
        generateLibauthSourceOutputs: (inputs) => generateLibauthSourceOutputs(inputs)
      },
      abiFunction,
      masterUtxo,
      stateInputUnlocker,
      dataNftUtxos,
      dataNftUnlockers,
      frontRegionInputs,
      locktime,
      trailingPredecessors,
      trailingSuccessors
    );
  }
  // keccak256 compute side-cars for a CO-SPENT EXTERNAL contract B (transitive): both externalCall and
  // externalOutState run B's function, which reads a keccakSideCar slot in B's OWN block, so B's branded
  // side-car must be co-spent + recreated inside B's block. Mirrors _resolveKeccakComputeCoSpends but for B
  // (shared salt=0; direct-param preimages from the group's args, complex/nested via an isolated probe of B).
  // Returns B's side-car inputs (in keccak call order) + their recreations.
  async _resolveExternalKeccakSideCars(bAbiFunc, args, externalCategoryId, bContract) {
    return resolveExternalKeccakSideCarsImpl(
      {
        provider: this.inner.provider,
        externalKeccakProbeCtx: (...a) => this._externalKeccakProbeCtx(...a),
        extractStatefulKeccakPreimages: (...a) => this._extractStatefulKeccakPreimages(...a)
      },
      bAbiFunc,
      args,
      externalCategoryId,
      bContract
    );
  }
  // Build a probe context for the callee B: B's master (unlocked with B's function args) + ALL of B's data NFTs
  // (so B's keccakSideCar slot base = 1 + dataNftCount matches its block layout). Used to extract B's complex
  // keccak preimages by evaluating B in an isolated mini-tx (like the direct stateful complex path, but on B).
  async _externalKeccakProbeCtx(bContract, bAbiFunc, args, externalCategoryId) {
    const bState = await bContract.getFullState();
    if (!bState.masterUtxo) throw new Error(`External contract master UTXO not found (category ${externalCategoryId}).`);
    const unlockFns = bContract.inner.unlock;
    const dataNftUtxos = bState.dataNftUtxos;
    const dataNftUnlockers = dataNftUtxos.map(() => createDataNftUnlocker(bContract.inner, 0, externalCategoryId));
    const bhSlot = bAbiFunc.blockLayout?.slots.find((slot) => slot.kind === "blockhashOracle");
    const probeArgs = completeInternalFunctionArguments((bAbiFunc.blockhashReads?.length ?? 0) > 0 && bhSlot !== void 0 && bAbiFunc.inputs.some((input) => input.name === "__internal__blockhashInputIndex") ? materializeInternalFunctionArgument(
      args ?? [],
      bAbiFunc.inputs,
      "__internal__blockhashInputIndex",
      BigInt(bhSlot.offset)
    ) : [...args ?? []], bAbiFunc.inputs);
    const stateInputUnlocker = unlockFns[bAbiFunc.name]?.(...probeArgs);
    if (!stateInputUnlocker) throw new Error(`Cannot build an unlocker for external function ${bAbiFunc.name}.`);
    const frontRegionInputs = [];
    let locktime = 0;
    const bhSlots = bAbiFunc.blockLayout?.slots.filter((slot) => slot.kind === "blockhashOracle") ?? [];
    if ((bAbiFunc.blockhashReads?.length ?? 0) > 0 && bhSlots.length > 0) {
      const resolved = await resolveBlockhashCoSpendsImpl(
        { categoryId: externalCategoryId, inner: bContract.inner },
        bAbiFunc,
        args,
        bhSlots[0].offset,
        bhSlots.length,
        bState.masterUtxo,
        stateInputUnlocker,
        dataNftUtxos
      );
      frontRegionInputs.push(...resolved.map((coSpend) => ({ ...coSpend.utxo, unlocker: coSpend.unlocker })));
      locktime = resolved.reduce((max, coSpend) => Math.max(max, coSpend.locktime), 0);
    }
    return {
      masterUtxo: bState.masterUtxo,
      stateInputUnlocker,
      dataNftUtxos,
      dataNftUnlockers,
      ...frontRegionInputs.length > 0 && { frontRegionInputs },
      ...locktime > 0 && { locktime }
    };
  }
  // Resolve B's blockhash(n) oracle co-spends for a transitive external outState read (B's function reads
  // blockhash). Mirrors _resolveBlockhashCoSpends but against B's category and with B's master/data NFT state,
  // so B's outState probe can satisfy `require(blockhash(bn) == bh)` at B's blockhashOracle slot.
  async _resolveExternalBlockhashCoSpends(bAbiFunc, args, externalCategoryId, bContract) {
    if (!bAbiFunc || (bAbiFunc.blockhashReads?.length ?? 0) === 0 || !externalCategoryId) {
      return { inputs: [], recreates: [], locktime: 0 };
    }
    if (!bContract) {
      throw new Error("transitive blockhash(n) read needs the external contract instance; call through withExternalCall().");
    }
    const bState = await bContract.getFullState();
    if (!bState.masterUtxo) throw new Error(`External contract master UTXO not found (category ${externalCategoryId}).`);
    const unlockFns = bContract.inner.unlock;
    const dataNftUtxos = bState.dataNftUtxos;
    const bhSlots = bAbiFunc.blockLayout?.slots.filter((slot) => slot.kind === "blockhashOracle") ?? [];
    const bhSlot = bhSlots[0];
    const probeArgs = completeInternalFunctionArguments(bhSlot !== void 0 && bAbiFunc.inputs.some((input) => input.name === "__internal__blockhashInputIndex") ? materializeInternalFunctionArgument(
      args ?? [],
      bAbiFunc.inputs,
      "__internal__blockhashInputIndex",
      BigInt(bhSlot.offset)
    ) : [...args ?? []], bAbiFunc.inputs);
    const stateInputUnlocker = unlockFns[bAbiFunc.name]?.(...probeArgs);
    if (!stateInputUnlocker) throw new Error(`Cannot build an unlocker for external function ${bAbiFunc.name}.`);
    const resolved = await resolveBlockhashCoSpendsImpl(
      { categoryId: externalCategoryId, inner: bContract.inner },
      bAbiFunc,
      args,
      bhSlot?.offset ?? 0,
      bhSlots.length,
      bState.masterUtxo,
      stateInputUnlocker,
      dataNftUtxos
    );
    return {
      inputs: resolved.map((coSpend) => ({ ...coSpend.utxo, unlocker: coSpend.unlocker })),
      recreates: resolved.map((coSpend) => coSpend.recreate),
      locktime: resolved.reduce((max, coSpend) => Math.max(max, coSpend.locktime), 0)
    };
  }
  // Absolute input index of the first blockhashOracle slot + the slot count (master is input 0, so the slot
  // offset is already absolute). Used to fill __internal__blockhashInputIndex and bound the trace extraction.
  blockhashSlotBase(abiFunction) {
    const slots = abiFunction?.blockLayout?.slots.filter((s) => s.kind === "blockhashOracle") ?? [];
    return { base: slots.length > 0 ? slots[0].offset : 0, count: slots.length };
  }
  async _deriveCommitments(functionName, args, requiredNftIndices, extraOutputs, extraInputs, entryOutputCount = 0, childDataNftCount = 0, deriveChildCommitments = false, returnEventOutputCount = 0, containerOutputCount = 0, trailingEntryOutputCount = 0, trailingEntryOutputOffset, probeState, eventOutputCount = 0, locktime) {
    return deriveCommitmentsImpl(
      {
        inner: this.inner,
        categoryId: this.categoryId,
        blockhashSlotBase: (...a) => this._blockhashSlotBase(...a),
        getFullState: () => this.getFullState(),
        resolveBlockhashCoSpends: (...a) => this._resolveBlockhashCoSpends(...a),
        resolveKeccakComputeCoSpends: (...a) => this._resolveKeccakComputeCoSpends(...a),
        resolveEcrecoverComputeCoSpends: (...a) => this._resolveEcrecoverComputeCoSpends(...a)
      },
      functionName,
      args,
      requiredNftIndices,
      extraOutputs,
      extraInputs,
      entryOutputCount,
      childDataNftCount,
      deriveChildCommitments,
      returnEventOutputCount,
      containerOutputCount,
      trailingEntryOutputCount,
      trailingEntryOutputOffset,
      probeState,
      eventOutputCount,
      locktime
    );
  }
  /**
   * Refresh final post-write views from the state outputs already derived for their shared participant.
   *
   * The overlay is a normal NetworkProvider view of those outputs, so return derivation follows the callee's
   * ordinary ABI/VM path. It deliberately handles only compiler-proven read-only, single-return functions whose
   * non-chunked collection dependencies have no later writer; intermediate-state reads require an atomic route.
   */
  async _refreshProjectedExternalReturns(stb, groups) {
    return refreshProjectedExternalReturnsImpl(stb, groups);
  }
  /**
   * Derive full cross-contract transaction state via iterative VM evaluation.
   *
   * Phase 1: For each external call group, build a probe transaction and run
   * the VM on B's master input to extract B's expected commitments and return blob.
   *
   * Phase 2: With B's state and return events applied, build a second probe
   * and run the VM on A's master input to extract A's expected commitments.
   */
  async _deriveFullTransactionState(stb, requiredNftIndices, externalCallUtxoGroups, externalCalls, entryAccesses, emitInfos, eventBlockLayout, transferCount, tokenContainerTransferOps, delegatecallInputIndex, externalOutStateUtxoGroups, debugTargetDerivation = false, currentStateSnapshot, skipExternalStateDerivation = false) {
    const stateLayout = this.inner.stateLayout;
    const {
      persistWidthAtEntry
    } = prepareDeriveFullValueChunkWritesImpl(stb);
    const {
      probeDelegate,
      restoreProbeWitnesses
    } = rebaseDeriveFullProbeDelegateWitnessesImpl(stb, delegatecallInputIndex, debugTargetDerivation);
    try {
      try {
        if (globalThis.process?.env?.SOLIDC_DEBUG_RETURN_SNAPSHOT === "1") {
          console.error("external-group-requirements", externalCallUtxoGroups.map((group, index) => ({
            index,
            functionName: group.functionName,
            required: group.requiredDataNftIndices,
            dataNfts: group.dataNftUtxos.length,
            routeRows: group.compilerRoute?.rowArguments?.map((row) => ({
              selector: row.selector,
              handler: row.handler.name,
              required: row.handler.requiredNftIndices
            })),
            precomputed: group.precomputedReturnCommitment ? binToHex(group.precomputedReturnCommitment) : void 0
          })));
        }
        if (debugTargetDerivation) console.error("derive-setup-seed-returns-start");
        stb.seedPrecomputedReturnEvents(externalCalls);
        if (debugTargetDerivation) console.error("derive-setup-seed-returns-complete");
        const reconcileReturnWitnesses = () => {
          reconcileDeriveFullReturnWitnessesImpl(stb, externalCallUtxoGroups);
        };
        const rebindExternalResourceMaster = (group, entryMasterIdx) => rebindDeriveFullExternalResourceMasterImpl(stb, group, entryMasterIdx);
        if (skipExternalStateDerivation) {
          let rebound = false;
          for (const group of externalCallUtxoGroups) {
            if (group.sharedGroupIndex !== void 0) continue;
            rebound = rebindExternalResourceMaster(
              group,
              stb.findMintingInputIndex(group.categoryId)
            ) || rebound;
          }
          if (rebound) stb._refreshInputs();
        }
        for (const group of externalCallUtxoGroups) {
          if (!group.plannedEntryInserts?.length || group.sharedGroupIndex !== void 0) continue;
          group.plannedEntryInsertHandles = group.plannedEntryInserts.map((insert) => {
            const input = group.blockInputs?.[insert.blockSlot];
            if (!input) {
              throw new Error(
                `Planned sorted-batch insert for entry slot ${String(insert.slotIndex ?? "?")} names block offset ${String(insert.blockSlot)}, but ${group.logicalFunctionName ?? group.functionName ?? "participant"} has ${String(group.blockInputs?.length ?? 0)} block inputs (${(group.blockLayout?.slots ?? []).map((slot) => `${slot.kind}@${slot.offset}`).join(", ")}).`
              );
            }
            return stb.addExternalCallEntryInsert(
              group.categoryId,
              input.unlocker.generateLockingBytecode(),
              insert.commitment ?? "00"
            );
          });
        }
        const firstPhase1Group = skipExternalStateDerivation ? -1 : externalCallUtxoGroups.length - 1;
        for (let groupIdx = firstPhase1Group; groupIdx >= 0; groupIdx--) {
          const group = externalCallUtxoGroups[groupIdx];
          const ec = externalCalls[groupIdx];
          if (group.sharedGroupIndex !== void 0) continue;
          await deriveNestedStreamedEvents(this.inner.provider, stb, group, groupIdx);
          const phase1Front = deriveFullPhase1GroupFrontImpl(
            {
              categoryId: this.categoryId,
              inner: this.inner,
              rebindExternalResourceMaster: (g, i) => rebindExternalResourceMaster(g, i)
            },
            stb,
            externalCallUtxoGroups,
            groupIdx,
            debugTargetDerivation
          );
          let probeBuilder = phase1Front.probeBuilder;
          const transaction = phase1Front.transaction;
          let fullTrace = phase1Front.fullTrace;
          const bMasterIdx = phase1Front.bMasterIdx;
          const valueChunkWitness = phase1Front.valueChunkWitness;
          const phase1PostEval = deriveFullPhase1PostEvaluateDataCommitmentsImpl(
            { inner: this.inner },
            stb,
            group,
            groupIdx,
            probeBuilder,
            fullTrace,
            bMasterIdx,
            ec?.hasReturnValues
          );
          fullTrace = phase1PostEval.fullTrace;
          const bOutputBase = phase1PostEval.bOutputBase;
          if (phase1PostEval.skipGroup) continue;
          fullTrace = deriveFullPhase1CalleeDynamicChunksImpl(
            { inner: this.inner },
            stb,
            group,
            bMasterIdx
          ) ?? fullTrace;
          deriveFullPhase1ProgressiveEntriesImpl(
            { inner: this.inner },
            stb,
            group,
            groupIdx,
            bOutputBase,
            fullTrace,
            transaction,
            bMasterIdx,
            valueChunkWitness,
            debugTargetDerivation
          );
          await deriveNestedStreamedEvents(this.inner.provider, stb, group, groupIdx);
          deriveFullPhase1ReturnAndEventsImpl(
            { inner: this.inner },
            stb,
            externalCallUtxoGroups,
            group,
            groupIdx,
            externalCalls,
            ec?.hasReturnValues,
            bOutputBase,
            bMasterIdx
          );
        }
        if (debugTargetDerivation) console.error("derive-projected-returns-start");
        await this._refreshProjectedExternalReturns(stb, externalCallUtxoGroups);
        if (debugTargetDerivation) console.error("derive-projected-returns-complete");
        deriveFullPhase1bOutStateAndLowLevelImpl(
          { inner: this.inner },
          stb,
          externalOutStateUtxoGroups,
          debugTargetDerivation
        );
        const {
          dummyLbc,
          satoshiTransferCount,
          ftOps,
          nftOps
        } = seedDeriveFullPhase2PlaceholdersImpl(
          stb,
          emitInfos,
          transferCount,
          tokenContainerTransferOps
        );
        let derivedTransfers;
        let derivedFtTransfers;
        let derivedNftTransfers;
        let satoshiAmountsFullyDerived = false;
        let ftAmountsFullyDerived = false;
        const runtimeLoopTransferBytecodesDerived = Array.from(
          { length: stb.getRuntimeLoopTransferOutputs().length },
          () => false
        );
        const runtimeLoopTransferAmountsDerived = stb.getRuntimeLoopTransferOutputs().map((output) => output.kind === "nft");
        const runtimeLoopTransferCommitmentsDerived = stb.getRuntimeLoopTransferOutputs().map((output) => output.kind !== "nft");
        const runtimeLoopTransferCapabilitiesDerived = stb.getRuntimeLoopTransferOutputs().map((output) => output.kind !== "nft");
        const phase2Host = this;
        const phase2Prelude = prepareDeriveFullPhase2LoopImpl(
          {
            inner: phase2Host.inner,
            maxDerivationIterations: phase2Host.maxDerivationIterations,
            get lastDerivationIterations() {
              return phase2Host.lastDerivationIterations;
            },
            set lastDerivationIterations(v) {
              phase2Host.lastDerivationIterations = v;
            }
          },
          stb,
          {
            entryAccessesLength: entryAccesses?.length ?? 0,
            emitInfosLength: emitInfos?.length ?? 0,
            requiredNftIndicesLength: requiredNftIndices.length,
            persistWidthAtEntry,
            debugTargetDerivation,
            dummyLbc,
            delegatecallInputIndex
          }
        );
        const {
          entryCount,
          eventCount,
          stateCount,
          maxIterations,
          configuredDebugIterations,
          debugTargetsThisDerivation,
          persistWidth,
          retainDiagnosticTrace,
          fingerprintLockingBytecode,
          lockingBytecodeFingerprintCache
        } = phase2Prelude;
        let {
          derivedAState,
          prevConvergenceKey,
          derivedStateCount,
          lastTrace,
          lastFailProbeOutputs,
          previousProbeFingerprint,
          skipNestedAfterPass
        } = phase2Prelude.loopState;
        const { seenConvergenceKeys, probedSortedLoop } = phase2Prelude.loopState;
        for (let iter = 0; iter < maxIterations; iter++) {
          const debugIterationStartedAt = debugTargetsThisDerivation ? Date.now() : 0;
          let phase2ParamSnap;
          let phase2Insertion;
          let probeBuilder2;
          try {
            const phase2IterProbe = deriveFullPhase2IterationProbeImpl(
              {
                inner: this.inner,
                get lastDerivationIterations() {
                  return phase2Host.lastDerivationIterations;
                },
                set lastDerivationIterations(v) {
                  phase2Host.lastDerivationIterations = v;
                }
              },
              stb,
              {
                iter,
                dummyLbc,
                delegatecallInputIndex,
                debugTargetsThisDerivation,
                previousProbeFingerprint,
                lockingBytecodeFingerprintCache,
                fingerprintLockingBytecode,
                retainDiagnosticTrace,
                debugIterationStartedAt
              }
            );
            phase2ParamSnap = phase2IterProbe.phase2ParamSnap;
            phase2Insertion = phase2IterProbe.phase2Insertion;
            probeBuilder2 = phase2IterProbe.probeBuilder2;
            previousProbeFingerprint = phase2IterProbe.previousProbeFingerprint;
            if (phase2IterProbe.fixedPoint) break;
            const transaction2 = phase2IterProbe.transaction2;
            const sourceOutputs2 = phase2IterProbe.sourceOutputs2;
            const fullTrace2 = phase2IterProbe.fullTrace2;
            const faithfulProbeHadError = phase2IterProbe.faithfulProbeHadError;
            lastTrace = phase2IterProbe.lastTrace;
            if (phase2IterProbe.lastFailProbeOutputs !== void 0) {
              lastFailProbeOutputs = phase2IterProbe.lastFailProbeOutputs;
            }
            const debugIterationBuiltAt = phase2IterProbe.debugIterationBuiltAt ?? Date.now();
            let commitmentProgress = 0;
            let nestedPinProgress = 0;
            let nestedProbeHadError = false;
            if (stb.resolveDeferredKeccakPreimage(fullTrace2)) commitmentProgress += 1;
            if (stb.resolveDeferredEcrecoverArgument(fullTrace2)) commitmentProgress += 1;
            for (const [llcIndex, llc] of stb.getLowLevelCallUtxoGroups().entries()) {
              const nestedValueChunkPin = applyDeriveFullNestedValueChunkPinImpl(
                {
                  categoryId: this.categoryId,
                  inner: this.inner
                },
                {
                  stb,
                  probeBuilder2,
                  sourceOutputs2,
                  transaction2,
                  llc,
                  llcIndex,
                  delegatecallInputIndex,
                  skipNestedAfterPass,
                  debugTargetsThisDerivation,
                  iter
                }
              );
              if (nestedValueChunkPin.skipped) continue;
              commitmentProgress += nestedValueChunkPin.commitmentProgressDelta;
              nestedPinProgress += nestedValueChunkPin.nestedPinProgressDelta;
              nestedProbeHadError ||= nestedValueChunkPin.nestedProbeHadError;
              const {
                nestedTrace,
                implInputIndex,
                proxyGroup,
                nestedOutputBase,
                chunkCategory,
                valueChunkWrites,
                band,
                allChunks,
                fallbackBase,
                pin
              } = nestedValueChunkPin;
              const nestedEntryPins = applyDeriveFullNestedEntryPinsImpl(
                {
                  categoryId: this.categoryId,
                  inner: this.inner
                },
                {
                  stb,
                  probeBuilder2,
                  llc,
                  nestedTrace,
                  implInputIndex,
                  proxyGroup,
                  chunkCategory,
                  valueChunkWrites,
                  band,
                  allChunks,
                  fallbackBase,
                  pin
                }
              );
              commitmentProgress += nestedEntryPins.commitmentProgressDelta;
              nestedPinProgress += nestedEntryPins.nestedPinProgressDelta;
              const nestedCommitsEventPins = applyDeriveFullNestedCommitsEventPinsImpl({
                stb,
                probeBuilder2,
                llc,
                nestedTrace,
                nestedOutputBase,
                implInputIndex,
                proxyGroup,
                chunkCategory,
                valueChunkWrites,
                band,
                allChunks,
                pin
              });
              commitmentProgress += nestedCommitsEventPins.commitmentProgressDelta;
              nestedPinProgress += nestedCommitsEventPins.nestedPinProgressDelta;
            }
            if (debugTargetsThisDerivation) console.error("derive-phase2-nested-complete", {
              iter,
              elapsedMs: Date.now() - debugIterationBuiltAt
            });
            if (debugTargetsThisDerivation) console.error("derive-phase2-nested-complete", {
              iter,
              elapsedMs: Date.now() - debugIterationBuiltAt
            });
            let phaseCheckpointAt = debugTargetsThisDerivation ? Date.now() : 0;
            const phaseCheckpoint = (stage) => {
              if (!debugTargetsThisDerivation) return;
              const now = Date.now();
              console.error("derive-phase2-postprocess", { iter, stage, ms: now - phaseCheckpointAt });
              phaseCheckpointAt = now;
            };
            if (!nestedProbeHadError && persistWidth > 0) skipNestedAfterPass = true;
            let latestEntryCommits = [];
            let latestEventCommits = [];
            let latestLoopEntryCommits = [];
            let stateCommits = [];
            {
              const applied = deriveFullPhase2ApplyStateAndEntriesImpl(
                { categoryId: this.categoryId },
                stb,
                {
                  probeBuilder2,
                  fullTrace2,
                  commitmentProgress,
                  derivedAState,
                  derivedStateCount,
                  stateCount,
                  entryCount,
                  stateLayout,
                  requiredNftIndices,
                  entryAccesses,
                  delegatecallInputIndex,
                  phaseCheckpoint
                }
              );
              commitmentProgress = applied.commitmentProgress;
              derivedAState = applied.derivedAState;
              derivedStateCount = applied.derivedStateCount;
              stateCommits = applied.stateCommits;
              latestEntryCommits = applied.latestEntryCommits;
              latestEventCommits = applied.latestEventCommits;
              latestLoopEntryCommits = applied.latestLoopEntryCommits;
            }
            let chunkVars = stb.getDynamicChunkVars();
            let getPhysicalChunkOutputBase = () => stb.getChunkOutputBase();
            {
              const appliedDyn = deriveFullPhase2ApplyDynamicChunksImpl(
                {
                  categoryId: this.categoryId,
                  inner: this.inner
                },
                stb,
                {
                  probeBuilder2,
                  fullTrace2,
                  commitmentProgress,
                  derivedAState,
                  stateLayout,
                  iter,
                  phaseCheckpoint
                }
              );
              commitmentProgress = appliedDyn.commitmentProgress;
              derivedAState = appliedDyn.derivedAState;
              chunkVars = appliedDyn.chunkVars;
              getPhysicalChunkOutputBase = appliedDyn.getPhysicalChunkOutputBase;
            }
            {
              const appliedLoop = deriveFullPhase2ApplyLoopEntriesImpl(
                stb,
                {
                  probeBuilder2,
                  fullTrace2,
                  commitmentProgress,
                  latestLoopEntryCommits,
                  stateLayout,
                  probedSortedLoop,
                  delegatecallInputIndex,
                  iter,
                  phaseCheckpoint
                }
              );
              commitmentProgress = appliedLoop.commitmentProgress;
              latestLoopEntryCommits = appliedLoop.latestLoopEntryCommits;
            }
            {
              const appliedRtLoop = deriveFullPhase2ApplyRuntimeLoopImpl(
                {
                  extractExpectedOutputCommitmentFromTrace,
                  parseNftCapability,
                  traceRuntimeEffectStreams: () => traceRuntimeEffectStreamRuns(this.inner.provider, {
                    inputIndex: delegatecallInputIndex ?? 0,
                    sourceOutputs: sourceOutputs2,
                    transaction: transaction2
                  })
                },
                stb,
                {
                  probeBuilder2,
                  fullTrace2,
                  commitmentProgress,
                  derivedFlags: {
                    bytecodesDerived: runtimeLoopTransferBytecodesDerived,
                    amountsDerived: runtimeLoopTransferAmountsDerived,
                    commitmentsDerived: runtimeLoopTransferCommitmentsDerived,
                    capabilitiesDerived: runtimeLoopTransferCapabilitiesDerived
                  },
                  phaseCheckpoint
                }
              );
              commitmentProgress = appliedRtLoop.commitmentProgress;
            }
            {
              const appliedValueChunks = deriveFullPhase2ApplyValueChunksImpl(
                {
                  categoryId: delegatecallInputIndex !== void 0 ? stb.rootCategoryId : this.categoryId,
                  inner: this.inner,
                  ...delegatecallInputIndex !== void 0 ? { stateOwnerLock: stb.ownerMasterLock() } : {}
                },
                stb,
                {
                  probeBuilder2,
                  fullTrace2,
                  commitmentProgress,
                  stateLayout,
                  delegatecallInputIndex,
                  iter,
                  phaseCheckpoint
                }
              );
              commitmentProgress = appliedValueChunks.commitmentProgress;
            }
            {
              const appliedEvents = deriveFullPhase2ApplyDynamicRescanAndEventsImpl(
                { extractExpectedOutputCommitmentFromTrace },
                stb,
                {
                  fullTrace2,
                  commitmentProgress,
                  latestEventCommits,
                  chunkVars,
                  getPhysicalChunkOutputBase,
                  eventCount,
                  emitInfos,
                  eventBlockLayout,
                  probeBuilder2,
                  transaction2,
                  sourceOutputs2,
                  delegatecallInputIndex,
                  iter,
                  phaseCheckpoint
                }
              );
              commitmentProgress = appliedEvents.commitmentProgress;
              latestEventCommits = appliedEvents.latestEventCommits;
            }
            {
              const appliedTransfers = deriveFullPhase2ApplyTransfersImpl(
                { parseNftCapability },
                stb,
                {
                  fullTrace2,
                  satoshiTransferCount,
                  ftOps,
                  nftOps,
                  dummyLbc,
                  delegatecallInputIndex,
                  derivedTransfers,
                  derivedFtTransfers,
                  derivedNftTransfers,
                  satoshiAmountsFullyDerived,
                  ftAmountsFullyDerived,
                  phaseCheckpoint
                }
              );
              derivedTransfers = appliedTransfers.derivedTransfers;
              derivedFtTransfers = appliedTransfers.derivedFtTransfers;
              derivedNftTransfers = appliedTransfers.derivedNftTransfers;
              satoshiAmountsFullyDerived = appliedTransfers.satoshiAmountsFullyDerived;
              ftAmountsFullyDerived = appliedTransfers.ftAmountsFullyDerived;
            }
            const {
              convergenceKey,
              anyProbeHadError,
              needsPassingProbe
            } = deriveFullPhase2ConvergenceImpl(
              stb,
              {
                commitmentProgress,
                derivedAState,
                chunkVars,
                derivedTransfers,
                derivedFtTransfers,
                derivedNftTransfers,
                stateCommits,
                latestEntryCommits,
                latestEventCommits,
                latestLoopEntryCommits,
                faithfulProbeHadError,
                nestedProbeHadError,
                nestedPinProgress,
                runtimeLoopTransferBytecodesDerived,
                runtimeLoopTransferAmountsDerived,
                runtimeLoopTransferCommitmentsDerived,
                runtimeLoopTransferCapabilitiesDerived,
                fullTrace2,
                iter,
                debugTargetsThisDerivation,
                debugIterationStartedAt,
                phaseCheckpoint
              }
            );
            if (!anyProbeHadError && nestedPinProgress === 0) break;
            if (convergenceKey === prevConvergenceKey && (!needsPassingProbe || !anyProbeHadError)) break;
            if (seenConvergenceKeys.has(convergenceKey) && (!needsPassingProbe || !anyProbeHadError)) {
              throw new AutoDerivationError(
                "Auto-derivation oscillation detected: derivation state is cycling without converging. This may indicate conflicting covenant constraints."
              );
            }
            seenConvergenceKeys.add(convergenceKey);
            prevConvergenceKey = convergenceKey;
          } finally {
            if (phase2ParamSnap) {
              stb.restoreBuilderReturnOutputParams(probeBuilder2, phase2ParamSnap, phase2Insertion);
            }
          }
        }
        {
          const cleaned = deriveFullPhase2CleanedRescanImpl(
            {
              categoryId: this.categoryId,
              inner: this.inner
            },
            stb,
            {
              configuredDebugIterations,
              debugTargetsThisDerivation,
              dummyLbc,
              delegatecallInputIndex,
              lastTrace,
              lastFailProbeOutputs,
              retainDiagnosticTrace,
              emitInfos,
              eventBlockLayout
            }
          );
          lastTrace = cleaned.lastTrace;
          lastFailProbeOutputs = cleaned.lastFailProbeOutputs;
        }
        const lastStep = lastTrace?.[lastTrace.length - 1];
        const vmHadError = !!(lastStep && lastStep.error);
        const deriveDebugEnv = globalThis.process?.env;
        if (vmHadError && deriveDebugEnv?.SOLIDC_DEBUG_DERIVE_FAIL_SUMMARY === "1") {
          const failInputs = stb.build().inputs;
          const executedInputIndex = delegatecallInputIndex ?? 0;
          const executedUnlocker = failInputs[executedInputIndex]?.unlocker;
          console.error("derive-fail-summary", {
            ip: lastStep.ip,
            executedInputIndex,
            executedFunction: executedUnlocker?.abiFunction?.name
          });
        }
        if (vmHadError && (deriveDebugEnv?.SOLIDC_DEBUG_CHUNK_SCAN === "1" || deriveDebugEnv?.SOLIDC_DEBUG_DERIVE_FAIL === "1")) {
          const failIp = lastStep.ip;
          const stack = lastStep.stack ?? [];
          const failingInstructions = lastStep.instructions ?? [];
          const failOutputs = lastFailProbeOutputs ?? stb.build().outputs;
          const failInputs = stb.build().inputs;
          const rebuiltOutputs = stb.build().outputs;
          const executedInputIndex = delegatecallInputIndex ?? 0;
          const executedUnlocker = failInputs[executedInputIndex]?.unlocker;
          const debugFunction = deriveDebugEnv?.SOLIDC_DEBUG_DERIVE_FAIL_FUNCTION;
          const debugMinIp = Number(deriveDebugEnv?.SOLIDC_DEBUG_DERIVE_FAIL_MIN_IP ?? 0);
          const recent = (lastTrace ?? []).slice(-16).map((step) => {
            const state = step;
            const opcode = state.instructions?.[state.ip ?? -1]?.opcode;
            const data = state.instructions?.[state.ip ?? -1]?.data;
            return {
              ip: state.ip,
              op: opcode,
              data: data ? binToHex(data).slice(0, 24) : void 0,
              top: (state.stack ?? []).slice(-6).map((item) => {
                const hex = binToHex(item);
                return hex.length === 0 ? "\u2205" : hex.slice(0, 24);
              })
            };
          });
          if (deriveDebugEnv?.SOLIDC_DEBUG_DERIVE_FAIL === "1" && (!debugFunction || executedUnlocker?.abiFunction?.name === debugFunction) && (failIp ?? 0) >= debugMinIp) console.error("derive-fail-last", {
            ip: failIp,
            error: lastStep.error,
            executedInputIndex,
            executedContract: executedUnlocker?.contract?.artifact?.contractName,
            executedFunction: executedUnlocker?.abiFunction?.name,
            executedTopologyArgs: executedUnlocker?.abiFunction?.inputs.flatMap((input, index) => isSdkResolvedExternalCallTopologyWitness(input.name) ? [{ name: input.name, value: String(executedUnlocker.params?.[index]) }] : []),
            failOutputsSource: lastFailProbeOutputs ? "live-probe" : "stb-rebuild",
            suffixOutputs: failOutputs.slice(-8).map((output, offset) => ({
              index: failOutputs.length - 8 + offset,
              lock: output?.to instanceof Uint8Array ? binToHex(output.to).slice(0, 24) : typeof output?.to === "string" ? output.to.slice(0, 24) : String(output?.to ?? ""),
              cap: output?.token?.nft?.capability,
              commit: String(output?.token?.nft?.commitment ?? "").slice(0, 32)
            })),
            headOutputs: failOutputs.slice(0, 12).map((output, index) => ({
              index,
              lock: output?.to instanceof Uint8Array ? binToHex(output.to).slice(0, 24) : typeof output?.to === "string" ? output.to.slice(0, 24) : String(output?.to ?? ""),
              cap: output?.token?.nft?.capability,
              commit: String(output?.token?.nft?.commitment ?? "").slice(0, 72),
              hasToken: !!output?.token
            })),
            headInputs: failInputs.slice(0, 12).map((input, index) => ({
              index,
              lock: (() => {
                const unlocker = input.unlocker;
                const lock = unlocker?.generateLockingBytecode?.();
                return lock ? binToHex(lock).slice(0, 24) : void 0;
              })(),
              cap: input.token?.nft?.capability,
              commit: String(input.token?.nft?.commitment ?? "").slice(0, 72),
              hasToken: !!input.token
            })),
            outputCount: failOutputs.length,
            // The identity-anchor witnesses are INPUT coordinates the covenant verifies in place, so the frame the
            // probe evaluated is only readable if each one is paired with what actually sits there.
            executedAnchorArgs: executedUnlocker?.abiFunction?.inputs.flatMap((input, index) => /extcallAnchorIdx/i.test(input.name) ? [{
              name: input.name,
              value: String(executedUnlocker.params?.[index]),
              inputAt: (() => {
                const raw = executedUnlocker.params?.[index];
                const at = typeof raw === "bigint" ? Number(raw) : typeof raw === "number" ? raw : typeof raw === "string" && raw !== "" ? Number(raw) : -1;
                if (at < 0 || at >= failInputs.length) return void 0;
                const unlocker = failInputs[at].unlocker;
                const lock = unlocker?.generateLockingBytecode?.();
                return {
                  index: at,
                  lock: lock ? binToHex(lock).slice(0, 24) : void 0,
                  cap: failInputs[at]?.token?.nft?.capability,
                  commit: String(failInputs[at]?.token?.nft?.commitment ?? "").slice(0, 32)
                };
              })()
            }] : []),
            executedReturnOutputArgs: executedUnlocker?.abiFunction?.inputs.flatMap((input, index) => /ReturnOutputIdx/i.test(input.name) ? [{
              name: input.name,
              value: String(executedUnlocker.params?.[index]),
              commitAt: (() => {
                const raw = executedUnlocker.params?.[index];
                const outIdx = typeof raw === "bigint" ? Number(raw) : typeof raw === "number" ? raw : typeof raw === "string" && raw !== "" ? Number(raw) : -1;
                if (outIdx < 0 || outIdx >= failOutputs.length) return void 0;
                return String(failOutputs[outIdx]?.token?.nft?.commitment ?? "");
              })(),
              rebuildCommitAt: (() => {
                const raw = executedUnlocker.params?.[index];
                const outIdx = typeof raw === "bigint" ? Number(raw) : typeof raw === "number" ? raw : typeof raw === "string" && raw !== "" ? Number(raw) : -1;
                if (outIdx < 0 || outIdx >= rebuiltOutputs.length) return void 0;
                return String(rebuiltOutputs[outIdx]?.token?.nft?.commitment ?? "");
              })()
            }] : []),
            stackLength: stack.length,
            stackTop: stack.slice(-8).map((item) => binToHex(item).slice(0, 40)),
            stackIndexed: stack.slice(-64).map((item, index) => ({
              depth: Math.min(63, stack.length - 1) - index,
              length: item.length,
              value: binToHex(item)
            })),
            instructionWindow: failingInstructions.slice(Math.max(0, (failIp ?? 0) - 32), (failIp ?? 0) + 2).map((instruction, offset) => ({
              ip: Math.max(0, (failIp ?? 0) - 32) + offset,
              op: instruction.opcode,
              data: instruction.data ? binToHex(instruction.data) : void 0
            })),
            recent,
            localWindow: (lastTrace ?? []).filter((step) => {
              const ip = step.ip;
              return ip !== void 0 && failIp !== void 0 && Math.abs(ip - failIp) <= 16;
            }).map((step) => {
              const state = step;
              const instruction = state.instructions?.[state.ip ?? -1];
              return {
                frame: state.instructions?.length,
                ip: state.ip,
                op: instruction?.opcode,
                data: instruction?.data ? binToHex(instruction.data) : void 0,
                stack: (state.stack ?? []).slice(-8).map((item) => `${item.length}:${binToHex(item)}`)
              };
            }),
            selectedWindow: (lastTrace ?? []).filter((step) => {
              const ip = step.ip;
              const from = Number(deriveDebugEnv?.SOLIDC_DEBUG_DERIVE_TRACE_FROM_IP ?? Number.NaN);
              const to = Number(deriveDebugEnv?.SOLIDC_DEBUG_DERIVE_TRACE_TO_IP ?? Number.NaN);
              return ip !== void 0 && Number.isFinite(from) && Number.isFinite(to) && ip >= from && ip <= to;
            }).map((step) => {
              const state = step;
              const instruction = state.instructions?.[state.ip ?? -1];
              return {
                frame: state.instructions?.length,
                ip: state.ip,
                op: instruction?.opcode,
                data: instruction?.data ? binToHex(instruction.data) : void 0,
                stack: (state.stack ?? []).slice(-32).map((item) => `${item.length}:${binToHex(item)}`)
              };
            }),
            band: stb.getChunkableValueWriteBand(),
            groups: stb.getExternalCallUtxoGroups().map((group, index) => ({
              index,
              fn: group.logicalFunctionName ?? group.functionName,
              ret: group.returnOutputIndex,
              chunks: group.valueChunkOutputCount
            })),
            around: [
              5,
              6,
              7,
              8,
              9,
              10,
              11,
              12,
              13,
              14,
              15,
              18,
              20,
              21,
              22,
              23,
              24,
              25,
              26,
              27,
              28,
              29,
              30,
              31
            ].map((index) => {
              const output = failOutputs[index];
              const input = failInputs[index];
              return {
                index,
                inLock: input?.unlocker?.generateLockingBytecode ? binToHex(input.unlocker.generateLockingBytecode()).slice(0, 20) : "",
                inCap: input?.token?.nft?.capability ?? (input ? "plain" : "missing"),
                inCat: String(input?.token?.category ?? "").slice(0, 8),
                lock: output ? (output.to instanceof Uint8Array ? binToHex(output.to) : String(output.to)).slice(0, 20) : "",
                cap: output?.token?.nft?.capability ?? (output ? "plain" : "missing"),
                cat: String(output?.token?.category ?? "").slice(0, 8),
                commit: String(output?.token?.nft?.commitment ?? "").slice(0, 20)
              };
            }),
            outputTail: failOutputs.slice(-12).map((output, offset) => ({
              i: failOutputs.length - 12 + offset,
              lock: (output.to instanceof Uint8Array ? binToHex(output.to) : String(output.to)).slice(0, 16),
              cap: output.token?.nft?.capability ?? "-",
              cat: output.token?.category?.slice(0, 8),
              commit: (() => {
                const raw = String(output.token?.nft?.commitment ?? "");
                const isViewPad = output.to instanceof Uint8Array && output.to.length === 1 && output.to[0] === 81 && output.token?.nft?.capability === "none";
                return isViewPad ? raw : raw.slice(0, 20);
              })()
            }))
          });
        }
        const derivationError = vmHadError ? new Error((() => {
          const raw = lastStep.error;
          const detail = typeof raw === "string" ? raw : raw && typeof raw === "object" && "error" in raw ? String(raw.error) : String(raw);
          const ip = lastStep.ip;
          const opcode = lastStep.instructions?.[ip ?? -1]?.opcode;
          const executedInputIndex = delegatecallInputIndex ?? 0;
          const executedUnlocker = stb.build().inputs[executedInputIndex]?.unlocker;
          const artifactCandidates = [
            executedUnlocker?.contract?.artifact,
            ...stb.getLowLevelCallUtxoGroups().map((group) => group.externalContract?.inner?.artifact),
            ...stb.getExternalCallUtxoGroups().map((group) => group.externalContract?.inner?.artifact),
            this.inner.artifact
          ];
          const selector = executedUnlocker?.abiFunction?.selector ?? artifactCandidates.flatMap((artifact) => artifact?.abi ?? []).find((fn) => fn.name === executedUnlocker?.abiFunction?.name)?.selector;
          const logicalFunctionNames = [
            executedUnlocker?.abiFunction?.name,
            ...stb.getLowLevelCallUtxoGroups().flatMap((group) => [
              group.logicalFunctionName,
              group.functionName,
              group.compilerRoute?.abiFunction?.name
            ]),
            ...stb.getExternalCallUtxoGroups().flatMap((group) => [
              group.logicalFunctionName,
              group.functionName,
              group.compilerRoute?.abiFunction?.name
            ])
          ].filter((name) => !!name);
          const activeInstructions = lastStep;
          const activeBodyHex = activeInstructions.instructions !== void 0 ? binToHex(encodeAuthenticationInstructions(activeInstructions.instructions)) : void 0;
          const requireMessage = probeRequireMessage(
            artifactCandidates,
            selector,
            ip,
            logicalFunctionNames,
            activeBodyHex
          );
          return `VM failed at ip ${ip ?? "?"}${opcode !== void 0 ? ` opcode ${opcode}` : ""}: ${detail}; input ${executedInputIndex}${requireMessage ? `; require: ${requireMessage}` : ""}`;
        })()) : void 0;
        if (globalThis.process?.env?.SOLIDC_DEBUG_RETURN_SNAPSHOT === "1") {
          console.error("derive-return-events-complete", stb.getReturnEventOutputs().map((event) => ({
            identity: event.identity,
            categoryId: event.categoryId,
            commitment: binToHex(event.commitment)
          })));
        }
        if (vmHadError) {
          const satoshiBytecodesFull = derivedTransfers ? derivedTransfers.every((t) => binToHex(t.lockingBytecode) !== binToHex(dummyLbc)) : false;
          if (derivedTransfers && (!satoshiAmountsFullyDerived || !satoshiBytecodesFull)) {
            stb.clearTransfers();
            for (let i = 0; i < satoshiTransferCount; i++) stb.addTransfer(dummyLbc, 1000n);
            derivedTransfers = void 0;
          }
          const ftBytecodesFull = derivedFtTransfers ? derivedFtTransfers.every((t) => binToHex(t.lockingBytecode) !== binToHex(dummyLbc)) : false;
          if (derivedFtTransfers && (!ftAmountsFullyDerived || !ftBytecodesFull)) {
            stb.clearTokenContainerTransfers();
            for (const op of ftOps) {
              stb.addTokenContainerTransfer(op.categoryId, dummyLbc, 1n, op.outputSlot);
            }
            derivedFtTransfers = void 0;
          }
          const nftBytecodesFull = derivedNftTransfers ? derivedNftTransfers.every((t) => binToHex(t.lockingBytecode) !== binToHex(dummyLbc)) : false;
          if (derivedNftTransfers && !nftBytecodesFull) {
            stb.clearTokenContainerTransferNfts();
            for (const op of nftOps) {
              const inputNft = stb.getTokenContainerInfos().find((container) => container.tokenContainerCategoryId === op.categoryId)?.utxo?.token?.nft;
              stb.addTokenContainerTransferNft(
                op.categoryId,
                dummyLbc,
                hexToBin(inputNft?.commitment ?? ""),
                inputNft?.capability ?? "none",
                op.outputSlot
              );
            }
            derivedNftTransfers = void 0;
          }
        }
        if (!derivedAState) {
          const currentState = {};
          const onChainState2 = currentStateSnapshot ?? (await this.getFullState()).state;
          for (const v of stateLayout.variables) {
            const seeded = stb.stateUpdate(v.name);
            if (seeded !== void 0) {
              currentState[v.name] = seeded;
              continue;
            }
            if (onChainState2[v.name] !== void 0) {
              currentState[v.name] = onChainState2[v.name];
              stb.setState(v.name, onChainState2[v.name]);
            }
          }
          reconcileReturnWitnesses();
          return {
            state: currentState,
            vmErrored: vmHadError,
            derivationError,
            derivedTransfers,
            derivedTokenContainerTransfers: derivedFtTransfers,
            derivedTokenContainerTransferNfts: derivedNftTransfers
          };
        }
        const onChainState = currentStateSnapshot ?? (await this.getFullState()).state;
        for (const variable of stateLayout.variables) {
          if (derivedAState[variable.name] !== void 0) continue;
          const seeded = stb.stateUpdate(variable.name);
          if (seeded !== void 0) {
            derivedAState[variable.name] = seeded;
            continue;
          }
          if (onChainState[variable.name] !== void 0) {
            derivedAState[variable.name] = onChainState[variable.name];
            stb.setState(variable.name, onChainState[variable.name]);
          }
        }
        reconcileReturnWitnesses();
        return {
          state: derivedAState,
          vmErrored: vmHadError,
          derivationError,
          derivedTransfers,
          derivedTokenContainerTransfers: derivedFtTransfers,
          derivedTokenContainerTransferNfts: derivedNftTransfers
        };
      } catch (e) {
        if (["1"].includes(globalThis.process?.env?.SOLIDC_DEBUG_ROUTE_CONCISE ?? "")) {
          console.error("full-state-derivation-error", e);
        }
        if (e instanceof AutoDerivationError) throw e;
        throw new AutoDerivationError(
          `Full state derivation failed: ${e instanceof Error ? e.message : String(e)}`,
          e instanceof Error ? e : void 0
        );
      }
    } catch (e) {
      if (e instanceof AutoDerivationError) {
        return { state: void 0, vmErrored: true, derivationError: e };
      }
      throw e;
    } finally {
      if (probeDelegate?.refreshInternalArgs && Object.keys(restoreProbeWitnesses).length > 0) {
        probeDelegate.refreshInternalArgs(restoreProbeWitnesses, { shiftPredOut: false });
        stb._refreshInputs();
      }
    }
  }
  /**
   * Supply the keys for a sorted `enumerable mapping` KEYS/ENTRIES iteration. Required for such iterations (the
   * raw key is not on-chain). Order is irrelevant - the SDK orders them to the chain and the covenant verifies
   * keyToSlot(key) == each entry's slot.
   */
  setIterationKeys(collectionName, keys) {
    (this._iterationKeys ??= /* @__PURE__ */ new Map()).set(collectionName, keys);
    return this;
  }
  /**
   * @internal Test hook: supply the KEYS/ENTRIES keys blob verbatim, bypassing the honest slot-matching, to
   * exercise the covenant's key-verify backstop against a malicious spender (a key that does not hash to its
   * entry's slot must revert).
   */
  _setRawIterationKeysBlob(collectionName, blob) {
    (this._rawIterationKeysBlob ??= /* @__PURE__ */ new Map()).set(collectionName, blob);
    return this;
  }
  /**
   * @internal Test hook: supply the windowed-iteration entry co-spend verbatim, bypassing the cursor-based
   * window planner, to exercise the covenant's anchor-slot pin and contiguity backstops against a malicious
   * spender (a wrong anchor or a skipped entry must revert at the VM).
   */
  _setRawWindowUtxos(collectionName, utxos) {
    (this._rawWindowUtxos ??= /* @__PURE__ */ new Map()).set(collectionName, utxos);
    return this;
  }
  /** @internal Test hook: override a derived atomic-batch witness to exercise covenant rejection paths. */
  _setRawVMapBatchWitness(slotIndex, witness) {
    (this._rawVMapBatchWitness ??= /* @__PURE__ */ new Map()).set(slotIndex, witness);
    return this;
  }
  /** @internal - compute total output count for sentinel index when draining */
  /** @internal */
  /** @internal Address representations accepted by address-keyed mapping storage. */
  _addressMappingKeyCandidates(addressValue) {
    return addressMappingKeyCandidatesImpl(
      { provider: this.inner.provider },
      addressValue
    );
  }
  /** Validate one Solidity-visible ABI frame without starting provider, state, or route work. */
  _validateAbiFrame(abiFunction, args, options = {}) {
    const visibleInputs = abiFunction.inputs.filter((input) => !input.name.startsWith("__internal__"));
    const implicitCallerInputs = options.implicitMsgSenderCategory && abiFunction.name === "__message_bus1" && abiFunction.inputs.some((input) => input.name === "__internal__msgSenderCategory") ? abiFunction.inputs.filter((input) => input.name !== "__internal__msgSenderCategory") : void 0;
    if (args.length !== visibleInputs.length && args.length !== abiFunction.inputs.length && args.length !== implicitCallerInputs?.length) {
      throw new Error(
        `Incorrect number of arguments passed to function ${abiFunction.name}. Expected ${visibleInputs.length} arguments (${visibleInputs.map((input) => input.type)}) but got ${args.length}`
      );
    }
    const frameInputs = args.length === abiFunction.inputs.length ? abiFunction.inputs : args.length === implicitCallerInputs?.length ? implicitCallerInputs : visibleInputs;
    const normalized = args.map((arg, index) => {
      if (this.inner.artifact.compiler?.options?.evmCompat === true) {
        const bytes = normalizeSolidityBytesArgument(arg, frameInputs[index]?.type ?? "");
        if (bytes !== arg) return bytes;
      }
      if (frameInputs[index]?.type !== "address") return arg;
      const addressArg = typeof arg === "object" && arg !== null && !(arg instanceof Uint8Array) && typeof arg.address === "string" ? arg.address : arg;
      if (typeof addressArg !== "string") return addressArg;
      const registered = registeredValueAddressLockingBytecode(this.inner.provider, addressArg);
      if (registered !== void 0) return registered;
      return tryCashAddressToLockScript(addressArg) ?? addressArg;
    });
    const structs = this.inner.artifact.structs ?? this.inner.artifact.stateLayout?.structs;
    frameInputs.forEach((input, index) => {
      encodeFunctionArgument(normalized[index], input.type, structs);
    });
    return normalized;
  }
  /** Resolve the ABI entry selected by a named low-level stateful call's visible argument frame. */
  _resolveCallAbi(functionName, args) {
    const abi = this.inner.artifact.abi;
    const explicit = abi.find((candidate) => canonicalAbiFunctionSignature(candidate) === functionName);
    if (explicit) return explicit;
    const sameName = abi.filter((candidate) => candidate.name === functionName);
    const arityMatched = sameName.filter((candidate) => candidate.inputs.filter((input) => !input.name.startsWith("__internal__")).length === args.length);
    if (arityMatched.length === 1) return arityMatched[0];
    return sameName.length === 1 ? sameName[0] : void 0;
  }
  async _createBuilder(functionName, args, overrides) {
    const callerArgs = [...args];
    const physicalAbiFunction = this.inner.artifact.abi.find((f) => f.name === functionName);
    let abiFunction = overrides?.abiFunction ?? physicalAbiFunction;
    const refusedName = `${this.inner.artifact.contractName}.${abiFunction?.name ?? functionName}()`;
    const refusal = this.inner.artifact.refusedFunctions?.find((entry) => entry.functionName === refusedName);
    if (refusal !== void 0) throw new Error(`${refusedName} is refused by the compiler: ${refusal.reason}`);
    if (abiFunction) args = this._validateAbiFrame(abiFunction, args, {
      implicitMsgSenderCategory: overrides?.compilerRouteSelector !== void 0
    });
    const valueChunkWriteStagingSession = new ValueChunkWriteStagingSession();
    for (const production of overrides?.valueChunkProductions ?? []) {
      if (!valueChunkWriteStagingSession.stageOwned(
        production.write,
        production.claim,
        production.stateOwner,
        production.value
      )) {
        throw new Error("Compiler-authenticated value production could not be staged for its exact resource.");
      }
    }
    const timingEnabled = globalThis.process?.env?.SOLIDC_DEBUG_BUILDER_TIMING === "1";
    const startedAt = Date.now();
    const timing = (stage) => {
      if (timingEnabled) console.error("builder-timing", { functionName, stage, ms: Date.now() - startedAt });
    };
    const isComposedRoute = overrides?.calls?.some((call) => call.type === "stateful") === true;
    const earlySignerUtxos = overrides?.signerUtxos ?? ((isComposedRoute || functionName === "__forward") && this._signer ? await signerUtxoSnapshot(this._signer) : void 0);
    await this._ensureResolved();
    const { resolveSatoshiContainerRouteAbi } = await import("../message-bus/selected-satoshi-container.js");
    abiFunction = await resolveSatoshiContainerRouteAbi(abiFunction, this);
    const mockStorage = this.inner.provider.indexer?.storage;
    const syncMockParticipantOracle = async (contract) => {
      if (!mockStorage?._test) return;
      const registered = findDeploymentByLockingBytecode(
        this.inner.provider,
        contract.inner.lockingBytecode
      );
      if (!registered) return;
      const { syncMockBlockOracleDeployment } = await import("../oracle/legacy-block-registers.js");
      await syncMockBlockOracleDeployment(this.inner.provider, registered);
    };
    if (functionName !== "__updateBlockOracle") await syncMockParticipantOracle(this);
    const stateLayout = this.inner.stateLayout;
    if (mockStorage?._test) {
      const participants = /* @__PURE__ */ new Set();
      for (const call of abiFunction?.externalCalls ?? []) {
        const registered = this._externalRegistry.get(call.interfaceName) ?? findDeploymentByName(this.inner.provider, call.interfaceName)?.contract ?? (/^I[A-Z]/.test(call.interfaceName) ? findDeploymentByName(this.inner.provider, call.interfaceName.slice(1))?.contract : void 0);
        if (registered) participants.add(registered);
      }
      for (const call of overrides?.externalCalls ?? []) participants.add(call.externalContract);
      for (const call of overrides?.calls ?? []) {
        if (call.type === "stateful") participants.add(call.contract);
      }
      await Promise.all([...participants].map(syncMockParticipantOracle));
    }
    const registeredSelf = findDeploymentByAddress(this.inner.provider, this.target);
    const executionSelfAddress = hexToBin(
      registeredSelf ? registeredExecutionLockingBytecode(registeredSelf) ?? this.inner.lockingBytecode : this.inner.lockingBytecode
    );
    const registeredSelfAddress = registeredSelf?.lockingBytecode ? hexToBin(registeredSelf.lockingBytecode) : hexToBin(this.inner.lockingBytecode);
    const authenticatedSelfAddress = registeredSelfAddress;
    const storedLogicalLock = this._logicalAddress === void 0 ? void 0 : addressToLockScript(this._logicalAddress);
    const logicalCreateLock = storedLogicalLock !== void 0 && binToHex(storedLogicalLock).toLowerCase() !== binToHex(authenticatedSelfAddress).toLowerCase() ? storedLogicalLock : void 0;
    const authenticatesOwnSelf = usesOrdinarySelfIdentity(abiFunction) && !compilerRouteUsesPhysicalWrapper(overrides?.compilerRouteSelector, physicalAbiFunction, abiFunction);
    const publicSelfAddress = authenticatesOwnSelf && logicalCreateLock !== void 0 ? logicalCreateLock : authenticatedSelfAddress;
    const childSeesLogicalSelf = this._framedAddress === void 0 && this._framedProxyAddress === void 0 && registeredSelf?.contract?.implementation === void 0 && routeAuthenticatesPublicSelf(this.inner.artifact);
    const publicSelfIdentity = Object.freeze({
      categoryId: this.categoryId,
      lockingBytecode: binToHex(childSeesLogicalSelf && logicalCreateLock !== void 0 ? logicalCreateLock : authenticatedSelfAddress)
    });
    const requiredNftIndices = abiFunction?.requiredNftIndices ?? Array.from({ length: stateLayout.dataNftCount }, (_, i) => i);
    const onChainState = await loadCreateBuilderOnChainStateImpl(
      {
        getFullState: () => this.getFullState(),
        getMasterOnlyState: () => this._getMasterOnlyState()
      },
      requiredNftIndices,
      abiFunction
    );
    this._activeMappingEntryUtxos = onChainState.entryNftUtxos ?? [];
    timing("state-loaded");
    const statefulCall = (name) => functionName === name ? args : overrides?.calls?.find((call) => call.type === "stateful" && call.functionName === name)?.args;
    let topLevelVmapProofUtxos = /* @__PURE__ */ new Map();
    const {
      masterUtxo,
      derivationMasterUtxo,
      filteredDataNftUtxos
    } = resolveCreateBuilderMasterAndDataNftsImpl({
      functionName,
      categoryId: this.categoryId,
      requiredNftIndices,
      onChainState,
      overrides
    });
    let finalArgs = [...args];
    const vmapMaterialized = await materializeCreateBuilderVmapPermutationsImpl(
      {
        hydrateExternalPredicateState: (...a) => this._hydrateExternalPredicateState(...a),
        evaluateExternalExpression: (...a) => this._evaluateExternalExpression(...a),
        vmapCounterDomain: (...a) => this._vmapCounterDomain(...a)
      },
      abiFunction,
      this.inner.artifact,
      args,
      finalArgs,
      onChainState.state,
      executionSelfAddress
    );
    args = vmapMaterialized.args;
    finalArgs = vmapMaterialized.finalArgs;
    const earlyArgsHost = {
      getExternalTargetEntriesByInterface: (interfaceName) => this.inner.getExternalTargetEntriesByInterface(interfaceName)
    };
    const earlyArgs = await materializeCreateBuilderEarlyArgsImpl(
      earlyArgsHost,
      functionName,
      abiFunction,
      finalArgs,
      overrides
    );
    finalArgs = earlyArgs.finalArgs;
    let returnEmitOutputIndex = earlyArgs.returnEmitOutputIndex;
    let returnMaterializationOutputIndex = earlyArgs.returnMaterializationOutputIndex;
    const returnAbiFunction = earlyArgs.returnAbiFunction;
    let returnEmitBlockOffset = earlyArgs.returnEmitBlockOffset;
    const resolvedMsgSenderCategory = earlyArgs.resolvedMsgSenderCategory;
    let {
      entryAccesses,
      entryAbiFunction,
      entryArtifact,
      entryArgs,
      entryCompilerRoute
    } = resolveCreateBuilderEntryAbiImpl(
      abiFunction,
      args,
      this.inner.artifact,
      overrides?.calls ?? []
    );
    const oraclePool = entryArtifact.usesBlockOracle !== true ? void 0 : entryArtifact === this.inner.artifact ? this.inner.oraclePool : artifactOraclePool(entryArtifact) ?? this.inner.oraclePool;
    const oracleClock = oraclePool === void 0 ? void 0 : await readPoolClock(this.inner.provider, oraclePool);
    const recipeState = oracleClock === void 0 ? onChainState.state : {
      ...onChainState.state,
      __block_timestamp: oracleClock.timestamp,
      __block_number: oracleClock.number
    };
    const selectedRouteRows = entryAbiFunction?.messageBusRowArguments ?? entryCompilerRoute?.rowArguments ?? [];
    const internalReadCarrierCapability = kernelReadCarrierCapabilityForSelectedRoute(
      kernelEntryJournalReadCarrierCapabilityFromArtifact(entryArtifact),
      entryCompilerRoute,
      selectedRouteRows,
      entryAbiFunction,
      entryArtifact,
      entryCompilerRoute?.blob ?? (() => {
        const batchBlobIndex = entryAbiFunction?.inputs.findIndex((input) => input.name === "batchBlob") ?? -1;
        const candidate = batchBlobIndex < 0 ? void 0 : entryArgs[batchBlobIndex];
        return candidate instanceof Uint8Array ? candidate : void 0;
      })()
    );
    const selectedUpsertRows = selectedRouteRows.filter((row) => (row.handler.sortedUpsertLoopInfo?.length ?? 0) > 0);
    const plannedUpsertRows = selectedUpsertRows;
    const upsertPlanningFrames = selectedUpsertRows.length > 0 ? plannedUpsertRows.map((row) => ({
      abiFunction: row.handler,
      args: row.args,
      routed: true,
      row
    })) : (entryAbiFunction?.sortedUpsertLoopInfo?.length ?? 0) > 0 ? [{ abiFunction: entryAbiFunction, args: entryArgs, routed: false, row: void 0 }] : [];
    const selectedJournalHandlers = internalReadCarrierCapability && selectedRouteRows.length > 0 ? selectedRouteRows.map((row) => row.handler) : entryAbiFunction ? [entryAbiFunction] : [];
    const authenticatedKernelJournalDispositions = internalReadCarrierCapability ? kernelJournalDispositionsFromArtifact(entryArtifact) : void 0;
    const authenticatedDispositionSelection = authenticatedKernelJournalDispositions ? planAuthenticatedKernelJournalDispositionChain(
      authenticatedKernelJournalDispositions,
      selectedJournalHandlers,
      []
    ) : void 0;
    const deferRuntimeJournalMaterialization = authenticatedDispositionSelection?.deferRuntimeJournalMaterialization ?? shouldDeferKernelJournalBatchMaterialization(
      internalReadCarrierCapability,
      selectedJournalHandlers
    );
    if (entryAbiFunction && entryAbiFunction.messageBusConvention === "kernel-row-loop") {
      assertConstructedKeyVectorRouteBinding(entryAbiFunction.constructedKeyVectors, void 0);
    }
    let entryNfts = [];
    let entryValueWitnesses = /* @__PURE__ */ new Map();
    let entryBatchWitnesses = /* @__PURE__ */ new Map();
    const sortedInserts = [];
    let pendingEntryValueTails = [];
    const valueChunkMints = [];
    const loopValueChunkMints = [];
    const computedValueChunkRuns = [];
    const addComputedValueChunkRun = (collection, slot) => appendComputedValueChunkRun(computedValueChunkRuns, collection, slot);
    const computedValueUpdateCollections = /* @__PURE__ */ new Set();
    const runtimeLoopDerivedCounts = /* @__PURE__ */ new Map();
    const runtimeExpressionLoopCollections = /* @__PURE__ */ new Set();
    const valueChunkGc = [];
    const batchTargetSlots = /* @__PURE__ */ new Map();
    const batchTargetPlaceholders = /* @__PURE__ */ new Map();
    let exactBatchTargetSlots = /* @__PURE__ */ new Set();
    let batchPredCommitments = /* @__PURE__ */ new Map();
    const sortedNodeOwnerAlternatives = [];
    const runtimeMessageBusAliasSkipSlots = /* @__PURE__ */ new Set();
    const inactiveMessageBusEntrySlots = new Set(
      entryAbiFunction?.messageBusInactiveEntrySlots ?? []
    );
    if (globalThis.process?.env?.SOLIDC_DEBUG_COLLECTION_FETCH === "1") {
      console.error("message-bus-entry-meta", JSON.stringify({
        buildId: peekBuildId(),
        contract: this.inner.artifact.contractName,
        abiFunction: entryAbiFunction?.name,
        inactive: [...inactiveMessageBusEntrySlots],
        accesses: (entryAccesses ?? []).map((access) => [access.slotIndex, access.collection, access.operations])
      }));
    }
    const activeMessageBusWriteCollections = entryAbiFunction?.messageBusActiveWriteCollections;
    const activeMessageBusEntryOperations = entryAbiFunction?.messageBusActiveEntryOperations;
    const activeMessageBusEntryRecipes = entryAbiFunction?.messageBusActiveEntryRecipes;
    const entryAccessForSlot = (slotIndex) => entryAccessAt(entryAbiFunction, slotIndex);
    const inactiveDirectEntryWrites = /* @__PURE__ */ new Set();
    if (activeMessageBusEntryOperations === void 0 && selectedRouteRows.length === 0) {
      const { evaluateFixedEffectPredicate } = await import("../message-bus/message-bus.js");
      for (const [index, access] of (entryAccesses ?? []).entries()) {
        if (access.activation === void 0) continue;
        const active = evaluateFixedEffectPredicate(
          access.activation,
          entryArgs,
          onChainState.state
        );
        if (typeof active !== "boolean") {
          throw new Error(`Could not resolve fixed entry activation in '${entryAbiFunction?.name ?? functionName}'.`);
        }
        if (active) continue;
        const slotIndex = access.slotIndex ?? index;
        inactiveDirectEntryWrites.add(slotIndex);
      }
    }
    const entryOperations = (slotIndex) => activeMessageBusEntryOperations !== void 0 ? activeMessageBusEntryOperations.get(slotIndex) ?? [] : inactiveDirectEntryWrites.has(slotIndex) ? [.../* @__PURE__ */ new Set([
      ...(entryAccessForSlot(slotIndex)?.operations ?? []).filter((operation) => operation !== "write" && operation !== "delete"),
      "read"
    ])] : entryAccessForSlot(slotIndex)?.operations ?? [];
    const isSoleActiveFixedCollectionWrite = (collection, slotIndex) => !inactiveMessageBusEntrySlots.has(slotIndex) && (activeMessageBusWriteCollections === void 0 || activeMessageBusWriteCollections.includes(collection)) && !(entryAbiFunction?.sortedBatchInfo?.some((batch) => batch.collection === collection) ?? false) && !(entryAbiFunction?.sortedUpsertLoopInfo?.some((info) => info.collection === collection) ?? false) && !(entryAbiFunction?.sortedInsertLoopInfo?.some((info) => info.collection === collection) ?? false) && (entryAccesses ?? []).every((other, index) => (other.slotIndex ?? index) === slotIndex || other.collection !== collection || !entryOperations(other.slotIndex ?? index).some((operation) => operation === "write" || operation === "delete"));
    if (entryAccesses && entryAccesses.length > 0 && stateLayout.collections) {
      nextBuildId();
      const collEntryCache = /* @__PURE__ */ new Map();
      const collectionEntriesFor = async (sig, options) => {
        const hit = options?.fresh ? void 0 : collEntryCache.get(sig);
        if (hit) return hit;
        const addr = getEntryNftAddress(this.inner, this.categoryId, sig);
        const allFetched = await this.inner.provider.getUtxos(addr);
        const fetched = allFetched.filter((u) => u.token?.category === this.categoryId && u.token?.nft?.capability === "mutable" && !!u.token?.nft?.commitment && u.token.nft.commitment.length > 0);
        if (["SOLIDC_DEBUG_ROUTE_CONCISE", "SOLIDC_DEBUG_COLLECTION_FETCH"].some((name) => globalThis.process?.env?.[name] === "1")) {
          console.error("collection-entry-fetch", {
            contract: this.inner.artifact.contractName,
            categoryId: this.categoryId,
            signature: sig,
            address: addr,
            allCount: allFetched.length,
            matchedCount: fetched.length,
            commitments: allFetched.map((utxo) => {
              const commitment = utxo.token?.nft?.commitment;
              if (!commitment) return "";
              const hex = typeof commitment === "string" ? commitment : binToHex(commitment);
              return globalThis.process?.env?.SOLIDC_DEBUG_COLLECTION_FETCH === "1" ? `${hex.length / 2}:${hex}` : hex.slice(0, 64);
            })
          });
        }
        collEntryCache.set(sig, fetched);
        return fetched;
      };
      const keyMappingEntries = /* @__PURE__ */ new Map();
      const locallyWrittenCollections = new Set(entryAccesses.filter((access) => access.operations.includes("write") || access.operations.includes("delete")).map((access) => access.collection));
      for (const access of entryAccesses) {
        for (const source of access.keySources ?? []) {
          const effectiveLabel = source.postWriteExpressionLabel ?? source.expressionLabel;
          if (source.kind !== "expression" || !effectiveLabel) continue;
          for (const match of effectiveLabel.matchAll(/map:([A-Za-z_]\w*)\(/g)) {
            const name = match[1];
            const mapped = stateLayout.collections.find((candidate) => candidate.name === name && candidate.kind === "mapping");
            if (mapped && (!locallyWrittenCollections.has(name) || source.preWriteMappingCollections?.includes(name)) && !keyMappingEntries.has(name)) {
              keyMappingEntries.set(name, await this.getEntries(mapped.signature));
            }
          }
        }
      }
      const mappingKeyValue = (name, key, preWriteCollections) => {
        const mapped = stateLayout.collections?.find((candidate) => candidate.name === name && candidate.kind === "mapping");
        const entries = keyMappingEntries.get(name);
        if (!mapped || !entries || locallyWrittenCollections.has(name) && !preWriteCollections?.includes(name) || typeof key !== "bigint" && typeof key !== "boolean" && typeof key !== "string" && !(key instanceof Uint8Array)) return void 0;
        const entry = selectMappingEntryByKeys(
          entries,
          [key],
          mapped.keyTypes ?? [mapped.keyType],
          mapped
        );
        return entry?.value ?? getDefaultStateValue(mapped.valueType, stateLayout.structs);
      };
      const producerKeyAccesses = (entryAccesses ?? []).filter((access) => (access.keySources?.length ?? 0) === 1 && access.keySources?.[0].producer?.callsiteId !== void 0);
      if (producerKeyAccesses.length > 0) {
        const merged = new Map(overrides?.entryKeyOverrides ?? []);
        for (const access of producerKeyAccesses) {
          const slotIndex = access.slotIndex ?? 0;
          if (merged.has(slotIndex)) continue;
          const producer = access.keySources[0].producer;
          const expression = {
            kind: "producerResult",
            callsiteId: producer.callsiteId,
            resultIndex: producer.resultIndex
          };
          try {
            const returns = await this._resolveExternalExpressionReturns(
              [{ kind: "expression", expression }],
              entryArgs,
              this,
              onChainState.state,
              entryAbiFunction?.inputs,
              executionSelfAddress,
              entryAbiFunction?.externalCalls
            );
            const value = returns.get(JSON.stringify(expression));
            const encoded = value instanceof Uint8Array ? value : typeof value === "string" ? value.includes(":") ? addressToLockScript(value) : hexToBin(value) : void 0;
            if (encoded !== void 0) merged.set(slotIndex, encoded);
          } catch {
          }
        }
        overrides = { ...overrides ?? {}, entryKeyOverrides: merged };
      }
      const alternativeProducerValues = /* @__PURE__ */ new Map();
      {
        const producers = /* @__PURE__ */ new Map();
        for (const access of entryAccesses ?? []) {
          for (const alternative of access.alternatives ?? []) {
            for (const label of [alternative.activation, alternative.key]) {
              for (const match of (label ?? "").matchAll(/producer:(-?\d+):(\d+)/g)) {
                const callsiteId = Number(match[1]);
                const resultIndex = Number(match[2]);
                if (Number.isSafeInteger(callsiteId) && callsiteId >= 0 && Number.isSafeInteger(resultIndex)) {
                  producers.set(`${callsiteId}:${resultIndex}`, { callsiteId, resultIndex });
                }
              }
            }
          }
        }
        for (const [key, producer] of producers) {
          const expression = { kind: "producerResult", callsiteId: producer.callsiteId, resultIndex: producer.resultIndex };
          try {
            const returns = await this._resolveExternalExpressionReturns(
              [{ kind: "expression", expression }],
              entryArgs,
              this,
              onChainState.state,
              entryAbiFunction?.inputs,
              executionSelfAddress,
              entryAbiFunction?.externalCalls
            );
            const value = returns.get(JSON.stringify(expression));
            const encoded = value instanceof Uint8Array ? value : typeof value === "string" ? value.includes(":") ? addressToLockScript(value) : hexToBin(value) : void 0;
            if (encoded !== void 0) {
              alternativeProducerValues.set(key, addressToGraphEmissionBytes(encoded).slice(12));
            }
          } catch {
          }
        }
      }
      const valueWitnessBySlot = /* @__PURE__ */ new Map();
      const authenticatedCallerLock = overrides?.callerIdentityUtxos?.flatMap((utxo) => {
        const commitment = utxo.token?.nft?.commitment;
        if (!isScidIdentityCommitment(commitment)) return [];
        return [utxo.unlocker.generateLockingBytecode()];
      })[0] ?? overrides?.callerLockingBytecode;
      for (let accessIndex = 0; accessIndex < entryAccesses.length; accessIndex++) {
        const access = entryAccesses[accessIndex];
        const slotIndex = access.slotIndex ?? accessIndex;
        const collection = stateLayout.collections.find((c) => c.name === access.collection);
        if (!collection) {
          throw new Error(`Unknown collection: ${access.collection}`);
        }
        const hasChunkableValueWitness = collection.sorted && collection.chunkableValue && (entryOperations(slotIndex).includes("read") || entryOperations(slotIndex).includes("write"));
        const participatesInSortedBatch = entryAbiFunction?.sortedBatchInfo?.some(
          (batch) => batch.slotIndices.includes(slotIndex)
        ) ?? false;
        if (inactiveMessageBusEntrySlots.has(slotIndex) && !participatesInSortedBatch) {
          entryNfts.push({
            slotIndex,
            collection: access.collection,
            keyType: collection.keyType,
            valueType: collection.valueType,
            keyValue: 0n,
            exists: false
          });
          if (hasChunkableValueWitness) valueWitnessBySlot.set(slotIndex, new Uint8Array());
          continue;
        }
        const collectionEntries = await collectionEntriesFor(collection.signature);
        if (collection.sorted) {
          const list = SortedList.fromUtxos(collectionEntries);
          const describedState = {
            ...onChainState?.state ?? {}
          };
          if (globalThis.process?.env?.SOLIDC_DEBUG_ZERO_STATE === "1") {
            describedState.protocolFee = 0n;
            describedState.__block_timestamp = 0n;
          }
          const keyNames = access.keyParams.map((name, i) => access.keySources?.[i]?.paramName ?? name);
          const keyTypes = collection.keyTypes ?? [collection.keyType];
          const encodeKey = (paramName, keyType, ki) => {
            const source = access.keySources?.[ki];
            if (source?.kind === "constant") {
              return bigIntToVmNumber(BigInt(source.constantValue ?? "0"));
            }
            if (source?.kind === "msgSender") {
              if (authenticatedCallerLock !== void 0) return Uint8Array.from(authenticatedCallerLock);
              if (!this._signer) {
                throw new Error("A msg.sender/tx.origin-keyed sorted mapping requires a Signer (the sender funds via its native P2PKH input): connect one with StatefulContract.connect(signer).");
              }
              return addressToLockScript(this._signer.getAddress());
            }
            if (source?.kind === "stateArrayLast") {
              const values = onChainState.state[source.stateArrayName ?? ""];
              if (!Array.isArray(values) || values.length === 0) {
                throw new Error(`vmap key source '${source.stateArrayName}' has no last element`);
              }
              const value = values[values.length - 1];
              if (keyType === "address" && typeof value === "string" && value.includes(":")) {
                return addressToLockScript(value);
              }
              if (value instanceof Uint8Array) return value;
              if (typeof value === "bigint") return bigIntToVmNumber(value);
              if (typeof value === "boolean") return bigIntToVmNumber(value ? 1n : 0n);
              try {
                return encodePushdataValue(value, keyType, stateLayout.structs);
              } catch (cause) {
                throw new Error(
                  `Unsupported vmap state-array key value for '${source.stateArrayName}' (type ${keyType})`,
                  { cause }
                );
              }
            }
            if (source?.kind === "state") {
              const value = onChainState.state[source.stateVarName ?? ""];
              if (value === void 0) {
                throw new Error(`vmap key source state variable '${source.stateVarName}' is not present in state`);
              }
              if (keyType === "address" && typeof value === "string" && value.includes(":")) {
                return addressToLockScript(value);
              }
              if (value instanceof Uint8Array) return value;
              if (typeof value === "bigint") return bigIntToVmNumber(value);
              if (typeof value === "boolean") return bigIntToVmNumber(value ? 1n : 0n);
              try {
                return encodePushdataValue(value, keyType, stateLayout.structs);
              } catch (cause) {
                throw new Error(
                  `Unsupported vmap state key value for '${source.stateVarName}' (type ${keyType})`,
                  { cause }
                );
              }
            }
            if (source?.kind === "expression") {
              if (/^(?:call:_msgSender\(\)|nullop:msg\.sender)$/.test(source.expressionLabel ?? "")) {
                if (authenticatedCallerLock !== void 0) {
                  return Uint8Array.from(authenticatedCallerLock);
                }
                if (globalThis.process?.env?.SOLIDC_DEBUG_MSG_SENDER_KEY === "1") {
                  console.error("msg-sender-key-fallback", JSON.stringify({
                    functionName,
                    entryFunction: entryAbiFunction?.name,
                    slotIndex,
                    hasOverride: overrides?.callerLockingBytecode !== void 0,
                    stack: new Error("msg-sender-key").stack?.split("\n").slice(2, 9).map((line) => line.trim().replace(/\s*\(.*/, ""))
                  }));
                }
                const senderSigner = this._signer ?? this._logicalNonceSigner;
                if (!senderSigner) {
                  throw new Error("A msg.sender-keyed sorted mapping requires a connected Signer.");
                }
                if (globalThis.process?.env?.SOLIDC_DEBUG_MSG_SENDER_KEY === "1") {
                  const address = senderSigner.getAddress();
                  console.error("msg-sender-signer-identity", JSON.stringify({
                    functionName,
                    slotIndex,
                    signerAddress: typeof address === "string" ? address : binToHex(address),
                    signerIsSigner: this._signer instanceof Signer,
                    fromNonceSigner: this._signer === void 0,
                    logicalAddress: String(this._logicalAddress ?? ""),
                    signerCtor: senderSigner.constructor?.name
                  }));
                }
                return addressToLockScript(senderSigner.getAddress());
              }
              for (const alternative of access.alternatives ?? []) {
                if (alternative.activation === void 0) continue;
                const active = evalComputedKey(
                  alternative.activation,
                  entryArgs,
                  entryAbiFunction.inputs,
                  onChainState.state,
                  void 0,
                  void 0,
                  void 0,
                  alternativeProducerValues
                );
                if (active === void 0 || active.length !== 1 || active[0] !== 1) continue;
                const alternativeKey = evalComputedKey(
                  alternative.key,
                  entryArgs,
                  entryAbiFunction.inputs,
                  onChainState.state,
                  void 0,
                  (name, key) => mappingKeyValue(name, key),
                  hexToBin(publicSelfIdentity.lockingBytecode),
                  alternativeProducerValues
                );
                if (alternativeKey !== void 0) return alternativeKey;
              }
              const auto = evalComputedKey(
                source.postWriteExpressionLabel ?? source.expressionLabel ?? (/^[a-z]+:/.test(paramName) ? paramName : void 0),
                entryArgs,
                entryAbiFunction.inputs,
                onChainState.state,
                void 0,
                (name, key) => mappingKeyValue(name, key, source.preWriteMappingCollections),
                hexToBin(publicSelfIdentity.lockingBytecode)
              );
              if (auto) return auto;
              if (source.expressionLabel?.startsWith("map:") && entryAbiFunction) {
                const routed = resolveRouteRowExpressionKey({
                  expressionLabel: source.expressionLabel,
                  collection: access.collection,
                  rowArguments: selectedRouteRows.length > 0 ? selectedRouteRows : [{ args: entryArgs, occurrenceIndex: 0, handler: entryAbiFunction }],
                  routePlanningArgs: entryArgs,
                  routeVisibleInputs: entryAbiFunction.inputs,
                  structs: stateLayout.structs,
                  state: onChainState.state
                });
                if (routed) return routed;
              }
              if (source?.kind === "expression") {
                const described = evalComputedKey(
                  source.postWriteExpressionLabel ?? paramName,
                  entryArgs,
                  entryAbiFunction.inputs,
                  describedState,
                  void 0,
                  (name, key) => mappingKeyValue(name, key, source.preWriteMappingCollections)
                );
                if (described !== void 0) return described;
              }
              const ov = overrides?.entryKeyOverrides?.get(slotIndex);
              if (globalThis.process?.env?.SOLIDC_DEBUG_MSG_SENDER_KEY === "1") {
                console.error("entry-key-override", JSON.stringify({
                  functionName,
                  abiFunction: abiFunction?.name,
                  slotIndex,
                  collection: access.collection,
                  override: ov === void 0 ? void 0 : ov instanceof Uint8Array ? `b${ov.length}:${binToHex(ov).slice(0, 24)}` : String(ov)
                }));
              }
              if (ov !== void 0) {
                return ov instanceof Uint8Array ? ov : typeof ov === "bigint" ? bigIntToVmNumber(ov) : bigIntToVmNumber(ov ? 1n : 0n);
              }
              const m = keyType.match(/^bytes(\d+)$/);
              return m ? new Uint8Array(parseInt(m[1], 10)) : new Uint8Array(0);
            }
            const abiParamName = paramName.startsWith("__message_bus_ek_") ? paramName.slice("__message_bus_ek_".length) : paramName;
            const idx = entryAbiFunction.inputs.findIndex((inp) => inp.name === paramName || inp.name === abiParamName);
            const v = entryArgs[idx];
            if (keyType === "address" && typeof v === "string" && v.includes(":")) return addressToLockScript(v);
            if (keyType === "string" && typeof v === "string") return utf8ToBin(v);
            if (/^bytes(?:\d+)?$/.test(keyType) && typeof v === "string" && v.startsWith("0x")) {
              return hexToBin(v.slice(2));
            }
            if (/^(?:u?int(?:\d+)?|bigint)$/.test(keyType) && typeof v === "string") {
              return bigIntToVmNumber(BigInt(v));
            }
            try {
              const encoded = typeof v === "bigint" ? bigIntToVmNumber(v) : typeof v === "number" ? bigIntToVmNumber(BigInt(v)) : v instanceof Uint8Array ? v : typeof v === "boolean" ? bigIntToVmNumber(v ? 1n : 0n) : encodePushdataValue(v, keyType, stateLayout.structs);
              return (keyType === "address" || keyType === "address payable") && encoded.length === 20 ? p2pkhLockingBytecode(encoded) : encoded;
            } catch (cause) {
              throw new Error(
                `Cannot encode ${access.collection} entry key '${paramName}' (slot ${slotIndex}) as ${keyType}`,
                { cause }
              );
            }
          };
          const slot = keyToSlotMulti(
            keyNames.map((name, i) => encodeKey(name, keyTypes[i] ?? collection.keyType, i)),
            collection
          );
          batchTargetSlots.set(slotIndex, slot);
          const firstKeyParam = keyNames[0].startsWith("__message_bus_ek_") ? keyNames[0].slice("__message_bus_ek_".length) : keyNames[0];
          const kvIdx = entryAbiFunction.inputs.findIndex((inp) => inp.name === keyNames[0] || inp.name === firstKeyParam);
          const stateArrayKeyValues = access.keySources?.[0]?.kind === "stateArrayLast" ? onChainState.state[access.keySources[0].stateArrayName ?? ""] : void 0;
          const kv = access.keySources?.[0]?.kind === "constant" ? BigInt(access.keySources[0].constantValue ?? "0") : access.keySources?.[0]?.kind === "msgSender" ? addressToLockScript(this._signer.getAddress()) : access.keySources?.[0]?.kind === "expression" ? /^(?:call:_msgSender\(\)|nullop:msg\.sender)$/.test(
            access.keySources[0].expressionLabel ?? ""
          ) && (this._signer ?? this._logicalNonceSigner) ? addressToLockScript((this._signer ?? this._logicalNonceSigner).getAddress()) : evalComputedKey(
            access.keySources[0].postWriteExpressionLabel ?? access.keySources[0].expressionLabel ?? (/^[a-z]+:/.test(keyNames[0]) ? keyNames[0] : void 0),
            entryArgs,
            entryAbiFunction.inputs,
            describedState,
            void 0,
            (name, key) => mappingKeyValue(
              name,
              key,
              access.keySources?.[0]?.preWriteMappingCollections
            ),
            hexToBin(publicSelfIdentity.lockingBytecode)
          ) ?? overrides?.entryKeyOverrides?.get(slotIndex) ?? new Uint8Array(0) : access.keySources?.[0]?.kind === "stateArrayLast" ? stateArrayKeyValues[stateArrayKeyValues.length - 1] : entryArgs[kvIdx];
          const isWrite = entryOperations(slotIndex).includes("write") || entryOperations(slotIndex).includes("delete");
          const isSoftDelete = entryAbiFunction?.blockLayout?.slots.some(
            (s) => s.kind === "entry" && s.slotIndex === slotIndex && s.softDelete
          ) ?? false;
          const encodedKv = typeof kv === "string" ? collection.keyType === "string" ? utf8ToBin(kv) : /^bytes(?:\d+)?$/.test(collection.keyType) && kv.startsWith("0x") ? hexToBin(kv.slice(2)) : /^(?:u?int(?:\d+)?|bigint)$/.test(collection.keyType) ? BigInt(kv) : kv : kv;
          const entryBase = {
            slotIndex,
            collection: access.collection,
            keyType: collection.keyType,
            valueType: collection.valueType,
            keyValue: encodedKv,
            exists: true
          };
          const splitTopLevel = (text) => {
            const out = [];
            let depth = 0;
            let current = "";
            for (const char of text) {
              if (char === "(" || char === "[" || char === "{") depth += 1;
              else if (char === ")" || char === "]" || char === "}") depth -= 1;
              if (char === "," && depth === 0) {
                out.push(current);
                current = "";
                continue;
              }
              current += char;
            }
            if (current.length > 0) out.push(current);
            return out;
          };
          const normalizeForType = (member, type) => {
            if (type === void 0) return member;
            if (type === "address" || type === "pubkey" || /^bytes\d*$/.test(type)) {
              if (typeof member === "string") {
                return member.includes(":") ? addressToLockScript(member) : hexToBin(member.replace(/^0x/, ""));
              }
              if (typeof member === "bigint") return member === 0n ? new Uint8Array(0) : bigIntToVmNumber(member);
              if (typeof member === "number") {
                return member === 0 ? new Uint8Array(0) : bigIntToVmNumber(BigInt(member));
              }
              if (type === "address" && member instanceof Uint8Array && member.length !== 25 && member.length !== 35) {
                for (let start = 0; start + 25 <= member.length; start += 1) {
                  if (start + 35 <= member.length && member[start] === 170 && member[start + 1] === 32 && member[start + 34] === 135) return member.slice(start, start + 35);
                  if (member[start] === 118 && member[start + 1] === 169 && member[start + 2] === 20 && member[start + 23] === 136 && member[start + 24] === 172) {
                    return member.slice(start, start + 25);
                  }
                }
                if (member.length > 35) return member.slice(0, 35);
              }
              return member;
            }
            if (/^(?:u?int\d*|bigint)$/.test(type)) {
              if (member instanceof Uint8Array) {
                return vmNumberToBigInt(member, { requireMinimalEncoding: false });
              }
              if (typeof member === "boolean") return member ? 1n : 0n;
              if (typeof member === "number") return BigInt(member);
              if (typeof member === "string" && /^-?\d+$/.test(member)) return BigInt(member);
              return member;
            }
            if (type === "string" && typeof member === "string") return utf8ToBin(member);
            if (type === "bool") {
              if (typeof member === "bigint") return member !== 0n;
              if (member instanceof Uint8Array) return member.length > 0 && (member[0] ?? 0) !== 0;
            }
            return member;
          };
          const toBig = (value) => typeof value === "bigint" ? value : typeof value === "boolean" ? value ? 1n : 0n : typeof value === "number" ? BigInt(value) : value instanceof Uint8Array ? vmNumberToBigInt(value, { requireMinimalEncoding: false }) : void 0;
          const evalLabel = (label) => {
            let match = label.match(/^(?:lit|literal):(.*)$/);
            if (match) {
              const raw = match[1];
              if (/^-?\d+$/.test(raw)) return BigInt(raw);
              if (raw === "true") return true;
              if (raw === "false") return false;
              if (/^0x[0-9a-fA-F]*$/.test(raw)) return hexToBin(raw.slice(2));
              if (/^".*"$/.test(raw)) return utf8ToBin(raw.slice(1, -1));
              return void 0;
            }
            match = label.match(/^id:([A-Za-z_]\w*)$/);
            if (match) {
              const index = entryAbiFunction.inputs.findIndex((input) => input.name === match[1]);
              const resolved = index >= 0 ? entryArgs[index] : void 0;
              if (globalThis.process?.env?.SOLIDC_DEBUG_CHUNK_STAGE === "1") {
                console.error("id-resolve", JSON.stringify({
                  label,
                  index,
                  argCount: entryArgs.length,
                  resolved: resolved === void 0 ? "undefined" : resolved instanceof Uint8Array ? `bytes:${resolved.length}` : typeof resolved,
                  inputNames: entryAbiFunction.inputs.slice(0, 5).map((input) => input.name).join(","),
                  members: resolved !== null && typeof resolved === "object" && !(resolved instanceof Uint8Array) ? Object.keys(resolved).slice(0, 9).map((key) => {
                    const member = resolved[key];
                    return `${key}=${member instanceof Uint8Array ? `b${member.length}:${binToHex(member)}` : typeof member}`;
                  }).join(",") : null
                }));
              }
              return resolved;
            }
            if (label.startsWith("state:")) {
              const viaState = evalComputedKey(label, entryArgs, entryAbiFunction.inputs, describedState);
              if (globalThis.process?.env?.SOLIDC_DEBUG_CHUNK_STAGE === "1") {
                console.error("state-resolve", JSON.stringify({
                  label,
                  resolved: String(viaState).slice(0, 24),
                  snapshotValue: String(describedState[label.slice("state:".length)] ?? "absent"),
                  stateKeys: Object.keys(describedState).slice(0, 10).join(",")
                }));
              }
              return viaState;
            }
            if (/^(?:nullop|nullary):(?:msg\.sender|tx\.origin)$/.test(label)) return publicSelfAddress;
            match = label.match(/^(?:cast:[a-zA-Z0-9]+)\((.*)\)$/);
            if (match) return evalLabel(match[1]);
            match = label.match(/^unop:!\((.*)\)$/);
            if (match) {
              const value = toBig(evalLabel(match[1]));
              return value === void 0 ? void 0 : value === 0n;
            }
            match = label.match(/^(?:binop|binary):([^()]+)\((.*)\)$/);
            if (match) {
              const parts = splitTopLevel(match[2]);
              if (parts.length !== 2) return void 0;
              const left = toBig(evalLabel(parts[0]));
              const right = toBig(evalLabel(parts[1]));
              if (left === void 0 || right === void 0) return void 0;
              switch (match[1]) {
                case "+":
                  return left + right;
                case "-":
                  return left - right;
                case "*":
                  return left * right;
                case "/":
                  return right === 0n ? void 0 : left / right;
                case "%":
                  return right === 0n ? void 0 : left % right;
                case ">":
                  return left > right;
                case "<":
                  return left < right;
                case ">=":
                  return left >= right;
                case "<=":
                  return left <= right;
                case "==":
                  return left === right;
                case "!=":
                  return left !== right;
                case "&&":
                  return left !== 0n && right !== 0n;
                case "||":
                  return left !== 0n || right !== 0n;
                default:
                  return void 0;
              }
            }
            match = label.match(/^ternary\((.*)\)$/);
            if (match) {
              const parts = splitTopLevel(match[1]);
              if (parts.length !== 3) return void 0;
              const condition = toBig(evalLabel(parts[0]));
              return condition === void 0 ? void 0 : evalLabel(condition !== 0n ? parts[1] : parts[2]);
            }
            match = label.match(/^field:([A-Za-z_]\w*)\((.*)\)$/);
            if (match) {
              const innerLabel = match[2];
              const innerId = innerLabel.match(/^id:([A-Za-z_]\w*)$/);
              const innerIndex = innerId ? entryAbiFunction.inputs.findIndex((input) => input.name === innerId[1]) : -1;
              const innerType = innerIndex >= 0 ? entryAbiFunction.inputs[innerIndex].type : void 0;
              const inner = evalLabel(innerLabel);
              if (inner !== null && typeof inner === "object" && !(inner instanceof Uint8Array)) {
                const structOfArgument = innerType === void 0 ? void 0 : stateLayout.structs?.find((candidate) => candidate.name === innerType);
                if (structOfArgument !== void 0 && inner !== null && typeof inner === "object" && !(inner instanceof Uint8Array)) {
                  const positionalRecord = inner;
                  const rawPosition = structOfArgument.fields.findIndex((field) => field.name === match[1]);
                  if (rawPosition >= 0) {
                    const rawMember = positionalRecord[String(rawPosition)];
                    if (rawMember !== void 0) {
                      return normalizeForType(rawMember, structOfArgument.fields[rawPosition]?.type);
                    }
                  }
                }
                if (structOfArgument !== void 0) {
                  try {
                    const encodedArgument = encodePushdataValue(inner, innerType, stateLayout.structs);
                    const decodedArgument = decodePushdataValue(
                      encodedArgument,
                      0,
                      innerType,
                      stateLayout.structs
                    ).value;
                    if (decodedArgument !== null && typeof decodedArgument === "object" && match[1] in decodedArgument) return decodedArgument[match[1]];
                  } catch {
                  }
                }
                const record = inner;
                if (match[1] in record) return record[match[1]];
                const position = structOfArgument?.fields.findIndex((field) => field.name === match[1]) ?? -1;
                if (position >= 0) {
                  const positional = record[String(position)] ?? (Array.isArray(inner) ? inner[position] : void 0);
                  if (positional !== void 0) {
                    return normalizeForType(positional, structOfArgument?.fields[position]?.type);
                  }
                }
              }
              if (inner instanceof Uint8Array && innerType !== void 0) {
                try {
                  const decoded = decodePushdataValue(inner, 0, innerType, stateLayout.structs);
                  const record = decoded.value;
                  if (record && typeof record === "object" && match[1] in record) return record[match[1]];
                } catch {
                }
              }
              return void 0;
            }
            match = label.match(/^arr\((.*)\)$/);
            if (match) {
              const parts = splitTopLevel(match[1]);
              const values = parts.map((part) => evalLabel(part));
              return values.some((value) => value === void 0) ? void 0 : values;
            }
            match = label.match(/^index\((.*)\)$/);
            if (match) {
              const parts = splitTopLevel(match[1]);
              if (parts.length !== 2) return void 0;
              const array = evalLabel(parts[0]);
              const index = toBig(evalLabel(parts[1]));
              if (!Array.isArray(array) || index === void 0) return void 0;
              return array[Number(index)];
            }
            match = label.match(/^call:([A-Za-z_]\w*)\((.*)\)$/);
            if (match) {
              const struct = stateLayout.structs?.find((candidate) => candidate.name === match[1]);
              if (!struct) return void 0;
              const decodeField = (bytes, type) => {
                if (bytes === void 0) return void 0;
                if (type === void 0) return bytes;
                if (/^(?:u?int\d*|bigint|bool)$/.test(type)) {
                  return vmNumberToBigInt(bytes, { requireMinimalEncoding: false });
                }
                if (/^(?:address|pubkey|string|bytes\d*)$/.test(type)) return bytes;
                try {
                  return decodePushdataValue(bytes, 0, type, stateLayout.structs).value;
                } catch {
                  return bytes;
                }
              };
              const record = {};
              const failedParts = [];
              const decodedArgumentCache = /* @__PURE__ */ new Map();
              splitTopLevel(match[2]).forEach((part, position) => {
                const fieldMatch = part.match(/^field:([A-Za-z_]\w*)\((.*)\)$/);
                const name = fieldMatch ? fieldMatch[1] : struct.fields[position]?.name;
                const type = struct.fields.find((field) => field.name === name)?.type ?? struct.fields[position]?.type;
                if (name === void 0) return;
                const innerLabel = fieldMatch ? fieldMatch[2] : part;
                const argumentName = innerLabel.match(/^id:([A-Za-z_]\w*)$/)?.[1];
                const argumentIndex = argumentName === void 0 ? -1 : entryAbiFunction.inputs.findIndex((input) => input.name === argumentName);
                const argumentType = argumentIndex >= 0 ? entryAbiFunction.inputs[argumentIndex].type : void 0;
                if (fieldMatch && argumentType !== void 0) {
                  const cacheKey = `${argumentType}:${argumentIndex}`;
                  let decodedArgument = decodedArgumentCache.get(cacheKey);
                  if (decodedArgument === void 0) {
                    const rawArgument = entryArgs[argumentIndex];
                    if (rawArgument !== void 0) {
                      try {
                        const argumentBytes = rawArgument instanceof Uint8Array ? rawArgument : encodePushdataValue(rawArgument, argumentType, stateLayout.structs);
                        decodedArgument = decodePushdataValue(
                          argumentBytes,
                          0,
                          argumentType,
                          stateLayout.structs
                        ).value;
                      } catch {
                        decodedArgument = void 0;
                      }
                    }
                    if (decodedArgument !== void 0) decodedArgumentCache.set(cacheKey, decodedArgument);
                  }
                  const member = decodedArgument?.[name];
                  if (member !== void 0) {
                    record[name] = normalizeForType(member, type);
                    return;
                  }
                }
                const viaKey = evalComputedKey(part, entryArgs, entryAbiFunction.inputs, describedState);
                if (viaKey !== void 0) {
                  const value2 = normalizeForType(decodeField(viaKey, type), type);
                  if (value2 !== void 0) {
                    record[name] = value2;
                    return;
                  }
                }
                const arrayMatch = innerLabel.match(/^arr\((.*)\)$/);
                if (arrayMatch) {
                  const elementType = type?.replace(/\[.*\]$/, "");
                  const elements = splitTopLevel(arrayMatch[1]).map((element) => decodeField(
                    evalComputedKey(element, entryArgs, entryAbiFunction.inputs, describedState),
                    elementType
                  ));
                  if (elements.every((element) => element !== void 0)) {
                    record[name] = elements.map((element) => normalizeForType(element, elementType));
                    return;
                  }
                }
                const value = normalizeForType(evalLabel(fieldMatch ? part : innerLabel), type);
                if (value !== void 0) record[name] = value;
                else failedParts.push(`${position}:${name} viaKey=${viaKey === void 0 ? "undef" : String(viaKey.length)} inner=${innerLabel.startsWith("cast:") ? "cast" : innerLabel.slice(0, 24)}`);
              });
              if (failedParts.length > 0 && globalThis.process?.env?.SOLIDC_DEBUG_CHUNK_STAGE === "1") {
                console.error("chunk-part-fail", JSON.stringify({
                  struct: match[1],
                  failedParts,
                  stateKeys: Object.keys(describedState ?? {}).slice(0, 12)
                }));
              }
              if (globalThis.process?.env?.SOLIDC_DEBUG_CHUNK_STAGE === "1") {
                console.error("chunk-label-fields", JSON.stringify({ fields: Object.keys(record) }));
              }
              const normalized = {};
              for (const field of struct.fields) {
                const member = record[field.name];
                if (member === void 0) continue;
                const arrayInfo = field.type.match(/^(.+)\[\d+\]$/);
                normalized[field.name] = arrayInfo !== null && Array.isArray(member) ? member.map((element) => normalizeForType(element, arrayInfo[1])) : normalizeForType(member, field.type);
              }
              return normalized;
            }
            return void 0;
          };
          const resolveDescribedValue = (valueSource) => {
            if (!valueSource) return void 0;
            const value = evalLabel(valueSource);
            if (value === void 0) return void 0;
            try {
              const encodedValue = encodePushdataValue(value, collection.valueType, stateLayout.structs);
              if (globalThis.process?.env?.SOLIDC_DEBUG_CHUNK_STAGE === "1") {
                try {
                  decodePushdataValue(encodedValue, 0, collection.valueType, stateLayout.structs);
                  console.error("chunk-frames", JSON.stringify({
                    frames: stateLayout.structs?.find((candidate) => candidate.name === collection.valueType)?.fields.map((field) => {
                      const member = value[field.name];
                      if (member === void 0) return `${field.name}:absent`;
                      try {
                        return `${field.name}:${binToHex(encodePushdataValue(
                          member,
                          field.type,
                          stateLayout.structs
                        ))}`;
                      } catch (frameError) {
                        return `${field.name}:ERR`;
                      }
                    }) ?? null
                  }));
                  console.error("chunk-value-roundtrip", JSON.stringify({
                    ok: true,
                    bytes: encodedValue.length,
                    record: value && Object.entries(value).map(([key, member]) => `${key}=${member instanceof Uint8Array ? `b${member.length}:${binToHex(member).slice(0, 12)}` : Array.isArray(member) ? `[${member.map((element) => String(element)).join("|")}]` : String(member)}`)
                  }));
                } catch (decodeError) {
                  console.error("chunk-value-roundtrip", JSON.stringify({
                    ok: false,
                    bytes: encodedValue.length,
                    error: String(decodeError).slice(0, 160)
                  }));
                }
              }
              return encodedValue;
            } catch (error) {
              if (globalThis.process?.env?.SOLIDC_DEBUG_CHUNK_STAGE === "1") {
                console.error("chunk-encode-fail", JSON.stringify({
                  valueType: collection.valueType,
                  error: String(error).slice(0, 160),
                  fieldTypes: stateLayout.structs?.find((candidate) => candidate.name === collection.valueType)?.fields.map((field) => `${field.name}:${field.type}`) ?? null,
                  members: value && typeof value === "object" && !(value instanceof Uint8Array) ? Object.entries(value).map(([key, member]) => `${key}=${member instanceof Uint8Array ? `bytes:${member.length}` : Array.isArray(member) ? `arr:${member.length}` : typeof member}`) : null
                }));
              }
              if (value && typeof value === "object" && !(value instanceof Uint8Array) && globalThis.process?.env?.SOLIDC_DEBUG_CHUNK_STAGE === "1") {
                const record = value;
                const removable = [];
                for (const key of Object.keys(record)) {
                  const copy = { ...record };
                  delete copy[key];
                  try {
                    encodePushdataValue(copy, collection.valueType, stateLayout.structs);
                    removable.push(key);
                  } catch {
                  }
                }
                console.error("chunk-encode-bisect", JSON.stringify({
                  removable,
                  offenders: removable.map((key) => {
                    const member = value[key];
                    return Array.isArray(member) ? `${key}=[${member.map((element) => element instanceof Uint8Array ? `bytes:${element.length}` : typeof element).join(",")}]` : `${key}=${member instanceof Uint8Array ? `bytes:${member.length}` : typeof member}`;
                  })
                }));
              }
              return void 0;
            }
          };
          if (isWrite) {
            const present = list.has(slot);
            const wUnlocker = createEntryNftUnlocker(
              this.inner,
              overrides?.blockBase ?? 0,
              this.categoryId,
              access.collection
            );
            if (globalThis.process?.env?.SOLIDC_DEBUG_ENTRY_PIN === "1") {
              const pinned = present ? list.find(slot) : list.predecessorOf(slot);
              const pinKeys = (() => {
                try {
                  return keyNames.map((name, index) => {
                    const keyType = keyTypes[index] ?? collection.keyType;
                    const abiName = name.startsWith("__message_bus_ek_") ? name.slice("__message_bus_ek_".length) : name;
                    const at = entryAbiFunction?.inputs.findIndex((inp) => inp.name === name || inp.name === abiName) ?? -1;
                    return `${name}(${keyType})=${binToHex(
                      encodeKey(name, keyType, index)
                    )}:arg=${String(entryArgs[at])}`;
                  });
                } catch (error) {
                  return [`ERR:${String(error).slice(0, 80)}`];
                }
              })();
              console.error("entry-pin", JSON.stringify({
                functionName,
                entryFunction: entryAbiFunction?.name,
                collection: access.collection,
                slotIndex,
                slot: binToHex(slot),
                keys: pinKeys,
                present,
                pinnedSlot: pinned === void 0 ? void 0 : String(pinned.utxo?.token?.nft?.commitment ?? "").slice(0, 64)
              }));
            }
            if (globalThis.process?.env?.SOLIDC_DEBUG_MSG_SENDER_KEY === "1") {
              console.error("entry-pin-identity", JSON.stringify({
                // The derive sequence that is currently executing (see `derive-return-value-entry`): pairing the two
                // records by this number names the call site that built the frame which pinned this slot.
                deriveSeq: this._deriveSeq,
                owner: this.inner.artifact.contractName,
                functionName,
                slotIndex,
                collection: access.collection,
                slot: binToHex(slot),
                present,
                hasCallerLock: overrides?.callerLockingBytecode !== void 0,
                // The VALUES, not just presence: several builds pin `_allowances` in one run, and only the tuple
                // identifies which one produced a given slot.
                callerLock: overrides?.callerLockingBytecode === void 0 ? void 0 : binToHex(overrides.callerLockingBytecode).slice(0, 24),
                callerCategory: overrides?.msgSenderCategory === void 0 ? void 0 : binToHex(Uint8Array.from(overrides.msgSenderCategory).reverse()).slice(0, 24),
                signer: String(this._signer?.getAddress?.() ?? ""),
                nonceSigner: String(this._logicalNonceSigner?.getAddress?.() ?? ""),
                probe: overrides?.returnProbeOnly === true,
                blockBase: overrides?.blockBase
              }));
            }
            if (present) {
              entryNfts.push({ ...entryBase, utxo: { ...list.find(slot).utxo, unlocker: wUnlocker } });
            } else if (isSoftDelete) {
              const predecessor = list.predecessorOf(slot);
              entryNfts.push({ ...entryBase, utxo: { ...predecessor.utxo, unlocker: wUnlocker } });
            } else {
              const plan = list.planInsert(slot);
              entryNfts.push({ ...entryBase, utxo: { ...plan.predecessor.utxo, unlocker: wUnlocker } });
              let newNode;
              if (collection.chunkableValue && (access.valueParam !== void 0 || access.valueSource !== void 0)) {
                const vIdx2 = access.valueParam === void 0 ? -1 : entryAbiFunction.inputs.findIndex((inp) => inp.name === access.valueParam);
                const raw2 = vIdx2 >= 0 ? entryArgs[vIdx2] : void 0;
                const described = overrides?.returnProbeOnly && access.valueParam === void 0 ? resolveDescribedValue(access.valueSource) : void 0;
                const vB = described ?? (typeof raw2 === "string" ? utf8ToBin(raw2) : raw2 instanceof Uint8Array ? raw2 : void 0);
                if (globalThis.process?.env?.SOLIDC_DEBUG_CHUNK_STAGE === "1") {
                  console.error("chunk-vb", JSON.stringify({
                    owner: this.inner.artifact.contractName,
                    functionName,
                    collection: access.collection,
                    described: described !== void 0,
                    vBLen: vB?.length ?? null,
                    sha256vB: vB === void 0 ? null : binToHex(sha256Sync(vB)),
                    predecessor: (() => {
                      const predecessor = plan.predecessor;
                      const commitment = predecessor?.utxo?.token?.nft?.commitment;
                      const value = predecessor?.value;
                      return {
                        commitment: commitment === void 0 ? null : String(commitment).slice(0, 40),
                        valueKind: value instanceof Uint8Array ? `bytes:${value.length}` : typeof value,
                        valueHex: value instanceof Uint8Array ? binToHex(value).slice(0, 60) : null
                      };
                    })(),
                    slotKind: slot instanceof Uint8Array ? `b${slot.length}:${binToHex(slot).slice(0, 16)}` : typeof slot,
                    sha256SlotV: vB === void 0 || !(slot instanceof Uint8Array) ? null : binToHex(sha256Sync(Uint8Array.from([...slot, ...vB]))),
                    sha256LinkV: vB === void 0 ? null : binToHex(sha256Sync(Uint8Array.from([...plan.predecessor.nextKey, ...vB]))),
                    sha256Tail: vB === void 0 ? null : binToHex(sha256Sync(encodeChunkableValueTail(vB))).slice(0, 32),
                    sha256Head: vB === void 0 ? null : binToHex(sha256Sync(vB.slice(0, 28))).slice(0, 32),
                    tailHex: vB === void 0 ? null : binToHex(encodeChunkableValueTail(vB)).slice(0, 80),
                    argMembers: (() => {
                      const inputIndex = entryAbiFunction.inputs.findIndex((input) => input.name === "input");
                      const raw = inputIndex >= 0 ? entryArgs[inputIndex] : void 0;
                      if (raw === null || typeof raw !== "object" || raw instanceof Uint8Array) return String(typeof raw);
                      const record = raw;
                      return Object.keys(record).slice(0, 9).map((key) => {
                        const member = record[key];
                        return `${key}:${member instanceof Uint8Array ? `b${member.length}:${binToHex(member)}` : typeof member}`;
                      }).join(",");
                    })(),
                    stateTs: String(onChainState?.state?.__block_timestamp ?? null),
                    stateFee: String(onChainState?.state?.protocolFee ?? null)
                  }));
                }
                if (vB) {
                  newNode = encodeEntryCommitment(
                    slot,
                    plan.predecessor.nextKey,
                    encodeChunkableValueTail(vB)
                  );
                  if (overrides?.returnProbeOnly && !valueChunkMints.some((mint) => mint.collection === access.collection && binToHex(mint.slot) === binToHex(slot))) {
                    valueChunkMints.push({
                      collection: access.collection,
                      slotIndex,
                      slot,
                      value: vB,
                      digest: sha256Sync(vB),
                      chunks: splitValueIntoValueChunks(vB)
                    });
                    if (globalThis.process?.env?.SOLIDC_DEBUG_CHUNK_MINT === "1") {
                      console.error("chunk-mint-push", JSON.stringify({
                        owner: this.inner.artifact.contractName,
                        functionName,
                        collection: access.collection,
                        slot: binToHex(slot),
                        digest: binToHex(sha256Sync(vB)),
                        valueBytes: vB.length,
                        chunks: splitValueIntoValueChunks(vB).length,
                        keyParams: access.keyParams,
                        keySources: (access.keySources ?? []).map((source) => ({
                          kind: source?.kind ?? null,
                          paramName: source?.paramName ?? null,
                          stateVarName: source?.stateVarName ?? null,
                          stateArrayName: source?.stateArrayName ?? null,
                          constantValue: source?.constantValue ?? null,
                          expressionLabel: source?.expressionLabel ?? null
                        })),
                        accessSlots: { entryAccessSlot: access.slotIndex ?? null, routeSlot: slotIndex },
                        routeKeys: (entryAbiFunction?.inputs ?? []).map((input, index) => ({ input, index })).filter(({ input }) => input.name.startsWith("__message_bus_key_")).map(({ input, index }) => ({
                          name: input.name,
                          type: input.type,
                          entryArg: entryArgs[index] instanceof Uint8Array ? `b${entryArgs[index].length}:${binToHex(entryArgs[index])}` : String(entryArgs[index]),
                          finalArg: finalArgs[index] instanceof Uint8Array ? `b${finalArgs[index].length}:${binToHex(finalArgs[index])}` : String(finalArgs[index])
                        })),
                        stateCounter: (() => {
                          const counter = describedState.escrowIdCounter;
                          return counter === void 0 ? "absent" : JSON.stringify(counter, (_key, value) => value instanceof Uint8Array ? `b${value.length}:${binToHex(value)}` : typeof value === "bigint" ? String(value) : value);
                        })(),
                        entryInputNames: (entryAbiFunction?.inputs ?? []).map((input) => input.name)
                      }));
                    }
                  }
                }
              }
              if (!entryAbiFunction?.sortedBatchInfo?.some((b) => b.slotIndices.includes(slotIndex))) {
                sortedInserts.push({ slotIndex, collection: access.collection, predNew: plan.predNewCommitment, newNode });
              }
            }
          } else {
            let present = list.has(slot);
            if (!present) {
              const refreshed = SortedList.fromUtxos(
                await collectionEntriesFor(collection.signature, { fresh: true })
              );
              if (refreshed.has(slot)) {
                present = true;
                const refreshedEntry = refreshed.find(slot);
                const roUnlockerFresh = createReadOnlyEntryNftUnlocker(
                  this.inner,
                  this.categoryId,
                  access.collection
                );
                entryNfts.push({
                  ...entryBase,
                  utxo: { ...refreshedEntry.utxo, unlocker: roUnlockerFresh }
                });
                continue;
              }
            }
            const entry = present ? list.find(slot) : list.predecessorOf(slot);
            if (globalThis.process?.env?.SOLIDC_DEBUG_ENTRY_COUNTS === "1") {
              const freshAddress = getEntryNftAddress(this.inner, this.categoryId, access.collection);
              const freshCount = present ? -1 : (await this.inner.provider.getUtxos(freshAddress)).length;
              console.error("entry-read-plan", JSON.stringify({
                buildId: peekBuildId(),
                freshCount,
                collection: access.collection,
                slotIndex,
                listSize: list.all.length,
                headOnly: list.all.length === 1,
                slot: binToHex(slot),
                present,
                entryCommitment: String(entry.utxo.token?.nft?.commitment ?? "").slice(0, 72),
                sender: this._signer ?? this._logicalNonceSigner ? binToHex((this._signer ?? this._logicalNonceSigner).getLockingBytecode()) : "none"
              }));
            }
            const roUnlocker = createReadOnlyEntryNftUnlocker(this.inner, this.categoryId, access.collection);
            entryNfts.push({ ...entryBase, utxo: { ...entry.utxo, unlocker: roUnlocker } });
          }
          let authenticatedChunkableValue;
          if (hasChunkableValueWitness) {
            let witness = new Uint8Array();
            const present = list.has(slot);
            const proofEntry = present ? list.find(slot) : list.predecessorOf(slot);
            {
              const tail = proofEntry.value;
              if (tail.length >= 4) {
                const len = tail[0] | tail[1] << 8 | tail[2] << 16 | tail[3] << 24;
                if (len > 60) {
                  const root = tail.slice(4, 36);
                  const headData = tail.slice(36, 64);
                  const chunkAddr = getValueChunkAddress(
                    this.inner,
                    this.categoryId,
                    access.collection,
                    proofEntry.slot,
                    root
                  );
                  const expectedChunkCount = Math.ceil((len - VALUE_HEAD_SIZE) / VALUE_CHUNK_SIZE);
                  const chunksByIndex = /* @__PURE__ */ new Map();
                  const chunkUtxos = await this.inner.provider.getUtxos(chunkAddr);
                  if (globalThis.process?.env?.SOLIDC_DEBUG_COLLECTION_FETCH === "1") {
                    console.error("collection-value-chunk-fetch", {
                      collection: access.collection,
                      categoryId: this.categoryId,
                      slot: binToHex(slot),
                      root: binToHex(root),
                      chunkAddr,
                      expectedChunkCount,
                      utxos: chunkUtxos.map((utxo) => ({
                        category: utxo.token?.category,
                        capability: utxo.token?.nft?.capability,
                        commitment: utxo.token?.nft?.commitment
                      }))
                    });
                  }
                  for (const chunk of chunkUtxos.filter((u) => u.token?.category === this.categoryId && !!u.token?.nft?.commitment && u.token.nft.commitment.length > 0).map((u) => parseValueChunkCommitment(u.token.nft.commitment))) {
                    if (chunk.chunkIndex < expectedChunkCount) chunksByIndex.set(chunk.chunkIndex, chunk);
                  }
                  const chunks = [...chunksByIndex.values()].sort((a, b) => a.chunkIndex - b.chunkIndex);
                  witness = joinValueChunks(headData, chunks, len);
                  if (binToHex(sha256Sync(witness)) !== binToHex(root)) {
                    throw new Error("vmap value chunks do not match the authenticated root");
                  }
                  authenticatedChunkableValue = witness;
                } else if (present) {
                  authenticatedChunkableValue = tail.slice(4, 4 + len);
                }
              }
            }
            if (!present && parseArrayTypeString(collection.valueType)) {
              authenticatedChunkableValue = encodePushdataValue([], collection.valueType, stateLayout.structs);
            }
            if (["SOLIDC_DEBUG_COLLECTION_FETCH", "SOLIDC_DEBUG_VALUE_WITNESS"].some((name) => globalThis.process?.env?.[name] === "1")) {
              const tail = proofEntry.value;
              console.error("chunkable-read-witness", {
                slotIndex,
                functionName: entryAbiFunction?.name,
                collection: access.collection,
                slot: binToHex(slot),
                present,
                proofSlot: binToHex(proofEntry.slot),
                tailBytes: tail.length,
                tailHead: binToHex(tail).slice(0, 80),
                storedLength: tail.length >= 4 ? tail[0] | tail[1] << 8 | tail[2] << 16 | tail[3] << 24 : 0,
                witnessBytes: witness.length,
                witnessHead: binToHex(witness).slice(0, 120)
              });
            }
            valueWitnessBySlot.set(slotIndex, witness);
          }
          if (isWrite && collection.chunkableValue) {
            const vIdx = access.valueParam ? entryAbiFunction.inputs.findIndex((inp) => inp.name === access.valueParam) : -1;
            const raw = vIdx >= 0 ? entryArgs[vIdx] : void 0;
            const directBytes = typeof raw === "string" ? utf8ToBin(raw) : raw instanceof Uint8Array ? raw : void 0;
            const arrayDirectBytes = directBytes === void 0 && raw !== void 0 && !(raw instanceof Uint8Array) && (Array.isArray(raw) || typeof raw === "object") ? (() => {
              try {
                return encodePushdataValue(raw, collection.valueType, stateLayout.structs);
              } catch {
                return void 0;
              }
            })() : void 0;
            const structuredValue = stateLayout.structs?.some((struct) => struct.name === collection.valueType);
            const vBytes = directBytes ?? arrayDirectBytes ?? (structuredValue ? void 0 : evalComputedKey(
              access.valueSource,
              entryArgs,
              entryAbiFunction.inputs,
              onChainState.state
            ));
            if (vBytes) {
              if (vBytes.length > 60) {
                valueChunkMints.push({
                  collection: access.collection,
                  slotIndex,
                  slot,
                  value: vBytes,
                  digest: sha256Sync(vBytes),
                  chunks: splitValueIntoValueChunks(vBytes)
                });
              }
              if (list.has(slot) && isSoleActiveFixedCollectionWrite(access.collection, slotIndex)) {
                computedValueUpdateCollections.add(access.collection);
              }
            } else if (!inactiveMessageBusEntrySlots.has(slotIndex) && !isSoftDelete && (activeMessageBusWriteCollections === void 0 || activeMessageBusWriteCollections.includes(access.collection))) {
              let kernelEncodedValue;
              const selectedRows = entryAbiFunction?.messageBusRowArguments;
              if (selectedRows && (authenticatedChunkableValue || !list.has(slot))) {
                if (structuredValue) {
                  const writes = selectedRows.flatMap((row) => (row.handler.entryAccesses ?? []).filter((rowAccess) => rowAccess.collection === access.collection && rowAccess.operations.includes("write")).map((rowAccess) => ({ row, access: rowAccess })));
                  const incomingEntries = authenticatedChunkableValue && list.has(slot) ? [{ collection: collection.signature, slot, value: authenticatedChunkableValue }] : [];
                  if (writes.length > 0) {
                    kernelEncodedValue = foldRouteStoredValues({
                      writes,
                      collection,
                      targetSlot: slot,
                      incomingEntries,
                      artifact: entryArtifact,
                      state: recipeState,
                      encode: ({ row, access: rowAccess }, entries) => this._encodeStoredValueSource(
                        rowAccess,
                        collection.valueType,
                        [...row.args],
                        row.handler,
                        entryArtifact,
                        recipeState,
                        void 0,
                        entries
                      )
                    });
                  }
                }
                const legacyCompatibility = usesLegacyJobEventCompatibility(
                  entryArtifact,
                  collection.valueType,
                  stateLayout.structs
                );
                const legacyTimestamp = legacyCompatibility && typeof recipeState.__block_timestamp === "bigint" ? recipeState.__block_timestamp : void 0;
                const foldParams = {
                  rowArguments: selectedRows,
                  collection: access.collection,
                  valueType: collection.valueType,
                  structs: stateLayout.structs,
                  timestamp: legacyTimestamp,
                  legacyJobEventCompatibility: legacyCompatibility,
                  resolveElement: (row, rowAccess, elementType) => this._encodeStoredElementSource(
                    rowAccess,
                    elementType,
                    [...row.args],
                    row.handler,
                    entryArtifact,
                    recipeState
                  ),
                  // path-effect activation/settle-time ExecutionContext: per-row activations; prefer settle-time ExecutionContext when registered.
                  resolveRowActivationEnv: createFoldRowActivationEnvResolver()
                };
                const foldedPushes = foldLeadingRouteArrayPushes(foldParams);
                const leadingValue = foldedPushes?.leading;
                const completeValue = foldedPushes?.complete ?? foldCompleteRouteArrayPushes(foldParams)?.complete;
                const leadingIndex = entryAbiFunction.inputs.findIndex((input) => input.name === `__internal__leadingPushValue_${slotIndex}`);
                const completeIndex = entryAbiFunction.inputs.findIndex((input) => input.name === `__internal__completePushValue_${slotIndex}` || input.name === "__internal__completePushValue");
                if (!structuredValue) {
                  kernelEncodedValue = completeValue ? concatenateEncodedArrays(
                    authenticatedChunkableValue ?? encodePushdataValue([], collection.valueType, stateLayout.structs),
                    completeValue
                  ) : void 0;
                }
                if (leadingValue && leadingIndex >= 0) {
                  entryArgs[leadingIndex] = leadingValue;
                  if (entryAbiFunction === abiFunction) finalArgs[leadingIndex] = leadingValue;
                  if (entryCompilerRoute) {
                    const name = entryAbiFunction.inputs[leadingIndex].name;
                    entryCompilerRoute.internalArgs = { ...entryCompilerRoute.internalArgs, [name]: leadingValue };
                  }
                }
                if (completeValue && completeIndex >= 0) {
                  entryArgs[completeIndex] = completeValue;
                  if (entryAbiFunction === abiFunction) finalArgs[completeIndex] = completeValue;
                  if (entryCompilerRoute) {
                    const name = entryAbiFunction.inputs[completeIndex].name;
                    entryCompilerRoute.internalArgs = { ...entryCompilerRoute.internalArgs, [name]: completeValue };
                  }
                } else if (completeValue && entryCompilerRoute) {
                  entryCompilerRoute.internalArgs = {
                    ...entryCompilerRoute.internalArgs,
                    __internal__completePushValue: completeValue,
                    [`__internal__completePushValue_${slotIndex}`]: completeValue
                  };
                }
              }
              if (kernelEncodedValue && kernelEncodedValue.length > 60) {
                valueChunkMints.push({
                  collection: access.collection,
                  slotIndex,
                  slot,
                  value: kernelEncodedValue,
                  digest: sha256Sync(kernelEncodedValue),
                  chunks: splitValueIntoValueChunks(kernelEncodedValue)
                });
              } else if (!valueChunkMints.some((mint) => mint.collection === access.collection && mint.slot instanceof Uint8Array && binToHex(mint.slot) === binToHex(slot))) {
                addComputedValueChunkRun(access.collection, slot);
              }
              if (kernelEncodedValue && !list.has(slot)) {
                const plannedInsert = sortedInserts.find((insert) => insert.slotIndex === slotIndex && insert.collection === access.collection);
                if (plannedInsert) {
                  plannedInsert.newNode = encodeEntryCommitment(
                    slot,
                    list.predecessorOf(slot).nextKey,
                    encodeChunkableValueTail(kernelEncodedValue)
                  );
                }
              }
              if (list.has(slot) && !isSoftDelete) computedValueUpdateCollections.add(access.collection);
            }
            if (list.has(slot)) {
              const oldTail = list.find(slot).value;
              if (oldTail.length >= 36 && (oldTail[0] | oldTail[1] << 8 | oldTail[2] << 16 | oldTail[3] << 24) > 60) {
                valueChunkGc.push({
                  collection: access.collection,
                  slotHex: binToHex(slot),
                  oldDigestHex: binToHex(oldTail.slice(4, 36))
                });
              }
            }
          }
          continue;
        }
        const effectiveKeyTypes = collection.keyTypes ?? [collection.keyType];
        const keyValues = [];
        let isExpressionKeyPlaceholder = false;
        const keySources = access.keySources ?? access.keyParams.map((name) => ({ kind: "param", paramName: name, canonical: name }));
        for (let ki = 0; ki < keySources.length; ki++) {
          const keySource = keySources[ki];
          if (keySource.kind === "param") {
            const keyParamIndex = entryAbiFunction.inputs.findIndex((inp) => inp.name === keySource.paramName);
            if (keyParamIndex < 0) {
              throw new Error(`Key parameter '${keySource.paramName}' not found in function inputs`);
            }
            let kv = entryArgs[keyParamIndex];
            if (effectiveKeyTypes[ki] === "address" && typeof kv === "string" && kv.includes(":")) {
              kv = addressToLockScript(kv);
            }
            keyValues.push(kv);
          } else if (keySource.kind === "state") {
            const stateValue = onChainState.state[keySource.stateVarName];
            if (stateValue === void 0) {
              throw new Error(
                `Cannot auto-resolve mapping key from state variable '${keySource.stateVarName}'. State variable not found on-chain.`
              );
            }
            keyValues.push(stateValue);
          } else if (keySource.kind === "stateArrayLast") {
            const arr = onChainState.state[keySource.stateArrayName];
            if (!Array.isArray(arr) || arr.length === 0) {
              throw new Error(
                `Cannot resolve mapping key from '${keySource.stateArrayName}[length-1]': array missing or empty.`
              );
            }
            keyValues.push(arr[arr.length - 1]);
          } else if (keySource.kind === "constant") {
            keyValues.push(BigInt(keySource.constantValue));
          } else if (keySource.kind === "msgSender") {
            const senderSigner = this._signer ?? this._logicalNonceSigner;
            if (!senderSigner) {
              throw new Error(
                `A '${keySource.senderOp ?? "msg.sender"}'-keyed sorted mapping requires a Signer: the sender must fund the call via its native P2PKH input (StatefulContract.withSigner / connect a Signer).`
              );
            }
            keyValues.push(addressToLockScript(senderSigner.getAddress()));
          } else {
            const entryKeyOverrides = overrides?.entryKeyOverrides;
            const override = entryKeyOverrides?.get(slotIndex);
            const senderExpression = /^(?:call:_msgSender\(\)|nullop:msg\.sender)$/.test(
              keySource.expressionLabel ?? ""
            );
            const senderSigner = this._signer ?? this._logicalNonceSigner;
            const evaluated = senderExpression && senderSigner ? addressToLockScript(senderSigner.getAddress()) : evalComputedKey(keySource.expressionLabel, entryArgs, entryAbiFunction.inputs);
            if (evaluated !== void 0) {
              const keyType = effectiveKeyTypes[ki];
              keyValues.push(/^(u?int|bigint|enum)/.test(keyType) ? decodeScriptNumber(evaluated) : evaluated);
            } else if (override !== void 0) {
              keyValues.push(override);
            } else {
              isExpressionKeyPlaceholder = true;
              const keyType = effectiveKeyTypes[ki];
              const bytesMatch = keyType.match(/^bytes(\d+)$/);
              if (bytesMatch) {
                keyValues.push(new Uint8Array(parseInt(bytesMatch[1], 10)));
              } else if (keyType === "bytes" || keyType === "address") {
                keyValues.push(new Uint8Array(0));
              } else if (keyType === "bool") {
                keyValues.push(false);
              } else {
                keyValues.push(0n);
              }
            }
          }
        }
        const keyValue = keyValues[0];
        let matchingUtxo;
        const isMultiKey = effectiveKeyTypes.length > 1;
        if (isExpressionKeyPlaceholder) {
          const { hash160: computeHash160 } = await import("@solidcash/utils");
          const derivedKeys = [];
          for (const arg of args) {
            if (arg instanceof Uint8Array && (arg.length === 33 || arg.length === 65)) {
              derivedKeys.push(computeHash160(arg));
            }
          }
          for (const utxo of collectionEntries) {
            if (!utxo.token?.nft?.commitment) continue;
            try {
              const parsed = isMultiKey ? parseEntryCommitmentMultiKey(
                utxo.token.nft.commitment,
                effectiveKeyTypes,
                collection.valueType,
                stateLayout.structs
              ) : parseEntryCommitment(
                utxo.token.nft.commitment,
                collection.keyType,
                collection.valueType,
                stateLayout.structs
              );
              const entryKey = isMultiKey ? parsed.keys[0] : parsed.key;
              for (const dk of derivedKeys) {
                if (this._keysMatch(entryKey, dk, effectiveKeyTypes[0])) {
                  matchingUtxo = utxo;
                  keyValues[0] = dk;
                  isExpressionKeyPlaceholder = false;
                  break;
                }
              }
              if (matchingUtxo) break;
            } catch {
            }
          }
        } else {
          for (const utxo of collectionEntries) {
            if (!utxo.token?.nft?.commitment) continue;
            try {
              if (isMultiKey) {
                const parsed = parseEntryCommitmentMultiKey(
                  utxo.token.nft.commitment,
                  effectiveKeyTypes,
                  collection.valueType,
                  stateLayout.structs
                );
                if (parsed.keys.every((k, i) => this._keysMatch(k, keyValues[i], effectiveKeyTypes[i]))) {
                  matchingUtxo = utxo;
                  break;
                }
              } else {
                const parsed = parseEntryCommitment(
                  utxo.token.nft.commitment,
                  collection.keyType,
                  collection.valueType,
                  stateLayout.structs
                );
                if (this._keysMatch(parsed.key, keyValue, collection.keyType)) {
                  matchingUtxo = utxo;
                  break;
                }
              }
            } catch {
            }
          }
        }
        const exists = !!matchingUtxo;
        const entryUnlocker = createEntryNftUnlocker(
          this.inner,
          overrides?.blockBase ?? 0,
          this.categoryId,
          access.collection
        );
        entryNfts.push({
          slotIndex,
          collection: access.collection,
          keyType: collection.keyType,
          valueType: collection.valueType,
          keyValue,
          ...isMultiKey && { keyTypes: effectiveKeyTypes, keyValues },
          exists,
          utxo: matchingUtxo ? { ...matchingUtxo, unlocker: entryUnlocker } : void 0
        });
      }
      const writeUnlockerByProof = /* @__PURE__ */ new Map();
      for (const entry of entryNfts) {
        if (!entry.utxo || !entryOperations(entry.slotIndex).some(
          (operation) => operation === "write" || operation === "delete"
        )) continue;
        writeUnlockerByProof.set(
          `${entry.collection}:${entry.utxo.txid.toLowerCase()}:${entry.utxo.vout}`,
          entry.utxo.unlocker
        );
      }
      for (const entry of entryNfts) {
        if (!entry.utxo) continue;
        const unlocker = writeUnlockerByProof.get(
          `${entry.collection}:${entry.utxo.txid.toLowerCase()}:${entry.utxo.vout}`
        );
        if (unlocker) entry.utxo = { ...entry.utxo, unlocker };
      }
      const batchAliasOwners = new Map(runtimeEntryAliasOwners(entryNfts.map((entry) => ({
        slotIndex: entry.slotIndex,
        collection: entry.collection,
        priorSlots: [
          ...entryAccessForSlot(entry.slotIndex)?.aliasCondDeleteSlot === void 0 ? [] : [entryAccessForSlot(entry.slotIndex).aliasCondDeleteSlot],
          ...entryAccessForSlot(entry.slotIndex)?.runtimeAliasPriorSlots ?? [],
          ...entryAccessForSlot(entry.slotIndex)?.composeAliasPriorSlots ?? []
        ],
        target: batchTargetSlots.has(entry.slotIndex) ? binToHex(batchTargetSlots.get(entry.slotIndex)) : void 0,
        proof: entry.utxo ? `${entry.utxo.txid.toLowerCase()}:${entry.utxo.vout}` : void 0,
        operations: entryOperations(entry.slotIndex),
        inactive: inactiveMessageBusEntrySlots.has(entry.slotIndex)
      }))));
      const batchAliasSkips = new Set(batchAliasOwners.keys());
      for (const slotIndex of batchAliasSkips) runtimeMessageBusAliasSkipSlots.add(slotIndex);
      for (const entry of entryNfts) {
        const prior = entryAccessForSlot(entry.slotIndex)?.sharedProofPriorSlot;
        const owner = prior === void 0 ? void 0 : entryNfts.find((candidate) => candidate.slotIndex === prior);
        if (!entry.utxo || !owner?.utxo || runtimeMessageBusAliasSkipSlots.has(owner.slotIndex) || entry.collection !== owner.collection) continue;
        if (`${entry.utxo.txid.toLowerCase()}:${entry.utxo.vout}` !== `${owner.utxo.txid.toLowerCase()}:${owner.utxo.vout}`) continue;
        runtimeMessageBusAliasSkipSlots.add(entry.slotIndex);
        entry.exists = false;
        entry.utxo = void 0;
      }
      if (globalThis.process?.env?.SOLIDC_DEBUG_ROUTE_ENTRY_PLAN === "1") {
        console.error("message-bus-route-entry-plan", entryNfts.map((entry) => ({
          slotIndex: entry.slotIndex,
          collection: entry.collection,
          keys: entryAccessForSlot(entry.slotIndex)?.keyParams,
          operations: entryOperations(entry.slotIndex),
          inactive: inactiveMessageBusEntrySlots.has(entry.slotIndex),
          targetSlot: batchTargetSlots.has(entry.slotIndex) ? binToHex(batchTargetSlots.get(entry.slotIndex)) : void 0,
          key: entry.keyValue instanceof Uint8Array ? binToHex(entry.keyValue) : typeof entry.keyValue === "bigint" ? entry.keyValue.toString() : entry.keyValue,
          exists: entry.exists,
          outpoint: entry.utxo ? `${entry.utxo.txid}:${entry.utxo.vout}` : void 0,
          commitment: entry.utxo?.token?.nft?.commitment,
          aliasOwner: batchAliasOwners.get(entry.slotIndex),
          aliasSkipped: batchAliasSkips.has(entry.slotIndex)
        })));
      }
      const softDeleteSlots = (entryAbiFunction?.blockLayout?.slots ?? []).filter((slot) => slot.kind === "entry" && slot.softDelete).map((slot) => slot.slotIndex);
      const absentSoftDelete = (slotIndex) => {
        const commitment = slotIndex === void 0 ? void 0 : entryNfts.find((entry) => entry.slotIndex === slotIndex)?.utxo?.token?.nft?.commitment;
        return !!commitment && binToHex(decodeEntryCommitment(hexToBin(commitment)).slot) !== binToHex(batchTargetSlots.get(slotIndex));
      };
      const settlesByActivity = settlesSortedTargetsByActivity(entryAbiFunction);
      const batchNoOp = !settlesByActivity && absentSoftDelete(softDeleteSlots[0]);
      const batchWitnesses = [];
      let batchTrailingCount = 0;
      let preservedTrailingCount = 0;
      for (const iter of entryAbiFunction?.collectionIterations ?? []) {
        const collection = stateLayout.collections.find((candidate) => candidate.name === iter.collection);
        if (!collection) throw new Error(`Unknown collection: ${iter.collection}`);
        const address = getEntryNftAddress(this.inner, this.categoryId, collection.signature);
        preservedTrailingCount += (await this.inner.provider.getUtxos(address)).filter((u) => u.token?.category === this.categoryId && u.token?.nft?.capability === "mutable" && !!u.token?.nft?.commitment && u.token.nft.commitment.length > 0).length;
      }
      const dynamicWriteSet = new Set(entryAbiFunction?.dynamicWrites ?? []);
      for (const varName of new Set(entryAbiFunction?.dynamicReads ?? [])) {
        if (dynamicWriteSet.has(varName)) continue;
        const variable = stateLayout.variables.find((v) => v.name === varName && v.dynamic);
        if (!variable) continue;
        const address = getDynamicChunkAddress(this.inner, this.categoryId, variable.name, variable.type);
        preservedTrailingCount += (await this.inner.provider.getUtxos(address)).filter((u) => u.token?.category === this.categoryId && u.token?.nft?.capability === "mutable" && !!u.token?.nft?.commitment && u.token.nft.commitment.length > 0).length;
      }
      const entryLayout = entryAbiFunction?.blockLayout;
      let batchPredOutputBase = (overrides?.blockBase ?? 0) + (entryLayout?.trailingBase ?? entryLayout?.blockSize ?? 1) + preservedTrailingCount;
      if (entryLayout?.trailingBase === void 0 && returnEmitOutputIndex < 0 && entryAbiFunction?.blockLayout?.slots.some((slot) => slot.kind === "returnEvent")) {
        batchPredOutputBase -= 1;
      }
      const inactiveFeeSlots = /* @__PURE__ */ new Set();
      for (const access of entryAbiFunction?.entryAccesses ?? []) {
        const label = access.keySources?.[0]?.expressionLabel ?? "";
        const feeProducer = access.keySources?.[0]?.producer?.functionName;
        if (!/functionName=feeTo\b/.test(label) && feeProducer !== "feeTo" && feeProducer !== "feeToAndMigrator") continue;
        const slotIndex = access.slotIndex;
        const collection = stateLayout.collections.find((candidate) => candidate.name === access.collection);
        if (slotIndex === void 0 || collection === void 0) continue;
        const target = batchTargetSlots.get(slotIndex);
        if (target !== void 0 && bytesToSlotValue(target) === bytesToSlotValue(keyToSlotMulti([new Uint8Array(20)], collection))) {
          inactiveFeeSlots.add(slotIndex);
        }
      }
      for (const slotIndex of inactiveFeeSlots) {
        const entry = entryNfts.find((candidate) => candidate.slotIndex === slotIndex);
        if (entry) {
          entry.exists = false;
          entry.utxo = void 0;
        }
      }
      for (const batch of entryAbiFunction?.sortedBatchInfo ?? []) {
        const collection = stateLayout.collections.find((c) => c.name === batch.collection);
        if (!collection) throw new Error(`Unknown vmap batch collection: ${batch.collection}`);
        const inactiveBatchSlots = new Set(batch.slotIndices.filter((slotIndex) => inactiveMessageBusEntrySlots.has(slotIndex) || inactiveFeeSlots.has(slotIndex)));
        if (batch.linear && inactiveBatchSlots.size > 0) {
          throw new Error(`Linear vmap batch '${batch.collection}' cannot contain inactive message-bus slots`);
        }
        const noOpSlots = new Set(batchNoOp ? batch.slotIndices : batch.slotIndices.filter((slotIndex) => settlesByActivity && softDeleteSlots.includes(slotIndex) && absentSoftDelete(slotIndex)));
        const lentSlots = /* @__PURE__ */ new Set();
        const lentOwners = /* @__PURE__ */ new Map();
        const chainedDeleteDefaultTail = defaultSortedEntryValueTail(collection.valueType);
        if (settlesByActivity && batch.slotIndices.length > 1 && batch.slotIndices.some((slotIndex) => softDeleteSlots.includes(slotIndex))) {
          const byNode = /* @__PURE__ */ new Map();
          for (const slotIndex of batch.slotIndices) {
            const spent = entryNfts.find((entry) => entry.slotIndex === slotIndex)?.utxo;
            const uid = spent ? `${spent.txid}:${spent.vout}` : void 0;
            if (uid !== void 0) byNode.set(uid, [...byNode.get(uid) ?? [], slotIndex]);
          }
          for (const members of [...byNode.values()].filter((group) => group.length > 1)) {
            const listed = members.filter((slotIndex) => overrides?.sortedNodeOwners?.includes(slotIndex));
            const first = members.find((slotIndex) => !batchAliasSkips.has(slotIndex)) ?? members[0];
            const owners = listed.length > 0 ? listed : [first];
            if (overrides?.sortedNodeOwners === void 0) {
              sortedNodeOwnerAlternatives.push(...members.filter((member) => member !== first).map((slotIndex) => ({ owners: [slotIndex] })));
              const memberWrites = members.filter((slotIndex) => !softDeleteSlots.includes(slotIndex) && !batchAliasSkips.has(slotIndex));
              if (memberWrites.length > 1) sortedNodeOwnerAlternatives.push({ owners: memberWrites });
              const present = members.filter((slotIndex) => softDeleteSlots.includes(slotIndex) && !noOpSlots.has(slotIndex));
              if (memberWrites.length > 0 && present.length > 0 && chainedDeleteDefaultTail !== void 0) {
                sortedNodeOwnerAlternatives.push({ owners: memberWrites, chainedDeletes: present });
              }
            }
            for (const slotIndex of members.filter((member) => !owners.includes(member))) {
              lentSlots.add(slotIndex);
              lentOwners.set(slotIndex, owners[0]);
              const entry = entryNfts.find((candidate) => candidate.slotIndex === slotIndex);
              entry.exists = false;
              entry.utxo = void 0;
              if (!softDeleteSlots.includes(slotIndex)) runtimeMessageBusAliasSkipSlots.add(slotIndex);
            }
          }
        }
        if (noOpSlots.size === batch.slotIndices.length) {
          const noOpRows = batch.linear ? batch.slotIndices.map((slotIndex) => ({
            slotIndex,
            slot: batchTargetSlots.get(slotIndex),
            next: new Uint8Array(32)
          })).sort((a, b) => bytesToSlotValue(a.slot) < bytesToSlotValue(b.slot) ? -1 : 1) : [];
          const noOpRanks = new Map(noOpRows.map((row, rank) => [row.slotIndex, rank]));
          for (const slotIndex of batch.slotIndices) {
            const offset = entryAbiFunction.blockLayout?.slots.find(
              (slot) => slot.kind === "entry" && slot.slotIndex === slotIndex
            )?.offset;
            if (offset === void 0) throw new Error(`vmap no-op slot has no block offset ${slotIndex}`);
            batchWitnesses.push(
              batchTargetSlots.get(slotIndex),
              BigInt(offset),
              new Uint8Array(32),
              -3n,
              ...batch.linear ? [BigInt(noOpRanks.get(slotIndex))] : []
            );
          }
          if (batch.linear) batchWitnesses.push(Uint8Array.from(noOpRows.flatMap(
            (row) => [...row.slot, ...row.next]
          )));
          continue;
        }
        const collectionEntries = await collectionEntriesFor(collection.signature);
        const list = SortedList.fromUtxos(collectionEntries);
        const readOnlyBatchSlots = new Set(batch.slotIndices.filter((slotIndex) => {
          const operations = entryOperations(slotIndex);
          return operations.includes("read") && !operations.includes("write") && !operations.includes("delete");
        }));
        const settlementSlots = new Map(batch.slotIndices.map((slotIndex) => {
          const target = batchTargetSlots.get(slotIndex);
          const proof = readOnlyBatchSlots.has(slotIndex) ? list.find(target) ?? list.predecessorOf(target) : void 0;
          return [slotIndex, proof?.slot ?? target];
        }));
        const writes = batch.slotIndices.filter((slotIndex) => !batchAliasSkips.has(slotIndex) && !inactiveBatchSlots.has(slotIndex) && !inactiveFeeSlots.has(slotIndex) && !readOnlyBatchSlots.has(slotIndex) && !noOpSlots.has(slotIndex) && !lentSlots.has(slotIndex)).map((slotIndex) => ({ slot: settlementSlots.get(slotIndex), value: new Uint8Array() }));
        if (writes.some((w) => !w.slot)) throw new Error(`vmap batch '${batch.collection}' is missing a target slot`);
        const plan = list.planBatchUpsert(writes);
        const targetValues = new Set(writes.map((w) => bytesToSlotValue(w.slot).toString()));
        for (const slotIndex of readOnlyBatchSlots) {
          if (batchAliasSkips.has(slotIndex) || inactiveBatchSlots.has(slotIndex)) continue;
          const slot = settlementSlots.get(slotIndex);
          const identity = bytesToSlotValue(slot).toString();
          targetValues.add(identity);
          if (plan.outputs.some((output) => bytesToSlotValue(output.slot).toString() === identity)) continue;
          const proof = list.find(slot);
          plan.outputs.push({ slot, commitment: encodeEntryCommitment(slot, proof.nextKey, proof.value), existed: true });
        }
        const predOutputs = plan.outputs.filter((o) => !targetValues.has(bytesToSlotValue(o.slot).toString()));
        for (const slotIndex of overrides?.sortedChainedDeletes ?? []) {
          if (!lentSlots.has(slotIndex)) continue;
          const deleted = bytesToSlotValue(batchTargetSlots.get(slotIndex));
          const at = predOutputs.findIndex((output) => bytesToSlotValue(output.slot) === deleted);
          if (at < 0) continue;
          const node = decodeEntryCommitment(predOutputs[at].commitment);
          predOutputs[at] = {
            ...predOutputs[at],
            commitment: encodeEntryCommitment(
              node.slot,
              node.nextKey,
              chainedDeleteDefaultTail ?? EMPTY_ENTRY_VALUE_TAIL
            )
          };
        }
        if (predOutputs.length > 0) {
          batchPredCommitments.set(batch.collection, predOutputs.map((o) => binToHex(o.commitment)));
        }
        const batchSourceRows = (entryAbiFunction.messageBusRowArguments ?? []).filter((row) => (row.handler.entryAccesses ?? []).some((access) => access.collection === batch.collection));
        const uniqueBatchTargets = new Set(
          batch.slotIndices.filter((slotIndex) => !batchAliasSkips.has(slotIndex) && !inactiveBatchSlots.has(slotIndex)).map((slotIndex) => binToHex(batchTargetSlots.get(slotIndex) ?? new Uint8Array()))
        );
        const compiledBatchSlots = (entryArtifact.messageBus?.route?.sortedBatchInfo ?? []).find((candidate) => candidate.collection === batch.collection)?.slotIndices.length ?? batch.slotIndices.length;
        const singleTargetRowBatch = compiledBatchSlots === 1 && batch.slotIndices.length === 1 && predOutputs.length > 0 && (batchSourceRows.length === 1 || batchSourceRows.length > 1 && overrides?.omitLocalFeeTail !== true) && uniqueBatchTargets.size === 1;
        const chainRows = batch.slotIndices.filter((slotIndex) => !batchAliasSkips.has(slotIndex) && !noOpSlots.has(slotIndex) && !lentSlots.has(slotIndex) && !inactiveBatchSlots.has(slotIndex)).map((slotIndex) => {
          const slot = settlementSlots.get(slotIndex);
          const out = plan.outputs.find((candidate) => bytesToSlotValue(candidate.slot) === bytesToSlotValue(slot));
          if (!out) throw new Error(`vmap batch '${batch.collection}' has no chain row for slot ${slotIndex}`);
          return { slotIndex, slot, next: decodeEntryCommitment(out.commitment).nextKey };
        }).sort((a, b) => bytesToSlotValue(a.slot) < bytesToSlotValue(b.slot) ? -1 : 1);
        const linearRows = batch.linear ? chainRows : [];
        const linearRank = new Map(chainRows.map((row, rank) => [row.slotIndex, rank]));
        const firstPredSlot = /* @__PURE__ */ new Map();
        for (const row of chainRows) {
          const proof = list.find(row.slot) ?? list.predecessorOf(row.slot);
          const proofSlot = bytesToSlotValue(proof.slot).toString();
          if (!firstPredSlot.has(proofSlot)) firstPredSlot.set(proofSlot, row.slotIndex);
        }
        const ownerByUtxo = /* @__PURE__ */ new Map();
        for (const slotIndex of batch.slotIndices) {
          if (noOpSlots.has(slotIndex) || lentSlots.has(slotIndex)) {
            const named = softDeleteSlots.includes(slotIndex) ? lentOwners.get(slotIndex) ?? slotIndex : slotIndex;
            const offset2 = entryAbiFunction.blockLayout?.slots.find(
              (slot2) => slot2.kind === "entry" && slot2.slotIndex === named
            )?.offset;
            if (offset2 === void 0) throw new Error(`vmap no-op slot has no block offset ${slotIndex}`);
            batchWitnesses.push(
              batchTargetSlots.get(slotIndex),
              BigInt(offset2),
              new Uint8Array(32),
              softDeleteSlots.includes(slotIndex) ? -3n : -2n,
              ...batch.linear ? [0n] : []
            );
            continue;
          }
          if (inactiveBatchSlots.has(slotIndex)) {
            const inactive = entryNfts.find((entry) => entry.slotIndex === slotIndex);
            if (inactive) {
              inactive.exists = false;
              inactive.utxo = void 0;
            }
            const raw2 = this._rawVMapBatchWitness?.get(slotIndex);
            const neutralFeeSlot = inactiveFeeSlots.has(slotIndex) ? new Uint8Array(32) : void 0;
            batchWitnesses.push(
              raw2?.slot ?? neutralFeeSlot ?? batchTargetSlots.get(slotIndex),
              raw2?.proof ?? 0n,
              raw2?.next ?? new Uint8Array(32),
              raw2?.predOut ?? -2n
            );
            continue;
          }
          if (batchAliasSkips.has(slotIndex)) {
            const ownerSlot = batchAliasOwners.get(slotIndex);
            if (ownerSlot === void 0) throw new Error(`vmap alias slot has no canonical owner ${slotIndex}`);
            const ownerTarget = batchTargetSlots.get(ownerSlot);
            const ownerProof = list.find(ownerTarget) ?? list.predecessorOf(ownerTarget);
            const physicalOwner = ownerByUtxo.get(`${ownerProof.utxo.txid}:${ownerProof.utxo.vout}`) ?? ownerSlot;
            const ownerOffset = entryAbiFunction.blockLayout?.slots.find(
              (slot2) => slot2.kind === "entry" && slot2.slotIndex === physicalOwner
            )?.offset;
            if (ownerOffset === void 0) throw new Error(`vmap alias owner has no block slot ${ownerSlot}`);
            const raw2 = this._rawVMapBatchWitness?.get(slotIndex);
            const ownerOut = (entryAccessForSlot(slotIndex)?.composeAliasPriorSlots?.length ?? 0) > 0 ? plan.outputs.find((o) => bytesToSlotValue(o.slot) === bytesToSlotValue(ownerTarget)) : void 0;
            batchWitnesses.push(
              raw2?.slot ?? settlementSlots.get(ownerSlot),
              raw2?.proof ?? BigInt(ownerOffset),
              raw2?.next ?? (ownerOut ? decodeEntryCommitment(ownerOut.commitment).nextKey : new Uint8Array(32)),
              raw2?.predOut ?? -2n,
              ...batch.linear ? [raw2?.rank ?? BigInt(linearRank.get(ownerSlot) ?? 0)] : []
            );
            continue;
          }
          const slot = settlementSlots.get(slotIndex);
          const proof = list.find(slot) ?? list.predecessorOf(slot);
          const uid = `${proof.utxo.txid}:${proof.utxo.vout}`;
          let owner = ownerByUtxo.get(uid);
          if (owner === void 0) {
            owner = slotIndex;
            ownerByUtxo.set(uid, owner);
          }
          if (owner !== slotIndex) {
            const duplicate = entryNfts.find((e) => e.slotIndex === slotIndex);
            duplicate.exists = false;
            duplicate.utxo = void 0;
          }
          const offset = entryAbiFunction.blockLayout?.slots.find(
            (s) => s.kind === "entry" && s.slotIndex === owner
          )?.offset;
          if (offset === void 0) throw new Error(`vmap batch '${batch.collection}' has no block slot ${owner}`);
          const out = plan.outputs.find((o) => bytesToSlotValue(o.slot) === bytesToSlotValue(slot));
          if (!out) throw new Error(`vmap batch '${batch.collection}' has no planned output for slot ${slotIndex}`);
          if (readOnlyBatchSlots.has(slotIndex)) {
            batchTargetPlaceholders.set(slotIndex, binToHex(out.commitment));
            exactBatchTargetSlots.add(slotIndex);
            const raw2 = this._rawVMapBatchWitness?.get(slotIndex);
            batchWitnesses.push(
              raw2?.slot ?? slot,
              raw2?.proof ?? BigInt(offset),
              raw2?.next ?? decodeEntryCommitment(out.commitment).nextKey,
              raw2?.predOut ?? -1n,
              ...batch.linear ? [raw2?.rank ?? BigInt(linearRank.get(slotIndex))] : []
            );
            continue;
          }
          const batchAccess = entryAccessForSlot(slotIndex);
          if (!batchAccess) throw new Error(`vmap batch slot has no entry access ${slotIndex}`);
          const routedSourceValueCandidates = selectedRouteRows.flatMap((row) => {
            const access = entryAccessAt(row.handler, slotIndex);
            return access?.collection === batch.collection && access.operations.includes("write") && access.valueSource !== void 0 ? [{ access, args: row.args, inputs: row.handler.inputs }] : [];
          });
          const artifactSourceValueCandidates = routedSourceValueCandidates.length > 0 ? [] : entryArtifact.abi.flatMap((handler) => {
            if (handler.name !== entryAbiFunction?.name || handler.selector && entryAbiFunction?.selector && handler.selector.toLowerCase() !== entryAbiFunction.selector.toLowerCase()) return [];
            const access = entryAccessAt(handler, slotIndex);
            return access?.collection === batch.collection && access.operations.includes("write") && access.valueSource !== void 0 ? [{ access, args: entryArgs, inputs: handler.inputs }] : [];
          });
          const sourceValueCandidates = routedSourceValueCandidates.length > 0 ? routedSourceValueCandidates : artifactSourceValueCandidates;
          const sourceValue = sourceValueCandidates.length === 1 ? sourceValueCandidates[0] : void 0;
          const valueAccess = batchAccess.valueSource !== void 0 ? batchAccess : sourceValue?.access ?? batchAccess;
          const valueArgs = [...sourceValue?.args ?? entryArgs];
          const valueInputs = sourceValue?.inputs ?? entryAbiFunction.inputs;
          const entryDelta = valueAccess.valueSource?.match(
            /^binop:([+-])\(entry,(?:lit:(-?[0-9]+)|id:([A-Za-z_][\w]*))\)$/
          );
          let resolvedWholeValue = valueAccess.valueSource && entryDelta === null && !valueAccess.valueSource.startsWith("loopLast:") && !valueAccess.valueSource.startsWith("new:") && !valueAccess.valueSource.startsWith("call:") && !valueAccess.valueSource.startsWith("arrset(") ? evalComputedKey(valueAccess.valueSource, valueArgs, valueInputs) : void 0;
          if (resolvedWholeValue === void 0 && collection.chunkableValue && valueAccess.valueParam !== void 0) {
            const vIdx = valueInputs.findIndex((input) => input.name === valueAccess.valueParam);
            const rawV = vIdx >= 0 ? valueArgs[vIdx] : void 0;
            if (rawV !== void 0 && !(rawV instanceof Uint8Array) && (Array.isArray(rawV) || typeof rawV === "object")) {
              try {
                resolvedWholeValue = encodePushdataValue(
                  rawV,
                  collection.valueType,
                  stateLayout.structs
                );
              } catch {
                resolvedWholeValue = void 0;
              }
            }
          }
          if (resolvedWholeValue === void 0) {
            const selectedRecipes = activeMessageBusEntryRecipes?.get(slotIndex)?.filter((recipe) => recipe.access.operations.includes("write")) ?? [];
            for (const recipe of selectedRecipes) {
              const source = recipe.access.valueSource;
              if (source === void 0) continue;
              let next;
              try {
                next = evalComputedKey(source, recipe.args, recipe.inputs);
              } catch {
                next = void 0;
              }
              if (next !== void 0) resolvedWholeValue = next;
            }
          }
          if (resolvedWholeValue === void 0 && valueAccess.valueSource?.startsWith("loopLast:id:")) {
            const boundName = valueAccess.valueSource.slice("loopLast:id:".length);
            const bound = valueArgs[valueInputs.findIndex((input) => input.name === boundName)];
            if (typeof bound === "bigint" && bound > 0n) resolvedWholeValue = bigIntToVmNumber(bound - 1n);
          }
          if (resolvedWholeValue === void 0 && (valueAccess.valueSource?.startsWith("new:") || valueAccess.valueSource?.startsWith("call:"))) {
            const constructed2 = valueAccess.valueSource.match(/^(?:new|call):([A-Za-z_][\w]*)\((.*)\)$/);
            if (constructed2) {
              const splitTopLevel = (s) => {
                let depth = 0;
                for (let i = 0; i < s.length; i += 1) {
                  if (s[i] === "(" || s[i] === "[" || s[i] === "{") depth += 1;
                  else if (s[i] === ")" || s[i] === "]" || s[i] === "}") depth -= 1;
                  else if (s[i] === "," && depth === 0) return [s.slice(0, i), s.slice(i + 1)];
                }
                return void 0;
              };
              const parts = [];
              let rest = constructed2[2];
              while (rest.length > 0) {
                const pair = splitTopLevel(rest);
                if (pair === void 0) {
                  parts.push(rest);
                  break;
                }
                parts.push(pair[0]);
                rest = pair[1];
              }
              const fields = [];
              let ok = true;
              let preservedStruct;
              let preservedStructResolved = false;
              const preservedField = (name) => {
                if (!preservedStructResolved) {
                  preservedStructResolved = true;
                  preservedStruct = decodeInlineVmapStruct(
                    list.has(slot) ? list.find(slot).value : void 0,
                    list.has(slot),
                    collection.valueType,
                    collection.chunkableValue === true,
                    stateLayout.structs
                  );
                }
                const fv = preservedStruct?.[name];
                if (typeof fv === "bigint") return fv;
                if (typeof fv === "boolean") return fv ? 1n : 0n;
                return void 0;
              };
              for (const part of parts) {
                const rewritten = substPreservedStructFields(part, batchAccess.collection, preservedField);
                const encoded = rewritten === void 0 ? void 0 : evalComputedKey(rewritten, valueArgs, valueInputs);
                const field = encoded === void 0 ? void 0 : vmNumberToBigInt(encoded, { requireMinimalEncoding: false });
                if (typeof field !== "bigint") {
                  ok = false;
                  break;
                }
                fields.push(field);
              }
              if (ok && fields.length === parts.length) {
                try {
                  resolvedWholeValue = encodePushdataValue(fields, collection.valueType, stateLayout.structs);
                } catch {
                  resolvedWholeValue = void 0;
                }
              }
            }
          }
          if (resolvedWholeValue === void 0 && valueAccess.valueSource?.startsWith("arrset(")) {
            const inner = valueAccess.valueSource.slice("arrset(".length, -1);
            const splitTopLevel = (s) => {
              let depth = 0;
              for (let i = 0; i < s.length; i += 1) {
                if (s[i] === "(" || s[i] === "[" || s[i] === "{") depth += 1;
                else if (s[i] === ")" || s[i] === "]" || s[i] === "}") depth -= 1;
                else if (s[i] === "," && depth === 0) return [s.slice(0, i), s.slice(i + 1)];
              }
              return void 0;
            };
            const pair = splitTopLevel(inner);
            if (pair) {
              const idxEncoded = evalComputedKey(pair[0], valueArgs, valueInputs);
              const valEncoded = evalComputedKey(pair[1], valueArgs, valueInputs);
              const idx = idxEncoded === void 0 ? void 0 : vmNumberToBigInt(idxEncoded, { requireMinimalEncoding: false });
              const val = valEncoded === void 0 ? void 0 : vmNumberToBigInt(valEncoded, { requireMinimalEncoding: false });
              if (typeof idx === "bigint" && typeof val === "bigint" && idx >= 0n) {
                const current = decodeInlineVmapValue(
                  list.has(slot) ? list.find(slot).value : void 0,
                  list.has(slot),
                  collection.valueType,
                  collection.chunkableValue === true,
                  stateLayout.structs
                );
                const n = Number(idx);
                if (Array.isArray(current) && Number.isSafeInteger(n) && n < current.length && current.every((el) => typeof el === "bigint")) {
                  const next = current.slice();
                  next[n] = val;
                  try {
                    resolvedWholeValue = encodePushdataValue(next, collection.valueType, stateLayout.structs);
                  } catch {
                    resolvedWholeValue = void 0;
                  }
                }
              }
            }
          }
          if (resolvedWholeValue === void 0 && entryDelta) {
            const current = list.has(slot) ? vmNumberToBigInt(list.find(slot).value, { requireMinimalEncoding: false }) : 0n;
            const rawDelta = entryDelta[2] !== void 0 ? BigInt(entryDelta[2]) : valueArgs[valueInputs.findIndex((input) => input.name === entryDelta[3])];
            if (typeof current === "bigint" && typeof rawDelta === "bigint") {
              resolvedWholeValue = bigIntToVmNumber(entryDelta[1] === "-" ? current - rawDelta : current + rawDelta);
            }
          }
          if (resolvedWholeValue === void 0 && valueAccess.valueSource?.startsWith("ternary(")) {
            const inner = valueAccess.valueSource.slice("ternary(".length, -1);
            const splitTopLevel = (s) => {
              let depth = 0;
              for (let i = 0; i < s.length; i += 1) {
                if (s[i] === "(" || s[i] === "[" || s[i] === "{") depth += 1;
                else if (s[i] === ")" || s[i] === "]" || s[i] === "}") depth -= 1;
                else if (s[i] === "," && depth === 0) return [s.slice(0, i), s.slice(i + 1)];
              }
              return void 0;
            };
            const head = splitTopLevel(inner);
            const rest = head ? splitTopLevel(head[1]) : void 0;
            if (head && rest) {
              const condBytes = evalComputedKey(head[0], valueArgs, valueInputs);
              const taken = condBytes !== void 0 && condBytes.length > 0;
              if (taken) {
                resolvedWholeValue = evalComputedKey(rest[0], valueArgs, valueInputs);
              } else if (condBytes !== void 0 && rest[1].startsWith("map:") && list.has(slot)) {
                resolvedWholeValue = list.find(slot).value;
              }
            }
          }
          if ([...batchAliasOwners].some(([alias, owner2]) => owner2 === slotIndex && (entryAccessForSlot(alias)?.composeAliasPriorSlots?.length ?? 0) > 0)) resolvedWholeValue = void 0;
          let targetCommitment = out.commitment;
          if (resolvedWholeValue !== void 0) {
            const valueTail = collection.chunkableValue ? encodeChunkableValueTail(resolvedWholeValue) : resolvedWholeValue;
            targetCommitment = encodeEntryCommitment(
              slot,
              decodeEntryCommitment(out.commitment).nextKey,
              valueTail
            );
          } else {
            pendingEntryValueTails.push({
              slotIndex,
              collection: batch.collection,
              slot,
              seed: binToHex(out.commitment),
              next: decodeEntryCommitment(out.commitment).nextKey,
              chunkable: collection.chunkableValue === true
            });
            if (globalThis.process?.env?.SOLIDC_DEBUG_PENDING_VALUE_TAIL === "1") {
              console.error("pending-value-tail-register", JSON.stringify({
                functionName: entryAbiFunction?.name,
                collection: batch.collection,
                slotIndex,
                slot: binToHex(slot).slice(0, 16),
                chunkable: collection.chunkableValue === true,
                valueSource: valueAccess.valueSource,
                seedBytes: out.commitment.length,
                singleTargetRowBatch
              }));
            }
          }
          batchTargetPlaceholders.set(slotIndex, binToHex(targetCommitment));
          if (resolvedWholeValue !== void 0) {
            const completePushIndex = materializeCompletePushValueWitness(
              entryAbiFunction.inputs,
              entryArgs,
              slotIndex,
              resolvedWholeValue
            );
            if (completePushIndex >= 0) {
              if (entryAbiFunction === abiFunction) finalArgs[completePushIndex] = resolvedWholeValue;
              if (entryCompilerRoute) {
                const name = entryAbiFunction.inputs[completePushIndex].name;
                entryCompilerRoute.internalArgs = {
                  ...entryCompilerRoute.internalArgs,
                  [name]: resolvedWholeValue
                };
              }
            }
            exactBatchTargetSlots.add(slotIndex);
          }
          const proofSlot = bytesToSlotValue(proof.slot).toString();
          const predOrdinal = predOutputs.findIndex((o) => bytesToSlotValue(o.slot).toString() === proofSlot);
          const firstLinearPred = firstPredSlot.get(proofSlot) === slotIndex;
          const proofOwner = entryNfts.find((candidate) => candidate.utxo !== void 0 && proof.utxo !== void 0 && candidate.utxo.txid === proof.utxo.txid && candidate.utxo.vout === proof.utxo.vout);
          const proofOwnerOffset = proofOwner === void 0 ? void 0 : entryAbiFunction.blockLayout?.slots.find((candidate) => candidate.kind === "entry" && candidate.slotIndex === proofOwner.slotIndex)?.offset;
          if (globalThis.process?.env?.SOLIDC_DEBUG_PRED === "1") {
            console.error("pred-debug", JSON.stringify({
              functionName,
              slotIndex,
              target: binToHex(batchTargetSlots.get(slotIndex) ?? new Uint8Array()).slice(0, 12),
              proofSlot: proofSlot.slice(0, 12),
              predOrdinal,
              firstLinearPred,
              first: firstPredSlot.get(proofSlot),
              predOutputs: predOutputs.map((o) => binToHex(o.slot).slice(0, 12))
            }));
          }
          const sharedProofOutput = batch.linear !== true;
          const predOut = predOrdinal < 0 || !firstLinearPred && !sharedProofOutput ? -1n : singleTargetRowBatch ? proofOwnerOffset === void 0 ? -1n : BigInt((overrides?.blockBase ?? 0) + proofOwnerOffset) : BigInt(batchPredOutputBase + predOrdinal);
          const raw = this._rawVMapBatchWitness?.get(slotIndex);
          if (raw?.proof === void 0 && proof.utxo !== void 0) {
            topLevelVmapProofUtxos.set(slotIndex, { txid: proof.utxo.txid, vout: proof.utxo.vout });
          }
          batchWitnesses.push(
            raw?.slot ?? slot,
            raw?.proof ?? BigInt(offset),
            raw?.next ?? decodeEntryCommitment(out.commitment).nextKey,
            raw?.predOut ?? predOut,
            ...batch.linear ? [raw?.rank ?? BigInt(linearRank.get(slotIndex))] : []
          );
        }
        if (batch.linear) batchWitnesses.push(
          batch.slotIndices.map((slot) => this._rawVMapBatchWitness?.get(slot)?.rows).find((rows) => rows !== void 0) ?? Uint8Array.from(linearRows.flatMap((row) => [...row.slot, ...row.next]))
        );
        batchPredOutputBase += predOutputs.length;
        batchTrailingCount += predOutputs.length;
        if (singleTargetRowBatch) {
          const target = batchTargetPlaceholders.get(batch.slotIndices[0]);
          if (target !== void 0) batchPredCommitments.set(batch.collection, [target]);
        }
      }
      if ((entryAbiFunction?.sortedBatchInfo?.length ?? 0) > 0) batchWitnesses.push(BigInt(batchTrailingCount));
      if (globalThis.process?.env?.SOLIDC_DEBUG_DYNAMIC_CHUNK_ORDER === "1") {
        console.error("vmap-batch-trailing-plan", JSON.stringify({
          functionName: entryAbiFunction?.name,
          batchTrailingCount,
          batchPredOutputBase,
          preservedTrailingCount,
          batches: (entryAbiFunction?.sortedBatchInfo ?? []).map((batch) => ({
            collection: batch.collection,
            linear: batch.linear === true,
            slots: batch.slotIndices,
            targetSlots: batch.slotIndices.map((slotIndex) => binToHex(batchTargetSlots.get(slotIndex) ?? new Uint8Array()).slice(0, 16)),
            handlerManaged: batch.slotIndices.filter((slotIndex) => entryAbiFunction.messageBusHandlerManagedEntrySlots?.includes(slotIndex) === true),
            rows: (entryAbiFunction.messageBusRowArguments ?? []).map((row, rowIndex) => ({ rowIndex, row })).filter(({ row }) => (row.handler.entryAccesses ?? []).some((access) => access.collection === batch.collection)).map(({ rowIndex, row }) => ({
              rowIndex,
              handler: row.handler.name,
              sourceCallsiteId: row.sourceCallsiteId,
              sourceLogicalIndex: row.sourceLogicalIndex,
              slots: (row.handler.entryAccesses ?? []).filter((access) => access.collection === batch.collection).map((access) => access.slotIndex)
            }))
          }))
        }));
      }
      const batchWitnessNames = (entryAbiFunction?.sortedBatchInfo ?? []).flatMap((batch) => [
        ...batch.slotIndices.flatMap((slotIndex) => [
          `__internal__vmapBatchSlot_${slotIndex}`,
          `__internal__vmapBatchProof_${slotIndex}`,
          `__internal__vmapBatchNext_${slotIndex}`,
          `__internal__vmapBatchPredOut_${slotIndex}`,
          ...batch.linear ? [`__internal__vmapBatchRank_${slotIndex}`] : []
        ]),
        ...batch.linear ? [`__internal__vmapBatchRows_${batch.collection}`] : []
      ]);
      if ((entryAbiFunction?.sortedBatchInfo?.length ?? 0) > 0) {
        batchWitnessNames.push("__internal__vmapBatchTrailingCount");
      }
      if (batchWitnessNames.length !== batchWitnesses.length) {
        throw new Error(
          `Internal error: function '${entryAbiFunction.name}' derived ${batchWitnesses.length} vmap batch values for ${batchWitnessNames.length} named witnesses.`
        );
      }
      entryBatchWitnesses = new Map(batchWitnessNames.map((name, index) => [name, batchWitnesses[index]]));
      if (entryAbiFunction === abiFunction) {
        const positions = batchWitnessNames.map((name) => abiFunction.inputs.findIndex((input) => input.name === name));
        if (positions.some((position) => position < 0)) {
          const missing = batchWitnessNames.filter((_, index) => positions[index] < 0);
          throw new Error(
            `Internal error: function '${abiFunction.name}' does not publish every derived vmap batch witness (${missing.join(", ")}).`
          );
        }
        const lastPosition = Math.max(...positions);
        while (finalArgs.length <= lastPosition) {
          const input = abiFunction.inputs[finalArgs.length];
          if (!input?.name.startsWith("__internal__")) {
            throw new Error(
              `Internal error: cannot place vmap batch witnesses before unresolved user argument '${input?.name ?? finalArgs.length}' in '${abiFunction.name}'.`
            );
          }
          finalArgs.push(defaultInternalFunctionArg(input));
        }
        batchWitnessNames.forEach((name, index) => {
          finalArgs[positions[index]] = entryBatchWitnesses.get(name);
        });
      }
      if (abiFunction?.inputs.some((input) => input.name.startsWith("__internal__valueWitness_"))) {
        const positions = abiFunction.inputs.flatMap((input, index) => {
          const match = /^__internal__valueWitness_(\d+)$/.exec(input.name);
          return match ? [{ ordinal: Number(match[1]), index }] : [];
        });
        const unresolved = [...valueWitnessBySlot.keys()].filter((ordinal) => !positions.some((position) => position.ordinal === ordinal));
        if (unresolved.length > 0) {
          throw new Error(
            `Internal error: function '${abiFunction.name}' resolved value witnesses for entry slot(s) ${unresolved.join(", ")} which it publishes no ABI position for.`
          );
        }
        for (const { ordinal, index: position } of positions) {
          while (finalArgs.length <= position) {
            const input = abiFunction.inputs[finalArgs.length];
            if (!input?.name.startsWith("__internal__")) {
              throw new Error(
                `Internal error: cannot place value witness before unresolved user argument '${input?.name ?? finalArgs.length}' in '${abiFunction.name}'.`
              );
            }
            finalArgs.push(defaultInternalFunctionArg(input));
          }
          finalArgs[position] = valueWitnessBySlot.get(ordinal) ?? new Uint8Array();
        }
      }
      entryValueWitnesses = valueWitnessBySlot;
    }
    const entryDeleteFinalized = finalizeCreateBuilderEntryDeleteSlotsImpl(
      {
        categoryId: this.categoryId,
        inner: this.inner,
        keysMatch: (...a) => this._keysMatch(...a)
      },
      {
        entryNfts,
        entryAccesses,
        entryAccessForSlot,
        entryOperations,
        runtimeMessageBusAliasSkipSlots,
        abiFunction,
        stateLayout
      }
    );
    entryNfts = entryDeleteFinalized.entryNfts;
    const entryDeleteSlots = entryDeleteFinalized.entryDeleteSlots;
    const condSoftDeleteSlots = entryDeleteFinalized.condSoftDeleteSlots;
    const entryNftLockingBytecodes = entryDeleteFinalized.entryNftLockingBytecodes;
    const iterationLoaded = await loadCreateBuilderIterationInputsImpl(
      {
        categoryId: this.categoryId,
        inner: this.inner,
        rawIterationKeysBlob: this._rawIterationKeysBlob,
        iterationKeys: this._iterationKeys,
        rawWindowUtxos: this._rawWindowUtxos,
        getState: () => this.getState()
      },
      {
        abiFunction,
        entryAbiFunction,
        stateLayout,
        overrides,
        finalArgs
      }
    );
    let iterationEntryInputs = iterationLoaded.iterationEntryInputs;
    const dynamicReadChunkInputs = iterationLoaded.dynamicReadChunkInputs;
    finalArgs = iterationLoaded.finalArgs;
    const dynamicReads = iterationLoaded.dynamicReads;
    let sortedLoopCommitments = /* @__PURE__ */ new Map();
    let insertLoopPredecessors = [];
    const runtimeJournalPendingScalar = /* @__PURE__ */ new Map();
    let hasPendingExistingScalarSettlement = false;
    const runtimeLoopEntrySegments = [];
    let kernelJournalSettlementEntrySegments;
    let kernelJournalSettlementOutputPlan;
    let kernelJournalEagerOutputPlan;
    const runtimeJournalInputIds = /* @__PURE__ */ new Set();
    const runtimeJournalMaterializationIntents = [];
    const captureRuntimeJournalInputIntent = (input, collection, allowExistingScalarReuse = false) => {
      const id = `${input.txid}:${input.vout}`;
      if (runtimeJournalInputIds.has(id)) {
        if (allowExistingScalarReuse || deferRuntimeJournalMaterialization) return false;
        throw new Error(
          `Message-bus runtime mapping rows overlap the '${collection}' pre-state journal at ${id}; a read-your-writes transition is required.`
        );
      }
      runtimeJournalInputIds.add(id);
      runtimeJournalMaterializationIntents.push({ kind: "input", input, collection });
      return true;
    };
    const captureRuntimeJournalOutputIntent = (collection, commitments, producers, stream) => {
      if (producers !== void 0 && producers.length !== commitments.length) {
        throw new Error("Kernel journal output commitments and producer identities have different cardinality.");
      }
      runtimeJournalMaterializationIntents.push({ kind: "outputs", collection, commitments, producers, stream });
    };
    const materializeLegacyRuntimeJournalIntents = (start) => {
      if (deferRuntimeJournalMaterialization) return;
      for (const intent of runtimeJournalMaterializationIntents.slice(start)) {
        if (intent.kind === "input") {
          insertLoopPredecessors.push(intent.input);
          continue;
        }
        const prior = sortedLoopCommitments.get(intent.collection) ?? [];
        const offset = prior.length;
        if (intent.materializedOffset !== void 0) {
          throw new Error("Kernel journal eager output intent was materialized more than once.");
        }
        intent.materializedOffset = offset;
        const merged = [...prior, ...intent.commitments];
        sortedLoopCommitments.set(intent.collection, merged);
        for (const pending of runtimeJournalPendingScalar.values()) {
          if (pending.commitments === prior) {
            pending.commitments = merged;
          } else if (pending.commitments === intent.commitments) {
            pending.commitments = merged;
            pending.commitmentIndex += offset;
          }
        }
      }
    };
    {
      const sortedInsertLoaded = await loadCreateBuilderSortedInsertLoopsImpl(
        {
          categoryId: this.categoryId,
          inner: this.inner
        },
        {
          entryAbiFunction,
          stateLayout,
          overrides,
          entryArgs,
          finalArgs,
          iterationEntryInputs,
          sortedLoopCommitments,
          insertLoopPredecessors
        }
      );
      sortedLoopCommitments = sortedInsertLoaded.sortedLoopCommitments;
      insertLoopPredecessors = sortedInsertLoaded.insertLoopPredecessors;
      iterationEntryInputs = sortedInsertLoaded.iterationEntryInputs;
      finalArgs = sortedInsertLoaded.finalArgs;
    }
    const routeRowIndex = (row) => {
      const routeFrames = [
        entryAbiFunction?.messageBusRowArguments,
        entryCompilerRoute?.rowArguments,
        ...(overrides?.calls ?? []).flatMap((call) => call.type === "stateful" && call.compilerRoute ? [call.compilerRoute.rowArguments] : [])
      ];
      for (const rows of routeFrames) {
        const index = rows?.findIndex((candidate) => candidate === row) ?? -1;
        if (index >= 0) return index;
      }
      return -1;
    };
    const selectedRowArgument = (row, name) => {
      if (name.startsWith("__internal__")) return row.internalArgs?.[name];
      const inputs = visibleHandlerInputs(row.handler.inputs);
      const index = inputs.findIndex((input) => input.name === name);
      return index < 0 ? void 0 : row.args[index];
    };
    const runtimeKernelJournalStreams = [];
    const runtimeLoopsByCollection = /* @__PURE__ */ new Map();
    for (const frame of upsertPlanningFrames) {
      for (const info of frame.abiFunction.sortedUpsertLoopInfo ?? []) {
        const frames = runtimeLoopsByCollection.get(info.collection) ?? [];
        if (!frames.includes(frame)) frames.push(frame);
        runtimeLoopsByCollection.set(info.collection, frames);
      }
    }
    for (const [collection, frames] of runtimeLoopsByCollection) {
      if (frames.length < 2) continue;
      const inputName = vmapRuntimeInputCountName(collection);
      const outputName = vmapRuntimeOutputCountName(collection);
      const unthreaded = frames.some((frame) => !frame.abiFunction.inputs.some((input) => input.name === inputName) || !frame.abiFunction.inputs.some((input) => input.name === outputName));
      if (!unthreaded) continue;
      const rows = [...new Set(frames.flatMap((frame) => frame.row === void 0 ? [] : [routeRowIndex(frame.row)]))];
      const rowDescription = rows.length > 0 ? `Message-bus rows ${rows.join(", ")}` : "Runtime loops";
      throw new Error(
        `${rowDescription} both mutate the '${collection}' runtime journal, but at least one loop form does not support threaded collection cardinality; split the loops into separate transactions.`
      );
    }
    const runtimeLoopCardinality = /* @__PURE__ */ new Map();
    const addRuntimeLoopCardinality = (collection, inputs, outputs) => {
      const prior = runtimeLoopCardinality.get(collection) ?? { inputs: 0, outputs: 0 };
      runtimeLoopCardinality.set(collection, {
        inputs: prior.inputs + inputs,
        outputs: prior.outputs + outputs
      });
    };
    for (const [upsertFrameIndex, upsertFrame] of upsertPlanningFrames.entries()) {
      const loopAbiFunction = upsertFrame.abiFunction;
      const loopArgs = upsertFrame.args;
      const replaceLoopArgument = (index, value) => {
        if (upsertFrame.routed) {
          const input = loopAbiFunction.inputs[index];
          if (!input?.name.startsWith("__internal__")) {
            throw new Error(
              `Message-bus runtime loop in '${loopAbiFunction.name}' requires public argument reordering; split this invocation into an order already accepted by the collection topology.`
            );
          }
          const mutableInternal = upsertFrame.row.internalArgs;
          mutableInternal[input.name] = value;
          const routeIndex = entryAbiFunction.inputs.findIndex((candidate) => candidate.name === input.name);
          if (routeIndex < 0) {
            throw new Error(`Message-bus route is missing compiler-owned loop argument '${input.name}'`);
          }
          const rowIndex = routeRowIndex(upsertFrame.row);
          if (rowIndex < 0) throw new Error("Message-bus runtime loop row is missing from its route frame");
          const current = entryArgs[routeIndex];
          const routeValue = Array.isArray(current) ? [...current] : [];
          while (routeValue.length <= rowIndex) routeValue.push([]);
          routeValue[rowIndex] = value;
          entryArgs[routeIndex] = routeValue;
          if (entryCompilerRoute) {
            entryCompilerRoute.internalArgs = {
              ...entryCompilerRoute.internalArgs,
              [input.name]: routeValue
            };
          } else {
            args[routeIndex] = routeValue;
            finalArgs[routeIndex] = routeValue;
          }
          return;
        }
        loopArgs[index] = value;
        finalArgs[index] = value;
      };
      let loopPredicateState = onChainState.state;
      for (const info of loopAbiFunction.sortedUpsertLoopInfo ?? []) {
        const domainKeys = await resolveCreateBuilderUpsertLoopDomainKeysImpl(
          {
            categoryId: this.categoryId,
            inner: this.inner,
            signer: this._signer,
            ...overrides?.callerLockingBytecode !== void 0 && { callerLockingBytecode: overrides.callerLockingBytecode },
            hydrateExternalPredicateState: (...a) => this._hydrateExternalPredicateState(...a),
            evaluateExternalExpression: (...a) => this._evaluateExternalExpression(...a),
            vmapCounterDomain: (...a) => this._vmapCounterDomain(...a)
          },
          {
            info,
            loopAbiFunction,
            upsertFrame,
            loopArgs,
            entryArtifact,
            stateLayout,
            onChainState,
            loopPredicateState,
            executionSelfAddress,
            insertLoopPredecessorsLength: insertLoopPredecessors.length,
            runtimeJournalMaterializationIntentsLength: runtimeJournalMaterializationIntents.length,
            selectedRowArgument,
            replaceLoopArgument
          }
        );
        if (domainKeys.skipped) continue;
        const {
          collection,
          list,
          entryAddr,
          argOf,
          visibleInputs,
          conditionArgs,
          valueTraceDomain,
          sourceOccurrences,
          selectedSourceValues,
          keyTypes,
          encKey,
          keyExpressions,
          varyingKeyIndexSet,
          fixedKeyIndices,
          fixedBins,
          runtimeFiltered,
          runtimeInputStart,
          runtimeJournalIntentStart
        } = domainKeys;
        let keysArr = domainKeys.keysArr;
        loopPredicateState = domainKeys.loopPredicateState;
        const keyTopology = await prepareCreateBuilderUpsertLoopKeyTopologyImpl(
          {
            signer: this._signer,
            vmapCounterStep: (...a) => this._vmapCounterStep(...a),
            hydrateExternalPredicateState: (...a) => this._hydrateExternalPredicateState(...a),
            evaluateExternalExpression: (...a) => this._evaluateExternalExpression(...a)
          },
          {
            info,
            loopAbiFunction,
            entryArtifact,
            entryArgs,
            loopArgs,
            conditionArgs,
            visibleInputs,
            loopPredicateState,
            executionSelfAddress,
            keysArr,
            keyExpressions,
            fixedBins,
            keyTypes,
            encKey,
            fixedKeyIndices,
            varyingKeyIndexSet,
            collection,
            valueTraceDomain,
            selectedSourceValues,
            sourceOccurrences,
            argOf,
            replaceLoopArgument
          }
        );
        keysArr = keyTopology.keysArr;
        loopPredicateState = keyTopology.loopPredicateState;
        const counterSpec = keyTopology.counterSpec;
        const occurrenceOf = keyTopology.occurrenceOf;
        const valueTrace = keyTopology.valueTrace;
        const slotForKey = keyTopology.slotForKey;
        const isDelete = keyTopology.isDelete;
        const toBig = (v) => typeof v === "bigint" ? v : BigInt(v);
        const encodeValueTail = (v) => {
          const vB = v instanceof Uint8Array ? v : typeof v === "string" ? utf8ToBin(v) : encodePushdataValue(v, collection.valueType, stateLayout.structs);
          if (!collection.chunkableValue) return vB;
          return encodeChunkableValueTail(vB);
        };
        const rawValueBytes = (v) => v instanceof Uint8Array ? v : typeof v === "string" ? utf8ToBin(v) : encodePushdataValue(v, collection.valueType, stateLayout.structs);
        const rawScalar = !isDelete && info.valueScalarParam !== void 0 ? argOf(info.valueScalarParam) : void 0;
        const isRawbytesVal = rawScalar !== void 0 && typeof rawScalar !== "bigint" && typeof rawScalar !== "boolean" && typeof rawScalar !== "number";
        const scalarTail = isRawbytesVal ? encodeValueTail(rawScalar) : void 0;
        let scalarAmt;
        if (!isRawbytesVal && !isDelete && info.valueScalarParam !== void 0) {
          scalarAmt = toBig(argOf(info.valueScalarParam));
        } else if (!isRawbytesVal && !isDelete && info.valueConst !== void 0) scalarAmt = BigInt(info.valueConst);
        let perKey = !isRawbytesVal && !isDelete && scalarAmt === void 0;
        let valsArr = perKey ? argOf(info.valueArrayParam) : void 0;
        if (Array.isArray(valsArr) && info.valueArrayIndexParam) {
          const sourceValues = valsArr;
          const logicalIndices = info.valueArrayIndexParam === info.varyingArrayParam ? keysArr : argOf(info.valueArrayIndexParam);
          if (!Array.isArray(logicalIndices)) {
            throw new Error(`vmap upsert loop ${info.collection}: value index array '${info.valueArrayIndexParam}' is missing`);
          }
          valsArr = logicalIndices.map((logicalIndex) => {
            const numeric = typeof logicalIndex === "bigint" ? logicalIndex : BigInt(logicalIndex);
            const index = Number(numeric);
            if (!Number.isSafeInteger(index) || index < 0 || index >= sourceValues.length) {
              throw new Error(`vmap upsert loop ${info.collection}: value index ${numeric} is out of bounds`);
            }
            return sourceValues[index];
          });
        }
        if (valueTrace) {
          valsArr = keysArr.map((key) => valueTrace[occurrenceOf(key)]);
          perKey = true;
        }
        if (info.valueRuntimeExpression) {
          if (info.valueArrayOffset !== void 0 && /^(?:u?int\d*|u?fixed\d*x\d*|bigint)$/.test(collection.valueType)) {
            valsArr = keysArr.map((key) => toBig(key));
          } else {
            valsArr = keysArr.map(() => getDefaultStateValue(collection.valueType, stateLayout.structs));
          }
          perKey = true;
          runtimeExpressionLoopCollections.add(info.collection);
        }
        if (Array.isArray(valsArr) && info.valueArrayOffset !== void 0) {
          valsArr = valsArr.map((v) => toBig(v) + BigInt(info.valueArrayOffset));
        }
        if (info.oldValuesWitnessParam?.startsWith(VMAP_COUNTER_OLD_PREFIX)) {
          const witnessIndex = loopAbiFunction.inputs.findIndex(
            (input) => input.name === info.oldValuesWitnessParam
          );
          if (witnessIndex < 0) {
            throw new Error(`vmap runtime expression loop ${info.collection}: missing old-value witness ABI input`);
          }
          if (upsertFrame.routed && info.op !== "read" && info.fixedKeyParams.length > 0 && keysArr.some((key) => !list.find(slotForKey(key)))) {
            throw new Error(`vmap runtime expression loop ${info.collection}: selected absent old-value witness cannot be materialized as an insertion`);
          }
          const oldValues = await Promise.all(keysArr.map(async (key) => {
            const slot = slotForKey(key);
            const entry = list.find(slot);
            if (collection.valueType === "bool") return entry ? vmNumberToBigInt(entry.value, { requireMinimalEncoding: false }) !== 0n : false;
            const structuredValue = collection.chunkableValue || stateLayout.structs?.some((struct) => struct.name === collection.valueType);
            if (structuredValue) {
              if (!entry) return getDefaultStateValue(collection.valueType, stateLayout.structs);
              const tail = entry.value;
              if (tail.length < 4) {
                throw new Error(`vmap runtime struct value for ${info.collection} has an invalid tail`);
              }
              const len = tail[0] | tail[1] << 8 | tail[2] << 16 | tail[3] << 24;
              let raw;
              if (len <= 60) {
                raw = tail.slice(4, 4 + len);
              } else {
                const root = tail.slice(4, 36);
                const headData = tail.slice(36, 64);
                const chunkAddr = getValueChunkAddress(this.inner, this.categoryId, info.collection, slot, root);
                const chunks = (await this.inner.provider.getUtxos(chunkAddr)).filter((utxo) => utxo.token?.category === this.categoryId && !!utxo.token?.nft?.commitment && utxo.token.nft.commitment.length > 0).map((utxo) => parseValueChunkCommitment(utxo.token.nft.commitment)).sort((left, right) => left.chunkIndex - right.chunkIndex);
                raw = joinValueChunks(headData, chunks, len);
                if (binToHex(sha256Sync(raw)) !== binToHex(root)) {
                  throw new Error("vmap runtime struct value chunks do not match the authenticated root");
                }
                if (info.op !== "read") {
                  valueChunkGc.push({
                    collection: info.collection,
                    slotHex: binToHex(slot),
                    oldDigestHex: binToHex(root)
                  });
                }
              }
              if (collection.valueType === "bytes") return raw;
              if (collection.valueType === "string") return binToUtf8(raw);
              return decodePushdataValue(raw, 0, collection.valueType, stateLayout.structs).value;
            }
            if (!/^(?:u?int\d*|u?fixed\d*x\d*|bigint)$/.test(collection.valueType)) {
              return entry?.value ?? getDefaultStateValue(collection.valueType, stateLayout.structs);
            }
            return entry ? vmNumberToBigInt(entry.value, { requireMinimalEncoding: false }) : 0n;
          }));
          if (info.op === "read" && counterSpec && info.oldValuesWitnessDomain === "selected-source" && !info.sourceOrderIndexParam) {
            const selectedValues = keysArr.map((key, index) => ({
              occurrence: occurrenceOf(key),
              value: oldValues[index]
            })).sort((left, right) => left.occurrence - right.occurrence).map(({ value }) => value);
            replaceLoopArgument(witnessIndex, selectedValues);
          } else if (info.op === "read" && counterSpec && info.oldValuesWitnessDomain === "selected-source") {
            replaceLoopArgument(witnessIndex, oldValues);
          } else if (info.op === "read" && counterSpec) {
            const witnessLength = valueTraceDomain?.length ?? keysArr.reduce((length, key) => Math.max(length, occurrenceOf(key) + 1), 0);
            const logicalValues = Array.from(
              { length: witnessLength },
              () => getDefaultStateValue(collection.valueType, stateLayout.structs)
            );
            keysArr.forEach((key, index) => {
              logicalValues[occurrenceOf(key)] = oldValues[index];
            });
            replaceLoopArgument(witnessIndex, logicalValues);
          } else {
            replaceLoopArgument(witnessIndex, oldValues);
          }
          if (info.op === "read") {
            valsArr = oldValues;
            perKey = true;
          }
        }
        if (info.valueRuntimeExpression && collection.chunkableValue) {
          for (const key of keysArr) addComputedValueChunkRun(info.collection, slotForKey(key));
        }
        let perKeyRawbytes = perKey && Array.isArray(valsArr) && valsArr.length > 0 && (() => {
          const v0 = valsArr[0];
          return !(typeof v0 === "bigint" || typeof v0 === "number" || typeof v0 === "boolean");
        })();
        const commitValue = (nv) => nv instanceof Uint8Array ? nv : scalarTail ?? bigIntToVmNumber(nv);
        if (!Array.isArray(keysArr) || perKey && !info.mutation && !info.valueRuntimeLocal && !Array.isArray(valsArr)) continue;
        if (perKey && !info.mutation && !info.valueRuntimeLocal && valsArr.length !== keysArr.length) {
          throw new Error(`vmap upsert loop ${info.collection}: recipients/amounts length mismatch`);
        }
        const foldActive = info.op === "+" || info.op === "set";
        const publicKeys = !info.varyingArrayParam.startsWith("__internal__");
        const rewriteReason = () => upsertLoopRewriteReason(info);
        const givenKeys = Array.isArray(keysArr) ? [...keysArr] : [];
        const givenValues = Array.isArray(valsArr) ? [...valsArr] : void 0;
        let rangeChecked = false;
        const refuseGivenOrderRangeBreak = () => {
          if (rangeChecked) return;
          rangeChecked = true;
          const range = boundedIntegerRange(collection.valueType);
          if (!info.pairwise || range === void 0 || info.op !== "+" && info.op !== "-") return;
          let sender;
          if (info.senderDebit && this._signer) {
            try {
              sender = keyToSlotMulti([...fixedBins, addressToLockScript(this._signer.getAddress())], collection);
            } catch {
              sender = void 0;
            }
          }
          const slots = new Map(sender === void 0 ? [] : [[binToHex(sender), sender]]);
          const turns = givenKeys.map((key, turn) => {
            const slot = slotForKey(key);
            slots.set(binToHex(slot), slot);
            return { slotHex: binToHex(slot), amount: scalarAmt ?? toBig(givenValues?.[turn]) };
          });
          const broken = givenOrderRangeBreak({
            op: info.op,
            range,
            turns,
            senderSlotHex: sender === void 0 ? void 0 : binToHex(sender),
            current: (slotHex) => {
              const entry = list.find(slots.get(slotHex));
              return entry ? vmNumberToBigInt(entry.value, { requireMinimalEncoding: false }) : 0n;
            }
          });
          if (broken !== void 0) {
            throw new Error(`vmap upsert loop ${info.collection}: under the EVM this call reverts: ${broken}, outside ${collection.valueType}; the SDK would rewrite '${info.varyingArrayParam}' to the order the covenant takes, which need not revert, so it refuses the call`);
          }
        };
        const observableTurns = info.readsWrittenEntry || info.valueRuntimeExpression || info.siblingEffect;
        const turnReason = () => info.readsWrittenEntry ? "each turn reads the entry it writes" : info.siblingEffect ? "each turn has its own effect" : "the value is computed per turn";
        if (!counterSpec && !info.mutation && observableTurns && Array.isArray(keysArr) && keysArr.length > 1) {
          const slotHexes = keysArr.map((key) => binToHex(slotForKey(key)));
          const repeat = slotHexes.findIndex((hex, at) => slotHexes.indexOf(hex) !== at);
          if (repeat >= 0) {
            throw new Error(`vmap upsert loop ${info.collection}: key ${repeat} of '${info.varyingArrayParam}' repeats an earlier key, and ${turnReason()}, so its turns cannot be merged; pass each key once`);
          }
        }
        if (!counterSpec && !info.mutation && Array.isArray(keysArr) && keysArr.length > 1 && !info.valueArrayIndexParam && (isDelete || perKey || info.op === "set")) {
          const kArr = keysArr;
          const slotHexes = kArr.map((key) => binToHex(slotForKey(key)));
          const repeat = slotHexes.findIndex((h, i) => slotHexes.indexOf(h) !== i);
          if (repeat >= 0) {
            if (!info.pairwise) {
              throw new Error(`vmap upsert loop ${info.collection}: key ${repeat} of '${info.varyingArrayParam}' repeats an earlier key, and ${rewriteReason()}, so its turns cannot be merged; pass each key once`);
            }
            refuseGivenOrderRangeBreak();
            const seen = /* @__PURE__ */ new Set();
            const order = [];
            const merged = /* @__PURE__ */ new Map();
            const vArr = perKey ? valsArr : void 0;
            slotHexes.forEach((h, i) => {
              if (!seen.has(h)) {
                seen.add(h);
                order.push(i);
              }
              if (vArr) merged.set(h, info.op === "set" || info.op === "read" ? vArr[i] : toBig(merged.get(h) ?? 0n) + toBig(vArr[i]));
            });
            keysArr = order.map((i) => kArr[i]);
            const recipIdx = loopAbiFunction.inputs.findIndex((p) => p.name === info.varyingArrayParam);
            if (!runtimeFiltered && recipIdx >= 0) replaceLoopArgument(recipIdx, keysArr);
            if (vArr) {
              valsArr = order.map((i) => merged.get(slotHexes[i]));
              const amtIdx = loopAbiFunction.inputs.findIndex((p) => p.name === info.valueArrayParam);
              if (!runtimeFiltered && !info.valueArrayIndexParam && amtIdx >= 0 && info.valueArrayParam !== info.varyingArrayParam) {
                replaceLoopArgument(amtIdx, valsArr);
              }
            }
          }
        }
        if ((info.op === "+" || info.op === "-") && !perKey && !isDelete && Array.isArray(keysArr) && keysArr.length > 1) {
          const kArr = keysArr;
          const slotHexes = kArr.map((key) => binToHex(slotForKey(key)));
          if (slotHexes.some((h, i) => slotHexes.indexOf(h) !== i)) {
            const groups = /* @__PURE__ */ new Map();
            const firstOrder = [];
            slotHexes.forEach((h, i) => {
              if (!groups.has(h)) {
                groups.set(h, []);
                firstOrder.push(h);
              }
              groups.get(h).push(i);
            });
            const grouped = firstOrder.flatMap((h) => groups.get(h));
            if (grouped.some((source, target) => source !== target)) {
              if (publicKeys && !info.pairwise) {
                const repeat = slotHexes.findIndex((h, i) => slotHexes.indexOf(h) !== i);
                throw new Error(`vmap upsert loop ${info.collection}: key ${repeat} of '${info.varyingArrayParam}' repeats an earlier key, whose turns the covenant adds only one after another, so it takes '${info.varyingArrayParam}' only in the order of indices [${grouped.join(", ")}]; the SDK would reorder the call to that order, but ${rewriteReason()}, so the reordered call need not mean what this one means. Pass a repeated key's turns together if that is the call you mean.`);
              }
              keysArr = grouped.map((i) => kArr[i]);
              const recipIdx = loopAbiFunction.inputs.findIndex((p) => p.name === info.varyingArrayParam);
              if (!runtimeFiltered && recipIdx >= 0) replaceLoopArgument(recipIdx, keysArr);
            }
          }
        }
        if (!info.mutation && foldActive && this._signer && Array.isArray(keysArr) && keysArr.length > 0) {
          const debitE = entryNfts.find((e) => e.collection === info.collection && e.exists && e.utxo);
          let senderKey = null;
          try {
            senderKey = addressToLockScript(this._signer.getAddress());
          } catch {
            senderKey = null;
          }
          if (debitE && senderKey) {
            const senderSlotHex = binToHex(keyToSlotMulti([...fixedBins, senderKey], collection));
            const kArr = keysArr;
            const keepIdx = [];
            kArr.forEach((k, i) => {
              if (binToHex(slotForKey(k)) !== senderSlotHex) keepIdx.push(i);
            });
            if (keepIdx.length < kArr.length && info.siblingEffect) {
              throw new Error(`vmap upsert loop ${info.collection}: a credit to the sender itself cannot be netted out because each turn has its own effect; send it as its own call`);
            }
            if (keepIdx.length < kArr.length && !(info.pairwise && info.senderDebit)) {
              const own = kArr.findIndex((_key, i) => !keepIdx.includes(i));
              throw new Error(`vmap upsert loop ${info.collection}: element ${own} of '${info.varyingArrayParam}' credits the sender itself; the covenant co-spends the sender's entry once, for this call's own write to it, so the SDK would leave that turn out, but ${info.pairwise ? "the loop is not proven to debit the sender by the value it credits" : rewriteReason()}, so the shorter call need not mean what this one means. Send the sender's own credit in a call of its own.`);
            }
            if (keepIdx.length < kArr.length) {
              refuseGivenOrderRangeBreak();
              keysArr = keepIdx.map((i) => kArr[i]);
              const recipIdx = loopAbiFunction.inputs.findIndex((p) => p.name === info.varyingArrayParam);
              if (!runtimeFiltered && recipIdx >= 0) replaceLoopArgument(recipIdx, keysArr);
              if (perKey && Array.isArray(valsArr)) {
                const vArr = valsArr;
                valsArr = keepIdx.map((i) => vArr[i]);
                const amtIdx = loopAbiFunction.inputs.findIndex((p) => p.name === info.valueArrayParam);
                if (!runtimeFiltered && !info.valueArrayIndexParam && amtIdx >= 0 && info.valueArrayParam !== info.varyingArrayParam) {
                  replaceLoopArgument(amtIdx, valsArr);
                }
              }
            }
          }
        }
        if (foldActive && Array.isArray(keysArr) && keysArr.length > 1) {
          const kArr = keysArr;
          const slotsB = kArr.map((key) => slotForKey(key));
          const isUpd = slotsB.map((s) => !!list.find(s));
          const updBySlot = /* @__PURE__ */ new Map();
          slotsB.forEach((s, i) => {
            if (isUpd[i]) updBySlot.set(binToHex(s), i);
          });
          const insertsByPred = /* @__PURE__ */ new Map();
          slotsB.forEach((s, i) => {
            if (isUpd[i]) return;
            const ph = binToHex(list.predecessorOf(s).slot);
            if (!insertsByPred.has(ph)) insertsByPred.set(ph, []);
            insertsByPred.get(ph).push(i);
          });
          let needsReorder = false;
          for (const [ph, arr] of insertsByPred) if (arr.length > 1 || updBySlot.has(ph)) needsReorder = true;
          if (needsReorder) {
            for (const [, arr] of insertsByPred) {
              arr.sort((a, b) => {
                const [left, right] = [bytesToSlotValue(slotsB[a]), bytesToSlotValue(slotsB[b])];
                return left < right ? -1 : left > right ? 1 : 0;
              });
            }
            const order = [];
            const placed = /* @__PURE__ */ new Set();
            const emitGap = (ph) => {
              for (const r of insertsByPred.get(ph) ?? []) if (!placed.has(r)) {
                order.push(r);
                placed.add(r);
              }
            };
            for (let i = 0; i < kArr.length; i++) {
              if (placed.has(i)) continue;
              if (isUpd[i]) {
                order.push(i);
                placed.add(i);
                emitGap(binToHex(slotsB[i]));
                continue;
              }
              const ph = binToHex(list.predecessorOf(slotsB[i]).slot);
              if (updBySlot.has(ph)) continue;
              emitGap(ph);
            }
            for (let i = 0; i < kArr.length; i++) if (!placed.has(i)) {
              order.push(i);
              placed.add(i);
            }
            const permutes = order.some((sourceIndex, targetIndex) => sourceIndex !== targetIndex);
            if (runtimeFiltered && permutes) {
              throw new Error(`vmap upsert loop ${info.collection}: predicate-selected keys require topology reordering; split the action sequence so each selected mapping transition is already adjacent.`);
            }
            if (permutes && publicKeys && !info.pairwise) {
              throw new Error(`vmap upsert loop ${info.collection}: the covenant takes '${info.varyingArrayParam}' only in the order of indices [${order.join(", ")}], a gap's new keys one after another in ascending slot order and each right after the credited entry it follows; the SDK would reorder the call to that order, but ${rewriteReason()}, so the reordered call need not mean what this one means. Pass '${info.varyingArrayParam}' in that order if that is the call you mean.`);
            }
            if (permutes) refuseGivenOrderRangeBreak();
            keysArr = order.map((i) => kArr[i]);
            const recipIdx = loopAbiFunction.inputs.findIndex((p) => p.name === info.varyingArrayParam);
            if (!runtimeFiltered && recipIdx >= 0) replaceLoopArgument(recipIdx, keysArr);
            for (const [pname, indexName] of [
              [info.mutationValueArrayParam, info.mutationValueArrayIndexParam],
              [info.mutationIndexArrayParam, info.mutationIndexArrayIndexParam]
            ]) {
              if (!pname) continue;
              if (indexName) continue;
              const pi = loopAbiFunction.inputs.findIndex((p) => p.name === pname);
              const pv = pi >= 0 ? loopArgs[pi] : void 0;
              if (Array.isArray(pv)) {
                const reordered = order.map((i) => pv[i]);
                if (!runtimeFiltered) {
                  replaceLoopArgument(pi, reordered);
                }
              }
            }
            if (perKey && Array.isArray(valsArr)) {
              const vArr = valsArr;
              valsArr = order.map((i) => vArr[i]);
              const amtIdx = loopAbiFunction.inputs.findIndex((p) => p.name === info.valueArrayParam);
              if (!runtimeFiltered && !info.valueArrayIndexParam && amtIdx >= 0 && info.valueArrayParam !== info.varyingArrayParam) {
                replaceLoopArgument(amtIdx, valsArr);
              }
            }
          }
        }
        const journalArgumentIndex = loopAbiFunction.inputs.findIndex(
          (input) => input.name === KERNEL_JOURNAL_ACCESS_STREAMS
        );
        if (journalArgumentIndex >= 0) {
          const journalSourceOccurrences = sourceOccurrences ?? (counterSpec ? keysArr.map((_key, occurrence) => occurrence) : void 0);
          const streamIndex = info.journalAccessStreamIndex;
          const streamCount = loopAbiFunction.sortedUpsertLoopInfo?.length ?? 0;
          if (!Number.isSafeInteger(streamIndex) || streamIndex < 0 || streamIndex >= streamCount) {
            throw new Error(
              `Kernel runtime loop in '${loopAbiFunction.name}' has invalid journal stream ordinal ${streamIndex}.`
            );
          }
          const operation = info.op === "read" ? "read" : info.op === "delete" ? "nullify" : "write";
          runtimeKernelJournalStreams.push({
            collection: info.collection,
            collectionHash: computeCollectionHash(collection.signature),
            frameIndex: upsertFrameIndex,
            executionGroup: Number.isSafeInteger(info.journalExecutionGroup) && info.journalExecutionGroup >= 0 ? info.journalExecutionGroup : info.journalAccessStreamIndex,
            executionOrder: info.journalAccessStreamIndex,
            accessStreamIndex: info.journalAccessStreamIndex,
            ...info.settlementIdentity && { settlementIdentity: info.settlementIdentity },
            ...journalSourceOccurrences && { sourceOccurrences: journalSourceOccurrences },
            list,
            writes: keysArr.map((key) => ({ slot: slotForKey(key), operation })),
            publish: (encoded) => {
              const current = argOf(KERNEL_JOURNAL_ACCESS_STREAMS);
              const initialized = current === void 0 || Array.isArray(current) && current.length === 0 ? kernelJournalAccessStreamPlaceholders(loopAbiFunction) : current;
              if (!Array.isArray(initialized) || initialized.length !== streamCount || initialized.some((stream) => !(stream instanceof Uint8Array))) {
                const actual = !Array.isArray(initialized) ? typeof initialized : `${initialized.length} (${initialized.map((stream) => stream instanceof Uint8Array ? "bytes" : typeof stream).join(", ")})`;
                throw new Error(
                  `Kernel handler '${loopAbiFunction.name}' requires ${streamCount} journal access streams; received ${actual}.`
                );
              }
              const streams = [...initialized];
              streams[streamIndex] = encoded;
              replaceLoopArgument(journalArgumentIndex, streams);
            }
          });
        }
        if (info.valueRuntimeLocal) {
          const oldWitnesses = [];
          const runtimeSlots = /* @__PURE__ */ new Set();
          const consumedInputs = /* @__PURE__ */ new Set();
          let outputCount = 0;
          let deferred;
          const runtimeUnlocker = createEntryNftUnlocker(
            this.inner,
            overrides?.blockBase ?? 0,
            this.categoryId,
            info.collection
          );
          for (let i = 0; i < keysArr.length; i++) {
            const slot = slotForKey(keysArr[i]);
            const slotHex = binToHex(slot);
            if (runtimeSlots.has(slotHex)) {
              throw new Error(`vmap runtime struct loop ${info.collection}: duplicate keys require a journaled read-your-writes transition and cannot be co-spent twice`);
            }
            runtimeSlots.add(slotHex);
            const entry = list.find(slot);
            let raw;
            if (entry) {
              const inputId = `${entry.utxo.txid}:${entry.utxo.vout}`;
              if (consumedInputs.has(inputId)) {
                throw new Error(`vmap runtime struct loop ${info.collection}: entry ${i} is already co-spent`);
              }
              consumedInputs.add(inputId);
              captureRuntimeJournalInputIntent({ ...entry.utxo, unlocker: runtimeUnlocker }, info.collection);
              const tail = entry.value;
              if (tail.length < 4) throw new Error(`vmap runtime struct value for ${info.collection} has an invalid tail`);
              const len = tail[0] | tail[1] << 8 | tail[2] << 16 | tail[3] << 24;
              if (len <= 60) {
                raw = tail.slice(4, 4 + len);
              } else {
                const root = tail.slice(4, 36);
                const headData = tail.slice(36, 64);
                const chunkAddr = getValueChunkAddress(this.inner, this.categoryId, info.collection, slot, root);
                const chunks = (await this.inner.provider.getUtxos(chunkAddr)).filter((utxo) => utxo.token?.category === this.categoryId && !!utxo.token?.nft?.commitment && utxo.token.nft.commitment.length > 0).map((utxo) => parseValueChunkCommitment(utxo.token.nft.commitment)).sort((a, b) => a.chunkIndex - b.chunkIndex);
                raw = joinValueChunks(headData, chunks, len);
                if (binToHex(sha256Sync(raw)) !== binToHex(root)) {
                  throw new Error("vmap runtime struct value chunks do not match the authenticated root");
                }
                valueChunkGc.push({ collection: info.collection, slotHex, oldDigestHex: binToHex(root) });
              }
              deferred = { slot: entry.slot, nextKey: entry.nextKey };
              outputCount += 1;
            } else {
              raw = encodePushdataValue(
                getDefaultStateValue(collection.valueType, stateLayout.structs),
                collection.valueType,
                stateLayout.structs
              );
              const predecessor = list.predecessorOf(slot);
              const slotValue = bytesToSlotValue(slot);
              const rePointsDeferred = deferred !== void 0 && bytesToSlotValue(deferred.slot) < slotValue && (bytesToSlotValue(deferred.nextKey) === 0n || slotValue < bytesToSlotValue(deferred.nextKey));
              if (rePointsDeferred) {
                deferred = { slot, nextKey: deferred.nextKey };
                outputCount += 1;
              } else {
                const inputId = `${predecessor.utxo.txid}:${predecessor.utxo.vout}`;
                if (consumedInputs.has(inputId)) {
                  throw new Error(`vmap runtime struct loop ${info.collection}: absent key ${i} shares a non-adjacent predecessor`);
                }
                consumedInputs.add(inputId);
                captureRuntimeJournalInputIntent({ ...predecessor.utxo, unlocker: runtimeUnlocker }, info.collection);
                deferred = { slot, nextKey: predecessor.nextKey };
                outputCount += 2;
              }
            }
            oldWitnesses.push(info.oldValuesWitnessParam?.startsWith(VMAP_COUNTER_OLD_PREFIX) ? decodePushdataValue(raw, 0, collection.valueType, stateLayout.structs).value : raw);
          }
          const witnessIndex = loopAbiFunction.inputs.findIndex((input) => input.name === info.oldValuesWitnessParam);
          if (witnessIndex < 0) {
            throw new Error(`vmap runtime struct loop ${info.collection}: missing old-value witness ABI input`);
          }
          replaceLoopArgument(witnessIndex, oldWitnesses);
          const priorOutputCount = runtimeLoopDerivedCounts.get(info.collection) ?? 0;
          runtimeLoopDerivedCounts.set(info.collection, priorOutputCount + outputCount);
          if (upsertFrame.routed && selectedUpsertRows.length > 1 && outputCount > 0) {
            const rowIndex = routeRowIndex(upsertFrame.row);
            if (rowIndex < 0) throw new Error("Message-bus runtime loop row is missing from its route frame");
            runtimeLoopEntrySegments.push({
              rowIndex,
              collection: info.collection,
              offset: priorOutputCount,
              count: outputCount
            });
          }
          materializeLegacyRuntimeJournalIntents(runtimeJournalIntentStart);
          addRuntimeLoopCardinality(
            info.collection,
            insertLoopPredecessors.length - runtimeInputStart,
            outputCount
          );
          if (collection.chunkableValue) {
            for (const key of keysArr) addComputedValueChunkRun(info.collection, slotForKey(key));
          }
          continue;
        }
        if (info.mutation) {
          const mutationExpressions = [
            info.mutationValueExpression,
            info.mutationIndexExpression
          ].filter((expression) => expression !== void 0);
          if (mutationExpressions.length > 0) {
            loopPredicateState = await this._hydrateExternalPredicateState(
              mutationExpressions,
              conditionArgs,
              entryArtifact,
              loopPredicateState,
              visibleInputs,
              executionSelfAddress,
              keysArr.map(occurrenceOf)
            );
          }
          const readRawValue = async (slot) => {
            const entry = list.find(slot);
            if (!entry) return encodePushdataValue([], collection.valueType, stateLayout.structs);
            const tail = entry.value;
            if (tail.length < 4) throw new Error(`vmap array value for ${info.collection} has an invalid tail`);
            const len = tail[0] | tail[1] << 8 | tail[2] << 16 | tail[3] << 24;
            if (len <= 60) return tail.slice(4, 4 + len);
            const root = tail.slice(4, 36);
            const headData = tail.slice(36, 64);
            const chunkAddr = getValueChunkAddress(this.inner, this.categoryId, info.collection, slot, root);
            const chunks = (await this.inner.provider.getUtxos(chunkAddr)).filter((u) => u.token?.category === this.categoryId && !!u.token?.nft?.commitment && u.token.nft.commitment.length > 0).map((u) => parseValueChunkCommitment(u.token.nft.commitment)).sort((a, b) => a.chunkIndex - b.chunkIndex);
            const raw = joinValueChunks(headData, chunks, len);
            if (binToHex(sha256Sync(raw)) !== binToHex(root)) {
              throw new Error("vmap value chunks do not match the authenticated root");
            }
            return raw;
          };
          const operand = (arrayName, arrayIndexName, scalarName, constant, expression, i) => {
            const av = argOf(arrayName);
            if (arrayName && Array.isArray(av)) {
              const indices = arrayIndexName === info.varyingArrayParam ? keysArr : argOf(arrayIndexName);
              const rawIndex = Array.isArray(indices) ? indices[i] : i;
              const index = Number(typeof rawIndex === "bigint" ? rawIndex : BigInt(rawIndex));
              if (!Number.isSafeInteger(index) || index < 0 || index >= av.length) {
                throw new Error(`vmap array mutation ${info.collection}: operand index ${String(rawIndex)} out of bounds`);
              }
              return av[index];
            }
            if (scalarName) return argOf(scalarName);
            if (constant !== void 0) return BigInt(constant);
            if (expression) {
              const value = this._evaluateExternalExpression(
                expression,
                conditionArgs,
                entryArtifact,
                loopPredicateState,
                visibleInputs,
                void 0,
                occurrenceOf(keysArr[i]),
                false,
                executionSelfAddress
              );
              if (value === void 0) {
                throw new Error(`vmap array mutation ${info.collection}: could not resolve operand expression`);
              }
              return value;
            }
            return void 0;
          };
          const oldWitnesses = [];
          const mutated = [];
          const pendingArrays = /* @__PURE__ */ new Map();
          for (let i = 0; i < keysArr.length; i++) {
            const slot = slotForKey(keysArr[i]);
            const slotHex = binToHex(slot);
            const pending = pendingArrays.get(slotHex);
            const raw = pending === void 0 ? await readRawValue(slot) : void 0;
            const decoded = pending ?? decodePushdataValue(
              raw,
              0,
              collection.valueType,
              stateLayout.structs
            ).value;
            if (!Array.isArray(decoded)) throw new Error(`vmap mutation target ${info.collection} is not an array`);
            oldWitnesses.push([...decoded]);
            const next = [...decoded];
            if (info.mutation === "push") {
              next.push(operand(
                info.mutationValueArrayParam,
                info.mutationValueArrayIndexParam,
                info.mutationValueScalarParam,
                info.mutationValueConst,
                info.mutationValueExpression,
                i
              ));
            } else if (info.mutation === "pop") {
              if (next.length === 0) throw new Error(`vmap array mutation ${info.collection}: pop from empty array`);
              next.pop();
            } else {
              const rawIndex = operand(
                info.mutationIndexArrayParam,
                info.mutationIndexArrayIndexParam,
                info.mutationIndexScalarParam,
                info.mutationIndexConst,
                info.mutationIndexExpression,
                i
              );
              const index = Number(typeof rawIndex === "bigint" ? rawIndex : BigInt(rawIndex));
              if (!Number.isSafeInteger(index) || index < 0 || index >= next.length) {
                throw new Error(`vmap array mutation ${info.collection}: index ${index} out of bounds`);
              }
              next[index] = operand(
                info.mutationValueArrayParam,
                info.mutationValueArrayIndexParam,
                info.mutationValueScalarParam,
                info.mutationValueConst,
                info.mutationValueExpression,
                i
              );
            }
            mutated.push(next);
            pendingArrays.set(slotHex, next);
          }
          const wi = loopAbiFunction.inputs.findIndex((p) => p.name === info.oldValuesWitnessParam);
          if (wi < 0) throw new Error(`vmap array mutation ${info.collection}: missing old-value witness ABI input`);
          replaceLoopArgument(wi, oldWitnesses);
          valsArr = mutated;
          perKey = true;
          perKeyRawbytes = true;
        }
        const wUnlocker = createEntryNftUnlocker(
          this.inner,
          overrides?.blockBase ?? 0,
          this.categoryId,
          info.collection
        );
        const commitments = [];
        const commitmentProducers = [];
        const commitmentProducer = (accessOrdinal, recordRole) => ({
          frameIndex: upsertFrameIndex,
          accessStreamIndex: info.journalAccessStreamIndex,
          accessOrdinal,
          recordRole
        });
        const seenSlots = /* @__PURE__ */ new Set();
        const cospent = /* @__PURE__ */ new Set();
        const uidOf = (u) => `${u.txid}:${u.vout}`;
        let priorReadProof;
        for (const e of entryNfts) {
          if (e.collection === info.collection && e.exists && e.utxo) cospent.add(uidOf(e.utxo));
        }
        const debitEntry = entryNfts.find((e) => e.collection === info.collection && e.exists && e.utxo);
        let mergedNewCount = 0;
        let lastDeferred = null;
        for (let i = 0; i < keysArr.length; i++) {
          const slot = slotForKey(keysArr[i]);
          const slotHex = binToHex(slot);
          const loopRawValue = collection.chunkableValue && info.op === "set" ? rawValueBytes(perKeyRawbytes ? valsArr[i] : rawScalar) : void 0;
          if (loopRawValue && loopRawValue.length > 60) {
            loopValueChunkMints.push({
              collection: info.collection,
              slot,
              digest: sha256Sync(loopRawValue),
              chunks: splitValueIntoValueChunks(loopRawValue)
            });
          }
          const amt = perKeyRawbytes ? encodeValueTail(valsArr[i]) : isRawbytesVal ? 0n : isDelete ? 0n : scalarAmt !== void 0 ? scalarAmt : toBig(valsArr[i]);
          if (seenSlots.has(slotHex)) {
            if (kernelReadCarrierOwnsDuplicateProof(deferRuntimeJournalMaterialization, info.op)) continue;
            if ((info.op === "+" || info.op === "-") && !isDelete && lastDeferred && binToHex(lastDeferred.slot) === slotHex) {
              lastDeferred.newVal = lastDeferred.newVal + (info.op === "-" ? -amt : amt);
              commitments[lastDeferred.commitIndex] = binToHex(encodeEntryCommitment(lastDeferred.slot, lastDeferred.oldNext, commitValue(lastDeferred.newVal)));
              commitmentProducers[lastDeferred.commitIndex] = commitmentProducer(i, "target");
              continue;
            }
            if ((info.op === "set" || isDelete) && lastDeferred && binToHex(lastDeferred.slot) === slotHex) {
              lastDeferred.newVal = amt;
              commitments[lastDeferred.commitIndex] = binToHex(encodeEntryCommitment(lastDeferred.slot, lastDeferred.oldNext, commitValue(amt)));
              commitmentProducers[lastDeferred.commitIndex] = commitmentProducer(i, "target");
              continue;
            }
            throw new Error(`vmap upsert loop ${info.collection}: duplicate recipient (each entry can be co-spent once)`);
          }
          seenSlots.add(slotHex);
          const journalSettledScalar = journalArgumentIndex >= 0 && !collection.chunkableValue && /^(?:u?int\d*|u?fixed\d*x\d*|bigint)$/.test(collection.valueType) && (info.op === "+" || info.op === "-" || info.op === "set" || isDelete);
          const originalEntry = list.find(slot);
          const journalIdentity = `${info.collectionHash}:${entryAddr}:${slotHex}`;
          const priorPending = journalSettledScalar ? runtimeJournalPendingScalar.get(journalIdentity) : void 0;
          if (originalEntry || priorPending) {
            const entry = originalEntry;
            if (entry && cospent.has(uidOf(entry.utxo)) && !priorPending && !kernelReadCarrierOwnsDuplicateProof(deferRuntimeJournalMaterialization, info.op)) {
              throw new Error(
                `vmap upsert loop ${info.collection}: recipient ${i}'s entry is already co-spent this tx; a read-your-writes transition is required`
              );
            }
            if (entry) cospent.add(uidOf(entry.utxo));
            const oldVal = priorPending?.value ?? (info.op === "+" || info.op === "-" ? vmNumberToBigInt(entry.value, { requireMinimalEncoding: false }) : 0n);
            const newVal = isDelete ? 0n : info.op === "set" || info.op === "read" ? amt : info.op === "-" ? oldVal - amt : oldVal + amt;
            if (priorPending) {
              if (!priorPending.commitments[priorPending.commitmentIndex]) {
                throw new Error("Kernel pending scalar journal lost its first-touch output");
              }
              priorPending.value = newVal;
              priorPending.commitments[priorPending.commitmentIndex] = binToHex(encodeEntryCommitment(
                priorPending.slot,
                priorPending.nextKey,
                commitValue(priorPending.value)
              ));
              if (deferRuntimeJournalMaterialization) {
                if (!priorPending.producers) {
                  throw new Error("Kernel pending scalar journal lost its deferred producer vector");
                }
                priorPending.producers[priorPending.commitmentIndex] = commitmentProducer(i, "target");
              }
              continue;
            }
            if (!entry) throw new Error("Kernel pending scalar entry lost its transaction-local carrier.");
            captureRuntimeJournalInputIntent({ ...entry.utxo, unlocker: wUnlocker }, info.collection, journalSettledScalar);
            if (collection.chunkableValue && info.op !== "read") {
              const oldTail = entry.value;
              if (oldTail.length >= 36 && (oldTail[0] | oldTail[1] << 8 | oldTail[2] << 16 | oldTail[3] << 24) > 60) {
                valueChunkGc.push({
                  collection: info.collection,
                  slotHex,
                  oldDigestHex: binToHex(oldTail.slice(4, 36))
                });
              }
            }
            if (foldActive || info.op === "-" || isDelete) {
              lastDeferred = {
                uid: uidOf(entry.utxo),
                commitIndex: commitments.length,
                slot: entry.slot,
                newVal,
                oldNext: entry.nextKey
              };
            }
            commitments.push(binToHex(encodeEntryCommitment(entry.slot, entry.nextKey, commitValue(newVal))));
            commitmentProducers.push(commitmentProducer(i, "target"));
            if (journalSettledScalar && !deferRuntimeJournalMaterialization) {
              hasPendingExistingScalarSettlement = true;
            }
            if (info.op === "read") {
              priorReadProof = {
                uid: uidOf(entry.utxo),
                slot: entry.slot,
                nextKey: entry.nextKey
              };
            }
          } else {
            if (info.op === "-") {
              throw new Error(`vmap upsert loop ${info.collection}: cannot debit key ${i} - it has no entry`);
            }
            const basePred = list.predecessorOf(slot);
            if (isDelete) {
              const predecessorId = uidOf(basePred.utxo);
              if (cospent.has(predecessorId)) {
                throw new Error(`vmap delete loop ${info.collection}: absent key ${i} shares an already co-spent predecessor; a shared absence proof is required`);
              }
              cospent.add(predecessorId);
              captureRuntimeJournalInputIntent({ ...basePred.utxo, unlocker: wUnlocker }, info.collection);
              commitments.push(binToHex(encodeEntryCommitment(basePred.slot, basePred.nextKey, basePred.value)));
              commitmentProducers.push(commitmentProducer(i, "predecessor"));
              continue;
            }
            let pendingPred;
            if (journalSettledScalar) {
              const targetSlotValue = bytesToSlotValue(slot);
              for (const [identity, candidate] of runtimeJournalPendingScalar) {
                const candidateSlotValue = bytesToSlotValue(candidate.slot);
                const candidateNextValue = bytesToSlotValue(candidate.nextKey);
                const bracketsTarget = candidateSlotValue < targetSlotValue && (candidateNextValue === 0n || targetSlotValue < candidateNextValue);
                if (identity.startsWith(`${info.collectionHash}:${entryAddr}:`) && bracketsTarget && (!pendingPred || bytesToSlotValue(pendingPred.slot) < candidateSlotValue)) {
                  pendingPred = candidate;
                }
              }
            }
            if (info.op === "read") {
              const predecessorId = uidOf(basePred.utxo);
              const slotValue = bytesToSlotValue(slot);
              const reusesPriorProof = priorReadProof?.uid === predecessorId && bytesToSlotValue(priorReadProof.slot) < slotValue && (bytesToSlotValue(priorReadProof.nextKey) === 0n || slotValue < bytesToSlotValue(priorReadProof.nextKey));
              if (reusesPriorProof) continue;
              if (cospent.has(predecessorId) && !kernelReadCarrierOwnsDuplicateProof(deferRuntimeJournalMaterialization, info.op)) {
                throw new Error(`vmap read loop ${info.collection}: absent key ${i} shares an already co-spent predecessor; a shared absence proof is required`);
              }
              cospent.add(predecessorId);
              captureRuntimeJournalInputIntent({ ...basePred.utxo, unlocker: wUnlocker }, info.collection);
              commitments.push(binToHex(encodeEntryCommitment(basePred.slot, basePred.nextKey, basePred.value)));
              commitmentProducers.push(commitmentProducer(i, "predecessor"));
              priorReadProof = { uid: predecessorId, slot: basePred.slot, nextKey: basePred.nextKey };
              continue;
            }
            const deferred = lastDeferred;
            lastDeferred = null;
            if (foldActive && deferred) {
              const d = deferred;
              const sV = bytesToSlotValue(slot);
              const pV = bytesToSlotValue(d.slot);
              const nV = bytesToSlotValue(d.oldNext);
              if (pV < sV && (nV === 0n || sV < nV)) {
                commitments[d.commitIndex] = binToHex(encodeEntryCommitment(d.slot, slot, commitValue(d.newVal)));
                commitmentProducers[d.commitIndex] = commitmentProducer(i, "predecessor");
                const newCommitIndex = commitments.length;
                commitments.push(binToHex(encodeEntryCommitment(slot, d.oldNext, commitValue(amt))));
                commitmentProducers.push(commitmentProducer(i, "target"));
                const chained = { uid: "", commitIndex: newCommitIndex, slot, newVal: amt, oldNext: d.oldNext };
                lastDeferred = chained;
                continue;
              }
            }
            if (pendingPred) {
              const oldNext = pendingPred.nextKey;
              pendingPred.nextKey = slot;
              pendingPred.commitments[pendingPred.commitmentIndex] = binToHex(encodeEntryCommitment(
                pendingPred.slot,
                slot,
                commitValue(pendingPred.value)
              ));
              if (deferRuntimeJournalMaterialization) {
                if (!pendingPred.producers) {
                  throw new Error("Kernel pending predecessor lost its deferred producer vector");
                }
                pendingPred.producers[pendingPred.commitmentIndex] = commitmentProducer(i, "predecessor");
              }
              const pendingCommitmentIndex = commitments.length;
              commitments.push(binToHex(encodeEntryCommitment(slot, oldNext, commitValue(amt))));
              commitmentProducers.push(commitmentProducer(i, "target"));
              lastDeferred = {
                uid: "",
                commitIndex: pendingCommitmentIndex,
                slot,
                newVal: amt,
                oldNext
              };
              continue;
            }
            if (debitEntry && uidOf(debitEntry.utxo) === uidOf(basePred.utxo)) {
              if (mergedNewCount >= 1) {
                throw new Error(`vmap upsert loop ${info.collection}: two non-adjacent new recipients in the debited sender's gap - split into separate transactions.`);
              }
              mergedNewCount += 1;
              const mCommitIndex = commitments.length;
              commitments.push(binToHex(encodeEntryCommitment(slot, basePred.nextKey, commitValue(amt))));
              commitmentProducers.push(commitmentProducer(i, "target"));
              lastDeferred = { uid: "", commitIndex: mCommitIndex, slot, newVal: amt, oldNext: basePred.nextKey };
              continue;
            }
            if (cospent.has(uidOf(basePred.utxo))) {
              throw new Error(`vmap upsert loop ${info.collection}: new recipient ${i}'s bracketing predecessor is already co-spent in this tx (a non-adjacent credited recipient, or another new recipient in the same gap). Reorder so the predecessor is credited immediately before, or split into separate transactions.`);
            }
            cospent.add(uidOf(basePred.utxo));
            captureRuntimeJournalInputIntent({ ...basePred.utxo, unlocker: wUnlocker }, info.collection);
            commitments.push(binToHex(encodeEntryCommitment(basePred.slot, slot, basePred.value)));
            commitmentProducers.push(commitmentProducer(i, "predecessor"));
            const uCommitIndex = commitments.length;
            commitments.push(binToHex(encodeEntryCommitment(slot, basePred.nextKey, commitValue(amt))));
            commitmentProducers.push(commitmentProducer(i, "target"));
            if (foldActive) lastDeferred = { uid: "", commitIndex: uCommitIndex, slot, newVal: amt, oldNext: basePred.nextKey };
          }
        }
        if (commitments.length > 0) {
          const prior = sortedLoopCommitments.get(info.collection) ?? [];
          captureRuntimeJournalOutputIntent(info.collection, commitments, commitmentProducers, {
            handlerSelector: loopAbiFunction.selector,
            journalAccessStreamIndex: info.journalAccessStreamIndex
          });
          materializeLegacyRuntimeJournalIntents(runtimeJournalIntentStart);
          const merged = deferRuntimeJournalMaterialization ? commitments : sortedLoopCommitments.get(info.collection);
          if (journalArgumentIndex >= 0 && !collection.chunkableValue && /^(?:u?int\d*|u?fixed\d*x\d*|bigint)$/.test(collection.valueType) && (info.op === "+" || info.op === "-" || info.op === "set" || isDelete)) {
            merged.forEach((commitment, commitmentIndex) => {
              const decoded = decodeEntryCommitment(hexToBin(commitment));
              runtimeJournalPendingScalar.set(
                `${info.collectionHash}:${entryAddr}:${binToHex(decoded.slot)}`,
                {
                  value: vmNumberToBigInt(decoded.value, { requireMinimalEncoding: false }),
                  commitments: merged,
                  commitmentIndex,
                  slot: decoded.slot,
                  nextKey: decoded.nextKey,
                  ...deferRuntimeJournalMaterialization && { producers: commitmentProducers }
                }
              );
            });
          }
          if (upsertFrame.routed) {
            const rowIndex = routeRowIndex(upsertFrame.row);
            if (rowIndex < 0) throw new Error("Message-bus runtime loop row is missing from its route frame");
            runtimeLoopEntrySegments.push({
              rowIndex,
              collection: info.collection,
              offset: prior.length,
              count: commitments.length
            });
          }
        } else {
          materializeLegacyRuntimeJournalIntents(runtimeJournalIntentStart);
        }
        const streamInputCount = insertLoopPredecessors.length - runtimeInputStart;
        const streamOutputCount = commitments.length;
        if (globalThis.process?.env?.SOLIDC_DEBUG_ROUTE_ENTRY_PLAN === "1") {
          console.error("runtime-journal-stream-plan", JSON.stringify({
            functionName: loopAbiFunction.name,
            collection: info.collection,
            streamIndex: info.journalAccessStreamIndex,
            varyingArrayParam: info.varyingArrayParam,
            keyCount: keysArr.length,
            inputCount: streamInputCount,
            outputCount: streamOutputCount,
            outputValues: commitments.map((commitment) => binToHex(decodeEntryCommitment(hexToBin(commitment)).value))
          }));
        }
        addRuntimeLoopCardinality(info.collection, streamInputCount, streamOutputCount);
        for (const [name, count] of [
          [info.inputCountParam, streamInputCount],
          [info.outputCountParam, streamOutputCount]
        ]) {
          if (!name) continue;
          const index = loopAbiFunction.inputs.findIndex((input) => input.name === name);
          if (index < 0) throw new Error(
            `Runtime loop in '${loopAbiFunction.name}' is missing stream cardinality argument '${name}'.`
          );
          replaceLoopArgument(index, BigInt(count));
        }
      }
    }
    const kernelStreamsByCollection = /* @__PURE__ */ new Map();
    const settlementIdentityStreamCount = runtimeKernelJournalStreams.filter(
      (stream) => stream.settlementIdentity !== void 0
    ).length;
    if (settlementIdentityStreamCount > 0 && settlementIdentityStreamCount !== runtimeKernelJournalStreams.length) {
      throw new Error(
        "Kernel journal cannot mix compiler settlement identities with legacy access streams."
      );
    }
    for (const stream of runtimeKernelJournalStreams) {
      if (stream.settlementIdentity && stream.settlementIdentity.accessStreamIndex !== stream.accessStreamIndex) {
        throw new Error(
          `Kernel journal settlement identity stream ${stream.settlementIdentity.accessStreamIndex} does not match its containing access stream ${stream.accessStreamIndex}.`
        );
      }
    }
    validateKernelEntryJournalSettlementGroups(runtimeKernelJournalStreams.map((stream) => ({
      executionGroup: `${stream.frameIndex}:${stream.executionGroup}`,
      mutates: stream.writes.some((write) => write.operation !== "read"),
      identity: stream.settlementIdentity
    })));
    for (const stream of runtimeKernelJournalStreams) {
      const collectionIdentity = binToHex(stream.collectionHash);
      const collectionStreams = kernelStreamsByCollection.get(collectionIdentity) ?? [];
      collectionStreams.push(stream);
      kernelStreamsByCollection.set(collectionIdentity, collectionStreams);
    }
    const plannedKernelCollections = /* @__PURE__ */ new Map();
    const plannedKernelStreamAccesses = /* @__PURE__ */ new Map();
    let hasPendingScalarDependency = false;
    for (const [collectionIdentity, collectionStreams] of kernelStreamsByCollection) {
      const scheduledWrites = scheduleKernelEntryJournalOccurrences(collectionStreams, (stream) => stream.writes);
      const plan = planKernelEntryJournalAccessTopology(
        collectionStreams[0].list,
        collectionStreams[0].collectionHash,
        [scheduledWrites.map(({ value }) => value)]
      );
      const scheduledAccesses = decodeKernelEntryJournalAccesses(plan.encodedAccessStreams[0]);
      const accessesByStream = /* @__PURE__ */ new Map();
      for (const stream of collectionStreams) accessesByStream.set(stream, Array(stream.writes.length));
      scheduledWrites.forEach(({ stream, compactIndex }, index) => {
        accessesByStream.get(stream)[compactIndex] = scheduledAccesses[index];
      });
      const accesses = collectionStreams.map((stream) => accessesByStream.get(stream));
      const priorProducer = /* @__PURE__ */ new Map();
      for (const { stream, value: access } of scheduleKernelEntryJournalOccurrences(
        collectionStreams,
        (candidate) => accessesByStream.get(candidate)
      )) {
        const dependencies = [];
        if (access.presentBefore && !access.authenticatesTarget) dependencies.push(access.targetRecordOrdinal);
        if (access.predecessorRecordOrdinal !== void 0 && !access.authenticatesPredecessor) {
          dependencies.push(access.predecessorRecordOrdinal);
        }
        const carrierProducers = dependencies.map((ordinal) => priorProducer.get(ordinal)).filter((producer) => producer !== void 0);
        if (carrierProducers.length > 0) {
          access.pending = true;
          hasPendingScalarDependency = true;
          for (const producer of carrierProducers) {
            producer.access.pending = true;
          }
        }
        if (access.mutates) {
          priorProducer.set(access.targetRecordOrdinal, { stream, access });
          if (access.predecessorRecordOrdinal !== void 0) {
            priorProducer.set(access.predecessorRecordOrdinal, { stream, access });
          }
        }
      }
      collectionStreams.forEach((stream, index) => plannedKernelStreamAccesses.set(stream, accesses[index]));
      plannedKernelCollections.set(collectionIdentity, {
        records: plan.encodedRecords,
        globalOrdinals: /* @__PURE__ */ new Map()
      });
    }
    assertKernelJournalRecordBudget(
      [...plannedKernelCollections.values()].map((plan) => plan.records.length)
    );
    const singletonRuntimeExpressionSettlement = [...runtimeExpressionLoopCollections].some((collection) => runtimeKernelJournalStreams.filter((stream) => stream.collection === collection).reduce((count, stream) => count + stream.writes.length, 0) === 1);
    const kernelRouteSettlement = entryArtifact.messageBus?.convention === "kernel-row-loop" && entryAbiFunction?.selector === entryArtifact.messageBus.selector;
    const allMutatingStreamsAreFixedScalars = runtimeKernelJournalStreams.every((stream) => {
      if (!stream.writes.some((write) => write.operation !== "read")) return true;
      const collection = stateLayout.collections?.find((candidate) => candidate.name === stream.collection || candidate.signature === stream.collection);
      return !!collection && collection.chunkableValue !== true && /^(?:bool|u?int\d*|u?fixed\d*x\d*|bigint)$/.test(collection.valueType);
    });
    const pendingScalarSettlementActive = !deferRuntimeJournalMaterialization && kernelRouteSettlement && allMutatingStreamsAreFixedScalars && (hasPendingScalarDependency || hasPendingExistingScalarSettlement || singletonRuntimeExpressionSettlement);
    if (pendingScalarSettlementActive) {
      for (const accesses of plannedKernelStreamAccesses.values()) {
        for (const access of accesses) if (access.mutates) access.pending = true;
      }
    }
    if (pendingScalarSettlementActive) {
      const unsupported = [...plannedKernelStreamAccesses.values()].flat().some((access) => !access.presentAfter || !access.mutates || access.presentBefore && access.predecessorRecordOrdinal !== void 0);
      if (unsupported) {
        throw new Error(
          "Kernel pending scalar settlement supports only fixed-width scalar updates and insertions; reads, removals, deletions, dynamic values, and unrelated predecessor rewrites remain separate transactions."
        );
      }
    }
    if (authenticatedKernelJournalDispositions && !deferRuntimeJournalMaterialization) {
      const eagerOccurrences = runtimeJournalMaterializationIntents.filter((intent) => intent.kind === "outputs").flatMap((intent) => {
        if (!intent.stream || intent.materializedOffset === void 0) {
          throw new Error("Authenticated eager journal output has no stable stream/location provenance.");
        }
        return intent.commitments.map((_commitment, index) => ({
          ...intent.stream,
          collection: intent.collection,
          offset: intent.materializedOffset + index
        }));
      });
      const finalDispositionSelection = planAuthenticatedKernelJournalDispositionChain(
        authenticatedKernelJournalDispositions,
        selectedJournalHandlers,
        eagerOccurrences
      );
      if (finalDispositionSelection.deferRuntimeJournalMaterialization) {
        throw new Error("Kernel journal disposition changed after runtime materialization.");
      }
      kernelJournalEagerOutputPlan = finalDispositionSelection.eagerOutputPlan;
    }
    const kernelJournalRecords = [];
    const remappedKernelStreamAccesses = /* @__PURE__ */ new Map();
    const settlementOccurrences = [];
    const recordOriginStreams = /* @__PURE__ */ new Map();
    const globalRecordOrdinal = (stream, local) => {
      const collectionIdentity = binToHex(stream.collectionHash);
      const collectionPlan = plannedKernelCollections.get(collectionIdentity);
      const prior = collectionPlan.globalOrdinals.get(local);
      if (prior !== void 0) return prior;
      if (kernelJournalRecords.length >= KERNEL_ENTRY_JOURNAL_MAX_RECORDS) {
        throw new Error(
          `Kernel entry journal exceeds the protocol cap of ${KERNEL_ENTRY_JOURNAL_MAX_RECORDS} records.`
        );
      }
      const ordinal = kernelJournalRecords.length;
      const record = collectionPlan.records[local];
      if (record === void 0) throw new Error("Kernel entry journal references an unknown local record ordinal.");
      collectionPlan.globalOrdinals.set(local, ordinal);
      kernelJournalRecords.push(record);
      recordOriginStreams.set(ordinal, stream);
      return ordinal;
    };
    for (const { stream, value: access, compactIndex } of scheduleKernelEntryJournalOccurrences(
      runtimeKernelJournalStreams,
      (candidate) => plannedKernelStreamAccesses.get(candidate) ?? []
    )) {
      const remapped = {
        ...access,
        ...access.predecessorRecordOrdinal !== void 0 && {
          predecessorRecordOrdinal: globalRecordOrdinal(stream, access.predecessorRecordOrdinal)
        },
        targetRecordOrdinal: globalRecordOrdinal(stream, access.targetRecordOrdinal)
      };
      const streamAccesses = remappedKernelStreamAccesses.get(stream) ?? [];
      streamAccesses.push(remapped);
      remappedKernelStreamAccesses.set(stream, streamAccesses);
      if (stream.settlementIdentity) settlementOccurrences.push({
        frameIndex: stream.frameIndex,
        identity: stream.settlementIdentity,
        accessOrdinal: compactIndex,
        access: remapped
      });
    }
    for (const [collectionIdentity, plan] of plannedKernelCollections) {
      if (plan.globalOrdinals.size !== plan.records.length) {
        throw new Error(
          `Kernel entry journal for collection ${collectionIdentity} contains an unreachable record carrier.`
        );
      }
    }
    if (deferRuntimeJournalMaterialization && settlementOccurrences.length !== runtimeKernelJournalStreams.reduce(
      (count, stream) => count + (remappedKernelStreamAccesses.get(stream)?.length ?? 0),
      0
    )) {
      throw new Error(
        "Compiler internal-read-carrier capability requires settlement identities for every runtime journal access."
      );
    }
    const physicalSettlementPlan = deferRuntimeJournalMaterialization && settlementOccurrences.length > 0 ? planKernelEntryJournalPhysicalSettlement(settlementOccurrences) : void 0;
    const stableSettlementPlan = physicalSettlementPlan?.settlement ?? (settlementOccurrences.length > 0 ? planKernelEntryJournalSettlementAuthority(settlementOccurrences) : void 0);
    if (physicalSettlementPlan) {
      const rewrittenAccesses = /* @__PURE__ */ new Map();
      for (const planned of physicalSettlementPlan.occurrences) {
        rewrittenAccesses.set(planned.occurrence.access, planned.access);
      }
      for (const [stream, accesses] of remappedKernelStreamAccesses) {
        remappedKernelStreamAccesses.set(stream, accesses.map((access) => {
          const rewritten = rewrittenAccesses.get(access);
          if (!rewritten) {
            throw new Error("Kernel physical settlement lost a runtime journal access coordinate.");
          }
          return rewritten;
        }));
      }
      const inputByRecord = /* @__PURE__ */ new Map();
      for (const intent of runtimeJournalMaterializationIntents) {
        if (intent.kind !== "input") continue;
        const commitment = intent.input.token?.nft?.commitment;
        if (!commitment) continue;
        const decoded = decodeEntryCommitment(hexToBin(commitment));
        const key = `${intent.collection}:${binToHex(decoded.slot)}`;
        const prior = inputByRecord.get(key);
        if (prior && (prior.txid !== intent.input.txid || prior.vout !== intent.input.vout)) {
          throw new Error(`Kernel physical settlement has ambiguous input candidates for ${key}.`);
        }
        inputByRecord.set(key, intent.input);
      }
      for (const input of physicalSettlementPlan.inputs) {
        const record = decodeKernelEntryJournalRecord(kernelJournalRecords[input.recordOrdinal]);
        const owner = runtimeKernelJournalStreams.find((stream) => stream.frameIndex === input.firstOwner.frameIndex && stream.accessStreamIndex === input.firstOwner.accessStreamIndex);
        if (!owner) throw new Error("Kernel physical settlement input has no owning stream.");
        const candidate = inputByRecord.get(`${owner.collection}:${binToHex(record.slot)}`);
        if (!candidate) {
          throw new Error(`Kernel physical settlement input ${input.recordOrdinal} has no retained UTXO intent.`);
        }
        insertLoopPredecessors.push(candidate);
      }
      const finalRecords = kernelJournalRecords.map((encoded) => decodeKernelEntryJournalRecord(encoded));
      const streamForSettlementReference = (reference) => {
        const stream = runtimeKernelJournalStreams.find((candidate) => candidate.frameIndex === reference.frameIndex && candidate.accessStreamIndex === reference.accessStreamIndex);
        if (!stream) throw new Error("Kernel physical settlement output has no owning stream.");
        const access = remappedKernelStreamAccesses.get(stream)?.[reference.accessOrdinal];
        if (!access) {
          throw new Error(
            `Kernel physical settlement output has no access ${reference.accessOrdinal} in its owning stream.`
          );
        }
        return { stream, access };
      };
      for (const occurrence of physicalSettlementPlan.occurrences) {
        const access = occurrence.access;
        if (!access.mutates) continue;
        const record = finalRecords[access.targetRecordOrdinal];
        record.dirty = true;
        record.tombstone = !access.presentAfter;
        if (!access.presentBefore && access.presentAfter) {
          const predecessorOrdinal = access.predecessorRecordOrdinal;
          if (predecessorOrdinal === void 0) {
            throw new Error("Kernel journal insertion has no predecessor record.");
          }
          const predecessor = finalRecords[predecessorOrdinal];
          record.synthetic = true;
          record.nextKey = new Uint8Array(predecessor.nextKey);
          predecessor.nextKey = new Uint8Array(record.slot);
          predecessor.dirty = true;
        } else if (access.presentBefore && !access.presentAfter) {
          const predecessorOrdinal = access.predecessorRecordOrdinal;
          if (predecessorOrdinal === void 0) {
            throw new Error("Kernel journal deletion has no predecessor record.");
          }
          const predecessor = finalRecords[predecessorOrdinal];
          predecessor.nextKey = new Uint8Array(record.nextKey);
          predecessor.dirty = true;
        }
      }
      for (const output of physicalSettlementPlan.outputs) {
        const { access } = streamForSettlementReference(output.finalOwner);
        if (output.finalOwner.settlementRole === "mutation-settlement" !== access.mutates) {
          throw new Error("Kernel physical settlement final authority disagrees with its compact access.");
        }
        if (access.mutates) finalRecords[output.recordOrdinal].dirty = true;
      }
      const dirtyProducerKey = (producer) => `${producer.frameIndex}:${producer.accessStreamIndex}:${producer.accessOrdinal}:${producer.recordRole}`;
      const dirtyProducerKeys = new Set(physicalSettlementPlan.outputs.filter((output) => finalRecords[output.recordOrdinal].dirty).map((output) => dirtyProducerKey(output.finalOwner)));
      const deferredOutputCandidates = runtimeJournalMaterializationIntents.filter((intent) => intent.kind === "outputs").flatMap((intent) => {
        if (!intent.producers || intent.producers.length !== intent.commitments.length) {
          throw new Error("Kernel physical settlement output body has no stable access producer identity.");
        }
        return intent.commitments.map((commitment, index) => ({
          commitment: hexToBin(commitment),
          producer: intent.producers[index]
        }));
      }).filter((candidate) => dirtyProducerKeys.has(dirtyProducerKey(candidate.producer)));
      const dirtyCandidates = deferredOutputCandidates;
      const dirtyBodies = new Map(resolveKernelEntryJournalDirtyFinalBodies(
        physicalSettlementPlan,
        finalRecords,
        dirtyCandidates
      ).map((body) => [body.recordOrdinal, body.commitment]));
      const physicalLocations = /* @__PURE__ */ new Map();
      for (const output of physicalSettlementPlan.outputs) {
        const record = finalRecords[output.recordOrdinal];
        const { stream: owner } = streamForSettlementReference(output.finalOwner);
        const commitments = sortedLoopCommitments.get(owner.collection) ?? [];
        const offset = commitments.length;
        const commitment = record.dirty ? dirtyBodies.get(output.recordOrdinal) : encodeEntryCommitment(record.slot, record.nextKey, record.value);
        if (!commitment) {
          throw new Error(`Kernel physical settlement lost resolved dirty body for record ${output.recordOrdinal}.`);
        }
        commitments.push(binToHex(commitment));
        sortedLoopCommitments.set(owner.collection, commitments);
        physicalLocations.set(output.recordOrdinal, { collection: owner.collection, offset });
      }
      kernelJournalSettlementOutputPlan = physicalSettlementPlan.outputs.map((output) => {
        const location = physicalLocations.get(output.recordOrdinal);
        if (!location) throw new Error("Kernel physical settlement lost a dense output location.");
        return { recordOrdinal: output.recordOrdinal, outputOrdinal: output.outputOrdinal, ...location };
      });
      kernelJournalSettlementEntrySegments = kernelEntryJournalSettlementOutputSegments(
        kernelJournalSettlementOutputPlan
      );
      runtimeLoopCardinality.clear();
      const addPhysicalCardinality = (collection, inputs, outputs) => {
        const prior = runtimeLoopCardinality.get(collection) ?? { inputs: 0, outputs: 0 };
        runtimeLoopCardinality.set(collection, {
          inputs: prior.inputs + inputs,
          outputs: prior.outputs + outputs
        });
      };
      for (const input of physicalSettlementPlan.inputs) {
        const stream = runtimeKernelJournalStreams.find((candidate) => candidate.frameIndex === input.firstOwner.frameIndex && candidate.accessStreamIndex === input.firstOwner.accessStreamIndex);
        if (!stream) throw new Error("Kernel physical settlement input cardinality has no stream.");
        addPhysicalCardinality(stream.collection, 1, 0);
      }
      for (const output of physicalSettlementPlan.outputs) {
        const stream = runtimeKernelJournalStreams.find((candidate) => candidate.frameIndex === output.finalOwner.frameIndex && candidate.accessStreamIndex === output.finalOwner.accessStreamIndex);
        if (!stream) throw new Error("Kernel physical settlement output cardinality has no stream.");
        addPhysicalCardinality(stream.collection, 0, 1);
      }
    }
    if (pendingScalarSettlementActive) {
      const physicalLocations = /* @__PURE__ */ new Map();
      for (let recordOrdinal = 0; recordOrdinal < kernelJournalRecords.length; recordOrdinal += 1) {
        const disposition = stableSettlementPlan?.recordDispositions.get(recordOrdinal);
        if (stableSettlementPlan && !disposition) {
          throw new Error(
            `Kernel journal settlement identity has no disposition for record ${recordOrdinal}.`
          );
        }
        const physicalReference = disposition?.reference;
        const authorityStream = physicalReference ? runtimeKernelJournalStreams.find((stream) => stream.frameIndex === physicalReference.frameIndex && stream.accessStreamIndex === physicalReference.accessStreamIndex) : recordOriginStreams.get(recordOrdinal);
        if (!authorityStream) {
          throw new Error(`Kernel journal settlement record ${recordOrdinal} has no containing access stream.`);
        }
        if (physicalReference?.settlementDisposition === "absence") continue;
        let commitments = sortedLoopCommitments.get(authorityStream.collection) ?? [];
        const record = decodeKernelEntryJournalRecord(kernelJournalRecords[recordOrdinal]);
        let matchingCommitmentIndices = commitments.flatMap((commitment, index) => binsAreEqual(decodeEntryCommitment(hexToBin(commitment)).slot, record.slot) ? [index] : []);
        if (matchingCommitmentIndices.length === 0 && disposition?.basis !== "mutation-settlement") {
          commitments = [...commitments, binToHex(encodeEntryCommitment(record.slot, record.nextKey, record.value))];
          sortedLoopCommitments.set(authorityStream.collection, commitments);
          matchingCommitmentIndices = [commitments.length - 1];
        }
        if (matchingCommitmentIndices.length !== 1) {
          throw new Error(
            `Kernel pending scalar output for '${authorityStream.collection}' requires exactly one commitment for journal record ${recordOrdinal}; found ${matchingCommitmentIndices.length}.`
          );
        }
        if (physicalReference) {
          physicalLocations.set(recordOrdinal, {
            collection: authorityStream.collection,
            offset: matchingCommitmentIndices[0]
          });
        }
      }
      if (stableSettlementPlan) {
        const resolveSettlementOutput = (authority) => {
          const location = physicalLocations.get(authority.recordOrdinal);
          if (!location) {
            throw new Error(
              `Kernel journal settlement record ${authority.recordOrdinal} has no physical output location.`
            );
          }
          return location;
        };
        const pendingSettlementOutputs = planKernelEntryJournalSettlementOutputs(
          stableSettlementPlan,
          resolveSettlementOutput
        );
        kernelJournalSettlementEntrySegments = kernelEntryJournalSettlementOutputSegments(
          pendingSettlementOutputs
        );
        const plannedOutputCount = kernelJournalSettlementEntrySegments.reduce((count, segment) => count + segment.count, 0);
        const availableOutputCount = [...sortedLoopCommitments.values()].reduce((count, commitments) => count + commitments.length, 0);
        if (plannedOutputCount !== availableOutputCount) {
          throw new Error(
            `Kernel journal settlement identity covers ${plannedOutputCount} physical outputs; ${availableOutputCount} runtime mapping outputs were planned.`
          );
        }
      }
    }
    for (const stream of runtimeKernelJournalStreams) {
      stream.publish(encodeKernelEntryJournalAccesses(
        stream.collectionHash,
        remappedKernelStreamAccesses.get(stream) ?? []
      ));
    }
    const journalRecordsIndex = entryAbiFunction?.inputs.findIndex(
      (input) => input.name === KERNEL_JOURNAL_RECORDS
    ) ?? -1;
    const segmentWitnesses = kernelJournalRecordSegmentWitnesses(
      entryAbiFunction?.inputs ?? [],
      kernelJournalRecords
    );
    if (kernelJournalRecords.length > 0 && journalRecordsIndex < 0 && segmentWitnesses.slots.length === 0) {
      throw new Error("Kernel runtime journal records have no compiler-owned route input.");
    }
    const routeKeyWitnessInputs = new Set((entryAbiFunction?.entryAccesses ?? []).flatMap((access) => access.keyParams.map((name) => name.startsWith("id:") ? name.slice(3) : name)));
    const replaceJournalArgument = (argumentIndex, records) => {
      if (entryCompilerRoute) {
        entryArgs[argumentIndex] = records;
        return;
      }
      while (finalArgs.length <= argumentIndex) {
        const pending = entryAbiFunction.inputs[finalArgs.length];
        const routeKeyWitness = pending?.name.startsWith("__message_bus_key_") && routeKeyWitnessInputs.has(pending.name);
        if (!pending?.name.startsWith("__internal__") && !routeKeyWitness) {
          throw new Error(
            `Internal error: missing user argument '${pending?.name ?? finalArgs.length}' before kernel records.`
          );
        }
        if (routeKeyWitness) {
          const value = entryArgs[finalArgs.length];
          if (value === void 0) {
            throw new Error(`Kernel route key witness '${pending.name}' was not materialized.`);
          }
          finalArgs.push(value);
        } else {
          finalArgs.push(defaultInternalFunctionArg(pending));
        }
      }
      while (entryArgs.length <= argumentIndex) {
        entryArgs.push(defaultInternalFunctionArg(entryAbiFunction.inputs[entryArgs.length]));
      }
      entryArgs[argumentIndex] = records;
      finalArgs[argumentIndex] = records;
    };
    const publishJournalWitness = (name, records) => {
      for (const frame of upsertPlanningFrames) {
        if (!frame.routed) continue;
        frame.row.internalArgs = {
          ...frame.row.internalArgs,
          [name]: records
        };
      }
      if (entryCompilerRoute) {
        entryCompilerRoute.internalArgs = {
          ...entryCompilerRoute.internalArgs,
          [name]: records
        };
      }
    };
    if (segmentWitnesses.slots.length > 0) {
      for (const slot of segmentWitnesses.slots) {
        replaceJournalArgument(slot.inputIndex, slot.carrier);
        publishJournalWitness(slot.name, slot.carrier);
      }
    } else if (journalRecordsIndex >= 0) {
      const encodedKernelJournalCarrier = encodeFunctionArgument(
        kernelJournalRecords,
        "bytes[]",
        stateLayout.structs
      );
      if (encodedKernelJournalCarrier.length > 520) {
        throw new Error(
          `Kernel entry journal requires segmented carrier inputs, but this compiler published only the legacy ${encodedKernelJournalCarrier.length}-byte monolithic carrier.`
        );
      }
      replaceJournalArgument(journalRecordsIndex, kernelJournalRecords);
      publishJournalWitness(KERNEL_JOURNAL_RECORDS, kernelJournalRecords);
    }
    for (const upsertFrame of upsertPlanningFrames) {
      for (const collection of new Set(
        (upsertFrame.abiFunction.sortedUpsertLoopInfo ?? []).map((info) => info.collection)
      )) {
        const cardinality = runtimeLoopCardinality.get(collection) ?? { inputs: 0, outputs: 0 };
        const inputIndex = upsertFrame.abiFunction.inputs.findIndex(
          (input) => input.name === vmapRuntimeInputCountName(collection)
        );
        const outputIndex = upsertFrame.abiFunction.inputs.findIndex(
          (input) => input.name === vmapRuntimeOutputCountName(collection)
        );
        if (inputIndex < 0 || outputIndex < 0) {
          continue;
        }
        const replaceLoopArgument = (index, value) => {
          if (!upsertFrame.routed) {
            upsertFrame.args[index] = value;
            if (entryAbiFunction === abiFunction) finalArgs[index] = value;
            return;
          }
          const input = upsertFrame.abiFunction.inputs[index];
          const mutableInternal = upsertFrame.row.internalArgs;
          mutableInternal[input.name] = value;
          const routeIndex = entryAbiFunction.inputs.findIndex((candidate) => candidate.name === input.name);
          if (routeIndex < 0) throw new Error(
            `Message-bus route is missing compiler-owned loop argument '${input.name}'`
          );
          entryArgs[routeIndex] = value;
          if (entryCompilerRoute) {
            entryCompilerRoute.internalArgs = { ...entryCompilerRoute.internalArgs, [input.name]: value };
          } else {
            args[routeIndex] = value;
            finalArgs[routeIndex] = value;
          }
        };
        replaceLoopArgument(inputIndex, BigInt(cardinality.inputs));
        replaceLoopArgument(outputIndex, BigInt(cardinality.outputs));
      }
    }
    const externalReadsHost = {
      artifact: this.inner.artifact,
      network: this.inner.provider.network,
      addressType: this.inner.addressType,
      unlockerContract: this.inner,
      resolveExternalCategoryId: (...a) => this._resolveExternalCategoryId(...a),
      getExternalDataNftAddress: (...a) => this._getExternalDataNftAddress(...a),
      findExternalDataNft: (...a) => this._findExternalDataNft(...a),
      getUtxos: (address) => this.inner.provider.getUtxos(address),
      keysMatch: (...a) => this._keysMatch(...a),
      externalMasterLock: (categoryId) => {
        for (const ext of this._externalRegistry.values()) {
          if (ext.categoryId !== categoryId) continue;
          return directConventionMasterLock(ext.inner);
        }
        return void 0;
      }
    };
    const externalReadUtxos = await loadCreateBuilderExternalReadsImpl(
      externalReadsHost,
      functionName,
      abiFunction,
      overrides
    );
    let blockhashCoSpendUtxos = [];
    let blockInfoCoSpendUtxos = [];
    let delegateBlockInfoOracle = false;
    let blockhashCoSpendSlotOrdinals;
    let maxBhLocktime = -1;
    let keccakComputeCoSpendUtxos = [];
    let keccakComputeCommitments = [];
    let deferredKeccakCompute;
    let deferredEcrecoverCompute;
    let delegateComputeResources = false;
    let ecrecoverComputeCoSpendUtxos = [];
    let ecrecoverComputeRecreates = [];
    let externalOutStateUtxoGroups = [];
    let outStateInputCount = 0;
    if (globalThis.process?.env?.SOLIDC_DEBUG_EXTCALL === "1") {
      console.error("create-builder-orchestrate", JSON.stringify({
        functionName,
        abiFunction: abiFunction?.name,
        calls: abiFunction?.externalCalls?.length,
        reads: abiFunction?.externalReads?.length,
        resolved: true
      }));
    }
    const frameCaller = overrides?.callerLockingBytecode;
    const externalCallsOrchestrated = await orchestrateCreateBuilderExternalCallsImpl(
      {
        categoryId: this.categoryId,
        inner: this.inner,
        signer: this._signer,
        externalRegistry: this._externalRegistry,
        callerContract: this,
        // Predicates plan the same authenticated clock and state that stored-value recipes and the VM read.
        getFullState: async () => ({ ...onChainState, state: recipeState }),
        resolveExternalArgs: (...a) => {
          if (frameCaller !== void 0 && a[9] === void 0) a[9] = frameCaller;
          return this._resolveExternalArgs(...a);
        },
        buildRepeatedExternalBatch: (...a) => this._buildRepeatedExternalBatch(...a),
        resolveExternalKeccakSideCars: (...a) => this._resolveExternalKeccakSideCars(...a),
        resolveExternalBlockhashCoSpends: (...a) => this._resolveExternalBlockhashCoSpends(...a),
        keysMatch: (...a) => this._keysMatch(...a),
        probeRawCallee: async (contract, calleeFunction, calleeArgs) => {
          const candidate = contract?.implementation ?? contract;
          const derive = candidate?._deriveReturnValue;
          if (typeof derive !== "function") return { ok: true };
          const calleeAbi = candidate.inner?.artifact?.abi;
          const calleeEntry = calleeAbi?.find((entry) => entry.name === calleeFunction);
          if ((calleeEntry?.outputs?.length ?? 0) === 0) {
            return { ok: true };
          }
          if (calleeBlockExceedsLowLevelBand(calleeEntry)) {
            return { ok: true };
          }
          try {
            await derive.call(
              candidate,
              calleeFunction,
              calleeArgs,
              void 0,
              void 0,
              void 0,
              this.inner.lockingBytecode,
              this.categoryId,
              this
            );
            return { ok: true };
          } catch (error) {
            const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
            const unsupported = /could not be auto-derived|Cannot send stateful transaction|state commitments could not|no return value to read/i.test(text);
            const executionFailure = !unsupported && /OP_VERIFY|FailedRequire|VM failed|failed a require|require:/i.test(text);
            return { ok: false, error, executionFailure };
          }
        }
      },
      {
        abiFunction,
        args,
        finalArgs,
        overrides,
        onChainState,
        requiredNftIndices,
        externalReadUtxos,
        outStateInputCount,
        externalOutStateUtxoGroups,
        earlySignerUtxos,
        publicSelfAddress,
        publicSelfIdentity,
        physicalSelfAddress: executionSelfAddress,
        rootLogicalAddress: this._logicalAddress,
        timing,
        valueChunkWriteStagingSession,
        iterationEntryInputs,
        entryNfts,
        condSoftDeleteSlots,
        entryDeleteSlots,
        selectorParamSlot,
        isComputedBlockhashKey,
        maxBhLocktime
      }
    );
    const rootProducerPath = externalCallsOrchestrated.rootProducerPath;
    let externalCallUtxoGroups = externalCallsOrchestrated.externalCallUtxoGroups;
    let allGroupEcSlots = externalCallsOrchestrated.allGroupEcSlots;
    let allGroupParentIndices = externalCallsOrchestrated.allGroupParentIndices;
    let sharedFunderPool = externalCallsOrchestrated.sharedFunderPool;
    let sharedFunderSnapshot = externalCallsOrchestrated.sharedFunderSnapshot;
    const consumedSharedFunders = externalCallsOrchestrated.consumedSharedFunders;
    const embeddedFunderUtxos = externalCallsOrchestrated.embeddedFunderUtxos;
    const markSharedFunder = externalCallsOrchestrated.markSharedFunder;
    const identityAnchors = externalCallsOrchestrated.identityAnchors;
    const identityAnchorBandByAddress = externalCallsOrchestrated.identityAnchorBandByAddress;
    finalArgs = externalCallsOrchestrated.finalArgs;
    const pendingAnchorFills = externalCallsOrchestrated.pendingAnchorFills;
    const pendingExternalCallInputFills = externalCallsOrchestrated.pendingExternalCallInputFills;
    const pendingTokenCallInputFills = externalCallsOrchestrated.pendingTokenCallInputFills;
    const pendingDelegateInputFills = externalCallsOrchestrated.pendingDelegateInputFills;
    const pendingDynamicChunkInputFills = externalCallsOrchestrated.pendingDynamicChunkInputFills;
    const topLevelAnchorFillPositions = externalCallsOrchestrated.topLevelAnchorFillPositions;
    const msgSenderAnchorArgIndex = abiFunction?.inputs.findIndex(
      (input) => input.name === "__internal__msgSenderAnchorIdx"
    ) ?? -1;
    const probeCallerIdentity = overrides?.callerIdentityUtxos?.find((utxo) => utxo.token?.nft?.capability === "none" && isScidIdentityCommitment(utxo.token.nft.commitment));
    if (msgSenderAnchorArgIndex >= 0 && probeCallerIdentity?.token !== void 0) {
      topLevelAnchorFillPositions.push({
        argIndex: msgSenderAnchorArgIndex,
        categoryId: probeCallerIdentity.token.category,
        proxyRoute: false
      });
    }
    const topLevelReturnWitnessGroups = externalCallsOrchestrated.topLevelReturnWitnessGroups;
    externalOutStateUtxoGroups = externalCallsOrchestrated.externalOutStateUtxoGroups;
    outStateInputCount = externalCallsOrchestrated.outStateInputCount;
    maxBhLocktime = externalCallsOrchestrated.maxBhLocktime;
    const lowLevelNestedCaches = await prepareCreateBuilderLowLevelNestedCachesImpl(
      {
        signer: this._signer,
        inner: this.inner,
        syncMockParticipantOracle: (contract) => syncMockParticipantOracle(contract),
        resolveExternalArgs: (...a) => this._resolveExternalArgs(...a)
      },
      {
        abiFunction,
        physicalAbiFunction,
        earlySignerUtxos,
        sharedFunderPool,
        sharedFunderSnapshot,
        timingEnabled,
        externalCallUtxoGroups,
        identityAnchors,
        identityAnchorBandByAddress
      }
    );
    const lowLevelCalls = lowLevelNestedCaches.lowLevelCalls;
    let lowLevelCallUtxoGroups = lowLevelNestedCaches.lowLevelCallUtxoGroups;
    sharedFunderPool = lowLevelNestedCaches.sharedFunderPool;
    sharedFunderSnapshot = lowLevelNestedCaches.sharedFunderSnapshot;
    const nestedProxyReadCache = lowLevelNestedCaches.nestedProxyReadCache;
    const nestedSortedListCache = lowLevelNestedCaches.nestedSortedListCache;
    const nestedAddressUtxos = lowLevelNestedCaches.nestedAddressUtxos;
    const nestedIdentity = lowLevelNestedCaches.nestedIdentity;
    const resolveNestedIdentityAnchorBands = lowLevelNestedCaches.resolveNestedIdentityAnchorBands;
    const directNestedIdentityWitness = lowLevelNestedCaches.directNestedIdentityWitness;
    const nestedFullState = lowLevelNestedCaches.nestedFullState;
    const nestedMasterState = lowLevelNestedCaches.nestedMasterState;
    let lowLevelCallRawInputs = lowLevelNestedCaches.lowLevelCallRawInputs;
    let lowLevelCallInputBase = lowLevelNestedCaches.lowLevelCallInputBase;
    let activeDelegateGroupIndex = lowLevelNestedCaches.activeDelegateGroupIndex;
    let hasDelegatedDynamicReadChunks = lowLevelNestedCaches.hasDelegatedDynamicReadChunks;
    let delegateEventSlots = lowLevelNestedCaches.delegateEventSlots;
    let delegateReturnEventOffset = lowLevelNestedCaches.delegateReturnEventOffset;
    const groupProxyMasterIndices = lowLevelNestedCaches.groupProxyMasterIndices;
    const delegateExternalGroupIndices = lowLevelNestedCaches.delegateExternalGroupIndices;
    const delegateExternalGroupByCallsite = lowLevelNestedCaches.delegateExternalGroupByCallsite;
    const routeValueChunkProducerEpochByPhysicalGroup = lowLevelNestedCaches.routeValueChunkProducerEpochByPhysicalGroup;
    const lateTransitiveGroupIndices = lowLevelNestedCaches.lateTransitiveGroupIndices;
    const nestedDelegateProxyGroupByLowLevel = lowLevelNestedCaches.nestedDelegateProxyGroupByLowLevel;
    const selectActiveRootDelegateGroup = lowLevelNestedCaches.selectActiveRootDelegateGroup;
    let preparedAtomicNodes = lowLevelNestedCaches.preparedAtomicNodes;
    const preparedAtomicNodeByExternalGroup = lowLevelNestedCaches.preparedAtomicNodeByExternalGroup;
    const latestPreparedAtomicNodeByPhysicalGroup = lowLevelNestedCaches.latestPreparedAtomicNodeByPhysicalGroup;
    const preparedChildProducerPath = (parentIndex, source) => lowLevelNestedCaches.preparedChildProducerPath(preparedAtomicNodes?.[parentIndex], source);
    let nestedFunderIndex = lowLevelNestedCaches.nestedFunderIndex;
    const selectRootOracleReader = () => selectRootBlockOracleReader(this.inner, abiFunction, lowLevelCallUtxoGroups.map((group, groupIndex) => ({
      rootOwned: !nestedDelegateProxyGroupByLowLevel.has(groupIndex),
      reader: group.externalContract.inner,
      callMode: group.callMode,
      abiFunction: group.compilerRoute?.abiFunction ?? group.externalContract.inner.artifact.abi.find((candidate) => candidate.name === group.functionName)
    })));
    const nestedBlockOraclePools = /* @__PURE__ */ new Set();
    for (const group of externalCallUtxoGroups) {
      if (group.sharedGroupIndex !== void 0) continue;
      const offset = group.blockLayout?.slots.find((slot) => slot.kind === "blockInfoOracle")?.offset;
      const input = offset === void 0 ? void 0 : group.blockInputs?.[offset];
      const pool = input?.token?.category.toLowerCase();
      if (input !== void 0 && pool !== void 0 && isPoolInfoInput(input, pool)) nestedBlockOraclePools.add(pool);
    }
    if (lowLevelCalls && lowLevelCalls.length > 0) {
      const resolvedCalls = overrides?.calls ?? [];
      for (let i = 0; i < lowLevelCalls.length; i++) {
        const callInfo = resolvedCalls[i];
        if (!callInfo) {
          continue;
        }
        if (externalCallsOrchestrated.compatLowLevelCallIndices.has(i)) continue;
        if (callInfo.type === "stateful") {
          const materializedLlc = await materializeCreateBuilderLowLevelStatefulCallImpl(
            {
              categoryId: this.categoryId,
              inner: this.inner,
              selfContract: this,
              getMasterOnlyState: (contract) => contract._getMasterOnlyState(),
              getFullState: (contract) => contract.getFullState(),
              getEntries: (name) => this.getEntries(name),
              statefulCall: (name) => statefulCall(name),
              resolveExternalExpressionReturns: (...a) => this._resolveExternalExpressionReturns(...a),
              evaluateExternalExpression: (...a) => this._evaluateExternalExpression(...a),
              planExternalCallOccurrences: (...a) => this._planExternalCallOccurrences(...a)
            },
            {
              callInfo,
              callMode: lowLevelCalls[i].callMode,
              lowLevelCallUtxoGroups,
              groupProxyMasterIndices,
              abiFunction,
              physicalAbiFunction,
              functionName,
              args,
              callIndex: i,
              preparedAtomicNodes,
              rootProducerPath,
              publicSelfAddress,
              authenticatedSelfAddress,
              incomingCallerAddress: overrides?.callerLockingBytecode ?? probeCallerIdentity?.unlocker.generateLockingBytecode(),
              onChainState
            }
          );
          preparedAtomicNodes = materializedLlc.preparedAtomicNodes;
          if (lowLevelCalls[i].callMode === "delegatecall") {
            const delegateGroupIndex = materializedLlc.delegateGroupIndex;
            const delegateFn = materializedLlc.delegateFn;
            const nestedExternalCalls = materializedLlc.nestedExternalCalls;
            const publishedNestedExternalCalls = materializedLlc.publishedNestedExternalCalls;
            const delegateVisibleArgs = materializedLlc.delegateVisibleArgs;
            const delegateVisibleInputs = materializedLlc.delegateVisibleInputs;
            const delegateSelfAddress = materializedLlc.delegateSelfAddress;
            const delegateCallerIdentity = materializedLlc.delegateCallerIdentity;
            const graphPlanningResults = materializedLlc.graphPlanningResults;
            let nestedIndices = materializedLlc.nestedIndices;
            const nestedByCallsite = materializedLlc.nestedByCallsite;
            for (const nested of nestedExternalCalls) {
              const orchestrated = await orchestrateCreateBuilderNestedComposeCallsiteImpl(
                {
                  categoryId: this.categoryId,
                  inner: this.inner,
                  sharedBlockOraclePools: nestedBlockOraclePools,
                  signer: this._signer,
                  logicalNonceSigner: this._logicalNonceSigner,
                  externalRegistry: this._externalRegistry,
                  resolveExternalArgs: (...a) => this._resolveExternalArgs(...a),
                  resolveExternalExpressionReturns: (...a) => this._resolveExternalExpressionReturns(...a),
                  buildRepeatedExternalBatch: (...a) => this._buildRepeatedExternalBatch(...a),
                  replaceRepeatedExternalBatchRow: (...a) => this._replaceRepeatedExternalBatchRow(...a),
                  encodeStoredElementSource: (...a) => this._encodeStoredElementSource(...a),
                  encodeStoredValueSource: (...a) => this._encodeStoredValueSource(...a),
                  nestedIdentity,
                  nestedFullState,
                  nestedMasterState,
                  nestedAddressUtxos,
                  markSharedFunder: (utxo) => markSharedFunder(utxo),
                  shiftSharedFunder: () => sharedFunderPool?.shift(),
                  nextNestedFunderIndex: () => nestedFunderIndex++,
                  describeValueChunkWrites,
                  preparedChildProducerPath,
                  selectProxyForwardInput,
                  resolvePreparedProducerEntry,
                  externalReturnsForCallsites,
                  externalCallReachedOccurrenceIndices: (...a) => externalCallReachedOccurrenceIndices(...a),
                  planExternalCallOccurrences: (...a) => this._planExternalCallOccurrences(...a),
                  concatBytes: (...a) => StatefulContract._concatBytes(...a)
                },
                {
                  nested,
                  delegateGroupIndex,
                  delegateFn,
                  nestedExternalCalls,
                  publishedNestedExternalCalls,
                  delegateVisibleArgs,
                  delegateVisibleInputs,
                  delegateSelfAddress,
                  delegateCallerIdentity,
                  graphPlanningResults,
                  callInfo,
                  onChainState,
                  preparedAtomicNodes,
                  rootProducerPath,
                  nestedIndices,
                  nestedByCallsite,
                  externalCallUtxoGroups,
                  lowLevelCallUtxoGroups,
                  groupProxyMasterIndices,
                  nestedDelegateProxyGroupByLowLevel,
                  timingEnabled,
                  functionName,
                  allGroupEcSlots,
                  allGroupParentIndices,
                  routeValueChunkProducerEpochByPhysicalGroup,
                  preparedAtomicNodeByExternalGroup,
                  latestPreparedAtomicNodeByPhysicalGroup,
                  nestedSortedListCache,
                  valueChunkWriteStagingSession,
                  sharedFunderPool,
                  nestedFunderIndex,
                  publicSelfAddress,
                  nestedProxyReadCache,
                  memoizeGraphPlanningProducerResult,
                  routeValueChunkProducerAliases: void 0,
                  routeValueChunkProducerPhysicalGroup: void 0,
                  routeValueChunkProducerEpoch: void 0,
                  latestRouteValueChunkProducerBinding: void 0,
                  refreshChunkableRouteWitnesses: void 0
                }
              );
              if (orchestrated.skipped) continue;
              allGroupEcSlots = orchestrated.allGroupEcSlots;
              allGroupParentIndices = orchestrated.allGroupParentIndices;
              nestedIndices = orchestrated.nestedIndices;
            }
            delegateExternalGroupIndices.set(delegateGroupIndex, nestedIndices);
            delegateExternalGroupByCallsite.set(delegateGroupIndex, nestedByCallsite);
          }
        } else {
          lowLevelCallRawInputs.push(callInfo.utxo);
        }
      }
      timing("nested-compose-all-complete");
      {
        const lateBags = await expandCreateBuilderLateTransitiveImpl(
          {
            categoryId: this.categoryId,
            inner: this.inner,
            signer: this._signer,
            externalRegistry: this._externalRegistry,
            nestedFullState: (contract) => nestedFullState(contract),
            nestedAddressUtxos,
            markSharedFunder: (utxo) => markSharedFunder(utxo),
            shiftSharedFunder: () => sharedFunderPool?.shift(),
            nextNestedFunderIndex: () => nestedFunderIndex++,
            selectProxyForwardInput: (...a) => selectProxyForwardInput(...a),
            preparedChildProducerPath,
            timing: (label) => timing(label)
          },
          {
            externalCallUtxoGroups,
            lowLevelCallUtxoGroups,
            preparedAtomicNodes,
            preparedAtomicNodeByExternalGroup,
            publicSelfAddress,
            bags: {
              allGroupEcSlots,
              allGroupParentIndices,
              lateTransitiveGroupIndices
            }
          }
        );
        allGroupEcSlots = lateBags.allGroupEcSlots;
        allGroupParentIndices = lateBags.allGroupParentIndices;
      }
      const delegatedDyn = await createBuilderLoadDelegatedDynamicChunksImpl(
        {
          categoryId: this.categoryId,
          inner: this.inner
        },
        {
          lowLevelCallUtxoGroups,
          stateLayout,
          dynamicReads,
          iterationEntryInputs,
          hasDelegatedDynamicReadChunks,
          onChainState,
          blockBase: overrides?.blockBase ?? 0,
          phaseCheckpoint: timing
        }
      );
      iterationEntryInputs = delegatedDyn.iterationEntryInputs;
      hasDelegatedDynamicReadChunks = delegatedDyn.hasDelegatedDynamicReadChunks;
      const delegatedDynamicWriteChunkCount = delegatedDyn.delegatedDynamicWriteChunkCount;
      const externalCallInputCount = externalCallUtxoGroups.reduce(
        (sum, g) => sum + (g.blockInputs ? g.blockInputs.length : 1 + g.dataNftUtxos.length) + (g.ordinaryDynamicChunkInputs?.length ?? 0),
        0
      );
      timing("external-input-count");
      activeDelegateGroupIndex = selectActiveRootDelegateGroup();
      if (globalThis.process?.env?.SOLIDC_DEBUG_FORWARD_ARGS === "1") {
        console.error("authenticated-root-delegate-selection", {
          functionName,
          physicalFunction: physicalAbiFunction?.name,
          hasForwarding: physicalAbiFunction?.delegateForwarding !== void 0,
          candidates: lowLevelCallUtxoGroups.flatMap((group, groupIndex) => group.callMode === "delegatecall" && !nestedDelegateProxyGroupByLowLevel.has(groupIndex) ? [groupIndex] : []),
          selected: activeDelegateGroupIndex
        });
      }
      const denseCallInputBase = 1 + requiredNftIndices.length + externalReadUtxos.length + outStateInputCount + externalCallInputCount;
      const hasDelegatecallGroup = lowLevelCallUtxoGroups.some((g) => g.callMode === "delegatecall");
      const physicalDelegateCarrierOwnsCallSlot = physicalAbiFunction?.lowLevelCalls?.some((call) => call.callMode === "delegatecall") === true && physicalAbiFunction.blockLayout?.slots.some((slot) => slot.kind === "lowLevelCall") === true;
      const authenticatedDelegateGroup = activeDelegateGroupIndex === void 0 ? void 0 : lowLevelCallUtxoGroups[activeDelegateGroupIndex];
      const compilerRouteDelegate = authenticatedDelegateGroup?.compilerRoute?.abiFunction.blockLayout ? authenticatedDelegateGroup : lowLevelCallUtxoGroups.find(
        (g, groupIndex) => g.callMode === "delegatecall" && !nestedDelegateProxyGroupByLowLevel.has(groupIndex) && g.compilerRoute?.abiFunction.blockLayout
      );
      const compilerRouteDelegateLayout2 = compilerRouteDelegate?.compilerRoute?.abiFunction.blockLayout ?? (physicalAbiFunction?.delegateForwarding || physicalDelegateCarrierOwnsCallSlot ? void 0 : selectDelegateExecutionLayout(lowLevelCallUtxoGroups, nestedDelegateProxyGroupByLowLevel));
      timing("delegate-route-selected");
      lowLevelCallInputBase = compilerRouteDelegateLayout2 ? compilerRouteDelegateLayout2.blockSize : hasDelegatecallGroup ? 1 + requiredNftIndices.length : denseCallInputBase;
      const delegateInputCount = lowLevelCallUtxoGroups.filter((group, groupIndex) => group.callMode === "delegatecall" && !nestedDelegateProxyGroupByLowLevel.has(groupIndex)).reduce((sum, group) => sum + 1 + group.dataNftUtxos.length, 0);
      const hasNestedDelegate = delegateInputCount > 0;
      const legacyRouteDelegate = authenticatedDelegateGroup ?? compilerRouteDelegate ?? lowLevelCallUtxoGroups.find(
        (group) => group.callMode === "delegatecall" && group.externalContract
      );
      const legacyRouteDelegateFn = legacyRouteDelegate?.compilerRoute?.abiFunction ?? legacyRouteDelegate?.externalContract?.inner.artifact.abi?.find((candidate) => candidate.name === legacyRouteDelegate?.functionName);
      const legacyRouteTrailingBase = legacyRouteDelegateFn?.blockLayout?.trailingBase ?? legacyRouteDelegateFn?.blockLayout?.blockSize;
      const delegatedLoopCollections = /* @__PURE__ */ new Set([
        ...(legacyRouteDelegateFn?.sortedUpsertLoopInfo ?? []).map((info) => info.collection),
        ...(legacyRouteDelegateFn?.sortedInsertLoopInfo ?? []).map((info) => info.collection)
      ]);
      const delegatedDynamicSuffix = (legacyRouteDelegateFn?.dynamicWrites?.length ?? 0) > 0 || (legacyRouteDelegateFn?.dynamicReads?.length ?? 0) > 0 || hasDelegatedDynamicReadChunks || delegatedLoopCollections.size > 0;
      const delegatedLoopOutputCount = [...sortedLoopCommitments.entries()].filter(([collection]) => delegatedLoopCollections.has(collection)).reduce((sum, [, commitments]) => sum + commitments.length, 0);
      const delegatedLoopOutputSurplus = Math.max(
        0,
        Math.max(delegatedLoopOutputCount, insertLoopPredecessors.length * 2) - insertLoopPredecessors.length
      );
      timing("delegate-loop-count");
      const allLowLevelInputCount = lowLevelCallUtxoGroups.reduce((sum, group) => sum + 1 + group.dataNftUtxos.length, 0);
      timing("low-level-input-count");
      const nestedBases = planCreateBuilderNestedBasesImpl({
        compilerRouteDelegateLayout: compilerRouteDelegateLayout2,
        lowLevelCallInputBase,
        allLowLevelInputCount,
        hasNestedDelegate,
        delegatedDynamicSuffix,
        legacyRouteTrailingBase,
        iterationEntryInputs,
        insertLoopPredecessors,
        delegatedDynamicWriteChunkCount,
        requiredNftIndices,
        delegateInputCount,
        externalReadUtxos,
        outStateInputCount,
        delegatedLoopOutputSurplus,
        delegatedLoopOutputCount,
        abiFunction,
        lowLevelCallUtxoGroups,
        externalCallUtxoGroups,
        externalOutStateUtxoGroups,
        legacyRouteDelegateFn,
        returnEmitOutputIndex,
        overrides,
        functionName,
        allGroupEcSlots,
        timing
      });
      const nestedMasterIndices = nestedBases.nestedMasterIndices;
      const nestedOutputBases = nestedBases.nestedOutputBases;
      const delegateReturnOutputBase = nestedBases.delegateReturnOutputBase;
      const returningExternalGroups = nestedBases.returningExternalGroups;
      const physicalReturnIndexForGroup = nestedBases.physicalReturnIndexForGroup;
      const tailReturnRank = (a, b) => {
        const name = (idx) => externalCallUtxoGroups[idx]?.functionName ?? "";
        const proxy = (idx) => name(idx) === "__forward" ? 0 : 1;
        return proxy(a) - proxy(b) || a - b;
      };
      const relocated = relocateCreateBuilderPredOutBasesImpl({
        externalCallUtxoGroups,
        lowLevelCallUtxoGroups,
        returningExternalGroups,
        nestedMasterIndices,
        physicalReturnIndexForGroup,
        delegateReturnOutputBase,
        lowLevelCallInputBase,
        entryAbiFunction,
        tailReturnRank
      });
      const relocatedPredOutBase = relocated.relocatedPredOutBase;
      if (globalThis.process?.env?.SOLIDC_DEBUG_ROUTE === "1") {
        console.error("nested-route-layout", {
          external: externalCallUtxoGroups.map((group, index) => ({
            index,
            functionName: group.functionName,
            size: group.blockInputs?.length ?? 1 + group.dataNftUtxos.length,
            layoutSize: group.blockLayout?.blockSize,
            plannedInserts: group.plannedEntryInserts,
            predecessorOutputs: group.batchPredecessorOutputs,
            internalArgs: Object.fromEntries(Object.entries({
              ...group.compilerRoute?.internalArgs,
              ...group.internalArgs
            }).filter(([name]) => name.includes("vmapBatch")).map(([name, value]) => [
              name,
              typeof value === "bigint" ? value.toString() : value instanceof Uint8Array ? binToHex(value) : value
            ])),
            sharedGroupIndex: group.sharedGroupIndex,
            delegateCallGroupIndex: group.delegateCallGroupIndex,
            nestedMasterIndex: nestedMasterIndices[index],
            returnOutputIndex: physicalReturnIndexForGroup.get(index)
          })),
          lowLevel: lowLevelCallUtxoGroups.map((group, index) => ({
            index,
            functionName: group.functionName,
            callMode: group.callMode,
            size: 1 + group.dataNftUtxos.length
          })),
          callerCategoryId: this.categoryId,
          activeMasterCategory: masterUtxo.token?.category,
          callerCategoryWitness: binToHex(hexToBin(this.categoryId).reverse())
        });
      }
      await completeCreateBuilderNestedUnlockersImpl(
        {
          categoryId: this.categoryId,
          timing: (label) => timing(label),
          ensureNestedIdentityAnchorBand: lowLevelNestedCaches.ensureNestedIdentityAnchorBand,
          resolveNestedIdentityAnchorBands,
          nestedFullState: (contract) => nestedFullState(contract),
          selectProxyForwardInput: (...a) => selectProxyForwardInput(...a),
          directNestedIdentityWitness: (...a) => directNestedIdentityWitness(...a)
        },
        {
          externalCallUtxoGroups,
          lowLevelCallUtxoGroups,
          returningExternalGroups,
          physicalReturnIndexForGroup,
          nestedMasterIndices,
          nestedOutputBases,
          relocatedPredOutBase,
          allGroupParentIndices,
          allGroupEcSlots,
          delegateExternalGroupIndices,
          delegateExternalGroupByCallsite,
          lateTransitiveGroupIndices,
          pendingDelegateInputFills,
          pendingAnchorFills,
          pendingExternalCallInputFills,
          entryAbiFunction,
          identityAnchors,
          publicSelfAddress,
          authenticatedSelfAddress,
          physicalSelfAddress: executionSelfAddress,
          logicalCreateLock
        }
      );
      {
        const projected = projectCreateBuilderDelegateSlotsImpl({
          lowLevelCallUtxoGroups,
          nestedDelegateProxyGroupByLowLevel,
          abiFunction,
          delegateEventSlots,
          delegateReturnEventOffset,
          returnEmitOutputIndex,
          returnEmitBlockOffset,
          returnMaterializationOutputIndex,
          overrides,
          timing
        });
        delegateEventSlots.length = 0;
        delegateEventSlots.push(...projected.delegateEventSlots);
        delegateReturnEventOffset = projected.delegateReturnEventOffset;
        returnEmitBlockOffset = projected.returnEmitBlockOffset;
        returnEmitOutputIndex = projected.returnEmitOutputIndex;
        returnMaterializationOutputIndex = projected.returnMaterializationOutputIndex;
      }
      await fixCreateBuilderDelegateUnlockersImpl(
        {
          categoryId: this.categoryId,
          selfContract: this,
          timing: (label) => timing(label),
          resolveNestedIdentityAnchorBands,
          nestedFullState: (contract) => nestedFullState(contract),
          selectProxyForwardInput: (...a) => selectProxyForwardInput(...a),
          directNestedIdentityWitness: (...a) => directNestedIdentityWitness(...a)
        },
        {
          lowLevelCallUtxoGroups,
          externalCallUtxoGroups,
          nestedDelegateProxyGroupByLowLevel,
          lowLevelCallInputBase,
          delegateExternalGroupIndices,
          delegateExternalGroupByCallsite,
          allGroupEcSlots,
          allGroupParentIndices,
          physicalReturnIndexForGroup,
          nestedMasterIndices,
          nestedOutputBases,
          relocatedPredOutBase,
          pendingDelegateInputFills,
          pendingAnchorFills,
          pendingExternalCallInputFills,
          entryAbiFunction,
          timingEnabled,
          publicSelfAddress,
          authenticatedSelfAddress,
          compilerRouteDelegateLayout: compilerRouteDelegateLayout2,
          returnEmitOutputIndex,
          groupProxyMasterIndices,
          overrides,
          entryBatchWitnesses,
          entryValueWitnesses,
          pendingDynamicChunkInputFills,
          pendingTokenCallInputFills,
          identityAnchors,
          entryArgs,
          entryArtifact,
          physicalSelfAddress: executionSelfAddress,
          logicalCreateLock
        }
      );
    }
    const tokenContainerAbiFunction = entryAbiFunction?.tokenContainerAccesses?.length ? entryAbiFunction : abiFunction;
    const tokenContainerArgs = tokenContainerAbiFunction === entryAbiFunction ? entryArgs : args;
    const tokenContainerLoad = await loadCreateBuilderTokenContainersImpl(
      {
        categoryId: this.categoryId,
        inner: this.inner
      },
      {
        abiFunction: tokenContainerAbiFunction,
        args: tokenContainerArgs,
        overrides,
        stateValues: onChainState?.state,
        timing
      }
    );
    const tokenContainers = tokenContainerLoad.tokenContainers;
    const tokenContainerLockingBytecodes = tokenContainerLoad.tokenContainerLockingBytecodes;
    const tokenContainerAccesses = tokenContainerAbiFunction?.tokenContainerAccesses;
    const satoshiContainerAbiFunction = entryAbiFunction?.blockLayout?.slots.some(
      (slot) => slot.kind === "satoshiContainer"
    ) ? entryAbiFunction : abiFunction;
    const satoshiContainerLoad = await loadCreateBuilderSatoshiContainerImpl(
      {
        categoryId: this.categoryId,
        inner: this.inner
      },
      {
        abiFunction: satoshiContainerAbiFunction,
        overrides
      }
    );
    const satoshiContainerUtxo = satoshiContainerLoad.satoshiContainerUtxo;
    const satoshiContainerLockingBytecode = satoshiContainerLoad.satoshiContainerLockingBytecode;
    const synthesized = materializeCreateBuilderSyntheticArgsImpl(
      {
        selectActiveRootDelegateGroup
      },
      {
        abiFunction,
        finalArgs,
        activeDelegateGroupIndex,
        lowLevelCallUtxoGroups,
        lowLevelCallInputBase,
        overrides,
        returnEmitOutputIndex,
        functionName,
        requiredNftIndices,
        externalReadUtxos,
        outStateInputCount,
        iterationEntryInputs,
        // A compat call's callee group answers no typed callsite.
        externalCallGroupCount: externalCallUtxoGroups.filter((group) => group.edgeLowLevelCallIndex === void 0).length,
        reachedExternalCalls: externalCallsOrchestrated.externalCalls
      }
    );
    finalArgs = synthesized.finalArgs;
    activeDelegateGroupIndex = synthesized.activeDelegateGroupIndex;
    const delegateInputArgumentIndex = synthesized.delegateInputArgumentIndex;
    if (resolvedMsgSenderCategory !== void 0 && abiFunction !== void 0 && abiFunction.inputs.some((input) => input.name === "__internal__msgSenderCategory")) {
      finalArgs = materializeInternalFunctionArgument(
        finalArgs,
        abiFunction.inputs,
        "__internal__msgSenderCategory",
        resolvedMsgSenderCategory
      );
    }
    const stateUnlockers = buildCreateBuilderStateUnlockersImpl(
      {
        categoryId: this.categoryId,
        inner: this.inner,
        canonicalAbiFunctionSignature: (fn) => canonicalAbiFunctionSignature(fn)
      },
      {
        functionName,
        abiFunction,
        physicalAbiFunction,
        finalArgs,
        args,
        activeDelegateGroupIndex,
        delegateInputArgumentIndex,
        lowLevelCallUtxoGroups,
        lowLevelCallInputBase,
        filteredDataNftUtxos,
        overrides
      }
    );
    let buildStateInputUnlocker = stateUnlockers.buildStateInputUnlocker;
    let refreshPhysicalDelegateInputIndex = stateUnlockers.refreshPhysicalDelegateInputIndex;
    let stateInputUnlocker = stateUnlockers.stateInputUnlocker;
    const dataNftUnlockers = stateUnlockers.dataNftUnlockers;
    const topLevelDynamicChunkArgumentIndex = stateUnlockers.topLevelDynamicChunkArgumentIndex;
    const graphSelections = abiFunction?.graphBlockhashSelections;
    if (graphSelections?.length && this.categoryId) {
      const resolved = [];
      const graphPrior = [];
      const graphBase = this.blockhashSlotBase(abiFunction).base;
      const graphSlotCount = abiFunction.graphBlockhashOracle.slotCount;
      const pool = this.inner.oraclePool;
      if (pool === void 0) throw new Error(`${this.inner.name} reads blockhash(n), and binds no oracle pool`);
      for (const selection of graphSelections) {
        const n = isComputedBlockhashKey(selection.readKey) ? await this._extractGraphBlockhashRead(
          masterUtxo,
          stateInputUnlocker,
          filteredDataNftUtxos,
          graphPrior,
          graphBase,
          selection.slotOrdinal,
          graphSlotCount
        ) : this.paramBlockhashN(selection.readKey, selection.rowArgs, selection.handler);
        if (n === null) throw new Error(`blockhash: could not resolve message-bus batch row read "${selection.readKey}"`);
        const coSpend = await resolveBlockhashCoSpend(this.inner.provider, pool, n, resolved.map(({ utxo }) => utxo));
        if (!coSpend) throw new Error(`blockhash(${n}): oracle pool ${pool} has no live slot that answers block ${n}`);
        resolved.push(coSpend);
        graphPrior.push({
          slotOrdinal: selection.slotOrdinal,
          utxo: coSpend.utxo,
          unlocker: coSpend.unlocker,
          recreate: coSpend.recreateOutput
        });
      }
      blockhashCoSpendUtxos = resolved.map((cs) => ({ ...cs.utxo, unlocker: cs.unlocker }));
      blockhashCoSpendSlotOrdinals = graphSelections.map((selection) => selection.slotOrdinal);
      maxBhLocktime = resolved.reduce((m, cs) => Math.max(m, cs.locktime), maxBhLocktime);
    } else if (abiFunction?.blockhashReads && abiFunction.blockhashReads.length > 0 && this.categoryId) {
      const { base, count } = this.blockhashSlotBase(abiFunction);
      const resolved = await this._resolveBlockhashCoSpends(
        abiFunction,
        args,
        base,
        count,
        masterUtxo,
        stateInputUnlocker,
        filteredDataNftUtxos
      );
      blockhashCoSpendUtxos = resolved.map((cs) => ({ ...cs.utxo, unlocker: cs.unlocker }));
      maxBhLocktime = resolved.reduce((m, cs) => Math.max(m, cs.locktime), maxBhLocktime);
    }
    const rootOracleReader = selectRootOracleReader();
    const oracleDelegate = rootOracleReader?.delegateIndex === void 0 ? void 0 : lowLevelCallUtxoGroups[rootOracleReader.delegateIndex];
    delegateBlockInfoOracle = oracleDelegate !== void 0 && oracleDelegate.compilerRoute === void 0;
    if (rootOracleReader !== void 0) {
      const { reader } = rootOracleReader;
      const pool = reader.oraclePool;
      if (pool === void 0) throw new Error(`${reader.name} reads the block oracle, and binds no oracle pool`);
      const nestedOracle = takeNestedBlockOracleInput(
        externalCallUtxoGroups,
        lowLevelCallUtxoGroups,
        pool,
        () => {
          const funder = sharedFunderPool?.shift();
          if (funder === void 0) throw new Error("Insufficient funding UTXOs to preserve nested oracle slot");
          markSharedFunder(funder);
          return funder;
        }
      );
      blockInfoCoSpendUtxos = [nestedOracle ?? await poolInfoCoSpend(this.inner.provider, pool)];
    }
    const unslottedPoolCoSpends = await resolveUnslottedPoolInfoCoins(this.inner.provider, [
      { abiFunction, pool: this.inner.oraclePool, name: this.inner.name },
      ...calleePoolReaders(externalCallUtxoGroups, lowLevelCallUtxoGroups)
    ], [
      ...blockInfoCoSpendUtxos,
      ...[...externalCallUtxoGroups, ...lowLevelCallUtxoGroups].flatMap((group) => group.blockInputs ?? [])
    ]);
    if (abiFunction?.indirectPoolReads?.blockhash === true && this.categoryId) {
      const slots = await resolveIndirectBlockhashCoSpends(
        { categoryId: this.categoryId, inner: this.inner },
        masterUtxo,
        stateInputUnlocker,
        filteredDataNftUtxos,
        blockhashCoSpendUtxos,
        unslottedPoolCoSpends,
        blockhashCoSpendUtxos
      );
      unslottedPoolCoSpends.push(...slots.map(({ utxo, unlocker }) => ({ ...utxo, unlocker })));
      maxBhLocktime = slots.reduce((max, slot) => Math.max(max, slot.locktime), maxBhLocktime);
    }
    const ownSidecarPool = overrides?.sharedSidecarPool === void 0 ? void 0 : sharedSidecarPoolWithout(overrides.sharedSidecarPool, [...externalCallUtxoGroups, ...lowLevelCallUtxoGroups].flatMap((group) => [...group.blockInputs ?? [], ...group.keccakInputs ?? []]));
    let ecrecoverEvmPreimages = [];
    if (globalThis.process?.env?.SOLIDC_DEBUG_ECRECOVER_READINESS === "1") {
      console.error("ecrecover-build-entry", {
        function: abiFunction?.name,
        entryFunction: entryAbiFunction?.name,
        abiEcrecover: abiFunction?.ecrecoverCompute === true,
        entryEcrecover: entryAbiFunction?.ecrecoverCompute === true,
        hasCategory: this.categoryId !== void 0
      });
    }
    const coinKey = (utxo) => `${utxo.txid.toLowerCase()}:${utxo.vout}`;
    let middleCoins = 0;
    const takeMiddleCoin = async () => {
      if (this._signer !== void 0) {
        const reserved = new Set((sharedFunderPool ?? []).map(coinKey));
        const plain = (utxo) => utxo.token === void 0 && !consumedSharedFunders.has(coinKey(utxo));
        const wallet = (earlySignerUtxos ?? await signerFundingCoins(this._signer)).filter((utxo) => plain(utxo) && !reserved.has(coinKey(utxo))).sort((left, right) => Number(left.vout === 0) - Number(right.vout === 0) || (left.satoshis < right.satoshis ? -1 : left.satoshis > right.satoshis ? 1 : 0));
        const coin2 = wallet[0] ?? sharedFunderPool?.find(plain);
        if (coin2 !== void 0) {
          consumedSharedFunders.add(coinKey(coin2));
          const pooled = sharedFunderPool?.findIndex((utxo) => coinKey(utxo) === coinKey(coin2)) ?? -1;
          if (pooled >= 0) sharedFunderPool.splice(pooled, 1);
          if (!overrides?.returnProbeOnly) retireSignerUtxos(this._signer, [coin2]);
          const lock2 = addressToLockScript(this._signer.getAddress());
          return {
            input: { ...coin2, unlocker: this._signer.unlockP2PKH() },
            recreate: { to: lock2, amount: coin2.satoshis }
          };
        }
      }
      const mint = this.inner.provider.addUtxo;
      if (typeof mint !== "function") return void 0;
      middleCoins += 1;
      const lock = hexToBin(BALANCED_DUMMY_FUNDER_LOCKING_BYTECODE_HEX);
      const coin = {
        txid: binToHex(sha256Sync(utf8ToBin(`SolidCash recovery loop middle\0${this.categoryId}:${derivationMasterUtxo.txid}:${derivationMasterUtxo.vout}:${middleCoins}`))),
        vout: 0,
        satoshis: 10000n
      };
      await mint.call(this.inner.provider, BALANCED_DUMMY_FUNDER_LOCKING_BYTECODE_HEX, coin);
      return {
        input: {
          ...coin,
          unlocker: { generateLockingBytecode: () => lock, generateUnlockingBytecode: () => Uint8Array.of(1, 81) }
        },
        recreate: { to: lock, amount: coin.satoshis }
      };
    };
    const recoveryLoop = abiFunction?.ecrecoverTrailingLoop === true;
    if ((abiFunction?.ecrecoverCompute || entryAbiFunction?.ecrecoverCompute) && this.categoryId && !recoveryLoop) {
      const ecrecoverAbiFunction = abiFunction?.ecrecoverCompute ? abiFunction : entryAbiFunction;
      const ecrecoverExecutingGroup = ecrecoverAbiFunction !== abiFunction ? lowLevelCallUtxoGroups.find((group) => group.callMode === "delegatecall" && (group.compilerRoute?.abiFunction === ecrecoverAbiFunction || group.functionName === ecrecoverAbiFunction.name)) : void 0;
      const delegatedEcrecover = ecrecoverExecutingGroup !== void 0;
      delegateComputeResources ||= delegatedEcrecover;
      const ecrecoverArgs = ecrecoverAbiFunction === entryAbiFunction ? entryArgs : args;
      const graphRuntime = ecrecoverAbiFunction;
      const graphCalls = graphRuntime.graphEcrecoverCalls;
      const graphExecution = graphRuntime.messageBusGraphExecution === true;
      const resolution = await this._resolveEcrecoverComputeCoSpends(
        ecrecoverAbiFunction,
        ecrecoverArgs,
        graphCalls,
        {
          deferUnresolved: true,
          graphExecution
        },
        ownSidecarPool,
        // A message-bus graph's composer funds the slots no covenant reads with its own neutral coin.
        graphCalls === void 0 && !graphExecution ? takeMiddleCoin : void 0
      );
      ecrecoverComputeCoSpendUtxos = resolution.coSpends.map((cs) => ({ ...cs.utxo, unlocker: cs.unlocker }));
      ecrecoverComputeRecreates = resolution.coSpends.map((cs) => cs.recreate);
      ecrecoverEvmPreimages = resolution.evmPreimages;
      if (resolution.argBlobs.some((argBlob) => argBlob === null)) {
        const ordinaryKeccakCalls = ecrecoverAbiFunction.keccakPreimageParams?.length ?? 0;
        let evmOrdinal = 0;
        const evmKeccakPreimageIndices = (ecrecoverAbiFunction.ecrecoverEvmFlags ?? []).map((isEvm) => isEvm ? ordinaryKeccakCalls + evmOrdinal++ : -1);
        deferredEcrecoverCompute = {
          salt: resolution.salt,
          argBlobs: resolution.argBlobs,
          evmKeccakPreimageIndices,
          width0Coins: resolution.width0Coins
        };
      }
      if (globalThis.process?.env?.SOLIDC_DEBUG_ECRECOVER_READINESS === "1") {
        console.error("ecrecover-build-resolution", {
          function: ecrecoverAbiFunction.name,
          delegatedEcrecover,
          argBlobs: resolution.argBlobs.length,
          unresolvedArgs: resolution.argBlobs.filter((argBlob) => argBlob === null).length,
          coSpends: resolution.coSpends.length,
          recreates: ecrecoverComputeRecreates.length,
          evmPreimages: resolution.evmPreimages.length,
          deferred: deferredEcrecoverCompute !== void 0
        });
      }
    }
    let keccakLoopSideCars = [];
    let keccakLoopRecreates = [];
    const fixedKeccakBase = abiFunction?.blockLayout?.slots.find((slot) => slot.kind === "keccakSideCar")?.offset ?? 1 + filteredDataNftUtxos.length;
    const keccakProbeSlotInputs = (abiFunction?.blockLayout?.slots ?? []).filter((slot) => slot.kind === "entry" && slot.slotIndex !== void 0).flatMap((slot) => {
      const entry = entryNfts.find((candidate) => candidate.slotIndex === slot.slotIndex);
      if (entry?.utxo === void 0) return [];
      return [{ offset: slot.offset, utxo: entry.utxo, unlocker: entry.utxo.unlocker }];
    });
    const keccakFrontBase = [...externalReadUtxos, ...blockhashCoSpendUtxos];
    const padKeccakFront = (base) => abiFunction === void 0 ? keccakFrontBase : this._padKeccakLoopFrontRegion(
      abiFunction,
      filteredDataNftUtxos.length,
      base,
      keccakFrontBase,
      satoshiContainerUtxo,
      tokenContainers,
      blockInfoCoSpendUtxos
    );
    const keccakFrontRegion = padKeccakFront(fixedKeccakBase);
    if (abiFunction?.keccakLoopReads && this.categoryId) {
      const loopBlockSize = abiFunction.blockLayout?.blockSize ?? 1;
      const loopSidecarBase = abiFunction.blockLayout?.trailingBase ?? loopBlockSize;
      const keccakLoopFrontRegion = padKeccakFront(loopSidecarBase);
      const reversedTrailingPredecessors = { inputs: [], outputs: [] };
      if (abiFunction.keccakLoopPrecedesTrailingUser !== true) {
        let predecessorCursor = 0;
        for (const [, commitments] of sortedLoopCommitments) {
          const predecessor = insertLoopPredecessors[predecessorCursor];
          if (!predecessor) break;
          predecessorCursor += 1;
          const entryLock = predecessor.unlocker.generateLockingBytecode();
          reversedTrailingPredecessors.inputs.push(predecessor);
          for (const commitment of commitments) {
            reversedTrailingPredecessors.outputs.push({
              to: entryLock,
              amount: 1200n,
              token: {
                amount: 0n,
                category: this.categoryId,
                nft: { capability: "mutable", commitment }
              }
            });
          }
        }
      }
      const readChunks = readChunksFollowKeccakLoop(abiFunction) && dynamicReadChunkInputs.length > 0 && topLevelDynamicChunkArgumentIndex >= 0 && overrides?.compilerRouteSelector === void 0 ? keccakLoopReadSuccessors(dynamicReadChunkInputs, (firstInputIndex) => {
        const witness = finalArgs[topLevelDynamicChunkArgumentIndex];
        finalArgs[topLevelDynamicChunkArgumentIndex] = resolveDynamicChunkInputBase(firstInputIndex, 0, false);
        try {
          return buildStateInputUnlocker();
        } finally {
          finalArgs[topLevelDynamicChunkArgumentIndex] = witness;
        }
      }) : void 0;
      const loop = await this._resolveStatefulKeccakLoop(
        abiFunction,
        derivationMasterUtxo,
        stateInputUnlocker,
        filteredDataNftUtxos,
        dataNftUnlockers,
        keccakLoopFrontRegion,
        maxBhLocktime,
        reversedTrailingPredecessors,
        ownSidecarPool,
        readChunks
      );
      keccakLoopSideCars = loop.sideCars;
      keccakLoopRecreates = loop.recreates;
    } else if (abiFunction?.keccakChainReads && this.categoryId) {
      const resolution = await this._resolveKeccakComputeCoSpends(abiFunction, args, {
        masterUtxo: derivationMasterUtxo,
        stateInputUnlocker,
        dataNftUtxos: filteredDataNftUtxos,
        dataNftUnlockers,
        frontRegionInputs: keccakFrontRegion,
        slotInputs: keccakProbeSlotInputs,
        locktime: maxBhLocktime
      }, ownSidecarPool);
      keccakLoopSideCars = resolution.chain?.sideCars ?? [];
      keccakLoopRecreates = resolution.chain?.recreates ?? [];
    } else if ((abiFunction?.keccakCompute || entryAbiFunction?.keccakCompute || abiFunction?.ecrecoverEvmFlags?.some(Boolean) || entryAbiFunction?.ecrecoverEvmFlags?.some(Boolean)) && this.categoryId) {
      const keccakAbiFunction = abiFunction && (abiFunction.keccakCompute || abiFunction.ecrecoverEvmFlags?.some(Boolean)) ? abiFunction : entryAbiFunction;
      const executingGroup = keccakAbiFunction !== abiFunction ? lowLevelCallUtxoGroups.find((group) => group.callMode === "delegatecall" && (group.compilerRoute?.abiFunction === keccakAbiFunction || group.functionName === keccakAbiFunction.name)) : void 0;
      const delegatedKeccak = executingGroup !== void 0;
      delegateComputeResources ||= delegatedKeccak;
      const keccakArgs = keccakAbiFunction === entryAbiFunction ? entryArgs : args;
      const graphOwnedKeccak = keccakAbiFunction.messageBusGraphExecution === true;
      const resolution = await this._resolveKeccakComputeCoSpends(keccakAbiFunction, keccakArgs, {
        masterUtxo: derivationMasterUtxo,
        stateInputUnlocker,
        dataNftUtxos: filteredDataNftUtxos,
        dataNftUnlockers,
        frontRegionInputs: keccakFrontRegion,
        slotInputs: keccakProbeSlotInputs,
        locktime: maxBhLocktime,
        trailingReadInputs: iterationEntryInputs,
        firstDynamicReadInput: dynamicReadChunkInputs[0],
        ecrecoverPreimages: ecrecoverEvmPreimages,
        plannedPreimages: keccakAbiFunction.messageBusKeccakPreimages,
        ...(delegatedKeccak || graphOwnedKeccak || ecrecoverEvmPreimages.some((preimage) => preimage === null)) && {
          deferUnresolved: true
        },
        ...delegatedKeccak && {
          artifactBytecode: executingGroup?.externalContract.inner.bytecode
        }
      }, ownSidecarPool);
      keccakComputeCoSpendUtxos = resolution.coSpends.map((cs) => ({ ...cs.utxo, unlocker: cs.unlocker }));
      keccakComputeCommitments = resolution.coSpends.map((cs) => binToHex(cs.commitment));
      if (resolution.preimages.some((preimage) => preimage === null)) {
        deferredKeccakCompute = {
          salt: resolution.salt,
          legacy: resolution.legacy,
          preimages: resolution.preimages
        };
      }
    }
    if (recoveryLoop && abiFunction !== void 0 && this.categoryId) {
      const blockSize = abiFunction.blockLayout?.blockSize ?? 1;
      const frontStart = 1 + filteredDataNftUtxos.length;
      const front = padKeccakFront(blockSize).map((input) => ({ input, recreate: this._frontRegionRecreate(input) }));
      let keccakSlot = 0;
      for (const slot of abiFunction.blockLayout?.slots ?? []) {
        const at = slot.offset - frontStart;
        if (at < 0 || at >= front.length) continue;
        if (slot.kind === "keccakSideCar") {
          const sidecar = keccakComputeCoSpendUtxos[keccakSlot];
          const commitment = keccakComputeCommitments[keccakSlot];
          keccakSlot += 1;
          if (sidecar === void 0 || commitment === void 0) continue;
          front[at] = {
            input: sidecar,
            recreate: {
              to: sidecar.unlocker.generateLockingBytecode(),
              amount: sidecar.satoshis,
              token: {
                category: sidecar.token?.category ?? this.categoryId,
                amount: sidecar.token?.amount ?? 0n,
                nft: { capability: "mutable", commitment }
              }
            }
          };
        } else if (slot.kind === "entry") {
          const entry = keccakProbeSlotInputs.find((candidate) => candidate.offset === slot.offset);
          if (entry !== void 0) {
            const input = { ...entry.utxo, unlocker: entry.unlocker };
            front[at] = { input, recreate: this._frontRegionRecreate(input) };
          }
        }
      }
      const chain = abiFunction.keccakChainReads === true ? keccakLoopSideCars.map((input, index) => ({ input, recreate: keccakLoopRecreates[index] })) : [];
      const loop = await resolveStatefulEcrecoverLoopImpl(
        {
          provider: ownSidecarPool ?? this.inner.provider,
          vmProvider: this.inner.provider,
          createVirtualMachine: (provider) => createVirtualMachineBch2026ForProvider(provider),
          generateLibauthSourceOutputs: (inputs) => generateLibauthSourceOutputs(inputs),
          takeMiddleCoin
        },
        abiFunction,
        derivationMasterUtxo,
        stateInputUnlocker,
        filteredDataNftUtxos,
        dataNftUnlockers,
        front,
        maxBhLocktime,
        chain
      );
      keccakLoopSideCars = [...chain.map(({ input }) => input), ...loop.sideCars];
      keccakLoopRecreates = [...chain.map(({ recreate }) => recreate), ...loop.recreates];
    }
    const unlockableMaster = {
      ...derivationMasterUtxo,
      unlocker: stateInputUnlocker
    };
    const unlockableDataNfts = filteredDataNftUtxos.map((nftUtxo, i) => ({
      ...nftUtxo,
      unlocker: dataNftUnlockers[i]
    }));
    const eventLocks = collectCreateBuilderEventLocksImpl(
      {
        categoryId: this.categoryId,
        inner: this.inner
      },
      {
        abiFunction,
        entryAbiFunction,
        functionName,
        lowLevelCallUtxoGroups,
        nestedDelegateProxyGroupByLowLevel,
        timing
      }
    );
    const emitInfos = eventLocks.emitInfos;
    const eventDefs = eventLocks.eventDefs;
    const eventNftLockingBytecodes = eventLocks.eventNftLockingBytecodes;
    const runtimeEventNftLockingBytecodes = eventLocks.runtimeEventNftLockingBytecodes;
    const selectedEntryDynamicRows = entryAbiFunction?.messageBusRowArguments;
    const selectedDelegateDynamicRows = lowLevelCallUtxoGroups.flatMap((group) => group.callMode === "delegatecall" && group.compilerRoute?.rowArguments ? [...group.compilerRoute.rowArguments] : []);
    const selectedDynamicRows = [
      ...selectedEntryDynamicRows ?? [],
      ...selectedDelegateDynamicRows
    ];
    const dynamicWrites = [...abiFunction?.dynamicWrites ?? []];
    const hasSelectedDynamicRows = selectedDynamicRows.length > 0;
    const activeDynamicWrites = new Set(hasSelectedDynamicRows ? selectedDynamicRows.flatMap((row) => row.handler.dynamicWrites ?? []) : dynamicWrites);
    const delegateDynamicWrites = /* @__PURE__ */ new Set();
    for (const g of lowLevelCallUtxoGroups) {
      if (g.callMode !== "delegatecall") continue;
      const gFn = g.compilerRoute?.abiFunction ?? g.externalContract.inner.artifact.abi.find((f) => f.name === g.functionName);
      if (globalThis.process?.env?.SOLIDC_DEBUG_INPUTS === "1") {
        console.error("delegate-dynamic-write-source", {
          groupFunction: g.functionName,
          routeFunction: g.compilerRoute?.abiFunction.name,
          resolvedFunction: gFn?.name,
          writes: gFn?.dynamicWrites
        });
      }
      const routeWrites = [...gFn?.dynamicWrites ?? []];
      const effectiveSelectedWrites = resolveSelectedDynamicWrites(
        routeWrites,
        g.compilerRoute?.rowArguments?.map((row) => row.handler)
      );
      for (const name of effectiveSelectedWrites) activeDynamicWrites.add(name);
      for (const name of routeWrites) {
        delegateDynamicWrites.add(name);
        if (!dynamicWrites.includes(name)) dynamicWrites.push(name);
      }
    }
    const dynamicVarInfos = (stateLayout.variables ?? []).filter((v) => v.dynamic && dynamicWrites.includes(v.name));
    if (globalThis.process?.env?.SOLIDC_DEBUG_INPUTS === "1" && delegateDynamicWrites.size > 0) {
      console.error("delegate-dynamic-write-layout", {
        dynamicWrites,
        variables: stateLayout.variables?.map((v) => ({ name: v.name, type: v.type, dynamic: v.dynamic })),
        selected: dynamicVarInfos.map((v) => v.name)
      });
    }
    const dynamicChunkVars = dynamicVarInfos.map((v) => ({
      name: v.name,
      type: v.type,
      lockingBytecode: scriptToLockingBytecode(
        buildEntryNftCovenantScript(
          hexToBin(this.categoryId),
          computeCollectionHash(dynamicChunkSignature(v.name, v.type)),
          directConventionMasterLock(this.inner)
        ),
        this.inner.addressType
      ),
      ...delegateDynamicWrites.has(v.name) && { delegate: true }
    }));
    const dynamicChunks = await loadCreateBuilderDynamicChunksImpl(
      {
        categoryId: this.categoryId,
        inner: this.inner,
        evaluateExternalExpression: (...a) => this._evaluateExternalExpression(...a),
        hydrateExternalPredicateState: (...a) => this._hydrateExternalPredicateState(...a),
        vmapCounterDomain: (...a) => this._vmapCounterDomain(...a)
      },
      {
        dynamicVarInfos,
        dynamicChunkVars,
        valueChunkGc,
        onChainState,
        stateLayout,
        overrides,
        abiFunction,
        entryAbiFunction,
        lowLevelCallUtxoGroups,
        nestedDelegateProxyGroupByLowLevel,
        batchPredCommitments,
        sortedLoopCommitments,
        runtimeLoopDerivedCounts,
        sortedInserts,
        args,
        entryArgs,
        finalArgs,
        eventDefs,
        runtimeEventNftLockingBytecodes,
        timing,
        executionSelfAddress,
        functionName,
        tokenContainers,
        routeRowIndex,
        selectedRowArgument,
        kernelJournalSettlementEntrySegments,
        runtimeLoopEntrySegments,
        entryAccesses: abiFunction?.entryAccesses,
        dynamicWrites,
        activeDynamicWrites,
        activeDelegateGroupIndex,
        externalCallUtxoGroups,
        entryNftLockingBytecodes
      }
    );
    const dynamicChunkInputs = dynamicChunks.dynamicChunkInputs;
    const trailingDisposalInputs = dynamicChunks.trailingDisposalInputs;
    const oldDynamicChunkCounts = dynamicChunks.oldDynamicChunkCounts;
    const oldDynamicChunkCommitments = dynamicChunks.oldDynamicChunkCommitments;
    const loopEntryVars = dynamicChunks.loopEntryVars;
    const runtimeLoopEventOutputs = dynamicChunks.runtimeLoopEventOutputs;
    const runtimeLoopTransferOutputs = dynamicChunks.runtimeLoopTransferOutputs;
    const runtimeLoopTrailingSegments = dynamicChunks.runtimeLoopTrailingSegments;
    const delegateRouteGroup = dynamicChunks.delegateRouteGroup;
    const layoutResolved = await resolveCreateBuilderEffectiveLayoutImpl(
      {
        inner: this.inner,
        getLogicalAddress: () => this._logicalAddress,
        setLogicalAddress: (address) => {
          this._logicalAddress = address;
        }
      },
      {
        delegateRouteGroup,
        physicalAbiFunction,
        abiFunction,
        lowLevelCallUtxoGroups,
        nestedDelegateProxyGroupByLowLevel,
        activeDelegateGroupIndex,
        externalCallUtxoGroups,
        dynamicChunkVars,
        delegateReturnEventOffset,
        delegateEventSlots,
        overrides,
        functionName,
        timingEnabled,
        timing
      }
    );
    const compilerRouteDelegateLayout = layoutResolved.compilerRouteDelegateLayout;
    let effectiveBlockLayout = layoutResolved.effectiveBlockLayout;
    const logicalIdentity = layoutResolved.logicalIdentity;
    const usesComposedDelegateDynamicTail = layoutResolved.usesComposedDelegateDynamicTail;
    if (timingEnabled) console.error("builder-shape", {
      functionName,
      externalGroups: externalCallUtxoGroups.length,
      lowLevelGroups: lowLevelCallUtxoGroups.length,
      blockSize: effectiveBlockLayout?.blockSize,
      slots: effectiveBlockLayout?.slots.length,
      iterationInputs: iterationEntryInputs.length,
      dynamicInputs: dynamicChunkInputs.length,
      disposalInputs: trailingDisposalInputs.length,
      heapMb: Math.round((globalThis.process?.memoryUsage?.().heapUsed ?? 0) / 1048576)
    });
    const transportedProductions = overrides?.valueChunkProductions ?? [];
    const ordinaryTransportedRoute = activeDelegateGroupIndex === void 0 && abiFunction?.messageBusGraphExecution === true;
    applyCreateBuilderTransportedProductionsImpl({
      transportedProductions,
      activeDelegateGroupIndex,
      lowLevelCallUtxoGroups,
      overrides,
      ...abiFunction?.messageBusGraphExecution === true && {
        ordinaryRoute: {
          categoryId: this.categoryId,
          lockingBytecode: this.inner.lockingBytecode,
          artifact: this.inner.artifact,
          rows: abiFunction.messageBusRowArguments ?? []
        }
      }
    });
    const constructed = constructCreateBuilderTransactionBuilderImpl(
      {
        categoryId: this.categoryId,
        inner: this.inner
      },
      {
        finalArgs,
        abiFunction,
        entryAbiFunction,
        physicalAbiFunction,
        functionName,
        effectiveBlockLayout,
        entryAccesses,
        entryNfts,
        batchTargetPlaceholders,
        resolvedMsgSenderCategory,
        externalReadUtxos,
        overrides,
        valueChunkWriteStagingSession,
        unlockableMaster,
        unlockableDataNfts,
        stateLayout,
        requiredNftIndices,
        entryNftLockingBytecodes,
        dynamicChunkVars,
        dynamicChunkInputs,
        trailingDisposalInputs,
        loopEntryVars,
        runtimeLoopEventOutputs,
        runtimeLoopTransferOutputs,
        runtimeLoopTrailingSegments,
        kernelJournalSettlementOutputPlan,
        kernelJournalEagerOutputPlan,
        tokenContainers,
        tokenContainerLockingBytecodes,
        satoshiContainerUtxo,
        satoshiContainerLockingBytecode,
        blockhashCoSpendUtxos,
        blockInfoCoSpendUtxos,
        delegateBlockInfoOracle,
        unslottedPoolCoSpends,
        blockhashCoSpendSlotOrdinals,
        keccakComputeCoSpendUtxos,
        keccakComputeCommitments,
        delegateComputeResources,
        deferredKeccakCompute,
        deferredEcrecoverCompute,
        ecrecoverComputeCoSpendUtxos,
        ecrecoverComputeRecreates,
        keccakLoopSideCars,
        keccakLoopRecreates,
        externalOutStateUtxoGroups,
        externalCallUtxoGroups,
        embeddedFunderUtxos,
        logicalIdentity,
        identityAnchors,
        lowLevelCallUtxoGroups,
        activeDelegateGroupIndex,
        lowLevelCallRawInputs,
        compilerRouteDelegateLayout,
        hasDelegatedDynamicReadChunks,
        delegateReturnEventOffset,
        delegateEventSlots,
        lowLevelCallInputBase,
        batchPredCommitments,
        sortedLoopCommitments,
        eventDefs,
        eventNftLockingBytecodes,
        iterationEntryInputs,
        insertLoopPredecessors,
        dynamicReadChunkInputs,
        topLevelDynamicChunkArgumentIndex,
        topLevelReturnWitnessGroups,
        refreshPhysicalDelegateInputIndex,
        buildStateInputUnlocker,
        allGroupEcSlots,
        derivationMasterUtxo,
        masterUtxo,
        timing
      }
    );
    const builder = constructed.builder;
    builder.setStandInCaller(overrides?.standInCaller);
    finalArgs = constructed.finalArgs;
    const firstRootDynamicChunk = constructed.firstRootDynamicChunk;
    const refreshTopLevelReturnWitnesses = constructed.refreshTopLevelReturnWitnesses;
    if (globalThis.process?.env?.SOLIDC_DEBUG_ROUTE_CONCISE === "1") {
      console.error("stateful-builder-created", { functionName });
    }
    registerCreateBuilderBuilderStateImpl(
      {
        categoryId: this.categoryId,
        inner: this.inner
      },
      {
        builder,
        oldDynamicChunkCommitments,
        oldDynamicChunkCounts,
        overrides,
        masterUtxo,
        inactiveMessageBusEntrySlots,
        entryDeleteSlots,
        condSoftDeleteSlots,
        entryNfts,
        entryAbiFunction,
        batchTargetPlaceholders,
        exactBatchTargetSlots,
        sortedInserts,
        compilerRouteDelegateLayout,
        activeDynamicWrites,
        usesComposedDelegateDynamicTail,
        computedValueChunkRuns,
        onChainState,
        entryArgs,
        pendingEntryValueTails,
        transportedProductions,
        ordinaryTransportedRoute,
        valueChunkMints,
        maxBhLocktime,
        functionName,
        timing,
        activeMessageBusEntryOperations,
        dynamicChunkVars,
        selectedDynamicRows,
        sortedLoopCommitments,
        runtimeExpressionLoopCollections,
        batchPredCommitments,
        batchTargetSlots,
        runtimeLoopDerivedCounts,
        computedValueUpdateCollections,
        effectiveBlockLayout,
        loopValueChunkMints
      }
    );
    const ownedMaterializedValueChunkCounts = [
      ...valueChunkMints.map((mint) => mint.chunks.length),
      ...loopValueChunkMints.map((mint) => mint.chunks.length),
      ...ordinaryTransportedRoute ? transportedProductions.map((production) => production.write.outputCount) : []
    ];
    await allocateCreateBuilderFundersImpl(
      {
        categoryId: this.categoryId,
        inner: this.inner,
        signer: this._signer,
        retireSignerUtxos,
        invalidateSignerUtxos,
        signerUtxoSnapshot,
        markSharedFunder
      },
      {
        builder,
        effectiveBlockLayout,
        insertLoopPredecessors,
        sortedLoopCommitments,
        entryAbiFunction,
        returnEmitOutputIndex,
        overrides,
        externalCallUtxoGroups,
        lowLevelCallUtxoGroups,
        sharedFunderPool,
        sharedFunderSnapshot,
        functionName,
        timing,
        compilerRouteDelegateLayout,
        blockhashCoSpendSlotOrdinals,
        keccakComputeCoSpendUtxos,
        ecrecoverComputeCoSpendUtxos,
        iterationEntryInputs,
        dynamicChunkInputs,
        trailingDisposalInputs,
        abiFunction,
        nestedDelegateProxyGroupByLowLevel,
        masterUtxo,
        consumedSharedFunders,
        timingEnabled,
        earlySignerUtxos
      }
    );
    const {
      applyMintingMasterFills,
      refreshNestedIdentityAnchorWitnesses
    } = applyCreateBuilderPendingInputFillsImpl({
      builder,
      overrides,
      functionName,
      entryAbiFunction,
      externalCallUtxoGroups,
      lowLevelCallUtxoGroups,
      pendingDynamicChunkInputFills,
      pendingAnchorFills,
      pendingExternalCallInputFills,
      pendingDelegateInputFills,
      pendingTokenCallInputFills,
      firstRootDynamicChunk
    });
    const assembledWitnessBag = {
      finalArgs,
      stateInputUnlocker
    };
    const { refreshTopLevelIdentityAnchorWitnesses: refreshTopLevelIdentityAnchorWitnessesRaw } = rebindCreateBuilderAssembledWitnessesImpl(assembledWitnessBag, {
      builder,
      abiFunction,
      externalCallUtxoGroups,
      lowLevelCallUtxoGroups,
      topLevelAnchorFillPositions,
      topLevelVmapProofUtxos,
      masterUtxo,
      derivationMasterUtxo,
      buildStateInputUnlocker,
      refreshTopLevelReturnWitnesses
    });
    stateInputUnlocker = assembledWitnessBag.stateInputUnlocker;
    const refreshTopLevelIdentityAnchorWitnesses = () => {
      const changed = refreshTopLevelIdentityAnchorWitnessesRaw();
      stateInputUnlocker = assembledWitnessBag.stateInputUnlocker;
      return changed;
    };
    const {
      derivTransferCount,
      derivTokenOps,
      delegatecallInputIndex,
      eventBlockLayoutForDerive
    } = await prepareCreateBuilderDerivePreludeImpl(
      {
        categoryId: this.categoryId,
        inner: this.inner,
        hydrateExternalPredicateState: (...a) => this._hydrateExternalPredicateState(...a),
        evaluateExternalExpression: (...a) => this._evaluateExternalExpression(...a)
      },
      {
        builder,
        abiFunction,
        entryAbiFunction,
        args,
        tokenContainerAbiFunction,
        tokenContainerArgs,
        tokenContainerAccesses,
        onChainState,
        executionSelfAddress,
        overrides,
        functionName,
        returnAbiFunction,
        returnEmitOutputIndex,
        returnMaterializationOutputIndex,
        returnEmitBlockOffset,
        delegateReturnEventOffset,
        lowLevelCallUtxoGroups,
        externalCallUtxoGroups,
        externalOutStateUtxoGroups,
        activeDelegateGroupIndex,
        effectiveBlockLayout,
        timing
      }
    );
    const calleeSlotLocktime = await resolveCalleeIndirectBlockhashCoSpends(
      this.inner.provider,
      builder,
      calleePoolReaders(externalCallUtxoGroups, lowLevelCallUtxoGroups)
    );
    if (calleeSlotLocktime > maxBhLocktime) builder.setLocktime(calleeSlotLocktime);
    assembledWitnessBag.stateInputUnlocker = stateInputUnlocker;
    await runCreateBuilderDerivePassImpl(
      {
        deriveFullTransactionState: (...a) => this._deriveFullTransactionState(...a)
      },
      assembledWitnessBag,
      {
        builder,
        abiFunction,
        entryAbiFunction,
        requiredNftIndices,
        entryAccesses,
        loopEntryVars,
        runtimeLoopEventOutputs,
        runtimeLoopTransferOutputs,
        emitInfos,
        derivTransferCount,
        derivTokenOps,
        externalCallUtxoGroups,
        externalOutStateUtxoGroups,
        returnEmitOutputIndex,
        stateLayout,
        allGroupEcSlots,
        functionName,
        timingEnabled,
        timing,
        computedValueChunkRuns,
        ownedMaterializedValueChunkCounts,
        overrides,
        applyMintingMasterFills,
        refreshNestedIdentityAnchorWitnesses,
        refreshTopLevelIdentityAnchorWitnesses,
        eventBlockLayoutForDerive,
        delegatecallInputIndex,
        onChainState,
        valueChunkWriteStagingSession,
        buildStateInputUnlocker
      }
    );
    stateInputUnlocker = assembledWitnessBag.stateInputUnlocker;
    await materializeCreateBuilderReturnEmitImpl(
      {
        categoryId: this.categoryId,
        inner: this.inner,
        lastReturnProbeFailure: this.lastReturnProbeFailure,
        deriveReturnBlob: (...a) => this._deriveReturnBlob(...a)
      },
      {
        builder,
        overrides,
        functionName,
        returnEmitOutputIndex,
        returnMaterializationOutputIndex,
        delegatecallInputIndex,
        entryAbiFunction,
        abiFunction,
        externalCallUtxoGroups,
        preparedAtomicNodes,
        preparedAtomicNodeByExternalGroup
      }
    );
    finishCreateBuilderAtomicPromotionImpl({
      builder,
      preparedAtomicNodes,
      functionName
    });
    timing("complete");
    const vmErrored = (candidate) => candidate.__vmErrored === true;
    if (vmErrored(builder)) {
      const tried = /* @__PURE__ */ new Set();
      for (const { owners, chainedDeletes } of sortedNodeOwnerAlternatives) {
        const key = `${owners.join()}|${chainedDeletes?.join() ?? ""}`;
        if (tried.has(key)) continue;
        tried.add(key);
        const retry = await this._createBuilder(functionName, callerArgs, {
          ...overrides,
          sortedNodeOwners: owners,
          sortedChainedDeletes: chainedDeletes
        });
        if (!vmErrored(retry)) return retry;
      }
    }
    return builder;
  }
  describeReturnProbeFailure(trace, inputIndex) {
    return describeReturnProbeFailureImpl(
      { inner: this.inner },
      trace,
      inputIndex
    );
  }
  // B8 emit: run one VM probe and extract the encoded return blob from the return-event verification
  // (OP_OUTPUTTOKENCOMMITMENT == __returnBlob), the same trace-extraction used for external-call returns.
  _deriveReturnBlob(builder, returnOutputIndex, inputIndex = 0) {
    const self = this;
    return deriveReturnBlobImpl(
      {
        inner: self.inner,
        get lastReturnProbeFailure() {
          return self.lastReturnProbeFailure;
        },
        set lastReturnProbeFailure(v) {
          self.lastReturnProbeFailure = v;
        }
      },
      builder,
      returnOutputIndex,
      inputIndex
    );
  }
  /** @internal Extract a participant's message-bus return commitment from a complete bus transaction. */
  _messageBusReturnBlobFromTransaction(builder, returnOutputIndex, inputIndex, program = builder.buildLibauthProgram(), resultSchema) {
    const self = this;
    return messageBusReturnBlobFromTransactionImpl(
      {
        inner: self.inner,
        get lastReturnProbeFailure() {
          return self.lastReturnProbeFailure;
        },
        set lastReturnProbeFailure(v) {
          self.lastReturnProbeFailure = v;
        }
      },
      builder,
      returnOutputIndex,
      inputIndex,
      program,
      resultSchema
    );
  }
  /** @internal Discover routed event expectations from the complete atomic transaction.
   *
   * Isolated participant probes can stop before a graph handler reaches its event covenant because their graph
   * coordinates are intentionally final-transaction-relative. The atomic composer already has the authoritative
   * transaction here, so read each event commitment and exact locking bytecode from that trace. If the compact
   * faithful trace stops before all event pins, rerun the same VM semantics with complete tracing; neither pass
   * suppresses verification, and the ordinary final preflight remains the authority for acceptance.
   */
  _messageBusEventCommitmentsFromTransaction(builder, eventOutputIndices, inputIndex, program = builder.buildLibauthProgram()) {
    const self = this;
    return messageBusEventCommitmentsFromTransactionImpl(
      {
        inner: self.inner,
        get lastReturnProbeFailure() {
          return self.lastReturnProbeFailure;
        },
        set lastReturnProbeFailure(v) {
          self.lastReturnProbeFailure = v;
        }
      },
      builder,
      eventOutputIndices,
      inputIndex,
      program
    );
  }
  /**
   * ethers-style `fn.staticCall(...)` read: run the function's covenant in a read-only VM probe against the
   * current on-chain state + args, extract the encoded return value, and decode it against the ABI output type(s)
   * WITHOUT sending a transaction. A single output returns the decoded value; multiple outputs return an
   * ethers-style array (tuple). Typechain `.toObject()`/`.toArray()` accessors are attached at this boundary.
   */
  async _deriveReturnValue(functionName, args, calls, exactAbiFunction, calleeCalls, callerLockingBytecode, callerCategoryId, callerContract) {
    const self = this;
    return deriveReturnValueImpl(
      {
        inner: self.inner,
        provider: self.inner.provider,
        target: self.target,
        externalRegistry: self._externalRegistry,
        get lastReturnProbeFailure() {
          return self.lastReturnProbeFailure;
        },
        set lastReturnProbeFailure(v) {
          self.lastReturnProbeFailure = v;
        },
        get _deriveSeq() {
          return self._deriveSeq;
        },
        set _deriveSeq(v) {
          self._deriveSeq = v;
        },
        addressMappingKeyCandidates: (v) => self._addressMappingKeyCandidates(v),
        getSoftMapping: (...a) => self._getSoftMapping(...a),
        resolveCallAbi: (functionName2, args2) => self._resolveCallAbi(functionName2, args2),
        getEntries: (name) => self.getEntries(name),
        createBuilder: (...a) => self._createBuilder(...a),
        deriveReturnBlob: (...a) => self._deriveReturnBlob(...a),
        getState: () => self.getState(),
        getCallerMasterUtxo: async (caller) => {
          const full = await caller.getFullState();
          return full.masterUtxo;
        },
        contract: self,
        signer: self._logicalNonceSigner ?? self._signer
      },
      functionName,
      args,
      calls,
      exactAbiFunction,
      calleeCalls,
      callerLockingBytecode,
      callerCategoryId,
      callerContract
    );
  }
  /**
   * Lightweight state retrieval that only fetches the master UTXO (no data NFTs/entries).
   * Used for functions that don't access on-chain state (e.g., split/merge/unsafe tiers).
   */
  async _getMasterOnlyState() {
    const tokenUtxos = await this.inner.provider.getUtxos(this.inner.tokenAddress);
    const masterUtxo = tokenUtxos.find(
      (u) => u.token?.category === this.categoryId && u.token?.nft?.capability === "minting"
    );
    return {
      masterUtxo: masterUtxo ?? void 0,
      dataNftUtxos: [],
      entryNftUtxos: [],
      state: {}
    };
  }
  _keysMatch(a, b, _keyType) {
    if (a instanceof Uint8Array && b instanceof Uint8Array) {
      return binsAreEqual(a, b);
    }
    return a === b;
  }
  /**
   * Resolve the external category ID for an external read (address model).
   * A's constructor args bake the callee *address*, not its category, so the category is
   * recovered from the registered external contract (keyed by interface name).
   */
  _resolveExternalCategoryId(er, _artifact) {
    return this._resolveRegisteredExternalCategoryId(er.interfaceName);
  }
  /** Look up a registered external contract's category ID by interface name. */
  _resolveRegisteredExternalCategoryId(interfaceName) {
    const ext = this._externalRegistry.get(interfaceName);
    if (!ext) {
      throw new Error(
        `External contract for interface '${interfaceName}' is not registered. Provide it via connect-time externals (connect/from { externals }) or withExternalCall().`
      );
    }
    return ext.categoryId;
  }
  /**
   * Get the token-aware address for external data NFTs.
   */
  _getExternalDataNftAddress(externalCategoryId) {
    let masterLock;
    for (const ext of this._externalRegistry.values()) {
      if (ext.categoryId !== externalCategoryId) continue;
      masterLock = directConventionMasterLock(ext.inner);
      break;
    }
    const covenantScript = buildDataNftCovenantScript(hexToBin(externalCategoryId), masterLock);
    return scriptToAddress(covenantScript, this.inner.provider.network, this.inner.addressType, true);
  }
  /** Resolve returning calls nested inside another external-call argument expression. */
  async _resolveExternalExpressionReturns(argSources, functionArgs, registryOwner, state, callerInputs, executionSelfAddress, producerCalls, allowProvisional = false, planningContext = createGraphPlanningProducerResultContext(), consumer, occurrenceIndex = 0, executionCallerAddress) {
    return resolveExternalExpressionReturnsImpl(
      {
        inner: this.inner,
        categoryId: this.categoryId,
        externalRegistry: this._externalRegistry,
        asCallerContract: () => this,
        resolveExternalArgs: (...a) => this._resolveExternalArgs(...a),
        evaluateExternalExpression: (...a) => this._evaluateExternalExpression(...a)
      },
      argSources,
      functionArgs,
      registryOwner,
      state,
      callerInputs,
      executionSelfAddress,
      producerCalls,
      allowProvisional,
      planningContext,
      consumer,
      occurrenceIndex,
      executionCallerAddress
    );
  }
  /**
   * The lock `address(this)` names in an ordinary entry, as `_createBuilder` derives its public self: the CREATE lock
   * when the entry authenticates its own self, else the executing lock.
   * @internal
   */
  _ordinaryEntrySelfAddress(abiFunction) {
    const registeredSelf = findDeploymentByAddress(this.inner.provider, this.target);
    const authenticated = hexToBin(registeredSelf?.lockingBytecode || this.inner.lockingBytecode);
    const logical = this._logicalAddress === void 0 ? void 0 : addressToLockScript(this._logicalAddress);
    return usesOrdinarySelfIdentity(abiFunction) && logical !== void 0 && binToHex(logical).toLowerCase() !== binToHex(authenticated).toLowerCase() ? logical : authenticated;
  }
  /**
   * Resolve B's function args from A's args using argSources metadata.
   * Returns the resolved args, or undefined if any arg source is unresolvable.
   * @internal
   */
  _resolveExternalArgs(argSources, functionArgs, artifact, state, callerInputs, externalReturns, occurrenceIndex = 0, stateIncludesPriorWrites = false, executionSelfAddress, executionCallerAddress, ownerConstructorArgs) {
    return resolveExternalArgsImpl(
      {
        inner: this.inner,
        signer: this._signer,
        evaluateExternalExpression: (...a) => this._evaluateExternalExpression(...a)
      },
      argSources,
      functionArgs,
      artifact,
      state,
      callerInputs,
      externalReturns,
      occurrenceIndex,
      stateIncludesPriorWrites,
      executionSelfAddress,
      executionCallerAddress,
      ownerConstructorArgs
    );
  }
  /** Resolve a callsite's reached rows against the authenticated execution frame. */
  async _planExternalCallOccurrences(call, frame) {
    const evaluate = (expression, iteration, bindings) => this._evaluateExternalExpression(
      expression,
      frame.functionArgs,
      frame.artifact,
      frame.state,
      frame.callerInputs,
      frame.externalReturns,
      iteration,
      false,
      frame.executionSelfAddress,
      bindings,
      void 0,
      false,
      frame.executionMsgSender
    );
    const candidates = call.iterationDomain ? evaluateExternalCallAffineIterationDomain(
      call.iterationDomain,
      (expression, bindings) => {
        const value = evaluate(expression, 0, bindings);
        return typeof value === "bigint" || typeof value === "boolean" ? value : void 0;
      }
    ) : externalCallCandidateIterationIndices(call, frame.functionArgs);
    if (!candidates) {
      throw new Error(`External callsite ${call.callsiteId ?? "unknown"} has no exact iteration domain`);
    }
    const reached = [];
    for (const sourceIteration of candidates) {
      if (call.condition) {
        const active = evaluate(call.condition, sourceIteration);
        if (typeof active !== "boolean") {
          throw new Error(`External callsite ${call.callsiteId ?? "unknown"} has unresolved condition`);
        }
        if (!active) continue;
      }
      const args = this._resolveExternalArgs(
        call.rawArgSources ?? call.argSources,
        frame.functionArgs,
        frame.artifact,
        frame.state,
        frame.callerInputs,
        frame.externalReturns,
        sourceIteration,
        false,
        frame.executionSelfAddress,
        frame.executionMsgSender
      );
      if (!args) throw new Error(`External callsite ${call.callsiteId ?? "unknown"} has unresolved arguments`);
      reached.push({ args, sourceIteration, occurrenceIndex: reached.length });
    }
    return reached;
  }
  _vmapCounterDomain(info, spec, legacyBound, functionArgs, artifact, callerInputs, state, executionSelfAddress) {
    const resolved = info?.iterationBound ? this._evaluateExternalExpression(
      info.iterationBound,
      functionArgs,
      artifact,
      state,
      callerInputs,
      void 0,
      0,
      false,
      executionSelfAddress
    ) : legacyBound;
    if (typeof resolved !== "bigint" && typeof resolved !== "number" && typeof resolved !== "string") {
      return void 0;
    }
    const step = this._vmapCounterStep(
      info,
      spec,
      functionArgs,
      artifact,
      callerInputs,
      state,
      executionSelfAddress
    );
    return step === void 0 ? void 0 : vmapCounterPermutationValues(BigInt(resolved), {
      ...spec,
      step,
      exactBound: info?.iterationExactBound
    });
  }
  _vmapCounterStep(info, spec, functionArgs, artifact, callerInputs, state, executionSelfAddress) {
    if (!info?.iterationStep) return spec.step;
    const resolved = this._evaluateExternalExpression(
      info.iterationStep,
      functionArgs,
      artifact,
      state,
      callerInputs,
      void 0,
      0,
      false,
      executionSelfAddress
    );
    if (typeof resolved !== "bigint" && typeof resolved !== "number" && typeof resolved !== "string") {
      return void 0;
    }
    const step = BigInt(resolved);
    if (step === 0n || spec.step > 0n !== step > 0n) {
      throw new Error("vmap counter loop runtime step must advance toward its bound");
    }
    return step;
  }
  /** Validate and evaluate one compiler-authenticated chunkable-array push operand. */
  _encodeStoredElementSource(access, elementType, functionArgs, handler, artifact, state) {
    return encodeStoredElementSourceImpl(
      {
        evaluateExternalExpression: (...a) => this._evaluateExternalExpression(...a)
      },
      access,
      elementType,
      functionArgs,
      handler,
      artifact,
      state
    );
  }
  _encodeStoredValueSource(access, valueType, functionArgs, handler, artifact, state, externalReturns, incomingEntries) {
    return encodeStoredValueSourceImpl(
      { evaluateExternalExpression: (...a) => this._evaluateExternalExpression(...a) },
      access,
      valueType,
      functionArgs,
      handler,
      artifact,
      state,
      externalReturns,
      incomingEntries
    );
  }
  _evaluateExternalExpression(expression, functionArgs, artifact, state, callerInputs, externalReturns, occurrenceIndex = 0, stateIncludesPriorWrites = false, executionSelfAddress, localBindings, stateLengthDeltas, strictFieldAccess = false, executionCallerAddress) {
    return evaluateExternalExpressionImpl(
      {
        resolveExternalArgs: (...a) => this._resolveExternalArgs(...a),
        resolveMappingValue: (collection, keys) => this._resolveActiveMappingValue(collection, keys)
      },
      expression,
      functionArgs,
      artifact,
      state,
      callerInputs,
      externalReturns,
      occurrenceIndex,
      stateIncludesPriorWrites,
      // `address(this)` in a compiler-described expression is this contract's own physical lock when the call
      // site did not name a distinct executing identity.
      executionSelfAddress ?? hexToBin(this.inner.lockingBytecode),
      localBindings,
      stateLengthDeltas,
      strictFieldAccess,
      executionCallerAddress
    );
  }
  /**
   * Read one entry of the build's own sorted mapping from the nodes loaded for this call. The compiler
   * serializes `m[address(this)]` in an external-call argument as a `stateAccess`; the value is not a data-NFT
   * field, so this is the only synchronous source for it.
   */
  _resolveActiveMappingValue(collectionName, keys) {
    const layout = this.inner.artifact.stateLayout;
    const collection = layout?.collections?.find((candidate) => candidate.name === collectionName);
    const utxos = this._activeMappingEntryUtxos;
    if (!collection || utxos === void 0) return void 0;
    const keyTypes = collection.keyTypes ?? [collection.keyType];
    const encoded = [];
    for (const [index, key] of keys.entries()) {
      const keyType = keyTypes[index] ?? collection.keyType;
      if (keyType === "address" || keyType === "address payable") {
        if (key instanceof Uint8Array) {
          encoded.push(key);
          continue;
        }
        if (typeof key === "string") {
          const lock = key.includes(":") ? tryCashAddressToLockScript(key) : void 0;
          const hex = key.startsWith("0x") ? hexToBin(key.slice(2)) : void 0;
          if (lock === void 0 && hex === void 0) return void 0;
          encoded.push(lock ?? hex);
          continue;
        }
        return void 0;
      }
      if (key instanceof Uint8Array) encoded.push(key);
      else if (typeof key === "bigint") encoded.push(bigIntToVmNumber(key));
      else if (typeof key === "number") encoded.push(bigIntToVmNumber(BigInt(key)));
      else if (typeof key === "boolean") encoded.push(bigIntToVmNumber(key ? 1n : 0n));
      else return void 0;
    }
    const slot = keyToSlotMulti(encoded, collection);
    const entry = SortedList.fromUtxos(utxos).find(slot);
    if (entry === void 0) {
      return getDefaultStateValue(collection.valueType, layout?.structs);
    }
    try {
      return decodePushdataValue(entry.value, 0, collection.valueType, layout?.structs).value;
    } catch {
      return getDefaultStateValue(collection.valueType, layout?.structs);
    }
  }
  /**
   * Construct the exact positional message-bus batch blob expected by a grouped external
   * call. The callee capability is treated as untrusted artifact data: every
   * logical selector must resolve to an advertised eligible handler with the
   * same input types before any transaction is built.
   */
  _replaceRepeatedExternalBatchRow(route, previousArgs, nextArgs, calleeArtifact, routeMsgSender) {
    return replaceRepeatedExternalBatchRowImpl(
      {
        concatBytes: (...a) => StatefulContract._concatBytes(...a),
        uintLe: (...a) => StatefulContract._uintLe(...a),
        signedLogicalValue: (...a) => StatefulContract._signedLogicalValue(...a)
      },
      route,
      previousArgs,
      nextArgs,
      calleeArtifact,
      routeMsgSender
    );
  }
  _buildRepeatedExternalBatch(externalCall, functionArgs, externalContract, callerArtifact = this.inner.artifact, callerState, calleeRouteArtifact = externalContract?.inner?.artifact, callerInputs, callerStateIncludesPriorWrites = false, callerSelfAddress, externalReturns, callerIdentity, producerPathForRow) {
    return buildRepeatedExternalBatchImpl(
      {
        inner: this.inner,
        target: this.target,
        evaluateExternalExpression: (...a) => this._evaluateExternalExpression(...a),
        resolveExternalArgs: (...a) => this._resolveExternalArgs(...a),
        concatBytes: (...a) => StatefulContract._concatBytes(...a),
        uintLe: (...a) => StatefulContract._uintLe(...a),
        signedLogicalValue: (...a) => StatefulContract._signedLogicalValue(...a)
      },
      externalCall,
      functionArgs,
      externalContract,
      callerArtifact,
      callerState,
      calleeRouteArtifact,
      callerInputs,
      callerStateIncludesPriorWrites,
      callerSelfAddress,
      externalReturns,
      callerIdentity,
      producerPathForRow
    );
  }
  /**
   * Find an external data NFT UTXO at a specific nftIndex.
   * Data NFTs are sorted by vout; the nftIndex corresponds to their position.
   */
  async _findExternalDataNft(dataNftAddress, externalCategoryId, nftIndex) {
    try {
      const utxos = await this.inner.provider.getUtxos(dataNftAddress);
      const dataNfts = utxos.filter((u) => u.token && u.token.category === externalCategoryId && u.token.nft && u.token.nft.capability === "mutable" && u.token.nft.commitment.length > 0).sort((a, b) => a.vout - b.vout);
      return dataNfts[nftIndex];
    } catch {
      return void 0;
    }
  }
  /**
   * Split a minting NFT into N new minting NFTs.
   * Transaction: [master, funding...] -> [master_preserved, new_minting_1..N, change]
   * A direct block.* reader co-spends an oracle coin ahead of the master and copies it once per new master.
   */
  static async split(options) {
    if (isFramedArtifact(options.contract.inner.artifact)) await loadFramedCallHandle();
    return splitStatefulContractImpl(options);
  }
  /**
   * Merge N consumed minting NFTs into the surviving master.
   * Transaction: [master_surviving, consumed_1..N, funding...] -> [master_preserved, change]
   */
  static async merge(options) {
    if (isFramedArtifact(options.contract.inner.artifact)) await loadFramedCallHandle();
    return mergeStatefulContractImpl(options);
  }
  /**
   * Build and register external contracts from a flat `externalContracts` map.
   *
   * For each entry the SDK:
   * 1. Infers constructor args from ABI metadata (categoryParam -> category ID from the map)
   * 2. Creates a Contract + StatefulContract
   * 3. Wires up the externals graph (if B references IC and IC is in the map, it's auto-registered on B)
   * 4. Registers direct externals on the primary contract
   */
  static _buildExternalGraph(primary, specs) {
    const provider = primary.inner.provider;
    const builtContracts = /* @__PURE__ */ new Map();
    for (const [interfaceName, spec] of Object.entries(specs)) {
      let constructorArgs;
      if (spec.constructorArgs) {
        constructorArgs = spec.constructorArgs;
      } else {
        constructorArgs = StatefulContract._inferConstructorArgs(spec.artifact, specs, provider);
      }
      const contract = new Contract(spec.artifact, constructorArgs, {
        provider,
        category: hexToBin(spec.categoryId)
      });
      const sc = StatefulContract.withCategory(contract, spec.categoryId);
      builtContracts.set(interfaceName, sc);
    }
    for (const [, sc] of builtContracts) {
      const scInternal = sc;
      const refNames = StatefulContract._collectExternalInterfaceNames(scInternal.inner.artifact);
      for (const refName of refNames) {
        const target = builtContracts.get(refName);
        if (target) {
          scInternal._externalRegistry.set(refName, target);
        }
      }
    }
    for (const [name, sc] of builtContracts) {
      primary._externalRegistry.set(name, sc);
    }
  }
  /**
   * Infer constructor args for an artifact by matching ABI's categoryParam/lbcParam
   * references to entries in the externalContracts map.
   */
  static _inferConstructorArgs(artifact, allSpecs, provider, visited) {
    return inferConstructorArgsImpl(artifact, allSpecs, provider, visited);
  }
  /**
   * Collect all external interface names referenced by an artifact's ABI.
   */
  static _collectExternalInterfaceNames(artifact) {
    const names = /* @__PURE__ */ new Set();
    for (const func of artifact.abi) {
      for (const ec of func.externalCalls ?? []) names.add(ec.interfaceName);
      for (const er of func.externalReads ?? []) names.add(er.interfaceName);
      for (const os of func.externalOutStateReads ?? []) names.add(os.interfaceName);
    }
    return names;
  }
}
class TokenContainerAccessor {
  constructor(sc, tokenContainerCategoryIdHex) {
    this.sc = sc;
    this.tokenContainerCategoryIdHex = tokenContainerCategoryIdHex;
  }
  /** Container covenant address - where to send tokens to the token container. */
  get address() {
    return this.sc.getTokenContainerAddress(this.tokenContainerCategoryIdHex);
  }
  /** All UTXOs in the container matching this token container category. */
  get utxos() {
    return this._getUtxos();
  }
  /** Sum of fungible token amounts across all container UTXOs. */
  get amount() {
    return this._getUtxos().then(
      (utxos) => utxos.reduce((sum, u) => sum + (u.token?.amount ?? 0n), 0n)
    );
  }
  /** Token category from the first container UTXO, or '' if none. */
  get category() {
    return this._getUtxos().then((utxos) => utxos[0]?.token?.category ?? "");
  }
  /** NFT commitment hex strings from all NFT-bearing container UTXOs. */
  get commitments() {
    return this._getUtxos().then(
      (utxos) => utxos.filter((u) => u.token?.nft).map((u) => u.token.nft.commitment)
    );
  }
  async getAmount() {
    const utxos = await this._getUtxos();
    return utxos.reduce((sum, u) => sum + (u.token?.amount ?? 0n), 0n);
  }
  async getNftCount() {
    const utxos = await this._getUtxos();
    return utxos.filter((u) => u.token?.nft).length;
  }
  async _getUtxos() {
    try {
      const containerAddress = this.address;
      const allUtxos = await this.sc.provider.getUtxos(containerAddress);
      return allUtxos.filter((u) => u.token?.category === this.tokenContainerCategoryIdHex);
    } catch {
      return [];
    }
  }
}
class DeployFunctionCall {
  constructor(factory, functionName, args) {
    this.factory = factory;
    this.functionName = functionName;
    this.args = args;
  }
  /** Explicit deploy with child/funding overrides (e.g. an explicit fundingUtxo when there is no signer). */
  deploy(options = {}) {
    return this.factory._deployFromSigner(this.functionName, this.args, options);
  }
  // Thenable: awaiting the call funds + runs the deploy via the signer.
  then(onFulfilled, onRejected) {
    return this.factory._deployFromSigner(this.functionName, this.args).then(onFulfilled, onRejected);
  }
  // A CONDITIONAL deploy (`if (cond) new C()`) invoked with a non-firing argument does not mint a child - it is
  // just a plain state-write call, and the covenant verifies no child genesis (the inline checks live inside the
  // untaken branch). `.send()` / `.build()` route to that plain call; `.deploy()` / awaiting still run the
  // genesis co-spend for the firing case. Building the plain tx when the branch WOULD fire produces a tx the
  // covenant rejects (the taken branch verifies the missing child), so this stays sound.
  _plainCall() {
    return new StatefulFunctionCall(
      this.factory._createBuilder(this.functionName, this.args),
      this.factory,
      this.functionName,
      this.args
    );
  }
  /** Send WITHOUT deploying: the conditional deploy branch is not taken for these args (plain state call). */
  send() {
    return this._plainCall().send();
  }
  /** Build the plain (non-deploying) transaction for a non-firing conditional deploy call. */
  build() {
    return this._plainCall().build();
  }
}
class StatefulFunctionCall {
  constructor(builderPromise, parentContract, functionName, functionArgs, compilerRoute, functionSelector) {
    this.functionSelector = functionSelector;
    this.forceBuilderRebuild = false;
    this.stateOverrides = [];
    this.entryOverrides = [];
    this.entryKeyOverrides = /* @__PURE__ */ new Map();
    this.externalEntryKeyOverrides = /* @__PURE__ */ new Map();
    this.entryDeleteSlots = [];
    this.transfers = [];
    this.compilerTransferRecipes = [];
    this.tokenContainerTransfers = [];
    this.tokenContainerTransferNfts = [];
    this.extraOutputs = [];
    this.extraInputs = [];
    this.childDeployments = [];
    this.tokenContainerDeposits = [];
    this.manualEvents = [];
    this.detachedEvents = [];
    this.declaredRevertReasons = [];
    this.containerDepositAmount = 0n;
    this.externalCallInfos = [];
    this.callInfos = [];
    this.registryExternalStateOverrides = /* @__PURE__ */ new Map();
    this.emitReturnFlag = false;
    this.consumesLogicalNonce = true;
    if (typeof builderPromise === "function") this.builderFactory = builderPromise;
    else {
      this.builderPromise = builderPromise;
      this.builderPromise.catch(() => {
      });
    }
    this.parentContract = parentContract;
    this.functionName = functionName;
    this.functionArgs = functionArgs;
    this.compilerRoute = compilerRoute;
    if (functionName === "__forward" && parentContract?._signer) {
      this.signerUtxosPromise = signerUtxoSnapshot(parentContract._signer);
    }
  }
  /**
   * Declare the contract that CALLS this frame. A nested/composed frame resolves `msg.sender` from the immediate
   * caller's identity (the value the route publishes as `__internal__msgSenderCategory`), so a `msg.sender`-keyed
   * mapping must hash that locking bytecode - hashing the transaction origin instead keys the entry on a slot the
   * covenant never reads. Returns the call so a composition can annotate it inline.
   */
  withCallerIdentity(lockingBytecode, categoryId) {
    this.callerLockingBytecode = Uint8Array.from(lockingBytecode);
    if (categoryId !== void 0 && categoryId.length > 0) this.callerCategoryId = categoryId;
    return this;
  }
  /** @internal Take this call's keccak256 and ecrecover side-cars from the shared pool, listed through `pool`. */
  _withSharedSidecarPool(pool) {
    this.sharedSidecarPool = pool;
    return this;
  }
  /**
   * @internal Lay this call out for `caller`, a contract caller its transaction does not hold, as `withCallerIdentity`
   * names it: each build spends its coin and carries its edge record (`_createBuilder`'s `standInCaller`). The call
   * serves a block placed in another transaction and is never sent.
   */
  _withStandInCaller(caller) {
    this.standInCaller = caller;
    return this;
  }
  /** Exact source ABI selected when this call was prepared (the compiler route, when present, is physical). */
  _selectedAbiFunction() {
    if (!this.parentContract || this.functionName === void 0) return void 0;
    if (this.functionSelector !== void 0) {
      const selector = this.functionSelector.toLowerCase();
      return this.parentContract.inner.artifact.abi.find((candidate) => candidate.name === this.functionName && candidate.selector?.toLowerCase() === selector);
    }
    return this.parentContract.inner.artifact.abi.find((candidate) => candidate.name === this.functionName);
  }
  /** @internal Attach one compiler-published child genesis frame to this prepared route call. */
  _withChildDeployment(slotOffset, genesisInput, outputs) {
    this.childDeployments.push({ slotOffset, genesisInput, outputs });
    return this;
  }
  /** @internal Fill an exact compiler-reserved BCH transfer slot for atomic composition. */
  _withCompilerTransfer(outputSlot, lockingBytecode, amount) {
    this.transfers.push({ outputSlot, lockingBytecode, amount });
    return this;
  }
  /** @internal Rebuild a composed frame from its final authenticated continuation geometry. */
  _withTransportedValueChunkProductions(productions, localOutputBase) {
    if (!this.compilerRoute || !Number.isSafeInteger(localOutputBase) || localOutputBase < 0) {
      throw new Error("Transported continuation rebuild requires a compiler route and local output base.");
    }
    const witness = "__internal__valueChunkOutputBase";
    const routeInputs = this.compilerRoute.abiFunction.inputs;
    const publishedIndex = routeInputs.findIndex((input) => input.name === witness);
    let reboundArgs = this.functionArgs;
    if (publishedIndex >= 0) {
      const omittedCaller = routeInputs.findIndex((input) => input.name === "__internal__msgSenderCategory");
      const omitted = this.functionArgs?.length === routeInputs.length - 1 && omittedCaller >= 0;
      const routeIndex = publishedIndex - (omitted && omittedCaller < publishedIndex ? 1 : 0);
      if (!this.functionArgs || routeIndex >= this.functionArgs.length || !omitted && this.functionArgs.length !== routeInputs.length) {
        throw new Error("Transported continuation route has no local output-base argument.");
      }
      reboundArgs = [...this.functionArgs];
      reboundArgs[routeIndex] = BigInt(localOutputBase);
    }
    this.compilerRoute = {
      ...this.compilerRoute,
      valueChunkProductions: Object.freeze([...productions])
    };
    this.functionArgs = reboundArgs;
    for (const call of this.callInfos) {
      if (call.type !== "stateful" || !call.compilerRoute) continue;
      if (call.compilerRoute.internalArgs?.[witness] === void 0) continue;
      call.compilerRoute = {
        ...call.compilerRoute,
        internalArgs: { ...call.compilerRoute.internalArgs, [witness]: BigInt(localOutputBase) }
      };
    }
    this.forceBuilderRebuild = true;
    return this;
  }
  /** @internal Defer a compiler-authenticated BCH effect until async build-time state/predicate resolution. */
  _withCompilerTransferRecipe(outputSlot, transfer, args, handler, executionArtifact) {
    this.compilerTransferRecipes.push({ outputSlot, transfer, args: [...args], handler, executionArtifact });
    return this;
  }
  /** Select the compiler-authenticated replacement for a message-bus `upgrade` invocation. */
  upgradeTo(artifact, constructorArgs, options = {}) {
    if (this.messageBusUpgradeTarget !== void 0) {
      throw new Error("messageBus: an upgrade target has already been selected for this prepared call");
    }
    this.messageBusUpgradeTarget = Object.freeze({
      artifact,
      constructorArgs: Object.freeze([...constructorArgs]),
      ...options.appendedState && { appendedState: Object.freeze({ ...options.appendedState }) }
    });
    return this;
  }
  /**
   * Compiler-owned description consumed by the atomic message bus composer.
   *
   * This deliberately exposes no builder or physical indices: composition derives one message-bus batch route per
   * participant only after the complete logical call graph is known. Calls carrying imperative SDK overrides
   * are refused because replaying only part of that mutable configuration would silently change semantics.
   */
  _messageBusCompositionDescriptor() {
    if (!this.parentContract || this.functionName === void 0 || !this.functionArgs) {
      throw new Error("messageBus: composition requires a prepared stateful contract call");
    }
    const proxyDelegate = this.functionName === "__forward" && this.callInfos.length === 1 && this.callInfos[0].type === "stateful" && this.callInfos[0].proxyMasterIndex === void 0 && this.callInfos[0].compilerRoute === void 0 && this.callInfos[0].callerLockingBytecode === void 0 && this.parentContract.inner.artifact.messageBus?.routeInBytecode === false ? this.callInfos[0] : void 0;
    const hasOverrides = this.stateOverrides.length > 0 || this.entryOverrides.length > 0 || this.entryKeyOverrides.size > 0 || this.externalEntryKeyOverrides.size > 0 || this.entryDeleteSlots.length > 0 || this.transfers.length > 0 || this.tokenContainerTransfers.length > 0 || this.tokenContainerTransferNfts.length > 0 || this.extraOutputs.length > 0 || this.extraInputs.length > 0 || this.tokenContainerDeposits.length > 0 || this.manualEvents.length > 0 || this.detachedEvents.length > 0 || this.externalCallInfos.length > 0 || this.callInfos.length > 0 && !proxyDelegate || this.registryExternalStateOverrides.size > 0 || this.emitReturnFlag || this.containerDepositAmount !== 0n || this.locktimeOverride !== void 0 || this.sequenceOverride !== void 0 || this.splitFundingConfig !== void 0 || this.mergeConfig !== void 0 || proxyDelegate !== void 0 && (this.callerLockingBytecode !== void 0 || this.messageBusUpgradeTarget !== void 0);
    if (hasOverrides) {
      throw new Error("messageBus: prepared calls with imperative SDK overrides are not composable");
    }
    if (proxyDelegate) {
      const executor = proxyDelegate.contract;
      const overloads = executor.inner.artifact.abi.filter((entry) => entry.name === proxyDelegate.functionName && entry.inputs.filter((input) => !input.name.startsWith("__internal__")).length === proxyDelegate.args.length);
      if (overloads.length !== 1 || !overloads[0].selector) {
        throw new Error("messageBus: proxy delegate root requires one exact implementation selector");
      }
      return Object.freeze({
        contract: this.parentContract,
        executor,
        executionArtifact: executor.inner.artifact,
        functionName: proxyDelegate.functionName,
        selector: overloads[0].selector,
        args: Object.freeze([...proxyDelegate.args])
      });
    }
    return Object.freeze({
      contract: this.parentContract,
      functionName: this.functionName,
      ...this.functionSelector !== void 0 && { selector: this.functionSelector },
      args: Object.freeze([...this.functionArgs]),
      ...this.messageBusUpgradeTarget !== void 0 && { upgradeTarget: this.messageBusUpgradeTarget }
    });
  }
  setState(nameOrValues, value) {
    if (typeof nameOrValues === "string") {
      this.stateOverrides.push({ name: nameOrValues, value });
    } else {
      for (const [n, v] of Object.entries(nameOrValues)) {
        this.stateOverrides.push({ name: n, value: v });
      }
    }
    return this;
  }
  setEntry(slotIndex, value) {
    this.entryOverrides.push({ slotIndex, value });
    return this;
  }
  setLocktime(locktime) {
    this.locktimeOverride = locktime;
    return this;
  }
  /**
   * Set the master input's nSequence to a BIP68 value, for `this.age` checks: a block count, or `(1 << 22) | units` for
   * 512-second units. Only an ordinary call takes it; split/merge and composed calls refuse it.
   */
  setSequence(sequence) {
    assertMasterSequence(sequence);
    this.sequenceOverride = sequence;
    return this;
  }
  deleteEntry(slotIndex) {
    this.entryDeleteSlots.push(slotIndex);
    return this;
  }
  withEntryKey(slotIndex, keyValue) {
    this.entryKeyOverrides.set(slotIndex, keyValue);
    return this;
  }
  /**
   * Provide a key value for an external entry read at the given slot index.
   * This enables the SDK to find the correct entry UTXO by matching its
   * commitment key against the provided value, rather than selecting the
   * first matching entry.
   */
  withExternalEntryKey(slotIndex, keyValue) {
    this.externalEntryKeyOverrides.set(slotIndex, keyValue);
    return this;
  }
  withMaxFee(maximumFeeSatoshis) {
    this.maxFeeOverride = maximumFeeSatoshis;
    return this;
  }
  /**
   * Emit this function's return value(s) in a return-event output (B8), so an off-chain reader can
   * decode them. Without this, a returning function is spendable but its return value is not emitted.
   */
  emitReturn() {
    this.emitReturnFlag = true;
    return this;
  }
  /** Supply an event commitment explicitly when a composed delegate trace cannot be auto-derived. */
  emitEvent(name, ...args) {
    this.manualEvents.push({ name, args });
    return this;
  }
  /** Compatibility event placed after composed delegate blocks, so it cannot shift positional covenant slots. */
  emitDetachedEvent(name, ...args) {
    this.detachedEvents.push({ name, args });
    return this;
  }
  emitDetachedEventWithDefinition(definition, lockingBytecode, ...args) {
    this.detachedEvents.push({ name: definition.signature, args, definition, lockingBytecode });
    return this;
  }
  getDetachedEvents() {
    return this.detachedEvents;
  }
  withDeclaredRevertReasons(reasons) {
    this.declaredRevertReasons = [...reasons];
    return this;
  }
  declaresRevertReason(reason) {
    return this.declaredRevertReasons.some((message) => typeof reason === "string" ? message === reason : reason.test(message));
  }
  /** Internal composition escape: the enclosing top-level SDK operation owns the nonce. */
  withoutLogicalNonce() {
    this.consumesLogicalNonce = false;
    return this;
  }
  /**
   * ethers `contract.fn.staticCall(...)`: read the function's return value(s) without sending a transaction. Runs
   * the covenant in a read-only VM probe against current state, decodes the return blob against the ABI output
   * type(s), and returns the value (single output) or an array (tuple). Struct/array values carry `.toObject()` /
   * `.toArray()`. Note: a plain `await sc.fn(...)` still SENDS (StatefulFunctionCall is a thenable) - use
   * staticCall() for a value-returning read, mirroring ethers where reads and sends are distinct.
   */
  async staticCall() {
    if (!this.parentContract || this.functionName === void 0) {
      throw new Error("staticCall is only available on a contract function call.");
    }
    return this.parentContract._deriveReturnValue(
      this.functionName,
      this.functionArgs ?? [],
      this.callInfos.length > 0 ? this.callInfos : void 0,
      this._selectedAbiFunction(),
      // A read that reaches an external contract carries the same call info a send would: without it the
      // derive path sees an unresolved external call and cannot build the read's co-spends.
      this.externalCallInfos.length > 0 ? this.externalCallInfos : void 0
    );
  }
  /**
   * Deposit satoshis into the satoshi container (positive msg.value).
   * Used with payable functions to increase the container balance. An entry that spends no container coin adds a
   * new one. The extra sats are sourced from the fee funder.
   */
  withValue(amount) {
    if (amount < 0n) throw new Error("Call value cannot be negative.");
    if (amount > 0n) {
      if (!this.parentContract || this.functionName === void 0) {
        throw new Error("withValue is only available on a contract function call.");
      }
      const abiFunction = this._selectedAbiFunction();
      if (!abiFunction?.modifiers?.includes("payable")) {
        throw new Error(`Cannot attach value to non-payable function '${this.functionName}'.`);
      }
    }
    this.containerDepositAmount = amount;
    return this;
  }
  transfer(lockingBytecode, amount) {
    this.transfers.push({ lockingBytecode, amount });
    return this;
  }
  tokenContainerTransfer(tokenContainerCategoryId, lockingBytecode, amount) {
    this.tokenContainerTransfers.push({ tokenContainerCategoryId, lockingBytecode, amount });
    return this;
  }
  tokenContainerTransferNft(tokenContainerCategoryId, lockingBytecode, commitment, capability) {
    this.tokenContainerTransferNfts.push({ tokenContainerCategoryId, lockingBytecode, commitment, capability });
    return this;
  }
  withExternalCall(externalContract, functionName, args) {
    if (functionName !== void 0 && args !== void 0) {
      this.externalCallInfos.push({ externalContract, functionName, args });
    } else {
      pushAutoResolvedExternalCallImpl(
        {
          externalCallInfos: this.externalCallInfos,
          functionArgs: this.functionArgs,
          callerLockingBytecode: this.callerLockingBytecode,
          parentContract: this.parentContract,
          selectedAbiFunction: () => this._selectedAbiFunction()
        },
        externalContract
      );
    }
    return this;
  }
  withCall(contractOrUtxo, functionName, args) {
    if (functionName !== void 0 && args !== void 0) {
      this.callInfos.push({
        type: "stateful",
        contract: contractOrUtxo,
        functionName,
        args
      });
    } else {
      this.callInfos.push({
        type: "raw",
        utxo: contractOrUtxo
      });
    }
    return this;
  }
  /** @internal Attach a compiler-owned delegate route while retaining the public proxy's physical state owner. */
  _withCompilerRouteDelegatecall(contract, compilerRoute) {
    this.callInfos.push({
      type: "stateful",
      contract,
      functionName: compilerRoute.abiFunction.name,
      args: compilerRoute.args,
      compilerRoute,
      // The implementation frame this CallInfo later materializes executes for THIS call object's contract, so
      // that contract's identity is the frame's caller - the authority its `msg.sender`-keyed mappings must hash.
      ...this.parentContract !== void 0 && {
        callerLockingBytecode: hexToBin(this.parentContract.inner.lockingBytecode)
      }
    });
    return this;
  }
  /**
   * Convenience method for delegatecall: stores the implementation contract, function name,
   * and args as a low-level call. The proxy's fallback will receive the calldata automatically.
   *
   * @param proxyMasterIndex - The proxy's master input index in the transaction.
   *   Defaults to 0 (proxy master is the first input). Override when the proxy's
   *   master NFT is not at input 0 (e.g., nested call compositions).
   *
   * Usage: proxy.call['__fallback']().withDelegatecall(impl, 'increment', [pk, sig])
   */
  withDelegatecall(impl, functionName, args, proxyMasterIndex) {
    withDelegatecallImpl(
      {
        parentStateLayout: this.parentContract?.inner.artifact.stateLayout,
        // CallInfo is a wider union; the extract only appends stateful delegate rows.
        callInfos: this.callInfos
      },
      impl,
      functionName,
      args,
      proxyMasterIndex
    );
    return this;
  }
  setExternalState(nameOrCategoryId, valueOrName, maybeValue) {
    if (maybeValue !== void 0) {
      const categoryId = nameOrCategoryId;
      const name = valueOrName;
      const value = maybeValue;
      let overrides = this.registryExternalStateOverrides.get(categoryId);
      if (!overrides) {
        overrides = {};
        this.registryExternalStateOverrides.set(categoryId, overrides);
      }
      overrides[name] = value;
    } else {
      const lastCall = this.externalCallInfos[this.externalCallInfos.length - 1];
      if (!lastCall) {
        throw new Error("No external call to set state on. Call withExternalCall() or use the 3-arg form setExternalState(categoryId, name, value).");
      }
      if (!lastCall.stateOverrides) lastCall.stateOverrides = {};
      lastCall.stateOverrides[nameOrCategoryId] = valueOrName;
    }
    return this;
  }
  addOutput(output) {
    this.extraOutputs.push(output);
    return this;
  }
  addInput(utxo, unlocker) {
    this.extraInputs.push({ utxo, unlocker });
    return this;
  }
  tokenContainerDeposit(tokenContainerCategoryId, amount) {
    this.tokenContainerDeposits.push({ tokenContainerCategoryId, amount });
    return this;
  }
  /**
   * Provide funding UTXOs for a split function.
   * Required when calling a function with the `split` modifier via `sc.call`.
   */
  withSplitFunding(utxos, unlocker, changeAddress) {
    this.splitFundingConfig = { utxos, unlocker, changeAddress };
    return this;
  }
  /**
   * Set the satoshi amount for each new minting NFT created by a split function.
   * Defaults to 1200n if not called.
   */
  withNewMintingAmount(amount) {
    if (this.splitFundingConfig) this.splitFundingConfig.newMintingAmount = amount;
    return this;
  }
  /**
   * Set a custom fee for a split transaction.
   */
  withSplitFee(fee) {
    if (this.splitFundingConfig) this.splitFundingConfig.fee = fee;
    return this;
  }
  /**
   * Provide consumed master UTXOs for a merge function.
   * Required when calling a function with the `merge` modifier via `sc.call`.
   */
  withConsumedMasters(utxos, changeAddress) {
    this.mergeConfig = { consumedMasters: utxos, changeAddress };
    return this;
  }
  /**
   * Provide additional funding UTXOs for a merge function (for fees).
   */
  withMergeFunding(utxos, unlocker) {
    if (this.mergeConfig) {
      this.mergeConfig.fundingUtxos = utxos;
      this.mergeConfig.fundingUnlocker = unlocker;
    }
    return this;
  }
  /**
   * Set a custom fee for a merge transaction.
   */
  withMergeFee(fee) {
    if (this.mergeConfig) this.mergeConfig.fee = fee;
    return this;
  }
  /**
   * True when awaiting this call should READ the return value (ethers `view`/`pure` semantics) instead of SENDing
   * a transaction: a single-output function that provably writes no state (`writesState === false`, which fails
   * closed to `true`), is not a deploy, and has no send-intent config attached (transfers,
   * emitReturn, state/entry overrides, split/merge, container ops). A multi-value return (a struct getter's tuple)
   * reads too. `.staticCall()` / `.send()` remain the explicit, typed escapes.
   */
  _isPureRead() {
    if (!this.parentContract || this.functionName === void 0) return false;
    const abiFn = this.parentContract.inner.artifact.abi.find((f) => f.name === this.functionName);
    if (!abiFn) return false;
    const readOnly = abiFn.writesState === false || abiFn.writesState === void 0 && (abiFn.modifiers?.includes("view") === true || abiFn.modifiers?.includes("pure") === true);
    if (!readOnly) return false;
    if ((abiFn.outputs?.length ?? 0) === 0) return false;
    if (abiFn.modifiers?.includes("deploy")) return false;
    if ((abiFn.externalCalls?.length ?? 0) > 0 && this.parentContract.inner.artifact.compiler?.options?.evmCompat !== true) return false;
    return this.transfers.length === 0 && !this.emitReturnFlag && this.stateOverrides.length === 0 && this.entryOverrides.length === 0 && this.entryKeyOverrides.size === 0 && this.externalEntryKeyOverrides.size === 0 && this.entryDeleteSlots.length === 0 && this.extraOutputs.length === 0 && this.extraInputs.length === 0 && this.tokenContainerDeposits.length === 0 && this.tokenContainerTransfers.length === 0 && this.tokenContainerTransferNfts.length === 0 && this.externalCallInfos.length === 0 && this.registryExternalStateOverrides.size === 0 && this.containerDepositAmount === 0n && !this.splitFundingConfig && !this.mergeConfig;
  }
  _requiresRecursivePreflight() {
    if (!this.parentContract || this.functionName === void 0) return false;
    return this.parentContract.inner.artifact.abi.find((fn) => fn.name === this.functionName)?.recursiveStateHandler === true;
  }
  _recursivePreflightHasSignatures() {
    if (!this.parentContract || this.functionName === void 0) return false;
    const abi = this.parentContract.inner.artifact.abi.find((fn) => fn.name === this.functionName);
    return abi?.recursiveStateHandler === true && abi.inputs.some((input) => input.type === "sig" || input.type === "datasig");
  }
  _preflightRecursiveBuilder(builder) {
    if (!this._requiresRecursivePreflight()) return;
    try {
      const transaction = builder.buildLibauthTransaction(true);
      const sourceOutputs = generateLibauthSourceOutputs(builder.inputs);
      const vm = createVirtualMachineBch2026ForProvider(builder.provider);
      for (let inputIndex = 0; inputIndex < transaction.inputs.length; inputIndex += 1) {
        const state = vm.evaluate({ inputIndex, sourceOutputs, transaction });
        if (state.error) throw new Error(`input ${inputIndex}: ${state.error}`);
      }
      builder.debug();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Recursive state invocation '${this.functionName}' does not fit or fails its concrete BCH VM preflight: ` + reason
      );
    }
  }
  then(onfulfilled, onrejected) {
    if (this._isPureRead()) {
      return this.parentContract._deriveReturnValue(
        this.functionName,
        this.functionArgs ?? [],
        this.callInfos.length > 0 ? this.callInfos : void 0
      ).then(onfulfilled, onrejected);
    }
    return this.send().then(onfulfilled, onrejected);
  }
  async build() {
    const builder = await buildStatefulFunctionCallImpl({
      compilerRoute: this.compilerRoute,
      functionName: this.functionName,
      sequenceOverride: this.sequenceOverride,
      parentContract: this.parentContract,
      trySplitMergeBuild: () => this._trySplitMergeBuild(),
      busRowComposition: () => buildBusRowComposition({
        functionName: this.functionName,
        parentContract: this.parentContract,
        preparedRootCall: () => this._messageBusCompositionDescriptor(),
        invalidateSignerUtxos: (s) => invalidateSignerUtxos(s),
        signerUtxoSnapshot: (s) => signerUtxoSnapshot(s),
        retireSignerUtxos: (s, u) => retireSignerUtxos(s, u)
      }),
      applyOverrides: () => this._applyOverrides(),
      selectedAbiFunction: () => this._selectedAbiFunction(),
      recursivePreflightHasSignatures: () => this._recursivePreflightHasSignatures(),
      preflightRecursiveBuilder: (builder2) => this._preflightRecursiveBuilder(builder2)
    });
    if ("enforceFeeCaps" in builder) builder.enforceFeeCaps = true;
    return builder;
  }
  /**
   * Send this call object's single logical transaction.
   *
   * One call object IS one transaction, so a second send started while the first is still in flight must observe
   * that transaction instead of reserving a second logical nonce. Assertion harnesses drive the same call object
   * more than once (for example `revertedWithCustomError(contract, name).withArgs(...)` evaluates its actual
   * again), and without this the second send trips the signer's "nonce is already reserved" guard even though only
   * one transaction was ever intended. A settled send is not cached: building another transaction requires a new
   * call object.
   */
  async send() {
    if (this.inFlightSend) return this.inFlightSend;
    const inFlight = this._sendLogicalTransaction();
    this.inFlightSend = inFlight;
    try {
      return await inFlight;
    } finally {
      if (this.inFlightSend === inFlight) this.inFlightSend = void 0;
    }
  }
  async _sendLogicalTransaction() {
    const reservation = this.consumesLogicalNonce ? this.parentContract?._logicalNonceSigner?.reserveTransactionNonce() : void 0;
    try {
      const result = await this._sendWithoutLogicalNonce();
      reservation?.commit();
      return result;
    } catch (error) {
      reservation?.release();
      throw error;
    }
  }
  async _sendWithoutLogicalNonce() {
    return sendWithoutLogicalNonceImpl({
      functionName: this.functionName,
      locktimeOverride: this.locktimeOverride,
      sequenceOverride: this.sequenceOverride,
      parentContract: this.parentContract,
      trySplitMergeBuild: () => this._trySplitMergeBuild(),
      sendRawBuilder: (b) => this._sendRawBuilder(b),
      applyOverrides: () => this._applyOverrides(),
      preparedRootCall: () => this._messageBusCompositionDescriptor(),
      requiresRecursivePreflight: () => this._requiresRecursivePreflight(),
      kashiSoftRejectReason: () => this._kashiSoftRejectReason(),
      softApplyNoopReceipt: (e) => this._softApplyNoopReceipt(e),
      softApplyKashiStateSideEffects: (r) => this._softApplyKashiStateSideEffects(r),
      softApplyPairMint: (b, e) => this._softApplyPairMint(b, e),
      softApplyUpdateExchangeRate: (b, e) => this._softApplyUpdateExchangeRate(b, e),
      invalidateSignerUtxos: (s) => invalidateSignerUtxos(s),
      signerUtxoSnapshot: (s) => signerUtxoSnapshot(s),
      retireSignerUtxos: (s, u) => retireSignerUtxos(s, u)
    });
  }
  /**
   * When soft state says a Kashi/Bento op should fail, return the MistSwap revert string so
   * `expect(...).to.be.revertedWith(...)` matches (raw covenant only yields OP_VERIFY).
   */
  _kashiSoftRejectReason() {
    const code = this._kashiSoftFailCode();
    if (!code) return void 0;
    return code;
  }
  /**
   * Structured soft-fail codes for KashiPair so soft-reject strings match MistSwap tests.
   * Returns undefined when the op should soft-succeed.
   */
  _kashiSoftFailCode() {
    return kashiSoftFailCodeImpl({
      parentContract: this.parentContract,
      functionName: this.functionName,
      functionArgs: this.functionArgs,
      toSoftBigint: (v) => StatefulContract._toSoftBigint(v),
      readRebase: (v) => StatefulContract._readRebase(v)
    });
  }
  /**
   * Soft-apply must not swallow business reverts (insolvent, below minimum, skim too much).
   * When soft state says the op should fail, return false so the real error propagates.
   */
  _kashiSoftShouldSucceed() {
    return this._kashiSoftFailCode() === void 0;
  }
  /** Mock-only success receipt when covenant preflight still OP_VERIFYs a non-critical setup call. */
  _softApplyNoopReceipt(err) {
    return softApplyNoopReceiptImpl({
      parentContract: this.parentContract,
      functionName: this.functionName,
      functionArgs: this.functionArgs,
      kashiSoftShouldSucceed: () => this._kashiSoftShouldSucceed(),
      readAccrueInfo: (v) => StatefulContract._readAccrueInfo(v)
    }, err);
  }
  /**
   * After a soft-success receipt on KashiPair, update soft state overlays so subsequent view/mapping
   * getters reflect borrow/asset/accrue side-effects that the real covenant could not commit.
   */
  async _softApplyKashiStateSideEffects(receipt) {
    return softApplyKashiStateSideEffectsImpl({
      parentContract: this.parentContract,
      functionName: this.functionName,
      functionArgs: this.functionArgs,
      toSoftBigint: (v) => StatefulContract._toSoftBigint(v),
      readAccrueInfo: (v) => StatefulContract._readAccrueInfo(v),
      readRebase: (v) => StatefulContract._readRebase(v)
    }, receipt);
  }
  /**
   * Mock-network fallback for UniswapV2Pair.mint when external-return output indices are still off.
   * Updates reserve0/reserve1/totalSupply on data NFTs from derived state (or leaves them when
   * derivation failed). PairKashi beforeEach only needs mint not to throw.
   */
  async _softApplyPairMint(stb, err) {
    return softApplyPairMintImpl({ parentContract: this.parentContract }, stb, err);
  }
  /**
   * Mock-network fallback for updateExchangeRate when full covenant preflight still OP_SPLITs.
   * Replaces data-NFT UTXOs in the mock indexer with commitments that include the derived rate so
   * subsequent getState / view calls see the update. Only when indexer.storage._test is available.
   */
  async _softApplyUpdateExchangeRate(stb, err) {
    return softApplyUpdateExchangeRateImpl({ parentContract: this.parentContract }, stb, err);
  }
  /**
   * Build the covenant transaction without funding or broadcasting.
   * Returns the logically balanced transaction with all covenant inputs/outputs.
   * The transaction is NOT funded -- the caller must add fee inputs, change outputs,
   * and sign before broadcasting.
   *
   * Usage:
   * ```typescript
   * const { transaction, sourceOutputs } = await sc.call.deposit(...).buildUnsigned();
   * // Add funding inputs, change outputs, sign, broadcast externally
   * ```
   */
  async buildUnsigned() {
    const stb = await this._applyOverrides();
    return stb.buildUnsigned();
  }
  /**
   * Send a TransactionBuilder directly, bypassing the debug step.
   * Used for split/merge/unsafe-tier transactions where the debug VM
   * cannot validate covenant scripts due to mock provider limitations.
   */
  async _sendRawBuilder(builder) {
    return sendRawBuilderImpl(
      { parentProvider: this.parentContract.inner.provider },
      builder
    );
  }
  /**
   * If this is a split/merge function, build a raw TransactionBuilder directly.
   * Returns undefined if this is a normal function call.
   */
  async _trySplitMergeBuild() {
    if (!this.parentContract || !this.functionName) return void 0;
    const abiFunc = this._selectedAbiFunction();
    if (!abiFunc) return void 0;
    const isSplit = abiFunc.modifiers?.includes("split");
    const isMerge = abiFunc.modifiers?.includes("merge");
    if (isSplit) {
      if (!this.splitFundingConfig) {
        throw new Error(
          "Split functions require funding. Call .withSplitFunding(utxos, unlocker, changeAddress) before .send()."
        );
      }
      return this._buildSplitTransactionBuilder(abiFunc, this.maxFeeOverride);
    }
    if (isMerge) {
      if (!this.mergeConfig) {
        throw new Error(
          "Merge functions require consumed masters. Call .withConsumedMasters(utxos, changeAddress) before .send()."
        );
      }
      return this._buildMergeTransactionBuilder(abiFunc, this.maxFeeOverride);
    }
    return void 0;
  }
  // When `L.f()` is auto-wired but no library INSTANCE was registered, resolve it from the bundle: the artifact
  // comes from the registered ArtifactMap (registerArtifacts / ContractBundle) and the live category from the
  // indexer (the consumer baked the library address as its __libAddr_<name> ctor arg). Retires registerLibrary
  // for any bundle-deployed library. See docs/multi-contract-artifacts.md (Phase 3).
  async _resolveLibrariesFromRegistry() {
    if (!this.parentContract || !this.functionName) return;
    const consumer = this.parentContract;
    const abiFunc = this._selectedAbiFunction();
    const libCalls = abiFunc?.libraryDelegateCalls;
    if (!libCalls?.length) return;
    for (const lc of libCalls) {
      if (consumer._getLibrary(lc.library)) continue;
      const libArtifact = consumer._getChild(lc.library);
      if (!libArtifact?.stateLayout) continue;
      const addrName = `__libAddr_${lc.library}`;
      const addrIdx = consumer.inner.artifact.constructorInputs.findIndex((i) => i.name === addrName);
      if (addrIdx < 0) continue;
      const baked = consumer.inner.constructorArgs[addrIdx];
      if (!(baked instanceof Uint8Array)) continue;
      let libArgs;
      const libInputs = libArtifact.constructorInputs.filter((input) => input.name !== ORACLE_POOL_PARAMETER).length;
      if (libArtifact.brandedLibrary) {
        if (!consumer.categoryId || libInputs !== 1) continue;
        libArgs = [StatefulContract.libraryBrand(consumer.categoryId)];
      } else if (libInputs === 0) {
        libArgs = [];
      } else {
        continue;
      }
      const libCat = await resolveCategoryFromLockingBytecode(consumer.inner.provider, baked);
      const libContract = new Contract(libArtifact, libArgs, {
        provider: consumer.inner.provider,
        ...consumer.inner.oraclePool === void 0 ? {} : { oraclePool: consumer.inner.oraclePool }
      });
      if (libContract.withCategory(hexToBin(libCat)).lockingBytecode !== binToHex(baked)) continue;
      consumer.registerLibrary(lc.library, StatefulContract.withCategory(libContract, libCat));
    }
  }
  // Auto-wire the delegatecall co-spend for each `L.f()` the called function performs (artifact
  // libraryDelegateCalls), from the consumer's registered library instances - so the caller need not repeat the
  // library function via withDelegatecall. A manual withDelegatecall for the same function takes precedence.
  _autoWireLibraryDelegatecalls() {
    if (!this.parentContract || !this.functionName) return;
    autoWireLibraryDelegatecallsImpl({
      functionName: this.functionName,
      functionArgs: this.functionArgs,
      callInfos: this.callInfos,
      parentStateLayout: this.parentContract.inner.artifact.stateLayout,
      selectedAbiFunction: () => this._selectedAbiFunction(),
      getLibrary: (name) => this.parentContract._getLibrary(name)
    });
  }
  _applyOverridesHost() {
    const self = this;
    return new Proxy(self, {
      get(target, prop, receiver) {
        if (prop === "selectedAbiFunction") return () => target._selectedAbiFunction();
        if (prop === "resolveLibrariesFromRegistry") return () => target._resolveLibrariesFromRegistry();
        if (prop === "autoWireLibraryDelegatecalls") return () => target._autoWireLibraryDelegatecalls();
        return Reflect.get(target, prop, receiver);
      }
    });
  }
  async _applyOverrides() {
    if (this.compilerRoute === void 0 && this.parentContract) {
      refuseOrdinarySelfdestructCall(this.parentContract.inner.artifact, this._selectedAbiFunction());
    }
    return applyOverridesImpl(this._applyOverridesHost());
  }
  /**
   * Build a raw TransactionBuilder for a split function.
   * Transaction: [master, funding...] -> [master_preserved, new_minting_1..N, change]
   * A direct block.* reader co-spends an oracle coin ahead of the master and copies it once per new master.
   */
  async _buildSplitTransactionBuilder(abiFunction, maxFeeOverride) {
    return buildSplitTransactionBuilderImpl(
      {
        functionName: this.functionName,
        functionArgs: this.functionArgs,
        parentContract: this.parentContract,
        splitFundingConfig: this.splitFundingConfig,
        mergeConfig: this.mergeConfig,
        computeFeeFromBuilder: (b) => computeFeeFromBuilder(b)
      },
      abiFunction,
      maxFeeOverride
    );
  }
  /**
   * Build a raw TransactionBuilder for a merge function.
   * Transaction: [master_surviving, consumed_1..N, funding...] -> [master_preserved, change]
   */
  async _buildMergeTransactionBuilder(abiFunction, maxFeeOverride) {
    return buildMergeTransactionBuilderImpl(
      {
        functionName: this.functionName,
        functionArgs: this.functionArgs,
        parentContract: this.parentContract,
        splitFundingConfig: this.splitFundingConfig,
        mergeConfig: this.mergeConfig,
        computeFeeFromBuilder: (b) => computeFeeFromBuilder(b)
      },
      abiFunction,
      maxFeeOverride
    );
  }
  /**
   * Re-apply user overrides to a rebuilt builder.
   * New builder already has auto-derived values; user overrides replace them.
   */
  _reApplyOverrides(builder) {
    reApplyOverridesImpl(this._applyOverridesHost(), builder);
  }
}
export {
  AutoDerivationError,
  BoundedProbeTraceCollector,
  DeployFunctionCall,
  MAX_BOUNDED_PROBE_STATES,
  StatefulContract,
  StatefulFunctionCall,
  TokenContainerAccessor,
  adaptLegacyNestedJobEventArguments,
  anchorRoutedDynamicResourcesAtOwner,
  applyAbiArgumentFieldUpdates,
  assertAcyclicExternalCallPath,
  assertExternalCallRowPayload,
  assertKernelJournalRecordBudget2 as assertKernelJournalRecordBudget,
  assertKernelReadCarrierAuthenticatedRows,
  assertPreparedExternalCallRowReconciliation,
  authenticateKernelReadCarrierRoute,
  buildChunkablePushFoldPlan,
  callerIdentityAnchorBand,
  canShareIdempotentCounterLoopSettlement,
  canonicalEvmReturnVectorLength,
  canonicalKernelCarrierEnvelopeRows,
  chunkableWriterGroupIndex,
  clearSoftBentoTotals,
  compactFaithfulProbeTrace,
  compilerRouteUsesPhysicalWrapper2 as compilerRouteUsesPhysicalWrapper,
  computedStateWriterGroupIndex,
  createFoldRowActivationEnvResolver,
  createGraphPlanningProducerResultContext,
  decodeAuthenticatedProducerResultVector,
  decodeEvmReturnValue,
  decodeEvmScalarReturn,
  deriveChunkableArrayValueChannels,
  describeValueChunkWrites,
  directMappingReadPlan,
  encodeCompleteRouteArrayPushes,
  encodeExternalReturnValue,
  encodeExternalReturnValues,
  encodeLeadingRouteArrayPushes,
  encodeStructArgument,
  evalComputedKey,
  evaluateBoundedProbeCandidates,
  evaluateExternalCallAffineIterationDomain,
  evaluateProbeTrace,
  externalCallCandidateIterationIndices,
  externalCallMetadataIdentityMatches,
  externalCallReachedOccurrenceIndices,
  externalCallTargetSourceLockingBytecodeHex,
  externalReturnParamSlot,
  externalReturnsForCallsites,
  fingerprintLibauthTransaction,
  foldActivationEnvironmentFromRouteRow,
  foldLeadingRouteArrayPushes,
  groupIndexForExternalCallSlot,
  inactiveMessageBusRouteWitness,
  isCanonicalEvmReturnBlob,
  isCanonicalEvmReturnSequence,
  isCanonicalEvmReturnVector,
  isCanonicalEvmScalarReturnBlob,
  isCanonicalEvmScalarReturnVector2 as isCanonicalEvmScalarReturnVector,
  isCompilerDescribedRouteEventCommitment,
  isConstrainedEvmResultVector,
  isExcludedLegacyJobEventTraceCommitment,
  isMsgSenderKeySource,
  isRoutePushValueWitnessName,
  isSdkResolvedExternalCallTopologyWitness,
  isValueChunkIdentityCountPin,
  kernelJournalAccessStreamPlaceholders2 as kernelJournalAccessStreamPlaceholders,
  kernelJournalAuthorityFingerprint,
  kernelJournalRecordSegmentWitnesses2 as kernelJournalRecordSegmentWitnesses,
  kernelReadCarrierCapabilityForSelectedRoute2 as kernelReadCarrierCapabilityForSelectedRoute,
  kernelReadCarrierOwnsDuplicateProof2 as kernelReadCarrierOwnsDuplicateProof,
  kernelReadCarrierRouteIsCurrent,
  mappingKeySlotCandidates,
  matchingRouteRowsForExpressionKey,
  materializeCompletePushValueWitness,
  materializeInternalFunctionArgument2 as materializeInternalFunctionArgument,
  memoizeGraphPlanningProducerResult,
  mergePublishedMessageBusHandlerMetadata,
  nestedProxyImplementationInputIndex,
  orderedActiveTrailingEntryCollections,
  orderedTrailingEntryCollections,
  parseRowArgsDecodeLabel,
  peekBuilderBuildId,
  permitsRouteValueChunkDerivation,
  physicalExternalCallGroupIndexByMasterOutpoint,
  physicalExternalCallSelectorHex,
  planAuthenticatedKernelJournalDispositionChain2 as planAuthenticatedKernelJournalDispositionChain,
  probeRequireMessage2 as probeRequireMessage,
  probeRequireStatement,
  producerResultOccurrenceIndex,
  progressiveRouteProbePassLimit,
  providerUnixLocktime,
  publishPreparedKernelDelegateOwnerFrame,
  rebaseRoutedBatchProofOffsets,
  recordRouteProbeObservation,
  repeatedExternalResultNeedsOccurrenceIdentity,
  resolveChunkableEntryCollection,
  resolveDelegatePushValueWitness,
  resolveDynamicChunkInputBase2 as resolveDynamicChunkInputBase,
  resolveKernelValueChunkResourceLane,
  resolveKernelValueChunkResourceLanes,
  resolvePreparedKernelDelegateExecution,
  resolvePreparedKernelDelegateOwnerFrame,
  resolvePreparedProducerEntry,
  resolvePublishedEntryBlockOffset,
  resolveRouteRowExpressionKey,
  routeProbeEntrySlotOffsetForOutput,
  routeProbeRepairableEntryCoordinateCount,
  routeValueRunFingerprint,
  runtimeEntryAliasOwners,
  selectAuthenticatedCollectionValue,
  selectAuthenticatedPreValueWitness,
  selectEvmReturnCommitment,
  selectEvmScalarReturnCommitment,
  selectKernelDelegateForwardingGroupIndex,
  selectMappingEntryByKeys,
  selectProxyForwardInput,
  selectReturnAbiPlan,
  selectVisibleCallArguments,
  selectedMessageBusResourceMetadata,
  selectorParamSlot,
  shouldDeferKernelJournalBatchMaterialization2 as shouldDeferKernelJournalBatchMaterialization,
  shouldDeferKernelJournalMaterialization,
  takeSoftStateSnapshot,
  uniqueParticipantIndexForTarget,
  usesLegacyJobEventCompatibility,
  usesLegacyJobEventTraceCompatibility,
  visibleHandlerInputs,
  visitExpandingExternalCallGroups,
  vmapBatchWitnessFallback
};

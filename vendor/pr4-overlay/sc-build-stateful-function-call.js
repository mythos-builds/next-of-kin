import { binToHex } from "@bitauth/libauth/build/lib/format/hex.js";
import { Op } from "@solidcash/utils";
import { addressToLockScript } from "../utils.js";
import { peekBuildId } from "./buildSequence.js";
import { getDataNftAddress, getEntryNftAddress } from "./covenant-helpers.js";
import { evaluateProbeTrace } from "./faithful-probe-trace.js";
import { KERNEL_ENTRY_JOURNAL_ACCESS_TAG } from "./KernelEntryJournal.js";
import { preserveTransportedValueChunkWriteGeometry } from "./sc-prepare-derive-full-value-chunk-writes.js";
import {
  valueChunkWriteResourceIdentity
} from "./value-chunk-persist.js";
import { describeValueChunkWrites } from "./writer-group-selection.js";
import {
  resolveValueChunkWriteGeometry,
  retainCompleteObservedValueChunkWriteGeometry
} from "./value-chunk-write-geometry.js";
async function buildStatefulFunctionCall(host) {
  const refuseSequence = (route) => {
    if (host.sequenceOverride !== void 0) {
      throw new Error(`setSequence is not supported for ${route} calls; only an ordinary stateful call sets it`);
    }
  };
  const splitMergeBuilder = await host.trySplitMergeBuild();
  if (splitMergeBuilder) {
    refuseSequence("split/merge");
    return splitMergeBuilder;
  }
  if (!host.compilerRoute) {
    const composed = await host.busRowComposition();
    if (composed) {
      refuseSequence("composed");
      return composed;
    }
  }
  const stb = await host.applyOverrides();
  const buildFinalized = () => {
    const valueChunkVariables = stb.getValueChunkVars();
    const observedChunks = [...stb.getDerivedChunkOutputs()].map(([offset, chunk]) => ({
      offset,
      resourceIdentity: chunk.resourceIdentity,
      resourcePart: chunk.resourcePart
    }));
    for (const group of [...stb.getExternalCallUtxoGroups(), ...stb.getLowLevelCallUtxoGroups()]) {
      const described = describeValueChunkWrites(group, group.valueChunkStateOwner?.categoryId);
      if (described.length > 0 || group.valueChunkWrites === void 0) {
        const published = preserveTransportedValueChunkWriteGeometry(group, described);
        group.valueChunkWrites = retainCompleteObservedValueChunkWriteGeometry(
          published,
          group.valueChunkWrites ?? [],
          observedChunks
        );
      }
    }
    const built = stb.build();
    stb.bindMaterializedValueChunkWitnesses(built, host.compilerRoute?.blockBase ?? 0);
    const composedBlockBase = stb.getComposedBlockBase();
    const compilerValueChunkWrites = resolveValueChunkWriteGeometry(
      stb.getValueChunkWriteDescriptors(),
      host.compilerRoute?.valueChunkProductions?.map((production) => production.write) ?? [],
      [...stb.getDerivedChunkOutputs()].map(([offset, chunk]) => ({
        offset: offset + composedBlockBase,
        resourceIdentity: chunk.resourceIdentity,
        resourcePart: chunk.resourcePart
      }))
    );
    const runtimeEvents = stb.getRuntimeLoopEventOutputs();
    if (runtimeEvents.length > 0) {
      Object.defineProperty(built, "__messageBusRuntimeLoopEvents", {
        configurable: false,
        enumerable: false,
        value: Object.freeze(runtimeEvents.map((event, eventIndex) => Object.freeze({
          eventSignature: event.eventSignature,
          rowIndex: event.rowIndex,
          offset: stb.getRuntimeLoopEventOutputIndex(eventIndex),
          ...event.chunked && { chunked: true }
        })))
      });
    }
    const computedValueChunks = [];
    const writesByResource = /* @__PURE__ */ new Map();
    for (const write of compilerValueChunkWrites) {
      const identity = valueChunkWriteResourceIdentity(write);
      const prior = writesByResource.get(identity);
      if (prior !== void 0 && (prior.outputBase !== write.outputBase || prior.outputCount !== write.outputCount || prior.operation !== write.operation || prior.entryAccessSlot !== write.entryAccessSlot || prior.routeSlot !== write.routeSlot || prior.collection !== write.collection || prior.collectionSignature !== write.collectionSignature || prior.collectionHash !== write.collectionHash || prior.categoryId !== write.categoryId || prior.keySlot !== write.keySlot)) {
        throw new Error(
          `Kernel chunkable-value resource '${identity}' has conflicting unauthenticated producer geometry.`
        );
      }
      if (prior === void 0) writesByResource.set(identity, write);
    }
    const computedValueChunkSpanClaims = [];
    for (const [resourceIdentity, write] of writesByResource) {
      if (write.outputBase < 0 || write.outputCount === 0) continue;
      if (!Number.isSafeInteger(write.outputBase) || !Number.isSafeInteger(write.outputCount) || write.outputCount < 0 || write.outputBase + write.outputCount > Number.MAX_SAFE_INTEGER) {
        throw new Error(
          `Kernel chunkable-value resource '${resourceIdentity}' has invalid continuation geometry.`
        );
      }
      for (let chunkIndex = 0; chunkIndex < write.outputCount; chunkIndex += 1) {
        computedValueChunkSpanClaims.push(Object.freeze({
          offset: write.outputBase + chunkIndex,
          resourceIdentity,
          resourcePart: `chunk:${chunkIndex}`
        }));
      }
    }
    if (computedValueChunkSpanClaims.length > 0) {
      Object.defineProperty(built, "__messageBusComputedValueChunkSpanClaims", {
        configurable: false,
        enumerable: false,
        value: Object.freeze(computedValueChunkSpanClaims)
      });
    }
    for (const [resourceIdentity, write] of writesByResource) {
      const variables = valueChunkVariables.flatMap((variable2) => variable2.collection === write.collection && variable2.slot && binToHex(variable2.slot) === write.keySlot.toLowerCase() ? [variable2] : []);
      if (variables.length !== 1) continue;
      const variable = variables[0];
      const commitments = stb.getValueChunkRawCommitments(variable.id);
      const outputCount = Math.max(1, write.outputCount, commitments.length);
      for (let chunkIndex = 0; chunkIndex < outputCount; chunkIndex += 1) {
        const offset = write.outputBase + chunkIndex;
        computedValueChunks.push(Object.freeze({
          offset,
          commitment: commitments[chunkIndex] ?? "00",
          lockingBytecode: variable.lockingBytecode.slice(),
          categoryId: write.categoryId,
          resourceIdentity,
          resourcePart: `chunk:${chunkIndex}`
        }));
      }
    }
    for (const [localOffset, chunk] of stb.getDerivedChunkOutputs()) {
      const offset = localOffset + composedBlockBase;
      if (computedValueChunks.some((candidate) => candidate.offset === offset)) continue;
      computedValueChunks.push(Object.freeze({
        offset,
        commitment: chunk.commitment,
        lockingBytecode: chunk.lockingBytecode.slice(),
        categoryId: chunk.categoryId,
        fixedIndex: chunk.fixedIndex,
        resourceIdentity: chunk.resourceIdentity,
        resourcePart: chunk.resourcePart
      }));
    }
    {
      const resourceLocks = /* @__PURE__ */ new Map();
      const noteLock = (lock, kind) => {
        if (lock && lock.length > 0) resourceLocks.set(binToHex(lock).toLowerCase(), kind);
      };
      for (const slot of stb.getBlockLayoutSlotsForDiagnostics()) {
        const lock = built.outputs[slot.offset]?.to;
        if (lock instanceof Uint8Array) noteLock(lock, `${slot.kind}${slot.slotIndex !== void 0 ? `#${slot.slotIndex}` : ""}`);
      }
      for (const [offset, chunk] of stb.getDerivedChunkOutputs()) {
        noteLock(chunk.lockingBytecode, `chunk:${chunk.resourcePart ?? offset}`);
      }
      noteLock(stb.getValueChunkRedeemLock(), "valueChunkRedeem");
      if (resourceLocks.size > 0) {
        Object.defineProperty(built, "__messageBusResourceLocks", {
          configurable: false,
          enumerable: false,
          value: Object.freeze([...resourceLocks.entries()])
        });
      }
    }
    if (computedValueChunks.length > 0) {
      Object.defineProperty(built, "__messageBusComputedValueChunks", {
        configurable: false,
        enumerable: false,
        value: Object.freeze(computedValueChunks)
      });
    }
    return built;
  };
  const builder = buildFinalized();
  if (stb.hasUnresolvedDeferredKeccakPreimages() || stb.hasUnresolvedDeferredEcrecoverArguments()) {
    const provider = builder.provider;
    Object.defineProperty(builder, "__messageBusDeferredCompute", {
      configurable: false,
      enumerable: false,
      value: Object.freeze({
        hasUnresolved: () => stb.hasUnresolvedDeferredKeccakPreimages() || stb.hasUnresolvedDeferredEcrecoverArguments(),
        resolveRecipes: (keccakPreimages, ecrecoverArguments) => stb.applyDeferredComputeRecipes(keccakPreimages, ecrecoverArguments),
        // The composer reports a stall as one opaque sentence; the counts say whether the trace failed to expose
        // a keccak preimage or an ecrecover (hash,v,r,s) blob, which are different causes.
        remaining: () => stb.getDeferredComputeRemainingForDiagnostics(),
        resolve: (program, executionInput, inputBase, candidateExecutions = []) => {
          const fillProbeCommitment = (token, mirror) => {
            const commitment = token?.nft?.commitment;
            if (!token?.nft || commitment === void 0 || commitment.length > 0) return token;
            const filled = mirror && mirror.length > 0 ? mirror : new Uint8Array(64);
            return { ...token, nft: { ...token.nft, commitment: filled } };
          };
          const emptyOn = (item) => {
            const commitment = item?.token?.nft?.commitment;
            return commitment !== void 0 && commitment.length === 0;
          };
          const mirrorFor = (index) => {
            const outputCommitment = program.transaction.outputs[index]?.token?.nft?.commitment;
            if (outputCommitment && outputCommitment.length > 0) return outputCommitment;
            const sourceCommitment = program.sourceOutputs[index]?.token?.nft?.commitment;
            return sourceCommitment && sourceCommitment.length > 0 ? sourceCommitment : void 0;
          };
          const trailingCoordinates = (() => {
            try {
              return stb.getTrailingBandCoordinatesForDiagnostics();
            } catch {
              return {};
            }
          })();
          const trailingBase = trailingCoordinates.trailingBase;
          const blockSize = trailingCoordinates.blockSize;
          const masterCategory = program.transaction.outputs.find((candidate) => candidate.token?.nft?.capability === "minting")?.token?.category;
          const placeholderFor = (output, index) => {
            if (output.token !== void 0 || masterCategory === void 0 || trailingBase === void 0) {
              return output;
            }
            if (index < inputBase + trailingBase) return output;
            if (blockSize !== void 0 && index >= inputBase + blockSize) return output;
            return {
              ...output,
              token: {
                amount: 0n,
                category: masterCategory,
                nft: { capability: "mutable", commitment: new Uint8Array(64) }
              }
            };
          };
          const probeSources = program.sourceOutputs.map((source, index) => emptyOn(source) ? { ...source, token: fillProbeCommitment(source.token, mirrorFor(index)) } : source);
          const probeOutputs = program.transaction.outputs.map((output, index) => emptyOn(output) ? { ...output, token: fillProbeCommitment(output.token, mirrorFor(index)) } : output).map((output, index) => placeholderFor(output, index));
          let progressed = false;
          let trace = [];
          const executions = [executionInput, ...candidateExecutions.filter((index) => index !== executionInput)];
          for (const candidate of executions) {
            trace = evaluateProbeTrace(provider, {
              ...program,
              sourceOutputs: probeSources,
              transaction: { ...program.transaction, outputs: probeOutputs },
              inputIndex: candidate
            });
            if (stb.resolveDeferredKeccakPreimage(trace, inputBase)) progressed = true;
            if (stb.resolveDeferredEcrecoverArgument(trace, inputBase)) progressed = true;
            if (progressed) break;
          }
          if (!progressed && globalThis.process?.env?.SOLIDC_DEBUG_ENTRY_COUNTS === "1") {
            const vmNumber = (bytes) => {
              if (!bytes || bytes.length === 0) return 0;
              const negative = (bytes[bytes.length - 1] & 128) !== 0;
              const magnitude = Uint8Array.from(bytes);
              if (negative) magnitude[magnitude.length - 1] &= 127;
              let value = 0n;
              for (let byte = magnitude.length - 1; byte >= 0; byte -= 1) {
                value = value << 8n | BigInt(magnitude[byte]);
              }
              return Number(negative ? -value : value);
            };
            const lockKinds = /* @__PURE__ */ new Map();
            const classify = (lock, kind) => {
              if (lock) lockKinds.set(binToHex(lock).toLowerCase(), kind);
            };
            try {
              for (const [offset, chunk] of stb.getDerivedChunkOutputs()) {
                classify(chunk.lockingBytecode, `chunk:${chunk.resourcePart ?? offset}${chunk.semanticKind ? `(${chunk.semanticKind})` : ""}`);
              }
            } catch {
            }
            try {
              classify(stb.getValueChunkRedeemLock(), "valueChunkRedeem");
            } catch {
            }
            try {
              console.error("trailing-band-coordinates", JSON.stringify({
                buildId: peekBuildId(),
                participant: host.parentContract?.inner.artifact.contractName,
                coordinates: stb.getTrailingBandCoordinatesForDiagnostics()
              }));
            } catch {
            }
            const parent = host.parentContract;
            if (parent) {
              try {
                classify(addressToLockScript(parent.inner.address), "master");
              } catch {
              }
              try {
                classify(addressToLockScript(getDataNftAddress(parent.inner, parent.categoryId)), "dataNft");
              } catch {
              }
              for (const collection of parent.inner.artifact.stateLayout?.collections ?? []) {
                try {
                  classify(addressToLockScript(getEntryNftAddress(
                    parent.inner,
                    parent.categoryId,
                    collection.name
                  )), `entry:${collection.name}`);
                } catch {
                }
              }
            }
            const commitmentReads = trace.flatMap((raw) => {
              const state = raw;
              const opcode = state.instructions?.[state.ip ?? -1]?.opcode;
              if (!state.stack || state.stack.length === 0) return [];
              const isOutput = opcode === Op.OP_OUTPUTTOKENCOMMITMENT;
              const isInput = opcode === Op.OP_UTXOTOKENCOMMITMENT;
              const inputSide = opcode === Op.OP_UTXOTOKENCATEGORY || opcode === Op.OP_UTXOBYTECODE || opcode === Op.OP_UTXOVALUE || opcode === Op.OP_UTXOTOKENAMOUNT || opcode === Op.OP_INPUTBYTECODE;
              const outputSide = opcode === Op.OP_OUTPUTBYTECODE || opcode === Op.OP_OUTPUTTOKENCATEGORY || opcode === Op.OP_OUTPUTVALUE || opcode === Op.OP_OUTPUTTOKENAMOUNT;
              if (!isOutput && !isInput && !outputSide && !inputSide) return [];
              const label = opcode === Op.OP_OUTPUTBYTECODE ? "out-bytecode" : opcode === Op.OP_UTXOBYTECODE ? "in-bytecode" : opcode === Op.OP_UTXOTOKENCATEGORY ? "in-category" : opcode === Op.OP_OUTPUTTOKENCATEGORY ? "out-category" : opcode === Op.OP_INPUTBYTECODE ? "in-inputbytecode" : isOutput ? "out-commitment" : "in-commitment";
              const index = vmNumber(state.stack[state.stack.length - 1]);
              const introspected = isInput || inputSide ? program.sourceOutputs[index] : probeOutputs[index];
              const commitment = introspected?.token?.nft?.commitment;
              const lock = introspected?.lockingBytecode;
              return [{
                op: label,
                index,
                bytes: state.stack[state.stack.length - 1]?.length,
                stackDepth: state.stack.length,
                cat: introspected?.token?.category ? binToHex(introspected.token.category).slice(0, 8) : void 0,
                cap: introspected?.token?.nft?.capability,
                commitBytes: commitment?.length,
                lock: lock ? binToHex(lock).slice(0, 12) : void 0,
                kind: lock ? lockKinds.get(binToHex(lock).toLowerCase()) : void 0
              }];
            });
            const terminal = trace.at(-1);
            console.error("deferred-no-progress-reads", JSON.stringify({
              buildId: peekBuildId(),
              total: commitmentReads.length,
              error: terminal?.error,
              failingIp: terminal?.ip,
              failingOpcode: terminal?.instructions?.[terminal.ip ?? -1]?.opcode,
              // The terminal state's instruction list is the ENCLOSING script's, so print the window around the
              // pointer rather than one index: the reported failing opcode (OP_VERIFY) and the neighbouring
              // opcodes together identify the check without needing the artifact's ip-to-source map.
              // The runtime-loop journal rejects the reserved target ordinal (0xffff) and the covenant's
              // sentinel check is exactly `require(target != 0xffff)`, so report any access stream the probe
              // carries whose target field still holds the sentinel: that tuple, not the commitment parse, is
              // what ends the trace before the deferred resolvers can read their arguments.
              accessSentinels: program.transaction.inputs.flatMap((input, inputIndex) => {
                const unlocking = input.unlockingBytecode;
                const hits = [];
                for (let at = 0; at + 2 <= unlocking.length; at += 1) {
                  if (unlocking[at] !== KERNEL_ENTRY_JOURNAL_ACCESS_TAG) continue;
                  const count = unlocking[at + 1];
                  if (count === 0 || count > 64 || at + 2 + count * 5 > unlocking.length) continue;
                  const tuples = Array.from({ length: count }, (_unused, index) => {
                    const offset = at + 2 + 20 + index * 5;
                    return {
                      flags: unlocking[offset],
                      fieldA: unlocking[offset + 1] | unlocking[offset + 2] << 8,
                      fieldB: unlocking[offset + 3] | unlocking[offset + 4] << 8
                    };
                  });
                  const matchesAsTargetFirst = tuples.filter((tuple) => (tuple.flags & 4) !== 0 === (tuple.fieldB !== 65535)).length;
                  const matchesAsPredecessorFirst = tuples.filter((tuple) => (tuple.flags & 4) !== 0 === (tuple.fieldA !== 65535)).length;
                  const sentinels = tuples.map((tuple, index) => ({ tuple, index })).filter(({ tuple }) => tuple.fieldA === 65535).map(({ index }) => index);
                  const predecessorSentinels = tuples.map((tuple, index) => ({ tuple, index })).filter(({ tuple }) => tuple.fieldB === 65535).map(({ index }) => index);
                  const canonicalTargetFirst = matchesAsTargetFirst === count && tuples.every((tuple) => (tuple.flags & 4) !== 0 ? tuple.fieldB !== 65535 : tuple.fieldB === 65535) && tuples.every((tuple) => tuple.fieldA !== tuple.fieldB);
                  if (canonicalTargetFirst && sentinels.length > 0) {
                    hits.push({
                      input: inputIndex,
                      count,
                      sentinels,
                      predecessorSentinels,
                      canonicalOrder: "target-first",
                      agreement: [matchesAsTargetFirst, count]
                    });
                  } else if (matchesAsPredecessorFirst === count && predecessorSentinels.length > 0) {
                    hits.push({
                      input: inputIndex,
                      count,
                      sentinels,
                      predecessorSentinels,
                      canonicalOrder: "predecessor-first",
                      agreement: [matchesAsPredecessorFirst, count]
                    });
                  }
                }
                return hits;
              }),
              deferredRemaining: (() => {
                try {
                  return stb.getDeferredComputeRemainingForDiagnostics();
                } catch {
                  return void 0;
                }
              })(),
              // The operands the failing check compared. Sizes alone cannot say which coordinate's body the
              // covenant expected, so carry the top of the stack as length-prefixed hex.
              // Which ROUTE witnesses the probe actually carried. The failing checks compare locking
              // bytecodes against items that came out EMPTY, and an empty item is what an unfilled ABI witness
              // looks like - so list the pushdata items of the executing input with their lengths, in ABI order,
              // marking the empty ones. Mapping them onto the route ABI's internal input names is then a lookup.
              executionWitnesses: (() => {
                const unlocking = program.transaction.inputs[executionInput]?.unlockingBytecode ?? new Uint8Array();
                const items = [];
                let at = 0;
                while (at < unlocking.length && items.length < 64) {
                  const opcode = unlocking[at];
                  if (opcode >= 1 && opcode <= 75) {
                    items.push({ index: items.length, length: opcode });
                    at += 1 + opcode;
                  } else if (opcode === 76 && at + 1 < unlocking.length) {
                    const size = unlocking[at + 1];
                    items.push({ index: items.length, length: size });
                    at += 2 + size;
                  } else if (opcode === 0) {
                    items.push({ index: items.length, length: 0 });
                    at += 1;
                  } else {
                    break;
                  }
                }
                const empty = items.filter((item) => item.length === 0).map((item) => item.index);
                const declared = host.parentContract?.inner.artifact.messageBus?.verifierProgram?.inputs ?? [];
                const heads = [];
                {
                  let cursor = 0;
                  while (cursor < unlocking.length && heads.length < 64) {
                    const opcode = unlocking[cursor];
                    if (opcode >= 1 && opcode <= 75) {
                      heads.push(binToHex(unlocking.slice(cursor + 1, cursor + 1 + opcode)).slice(0, 32));
                      cursor += 1 + opcode;
                    } else if (opcode === 76 && cursor + 1 < unlocking.length) {
                      const size = unlocking[cursor + 1];
                      heads.push(binToHex(unlocking.slice(cursor + 2, cursor + 2 + size)).slice(0, 32));
                      cursor += 2 + size;
                    } else if (opcode === 0) {
                      heads.push("");
                      cursor += 1;
                    } else {
                      break;
                    }
                  }
                }
                return {
                  count: items.length,
                  lengths: items.map((item) => item.length),
                  empty,
                  emptyNames: empty.map((index) => declared[index]?.name ?? `<${index}>`),
                  declaredNames: declared.map((input) => input.name ?? "?").slice(0, items.length + 4),
                  inputIndex: executionInput,
                  unlockingLength: unlocking.length,
                  inputLock: binToHex(program.sourceOutputs?.[executionInput]?.lockingBytecode ?? new Uint8Array()).slice(0, 24),
                  heads
                };
              })(),
              failingStack: (() => {
                const known = /* @__PURE__ */ new Set();
                const note = (bytes) => {
                  if (bytes && bytes.length > 0) known.add(binToHex(bytes));
                };
                for (const input of program.transaction.inputs) {
                  const unlocking = input.unlockingBytecode;
                  for (let cursor = 0; cursor < unlocking.length; ) {
                    const opcode = unlocking[cursor];
                    if (opcode >= 1 && opcode <= 75) {
                      note(unlocking.slice(cursor + 1, cursor + 1 + opcode));
                      cursor += 1 + opcode;
                    } else if (opcode === 76 && cursor + 1 < unlocking.length) {
                      const size = unlocking[cursor + 1];
                      note(unlocking.slice(cursor + 2, cursor + 2 + size));
                      cursor += 2 + size;
                    } else cursor += 1;
                  }
                }
                for (const item of [...program.sourceOutputs, ...program.transaction.outputs]) {
                  const candidate = item;
                  note(candidate.lockingBytecode);
                  note(candidate.token?.category);
                  note(candidate.token?.nft?.commitment);
                }
                const carried = [...known];
                const isCarried = (hex) => hex.length > 0 && carried.some((value) => value === hex || value.includes(hex));
                const stack = terminal?.stack ?? [];
                return stack.slice(-8).map((item) => ({
                  length: item.length,
                  hex: binToHex(item).slice(0, 48),
                  origin: item.length === 0 ? "empty" : isCarried(binToHex(item)) ? "known" : "nowhere"
                }));
              })(),
              failingWindow: (terminal?.instructions ?? []).slice(Math.max(0, (terminal?.ip ?? 0) - 9), (terminal?.ip ?? 0) + 4).map((instruction) => ({ op: instruction?.opcode })),
              trailing: commitmentReads.slice(-40)
            }));
          }
          if (!progressed && globalThis.process?.env?.SOLIDC_DEBUG_PROBE_SWEEP === "1") {
            const sweep = [];
            const blockProbeInputs = /* @__PURE__ */ new Set();
            try {
              for (const slot of stb.getBlockLayoutSlotsForDiagnostics()) {
                if (!["master", "identityAnchor", "lowLevelCall"].includes(slot.kind)) continue;
                blockProbeInputs.add(inputBase + slot.offset);
              }
            } catch {
            }
            blockProbeInputs.add(inputBase);
            const sweepVmNumber = (bytes) => {
              if (!bytes || bytes.length === 0) return 0;
              const negative = (bytes[bytes.length - 1] & 128) !== 0;
              const magnitude = Uint8Array.from(bytes);
              if (negative) magnitude[magnitude.length - 1] &= 127;
              let value = 0n;
              for (let byte = magnitude.length - 1; byte >= 0; byte -= 1) {
                value = value << 8n | BigInt(magnitude[byte]);
              }
              return Number(negative ? -value : value);
            };
            for (let candidate = 0; candidate < program.transaction.inputs.length; candidate += 1) {
              const lock = program.sourceOutputs?.[candidate]?.lockingBytecode ?? new Uint8Array();
              const unlockingBytes = program.transaction.inputs[candidate]?.unlockingBytecode?.length ?? 0;
              const attempted = candidate === executionInput || candidateExecutions.includes(candidate);
              if (!attempted && unlockingBytes < 1e3 && !blockProbeInputs.has(candidate)) continue;
              let candidateTrace = [];
              try {
                candidateTrace = evaluateProbeTrace(provider, { ...program, inputIndex: candidate });
              } catch (error) {
                sweep.push({ candidate, attempted, lockBytes: lock.length, error: String(error).slice(0, 80) });
                continue;
              }
              const reads = candidateTrace.flatMap((raw) => {
                const state = raw;
                if (state.instructions?.[state.ip ?? -1]?.opcode !== Op.OP_INPUTBYTECODE || !state.stack || state.stack.length < 2) return [];
                const index = sweepVmNumber(state.stack[state.stack.length - 1]);
                return [{ ip: state.ip, index, inSidecarRange: index >= inputBase && index < inputBase + 32 }];
              });
              if (reads.length === 0 && !attempted) continue;
              const frames = /* @__PURE__ */ new Map();
              for (const raw of candidateTrace) {
                const state = raw;
                const key = state.instructions?.length ?? 0;
                const entry = frames.get(key) ?? { steps: 0, maxIp: 0 };
                entry.steps += 1;
                entry.maxIp = Math.max(entry.maxIp, state.ip ?? 0);
                frames.set(key, entry);
              }
              sweep.push({
                frames: [...frames.entries()].sort((left, right) => right[1].steps - left[1].steps).slice(0, 6).map(([frame, entry]) => ({ frame, steps: entry.steps, maxIp: entry.maxIp })),
                candidate,
                attempted,
                lockHead: binToHex(lock).slice(0, 24),
                unlockingBytes,
                steps: candidateTrace.length,
                sidecarReads: reads.filter((read) => read.inSidecarRange).slice(0, 3),
                reads: reads.slice(-4)
              });
              if (sweep.length >= 24) break;
            }
            console.error("deferred-probe-sweep", JSON.stringify({ inputBase, executionInput, sweep }));
          }
          if (!progressed && globalThis.process?.env?.SOLIDC_DEBUG_ECRECOVER_DERIVE === "1") {
            const terminal = trace.at(-1);
            const ip = terminal?.ip ?? -1;
            const lastOutputBytecode = [...trace].reverse().find((raw) => {
              const state = raw;
              return state.instructions?.[state.ip ?? -1]?.opcode === Op.OP_OUTPUTBYTECODE;
            });
            const handlerSnapshots = Array.from({ length: 8 }, (_, offset) => ip - 7 + offset).flatMap((wantedIp) => {
              const state = [...trace].reverse().find((raw) => {
                const candidate = raw;
                return candidate.ip === wantedIp && candidate.instructions?.length === terminal?.instructions?.length;
              });
              if (!state?.stack) return [];
              return [{
                ip: state.ip,
                opcode: state.instructions?.[wantedIp]?.opcode,
                stackSize: state.stack.length,
                altSize: state.alternateStack?.length,
                top: state.stack.slice(-40).map((item, index, stack) => ({
                  depth: stack.length - 1 - index,
                  bytes: item.length,
                  hex: binToHex(item).slice(0, 160)
                }))
              }];
            });
            const diagnostic = {
              executionInput,
              inputBase,
              states: trace.length,
              error: terminal?.error,
              ip,
              stackBytes: terminal?.stack?.slice(-8).map((item) => item.length),
              terminalStack: terminal?.stack?.slice(-45).map((item, index, stack) => ({
                depth: stack.length - 1 - index,
                bytes: item.length,
                hex: binToHex(item).slice(0, 160)
              })),
              handlerSnapshots,
              nearby: terminal?.instructions?.slice(Math.max(0, ip - 24), ip + 2).map((instruction, offset) => ({
                ip: Math.max(0, ip - 24) + offset,
                opcode: instruction.opcode,
                data: instruction.data && binToHex(instruction.data).slice(0, 64)
              })),
              ring: trace.slice(-18).map((raw) => {
                const state = raw;
                return {
                  ip: state.ip,
                  opcode: state.instructions?.[state.ip ?? -1]?.opcode,
                  stack: state.stack?.slice(-6).map((item) => ({
                    bytes: item.length,
                    hex: binToHex(item).slice(0, 48)
                  })),
                  error: state.error
                };
              }),
              outputBytecodeStack: lastOutputBytecode?.stack?.map((item, index, stack) => ({
                depth: stack.length - 1 - index,
                bytes: item.length,
                hex: binToHex(item).slice(0, 80)
              }))
            };
            if (globalThis.process?.env?.SOLIDC_DEBUG_HANDLER_SNAPSHOTS === "1") {
              const frames = /* @__PURE__ */ new Map();
              for (const raw of trace) {
                const state = raw;
                const instructionCount = state.instructions?.length ?? 0;
                const frame = frames.get(instructionCount) ?? {
                  states: 0,
                  minIp: Number.POSITIVE_INFINITY,
                  maxIp: -1
                };
                frame.states += 1;
                frame.minIp = Math.min(frame.minIp, state.ip ?? -1);
                frame.maxIp = Math.max(frame.maxIp, state.ip ?? -1);
                frames.set(instructionCount, frame);
              }
              console.error("handler-boundary", JSON.stringify({
                error: terminal?.error,
                ip,
                snapshots: handlerSnapshots,
                frames: [...frames.entries()].sort(([left], [right]) => right - left).slice(0, 24)
              }));
            } else {
              const terminalState = terminal;
              const firstTiny = trace.findIndex((raw) => (raw.instructions?.length ?? 0) === 5);
              const before = firstTiny < 0 ? [] : trace.slice(Math.max(0, firstTiny - 6), firstTiny + 1).map((raw) => {
                const state = raw;
                return {
                  ip: state.ip,
                  frame: state.instructions?.length ?? 0,
                  opcode: state.instructions?.[state.ip ?? -1]?.opcode,
                  id: state.instructions?.[(state.ip ?? 0) - 1]?.data ? binToHex(state.instructions[(state.ip ?? 0) - 1].data).slice(0, 8) : void 0,
                  top: (state.stack ?? []).slice(-4).map((item, index, stack) => `${stack.length - 1 - index}:${item.length}:${binToHex(item).slice(0, 48)}`)
                };
              });
              console.error("no-progress-before-frame", JSON.stringify({
                buildId: peekBuildId(),
                firstTiny,
                before
              }));
              const framesOf = (count) => {
                const first = trace.find((raw) => (raw.instructions?.length ?? 0) === count);
                if (!first) return [];
                return [{
                  program: (first.instructions ?? []).map((instruction) => `${instruction.opcode}` + (instruction.data ? `:${binToHex(instruction.data)}` : "")),
                  stack: (first.stack ?? []).slice(-6).map((item, index, stack) => `${stack.length - 1 - index}:${item.length}:${binToHex(item).slice(0, 260)}`)
                }];
              };
              const frameEntries = [];
              for (const [index, raw] of trace.entries()) {
                const state = raw;
                if ((state.ip ?? -1) !== 0 || !state.instructions) continue;
                frameEntries.push({
                  index,
                  size: state.instructions.length,
                  head: state.instructions.slice(0, 6).map((instruction) => `${instruction.opcode}` + (instruction.data ? `:${binToHex(instruction.data).slice(0, 12)}` : "")).join(" "),
                  stackDepth: state.stack?.length
                });
              }
              const bodies = /* @__PURE__ */ new Map();
              let order = 0;
              let failing = "";
              const terminalInstructions = terminal?.instructions;
              for (const raw of trace) {
                const state = raw;
                if (!state.instructions) continue;
                const key = state.instructions.slice(0, 6).map((instruction) => instruction.opcode).join(",");
                const entry = bodies.get(key);
                if (!entry) {
                  bodies.set(key, { states: 1, minIp: state.ip ?? -1, maxIp: state.ip ?? -1, order: order++ });
                } else {
                  entry.states += 1;
                  entry.minIp = Math.min(entry.minIp, state.ip ?? -1);
                  entry.maxIp = Math.max(entry.maxIp, state.ip ?? -1);
                }
                if (terminalInstructions && state.instructions === terminalInstructions) failing = key;
              }
              const failingIndex = terminalInstructions ? trace.findIndex((raw) => raw.instructions === terminalInstructions) : -1;
              const around = failingIndex < 0 ? [] : trace.slice(Math.max(0, failingIndex - 3), failingIndex + 3).map((raw, offset) => {
                const state = raw;
                return {
                  at: Math.max(0, failingIndex - 3) + offset,
                  ip: state.ip,
                  size: state.instructions?.length ?? 0,
                  head: (state.instructions ?? []).slice(0, 8).map((instruction) => `${instruction.opcode}` + (instruction.data ? `:${binToHex(instruction.data).slice(0, 16)}` : "")).join(" "),
                  stack: (state.stack ?? []).map((item, index, stack) => `${stack.length - 1 - index}:${item.length}:${binToHex(item).slice(0, 120)}`)
                };
              });
              console.error("no-progress-around-failing", JSON.stringify({
                buildId: peekBuildId(),
                failingIndex,
                around
              }));
              console.error("no-progress-bodies", JSON.stringify({
                buildId: peekBuildId(),
                failing,
                bodies: [...bodies.entries()].map(([key, entry]) => ({ key, ...entry }))
              }));
              console.error("no-progress-frame-entries", JSON.stringify({
                buildId: peekBuildId(),
                entries: frameEntries.slice(-10)
              }));
              console.error("no-progress-frames", JSON.stringify({
                buildId: peekBuildId(),
                five: framesOf(5),
                seven: framesOf(7)
              }));
              console.error("no-progress-terminal", JSON.stringify({
                buildId: peekBuildId(),
                ip,
                program: (terminalState?.instructions ?? []).slice(0, 8).map(
                  (instruction) => `${instruction.opcode}` + (instruction.data ? `:${binToHex(instruction.data).slice(0, 30)}` : "")
                ),
                instructionCount: terminalState?.instructions?.length ?? 0,
                stack: (terminalState?.stack ?? []).slice(-14).map((item, index, stack) => `${stack.length - 1 - index}:${item.length}:${binToHex(item).slice(0, 60)}`)
              }));
              console.error("atomic-deferred-compute-no-progress", JSON.stringify({
                buildId: peekBuildId(),
                error: diagnostic.error,
                ip: diagnostic.ip,
                states: diagnostic.states,
                executionInput: diagnostic.executionInput,
                stackBytes: diagnostic.stackBytes
              }));
            }
          }
          return progressed;
        },
        refresh: buildFinalized
      })
    });
  }
  const selectedAbi = host.selectedAbiFunction();
  const selectedIsRoute = selectedAbi?.name === "__message_bus1" || (selectedAbi?.name?.startsWith("__message_bus") ?? false);
  const activeDynamicWrites = selectedIsRoute ? void 0 : selectedAbi?.dynamicWrites ?? (selectedAbi !== void 0 ? [] : void 0);
  const incompleteDynamicChunks = stb.getDynamicChunkVars().flatMap((variable) => {
    if (Array.isArray(activeDynamicWrites) && !activeDynamicWrites.includes(variable.name)) {
      return [];
    }
    const commitments = stb.getChunkRawCommitments(variable.name);
    const unresolved = commitments.filter((commitment) => commitment === "00").length;
    return unresolved === 0 ? [] : [{
      variable: variable.name,
      resolved: commitments.length - unresolved,
      total: commitments.length
    }];
  });
  if (incompleteDynamicChunks.length > 0) {
    builder.__messageBusIncompleteDynamicChunks = Object.freeze(incompleteDynamicChunks);
  }
  if (host.recursivePreflightHasSignatures()) {
    throw new Error(
      `Recursive state invocation '${host.functionName}' contains transaction signatures and cannot expose an unsigned intermediate builder; call .send() so the SDK can preflight the fully funded transaction.`
    );
  }
  host.preflightRecursiveBuilder(builder);
  return builder;
}
export {
  buildStatefulFunctionCall
};

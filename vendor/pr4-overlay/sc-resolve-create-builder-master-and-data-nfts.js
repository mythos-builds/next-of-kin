import { binToHex } from "@bitauth/libauth/build/lib/format/hex.js";
function resolveCreateBuilderMasterAndDataNfts(input) {
  const { functionName, categoryId, requiredNftIndices, onChainState, overrides } = input;
  if (!overrides?.masterUtxo && !onChainState.masterUtxo) {
    throw new Error("Master UTXO not found on-chain");
  }
  const chosenMaster = overrides?.masterUtxo ?? onChainState.masterUtxo;
  const masterUtxo = overrides?.masterSequence === void 0 ? chosenMaster : {
    ...chosenMaster,
    options: { ...chosenMaster.options, sequence: overrides.masterSequence }
  };
  if (globalThis.process?.env?.SOLIDC_DEBUG_DYNAMIC_CHUNK_ORDER === "1") {
    const state = onChainState.state;
    console.error("dynamic-chunk-master-state", JSON.stringify({
      functionName,
      blockBase: overrides?.blockBase ?? 0,
      categoryId,
      master: `${masterUtxo.txid.slice(0, 12)}:${masterUtxo.vout}`,
      commitment: masterUtxo.token?.nft?.commitment,
      dynamicValues: Object.fromEntries(Object.entries(state ?? {}).filter(([key]) => ["_name", "_symbol", "name", "symbol"].includes(key)).map(([key, value]) => [key, value instanceof Uint8Array ? `${value.length}:${binToHex(value).slice(0, 40)}` : String(value)]))
    }));
  }
  const derivationMasterUtxo = overrides?.omitLocalFeeTail ? { ...masterUtxo, vout: 4294967295 } : masterUtxo;
  const allDataNftUtxos = overrides?.dataNftUtxos ?? onChainState.dataNftUtxos;
  const filteredDataNftUtxos = requiredNftIndices.map((idx) => allDataNftUtxos[idx]);
  if (filteredDataNftUtxos.some((u) => u === void 0)) {
    throw new Error(
      `Missing required data NFTs on-chain. Expected indices: [${requiredNftIndices.join(", ")}], but only ${allDataNftUtxos.length} data NFTs found.`
    );
  }
  return {
    masterUtxo,
    derivationMasterUtxo,
    allDataNftUtxos,
    filteredDataNftUtxos
  };
}
export {
  resolveCreateBuilderMasterAndDataNfts
};

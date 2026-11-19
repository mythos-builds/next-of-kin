// How deep the vault's state coin is for a spend sent now: BIP68 measures `silence` and `grace` against the block the
// spend enters, tip + 1. The SDK's Electrum provider lists a coin's block as `blockHeight` (0 or absent = not in a block
// yet). The page used to read `height`, which the provider never sets: every vault looked brand new and the buttons
// stayed shut (fixed 2026-11-19).
export function stateDepth(coin: { blockHeight?: number }, tip: number): number {
  const h = coin.blockHeight ?? 0;
  return h > 0 ? tip + 1 - h : 0;
}

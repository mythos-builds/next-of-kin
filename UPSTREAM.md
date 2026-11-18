# Found while building

What building Next of Kin on SolidCash 0.51.1 ran into, with where it lives upstream (`solidcash/solidcash`, master
`eda85a8`) and what we did about it. "Here" is the workaround in this repository.

## F1 · `npm create @solidcash/solidhat` needs a GitHub SSH key

- **Hit:** a fresh project's install fails with `ECONNRESET` on `ssh://git@github.com/mainnet-pat/libauth.git`.
- **Why:** the packages declare `git+https://github.com/mainnet-pat/libauth.git#1cf4b43…`, but npm fetches this GitHub
  dependency over SSH (its lockfile records it as `git+ssh://git@github.com/…`) and fails instead of falling back to
  HTTPS on a machine without a GitHub SSH key.
- **Here:** [`scripts/install.sh`](scripts/install.sh) runs `npm ci` with git's `url.https://github.com/.insteadOf
  ssh://git@github.com/`.
- **Upstream fix idea:** publish the libauth fork to npm (or depend on a release tarball), so installing never needs git.

## F3 · `selfdestructTo` waits 144 blocks after any event

- **Hit:** the owner checks in (which emits `CheckedIn`) and then closes: `non-BIP68-final`, still five blocks later.
- **Why:** `packages/solidcash/src/stateful/sc-destroy.ts:332` adds every event NFT at the event addresses to the
  destroy transaction, each with sequence 144 (`EVENT_NFT_RELATIVE_LOCK_SEQUENCE`), whatever its age. One event
  younger than 144 blocks makes the whole destroy non-final. The docs (`language/selfdestruct.md`) say: "Unexpired
  event NFTs do not block master destruction".
- **Here:** [`lib/close.ts`](lib/close.ts) calls the same helper through a provider view that hides event NFTs
  younger than 144 blocks; they stay at their addresses and anyone can sweep them later. Tested on mock and used on
  mainnet (vault 2 closed seconds after a check-in).
- **Upstream fix idea:** in the event discovery, keep a coin only when `height > 0 && tip + 1 - height >= 144`. The
  mock provider's `getUtxos` does not report `height` today, so it needs that too to be testable.

## F4 · A destination-pinned `selfdestruct(addr)` cannot relay once its transaction is over ~2 kB

- **Hit:** `close` written as `selfdestruct(new LockingBytecodeP2PKH(hash160(owner)))`: with the automatic fee the
  input fails `OP_VERIFY`; with `fee: 1000` the script passes but the node answers `min relay fee not met`.
- **Why:** the statement's covenant (`packages/solidc/src/generation/GenerateTargetTraversal.ts:25042`) requires the fee
  to be under 2,000 sat. Our destroy transaction (master, one data NFT, the satoshi container) was 3,613 bytes, so the
  relay minimum (1 sat/byte) is above the cap. The upstream test contract that passes has one function; ours had five.
- **Here:** `close` is the modifier form (`function close(sig s) selfdestruct`), guarded by the owner's signature,
  which covers every output and so pins the payout.
- **Upstream fix idea:** a compile-time warning when a pinned selfdestruct's worst-case transaction size exceeds the
  cap, or a cap the source can set (`selfdestruct(addr, maxFee)`).

## F5 · A failing `require` is hidden by the transfer derivation

- **Hit:** a second `release()` with 1,000 sat left: the contract's own `require(estate >= MIN_ESTATE, "nothing left to
  release")` never shows; the SDK says `Total transfer amount (3500) exceeds satoshi container balance (1000)`.
- **Why:** `packages/solidcash/src/stateful/stb-materialize-owner-entries-containers-transfers.ts:183` checks the
  derived transfers before the function's requires are evaluated.
- **Here:** the test accepts either message.

## F7 · The mock's `mine(n)` adds fewer than n blocks after sends

- **Hit:** after a check-in, 10 mined blocks were not enough for a 10-block relative lock.
- **Why:** `MockNetworkProvider.mine` (`packages/solidcash/src/network/MockNetworkProvider.ts:724`) sets the tip to
  `this.blockHeight + count`, but every accepted transaction is auto-mined into a block of the indexer without moving
  `this.blockHeight`; a tip below the indexer's is ignored. After k sends, `mine(n)` adds `n - k` blocks.
- **Here:** the tests use `mineBlocks(n)` = `mineUpTo(indexer tip + n)`.

## F8 · The genesis coin is chosen without the initial balance

- **Hit:** on mainnet, deploying a 40,000 sat vault failed with `Insufficient funding: 18863 satoshis provided, but
  49356 needed` while the owner held a 100,000 sat vout-0 coin.
- **Why:** `ContractFactory.deploy` (`packages/solidcash/src/stateful/ContractFactory.ts:441`) calls
  `selectGenesisFundingUtxo(…, poolSatoshis)` without `overrides.initialBalance`; the selection then takes the
  freshest vout-0 coin that covers the records and fee only, and the deployment spends that coin alone.
- **Here:** [`scripts/lifecycle.ts`](scripts/lifecycle.ts) names the largest vout-0 coin as `fundingUtxo`.
- **Upstream fix:** add the initial balance to the floor passed to `selectGenesisFundingUtxo`.

## F9 · A vault-paid call is refused for a caller with no coin

- **Hit:** on mainnet, `kin.connect(stranger).warn()` with an empty stranger wallet: `Cannot send stateful
  transaction without a token-free fee UTXO`, although `warn` pays its fee from the vault (`payMinerFee`).
- **Why:** `packages/solidcash/src/stateful/sc-send-without-logical-nonce.ts:371` refuses when every coin of the signer
  carries a token, and `[].every(…)` is true for a signer with no coin at all. The docs (`language/stateful-contracts.md`,
  "Paying the miner from the container") say "The caller needs no coin".
- **Here:** [`scripts/press.ts`](scripts/press.ts) uses an instance with a provider and no signer; the mainnet warning
  `4096ea27…` was sent that way.
- **Upstream fix idea:** skip the check when the assembled transaction already pays its own fee.

## PR #4 (not ours)

[solidcash/solidcash#4](https://github.com/solidcash/solidcash/pull/4) lets a stateful call set its master input's
nSequence, which `this.age` needs. Next of Kin's clock is built on it: every test and the mainnet lifecycle ran with it
applied ([`scripts/apply-pr4.mjs`](scripts/apply-pr4.mjs)).

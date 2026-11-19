# Next of Kin

**Crypto has no next of kin. Now it does.**

A dead man's switch for Bitcoin Cash, written in [SolidCash](https://github.com/solidcash/solidcash) (Solidity syntax,
compiled to native BCH script) and running on mainnet.

When someone dies, their coins usually die with them: nobody else has the keys, and handing keys to family "just in
case" means trusting them, or a custodian, with everything today. Next of Kin needs neither. The owner keeps their
coins in a contract and checks in now and then. If they go quiet for long enough, anyone can sound the warning; if the
owner still says nothing during a grace period, anyone can release the coins, and the contract itself pays each heir
their fixed share. Funds, never keys.

Built for [BCH BLAZE 2026](https://dorahacks.io/hackathon/bchblaze2026) (SolidCash bounty) by one human and an AI agent.

**Live demo: https://mythos-builds.github.io/next-of-kin/** reads the vaults below straight from BCH mainnet. Vault 4
is already warned: anyone can release it and its heirs are paid at once. Vaults 3, 5 and 6 are watching: anyone can
sound the warning, then release a block later. All from the page, with no wallet.

## How it works

| Step | Who | What the contract checks |
| --- | --- | --- |
| Deploy | owner | Coins go into the vault with two heirs, heir A's share in %, `silence` and `grace` in blocks. |
| Check in | owner only | The owner's signature. The vault's state coin is spent and re-created, so **the coin's own age is the clock**: it restarts at every check-in, and a check-in cancels any warning. |
| Warn | anyone | The state coin is at least `silence` blocks old (`this.age`, a BIP68 relative timelock). |
| Release | anyone | A warning was given and is at least `grace` blocks old. The covenant pays each heir their share, to the satoshi, and nothing else leaves the vault. |
| Close | owner only | The owner's signature, at any time: everything goes back to the owner. |

Nobody can hurry the clock: a warner who claims the silence has passed is refused by the network itself until the
state coin really is that old. The grace period runs from the warning's own block, so the owner always gets their full
grace, however long they were quiet before. Warning and release cost the caller nothing: the vault pays the network
(`payMinerFee`), so an heir with an empty wallet, or a stranger, can press the button.

## On mainnet

Real transactions, made with [`scripts/lifecycle.ts`](scripts/lifecycle.ts) and [`scripts/press.ts`](scripts/press.ts)
(every one is in [`deployments/mainnet.jsonl`](deployments/mainnet.jsonl)). The demo vaults use `silence = grace = 1`
block so a whole life fits in half an hour.

**Vault 1: the heirs are paid.** 40,000 sat, heir A 60 %, heir B 40 %.

| Step | Transaction |
| --- | --- |
| Deploy | [`3a60fdfa…`](https://explorer.salemkode.com/tx/3a60fdfad7377b44522af66a64d3e75767d3f27931c393f204f1a2705d5a275b) |
| Owner checks in | [`137a5b9b…`](https://explorer.salemkode.com/tx/137a5b9b2a9ff7355f74955bf6c6d6841971e3b2b10e9d350314c653f84dd177) |
| Warning, sent with **no key and no coin** | [`4096ea27…`](https://explorer.salemkode.com/tx/4096ea27fd0c608f0e0496a78f24aa42ca2fb59b95ffb16f4701f0d903fca006) |
| Release, sent with no key and no coin: heir A gets 16,800 sat, heir B 11,200 | [`4432d352…`](https://explorer.salemkode.com/tx/4432d3521b4cd30abcd21d6e8b8d017625e27ec53c93aed37e5ca3c9cbba4e15) |

**Vault 4: warned, ready to release.** 40,000 sat, deployed [`1732e944…`](https://explorer.salemkode.com/tx/1732e944bff010373b7636c650cde2a162fdc6fc7250ac454bbbffaeda3e027f),
owner checked in [`34ad7c04…`](https://explorer.salemkode.com/tx/34ad7c04e26762dba45bc659d510b1acb581affedd2df3e7ea7cfd06fcd0b4a3),
warning sent by nobody [`539c0f39…`](https://explorer.salemkode.com/tx/539c0f394866d874b925a30eeffb1c0c612363e4558c0941013a45363bc0c0b9).
Press Release on the [demo page](https://mythos-builds.github.io/next-of-kin/) and watch the heirs get paid.

**Vaults 5 and 6: watching, like vault 3.** 40,000 sat each: vault 5 deployed [`e3406db4…`](https://explorer.salemkode.com/tx/e3406db45162d70656e5384847c034819fe8f3d5046c3edb50bb62198e8bb51f)
and checked in [`907cfda2…`](https://explorer.salemkode.com/tx/907cfda2ff13a36085b2db6731cdd3229c8c23af47e2238f136ec80f8753151b), vault 6 deployed
[`67bc27e1…`](https://explorer.salemkode.com/tx/67bc27e1633075196b0c5b025f234008b26da7c6d8080825d7da092d3cf20f55) and checked in
[`7aa24184…`](https://explorer.salemkode.com/tx/7aa24184d92e6bd674e9355519de3a3ce8c579dfb0d77207f9623a408520d6c5).

**Vault 3: yours to press.** 40,000 sat, deployed [`0c963454…`](https://explorer.salemkode.com/tx/0c963454ec140ffe398a7542a6a821696e73acfa01b529c44d6dc0fd94096313),
owner checked in [`b447caaa…`](https://explorer.salemkode.com/tx/b447caaa026abe971e94067cb5f05c9be1e7174d7a62fb309a2537d30726c5bf),
then left alone. Open the [demo page](https://mythos-builds.github.io/next-of-kin/) and press the buttons.

**Vault 2: the owner closes it.** 20,000 sat.

| Step | Transaction |
| --- | --- |
| Deploy | [`0a9a3650…`](https://explorer.salemkode.com/tx/0a9a3650ca97d11b6848b4c4d3e7c0d47ef521eeda45673404d258b455a6f3c6) |
| Owner checks in | [`0675e78e…`](https://explorer.salemkode.com/tx/0675e78e1f7916fae5d0b3477070d4a72a41987c08e585c887efa63456bc4851) |
| Owner closes it, seconds after the check-in (18,863 sat back) | [`7036aeec…`](https://explorer.salemkode.com/tx/7036aeec196748be4062a48f2c31bdccf057ab0febbb7573de9eaccff82fc96c) |

## The contract

[`contracts/NextOfKin.scash`](contracts/NextOfKin.scash), about 70 lines. What it uses:

- **State in the coin**: `Phase phase` (an `enum`: Watching, Warned, Released) and `int checkIns`, kept in NFT
  commitments and checked by the covenant on every call.
- **A relative timelock as a clock**: `require(this.age >= silence)`, the age of the state coin itself.
- **Covenant payouts**: `this.transfer(new LockingBytecodeP2PKH(heirA), toA)` twice, with the amounts computed on
  chain from `this.balance`; `this.payMinerFee(MINER_FEE)` so the vault pays for permissionless calls.
- **Solidity ergonomics**: a `modifier onlyOwner(sig s)`, custom errors (`NotOwner()`, `WrongPhase(Phase)`, an enum
  as an error argument), `require` messages, events (`CheckedIn(int)`, `Warned()`, `Released(int, int)`), constants.
- **End of life**: `close` is a `selfdestruct` entry guarded by the owner's signature; the signature covers every
  output, so it also pins where the coins go.

## Tests

```sh
./scripts/install.sh      # npm ci (see "Found while building", F1), then applies vendor/pr4-overlay
npx solidhat test         # 15 tests, solidhat on its mock network
```

- the clock: a warning is refused one block early and accepted on the block; the grace period counts from the
  warning, however long the owner was silent before; a check-in cancels a warning and restarts the silence
- the release: exact shares to each heir; a stranger can warn and release and pays nothing; it cannot run twice on
  the same coins
- the covenant itself, not the SDK: a real release transaction is stopped at the broadcast, edited, and sent raw. Moving
  5,000 sat from heir B to heir A is refused (`mandatory-script-verify-flag-failed`); so is skimming 800 sat into a
  third output. The untouched transaction is then accepted, so the refusal is about the edit.
- the owner: only the owner can check in or close; the owner can close right after a check-in

## What it costs

Sizes measured on the mock network with the real VM (`COSTS_OUT=… npx solidhat test test/costs.test.ts`):

| Call | Size | Who pays |
| --- | --- | --- |
| Deploy | 646 B | owner |
| Check in | 3,613 B | owner (fee + a 1,200 sat event coin) |
| Warn | 3,722 B | the vault: 5,500 sat (fee + event coin) |
| Release | 3,797 B | the vault: 5,500 sat |
| Close | 3,537 B | the owner's coins in the vault |

At 1 sat/byte a call costs about 0.00005 BCH.

## Limits, honestly

- **`this.age` needs upstream PR #4.** In SolidCash 0.51.1 a stateful call cannot set its state coin's nSequence, so
  a `this.age` check cannot pass. [PR #4](https://github.com/solidcash/solidcash/pull/4) (not ours) fixes it; until it is
  released, `npm install` overlays it ([`scripts/apply-pr4.mjs`](scripts/apply-pr4.mjs), the transpiled files in
  [`vendor/pr4-overlay`](vendor/pr4-overlay)). Calls then take `.setSequence(blocks)`.
- **A little dust stays behind.** A call can never empty the vault's coin, so 1,000 sat stay in it after a release,
  next to the two 1,200 sat state coins: about 3,400 sat, less than a close would cost. Each event also leaves a
  1,200 sat coin that anyone may sweep after 144 blocks.
- **The fee is a constant.** The vault pays 5,500 sat per warning or release, whatever the network asks; a
  transaction builder of the caller's own could keep the few hundred sat the miner does not need.
- **Release pays shares of the vault coin it spends.** If value is left in the vault afterwards (more than the 1,000
  sat it keeps), release can run again, by the same shares.
- **It is a demo.** No audit; the demo vaults' heirs are our own keys. Do not put savings in it.

## Found while building

The bounty asks builders to report and fix what they hit. Status in [`UPSTREAM.md`](UPSTREAM.md).

| # | What we hit | Here |
| --- | --- | --- |
| F1 | `npm create @solidcash/solidhat` fails without a GitHub SSH key: the lockfile resolves the libauth fork as `git+ssh` | `scripts/install.sh` |
| F3 | `StatefulContract.selfdestructTo` adds every event NFT, unexpired ones too, so a destroy is non-BIP68-final for 144 blocks after any event; the docs say unexpired events should not block. **Fix: [PR #13](https://github.com/solidcash/solidcash/pull/13)** | [`lib/close.ts`](lib/close.ts) |
| F4 | A destination-pinned `selfdestruct(addr)` caps the fee below 2,000 sat, but our destroy transaction is over 3,500 bytes: no fee is both under the cap and over the relay minimum | the modifier form, owner-signed |
| F5 | A release with nothing left is refused by the SDK's transfer derivation ("exceeds satoshi container balance") before the `require` message can be reported | test accepts either |
| F7 | The mock's `mine(n)` counts from its own height, which auto-mined sends do not move: after k sends it adds n - k blocks | `mineBlocks()` in the tests |
| F8 | The genesis coin is chosen without counting `initialBalance`, so a deploy can pick a small vout-0 coin and fail with "Insufficient funding" while a big enough one exists. **Fix: [PR #11](https://github.com/solidcash/solidcash/pull/11)** | `fundingUtxo` named in `scripts/lifecycle.ts` |
| F9 | A call the vault pays for (`payMinerFee`) is refused for a caller with no coin at all ("without a token-free fee UTXO"); the docs say the caller needs no coin. **Fix: [PR #12](https://github.com/solidcash/solidcash/pull/12)** | keyless handle in `scripts/press.ts` |

## Credits

The idea comes from our "Silence Watch" entry to another hackathon (an EVM dead man's switch); this is a new contract,
new code. SolidCash by mainnet_pat and contributors; PR #4 by its author. MIT licence.

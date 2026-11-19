import {
  StatefulContract,
  getAnonymousEventNftAddress,
  getEventNftAddress,
  getEventNftContinuationAddress,
} from '@solidcash/solidcash/stateful';

// An event NFT can be spent only 144 blocks after it confirms (OP_CHECKSEQUENCEVERIFY in its covenant).
const EVENT_NFT_DELAY = 144;

type DestroyOptions = Parameters<typeof StatefulContract.selfdestructTo>[0];

/**
 * StatefulContract.selfdestructTo, minus the event NFTs that are still locked.
 *
 * The stock helper (0.51.1) adds every event NFT of the contract to the destroy transaction, so one event younger
 * than 144 blocks makes the whole transaction non-BIP68-final, and the owner cannot close the vault for a day after
 * any check-in. Its docs say unexpired events should not block destruction; this does what the docs say: young event
 * NFTs stay at their addresses, and anyone can clean them up once their delay is over. A provider lists a coin's
 * confirmation height as `blockHeight` (Electrum does); one that lists none, like the mock, keeps every event NFT out.
 * Upstream fix: https://github.com/solidcash/solidcash/pull/13
 */
export async function closeVault(options: DestroyOptions) {
  const { provider, contract } = options as any;
  const tip: number = await provider.getBlockHeight();
  const eventAddresses = new Set<string>();
  for (const ev of contract.inner.artifact.events ?? []) {
    eventAddresses.add(ev.anonymous
      ? getAnonymousEventNftAddress(contract.inner, contract.categoryId)
      : getEventNftAddress(contract.inner, contract.categoryId, ev.signature));
    eventAddresses.add(getEventNftContinuationAddress(contract.inner, contract.categoryId, ev.signature));
  }
  const spendable = (u: any) => (u.blockHeight ?? 0) > 0 && tip + 1 - u.blockHeight >= EVENT_NFT_DELAY;
  const view = new Proxy(provider, {
    get(target, prop) {
      if (prop === 'getUtxos') {
        return async (address: string) => {
          const utxos = await target.getUtxos(address);
          return eventAddresses.has(address) ? utxos.filter(spendable) : utxos;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return StatefulContract.selfdestructTo({ ...options, provider: view } as DestroyOptions);
}

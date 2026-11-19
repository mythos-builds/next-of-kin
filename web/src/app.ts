// The Next of Kin demo page: reads each mainnet vault straight from a BCH server and lets anyone press the buttons
// the contract leaves open to anyone (warn, release). No wallet, no key, no coin: the vault pays the network.
import { hexToBin } from '@bitauth/libauth';
import { StatefulContract } from '@solidcash/solidcash/stateful';
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import artifact from '../../artifacts/solidcash/NextOfKin.json';
import { stateDepth } from './depth';

type Vault = {
  vault: number; category: string; sats: string;
  args: { owner: string; heirA: string; heirB: string; shareA: number; silence: number; grace: number };
  addresses: { owner: string; heirA: string; heirB: string };
  history: { step: string; txid: string; at: string; by?: string }[];
};
type Live = { closed: true } | { closed: false; phase: number; checkIns: bigint; balance: bigint; depth: number };

const PHASES = ['Watching', 'Warned', 'Released'];
const STEP_NAMES: Record<string, string> = {
  deploy: 'Vault created', checkIn: 'Owner checked in', warn: 'Warning sounded', release: 'Released to the heirs',
  close: 'Owner closed the vault',
};
const SERVERS = [{ hostname: 'bch.imaginary.cash', port: 50004 }, { hostname: 'fulcrum.greyh.at', port: 50004 }];
const tx = (txid: string) => `https://explorer.salemkode.com/tx/${txid}`;
const $ = (sel: string, root: ParentNode = document) => root.querySelector(sel) as HTMLElement;

let provider: any;

async function connect() {
  for (const server of SERVERS) {
    try {
      const p = new (ElectrumNetworkProvider as any)('mainnet', { ...server, encrypted: true });
      await p.getBlockHeight();
      return p;
    } catch { /* next server */ }
  }
  throw new Error('No BCH server answered. Try again in a minute.');
}

function contract(v: Vault): any {
  const a = v.args;
  return StatefulContract.from(artifact as any,
    [hexToBin(a.owner), hexToBin(a.heirA), hexToBin(a.heirB), BigInt(a.shareA), BigInt(a.silence), BigInt(a.grace)],
    { provider, addressType: 'p2sh32' } as any, v.category);
}

async function read(v: Vault): Promise<Live> {
  const sc = contract(v);
  const coins = await provider.getUtxos(sc.tokenAddress);
  const master = coins.find((u: any) => u.token?.category === v.category && u.token?.nft?.capability === 'minting');
  if (!master) return { closed: true };
  const state = await sc.getState();
  const tip: number = await provider.getBlockHeight();
  const depth = stateDepth(master, tip);
  return { closed: false, phase: Number(state.phase), checkIns: BigInt(state.checkIns), balance: BigInt(await sc.satoshiContainer.getBalance()), depth };
}

function el(tag: string, attrs: Record<string, string> = {}, text = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
}

function historyList(v: Vault, extra: { step: string; txid: string }[]) {
  const ol = el('ol', { class: 'history' });
  for (const h of [...v.history, ...extra]) {
    const li = el('li');
    li.append(el('span', {}, STEP_NAMES[h.step] ?? h.step), ' ');
    const a = el('a', { href: tx(h.txid), target: '_blank', rel: 'noopener' }, `${h.txid.slice(0, 8)}…`);
    li.append(a);
    if (h.by) li.append(el('small', {}, ` by ${h.by}`));
    ol.append(li);
  }
  return ol;
}

const pressed = new Map<number, { step: string; txid: string }[]>();

async function render(v: Vault, card: HTMLElement) {
  const live = await read(v);
  card.replaceChildren();
  const head = el('div', { class: 'head' });
  head.append(el('h3', {}, `Vault ${v.vault}`));
  const status = live.closed ? 'Closed' : PHASES[live.phase];
  head.append(el('span', { class: `badge ${status.toLowerCase()}` }, status));
  card.append(head);

  const facts = el('dl');
  const fact = (k: string, val: string) => { facts.append(el('dt', {}, k), el('dd', {}, val)); };
  fact('Heirs', `A ${v.args.shareA} % · B ${100 - v.args.shareA} %`);
  fact('Clock', `silence ${v.args.silence} block · grace ${v.args.grace} block`);
  if (!live.closed) {
    fact('In the vault', `${live.balance.toLocaleString('en')} sat`);
    fact('Check-ins', String(live.checkIns));
    fact('State coin', live.depth > 0 ? `a spend now would be ${live.depth} block${live.depth > 1 ? 's' : ''} after it` : 'not in a block yet');
  }
  card.append(facts);

  if (!live.closed) {
    const actions = el('div', { class: 'actions' });
    const canWarn = live.phase === 0 && live.depth >= v.args.silence;
    const canRelease = live.phase !== 0 && live.depth >= v.args.grace && live.balance > 7_500n;
    const button = (label: string, action: 'warn' | 'release', enabled: boolean, why: string) => {
      const b = el('button', { type: 'button' }, label) as HTMLButtonElement;
      b.disabled = !enabled;
      if (!enabled) b.title = why;
      b.addEventListener('click', async () => {
        b.disabled = true;
        b.textContent = 'Sending…';
        try {
          const sent = await contract(v).call[action]().setSequence(action === 'warn' ? v.args.silence : v.args.grace).send();
          pressed.set(v.vault, [...(pressed.get(v.vault) ?? []), { step: action, txid: sent.txid }]);
          note(card, `Sent: ${sent.txid}`, tx(sent.txid));
          setTimeout(() => render(v, card).catch(() => {}), 4000);
        } catch (e: any) {
          note(card, friendly(String(e?.message ?? e)));
          b.textContent = label;
        }
      });
      actions.append(b);
    };
    button('Sound the warning', 'warn', canWarn,
      live.phase !== 0 ? 'A warning was already given.' : 'The owner was seen recently: wait for the silence to pass.');
    button('Release to the heirs', 'release', canRelease,
      live.phase === 0 ? 'No warning yet.' : live.balance <= 7_500n ? 'Nothing left to release.' : 'The grace period is not over.');
    card.append(actions);
    if (!canWarn && !canRelease) {
      const hint = live.phase === 0
        ? `The owner was seen recently. The warning opens ${v.args.silence} block after the last check-in is in a block.`
        : live.balance <= 7_500n
          ? 'Released. What is left only keeps the state coins alive.'
          : `The release opens ${v.args.grace} block after the warning is in a block. Blocks come about every 10 minutes.`;
      card.append(el('p', { class: 'hint' }, hint));
    }
  }
  card.append(historyList(v, pressed.get(v.vault) ?? []));
}

function friendly(message: string) {
  if (/BIP68/i.test(message)) return 'Not yet: the network wants the vault\'s state coin to be older. Try again after the next block (about 10 minutes).';
  if (/txn-mempool-conflict|missing|spent/i.test(message)) return 'Someone else just pressed it. Reload in a moment.';
  return `The network refused it: ${message.slice(0, 200)}`;
}

function note(card: HTMLElement, text: string, href?: string) {
  const p = el('p', { class: 'note', role: 'status' });
  if (href) p.append(el('a', { href, target: '_blank', rel: 'noopener' }, text)); else p.textContent = text;
  card.append(p);
}

async function main() {
  const box = $('#vaults');
  try {
    const data = await (await fetch('vaults.json', { cache: 'no-store' })).json();
    provider = await connect();
    $('#server').textContent = 'Read live from BCH mainnet.';
    box.replaceChildren();
    const vaults: Vault[] = [...data.vaults].sort((a: Vault, b: Vault) => b.vault - a.vault);
    for (const v of vaults) {
      const card = el('article', { class: 'vault' });
      card.append(el('p', {}, 'Reading…'));
      box.append(card);
      render(v, card).catch((e) => { card.replaceChildren(el('p', {}, `Vault ${v.vault}: ${String(e?.message ?? e)}`)); });
      setInterval(() => render(v, card).catch(() => {}), 60_000);
    }
  } catch (e: any) {
    box.replaceChildren(el('p', {}, String(e?.message ?? e)));
  }
}

main();

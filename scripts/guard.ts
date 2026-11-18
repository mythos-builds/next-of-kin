import { network } from '@solidcash/solidhat/hardhat3';

/** On a live network, refuse to run unless a phrase was given: the fallback is a public test phrase. */
export function requirePhrase() {
  const name = network.name;
  if (name === 'mock') return;
  const key = `SOLIDCASH_MNEMONIC_${name.toUpperCase()}`;
  if (!process.env[key] && !process.env[`${key}_FILE`]) {
    throw new Error(`${name}: set ${key} or ${key}_FILE (the default phrase is public, coins sent to it are anyone's)`);
  }
}

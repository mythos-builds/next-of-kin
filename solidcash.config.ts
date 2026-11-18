import { readFileSync } from 'node:fs';
import { defineConfig } from '@solidcash/solidhat/config';

// A live network's phrase comes from the environment, or from a file named there, never from this repository.
const phrase = (name: string) =>
  process.env[name] ?? (process.env[`${name}_FILE`] ? readFileSync(process.env[`${name}_FILE`]!, 'utf8').trim() : undefined);

export default defineConfig({
  paths: {
    contracts: 'contracts',
    artifacts: 'artifacts',
    tests: 'test',
  },
  compiler: { evmCompat: false },
  typegen: {
    targets: [{ target: 'ethers6', layout: 'typechain', outDir: 'typechain-types' }],
  },
  mnemonic: process.env.SOLIDCASH_MNEMONIC,
  // BCH's own branch (m/44'/145'/0'/0), so a phrase made here opens in an ordinary BCH wallet.
  accounts: { count: 4, satoshis: 100_000_000n, path: "m/44'/145'/0'/0" },
  networks: {
    mock: { type: 'mock' },
    regtest: {
      type: 'regtest',
      rpc: {
        url: process.env.REGTEST_RPC_URL ?? 'http://127.0.0.1:18443',
        user: process.env.REGTEST_RPC_USER ?? 'user',
        password: process.env.REGTEST_RPC_PASSWORD ?? 'password',
      },
    },
    chipnet: { type: 'electrum', network: 'chipnet', mnemonic: phrase('SOLIDCASH_MNEMONIC_CHIPNET') },
    mainnet: { type: 'electrum', network: 'mainnet', mnemonic: phrase('SOLIDCASH_MNEMONIC_MAINNET') },
  },
  defaultNetwork: 'mock',
});

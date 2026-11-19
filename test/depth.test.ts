import { readFileSync } from 'node:fs';
import { stateDepth } from '../web/src/depth';

// The demo page decides from this depth whether « Sound the warning » and « Release to the heirs » are open.
describe('demo page: state coin depth', () => {
  it('counts from the block the provider lists as blockHeight', () => {
    expect(stateDepth({ blockHeight: 950_000 }, 950_010)).toBe(11);
  });

  it('a coin not in a block yet has depth 0', () => {
    expect(stateDepth({ blockHeight: 0 }, 950_010)).toBe(0);
    expect(stateDepth({}, 950_010)).toBe(0);
  });

  it('the SDK provider really names the field blockHeight (the page read `height` and every vault looked new)', () => {
    const src = readFileSync(new URL('../node_modules/@solidcash/solidcash/dist/network/ElectrumNetworkProvider.js', import.meta.url), 'utf8');
    expect(src).toMatch(/blockHeight:\s*utxo\.height/);
  });
});

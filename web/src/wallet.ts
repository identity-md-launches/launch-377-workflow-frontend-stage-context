import type { Config, Provider } from './config';
import type { Address } from 'viem';
export function message(error: unknown): string {
  const e = error as { code?: number; shortMessage?: string; message?: string; cause?: unknown };
  if (e?.code === 4001 || /rejected|denied/i.test(e?.shortMessage ?? e?.message ?? '')) return 'Request declined in your wallet. Nothing was submitted; you can try again.';
  return e?.shortMessage ?? e?.message ?? 'Unable to complete the request. Check your connection and try again.';
}
export async function switchChain(provider: Provider, c: Config) {
  try { await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: c.manifest.walletAddChain.chainId }] }); }
  catch (error) {
    const e = error as { code?: number; message?: string; data?: { originalError?: { code?: number } } };
    if (e.code !== 4902 && e.data?.originalError?.code !== 4902 && !/unknown chain|unrecognized chain|chain.*not.*added/i.test(e.message ?? '')) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [c.manifest.walletAddChain] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: c.manifest.walletAddChain.chainId }] });
  }
}
export async function assertWallet(provider: Provider, account: Address, chainId: number) {
  const [accounts, chain] = await Promise.all([
    provider.request({ method: 'eth_accounts' }) as Promise<Address[]>,
    provider.request({ method: 'eth_chainId' }),
  ]);
  if (Number(chain) !== chainId || accounts[0]?.toLowerCase() !== account.toLowerCase()) throw Error('Wallet account or network changed. Review the page and try again.');
}

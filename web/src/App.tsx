import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, type Address, type Hex } from 'viem';
import { loadConfig, publicClient, type Config } from './config';
import { contractTx, readActivity, readSnapshot, sendTransaction, verifyDeployment, type Activity, type Snapshot, type Transaction } from './chain';
import { amountInput, buildMint, type MintPreview } from './mint';
import { message, switchChain } from './wallet';

export function amount(value: bigint, decimals = 18) {
  const exact = formatUnits(value, decimals);
  const n = Number(exact);
  if (n > 0 && n < 0.000001) return '<0.000001';
  return new Intl.NumberFormat('en', { maximumFractionDigits: 6 }).format(n);
}
const short = (s: string) => `${s.slice(0, 8)}…${s.slice(-6)}`;
function Mark() { return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 27V13M16 20C5 20 4 13 4 8c8 0 12 3 12 12ZM16 14C16 5 22 3 28 3c0 7-4 11-12 11Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>; }
function Metric({ label, value, unit, exact }: { label: string; value: string; unit: string; exact?: string }) {
  return <div className="metric"><dt>{label}</dt><dd>{value}<span>{unit}</span>{exact && <details className="metric-exact"><summary>Exact total</summary><code>{exact}</code></details>}</dd></div>;
}
const liquidity = (value: bigint) => new Intl.NumberFormat('en', { notation: value > 999999999n ? 'scientific' : 'standard', maximumFractionDigits: 3 }).format(value);
function External({ href, children }: { href: string; children: React.ReactNode }) { return <a href={href} target="_blank" rel="noreferrer">{children}<span aria-hidden="true"> ↗</span></a>; }

export default function App() {
  const [config, setConfig] = useState<Config>();
  const [error, setError] = useState('');
  useEffect(() => { loadConfig().then(setConfig).catch(e => setError(message(e))); }, []);
  if (!config) return <main className="boot"><Mark /><h1>Farm</h1><p role={error ? 'alert' : 'status'}>{error || 'Loading verified deployment configuration…'}</p>{error && <button onClick={() => window.location.reload()}>Reload configuration</button>}</main>;
  return <Farm config={config} />;
}
function Farm({ config: c }: { config: Config }) {
  const [account, setAccount] = useState<Address>();
  const [walletChain, setWalletChain] = useState<number>();
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletEpoch, setWalletEpoch] = useState(0);
  const [walletError, setWalletError] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [readError, setReadError] = useState('');
  const [verified, setVerified] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [eventError, setEventError] = useState('');
  const [busy, setBusy] = useState(false);
  const [txStatus, setTxStatus] = useState('');
  const [txError, setTxError] = useState('');
  const [txHash, setTxHash] = useState<Hex>();
  const [fund, setFund] = useState('');
  const [fundError, setFundError] = useState('');
  const [eth, setEth] = useState('');
  const [farm, setFarm] = useState('');
  const [slippage, setSlippage] = useState(50);
  const [mintError, setMintError] = useState('');
  const [preview, setPreview] = useState<MintPreview>();
  const [now, setNow] = useState(Date.now());
  const session = useRef(0), request = useRef(0), acting = useRef(false);
  const fundInput = useRef<HTMLInputElement>(null), ethInput = useRef<HTMLInputElement>(null);
  const provider = window.ethereum;
  const correctChain = walletChain === c.manifest.chainId;
  const rpc = useMemo(() => publicClient(c, correctChain ? provider : undefined), [c, provider, correctChain]);
  const explorer = c.manifest.network.explorer;

  useEffect(() => {
    if (!provider) return;
    let mounted = true;
    const update = async () => {
      const id = ++session.current;
      setSnapshot(undefined); setVerified(false); setPreview(undefined); setPage(0);
      try {
        const [accounts, chain] = await Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]);
        if (mounted && id === session.current) { setAccount((accounts as Address[])[0]); setWalletChain(Number(chain)); setWalletEpoch(e => e + 1); }
      } catch (e) { if (mounted) setWalletError(message(e)); }
    };
    const change = () => { void update(); };
    provider.on?.('accountsChanged', change); provider.on?.('chainChanged', change); provider.on?.('disconnect', change);
    void update();
    return () => { mounted = false; provider.removeListener?.('accountsChanged', change); provider.removeListener?.('chainChanged', change); provider.removeListener?.('disconnect', change); };
  }, [provider]);

  const refresh = useCallback(async () => {
    const id = ++request.current, version = session.current;
    setRefreshing(true);
    try {
      await verifyDeployment(c, rpc);
      const s = await readSnapshot(c, rpc, account, page);
      if (id !== request.current || version !== session.current) return;
      setSnapshot(s); setVerified(true); setReadError(''); setNow(Date.now());
      try {
        const events = await readActivity(c, rpc, s.block);
        if (id === request.current && version === session.current) { setActivity(events); setEventError(''); }
      } catch (e) { if (id === request.current && version === session.current) { setActivity([]); setEventError(`Activity unavailable: ${message(e)}`); } }
    } catch (e) {
      if (id === request.current && version === session.current) { setVerified(false); setReadError(message(e)); }
    } finally { if (id === request.current) setRefreshing(false); }
  }, [c, rpc, account, page, walletEpoch]);
  useEffect(() => { void refresh(); const interval = setInterval(() => { setNow(Date.now()); if (!acting.current) void refresh(); }, 20000); return () => { clearInterval(interval); request.current++; }; }, [refresh]);

  const stale = !snapshot || now - snapshot.fetchedAt > 60000 || Math.abs(now / 1000 - Number(snapshot.timestamp)) > 300;
  const ready = !!account && correctChain && verified && !stale && !!snapshot?.sqrtPrice && !busy && !walletBusy;
  const reason = !account ? 'Connect your wallet to use these controls.' : !correctChain ? `Switch to ${c.manifest.network.name} to continue.` : !verified || stale ? 'Waiting for verified, current pool data. Refresh to retry.' : !snapshot?.sqrtPrice ? 'The pool is not initialized; actions are unavailable.' : '';

  async function connect() {
    setWalletError(''); setWalletBusy(true);
    try {
      if (!provider) throw Error('No browser wallet detected. Open this page in an Ethereum wallet browser or enable a browser wallet extension, then reload.');
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as Address[];
      const chain = await provider.request({ method: 'eth_chainId' });
      ++session.current; setAccount(accounts[0]); setWalletChain(Number(chain)); setPreview(undefined); setSnapshot(undefined); setVerified(false); setWalletEpoch(e => e + 1);
      if (!accounts[0]) throw Error('No wallet account was shared. Connect an account and try again.');
    } catch (e) { setWalletError(message(e)); } finally { setWalletBusy(false); }
  }
  async function switchNetwork() {
    if (!provider) return;
    setWalletBusy(true); setWalletError('');
    try { await switchChain(provider, c); setWalletChain(Number(await provider.request({ method: 'eth_chainId' }))); }
    catch (e) { setWalletError(message(e)); } finally { setWalletBusy(false); }
  }
  async function run(label: string, tx: Transaction) {
    if (!ready || !provider || !account || acting.current) return;
    const version = session.current;
    acting.current = true; setBusy(true); setTxError(''); setTxHash(undefined); setTxStatus(`${label}: preparing…`);
    try {
      await sendTransaction(c, rpc, provider, account, tx, (text, hash) => { setTxStatus(`${label}: ${text}`); if (hash) setTxHash(hash); }, () => session.current === version);
      await refresh();
      setTxStatus(`${label} confirmed.`);
    } catch (e) { setTxError(message(e)); setTxStatus(`${label} did not complete.`); }
    finally { acting.current = false; setBusy(false); }
  }
  function funding(approve: boolean) {
    if (!snapshot || !ready) return;
    try {
      const amount = amountInput(fund, snapshot.decimals, true);
      if (amount > snapshot.balance) throw Error('Insufficient FARMX. Enter an amount within your wallet balance.');
      if (!approve && amount > snapshot.hookAllowance) throw Error('Approve FARMX for the reward hook first.');
      setFundError('');
      void run(approve ? 'Approve funding' : 'Fund stream', approve ? contractTx(c.token.address, c.token.abi, 'approve', [c.hook.address, amount]) : contractTx(c.hook.address, c.hook.abi, 'fund', [c.poolKey, amount]));
    } catch (e) { setFundError(message(e)); fundInput.current?.focus(); }
  }
  let needsFundApproval = false;
  try { needsFundApproval = !!snapshot && amountInput(fund, snapshot.decimals, true) > snapshot.hookAllowance; } catch { /* Validate explicitly on submission. */ }
  const previewValid = !!preview && now / 1000 < preview.deadline - 60;
  const tokenApproved = !!snapshot && !!preview && snapshot.tokenAllowance >= preview.max1;
  const permitApproved = !!snapshot && !!preview && snapshot.permitAmount >= preview.max1 && snapshot.permitExpiration >= preview.deadline;
  function previewMint(event: React.FormEvent) {
    event.preventDefault();
    if (!snapshot || !account || !ready) return;
    try { setPreview(buildMint(c, snapshot, account, eth, farm, slippage)); setMintError(''); }
    catch (e) { setPreview(undefined); setMintError(message(e)); ethInput.current?.focus(); }
  }
  function mintStep(step: number) {
    if (!preview || !previewValid || !snapshot || !ready) return;
    if (step === 1) void run('Approve FARMX for Permit2', contractTx(c.token.address, c.token.abi, 'approve', [c.addresses.permit2, preview.max1]));
    if (step === 2 && tokenApproved) void run('Allow PositionManager', contractTx(c.addresses.permit2, c.abis.Permit2, 'approve', [c.token.address, c.addresses.positionManager, preview.max1, preview.deadline]));
    if (step === 3 && tokenApproved && permitApproved) void run('Mint full-range position', { to: c.addresses.positionManager, abi: c.abis.PositionManager, data: preview.data, value: preview.value });
  }
  const streamActive = !!snapshot && snapshot.end > snapshot.timestamp && snapshot.rate > 0n;
  return <>
    <a className="skip" href="#main">Skip to content</a>
    <header className="header wrap">
      <a className="brand" href="#main" aria-label="Farm home"><Mark /><span>Farm<span className="brand-caption">Liquidity lab</span></span></a>
      <div className="wallet"><span className="pill">{c.manifest.network.name} · testnet</span>
        {account ? <><External href={`${explorer}/address/${account}`}>{short(account)}</External><button className="quiet" disabled={busy || walletBusy} onClick={() => { ++session.current; setAccount(undefined); setPreview(undefined); setSnapshot(undefined); setVerified(false); }}>Disconnect</button></> : <button className="primary" disabled={walletBusy} onClick={() => void connect()}>{walletBusy ? 'Connecting…' : 'Connect wallet'}</button>}
      </div>
    </header>
    <main id="main" className="wrap" tabIndex={-1}>
      <section className="intro" aria-labelledby="title"><div><p className="eyebrow">ETH / FARMX · Uniswap v4</p><h1 id="title">The reward stream.</h1><p className="intro-copy">Fund the pool. Add full-range liquidity. Claim your share of a 30-day FARMX stream.</p></div><div className="test-note"><span className="note-mark" aria-hidden="true">✳</span><p><strong>A Sepolia experiment.</strong><br />FARMX and its reward pots have no value. Nothing here promises a return.</p></div></section>
      <div role="alert" className={walletError ? 'notice error' : 'empty-live'}>{walletError}</div>
      {account && !correctChain && <div className="notice network"><p>Your wallet is on chain {walletChain ?? 'unknown'}. This pool uses {c.manifest.network.name}.</p><button disabled={walletBusy || busy} onClick={() => void switchNetwork()}>{walletBusy ? 'Switching…' : `Switch to ${c.manifest.network.name}`}</button></div>}
      <section className="stream" aria-labelledby="stream-title">
        <div className="section-head"><div><p className="eyebrow">Pool overview</p><h2 id="stream-title">A stream shared by liquidity</h2></div><span className="pill">{!snapshot ? 'Loading state' : !verified || stale ? 'Data unavailable or stale' : streamActive ? 'Stream active' : 'Stream inactive'}</span></div>
        <dl className="metrics">
          <Metric label="Reward rate" value={snapshot ? amount(streamActive ? snapshot.rate : 0n, snapshot.decimals) : '—'} unit="FARMX / second" />
          <Metric label="Period ends" value={snapshot?.end ? new Date(Number(snapshot.end) * 1000).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : snapshot ? 'Not funded' : '—'} unit={snapshot?.end ? `${new Date(Number(snapshot.end) * 1000).toISOString().slice(11, 16)} UTC` : '30-day funding periods'} />
          <Metric label="Total staked" value={snapshot ? liquidity(snapshot.totalStaked) : '—'} unit="liquidity units · all ranges" exact={snapshot && snapshot.totalStaked > 999999999n ? snapshot.totalStaked.toLocaleString('en') : undefined} />
        </dl>
        <div className="stream-foot"><span>{snapshot ? `${amount(snapshot.idle, snapshot.decimals)} FARMX idle · ${amount(snapshot.remaining, snapshot.decimals)} FARMX left to stream` : 'Reading the reward hook and StateView…'}</span><button className="quiet" disabled={refreshing || busy} onClick={() => void refresh()}>{refreshing ? 'Refreshing…' : 'Refresh state'}</button></div>
      </section>
      <div className="read-status"><p>{snapshot ? <>Read at <External href={`${explorer}/block/${snapshot.block}`}>block {snapshot.block.toString()}</External> · pool tick {snapshot.tick} · active liquidity {snapshot.poolLiquidity.toLocaleString('en')}</> : 'Live reads use the configured public RPCs.'}</p><span>{verified && !stale ? 'Contract code & bindings checked' : 'Verification pending'}</span></div>
      <div role="alert" className={readError ? 'notice error' : 'empty-live'}>{readError && `${readError} Use “Refresh state” to retry.`}</div>
      <div className="transaction-status" aria-live="polite" role="status">{txStatus}{txHash && <> <External href={`${explorer}/tx/${txHash}`}>View transaction</External></>}</div>
      <div role="alert" className={txError ? 'notice error' : 'empty-live'}>{txError}</div>
      {reason && <p className="action-reason">{reason}</p>}

      <div className="forms">
        <section className="panel mint" id="mint" aria-labelledby="mint-title"><p className="eyebrow">01 / Add liquidity</p><h2 id="mint-title">Mint a full-range position</h2><p>Pair ETH with FARMX. Your wallet receives the position NFT and becomes its permanent reward beneficiary.</p>
          <form onSubmit={previewMint} noValidate><fieldset disabled={!ready}><legend className="sr-only">Mint budgets</legend><div className="field-row">
            <div className="field"><label htmlFor="eth">ETH budget</label><input id="eth" name="eth" ref={ethInput} inputMode="decimal" autoComplete="off" placeholder="0.01" value={eth} aria-invalid={!!mintError} aria-describedby="mint-help mint-error" onChange={e => { setEth(e.target.value); setPreview(undefined); setMintError(''); }} /></div>
            <div className="field"><label htmlFor="farm">FARMX budget</label><input id="farm" name="farmx" inputMode="decimal" autoComplete="off" placeholder="0.01" value={farm} aria-invalid={!!mintError} aria-describedby="mint-help mint-error" onChange={e => { setFarm(e.target.value); setPreview(undefined); setMintError(''); }} /></div>
          </div><p className="hint" id="mint-help">Maximum spend budgets. Leave ETH for gas; unused ETH is returned.</p>
          <div className="mint-options"><div><label htmlFor="slippage">Price slippage</label><select id="slippage" value={slippage} onChange={e => { setSlippage(Number(e.target.value)); setPreview(undefined); }}><option value={10}>0.1%</option><option value={50}>0.5%</option><option value={100}>1.0%</option></select></div><div><span className="label">Fixed tick range</span><span className="range">−887220 → 887220</span></div></div>
          <p className="field-error" id="mint-error" role="alert">{mintError}</p><button className={account ? 'primary wide' : 'wide'} type="submit">Preview position</button></fieldset></form>
          {preview && <div className="preview"><h3>Review your position</h3><dl><div><dt>Maximum ETH</dt><dd>{formatUnits(preview.max0, c.manifest.network.nativeCurrency.decimals)}</dd></div><div><dt>Maximum FARMX</dt><dd>{formatUnits(preview.max1, snapshot!.decimals)}</dd></div><div><dt>Pool price</dt><dd>1 ETH ≈ {preview.price} FARMX</dd></div><div><dt>Liquidity</dt><dd>{preview.liquidity}</dd></div><div><dt>NFT & reward recipient</dt><dd className="address">{account}</dd></div></dl><p className="hint">Limits include {slippage / 100}% slippage. Expires {new Date(preview.deadline * 1000).toLocaleTimeString()}. Permit2 permission expires with this preview.</p>
            <ol className="steps"><li><button disabled={!ready || !previewValid || tokenApproved} onClick={() => mintStep(1)}>{tokenApproved ? '1. FARMX approved for Permit2' : '1. Approve FARMX for Permit2'}</button></li><li><button disabled={!ready || !previewValid || !tokenApproved || permitApproved} onClick={() => mintStep(2)}>{permitApproved ? '2. PositionManager allowed' : '2. Allow PositionManager'}</button></li><li><button disabled={!ready || !previewValid || !tokenApproved || !permitApproved} onClick={() => mintStep(3)}>3. Mint position</button></li></ol>{!previewValid && <p role="status">Preview expired. Preview the position again to refresh its limits.</p>}</div>}
          <p className="fine-print">Out-of-range liquidity earns at the same rate per liquidity unit. NFT transfers do not transfer reward rights.</p>
        </section>
        <section className="panel fund" aria-labelledby="fund-title"><p className="eyebrow">02 / Fund rewards</p><h2 id="fund-title">Top up the stream</h2><p>Anyone can contribute FARMX. Funding combines your contribution, remaining rewards, and idle tokens into a new 30-day stream.</p>
          <form onSubmit={e => { e.preventDefault(); funding(false); }} noValidate><fieldset disabled={!ready}><legend className="sr-only">Fund the reward stream</legend><div className="field"><label htmlFor="fund">FARMX contribution</label><input id="fund" name="contribution" ref={fundInput} inputMode="decimal" autoComplete="off" placeholder="100" value={fund} aria-invalid={!!fundError} aria-describedby="fund-help fund-error" onChange={e => { setFund(e.target.value); setFundError(''); }} /></div><p className="hint" id="fund-help">{account && snapshot ? `Wallet balance: ${amount(snapshot.balance, snapshot.decimals)} FARMX.` : 'Your FARMX balance appears after connection.'} Enter 0 to restart remaining and idle rewards without an approval.</p><p className="field-error" role="alert" id="fund-error">{fundError}</p><div className="fund-buttons"><button type="button" disabled={!needsFundApproval} onClick={() => funding(true)}>1. Approve FARMX for funding</button><button type="submit" disabled={needsFundApproval}>2. Fund stream</button></div></fieldset></form>
          <div className="fund-note"><h3>Shared by time and liquidity</h3><p>Rewards are split by enrolled liquidity-seconds. If nobody is staked, emissions become idle until the next funding call.</p></div><p className="fine-print">Funding is a contribution to the shared reward pool. It cannot be withdrawn by the funder.</p>
        </section>
      </div>

      <section className="positions" aria-labelledby="positions-title"><div className="section-head"><div><p className="eyebrow">03 / Claim rewards</p><h2 id="positions-title">Your reward positions</h2></div><span className="pill">{account && snapshot ? `${snapshot.positionCount} enrolled keys` : 'Wallet required'}</span></div>
        <p className="section-description">Positions assigned to your wallet as beneficiary, including transferred or withdrawn NFTs. Liquidity is read through StateView.</p>
        {!account ? <div className="empty-state"><Mark /><div><h3>Your positions belong here</h3><p>Connect your wallet to see enrolled liquidity and claimable FARMX.</p></div></div> : !snapshot ? <p role="status">Loading your reward positions…</p> : snapshot.positions.length === 0 ? <div className="empty-state"><Mark /><div><h3>No positions for this pool on this page</h3><p>Mint a full-range position above to enroll your liquidity.</p></div></div> : <ul className="position-list">{snapshot.positions.map(p => <li key={p.key}><div><h3>Position {short(p.key)}</h3><details><summary>View position key</summary><code>{p.key}</code></details><p className="hint">Staked: {p.staked.toLocaleString('en')} · Position liquidity: {p.liquidity.toLocaleString('en')}</p></div><div className="claim"><strong title={formatUnits(p.earned, snapshot.decimals)}>{amount(p.earned, snapshot.decimals)} <span>FARMX earned</span></strong><button disabled={!ready || p.earned === 0n || p.beneficiary.toLowerCase() !== account.toLowerCase()} aria-label={`Claim rewards for ${short(p.key)}`} onClick={() => void run('Claim rewards', contractTx(c.hook.address, c.hook.abi, 'claim', [c.poolKey, p.key]))}>Claim rewards</button></div></li>)}</ul>}
        {snapshot && snapshot.positionCount > 10n && <div className="pagination"><button disabled={page === 0 || refreshing || busy} onClick={() => setPage(p => p - 1)}>Previous positions</button><span>Page {page + 1} · 10 enrolled keys per page</span><button disabled={BigInt((page + 1) * 10) >= snapshot.positionCount || refreshing || busy} onClick={() => setPage(p => p + 1)}>Next positions</button></div>}
      </section>
      <section className="activity" aria-labelledby="activity-title"><div className="section-head"><h2 id="activity-title">Recent pool activity</h2><span className="hint">Latest 2,000 blocks · up to 8 events</span></div>{eventError ? <p className="error-text">{eventError} Refresh state to retry.</p> : activity.length ? <ul>{activity.map(e => <li key={`${e.hash}-${e.index}`}><span className="event-name">{e.event}</span><span>{e.amount === undefined ? '' : e.event === 'Funded' || e.event === 'Claimed' ? `${amount(e.amount, snapshot?.decimals)} FARMX` : `${e.amount.toLocaleString('en')} liquidity units`}</span><External href={`${explorer}/tx/${e.hash}`}>Block {e.block.toString()}</External></li>)}</ul> : <p className="hint">{snapshot ? 'No hook events in the recent block window.' : 'Activity will appear when the pool data loads.'}</p>}</section>
      <details className="deployment"><summary>Deployment & contracts</summary><p>Runtime deployment loaded from <a href="./imd-deployment.json">imd-deployment.json</a>. Source commit <code>{c.manifest.sourceCommit}</code>.</p><dl>{[...c.manifest.contracts, ...(['poolManager', 'stateView', 'positionManager', 'permit2'] as const).map(name => ({ name, address: c.addresses[name] }))].map(x => <div key={x.name}><dt>{x.name}</dt><dd><External href={`${explorer}/address/${x.address}`}>{x.address}</External></dd></div>)}</dl><p>Pool ID <code>{c.poolId}</code> · fee {c.poolKey.fee / 10000}% · tick spacing {c.poolKey.tickSpacing}.</p><p>Contract code and bindings are checked before transactions. This is not an independent security audit.</p></details>
    </main>
    <footer className="wrap footer"><span>Farm <span className="muted">/ A liquidity experiment</span></span><span>{c.manifest.network.name} only · No token value · No promised return</span></footer>
  </>;
}

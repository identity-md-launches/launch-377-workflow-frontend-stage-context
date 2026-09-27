import { decodeFunctionData, encodeFunctionResult, encodeAbiParameters, encodeEventTopics, toHex, type Abi, type Hex, type Address } from 'viem';
import type { Page } from '@playwright/test';
import { config as c, account, snapshot, positionKey } from '../fixtures';

export async function installMock(page: Page, options: { wallet?: boolean; chain?: string; missingCode?: boolean; rpcFailure?: boolean; badAbi?: boolean; positions?: number } = {}) {
  const state = { hookAllowance: 0n, tokenAllowance: 0n, permitAmount: 0n, permitExpiration: 0, earned: 25n * 10n ** 18n,
    sent: [] as { to: Address; data: Hex; value?: Hex }[], methods: [] as string[], calls: [] as string[],
    reject: false, revertSimulation: false, receiptReverts: false, count: options.positions ?? 1 };
  const baseBlock = toHex(snapshot.block), blockHash = `0x${'cd'.repeat(32)}`, txHash = `0x${'ef'.repeat(32)}`;
  const abiFor = (address: string): Abi => {
    if (address.toLowerCase() === c.token.address) return c.token.abi;
    if (address.toLowerCase() === c.hook.address) return c.hook.abi;
    if (address.toLowerCase() === c.addresses.stateView) return c.abis.StateView;
    if (address.toLowerCase() === c.addresses.positionManager) return c.abis.PositionManager;
    if (address.toLowerCase() === c.addresses.permit2) return c.abis.Permit2;
    throw Error(`Unexpected address: ${address}`);
  };
  const logs = ['Staked', 'Unstaked', 'Funded', 'Claimed'].map((eventName, i) => ({
    address: c.hook.address, blockNumber: baseBlock, blockHash, transactionHash: txHash, transactionIndex: '0x0', logIndex: toHex(i), removed: false,
    topics: encodeEventTopics({ abi: c.hook.abi, eventName, args: eventName === 'Funded' ? { poolId: c.poolId, funder: account } : { poolId: c.poolId, positionKey, beneficiary: account } }),
    data: eventName === 'Funded' ? encodeAbiParameters([{type:'uint256'},{type:'uint256'},{type:'uint256'}], [100n * 10n ** 18n, snapshot.rate, snapshot.end]) : encodeAbiParameters([{type:'uint256'}], [10n ** 18n]),
  }));
  await page.route('https://**/*', async route => {
    const request = route.request();
    if (!c.manifest.network.rpcUrls.some(url => request.url().startsWith(url))) { await route.abort(); return; }
    if (request.method() === 'OPTIONS') { await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}}); return; }
    if (options.rpcFailure) { await route.fulfill({status:503,body:'RPC offline'}); return; }
    const handle = (body: {id: number; method: string; params: unknown[]}) => {
      state.calls.push(body.method);
      let result: unknown;
      const tx = body.params?.[0] as {to: Address; data: Hex};
      try {
        switch (body.method) {
          case 'eth_chainId': result = c.manifest.walletAddChain.chainId; break;
          case 'eth_getCode': result = options.missingCode && String(body.params[0]).toLowerCase() === c.addresses.positionManager ? '0x' : '0x60006000'; break;
          case 'eth_blockNumber': result = baseBlock; break;
          case 'eth_getBalance': result = toHex(snapshot.nativeBalance); break;
          case 'eth_getLogs': result = logs; break;
          case 'eth_getBlockByNumber': result = { number: baseBlock, hash: blockHash, timestamp: toHex(Math.floor(Date.now()/1000)), parentHash: blockHash, transactions: [], gasLimit:'0x1c9c380',gasUsed:'0x5208',baseFeePerGas:'0x1',miner:account,nonce:'0x0000000000000000',difficulty:'0x0',extraData:'0x',size:'0x100',uncles:[] }; break;
          case 'eth_getTransactionReceipt': result = {transactionHash:body.params[0],transactionIndex:'0x0',blockHash,blockNumber:baseBlock,from:account,to:state.sent.at(-1)?.to??c.hook.address,cumulativeGasUsed:'0x5208',gasUsed:'0x5208',effectiveGasPrice:'0x1',contractAddress:null,logs:[],logsBloom:`0x${'00'.repeat(256)}`,status:state.receiptReverts?'0x0':'0x1',type:'0x2'}; break;
          case 'eth_call': {
            const abi = abiFor(tx.to);
            const { functionName: fn, args } = decodeFunctionData({abi,data:tx.data});
            state.calls.push(fn);
            const values: Record<string, unknown> = { poolManager:c.addresses.poolManager, permit2:c.addresses.permit2,
              decimals:18, symbol:'FARMX', rewardRate:snapshot.rate, periodEnd:snapshot.end, totalStaked:snapshot.totalStaked,idle:snapshot.idle,unstreamed:snapshot.remaining,
              getSlot0:[snapshot.sqrtPrice,0,0,3000],getLiquidity:snapshot.poolLiquidity,balanceOf:snapshot.balance,
              positionCount:BigInt(state.count),positionAt:{poolId:c.poolId,positionKey:toHex(BigInt(positionKey)+(fn==='positionAt'?BigInt(args?.[1] as bigint ?? 0):0n),{size:32})},
              staked:10n**18n,earned:state.earned,beneficiaryOf:account,getPositionInfo:[10n**18n,0n,0n],
            };
            if(fn === 'allowance') {
              values.allowance = tx.to.toLowerCase() === c.addresses.permit2 ? [state.permitAmount,state.permitExpiration,0] : String(args?.[1]).toLowerCase() === c.hook.address ? state.hookAllowance : state.tokenAllowance;
            }
            if (['fund','approve','claim','multicall','modifyLiquidities'].includes(fn)) {
              if (state.revertSimulation) throw Error('Simulation rejected by mock contract');
              values.fund = 100n; values.claim = state.earned;
              values.approve = tx.to.toLowerCase() === c.token.address ? true : undefined;
              values.multicall = ['0x']; values.modifyLiquidities = undefined;
            }
            if (!(fn in values)) throw Error(`Unmocked function: ${fn}`);
            result = encodeFunctionResult({ abi, functionName:fn, result:values[fn] }); break;
          }
          default: throw Error(`Unmocked RPC ${body.method}`);
        }
        return {jsonrpc:'2.0',id:body.id,result};
      } catch(e) { return {jsonrpc:'2.0',id:body.id,error:{code:-32000,message:e instanceof Error?e.message:String(e)}}; }
    };
    const payload = request.postDataJSON();
    const response = Array.isArray(payload) ? payload.map(handle) : handle(payload);
    await route.fulfill({ json: response, headers:{'Access-Control-Allow-Origin':'*'} });
  });
  if (options.badAbi) await page.route('**/abi/FARMX.json', r => r.fulfill({json:[]}));
  await page.exposeFunction('__mockSend', (tx: {to: Address;data: Hex;value?: Hex}) => {
    if(state.reject) return {error:{code:4001,message:'User rejected transaction'}};
    state.sent.push(tx);
    const {functionName:fn,args} = decodeFunctionData({abi:abiFor(tx.to),data:tx.data});
    if(!state.receiptReverts) {
      if(fn === 'approve' && tx.to.toLowerCase() === c.token.address) {
        if(String(args![0]).toLowerCase() === c.hook.address) state.hookAllowance = args![1] as bigint;
        else state.tokenAllowance = args![1] as bigint;
      } else if(fn === 'approve') {state.permitAmount=args![2] as bigint;state.permitExpiration=Number(args![3]);}
      if(fn === 'claim') state.earned=0n;
    }
    return {hash:toHex(state.sent.length,{size:32})};
  });
  if (options.wallet !== false) await page.addInitScript(({account, chain}) => {
    const w = window as unknown as { ethereum: unknown; __wallet: unknown; __mockSend: (tx:unknown)=>Promise<{hash?:string;error?:{code:number;message:string}}> };
    const listeners: Record<string,((...args:unknown[])=>void)[]> = {};
    const state = { chain, connected:false, added:false, rejectConnection:false, calls:[] as {method:string;params?:unknown[]}[],
      emit(event:string,args:unknown) { (listeners[event]??[]).forEach(f=>f(args)); }, account };
    w.__wallet = state;
    w.ethereum = { on:(name:string,cb:(...args:unknown[])=>void)=>{(listeners[name]??=[]).push(cb);}, removeListener:(name:string,cb:unknown)=>{listeners[name]=(listeners[name]??[]).filter(f=>f!==cb);},
      request: async (arg:{method:string;params?:unknown[]}) => {
        state.calls.push(arg);
        switch(arg.method) {
          case 'eth_accounts': return state.connected ? [state.account] : [];
          case 'eth_chainId': return state.chain;
          case 'eth_requestAccounts': if(state.rejectConnection)throw {code:4001,message:'User rejected connection'}; state.connected=true; return [state.account];
          case 'wallet_switchEthereumChain': if(!state.added)throw {code:4902,message:'Unknown chain'}; state.chain=(arg.params![0] as {chainId:string}).chainId; state.emit('chainChanged',state.chain);return null;
          case 'wallet_addEthereumChain': state.added=true;return null;
          case 'eth_sendTransaction': { const r=await w.__mockSend(arg.params![0]); if(r.error)throw r.error; return r.hash; }
          default: throw Error(`Unmocked wallet method: ${arg.method}`);
        }
      } };
  }, { account, chain: options.chain ?? c.manifest.walletAddChain.chainId });
  return state;
}

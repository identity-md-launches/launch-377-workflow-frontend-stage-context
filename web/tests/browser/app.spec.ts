import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { decodeAbiParameters, decodeFunctionData, type Hex } from 'viem';
import { installMock } from './mock';
import { config as c, account } from '../fixtures';
import { poolKeyType } from '../../src/config';
const evidence = new URL('../../../docs/frontend/', import.meta.url).pathname;
async function connected(page: Page) {
  await page.goto('./');
  await page.getByRole('button',{name:'Connect wallet'}).click();
  await expect(page.getByRole('button',{name:'Preview position'})).toBeEnabled();
}
async function confirmed(page: Page, label: string) { await expect(page.getByRole('status')).toContainText(`${label} confirmed.`); }

test('fund, mint, claim, chain addition, keyboard, responsive rendering and accessibility', async ({page}) => {
  const errors: string[]=[]; page.on('pageerror', e=>errors.push(e.message));
  const mock=await installMock(page,{chain:'0x1'});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('./');
  await expect(page.getByRole('button',{name:'Preview position'})).toBeDisabled();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.getByRole('button',{name:'Connect wallet'}).click();
  await expect(page.getByRole('button',{name:'Preview position'})).toBeDisabled();
  await page.getByRole('button',{name:'Switch to Sepolia'}).click();
  await expect(page.getByRole('button',{name:'Preview position'})).toBeEnabled();
  const added=await page.evaluate(()=> (window as unknown as {__wallet:{calls:{method:string;params:unknown[]}[]}}).__wallet.calls.find(x=>x.method==='wallet_addEthereumChain')?.params[0]);
  expect(added).toEqual(c.manifest.walletAddChain);
  await expect(page.getByText('25 FARMX earned')).toBeVisible();
  await expect(page.getByText('Funded',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'2. Fund stream',exact:true}).click();
  await expect(page.locator('#fund')).toBeFocused();
  await expect(page.locator('#fund')).toHaveAttribute('aria-invalid','true');
  await page.getByLabel('FARMX contribution').fill('100');
  await page.getByRole('button',{name:'1. Approve FARMX for funding',exact:true}).click();
  await confirmed(page,'Approve funding');
  expect(mock.sent[0].to.toLowerCase()).toBe(c.token.address);
  const approval=decodeFunctionData({abi:c.token.abi,data:mock.sent[0].data});
  expect(String(approval.args![0]).toLowerCase()).toBe(c.hook.address);
  expect(approval.args![1]).toBe(100n*10n**18n);
  await page.getByRole('button',{name:'2. Fund stream',exact:true}).click();
  await confirmed(page,'Fund stream');
  expect(mock.sent[1].to.toLowerCase()).toBe(c.hook.address);
  await page.getByLabel('FARMX contribution').fill('0');
  await expect(page.getByRole('button',{name:'1. Approve FARMX for funding',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'2. Fund stream',exact:true}).click();
  await confirmed(page,'Fund stream');
  expect(decodeFunctionData({abi:c.hook.abi,data:mock.sent[2].data}).args![1]).toBe(0n);
  await page.getByLabel('ETH budget').fill('0.01');
  await page.getByLabel('FARMX budget',{exact:true}).fill('0.01');
  await page.getByRole('button',{name:'Preview position'}).click();
  await expect(page.getByRole('heading',{name:'Review your position'})).toBeVisible();
  await page.getByRole('button',{name:'1. Approve FARMX for Permit2',exact:true}).click();
  await confirmed(page,'Approve FARMX for Permit2');
  expect(String(decodeFunctionData({abi:c.token.abi,data:mock.sent[3].data}).args![0]).toLowerCase()).toBe(c.addresses.permit2);
  await page.getByRole('button',{name:'2. Allow PositionManager',exact:true}).click();
  await confirmed(page,'Allow PositionManager');
  expect(mock.sent[4].to.toLowerCase()).toBe(c.addresses.permit2);
  const permit=decodeFunctionData({abi:c.abis.Permit2,data:mock.sent[4].data});
  expect(String(permit.args![1]).toLowerCase()).toBe(c.addresses.positionManager);
  await page.getByRole('button',{name:'3. Mint position',exact:true}).click();
  await confirmed(page,'Mint full-range position');
  const mintTx=mock.sent[5]; expect(mintTx.to.toLowerCase()).toBe(c.addresses.positionManager);
  let mintCall=decodeFunctionData({abi:c.abis.PositionManager,data:mintTx.data});
  if(mintCall.functionName==='multicall') mintCall=decodeFunctionData({abi:c.abis.PositionManager,data:(mintCall.args![0] as Hex[])[0]});
  expect(mintCall.functionName).toBe('modifyLiquidities');
  const [actions,params]=decodeAbiParameters([{type:'bytes'},{type:'bytes[]'}],mintCall.args![0] as Hex);
  expect(actions).toBe('0x020d14');
  const decoded=decodeAbiParameters([poolKeyType,{type:'int24'},{type:'int24'},{type:'uint256'},{type:'uint128'},{type:'uint128'},{type:'address'},{type:'bytes'}],params[0]);
  expect(decoded[1]).toBe(-887220);expect(decoded[2]).toBe(887220);
  expect(decoded[6].toLowerCase()).toBe(account);
  expect(decodeAbiParameters([{type:'address'}],decoded[7])[0].toLowerCase()).toBe(account);
  expect(BigInt(mintTx.value!)).toBe(decoded[4]);expect(decoded[5]).toBe(permit.args![2]);
  expect(mock.calls).toContain('getPositionInfo');
  await page.locator('#eth').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#farm')).toBeFocused();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`${evidence}desktop.mock.png`,fullPage:true});
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
  const sizes=[];
  for(const width of [320,390,800,1440]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    sizes.push({width,scrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth)});
    if(width===390)await page.screenshot({path:`${evidence}mobile.mock.png`,fullPage:true});
  }
  await page.setViewportSize({width:800,height:900});
  await page.evaluate(()=>document.documentElement.style.fontSize='32px');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.evaluate(()=>document.documentElement.style.fontSize='');
  await page.getByRole('button',{name:/Claim rewards for/}).click();
  await confirmed(page,'Claim rewards');
  await expect(page.getByRole('button',{name:/Claim rewards for/})).toBeDisabled();
  expect(decodeFunctionData({abi:c.hook.abi,data:mock.sent[6].data}).functionName).toBe('claim');
  expect(errors).toEqual([]);
  await writeFile(`${evidence}browser-results.json`,JSON.stringify({testedAt:new Date().toISOString(),fixture:'Mock wallet/RPC; production export at /preview/',screenshots:['desktop.mock.png','mobile.mock.png'],sizes,axeViolations:axe.violations,pageErrors:errors,transactions:mock.sent.map(x=>({to:x.to,value:x.value??'0x0'})),rpcFunctions:[...new Set(mock.calls)]},null,2));
});

test('missing wallet has a recoverable message',async({page})=>{
  await installMock(page,{wallet:false});await page.goto('./');
  await page.getByRole('button',{name:'Connect wallet'}).click();
  await expect(page.getByText(/No browser wallet detected/)).toBeVisible();
});
test('rejected wallet connection remains disconnected',async({page})=>{
  await installMock(page);await page.goto('./');
  await page.evaluate(()=>{(window as unknown as {__wallet:{rejectConnection:boolean}}).__wallet.rejectConnection=true;});
  await page.getByRole('button',{name:'Connect wallet'}).click();
  await expect(page.getByText(/Request declined in your wallet/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Preview position'})).toBeDisabled();
});
test('repeated wallet events refresh without leaving the controls blocked',async({page})=>{
  await installMock(page);await connected(page);
  await page.evaluate(()=>{const w=(window as unknown as {__wallet:{chain:string;emit:(name:string,args:unknown)=>void}}).__wallet;w.emit('chainChanged',w.chain);});
  await expect(page.getByRole('button',{name:'Preview position'})).toBeEnabled();
});
test('wallet rejection, failed simulation and reverted receipts never report success',async({page})=>{
  const mock=await installMock(page);await connected(page);
  await page.getByLabel('FARMX contribution').fill('0');
  mock.reject=true;
  await page.getByRole('button',{name:'2. Fund stream',exact:true}).click();
  await expect(page.getByText(/Request declined in your wallet/)).toBeVisible();expect(mock.sent.length).toBe(0);
  mock.reject=false;mock.revertSimulation=true;
  await page.getByRole('button',{name:'2. Fund stream',exact:true}).click();
  await expect(page.locator('.transaction-status')).toContainText('did not complete');expect(mock.sent.length).toBe(0);
  mock.revertSimulation=false;mock.receiptReverts=true;
  await page.getByRole('button',{name:'2. Fund stream',exact:true}).click();
  await expect(page.getByText(/Transaction reverted onchain/)).toBeVisible();expect(mock.sent.length).toBe(1);
  await expect(page.locator('.transaction-status')).not.toContainText('confirmed.');
});
test('missing PositionManager code blocks every transaction control',async({page})=>{
  await installMock(page,{missingCode:true});await page.goto('./');
  await page.getByRole('button',{name:'Connect wallet'}).click();
  await expect(page.getByText(/positionManager has no deployed code/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Preview position'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'2. Fund stream',exact:true})).toBeDisabled();
});
test('ABI corruption fails closed before wallet controls appear',async({page})=>{
  await installMock(page,{badAbi:true});await page.goto('./');
  await expect(page.getByText(/ABI asset integrity mismatch/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Connect wallet'})).toHaveCount(0);
});
test('RPC outage is visible and retries remain available',async({page})=>{
  await installMock(page,{rpcFailure:true,wallet:false});await page.goto('./');
  await expect(page.locator('.notice.error')).toBeVisible();
  await expect(page.getByRole('button',{name:'Refresh state'})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Preview position'})).toBeDisabled();
});
test('account changes clear the preview and fetch positions for the new beneficiary',async({page})=>{
  await installMock(page);await connected(page);
  await page.getByLabel('ETH budget').fill('0.01');await page.getByLabel('FARMX budget',{exact:true}).fill('0.01');
  await page.getByRole('button',{name:'Preview position'}).click();
  await page.evaluate(()=>{ const w=(window as unknown as {__wallet:{account:string;emit:(name:string,args:unknown)=>void}}).__wallet;w.account='0x2222222222222222222222222222222222222222';w.emit('accountsChanged',[w.account]); });
  await expect(page.getByRole('heading',{name:'Review your position'})).toHaveCount(0);
  await expect(page.getByText('0x222222…222222')).toBeVisible();
  await expect(page.getByRole('button',{name:/Claim rewards for/})).toBeDisabled();
});
test('enrolled positions use bounded pagination',async({page})=>{
  await installMock(page,{positions:11});await connected(page);
  await expect(page.getByRole('button',{name:/Claim rewards for/})).toHaveCount(10);
  await page.getByRole('button',{name:'Next positions'}).click();
  await expect(page.getByRole('button',{name:/Claim rewards for/})).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Next positions'})).toBeDisabled();
});

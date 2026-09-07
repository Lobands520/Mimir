"""Real Edge acceptance in an isolated profile. Requires Python playwright.
Run: python3 tests/browser_check.py [--legacy .local/recovered-history.json]
"""
import asyncio, argparse, hashlib, json, time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent
EXTENSION_ID=''.join(chr(ord('a')+int(c,16)) for c in hashlib.sha256(str(ROOT).encode()).hexdigest()[:32])
async def rpc(page, action, **args):
 result=await page.evaluate('(message) => chrome.runtime.sendMessage(message)',{'action':action,**args})
 if not result or not result.get('ok'): raise RuntimeError(str(result))
 return result['data']
async def wait_capture(page):
 for _ in range(120):
  state=await rpc(page,'status')
  if not state['capture']: return state
  if state['capture'].get('error'): raise RuntimeError(state['capture']['error'])
  await asyncio.sleep(.25)
 raise RuntimeError('Capture did not finish')
async def main():
 parser=argparse.ArgumentParser(); parser.add_argument('--legacy',type=Path); args=parser.parse_args()
 output=ROOT/'test-results'; output.mkdir(exist_ok=True)
 profile=ROOT/'.local'/'acceptance-profile'
 errors=[]; report={}
 async with async_playwright() as p:
  async def launch():
   return await p.chromium.launch_persistent_context(str(profile),executable_path='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',headless=True,viewport={'width':1280,'height':1000},args=['--disable-extensions-except='+str(ROOT),'--load-extension='+str(ROOT),'--no-first-run'])
  context=await launch(); report['browser']=context.browser.version
  print('Edge version:', report['browser'], flush=True)
  page=await context.new_page(); page.on('pageerror',lambda e: errors.append(str(e)))
  await page.goto(f'chrome-extension://{EXTENSION_ID}/settings.html')
  await page.locator('#captureState').filter(has_text='采集').wait_for(timeout=30000)
  await wait_capture(page)
  url='https://mimir-acceptance.invalid/visit-'+str(int(time.time()))
  await page.evaluate('(url) => chrome.history.addUrl({url})',url)
  await asyncio.sleep(.02)
  await page.evaluate('(url) => chrome.history.addUrl({url})',url)
  await rpc(page,'sync'); await wait_capture(page)
  visits=await page.evaluate('(url) => chrome.history.getVisits({url})',url)
  rows=(await rpc(page,'query',filter={'query':url}))['rows']
  assert len(visits)==len(rows)==2,(len(visits),len(rows))
  await rpc(page,'sync'); await wait_capture(page)
  assert len((await rpc(page,'query',filter={'query':url}))['rows'])==2
  report['realHistoryCaptureAndRepeatSync']=True
  await page.goto(f'chrome-extension://{EXTENSION_ID}/dashboard.html')
  await page.locator('#searchState').filter(has_text='统计完成').wait_for(timeout=30000)
  try: await page.screenshot(path=str(output/'dashboard.png'),full_page=False)
  except Exception as e: report['screenshotWarning']=str(e).split('\n')[0]
  popup=await context.new_page(); await popup.goto(f'chrome-extension://{EXTENSION_ID}/popup.html'); await popup.wait_for_timeout(600)
  try: await popup.screenshot(path=str(output/'popup.png'))
  except Exception: pass
  await popup.close()
  await page.goto(f'chrome-extension://{EXTENSION_ID}/settings.html'); await page.wait_for_timeout(600)
  try: await page.screenshot(path=str(output/'settings.png'),full_page=False)
  except Exception: pass
  cfg=await rpc(page,'getConfig'); cfg['enabled']=False; await rpc(page,'saveConfig',config=cfg)
  before=await rpc(page,'status')
  if args.legacy:
   await page.locator('#files').set_input_files(str(args.legacy.resolve()))
   await page.locator('#fileStatus').filter(has_text='导入完成。').wait_for(timeout=180000)
   await page.locator('#importSummary').filter(has_text='导入完成。').wait_for(timeout=10000)
   await page.wait_for_function("!document.getElementById('importFiles').disabled")
   imported=await rpc(page,'status'); report['legacyImport']=imported['lastImport']; assert report['legacyImport']['completed']
   await page.locator('#files').set_input_files(str(args.legacy.resolve()))
   await page.locator('#fileStatus').filter(has_text='导入完成。').wait_for(timeout=180000)
   await page.locator('#importSummary').filter(has_text='导入完成。').wait_for(timeout=10000)
   await page.wait_for_function("!document.getElementById('importFiles').disabled")
   again=await rpc(page,'status'); assert again['total']==imported['total']; report['legacyDuplicateImport']=again['lastImport']
  print('Edge UI, real capture and legacy import passed.',flush=True)
  report['benchmark']=await page.evaluate((ROOT/'tests/benchmark.js').read_text())
  print('100k benchmark:',json.dumps(report['benchmark']),flush=True)
  before_restart=(await rpc(page,'status'))['total']; await context.close()
  context=await launch(); page=await context.new_page(); await page.goto(f'chrome-extension://{EXTENSION_ID}/settings.html')
  after_restart=await rpc(page,'status'); assert after_restart['total']==before_restart
  report['browserRestartPreservesData']=True
  report['pageErrors']=errors; assert not errors,errors
  await context.close()
 (output/'edge-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
 print('Edge acceptance passed. Report: test-results/edge-report.json',flush=True)
asyncio.run(main())

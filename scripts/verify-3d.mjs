import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

const root = path.resolve('dist');
await fs.mkdir('artifacts/3d', { recursive: true });
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.startsWith('/api/')) { res.writeHead(503); res.end('{}'); return; }
    let file = path.join(root, pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(root + path.sep)) throw new Error('invalid path');
    let body;
    try { body = await fs.readFile(file); } catch { file = path.join(root, 'index.html'); body = await fs.readFile(file); }
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
const results = [];
try {
  for (const software of [false, true]) {
    const browser = await chromium.launch({ headless:true, args:software ? ['--disable-webgl'] : ['--enable-unsafe-swiftshader','--use-angle=swiftshader'] });
    try {
      const context = await browser.newContext({ viewport:{width:1360,height:980}, acceptDownloads:true });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await page.goto('http://127.0.0.1:4173/');
      const canvas = page.getByTestId('chibi-canvas');
      await canvas.waitFor();
      await page.waitForFunction(() => document.querySelector('canvas[data-testid="chibi-canvas"]')?.dataset.avatar);
      const backend = await canvas.getAttribute('data-renderer');
      if (software) assert.equal(backend, 'software');
      for (let i = 0; i < 5; i++) {
        await page.getByTestId('avatar-' + i).click();
        await page.waitForTimeout(200);
        assert.equal(await page.getByTestId('avatar-' + i).getAttribute('aria-pressed'), 'true');
        if (!software) await page.screenshot({path:`artifacts/3d/character-${i}.png`,fullPage:true});
      }
      const expressions = page.locator('.chibi-expression-grid button');
      assert.equal(await expressions.count(), 26);
      for (let i = 0; i < 26; i++) { await expressions.nth(i).click(); assert.equal(await expressions.nth(i).getAttribute('aria-pressed'), 'true'); }
      const motions = page.locator('.chibi-motions button');
      assert.equal(await motions.count(), 7);
      for (let i = 0; i < 7; i++) await motions.nth(i).click();
      assert.equal(await canvas.getAttribute('data-mouth'), '0');
      const pixels = await canvas.evaluate(c => {
        const gl=c.getContext('webgl');
        if(gl){const p=new Uint8Array(c.width*c.height*4);gl.readPixels(0,0,c.width,c.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p.filter((v,i)=>i%4===3&&v>0).length;}
        return c.getContext('2d').getImageData(0,0,c.width,c.height).data.filter((v,i)=>i%4===3&&v>0).length;
      });
      assert.ok(pixels>1000,'actual triangles must render, not a blank canvas');
      const downloading=page.waitForEvent('download');
      await page.locator('.chibi-footer button').first().click();
      const download=await downloading, exported=JSON.parse(await fs.readFile(await download.path(),'utf8'));
      assert.equal(exported.asset.version,'2.0');
      assert.ok(exported.nodes.length>40);
      await page.locator('.chibi-header nav button').click();
      await page.locator('#deskpet-user-name').fill('3D Test');
      await page.locator('#deskpet-user-name').press('Enter');
      assert.equal(await page.evaluate(()=>localStorage.getItem('deskpet:user-name:v1')),'3D Test');
      await page.locator('.settings-drawer .modal-heading button').click();
      await page.reload();
      await canvas.waitFor();
      assert.equal(await page.evaluate(()=>localStorage.getItem('deskpet:user-name:v1')),'3D Test');
      for (const height of [844,430]) {
        await page.setViewportSize({width:390,height});
        await page.waitForTimeout(300);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
        await page.screenshot({path:`artifacts/3d/${software?'software':'webgl'}-mobile-${height}.png`,fullPage:true});
      }
      await page.locator('.chibi-talk-button').click();
      assert.ok(await page.locator('.settings-drawer.open').isVisible(),'missing API key opens settings instead of failing silently');
      assert.equal(errors.length,0,errors.join('\n'));
      results.push({softwareRequested:software,backend,pixels,characters:5,expressions:26,motions:7,pageErrors:errors,externalGeminiCalls:0});
    } finally { await browser.close(); }
  }
  await fs.writeFile('artifacts/3d/results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
} finally { server.close(); }

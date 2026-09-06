"""Rendered geometry and interaction QA, not a design-quality score.
CI: python tests/moru.browser.py --browsers chromium firefox webkit
Local bundle: node tests/moru.vite.mjs && python tests/moru.browser.py --offline
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

EMOTIONS = ['idle','listening','happy','sleepy','curious','alert','playful','excited','affectionate','relaxed','startled','anxious','annoyed','angry','sad','scared','laughing','love','wink','proud','smug','thinking','confused','disappointed','tired','crying']
ACTIONS = {'air-punch':2.7,'sleep':7.2,'stretch':3.8,'groom':3.7,'yawn':3.3,'knead':4.2,'butterfly':3.4}
TRACK = '''(()=>{const r=requestAnimationFrame,c=cancelAnimationFrame,ids=new Set();window.requestAnimationFrame=f=>{let id=r(t=>{ids.delete(id);f(t)});ids.add(id);return id};window.cancelAnimationFrame=id=>{ids.delete(id);c(id)};window.__frames=()=>ids.size})()'''

def run(p, name, args, out):
    options={'headless':True}
    if name=='chromium':
        options['args']=['--no-sandbox']
        if args.chromium_executable: options['executable_path']=args.chromium_executable
    browser=getattr(p,name).launch(**options)
    context=browser.new_context(viewport={'width':1000,'height':640})
    page=context.new_page(); errors=[]; checks=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    def check(value, description):
        if not value: raise AssertionError(description)
        checks.append(description)
    def props(**values): page.evaluate('(p)=>window.__moru.set(p)',values)
    def advance(ms=100): page.clock.run_for(ms)
    def attr(part, key='transform'): return page.locator('#specimen [data-part="'+part+'"]').get_attribute(key)
    def numeric(): return page.locator('#specimen svg').evaluate('s=>[...s.querySelectorAll("*")].every(n=>[...n.attributes].every(a=>!/NaN|Infinity/.test(a.value)))')
    try:
        page.clock.install(time=1000000); page.clock.pause_at(1001000)
        if args.offline:
            path=Path('.moru-review')
            page.set_content('<html><style>'+next(path.glob('*.css')).read_text()+'</style><div id="root"></div></html>')
            page.add_script_tag(content=TRACK)
            page.add_script_tag(content=(path/'moru-review.js').read_text())
        else:
            page.add_init_script(TRACK);page.goto(args.base_url+'/tests/fixtures/moru.html')
        page.wait_for_function('!!window.__moru');advance(200)
        check(page.evaluate('__frames()')==1,'one rig loop and no thumbnail loop')
        check(page.locator('#thumbnail [role=button]').count()==0,'thumbnail adds no focus stop')
        page.emulate_media(reduced_motion='reduce');props(emotion='idle');advance(100)
        shapes=set()
        for emotion in EMOTIONS:
            props(emotion=emotion);advance()
            check(numeric(),'finite expression: '+emotion)
            shapes.add(attr('eye-left','d')+attr('eye-right','d')+attr('mouth-line','d')+attr('body','d')+attr('mass'))
            page.locator('#specimen').screenshot(path=str(out/(name+'-'+emotion+'.png')))
        check(len(shapes)==26,'26 distinct rendered expressions')
        check(page.evaluate('__frames()')==0,'reduced motion stops RAF')
        still=attr('mass');advance(3000);check(attr('mass')==still,'reduced motion remains still')
        props(emotion='idle');advance()
        page.locator('#specimen [role=button]').press('Enter');advance()
        check(page.locator('#specimen svg').get_attribute('data-petting')=='true','reduced motion acknowledges petting')
        advance(1300);check(page.locator('#specimen svg').get_attribute('data-petting')=='false','pet feedback expires')
        for emotion in ['sad','angry','crying','love']:
            props(emotion=emotion,phase='speaking',speechLevel=.8);advance()
            check(float(page.locator('#specimen svg').get_attribute('data-mouth-open'))>8,'PCM opens mouth: '+emotion)
            before=attr('eye-left','d');props(speechLevel=0);advance()
            check(float(page.locator('#specimen svg').get_attribute('data-mouth-open'))==0,'silence closes mouth: '+emotion)
            check(before==attr('eye-left','d'),'speech preserves eyes: '+emotion)
        # Let the browser dispatch its native MediaQueryList change before freezing
        # time again. Fake-clock advancement alone can starve Firefox's style task.
        page.emulate_media(reduced_motion='no-preference');page.clock.resume()
        props(emotion='idle',phase='disconnected',idleAction='none')
        page.wait_for_function('document.querySelector("#specimen svg")?.dataset.reducedMotion === "false"')
        page.clock.pause_at(page.evaluate('new Date(Date.now()+100).toISOString()'))
        advance(1400)
        check(page.locator('#specimen svg').get_attribute('data-reduced-motion')=='false','normal-motion precondition established after media change')
        no_snap=page.evaluate('''()=>{const eye=document.querySelector('#specimen [data-part="eye-left"]'),body=document.querySelector('#specimen [data-part="body"]');const a=eye.getAttribute('d'),b=body.getAttribute('d');window.__moru.set({emotion:'startled'});return a===eye.getAttribute('d')&&b===body.getAttribute('d')}''')
        check(no_snap,'React commit does not reset in-flight geometry');advance(500)
        props(emotion='idle');advance(1500)
        body=attr('body','d');feet=attr('feet');advance(450)
        check(body!=attr('body','d'),'breathing deforms body')
        check(feet==attr('feet'),'breathing keeps feet planted')
        for action,seconds in ACTIONS.items():
            props(idleAction='none');advance(1200);props(idleAction=action)
            for index in range(1,5):
                advance(round(seconds*200));check(numeric(),f'{action}: finite motion sample {index}')
                page.locator('#specimen').screenshot(path=str(out/(name+'-'+action+'-'+str(index)+'.png')))
            advance(round(seconds*200)+1800)
            check(page.locator('#specimen svg').get_attribute('data-action')=='none','action recovers: '+action)
        props(idleAction='yawn');advance(1000);props(phase='speaking',speechLevel=.7);advance(100)
        check(page.locator('#specimen svg').get_attribute('data-action')=='none','speech interrupts action')
        props(phase='listening',microphoneLevel=0,idleAction='none');advance(1000);ear=attr('ear-left');props(microphoneLevel=1);advance(300)
        check(ear!=attr('ear-left'),'microphone moves listening ear')
        props(phase='disconnected');advance(1000)
        target=page.locator('#specimen [role=button]')
        for key in ['Enter','Space']:
            target.press(key);advance(200);check(float(attr('pet-heart','opacity'))==1,'petting responds to '+key);advance(1500)
        target.dispatch_event('click');advance(200);check(float(attr('pet-heart','opacity'))==1,'click pets');advance(1500)
        box=page.locator('#specimen svg').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']*.6
        page.mouse.move(x,y);page.mouse.down();advance(200);page.mouse.move(x,y+45);advance(300)
        check(float(page.locator('#specimen svg').get_attribute('data-squash'))>.3,'real press and drag compresses mass')
        target.dispatch_event('pointercancel',{'pointerId':1});page.mouse.up();advance(1600)
        check(page.locator('#specimen svg').get_attribute('data-petting')=='false','cancel clears held press')
        for i in range(104): props(emotion=EMOTIONS[i%26]);advance(17)
        check(numeric(),'rapid retargeting keeps valid geometry');check(page.evaluate('__frames()')==1,'retargeting keeps one loop')
        page.evaluate('window.__moru.set({intensity:NaN,speechLevel:Infinity,microphoneLevel:-Infinity})');advance()
        check(numeric(),'invalid levels stay finite')
        page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"))');advance()
        check(page.evaluate('__frames()')==0,'hidden document pauses rig')
        page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"))');advance()
        check(page.evaluate('__frames()')==1,'visibility restores one loop')
        page.evaluate('window.__moru.unmount()');advance();check(page.evaluate('__frames()')==0,'unmount cleans frames')
        check(not errors,'no uncaught fixture errors: '+repr(errors))
        if not args.offline:
            app_context=browser.new_context(viewport={'width':1440,'height':960})
            app=app_context.new_page();app_errors=[];app.on('pageerror',lambda e:app_errors.append(str(e)))
            app.route('**/api/mobile-status',lambda r:r.fulfill(json={'hasApiKey':False}))
            app.goto(args.base_url);app.get_by_role('button',name='\uce90\ub9ad\ud130',exact=True).click()
            check(app.locator('.character-card').count()==6,'picker retains cats and adds Moru')
            app.locator('.character-card').filter(has_text='\ubaa8\ub8e8').click();app.locator('.pet-viewport [data-character=moru]').wait_for()
            app.reload();app.locator('.pet-viewport [data-character=moru]').wait_for();check(True,'selection survives reload')
            for width in [360,390,768,1024,1440]:
                app.set_viewport_size({'width':width,'height':960});app.wait_for_timeout(150)
                check(app.evaluate('document.documentElement.scrollWidth<=innerWidth'),f'no page overflow at {width}px')
                box=app.locator('.pet-viewport [data-character=moru]').bounding_box()
                check(box['width']>100 and box['x']>=0 and box['x']+box['width']<=width+1,f'character fits at {width}px')
                app.screenshot(path=str(out/(name+'-app-'+str(width)+'.png')),full_page=True)
            app.get_by_role('button',name='\ub370\ubaa8 \ubcf4\uae30',exact=True).click()
            app.wait_for_function('document.querySelector(".pet-viewport [data-character=moru]")?.dataset.speaking==="true"',timeout=12000)
            app.wait_for_function('document.querySelector(".pet-viewport [data-character=moru]")?.dataset.speaking==="false"',timeout=12000)
            check(True,'application demo starts and ends speaking')
            app.get_by_role('button',name='\uce90\ub9ad\ud130',exact=True).click();app.locator('.character-card').filter(has_text='\uadf8\ub9b0\ub0e5').click()
            check(app.locator('.pet-viewport .greus-cat').count()==1,'switching back retains original cat')
            check(not app_errors,'no uncaught app errors: '+repr(app_errors));app_context.close()
        return {'browser':name,'passed':len(checks),'checks':checks,'errors':errors}
    except Exception as e:
        page.screenshot(path=str(out/(name+'-failure.png')))
        (out/(name+'-failure.json')).write_text(json.dumps({'error':str(e),'passed':checks,'browser_errors':errors},indent=2))
        raise
    finally: context.close();browser.close()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--browsers',nargs='+',default=['chromium']);parser.add_argument('--offline',action='store_true');parser.add_argument('--chromium-executable');parser.add_argument('--base-url',default='http://127.0.0.1:5173');args=parser.parse_args()
    out=Path('artifacts/moru');out.mkdir(parents=True,exist_ok=True);results=[]
    with sync_playwright() as p:
        for name in args.browsers:
            results.append(run(p,name,args,out));print(name,results[-1]['passed'],'checks passed',flush=True)
            (out/'report.json').write_text(json.dumps(results,indent=2))

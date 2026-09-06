"""Real-browser rig QA. CI uses localhost; --offline renders the same fixture bundle.
Run: python tests/lumi.browser.py --browsers chromium firefox webkit
The fixture and its test API are excluded from the production Vite entry.
"""
import argparse
import json
import traceback
from pathlib import Path
from playwright.sync_api import sync_playwright

EMOTIONS = ['idle', 'listening', 'happy', 'sleepy', 'curious', 'alert', 'playful', 'excited',
            'affectionate', 'relaxed', 'startled', 'anxious', 'annoyed', 'angry', 'sad', 'scared',
            'laughing', 'love', 'wink', 'proud', 'smug', 'thinking', 'confused', 'disappointed', 'tired', 'crying']
ACTIONS = {'air-punch': 3.8, 'sleep': 8, 'stretch': 4.6, 'groom': 5.6, 'yawn': 4.8, 'knead': 5.8, 'butterfly': 6.4}
TRACK_RAF = '''(() => {
 const request=window.requestAnimationFrame.bind(window), cancel=window.cancelAnimationFrame.bind(window), active=new Set();
 window.requestAnimationFrame=cb=>{let id=request(t=>{active.delete(id);cb(t)});active.add(id);return id};
 window.cancelAnimationFrame=id=>{active.delete(id);cancel(id)};
 window.__activeLumiFrames=()=>active.size;
})()'''

def run(browser_type, name, args, out):
    kwargs = {'headless': True}
    if name == 'chromium':
        kwargs['args'] = ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
        if args.chromium_executable:
            kwargs['executable_path'] = args.chromium_executable
    browser = browser_type.launch(**kwargs)
    context = browser.new_context(viewport={'width': 740, 'height': 500}, device_scale_factor=1)
    app_context = None
    app = None
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    checks = []
    def check(condition, label):
        if not condition:
            raise AssertionError(label)
        checks.append(label)
    def set_props(**props):
        page.evaluate('(props) => window.__lumiQA.set(props)', props)
    def advance(ms=80):
        page.clock.run_for(ms)
    def attr(part, key='transform'):
        return page.locator('#specimen [data-part="' + part + '"]').get_attribute(key)
    def numeric_svg():
        return page.locator('#specimen svg').evaluate('svg => [...svg.querySelectorAll("*")].every(n => [...n.attributes].every(a => !/NaN|Infinity/.test(a.value)))')
    try:
        page.clock.install()
        if args.offline:
            fixture = Path('.lumi-review')
            css = next(fixture.glob('*.css')).read_text()
            page.set_content('<html lang="ko"><style>' + css + '</style><div id="root"></div></html>')
            page.add_script_tag(content=TRACK_RAF)
            page.add_script_tag(content=(fixture / 'lumi-review.js').read_text())
        else:
            page.add_init_script(TRACK_RAF)
            page.goto(args.base_url + '/tests/fixtures/lumi.html')
        advance(120)
        check(page.locator('[data-character=lumi]').count() == 2, 'stage and thumbnail render')
        check(page.evaluate('window.__activeLumiFrames()') == 1, 'one RAF loop after StrictMode setup/cleanup; static preview has none')
        ids = page.locator('[id]').evaluate_all('nodes => nodes.map(n=>n.id)')
        check(len(ids) == len(set(ids)), 'no duplicate SVG IDs across instances')
        check(page.locator('#specimen [role=button]').count() == 1, 'keyboard pet target exists')
        check(page.locator('#thumbnail [role=button]').count() == 0, 'thumbnail has no hidden tab stop')
        page.emulate_media(reduced_motion='reduce')
        advance()
        shapes = set()
        for emotion in EMOTIONS:
            set_props(emotion=emotion, phase='disconnected', idleAction='none', intensity=1)
            advance()
            check(numeric_svg(), 'valid SVG for ' + emotion)
            shapes.add(attr('eye-left', 'd') + attr('eye-right', 'd') + attr('mouth', 'd') + attr('rig-root'))
            page.locator('#specimen').screenshot(path=str(out / (name + '-emotion-' + emotion + '.png')))
        check(len(shapes) == 26, 'all 26 emotions have distinct rendered faces/poses')
        check(page.evaluate('window.__activeLumiFrames()') == 0, 'reduced-motion has no continuous RAF')
        frozen = attr('rig-root')
        advance(5000)
        check(attr('rig-root') == frozen, 'reduced-motion stays still over time')
        set_props(emotion='idle', phase='disconnected'); advance()
        page.locator('#specimen [role=button]').press('Enter'); advance(100)
        check(float(attr('hearts', 'opacity')) > .15, 'reduced-motion still acknowledges petting')
        advance(1000)
        check(float(attr('hearts', 'opacity')) == 0, 'reduced-motion pet feedback expires without a continuous RAF')
        # Synthetic rendered-PCM inputs, not a live microphone or Gemini session.
        for emotion in ['sad', 'angry', 'crying', 'love']:
            set_props(emotion=emotion, phase='speaking', speechLevel=.81)
            advance()
            check(float(page.locator('#specimen svg').get_attribute('data-mouth-open')) > 8, 'audible PCM opens mouth for ' + emotion)
            eye = attr('eye-left', 'd')
            set_props(speechLevel=0)
            advance()
            check(float(page.locator('#specimen svg').get_attribute('data-mouth-open')) == 0, 'silence closes mouth for ' + emotion)
            check(attr('eye-left', 'd') == eye, 'speech preserves emotion eyes for ' + emotion)
        set_props(emotion='idle', phase='listening', microphoneLevel=0)
        advance(); antenna = attr('antenna')
        set_props(microphoneLevel=1)
        advance()
        check(antenna != attr('antenna'), 'microphone level changes listening antenna')
        for phase in ['disconnected', 'connecting', 'idle', 'listening', 'thinking', 'speaking', 'reconnecting', 'error']:
            set_props(phase=phase, speechLevel=.5, idleAction='stretch')
            advance()
            check(numeric_svg(), 'valid pose in conversation phase ' + phase)
        page.emulate_media(reduced_motion='no-preference')
        set_props(emotion='idle', phase='disconnected', microphoneLevel=0, speechLevel=0, idleAction='none')
        advance(300)
        # One JS task: protocol latency must not mistake a legitimate RAF for a React snap.
        commit = page.evaluate("""() => {
          const svg = document.querySelector('#specimen svg');
          const read = () => [svg.querySelector('[data-part=eye-left]').getAttribute('d'),
            svg.querySelector('[data-part=rig-root]').getAttribute('transform')].join('|');
          const before = read();
          window.__lumiQA.set({emotion: 'startled'});
          return {stable: before === read(), before};
        }""")
        check(commit['stable'], 'retarget does not snap SVG attributes during React commit')
        advance(100)
        current = attr('eye-left', 'd') + '|' + attr('rig-root')
        check(current != commit['before'], 'retarget interpolates on animation frames')
        set_props(emotion='idle'); advance(1000)
        before = attr('rig-root'); advance(250)
        check(before != attr('rig-root'), 'idle float is animated')
        for action, duration in ACTIONS.items():
            set_props(idleAction='none'); advance(1000)
            start_left, start_right = attr('arm-left'), attr('arm-right')
            set_props(idleAction=action); advance(round(duration * 500))
            check(page.locator('#specimen svg').get_attribute('data-action') == action, 'action starts: ' + action)
            check(attr('arm-left') != start_left or attr('arm-right') != start_right, 'limbs animate: ' + action)
            check(numeric_svg(), 'finite action transforms: ' + action)
            page.locator('#specimen').screenshot(path=str(out / (name + '-action-' + action + '.png')))
            advance(round(duration * 500) + 1800)
            check(page.locator('#specimen svg').get_attribute('data-action') == 'none', 'one-shot returns to idle: ' + action)
        set_props(idleAction='none'); advance(100)
        set_props(idleAction='yawn'); advance(1500)
        set_props(phase='speaking', speechLevel=.7); advance(800)
        check(page.locator('#specimen svg').get_attribute('data-action') == 'none', 'speech interrupts yawn')
        set_props(phase='disconnected', idleAction='none', emotion='idle'); advance(1200)
        target = page.locator('#specimen [role=button]')
        target.focus(); target.press('Enter'); advance(400)
        check(float(attr('hearts', 'opacity')) > .15, 'Enter triggers pet response')
        advance(1800); target.press('Space'); advance(400)
        check(float(attr('hearts', 'opacity')) > .15, 'Space triggers pet response without scrolling')
        advance(1800); target.click(); advance(400)
        check(float(attr('hearts', 'opacity')) > .15, 'pointer/touch-compatible click triggers pet response')
        for index in range(104):
            set_props(emotion=EMOTIONS[index % 26], idleAction='none'); advance(17)
        check(numeric_svg(), '104 rapid retargets leave no malformed SVG')
        check(page.evaluate('window.__activeLumiFrames()') == 1, 'retargets do not multiply RAF loops')
        page.evaluate('window.__lumiQA.set({intensity:NaN,speechLevel:Infinity,microphoneLevel:-Infinity,phase:"speaking"})'); advance(500)
        check(numeric_svg(), 'invalid external levels are sanitized')
        page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"))')
        advance(1000)
        check(page.evaluate('window.__activeLumiFrames()') == 0, 'hidden document suspends RAF')
        page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"))'); advance(100)
        check(page.evaluate('window.__activeLumiFrames()') == 1, 'visible document resumes exactly one RAF')
        page.evaluate('window.__lumiQA.unmount()'); advance(200)
        check(page.evaluate('window.__activeLumiFrames()') == 0, 'unmount cancels all RAF callbacks')
        check(not errors, 'no uncaught fixture browser errors: ' + repr(errors))
        # A separate context prevents the fixture's mocked clock from affecting app timers.
        if not args.offline:
            app_context = browser.new_context(viewport={'width': 1440, 'height': 1040}, device_scale_factor=1)
            app = app_context.new_page()
            app_errors = []
            app.on('pageerror', lambda e: app_errors.append(str(e)))
            app.route('**/api/mobile-status', lambda route: route.fulfill(json={'hasApiKey': False}))
            app.goto(args.base_url)
            app.get_by_role('button', name='\uce90\ub9ad\ud130', exact=True).click()
            check(app.locator('.character-card').count() == 6, 'picker preserves cats and adds Lumi')
            app.locator('.character-card').filter(has_text='\ub8e8\ubbf8').click()
            app.locator('.pet-viewport [data-character=lumi]').wait_for()
            app.reload()
            app.locator('.pet-viewport [data-character=lumi]').wait_for()
            check(True, 'Lumi selection persists through reload')
            app.screenshot(path=str(out / (name + '-app-desktop.png')), full_page=True)
            for width in [360, 390, 768]:
                app.set_viewport_size({'width': width, 'height': 844})
                app.wait_for_timeout(100)
                check(app.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no horizontal page overflow at ' + str(width))
                box = app.locator('.pet-viewport [data-character=lumi]').bounding_box()
                check(box['width'] > 0 and box['x'] >= 0 and box['x'] + box['width'] <= width + 1, 'character fits viewport at ' + str(width))
                app.screenshot(path=str(out / (name + '-app-' + str(width) + '.png')), full_page=True)
            app.get_by_role('button', name='\ub370\ubaa8 \ubcf4\uae30', exact=True).click()
            app.wait_for_function('document.querySelector(".pet-viewport [data-character=lumi]")?.dataset.speaking === "true"', timeout=12000)
            check(app.locator('.pet-viewport [data-character=lumi]').get_attribute('data-speaking') == 'true', 'actual app demo connects speech state to Lumi')
            app.wait_for_function('document.querySelector(".pet-viewport [data-character=lumi]")?.dataset.speaking === "false"', timeout=12000)
            check(app.locator('.pet-viewport [data-character=lumi]').get_attribute('data-speaking') == 'false', 'demo returns from speaking state')
            app.get_by_role('button', name='\uce90\ub9ad\ud130', exact=True).click()
            app.locator('.character-card').filter(has_text='\uadf8\ub9b0\ub0e5').click()
            app.locator('.pet-viewport .greus-cat').wait_for()
            check(True, 'existing cat still renders after switching back')
            check(not app_errors, 'no uncaught app errors: ' + repr(app_errors))
        return {'browser': name, 'mode': 'offline fixture' if args.offline else 'localhost fixture + application', 'passed': len(checks), 'checks': checks, 'errors': errors}
    except Exception:
        try:
            (app or page).screenshot(path=str(out / (name + '-failure.png')), full_page=True)
        except Exception:
            pass
        (out / (name + '-partial-report.json')).write_text(json.dumps({'passed': len(checks), 'checks': checks, 'errors': errors, 'failure': traceback.format_exc()}, indent=2))
        raise
    finally:
        if app_context:
            app_context.close()
        context.close(); browser.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--browsers', nargs='+', default=['chromium'])
    parser.add_argument('--base-url', default='http://127.0.0.1:5173')
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--chromium-executable')
    args = parser.parse_args()
    out = Path('artifacts/lumi'); out.mkdir(parents=True, exist_ok=True)
    results = []
    failed = []
    with sync_playwright() as playwright:
        for name in args.browsers:
            try:
                result = run(getattr(playwright, name), name, args, out)
                results.append(result)
                print(name + ': ' + str(result['passed']) + ' browser assertions passed', flush=True)
            except Exception:
                failed.append(name)
                traceback.print_exc()
            (out / 'browser-report.json').write_text(json.dumps(results, indent=2))
    if failed:
        raise SystemExit('Browser QA failed: ' + ', '.join(failed))

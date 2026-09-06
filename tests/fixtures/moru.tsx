import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { MoruRabbit, type MoruProps } from "../../src/renderer/components/MoruRabbit";
import { GreusCat } from "../../src/renderer/components/GreusCat";
const root = createRoot(document.getElementById("root")!);
function Fixture() {
 const [compare, setCompare] = useState(false), [props, set] = useState<MoruProps>({ idleAction: "none", size: 480 });
 (window as any).__moru = { set: (p: MoruProps) => flushSync(() => set(v => ({ ...v, ...p }))), compare: (v:boolean) => flushSync(() => setCompare(v)), unmount: () => root.unmount() };
 return <><style>{`body{margin:0;background:#f2eeeb;font-family:system-ui,sans-serif;color:#493d40}main{display:flex;align-items:center;justify-content:center;gap:16px;min-height:560px}article{width:480px;text-align:center}h2{font-size:15px;letter-spacing:3px;font-weight:500}#specimen{background:#f2eeeb}`}</style><main>{compare && <article><h2>GREUS / ORIGINAL</h2><GreusCat coat="cheese" emotion="idle" size={480} enableIdleActions={false} /></article>}<article><h2>MORU / NEW COMPANION</h2><div id="specimen"><MoruRabbit {...props}/></div></article></main><div id="thumbnail" style={{position:"absolute",left:24,bottom:12}}><MoruRabbit staticPreview size={80} /></div></>;
}
root.render(<StrictMode><Fixture/></StrictMode>);

import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { Lumi, type LumiProps } from "../../src/renderer/components/Lumi";
import "./lumi-harness.css";

declare global {
  interface Window {
    __lumiQA: { set: (next: LumiProps) => void; unmount: () => void };
  }
}
let root: Root | undefined;
let props: LumiProps = { emotion: "idle", idleAction: "none", size: 380 };
const render = () => {
  root ??= createRoot(document.getElementById("root")!);
  flushSync(() => root!.render(<StrictMode><main id="specimen"><Lumi {...props} /></main><aside id="thumbnail"><Lumi animated={false} interactive={false} size={120} /></aside></StrictMode>));
};
window.__lumiQA = {
  set(next) { props = { ...props, ...next }; render(); },
  unmount() { root?.unmount(); root = undefined; },
};
render();

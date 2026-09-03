import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installMobileBridge } from "../mobile/installMobileBridge";
import "./styles.css";
import "./chat.css";
import "./lipsync.css";

const nativeDesktopBridge = Boolean(window.deskPet);
installMobileBridge();

if ("serviceWorker" in navigator && !nativeDesktopBridge) {
  let refreshingForServiceWorker = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshingForServiceWorker) return;
    refreshingForServiceWorker = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js").then((registration) => registration.update());
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);

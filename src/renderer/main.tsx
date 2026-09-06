import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installMobileBridge } from "../mobile/installMobileBridge";
import { installProactiveLiveConversation } from "../core/conversation/proactiveLive";
import { UserNameSetting } from "./components/UserNameSetting";
import "./styles.css";
import "./chat.css";
import "./lipsync.css";
import "./responsive.css";

const nativeDesktopBridge = Boolean(window.deskPet);
installMobileBridge();
installProactiveLiveConversation();

if ("serviceWorker" in navigator && !nativeDesktopBridge) {
  let refreshingForServiceWorker = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshingForServiceWorker) return;
    refreshingForServiceWorker = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./sw.js")
      .then((registration) => registration.update())
      .catch((error: unknown) => {
        // Offline caching is optional. A failed/aborted worker must not reject globally.
        console.warn("[deskpet:pwa] Service worker unavailable; running online only.", error);
      });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><><App /><UserNameSetting /></></React.StrictMode>,
);

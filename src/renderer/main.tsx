import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installMobileBridge } from "../mobile/installMobileBridge";
import "./styles.css";

const nativeDesktopBridge = Boolean(window.deskPet);
installMobileBridge();

if ("serviceWorker" in navigator && !nativeDesktopBridge) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("./sw.js"));
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);

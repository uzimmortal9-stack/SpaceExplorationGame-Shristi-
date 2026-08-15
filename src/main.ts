import "./style.css";
import { Game } from "./game";

console.log("Aurora Voyager — initializing.");

window.addEventListener("load", () => {
  try {
    new Game();
  } catch (err) {
    console.error("Failed to start Aurora Voyager:", err);
    const app = document.getElementById("app");
    if (app) {
      app.innerHTML =
        '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#ff2244;font-family:monospace;font-size:18px;text-align:center;padding:40px;">' +
        "Aurora Voyager failed to start. Open the browser console for details.<br><br>" +
        String(err) +
        "</div>";
    }
  }
});

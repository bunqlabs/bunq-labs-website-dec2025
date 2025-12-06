import GUI from "lil-gui";
import Stats from "https://unpkg.com/three@0.160.0/examples/jsm/libs/stats.module.js";

let guiInstance = null;
let statsInstance = null;
const folderRegistry = new Map();

export function getGui() {
  if (!guiInstance) {
    guiInstance = new GUI({ title: "Scenes" });
    guiInstance.domElement.style.zIndex = "3000";
  }
  return guiInstance;
}

export function getStats() {
  if (!statsInstance) {
    statsInstance = new Stats();
    statsInstance.showPanel(0);
    statsInstance.dom.style.cssText = "position:fixed;top:12px;left:12px;z-index:3001;";
    document.body.appendChild(statsInstance.dom);
  }
  return statsInstance;
}

export function createSceneFolder(label) {
  const gui = getGui();
  if (folderRegistry.has(label)) {
    return folderRegistry.get(label);
  }
  const folder = gui.addFolder(label);
  folderRegistry.set(label, folder);
  return folder;
}

import { MountainScene } from "./mountainScene.js";
import { GrassScene } from "./grassScene.js";
import { observeScenes } from "./sceneManager.js";
import { getStats, createSceneFolder } from "./ui.js";

function init() {
  const mountainEl = document.getElementById("mountain");
  const grassEl = document.getElementById("grass");

  const scenes = [];

  const stats = getStats();

  if (mountainEl) {
    const mountainFolder = createSceneFolder("Mountain");
    const mountainScene = new MountainScene(mountainEl, {
      stats,
      guiFolder: mountainFolder,
    });
    scenes.push({ element: mountainEl, instance: mountainScene });
  }

  if (grassEl) {
    const grassFolder = createSceneFolder("Grass");
    const grassScene = new GrassScene(grassEl, {
      stats,
      guiFolder: grassFolder,
    });
    scenes.push({ element: grassEl, instance: grassScene });
  }

  if (scenes.length) {
    observeScenes(scenes, {
      threshold: [0, 0.1, 0.2, 0.5, 1],
      rootMargin: "0px 0px -20% 0px",
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

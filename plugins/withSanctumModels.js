const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");
const xcode = require("xcode");

const MODEL_FILES = ["ggml-base.en.bin", "reflection-1b-q4.gguf"];
const IOS_PHASE_NAME = "Sanctum: Bundle Offline Models";
const OLD_IOS_PHASE_NAME = "Slated: Bundle Offline Models";

function assertModelFiles(projectRoot) {
  const modelDir = path.join(projectRoot, "assets", "models");
  for (const fileName of MODEL_FILES) {
    const filePath = path.join(modelDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing required default model file: ${filePath}`);
    }
  }
}

function findShellPhase(project, names) {
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};
  return Object.entries(phases).find(([, phase]) => phase && typeof phase === "object" && names.some((name) => phase.name === `"${name}"`));
}

function addIosModelBuildPhase(iosRoot, appName) {
  const preferredPbxPath = path.join(iosRoot, `${appName}.xcodeproj`, "project.pbxproj");
  const legacyPbxPath = path.join(iosRoot, "Slated.xcodeproj", "project.pbxproj");
  const pbxPath = fs.existsSync(preferredPbxPath) ? preferredPbxPath : legacyPbxPath;
  if (!fs.existsSync(pbxPath)) {
    throw new Error(`Missing iOS project file: ${preferredPbxPath}`);
  }

  const project = xcode.project(pbxPath);
  project.parseSync();

  const targetUuid = project.getFirstTarget().uuid;
  const shellScript = `set -euo pipefail; SRC_DIR="\${PROJECT_DIR}/../assets/models"; DEST_DIR="\${BUILT_PRODUCTS_DIR}/\${PRODUCT_NAME}.app/assets/models"; mkdir -p "$DEST_DIR"; for file in ${MODEL_FILES.join(" ")}; do if [ ! -f "$SRC_DIR/$file" ]; then echo "error: Missing required default model: $SRC_DIR/$file" >&2; exit 1; fi; cp -f "$SRC_DIR/$file" "$DEST_DIR/$file"; done`;
  const inputPaths = MODEL_FILES.map((fileName) => `"$(PROJECT_DIR)/../assets/models/${fileName}"`);
  const outputPaths = MODEL_FILES.map((fileName) => `"$(BUILT_PRODUCTS_DIR)/$(PRODUCT_NAME).app/assets/models/${fileName}"`);
  const existingPhase = findShellPhase(project, [IOS_PHASE_NAME, OLD_IOS_PHASE_NAME]);

  if (existingPhase) {
    const [uuid, phase] = existingPhase;
    phase.name = `"${IOS_PHASE_NAME}"`;
    phase.shellPath = "/bin/sh";
    phase.shellScript = `"${shellScript.replace(/"/g, '\\"')}"`;
    phase.inputPaths = inputPaths;
    phase.outputPaths = outputPaths;
    delete phase.alwaysOutOfDate;
    const target = project.hash.project.objects.PBXNativeTarget[targetUuid];
    if (target?.buildPhases) {
      for (const buildPhase of target.buildPhases) {
        if (buildPhase.value === uuid) {
          buildPhase.comment = IOS_PHASE_NAME;
        }
      }
    }
    project.hash.project.objects.PBXShellScriptBuildPhase[`${uuid}_comment`] = IOS_PHASE_NAME;
  } else {
    project.addBuildPhase([], "PBXShellScriptBuildPhase", IOS_PHASE_NAME, targetUuid, {
      shellPath: "/bin/sh",
      shellScript,
      inputPaths,
      outputPaths
    });
  }

  const serialized = project.writeSync().replace(/; explicitFileType = undefined/g, "");
  fs.writeFileSync(pbxPath, serialized);
}

function copyAndroidModels(projectRoot, androidRoot) {
  const sourceDir = path.join(projectRoot, "assets", "models");
  const destDir = path.join(androidRoot, "app", "src", "main", "assets", "models");
  fs.mkdirSync(destDir, { recursive: true });

  for (const fileName of MODEL_FILES) {
    fs.copyFileSync(path.join(sourceDir, fileName), path.join(destDir, fileName));
  }
}

module.exports = function withSanctumModels(config) {
  config = withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      assertModelFiles(projectRoot);
      addIosModelBuildPhase(modConfig.modRequest.platformProjectRoot, modConfig.modRequest.projectName || "Sanctum");
      return modConfig;
    }
  ]);

  return withDangerousMod(config, [
    "android",
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      assertModelFiles(projectRoot);
      copyAndroidModels(projectRoot, modConfig.modRequest.platformProjectRoot);
      return modConfig;
    }
  ]);
};

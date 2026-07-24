const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER = "// SLATED_WHISPER_OLD_ARCH_PATCH";

function patchWhisper(contents) {
  if (contents.includes(MARKER)) {
    return contents;
  }

  return contents.replace(
    "#include <cstring>\n\n#ifdef RCT_NEW_ARCH_ENABLED",
    `#include <cstring>\n\n${MARKER}\n#undef RCT_NEW_ARCH_ENABLED\n\n#ifdef RCT_NEW_ARCH_ENABLED`
  );
}

module.exports = function withWhisperOldArchPatch(config) {
  return withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const filePath = path.join(
        modConfig.modRequest.projectRoot,
        "node_modules",
        "whisper.rn",
        "ios",
        "RNWhisper.mm"
      );

      if (!fs.existsSync(filePath)) {
        throw new Error(`Missing whisper.rn source file: ${filePath}`);
      }

      const contents = fs.readFileSync(filePath, "utf8");
      fs.writeFileSync(filePath, patchWhisper(contents));
      return modConfig;
    }
  ]);
};

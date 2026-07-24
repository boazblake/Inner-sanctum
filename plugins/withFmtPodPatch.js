const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER = "# SLATED_FMT_CONSTEVAL_PATCH";

const PATCH = `
    ${MARKER}: Xcode + fmt can fail under C++20 consteval checks.
    # llama.rn forces C++20 for Pods; keep fmt building by disabling fmt consteval.
    fmt_base_header = File.join(installer.sandbox.root.to_s, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base_header)
      File.chmod(0644, fmt_base_header)
      contents = File.read(fmt_base_header)
      contents = contents.gsub('#  define FMT_USE_CONSTEVAL 1', '#  define FMT_USE_CONSTEVAL 0')
      File.write(fmt_base_header, contents)
    end

    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'

      target.build_configurations.each do |config|
        definitions = config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)']
        definitions = [definitions] unless definitions.is_a?(Array)
        definitions << 'FMT_USE_CONSTEVAL=0' unless definitions.include?('FMT_USE_CONSTEVAL=0')
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = definitions

        flags = config.build_settings['OTHER_CPLUSPLUSFLAGS'] || '$(inherited)'
        unless flags.include?('-DFMT_USE_CONSTEVAL=0')
          config.build_settings['OTHER_CPLUSPLUSFLAGS'] = "#{flags} -DFMT_USE_CONSTEVAL=0"
        end
      end
    end
`;

function insertPatch(contents) {
  if (contents.includes(MARKER)) {
    return contents;
  }

  const anchor = "    # This is necessary for Xcode 14, because it signs resource bundles by default";
  if (contents.includes(anchor)) {
    return contents.replace(anchor, `${PATCH}\n${anchor}`);
  }

  const postInstallEnd = "  end\nend";
  if (contents.includes(postInstallEnd)) {
    return contents.replace(postInstallEnd, `${PATCH}\n  end\nend`);
  }

  throw new Error("Could not find Podfile post_install hook for fmt patch");
}

module.exports = function withFmtPodPatch(config) {
  return withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, "Podfile");
      const contents = fs.readFileSync(podfilePath, "utf8");
      fs.writeFileSync(podfilePath, insertPatch(contents));
      return modConfig;
    }
  ]);
};

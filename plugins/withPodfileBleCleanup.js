const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SNIPPET_SENTINEL = "# Remove stray macOS resource-fork Podspecs that break CocoaPods.";

function injectCleanupSnippet(contents) {
  if (contents.includes(SNIPPET_SENTINEL)) {
    return contents;
  }

  const snippet = [
    SNIPPET_SENTINEL,
    "pre_install do",
    "  Dir.glob(File.join(__dir__, '..', 'node_modules', '**', '._*.podspec')).each do |file|",
    "    File.delete(file) if File.file?(file)",
    "  end",
    "end",
    "",
  ].join("\n");

  const platformRegex = /(platform\s*:ios[^\n]*\n)/;
  if (platformRegex.test(contents)) {
    return contents.replace(platformRegex, `$1\n${snippet}`);
  }

  return `${snippet}\n${contents}`;
}

module.exports = function withPodfileBleCleanup(config) {
  return withDangerousMod(config, ["ios", (config) => {
    const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");

    if (!fs.existsSync(podfilePath)) {
      return config;
    }

    const contents = fs.readFileSync(podfilePath, "utf8");
    fs.writeFileSync(podfilePath, injectCleanupSnippet(contents));

    return config;
  }]);
};

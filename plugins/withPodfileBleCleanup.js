const { withPodfile } = require("@expo/config-plugins");

const RESOURCE_FORK_SENTINEL = "._*.podspec";

function injectCleanupSnippet(contents) {
  if (contents.includes(RESOURCE_FORK_SENTINEL)) {
    return contents;
  }

  const regex = /(\s*)use_expo_modules!\b/;
  const match = contents.match(regex);
  if (!match) {
    return contents;
  }

  const indent = match[1] ?? "";
  const snippet = [
    `${indent}# Remove stray macOS resource-fork Podspecs that break CocoaPods.`,
    `${indent}Dir.glob(File.join(__dir__, '..', 'node_modules', '**', '._*.podspec')).each do |path|`,
    `${indent}  File.delete(path) if File.file?(path)`,
    `${indent}end`,
    "",
  ].join("\n");

  return contents.replace(regex, `${snippet}$&`);
}

module.exports = function withPodfileBleCleanup(config) {
  return withPodfile(config, (config) => {
    const podfile = config.modResults;

    if (podfile.language !== "ruby" || typeof podfile.contents !== "string") {
      return config;
    }

    podfile.contents = injectCleanupSnippet(podfile.contents);

    return config;
  });
};

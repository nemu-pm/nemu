const path = require("path");
require("./loadRootEnv.cjs")();
const { isWorkletsBundleModeEnabled } = require("./workletsBundleMode.cjs");

const expoPresetRoot = path.dirname(
  require.resolve("babel-preset-expo/package.json"),
);
const resolveExpoBabelPlugin = (name) =>
  require.resolve(name, { paths: [expoPresetRoot] });
const jscSyntaxTransformPlugins = [
  resolveExpoBabelPlugin("@babel/plugin-transform-optional-chaining"),
  resolveExpoBabelPlugin("@babel/plugin-transform-nullish-coalescing-operator"),
  resolveExpoBabelPlugin(
    "@babel/plugin-transform-logical-assignment-operators",
  ),
];
const jscWorkletSyntaxTransformPlugins = jscSyntaxTransformPlugins.map(
  (pluginPath, index) => [pluginPath, {}, `jsc-worklet-syntax-${index}`],
);

function transformBigIntLiteralsForJsc({ types: t }) {
  return {
    name: "transform-bigint-literals-for-jsc",
    visitor: {
      BigIntLiteral(path) {
        const raw = path.node.extra?.raw ?? `${path.node.value}n`;
        const value = raw.endsWith("n") ? raw.slice(0, -1) : raw;
        path.replaceWith(
          t.callExpression(t.identifier("BigInt"), [t.stringLiteral(value)]),
        );
      },
    },
  };
}

module.exports = function babelConfig(api) {
  const nodeEnv = process.env.NODE_ENV ?? "unknown";
  // Worklets Bundle Mode is opt-in (NEMU_WORKLETS_BUNDLE_MODE=1, never in
  // development); see workletsBundleMode.cjs. It evaluates the complete Metro
  // bundle inside a second runtime at launch and the JS thread waits for it,
  // which lengthened the native launch screen. Without it worklets are
  // serialized as usual (as in development) and the dual-reader alignment
  // bridge uses its JS-thread fallback.
  const workletsBundleModeEnabled = isWorkletsBundleModeEnabled();
  api.cache.using(
    () => `${nodeEnv}:${workletsBundleModeEnabled ? "bundle" : "serialized"}`,
  );
  return {
    // RN 0.85 sends Hermes V1's transform profile even when the native runtime
    // is third-party JSC. Force Expo's legacy/native-compatible transform set so
    // private fields and other Hermes-only syntax are lowered after Flow/TS
    // declarations have been stripped by the preset's ordered overrides.
    presets: [
      [
        "babel-preset-expo",
        { native: { unstable_transformProfile: "default" } },
      ],
    ],
    plugins: [
      transformBigIntLiteralsForJsc,
      ...jscSyntaxTransformPlugins,
      [
        "react-native-worklets/plugin",
        {
          bundleMode: workletsBundleModeEnabled,
          extraPlugins: jscWorkletSyntaxTransformPlugins,
        },
      ],
    ],
  };
};

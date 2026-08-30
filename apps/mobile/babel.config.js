const path = require("path");
require("./loadRootEnv.cjs")();

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
  api.cache.using(() => nodeEnv);
  // Worklets Bundle Mode evaluates the complete Metro bundle inside every
  // worklet runtime. That is appropriate for release, where the dual-reader
  // alignment worker imports the shared FFT implementation, but Metro HMR
  // retains each development bundle/runtime generation. On Android/JSC this
  // grew a normal debug session past 2 GiB and the OS killed the process.
  // Development uses ordinary serialized worklets; the alignment bridge has a
  // JS-thread fallback for that environment.
  const workletsBundleModeEnabled = nodeEnv !== "development";
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

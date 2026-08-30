const path = require("path");

const javascriptCoreRoot = path.resolve(
  __dirname,
  "../../node_modules/@react-native-community/javascriptcore"
);

module.exports = {
  dependencies: {
    "@react-native-community/javascriptcore": {
      root: javascriptCoreRoot,
      platforms: {
        android: {
          sourceDir: path.join(javascriptCoreRoot, "android"),
          packageImportPath: "import io.github.reactnativecommunity.javascriptcore.JSCPackage;",
          packageInstance: "new JSCPackage()",
        },
      },
    },
  },
};

import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";

const require = createRequire(import.meta.url);
const plugin = require(path.join(import.meta.dir, "with-third-party-notices.cjs")) as {
  addNoticesToProject: (project: unknown, platformProjectRoot: string, source?: string) => { writeSync: () => string };
  copyNoticesToAndroidAssets: (platformProjectRoot: string, source?: string) => void;
  NOTICES_FILE: string;
};
const xcode = require("xcode") as { project: (file: string) => { parseSync: () => unknown; writeSync: () => string } };

// The shape expo prebuild leaves: a main group, an app target with a
// resources build phase.
const PBXPROJ = `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 46;
	objects = {
/* Begin PBXBuildFile section */
		BUILDFILE000000000000001 /* Icon.png in Resources */ = {isa = PBXBuildFile; fileRef = FILEREF00000000000000001 /* Icon.png */; };
/* End PBXBuildFile section */
/* Begin PBXFileReference section */
		FILEREF00000000000000001 /* Icon.png */ = {isa = PBXFileReference; lastKnownFileType = image.png; name = Icon.png; path = Icon.png; sourceTree = "<group>"; };
/* End PBXFileReference section */
/* Begin PBXGroup section */
		MAINGROUP0000000000000001 = {
			isa = PBXGroup;
			children = (
				APPGROUP0000000000000001 /* app */,
			);
			sourceTree = "<group>";
		};
		APPGROUP0000000000000001 /* app */ = {
			isa = PBXGroup;
			children = (
			);
			name = app;
			path = app;
			sourceTree = "<group>";
		};
/* End PBXGroup section */
/* Begin PBXNativeTarget section */
		TARGET000000000000000001 /* app */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = CONFLIST0000000000000001;
			buildPhases = (
				RESPHASE0000000000000001 /* Resources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			name = app;
			productName = app;
			productType = "com.apple.product-type.application";
		};
/* End PBXNativeTarget section */
/* Begin PBXProject section */
		PROJECT0000000000000001 /* Project object */ = {
			isa = PBXProject;
			buildConfigurationList = CONFLIST0000000000000002;
			compatibilityVersion = "Xcode 3.2";
			mainGroup = MAINGROUP0000000000000001;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				TARGET000000000000000001 /* app */,
			);
		};
/* End PBXProject section */
/* Begin PBXResourcesBuildPhase section */
		RESPHASE0000000000000001 /* Resources */ = {
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXResourcesBuildPhase section */
	};
	rootObject = PROJECT0000000000000001 /* Project object */;
}
`;

function withTemporaryDirectory(run: (directory: string) => void) {
  const directory = mkdtempSync(path.join(tmpdir(), "nemu-notices-plugin-"));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("third-party notices plugin", () => {
  test("iOS: the notices are a resource of the app target, referenced from the app root", () => {
    withTemporaryDirectory((directory) => {
      const platformRoot = path.join(directory, "ios");
      mkdirSync(path.join(platformRoot, "app.xcodeproj"), { recursive: true });
      const projectFile = path.join(platformRoot, "app.xcodeproj", "project.pbxproj");
      writeFileSync(projectFile, PBXPROJ);
      const source = path.join(directory, plugin.NOTICES_FILE);
      writeFileSync(source, "THIRD-PARTY SOFTWARE NOTICES - nemu 0.1.0\n");

      const project = xcode.project(projectFile);
      project.parseSync();
      plugin.addNoticesToProject(project, platformRoot, source);
      const written = project.writeSync();

      expect(written).toMatch(/THIRD_PARTY_NOTICES\.txt in Resources \*\/ = \{isa = PBXBuildFile; fileRef = \w+ \/\* THIRD_PARTY_NOTICES\.txt \*\/; \}/);
      expect(written).toContain(`path = "../THIRD_PARTY_NOTICES.txt"`);
      const resources = written.slice(
        written.indexOf("Begin PBXResourcesBuildPhase section"),
        written.indexOf("End PBXResourcesBuildPhase section"),
      );
      expect(resources).toContain("THIRD_PARTY_NOTICES.txt in Resources");
    });
  });

  test("iOS: the shipped plugin points at the committed file", () => {
    withTemporaryDirectory((directory) => {
      const platformRoot = path.join(directory, "ios");
      mkdirSync(path.join(platformRoot, "app.xcodeproj"), { recursive: true });
      const projectFile = path.join(platformRoot, "app.xcodeproj", "project.pbxproj");
      writeFileSync(projectFile, PBXPROJ);
      const project = xcode.project(projectFile);
      project.parseSync();
      const mobileRoot = path.join(import.meta.dir, "..");
      plugin.addNoticesToProject(project, path.join(mobileRoot, "ios"));
      expect(project.writeSync()).toContain(`path = "../THIRD_PARTY_NOTICES.txt"`);
    });
  });

  test("Android: the file lands in app/src/main/assets", () => {
    withTemporaryDirectory((directory) => {
      const source = path.join(directory, plugin.NOTICES_FILE);
      writeFileSync(source, "THIRD-PARTY SOFTWARE NOTICES - nemu 0.1.0\n");
      const platformRoot = path.join(directory, "android");
      plugin.copyNoticesToAndroidAssets(platformRoot, source);
      const copy = path.join(platformRoot, "app", "src", "main", "assets", plugin.NOTICES_FILE);
      expect(existsSync(copy)).toBe(true);
      expect(readFileSync(copy, "utf8")).toBe(readFileSync(source, "utf8"));
    });
  });

  test("a missing notices file fails the prebuild", () => {
    withTemporaryDirectory((directory) => {
      expect(() => plugin.copyNoticesToAndroidAssets(directory, path.join(directory, "missing.txt"))).toThrow(
        "bun run notices",
      );
    });
  });

  test("app.json registers the plugin and the committed file exists", () => {
    const app = JSON.parse(readFileSync(path.join(import.meta.dir, "..", "app.json"), "utf8")) as {
      expo: { plugins: Array<string | [string, unknown]> };
    };
    expect(app.expo.plugins).toContain("./plugins/with-third-party-notices");
    expect(existsSync(path.join(import.meta.dir, "..", plugin.NOTICES_FILE))).toBe(true);
  });
});

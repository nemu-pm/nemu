import { describe, expect, test } from "bun:test";
import { transformFileSync } from "@babel/core";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const MOBILE_ROOT = join(import.meta.dir, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/**
 * The worklets Babel plugin binds a worklet's captured values in its body
 * (`const [X] = this.__closure`), which runs after the parameter defaults: a
 * default naming a captured value is a ReferenceError on the UI runtime, and a
 * worklet that throws inside a scroll handler aborts the app.
 */
function capturedNamesInDefaults(file: string): string[] {
  const out = transformFileSync(file, {
    babelrc: false,
    configFile: false,
    filename: file,
    presets: [["@babel/preset-typescript", { isTSX: true, allExtensions: true }]],
    plugins: ["@babel/plugin-syntax-jsx", "react-native-worklets/plugin"],
  });
  const hits: string[] = [];
  for (const match of out?.code?.matchAll(/code: "\(function [\w$]*\(([^)]*)\)\{const\[([^\]]*)\]=this\.__closure/g) ?? []) {
    const [, params, captured] = match;
    for (const name of captured.split(",").map((entry) => entry.trim().split(":")[0]).filter(Boolean)) {
      if (new RegExp(`=[^,]*\\b${name.replace(/\$/g, "\\$")}\\b`).test(params)) hits.push(name);
    }
  }
  return hits;
}

describe("worklet parameter defaults", () => {
  const files = ["src", "app"]
    .flatMap((dir) => sourceFiles(join(MOBILE_ROOT, dir)))
    .filter((file) => /["']worklet["']/.test(readFileSync(file, "utf8")));

  test("there are worklets to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    test(`${relative(MOBILE_ROOT, file)} captures nothing in a parameter default`, () => {
      expect(capturedNamesInDefaults(file)).toEqual([]);
    });
  }
});

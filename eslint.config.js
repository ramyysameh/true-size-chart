// ESLint 9 flat config. Same rule set as the old .eslintrc.cjs (ESLint 8).
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import importPlugin from "eslint-plugin-import";

export default tseslint.config(
  {
    // ESLint 8 also skipped everything in .gitignore (--ignore-path); the generated and local paths from it are here.
    ignores: [
      "build/",
      "app/build/",
      "public/build/",
      "public/_dev/",
      "dist/",
      "**/dist/",
      ".shopify/",
      ".react-router/",
      ".vercel/",
      ".superpowers/",
      ".claude/",
      "packages/engine/data/",
      "scripts/perf/results/",
      "extensions/true-size-chart/assets/",
      "**/*.yml",
    ],
  },

  // Base config
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021, ...globals.commonjs, shopify: "readonly" },
    },
  },

  // React
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ...react.configs.flat.recommended,
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ...react.configs.flat["jsx-runtime"],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    settings: {
      react: { version: "detect" },
      formComponents: ["Form"],
      linkComponents: [
        { name: "Link", linkAttribute: "to" },
        { name: "NavLink", linkAttribute: "to" },
      ],
      "import/resolver": { typescript: {} },
    },
    rules: {
      // v4's recommended pair only; v7's React Compiler rules are out of scope.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/no-unknown-property": ["error", { ignore: ["variant"] }],
    },
  },

  // Typescript
  ...tseslint.configs.recommended.map((c) => ({ ...c, files: ["**/*.{ts,tsx}"] })),
  {
    files: ["**/*.{ts,tsx}"],
    ...importPlugin.flatConfigs.recommended,
  },
  {
    files: ["**/*.{ts,tsx}"],
    ...importPlugin.flatConfigs.typescript,
  },
  {
    files: ["**/*.{ts,tsx}"],
    settings: {
      "import/internal-regex": "^~/",
      "import/resolver": {
        node: { extensions: [".ts", ".tsx"] },
        typescript: { alwaysTryTypes: true },
      },
    },
  },

  // Node
  {
    files: [
      "eslint.config.js",
      "vite.config.{js,ts}",
      ".graphqlrc.{js,ts}",
      "shopify.server.{js,ts}",
      "**/*.server.{js,ts}",
      // Node scripts. ESLint 9 lints .mjs by default; ESLint 8 skipped them.
      "**/*.mjs",
    ],
    languageOptions: { globals: globals.node },
  },
);

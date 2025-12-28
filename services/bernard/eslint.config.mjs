import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    name: "bernard/ignores",
    ignores: [
      "**/node_modules/**",
      "coverage/**",
      "dist/**",
      "eslint.config.mjs",
      "init-livingroom-adb.js"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map(config => ({
    ...config,
    files: ["**/*.{ts,tsx}"]
  })),
  {
    name: "bernard/typescript-overrides",
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }]
    }
  },
  {
    name: "bernard/test-overrides",
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "off",
      "no-console": "off"
    }
  }
);

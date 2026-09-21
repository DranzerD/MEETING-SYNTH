import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Not a JS/TS project -- without this, ESLint's default file
      // discovery walks into python_backend/.venv and lints vendored
      // package internals (e.g. torch's bundled .mjs utility scripts),
      // which has nothing to do with this app's code quality.
      "python_backend/**",
    ],
  },
];

export default eslintConfig;

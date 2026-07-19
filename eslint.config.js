import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Regel aus CALCULATION_RULES.md §8: unkontrollierte Float-Arithmetik für
// Geldbeträge ist verboten. parseFloat/Number() haben im Anwendungscode
// keinen legitimen Zweck für finanzielle Werte (siehe lib/money) und werden
// deshalb projektweit verboten. Zulässige technische Ausnahmen (z. B.
// Tests, die Fließkommazahlen absichtlich als Gegenbeispiel verwenden)
// erhalten gezielte eslint-disable-Kommentare mit Begründung.
const moneyBanRules = {
  "no-restricted-globals": [
    "error",
    {
      name: "parseFloat",
      message:
        "parseFloat ist fuer Geldbetraege verboten (CALCULATION_RULES.md #8). Nutze lib/money.",
    },
  ],
  "no-restricted-syntax": [
    "error",
    {
      selector: "CallExpression[callee.name='Number'][arguments.length>0]",
      message:
        "Number(x) ist fuer Geldbetraege verboten (CALCULATION_RULES.md #8). Nutze lib/money (Decimal).",
    },
    {
      selector: "CallExpression[callee.name='parseInt']",
      message:
        "parseInt ist fuer Geldbetraege/Mengen verboten. Nutze lib/money oder Number.parseInt nur fuer nicht-finanzielle Werte mit Radix.",
    },
  ],
};

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "node_modules", "**/*.config.js"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      ...moneyBanRules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Tests duerfen native Zahlen nutzen, um lib/money GEGEN Float-Drift zu testen.
      "no-restricted-globals": "off",
      "no-restricted-syntax": "off",
    },
  },
  {
    files: ["*.config.{js,ts}", "eslint.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
);

import expo from "eslint-config-expo/flat.js";

export default [
  ...expo,
  { ignores: ["node_modules/**", "dist/**", ".expo/**"] },
  {
    // Spec section 6: src/data is the only place that touches Supabase.
    files: ["**/*.{ts,tsx,js}"],
    ignores: ["src/data/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@supabase/*"],
              message: "Import Supabase only inside src/data. Screens and hooks use the data layer.",
            },
          ],
        },
      ],
    },
  },
];

// Creates (or resets) confirmed test members on the configured Supabase project and
// writes their credentials to .env.test.local for Playwright and manual runs.
// Usage: node scripts/seed-test-users.mjs
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

function loadEnv(file) {
  if (!existsSync(file)) {
    return {};
  }
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim()]),
  );
}

const env = { ...loadEnv(".env.local"), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const existing = loadEnv(".env.test.local");
const MEMBERS = [
  { key: "ALICE", username: "pulse_alice", displayName: "Alice Test" },
  { key: "BOB", username: "pulse_bob", displayName: "Bob Test" },
];

async function findUserByEmail(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw error;
    }
    const match = data.users.find((user) => user.email === email);
    if (match || data.users.length < 200) {
      return match ?? null;
    }
  }
}

// Letters and digits, matching the password policy.
function newPassword() {
  return `Pt${randomBytes(12).toString("base64url").replace(/[-_]/g, "x")}9`;
}

const lines = [];
for (const member of MEMBERS) {
  const email = existing[`E2E_${member.key}_EMAIL`] || `${member.username}@pulse.test`;
  const password = existing[`E2E_${member.key}_PASSWORD`] || newPassword();
  const user = await findUserByEmail(email);

  if (user) {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (error) {
      throw error;
    }
    console.log(`reset ${email}`);
  } else {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: member.username, display_name: member.displayName },
    });
    if (error) {
      throw error;
    }
    console.log(`created ${email}`);
  }

  lines.push(
    `E2E_${member.key}_EMAIL=${email}`,
    `E2E_${member.key}_PASSWORD=${password}`,
    `E2E_${member.key}_USERNAME=${member.username}`,
  );
}

writeFileSync(".env.test.local", `E2E_SUPABASE=1\n${lines.join("\n")}\n`);
console.log("wrote .env.test.local");

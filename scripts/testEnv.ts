/**
 * npm run test-env → the app on http://localhost:3001 against the local TEST
 * database (demo data). Prepare it first with: npm run test-env:setup
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { TEST_PGLITE_DIR } from "./testEnvPaths";

if (!existsSync(TEST_PGLITE_DIR)) {
  console.error("Test database not found. Run: npm run test-env:setup");
  process.exit(1);
}

console.log(`\n  TEST ENVIRONMENT → http://localhost:3001  (data: ${TEST_PGLITE_DIR})\n`);
const child = spawn("npx", ["next", "dev", "-p", "3001"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PGLITE_DIR: TEST_PGLITE_DIR, DATABASE_URL: "" },
});
child.on("exit", (code) => process.exit(code ?? 0));

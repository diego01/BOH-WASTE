import os from "node:os";
import path from "node:path";

/** Local test database: outside OneDrive, separate from the real local data. */
export const TEST_PGLITE_DIR = path.join(os.homedir(), "AppData", "Local", "boh-waste", "pglite-test");

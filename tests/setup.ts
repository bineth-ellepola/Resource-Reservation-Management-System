import "dotenv/config";

// Tests always run against TEST_DATABASE_URL, never the demo database.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error("TEST_DATABASE_URL is not set. See .env.example.");
}

// Integration tests truncate tables, so refuse anything that is not clearly a test database.
const databaseName = new URL(testUrl).pathname.slice(1);
if (!databaseName.endsWith("_test")) {
  throw new Error(`Refusing to run tests against "${databaseName}": database name must end with "_test".`);
}

process.env.DATABASE_URL = testUrl;

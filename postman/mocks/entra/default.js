/* eslint-disable @typescript-eslint/no-require-imports -- Postman executes CommonJS handlers. */
const { createFixtureServer } = require("../../../tests/fixtures/entra-provider.cjs");
createFixtureServer().listen(Number(process.env.PORT || 4117));

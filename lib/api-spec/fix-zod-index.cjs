// Fixes the api-zod index.ts after Orval regenerates it.
// Orval's split mode writes a workspace-level index that incorrectly includes
// a reference to `./generated/api.schemas` which does not exist for the zod client.
const fs = require("fs");
const path = require("path");
const indexPath = path.resolve(__dirname, "../../lib/api-zod/src/index.ts");
const correct = `export * from "./generated/api";\nexport * from "./categories";\n`;
fs.writeFileSync(indexPath, correct, "utf8");
console.log("Fixed api-zod/src/index.ts");

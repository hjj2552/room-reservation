import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(projectRoot, "src");
const failures = [];

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return entry.isFile() && entry.name.endsWith(".ts") ? [target] : [];
  });
}

function sourceFile(file) {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function typeName(node, file) {
  return node.type?.getText(file) ?? "";
}

const transportTypes = /\b(?:Request|Response|URL|Context|Hono|WorkerEnv|RateLimit)\b/;
for (const fileName of sourceFiles(path.join(sourceRoot, "core"))) {
  const file = sourceFile(fileName);
  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement)
      && /(?:hono|cloudflare)/i.test(String(statement.moduleSpecifier.getText(file)))
    ) {
      failures.push(`${path.relative(projectRoot, fileName)} imports a transport/platform module`);
    }
  }
  function inspectCore(node) {
    if (node.type && transportTypes.test(node.type.getText(file))) {
      failures.push(
        `${path.relative(projectRoot, fileName)} references transport type ${node.type.getText(file)}`,
      );
    }
    ts.forEachChild(node, inspectCore);
  }
  inspectCore(file);
}

const productServicePath = path.join(sourceRoot, "services", "product-service.ts");
const productServiceFile = sourceFile(productServicePath);
for (const statement of productServiceFile.statements) {
  if (!ts.isClassDeclaration(statement) || statement.name?.text !== "ProductService") continue;
  for (const member of statement.members) {
    if (!ts.isMethodDeclaration(member)) continue;
    const isPrivate = member.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword,
    );
    if (isPrivate) continue;
    for (const parameter of member.parameters) {
      const parameterType = typeName(parameter, productServiceFile);
      if (/\b(?:unknown|Request|Response|URL|Context|Hono)\b/.test(parameterType)) {
        failures.push(
          `ProductService.${member.name.getText(productServiceFile)} exposes ${parameterType}`,
        );
      }
    }
  }
}

for (const directory of ["core", "services", "application"]) {
  for (const fileName of sourceFiles(path.join(sourceRoot, directory))) {
    const text = fs.readFileSync(fileName, "utf8");
    if (/\bstatus\s*:\s*(?:400|401|403|404|409|422|429|500|503)\b/.test(text)) {
      failures.push(`${path.relative(projectRoot, fileName)} contains HTTP status mapping`);
    }
    if (/new\s+AppError\s*\(\s*\d+/.test(text)) {
      failures.push(`${path.relative(projectRoot, fileName)} constructs AppError with a status`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("HTTP, application, and platform dependency boundaries verified.");

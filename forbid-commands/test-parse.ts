import { initParser, parseBash } from "./src/parser";
import { enumerateCommands } from "./src/command-enumerator";
import { evaluateCommand, aggregateResults } from "./src/evaluator";
import { loadConfig } from "./src/config";

const samples = [
  "echo ok && sudo rm -rf /tmp/data",
  "echo $(rm -rf /tmp)",
  "AWS_PROFILE=prod aws s3 ls",
];

await initParser();
const config = loadConfig();
const allRules = [...config.deny, ...config.confirm, ...config.allow];

for (const cmd of samples) {
  const tree = parseBash(cmd);
  if (!tree) {
    console.log(`PARSE_FAIL: ${cmd}`);
    continue;
  }
  const commands = enumerateCommands(tree.rootNode);
  const results = commands.map(c => evaluateCommand(c, allRules, process.cwd()));
  const result = aggregateResults(results, config.decision_strategy);
  console.log("CMD:", cmd);
  console.log("ENUM:", commands.map(c => ({ text: c.text, context: c.context, wrapperKind: c.wrapperKind })));
  console.log("RESULT:", result);
  console.log("---");
}

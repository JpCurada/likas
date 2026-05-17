import {TOOL_REGISTRY, ToolDefinition} from './aiTools';

const GBNF_PRELUDE = `
ws       ::= [ \\t\\n]*
string   ::= "\\"" ( [^"\\\\] | "\\\\" . )* "\\""
boolean  ::= "true" | "false"
number   ::= "-"? ([0-9] | [1-9] [0-9]*) ("." [0-9]+)? ([eE] [-+]? [0-9]+)?
`;

const escapeForLiteral = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const propValueRule = (schema: any): string => {
  if (!schema) return 'string';
  if (schema.enum && Array.isArray(schema.enum)) {
    return schema.enum
      .map((v: any) => `"\\"${escapeForLiteral(String(v))}\\""`)
      .join(' | ');
  }
  switch (schema.type) {
    case 'boolean':
      return 'boolean';
    case 'number':
    case 'integer':
      return 'number';
    case 'string':
    default:
      return 'string';
  }
};

const argsRuleForTool = (tool: ToolDefinition, idx: number): {ruleName: string; rule: string} => {
  const ruleName = `args_${idx}`;
  const params = (tool.parameters as any)?.properties ?? {};
  const required: string[] = (tool.parameters as any)?.required ?? [];
  const keys = Object.keys(params);

  if (keys.length === 0) {
    return {ruleName, rule: `${ruleName} ::= "{}"`};
  }

  const pairs = keys.map(key => {
    const valueRule = propValueRule(params[key]);
    return `"\\"${key}\\"" ws ":" ws ( ${valueRule} )`;
  });

  // For simplicity, require all *required* keys in declared order and skip optionals.
  // The model is instructed to only include required args; this keeps the grammar tractable.
  const orderedPairs = (required.length > 0 ? required : keys)
    .map(k => {
      const i = keys.indexOf(k);
      return i >= 0 ? pairs[i] : null;
    })
    .filter(Boolean) as string[];

  const body = orderedPairs.join(' ws "," ws ');
  return {
    ruleName,
    rule: `${ruleName} ::= "{" ws ${body} ws "}"`,
  };
};

const toolCallRule = (tool: ToolDefinition, idx: number): {ruleName: string; rules: string[]} => {
  const {ruleName: argsName, rule: argsRule} = argsRuleForTool(tool, idx);
  const ruleName = `tool_${idx}`;
  const rule = `${ruleName} ::= "{" ws "\\"action\\"" ws ":" ws "\\"tool\\"" ws "," ws "\\"name\\"" ws ":" ws "\\"${tool.name}\\"" ws "," ws "\\"args\\"" ws ":" ws ${argsName} ws "}"`;
  return {ruleName, rules: [argsRule, rule]};
};

/**
 * Build a GBNF grammar that constrains the model to emit either:
 *   {"action":"speak","text":"..."}
 * or one of the registered tool calls:
 *   {"action":"tool","name":"<tool>","args":{...}}
 */
export const buildGrammar = (): string => {
  const toolPieces = TOOL_REGISTRY.map((tool, i) => toolCallRule(tool, i));
  const toolRuleNames = toolPieces.map(p => p.ruleName);
  const toolRuleBodies = toolPieces.flatMap(p => p.rules);

  const speakRule = `speak ::= "{" ws "\\"action\\"" ws ":" ws "\\"speak\\"" ws "," ws "\\"text\\"" ws ":" ws string ws "}"`;
  const rootAlts = ['speak', ...toolRuleNames].join(' | ');
  const rootRule = `root ::= ${rootAlts}`;

  return [
    GBNF_PRELUDE.trim(),
    speakRule,
    ...toolRuleBodies,
    rootRule,
  ].join('\n');
};

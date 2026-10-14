import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { ToolDefinition } from './types.js';

// Explicit registration keeps model arguments from becoming filesystem paths.
const names = ['stock-check', 'purchase-planning'] as const;
const skills = names.map((name) => {
  const source = readFileSync(new URL(`../skills/${name}/SKILL.md`, import.meta.url), 'utf8');
  // Application skills support these two plain, single-line frontmatter fields.
  const match = source.match(
    /^---\r?\nname: ([a-z0-9-]+)\r?\ndescription: ([^\r\n]+)\r?\n---\r?\n([\s\S]+)$/,
  );
  if (!match || match[1] !== name || !match[2].trim() || !match[3].trim())
    throw new Error(`SKILL_INVALID: Check name, description and instructions for ${name}.`);
  return Object.freeze({ name, description: match[2].trim(), instructions: match[3].trim() });
});

export function skillCatalog() {
  return skills.map(({ name, description }) => ({ name, description }));
}

export function readSkill(name: string) {
  const skill = skills.find((candidate) => candidate.name === name);
  if (!skill) throw new Error('SKILL_NOT_FOUND: Choose a registered skill from the catalog.');
  return skill;
}

export const skillRequestSchema = z.object({ name: z.enum(names) }).strict();
export const readSkillTool: ToolDefinition = {
  name: 'read_skill',
  description:
    'Load the instructions for a registered application skill before using its workflow. This local read does not access inventory or create an order.',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string', enum: [...names] } },
    required: ['name'],
    additionalProperties: false,
  },
};

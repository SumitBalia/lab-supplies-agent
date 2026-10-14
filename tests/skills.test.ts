import test from 'node:test';
import assert from 'node:assert/strict';
import { readSkill, readSkillTool, skillCatalog, skillRequestSchema } from '../server/skills.js';

test('Skill discovery exposes metadata and loads instructions only by registered name', () => {
  const catalog = skillCatalog();
  assert.deepEqual(
    catalog.map((skill) => skill.name),
    ['stock-check', 'purchase-planning'],
  );
  assert.ok(catalog.every((skill) => !('instructions' in skill)));
  for (const entry of catalog) {
    const loaded = readSkill(entry.name);
    assert.equal(loaded.description, entry.description);
    assert.ok(loaded.instructions.length > 0);
  }
});

test('Skill reads reject arbitrary paths, unregistered names and extra arguments', () => {
  for (const name of ['../../.env', '/etc/passwd', 'create_purchase_order', 'unknown']) {
    assert.throws(() => readSkill(name), /SKILL_NOT_FOUND/);
    assert.equal(skillRequestSchema.safeParse({ name }).success, false);
  }
  assert.equal(
    skillRequestSchema.safeParse({ name: 'stock-check', path: '../../.env' }).success,
    false,
  );
  assert.equal(readSkillTool.name, 'read_skill');
});

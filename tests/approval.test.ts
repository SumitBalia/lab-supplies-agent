import test from 'node:test';
import assert from 'node:assert/strict';
import { signApproval, verifyApproval } from '../server/approval.js';
const claims = {
  proposalId: 'proposal-1',
  userId: 'maya',
  sessionId: 'session-1',
  itemId: 'tips-200',
  quantity: 3,
  lab: 'Biology',
  unitPriceCents: 2450,
  expiresAt: Date.now() + 60000,
};
test('Approval binds exact purchase details and rejects tampering', () => {
  const token = signApproval(claims);
  assert.deepEqual(verifyApproval(token), claims);
  const body = Buffer.from(JSON.stringify({ ...claims, quantity: 99 })).toString('base64url');
  assert.throws(() => verifyApproval(`${body}.${token.split('.')[1]}`), /APPROVAL_INVALID/);
});
test('Expired approval and unsigned request are rejected', () => {
  assert.throws(
    () => verifyApproval(signApproval({ ...claims, expiresAt: Date.now() - 100 })),
    /APPROVAL_EXPIRED/,
  );
  assert.throws(() => verifyApproval('approve'), /APPROVAL_REQUIRED/);
});

import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
export interface ApprovalClaims {
  proposalId: string;
  userId: string;
  sessionId: string;
  itemId: string;
  quantity: number;
  lab: string;
  unitPriceCents: number;
  expiresAt: number;
}
export function signApproval(claims: ApprovalClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${createHmac('sha256', config.APPROVAL_SECRET).update(body).digest('base64url')}`;
}
export function verifyApproval(token: string): ApprovalClaims {
  const [body, signature] = token.split('.');
  if (!body || !signature)
    throw new Error('APPROVAL_REQUIRED: A service-issued approval is required.');
  const expected = createHmac('sha256', config.APPROVAL_SECRET).update(body).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
    throw new Error('APPROVAL_INVALID: Invalid approval signature.');
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as ApprovalClaims;
  if (claims.expiresAt < Date.now()) throw new Error('APPROVAL_EXPIRED: Ask for a new proposal.');
  return claims;
}

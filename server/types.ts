export interface Product {
  id: string;
  name: string;
  unit: string;
  stock: number;
  location: string;
  supplier: string;
  approved: boolean;
  priceCents: number;
  currency: 'USD';
  leadDays: number;
  keywords: string[];
}
export interface Proposal {
  id: string;
  userId: string;
  sessionId: string;
  itemId: string;
  itemName: string;
  supplier: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  totalCents: number;
  lab: string;
  status: 'pending' | 'approved' | 'completed' | 'declined';
  createdAt: number;
  expiresAt: number;
  orderId?: string;
}
export interface Order {
  id: string;
  itemId: string;
  quantity: number;
  lab: string;
  userId: string;
  totalCents: number;
  createdAt: number;
  idempotencyKey: string;
}
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export interface TraceEvent {
  kind: 'model' | 'tool' | 'approval' | 'request' | 'memory' | 'skill';
  name: string;
  latencyMs: number;
  args?: unknown;
  result?: unknown;
  error?: string;
  attempt?: number;
  tokens?: { input: number; output: number } | null;
}
export interface AgentReply {
  reply: string;
  proposal: Proposal | null;
  order?: Order;
  traceId: string;
  events: TraceEvent[];
}

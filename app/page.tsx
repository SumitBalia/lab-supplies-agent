'use client';
import { useEffect, useRef, useState } from 'react';
import type { AgentReply, ChatMessage, Proposal, TraceEvent, Order } from '../server/types';
type User = 'maya' | 'theo';
const names = { maya: 'Dr. Maya Chen', theo: 'Dr. Theo Patel' },
  tokens = { maya: 'demo-maya-token', theo: 'demo-theo-token' };
const money = (c: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
function Flask({ small = false }: { small?: boolean }) {
  return (
    <svg
      width={small ? 22 : 30}
      height={small ? 22 : 30}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 4h8M14 4v10L6.5 26a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L18 14V4M10 21h12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="15" cy="24" r="1" fill="currentColor" />
    </svg>
  );
}
export default function Page() {
  const [user, setUser] = useState<User>('maya'),
    [session, setSession] = useState(''),
    [token, setToken] = useState(tokens.maya);
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [proposal, setProposal] = useState<Proposal | null>(null),
    [lab, setLab] = useState<string | null>(null);
  const [provider, setProvider] = useState(''),
    [events, setEvents] = useState<TraceEvent[]>([]),
    [traceId, setTraceId] = useState(''),
    [orders, setOrders] = useState<Order[]>([]);
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [fault, setFault] = useState('off'),
    [view, setView] = useState<'assistant' | 'orders'>('assistant');
  const bottom = useRef<HTMLDivElement>(null),
    failedRequest = useRef<Record<string, unknown> | null>(null);
  async function api(path: string, body?: unknown, signal?: AbortSignal) {
    const res = await fetch(`/api/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Request failed.');
    return data;
  }
  useEffect(() => {
    setSession(localStorage.getItem(`bench-session-${user}`) ?? crypto.randomUUID());
  }, [user]);
  useEffect(() => {
    if (!session) return;
    localStorage.setItem(`bench-session-${user}`, session);
    const controller = new AbortController();
    setError('');
    api(`session?sessionId=${encodeURIComponent(session)}`, undefined, controller.signal)
      .then((data) => {
        setMessages(data.messages);
        setProposal(data.proposal);
        setLab(data.lab);
        setProvider(data.provider);
        setEvents(data.events);
        setTraceId(data.traceId);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    api('faults', undefined, controller.signal)
      .then((data) => setFault(data.mode))
      .catch(() => {});
    return () => controller.abort();
    // Identity changes start a fresh scoped fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, user, token]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, busy]);
  async function send(message: string, payload?: Record<string, unknown>) {
    if (busy || !message.trim() || !session) return;
    setBusy(true);
    setError('');
    const input = payload ?? {
      userId: user,
      sessionId: session,
      message,
      requestId: crypto.randomUUID(),
      ...(proposal ? { proposalId: proposal.id } : {}),
    };
    if (!payload) setMessages((m) => [...m, { role: 'user', content: message }]);
    setText('');
    try {
      const data: AgentReply = await api('chat', input);
      setMessages((m) => [...m, { role: 'assistant', content: data.reply }]);
      setProposal(data.proposal);
      setEvents(data.events);
      setTraceId(data.traceId);
      failedRequest.current = null;
      const state = await api(`session?sessionId=${encodeURIComponent(session)}`);
      setLab(state.lab);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
      failedRequest.current = input;
    } finally {
      setBusy(false);
    }
  }
  async function changeFault(mode: string) {
    setBusy(true);
    setError('');
    try {
      await api('faults', { mode });
      setFault(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change failures.');
    } finally {
      setBusy(false);
    }
  }
  async function showOrders() {
    setView('orders');
    setBusy(true);
    setError('');
    try {
      const data = await api('orders');
      setOrders(data.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load orders.');
    } finally {
      setBusy(false);
    }
  }
  function newSession() {
    setMessages([]);
    setProposal(null);
    setEvents([]);
    setTraceId('');
    setError('');
    failedRequest.current = null;
    setSession(crypto.randomUUID());
    setView('assistant');
  }
  const toolEvents = events.filter((e) => e.kind === 'tool'),
    totalTokens = events.reduce((n, e) => n + (e.tokens?.input ?? 0) + (e.tokens?.output ?? 0), 0);
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Bench home">
          <span className="brand-icon">
            <Flask />
          </span>
          bench<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">LAB OPERATIONS</div>
        <nav aria-label="Main navigation">
          <button
            className={view === 'assistant' ? 'nav-item active' : 'nav-item'}
            onClick={() => setView('assistant')}
          >
            <span>✧</span> Supplies assistant
          </button>
          <button
            className={view === 'orders' ? 'nav-item active' : 'nav-item'}
            disabled={busy}
            onClick={showOrders}
          >
            <span>▤</span> Purchase orders <span className="nav-arrow">↗</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="small-label">HOW BENCH WORKS</span>
          <ol>
            <li>Check your stock</li>
            <li>Find approved supplies</li>
            <li>Review the proposal</li>
            <li>You approve. We order.</li>
          </ol>
          <p>Every purchase needs your approval. You stay in control.</p>
        </div>
        <div className="profile">
          <span className="avatar">{user === 'maya' ? 'MC' : 'TP'}</span>
          <div>
            <label className="sr-only" htmlFor="user">
              Demo user
            </label>
            <select
              id="user"
              value={user}
              disabled={busy}
              onChange={(e) => {
                const u = e.target.value as User;
                setUser(u);
                setToken(tokens[u]);
                setSession('');
                setMessages([]);
                setProposal(null);
                setOrders([]);
                setView('assistant');
                setEvents([]);
                setLab(null);
                setError('');
                failedRequest.current = null;
              }}
            >
              <option value="maya">{names.maya}</option>
              <option value="theo">{names.theo}</option>
            </select>
            <span className="profile-sub">Local demo identity</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="slash">/</span>
            {view === 'assistant' ? 'Supplies assistant' : 'Purchase orders'}
          </div>
          <span className="status">
            <i /> Local environment
          </span>
        </header>
        <main>
          <div className="page-heading">
            <div className="eyebrow">A LITTLE LESS ADMIN. A LITTLE MORE SCIENCE.</div>
            <h1>
              {view === 'assistant' ? 'Let’s keep your lab moving.' : 'Your purchase orders.'}
            </h1>
            <p>
              {view === 'assistant'
                ? 'Find what’s on the shelf. Order what’s missing. Get back to your bench.'
                : 'Approved purchases, with a clear record of every order.'}
            </p>
          </div>
          <div className="workspace-grid">
            <section
              className="conversation-card"
              aria-label={view === 'assistant' ? 'Supply conversation' : 'Purchase order list'}
            >
              <div className="card-header">
                <span className="assistant-icon">
                  <Flask small />
                </span>
                <div>
                  <h2>{view === 'assistant' ? 'Bench assistant' : 'Order history'}</h2>
                  <span>
                    {provider === 'demo'
                      ? 'Deterministic demo · no language model'
                      : provider
                        ? `${provider} model provider`
                        : 'Connecting to your local agent'}
                  </span>
                </div>
                {view === 'assistant' && (
                  <button className="new-session" disabled={busy} onClick={newSession}>
                    ＋ New session
                  </button>
                )}
              </div>
              {view === 'assistant' ? (
                <>
                  <div className="messages" aria-live="polite">
                    {!messages.length && (
                      <div className="welcome">
                        <div className="welcome-symbol">✧</div>
                        <h3>What does your lab need?</h3>
                        <p>
                          I’ll check inventory and approved suppliers, then put together a proposal
                          for you to review.
                        </p>
                        <div className="suggestions">
                          <button
                            disabled={busy}
                            onClick={() => send('My lab is Molecular Biology')}
                          >
                            Remember my lab <span>↗</span>
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => send('Check stock of 200 µL pipette tips')}
                          >
                            Check pipette tips <span>↗</span>
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => send('I need 5 boxes of 200 µL pipette tips')}
                          >
                            Order lab supplies <span>↗</span>
                          </button>
                        </div>
                        <span className="welcome-foot">
                          Start by telling me your lab so I can remember it next time.
                        </span>
                      </div>
                    )}
                    {messages.map((m, i) => (
                      <div
                        className={`message ${m.role === 'user' ? 'user-message' : 'agent-message'}`}
                        key={i}
                      >
                        <span className="message-avatar">
                          {m.role === 'user' ? user === 'maya' ? 'MC' : 'TP' : <Flask small />}
                        </span>
                        <div>
                          <div className="message-name">{m.role === 'user' ? 'You' : 'Bench'}</div>
                          <p>{m.content}</p>
                        </div>
                      </div>
                    ))}
                    {proposal && (
                      <div className="proposal">
                        <div className="proposal-tag">
                          <span>◷</span>
                          {proposal.status === 'approved'
                            ? 'APPROVED · AWAITING CONFIRMATION'
                            : 'YOUR APPROVAL NEEDED'}
                        </div>
                        <h3>{proposal.itemName}</h3>
                        <div className="proposal-grid">
                          <div>
                            <span>Quantity</span>
                            <strong>
                              {proposal.quantity} × {proposal.unit}
                            </strong>
                          </div>
                          <div>
                            <span>Approved supplier</span>
                            <strong>{proposal.supplier}</strong>
                          </div>
                          <div>
                            <span>Deliver to</span>
                            <strong>{proposal.lab}</strong>
                          </div>
                          <div>
                            <span>Total · USD</span>
                            <strong className="proposal-price">{money(proposal.totalCents)}</strong>
                          </div>
                        </div>
                        <div className="proposal-actions">
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              send(proposal.status === 'approved' ? 'retry' : 'approve')
                            }
                          >
                            {proposal.status === 'approved' ? 'Retry safely' : 'Approve purchase'}{' '}
                            <span>↗</span>
                          </button>
                          {proposal.status === 'pending' && (
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() => send('decline')}
                            >
                              Decline
                            </button>
                          )}
                        </div>
                        <p className="proposal-foot">
                          {proposal.status === 'approved'
                            ? 'The same order ID is reused on every retry.'
                            : 'Saved across restarts. Approval expires in 24 hours.'}
                        </p>
                      </div>
                    )}
                    {busy && (
                      <div className="working">
                        <span className="spinner" /> Working through your request…
                      </div>
                    )}
                    <div ref={bottom} />
                  </div>
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      send(text);
                    }}
                  >
                    <label htmlFor="message" className="sr-only">
                      Message to Bench
                    </label>
                    <input
                      id="message"
                      placeholder="Ask about a reagent or consumable…"
                      value={text}
                      disabled={busy}
                      onChange={(e) => setText(e.target.value)}
                      maxLength={4000}
                    />
                    <button type="submit" aria-label="Send message" disabled={busy || !text.trim()}>
                      ↑
                    </button>
                  </form>
                  <div className="composer-foot">
                    One supply per request · Whole pack quantities · Nothing ordered without
                    approval
                  </div>
                </>
              ) : (
                <div className="order-list">
                  {orders.length ? (
                    orders.map((o) => (
                      <article key={o.id}>
                        <div>
                          <strong>{o.id}</strong>
                          <span>
                            {o.quantity} packs · {o.itemId} · {o.lab}
                          </span>
                        </div>
                        <strong>{money(o.totalCents)}</strong>
                      </article>
                    ))
                  ) : (
                    <div className="empty-orders">
                      No purchase orders to show.
                      <br />
                      <span>Approved orders will appear here.</span>
                    </div>
                  )}
                </div>
              )}
              {error && (
                <div className="error" role="alert">
                  {error}
                  {failedRequest.current && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        send(String(failedRequest.current!.message), failedRequest.current!)
                      }
                    >
                      Retry request
                    </button>
                  )}
                </div>
              )}
            </section>
            <aside className="details-panel">
              <section className="detail-card">
                <div className="detail-title">
                  <span>SESSION CONTEXT</span>
                  <span>◎</span>
                </div>
                <div className="context-row">
                  <span>Your lab</span>
                  <strong>{lab ?? 'Not set yet'}</strong>
                </div>
                <div className="context-row">
                  <span>Memory</span>
                  <strong>{lab ? 'Saved for this user' : 'Waiting for your lab'}</strong>
                </div>
                <p className="detail-note">
                  Your lab is remembered across sessions for 90 days. Each user has separate memory.
                </p>
                <details className="credentials">
                  <summary>Demo credentials & session</summary>
                  <label>
                    Bearer token
                    <input
                      value={token}
                      disabled={busy}
                      onChange={(e) => setToken(e.target.value)}
                    />
                  </label>
                  <span className="session-id">{session}</span>
                </details>
              </section>
              <section className="detail-card trace-card">
                <div className="detail-title">
                  <span>ACTIVITY TRACE</span>
                  <span className="live-badge">{events.length ? 'RECORDED' : 'READY'}</span>
                </div>
                {!events.length ? (
                  <div className="trace-empty">
                    <span>⌁</span>
                    <p>Every step, out in the open.</p>
                    <small>Tool calls, retries, and approval decisions will appear here.</small>
                  </div>
                ) : (
                  <>
                    <div className="trace-stats">
                      <div>
                        <strong>{toolEvents.filter((e) => !e.error).length}</strong>
                        <span>tool results</span>
                      </div>
                      <div>
                        <strong>{provider === 'demo' ? '—' : totalTokens}</strong>
                        <span>tokens</span>
                      </div>
                      <div>
                        <strong>
                          {(
                            (events.findLast((e) => e.kind === 'request')?.latencyMs ?? 0) / 1000
                          ).toFixed(1)}
                          s
                        </strong>
                        <span>duration</span>
                      </div>
                    </div>
                    <div className="trace-events">
                      {events
                        .filter((e) => e.kind !== 'model')
                        .map((e, i) => (
                          <details
                            className={e.error ? 'trace-event trace-error' : 'trace-event'}
                            key={i}
                          >
                            <summary>
                              <i />
                              <div>
                                <strong>{e.name.replaceAll('_', ' ')}</strong>
                                <span>
                                  {e.error
                                    ? 'Failed'
                                    : e.kind === 'tool'
                                      ? `MCP · attempt ${e.attempt ?? 1}`
                                      : e.kind}{' '}
                                  · {e.latencyMs} ms
                                </span>
                              </div>
                              <span>⌄</span>
                            </summary>
                            <pre>
                              {JSON.stringify(
                                { arguments: e.args, result: e.result, error: e.error },
                                null,
                                2,
                              )}
                            </pre>
                          </details>
                        ))}
                    </div>
                    <details className="model-details">
                      <summary>
                        Model calls ({events.filter((e) => e.kind === 'model').length})
                      </summary>
                      <pre>
                        {JSON.stringify(
                          events.filter((e) => e.kind === 'model'),
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                    <div className="trace-id">Trace {traceId.slice(0, 8)}</div>
                  </>
                )}
              </section>
              <section className={`failure-card ${fault !== 'off' ? 'failure-on' : ''}`}>
                <div>
                  <span className="small-label">FAILURE LAB</span>
                  <span className="test-badge">TEST ONLY</span>
                </div>
                <p>See how the agent handles a backend that doesn’t cooperate.</p>
                <label htmlFor="fault">Mock backend behavior</label>
                <select
                  id="fault"
                  disabled={busy}
                  value={fault}
                  onChange={(e) => changeFault(e.target.value)}
                >
                  <option value="off">Healthy · failures off</option>
                  <option value="flaky">Flaky · 429 → 503 → success</option>
                  <option value="rate-limit">Persistent rate limits</option>
                  <option value="server-error">Persistent server errors</option>
                  <option value="slow">Slow responses · timeout</option>
                  <option value="lost-response">Write committed · response lost</option>
                </select>
                <span className="failure-hint">
                  Retries are bounded. Purchase writes are deduplicated.
                </span>
              </section>
            </aside>
          </div>
          <footer>
            BENCH / LAB SUPPLIES AGENT<span>Local-first. Human-approved.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

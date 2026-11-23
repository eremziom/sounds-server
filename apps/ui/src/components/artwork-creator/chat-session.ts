import type { CreatorChatRequest, CreatorChatReply } from '../../../../artwork-contracts/index.d.ts';
import { createArtworkClient, type Message } from '../../api/artworks.ts';

export function chatPayload(message: Message): CreatorChatRequest | CreatorChatReply | { results: unknown[] } | null {
  if (!['chat-user', 'chat-assistant', 'chat-tool'].includes(message.role)) return null;
  try { return JSON.parse(message.text); } catch { return null; }
}
export function createChatSession(projectId: string, api = createArtworkClient()) {
  let state: { messages: Message[]; sending: boolean; applying: boolean; error: unknown; enabled: boolean; heavyJobsEnabled: boolean; uncertain: boolean } = {
    messages: [], sending: false, applying: false, error: null, enabled: false, heavyJobsEnabled: false, uncertain: false,
  };
  const initial = state, listeners = new Set<() => void>();
  let scope = new AbortController(), generation = 0, pending: CreatorChatRequest | null = null;
  const publish = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  async function refresh(signal: AbortSignal, ticket: number) {
    const messages = await api.messages(projectId, signal);
    if (!signal.aborted && ticket === generation) publish({ messages: messages.filter(m => m.role.startsWith('chat-')) });
  }
  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    getSnapshot: () => state, getServerSnapshot: () => initial,
    async load() {
      const signal = scope.signal, ticket = generation;
      try { const status = await api.chatStatus(projectId, signal); if (!signal.aborted && ticket === generation) publish(status); await refresh(signal, ticket); }
      catch (error) { if (!signal.aborted && ticket === generation) publish({ error }); }
    },
    async poll() { const signal = scope.signal, ticket = generation; try { await refresh(signal, ticket); } catch (error) { if (!signal.aborted && ticket === generation) publish({ error }); } },
    async send(input: Omit<CreatorChatRequest, 'requestId'>) {
      if (state.sending || state.applying || state.uncertain) return;
      pending = { ...input, requestId: crypto.randomUUID() };
      return this.retry();
    },
    async retry() {
      if (!pending || state.sending || state.applying) return;
      const request = pending, ticket = generation, signal = scope.signal;
      publish({ sending: true, error: null });
      try {
        await api.chat(projectId, request, signal);
        if (!signal.aborted && ticket === generation) { pending = null; publish({ uncertain: false }); await refresh(signal, ticket); }
      } catch (error) { if (!signal.aborted && ticket === generation) publish({ error, uncertain: true }); }
      finally { if (!signal.aborted && ticket === generation) publish({ sending: false }); }
    },
    async cancel(requestId: string) {
      const signal = scope.signal, ticket = generation;
      try { await api.cancelChat(projectId, requestId, signal); if (!signal.aborted && ticket === generation) { if (pending?.requestId === requestId) pending = null; publish({ error: null, uncertain: false }); await refresh(signal, ticket); } }
      catch (error) { if (!signal.aborted && ticket === generation) publish({ error }); }
    },
    async execute(requestId: string) {
      if (state.applying || state.sending) return;
      const signal = scope.signal, ticket = generation; publish({ applying: true, error: null });
      try { await api.executeChat(projectId, requestId, signal); await refresh(signal, ticket); }
      catch (error) { if (!signal.aborted && ticket === generation) publish({ error }); }
      finally { if (!signal.aborted && ticket === generation) publish({ applying: false }); }
    },
    async apply(requestId: string, jobId: string) {
      if (state.applying || state.sending) return;
      const signal = scope.signal, ticket = generation; publish({ applying: true, error: null });
      try { await api.applyChat(projectId, requestId, jobId, signal); await refresh(signal, ticket); }
      catch (error) { if (!signal.aborted && ticket === generation) publish({ error }); }
      finally { if (!signal.aborted && ticket === generation) publish({ applying: false }); }
    },
    suspend() { scope.abort(); scope = new AbortController(); generation++; publish({ sending: false, applying: false, uncertain: pending !== null }); },
  };
}

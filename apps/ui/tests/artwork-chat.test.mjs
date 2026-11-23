import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArtworkRequestError } from '../src/api/artworks.ts';
import { createChatSession } from '../src/components/artwork-creator/chat-session.ts';

const input = { baseRevisionId: 'r1', text: 'Niech dron leci po łuku.', mode: 'plan' };
function fixture(overrides = {}) {
  const calls = [];
  const api = { messages: async () => [{ id: 'note', role: 'user', text: 'Notatka' }, { id: 'reply', role: 'chat-assistant', text: '{"status":"answered"}' }],
    chatStatus: async () => ({ enabled: true, heavyJobsEnabled: false }), chat: async (_id, request) => { calls.push(request); return {}; },
    executeChat: async () => ({}), cancelChat: async () => ({}), ...overrides };
  return { session: createChatSession('p1', api), calls };
}
test('conversation reload restores history and excludes existing notes without model requests', async () => {
  const { session, calls } = fixture(); await session.load();
  assert.equal(session.getSnapshot().enabled, true); assert.equal(session.getSnapshot().messages.length, 1); assert.deepEqual(calls, []);
});
test('uncertain network outcome retries the identical turn and blocks a different message', async () => {
  const requests = []; let first = true;
  const { session } = fixture({ chat: async (_id, request) => { requests.push(request); if (first) { first = false; throw Error('Lost response'); } return {}; } });
  await session.send(input); assert.equal(session.getSnapshot().uncertain, true);
  await session.send({ ...input, text: 'Inny obiekt' }); assert.equal(requests.length, 1);
  await session.retry(); assert.deepEqual(requests[0], requests[1]); assert.equal(session.getSnapshot().uncertain, false);
});
test('a rejected turn allows a corrected submission with a new request ID', async () => {
  const requests = [];
  const rejection = new ArtworkRequestError(409, 'ARTWORK_REVISION_CONFLICT');
  const { session } = fixture({ chat: async (_id, request) => {
    requests.push(request);
    if (requests.length === 1) throw rejection;
    return {};
  } });
  await session.send(input);
  assert.equal(session.getSnapshot().error, rejection);
  assert.equal(session.getSnapshot().uncertain, false);
  await session.retry();
  await session.send({ ...input, baseRevisionId: 'r2' });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].baseRevisionId, 'r2');
  assert.notEqual(requests[0].requestId, requests[1].requestId);
});
test('history refresh failure leaves an acknowledged turn settled', async () => {
  const error = new Error('History unavailable');
  const { session, calls } = fixture({ messages: async () => { throw error; } });
  await session.send(input);
  assert.equal(session.getSnapshot().error, error);
  assert.equal(session.getSnapshot().uncertain, false);
  await session.retry();
  assert.equal(calls.length, 1);
  await session.send(input);
  assert.equal(calls.length, 2);
});
test('leaving during a response prevents late writes; reopening recovers from the API', async () => {
  let finish; const { session } = fixture({ chat: () => new Promise(resolve => { finish = resolve; }) });
  const send = session.send(input); session.suspend(); finish({}); await send;
  assert.equal(session.getSnapshot().messages.length, 0); assert.equal(session.getSnapshot().uncertain, true);
  await session.load(); assert.equal(session.getSnapshot().messages.length, 1);
});
test('execution failures remain errors and do not start another turn', async () => {
  const { session, calls } = fixture({ executeChat: async () => { throw Error('Revision conflict'); } });
  await session.execute('turn'); assert.ok(session.getSnapshot().error); assert.equal(session.getSnapshot().applying, false); assert.deepEqual(calls, []);
});

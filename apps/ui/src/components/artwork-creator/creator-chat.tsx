"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import type { ArtworkJobRecord, CreatorChatRequest, CreatorChatReply } from '../../../../artwork-contracts/index.d.ts';
import { ArtworkRequestError, artifactUrl, createArtworkClient, type Artifact } from '../../api/artworks';
import { useApplicationSession } from '../application/application-runtime';
import { Button } from '../ui/button';
import { chatPayload, createChatSession } from './chat-session';

export function CreatorChat({ projectId, revisionId, artifacts, jobs, disabled, onExecuted }: {
  projectId: string; revisionId: string | null; artifacts: Artifact[]; jobs: ArtworkJobRecord[]; disabled: boolean; onExecuted(): Promise<void>;
}) {
  const t = useTranslations('app.creator.chat'), { runProtected } = useApplicationSession();
  const [session] = useState(() => createChatSession(projectId, createArtworkClient(async (input, init) => {
    const result = await runProtected(() => fetch(input, init));
    if (!result.executed) throw new ArtworkRequestError(401, 'AUTH_REQUIRED');
    return result.value;
  })));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getServerSnapshot);
  const [text, setText] = useState(''), [mode, setMode] = useState<'discuss' | 'plan'>('discuss');
  const [imageId, setImageId] = useState(''), [point, setPoint] = useState<{ x: number; y: number }>();
  const image = artifacts.find(a => a.id === imageId), imageElement = useRef<HTMLImageElement>(null);
  useEffect(() => {
    void session.load(); let stopped = false, timer: ReturnType<typeof setTimeout>;
    async function poll() { await session.poll(); if (!stopped) timer = setTimeout(poll, 3000); }
    timer = setTimeout(poll, 3000);
    return () => { stopped = true; clearTimeout(timer); session.suspend(); };
  }, [session]);
  const errorKey = state.error instanceof ArtworkRequestError && state.error.code === 'ARTWORK_CHAT_MEMORY_DEFERRED' ? 'memoryDeferred' :
    state.error instanceof ArtworkRequestError && state.error.status === 409 ? 'conflict' : 'error';
  return <section data-creator-chat className="min-w-0 space-y-3 rounded border p-3 [&_button]:h-auto [&_button]:whitespace-normal">
    <h3 className="font-semibold">{t('title')}</h3>
    <p className="text-sm text-muted-foreground">{t('help')}</p>
    {!state.enabled && <p role="status">{t('disabled')}</p>}
    {state.error ? <p role="alert">{t(errorKey)}</p> : null}
    <ol className="max-h-96 space-y-3 overflow-auto" aria-live="polite">
      {[...state.messages].reverse().map(message => {
        const payload = chatPayload(message); if (!payload) return null;
        if (message.role === 'chat-user') return <li key={message.id} className="whitespace-pre-wrap rounded border p-2 text-sm"><strong>{t('you')}</strong><p>{(payload as CreatorChatRequest).text}</p></li>;
        if (message.role === 'chat-tool') {
          const execution = payload as { requestId: string; results: { tool: string; jobId?: string; state?: string; errorCode?: string }[] };
          return <li key={message.id} className="space-y-2 rounded border p-2 text-sm"><strong>{t('execution')}</strong><p>{t('executionHelp')}</p>
            {execution.results.map((result, i) => {
              const job = jobs.find(j => j.id === result.jobId);
              const jobState = job?.state ?? (['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(result.state ?? '') ? result.state as ArtworkJobRecord['state'] : 'queued');
              return <div key={i}><p>{result.tool} · {result.errorCode ? t('toolFailed') : t(`jobStates.${jobState}`)}</p>
                {job?.state === 'succeeded' && ['setTravel', 'setBehaviors'].includes(job.tool) && <Button type="button" data-chat-apply disabled={disabled || state.applying || job.baseRevisionId !== revisionId} onClick={async () => { await session.apply(execution.requestId, job.id); await onExecuted(); }}>{t('apply')}</Button>}
              </div>;
            })}
          </li>;
        }
        const reply = payload as CreatorChatReply;
        const stale = reply.baseRevisionId !== revisionId;
        return <li key={message.id} className="space-y-2 rounded border p-2 text-sm" data-chat-reply={reply.requestId}>
          <strong>{t(`states.${reply.status}`)}</strong><p className="whitespace-pre-wrap">{reply.text}</p>
          {reply.status === 'failed' && <p>{t('modelFailed')}</p>}
          {reply.actions.map((action, index) => <details key={index}><summary>{action.tool}</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(action, null, 2)}</pre></details>)}
          {reply.status === 'proposed' && <>
            {stale && <p>{t('conflict')}</p>}
            <Button type="button" data-chat-execute disabled={disabled || stale || state.applying || state.sending} onClick={async () => { await session.execute(reply.requestId); await onExecuted(); }}>{t('execute')}</Button>
          </>}
          {['pending', 'proposed'].includes(reply.status) && <Button type="button" variant="outline" disabled={state.applying} onClick={() => void session.cancel(reply.requestId)}>{t('cancel')}</Button>}
        </li>;
      })}
    </ol>
    {state.sending && <p role="status">{t('thinking')}</p>}
    {state.uncertain && <Button type="button" disabled={state.sending} onClick={() => void session.retry()}>{t('retry')}</Button>}
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault(); if (!text.trim()) return;
      void session.send({ text: text.trim(), mode, baseRevisionId: revisionId, ...(imageId ? { imageArtifactId: imageId, ...(point ? { point } : {}) } : {}) });
    }}>
      <label className="block text-sm">{t('mode')}<select data-chat-mode value={mode} onChange={event => setMode(event.target.value as typeof mode)} className="mt-1 w-full rounded border bg-background p-2">
        <option value="discuss">{t('discuss')}</option><option value="plan">{t('plan')}</option>
      </select></label>
      <label className="block text-sm">{t('image')}<select data-chat-image value={imageId} onChange={event => { setImageId(event.target.value); setPoint(undefined); }} className="mt-1 w-full rounded border bg-background p-2">
        <option value="">{t('noImage')}</option>{artifacts.filter(a => a.kind === 'image' && a.mimeType === 'image/png').map((a, index) => <option key={a.id} value={a.id}>{index + 1} · {a.width} × {a.height}</option>)}
      </select></label>
      {image && <div className="space-y-1">
        <p className="text-xs">{t('pointHelp')}</p>
        <img ref={imageElement} /* eslint-disable-line @next/next/no-img-element -- Private source image for native-coordinate pointing. */
          src={artifactUrl(projectId, image.id)} alt={t('image')} className="block h-auto max-w-full cursor-crosshair" onClick={event => {
            const rect = imageElement.current!.getBoundingClientRect();
            setPoint({ x: Math.max(0, Math.min(image.width! - 1, Math.floor((event.clientX - rect.left) / rect.width * image.width!))),
              y: Math.max(0, Math.min(image.height! - 1, Math.floor((event.clientY - rect.top) / rect.height * image.height!))) });
          }} />
        {point && <Button type="button" variant="outline" onClick={() => setPoint(undefined)}>{t('clearPoint', point)}</Button>}
      </div>}
      <label className="block text-sm">{t('message')}<textarea data-chat-text value={text} onChange={event => setText(event.target.value)} required maxLength={4000} rows={3} className="mt-1 w-full rounded border bg-background p-2" /></label>
      <Button data-chat-send type="submit" disabled={disabled || !state.enabled || !text.trim() || state.sending || state.applying || state.uncertain}>{t('send')}</Button>
    </form>
  </section>;
}

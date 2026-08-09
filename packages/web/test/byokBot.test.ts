import { describe, expect, it, vi } from 'vitest';
import { endTurn, mintArrowId, step } from '@arrows/contracts';
import type { Move } from '@arrows/contracts';
import { makeMatch, makeTiling } from '@arrows/geometry-tiling';
import { makeRules } from '@arrows/rules-core';
import {
  buildUserPrompt,
  chooseLlmMove,
  fetchLlmMoveIndex,
  formatLegalMoves,
  parseMoveIndex,
  playLlmBotTurn,
  postChatCompletions,
  snapshotForPrompt,
  testByokConnection,
  type FetchLike,
} from '../src/byokBot';
import {
  DEFAULT_BYOK,
  BYOK_UPSTREAM_HEADER,
  chatCompletionsUrl,
  isAllowedByokUpstream,
  isByokReady,
  type ByokConfig,
} from '../src/byokConfig';

const readyConfig = (over: Partial<ByokConfig> = {}): ByokConfig => ({
  ...DEFAULT_BYOK,
  enabled: true,
  apiKey: 'sk-test',
  model: 'test-model',
  ...over,
});

const jsonResponse = (content: string): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('byokConfig', () => {
  it('requires enabled url key and model', () => {
    expect(isByokReady(DEFAULT_BYOK)).toBe(false);
    expect(isByokReady(readyConfig())).toBe(true);
    expect(isByokReady(readyConfig({ apiKey: '  ' }))).toBe(false);
  });

  it('joins chat completions without a double slash', () => {
    expect(chatCompletionsUrl('https://api.openai.com/v1/')).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });

  it('allowlists common OpenAI-compatible hosts', () => {
    expect(isAllowedByokUpstream('https://api.openai.com/v1/chat/completions')).toBe(true);
    expect(isAllowedByokUpstream('https://integrate.api.nvidia.com/v1/chat/completions')).toBe(
      true,
    );
    expect(isAllowedByokUpstream('https://evil.example/v1/chat/completions')).toBe(false);
  });
});

describe('byokBot parsing', () => {
  it('formats legal moves with stable indices', () => {
    const from = mintArrowId('a');
    const exit = mintArrowId('b');
    const moves: Move[] = [step(from, exit, 1), endTurn()];
    expect(formatLegalMoves(moves)).toContain('0: step');
    expect(formatLegalMoves(moves)).toContain('1: endTurn');
  });

  it('parses the first in-range index from model prose', () => {
    expect(parseMoveIndex('3', 5)).toBe(3);
    expect(parseMoveIndex('I choose 2 thanks', 4)).toBe(2);
    expect(parseMoveIndex('99', 3)).toBeUndefined();
    expect(parseMoveIndex('nope', 3)).toBeUndefined();
  });

  it('builds a prompt that lists every offered move', () => {
    const rules = makeRules(makeTiling());
    const opening = makeMatch();
    const seat = opening.activePlayer;
    const moves = rules.legalMoves(opening);
    const prompt = buildUserPrompt(opening, seat, moves);
    expect(prompt).toContain('LEGAL_MOVES');
    expect(prompt).toContain('0:');
    const snap = snapshotForPrompt(opening, seat);
    expect(typeof snap).toBe('object');
    expect(snap).not.toBeNull();
    if (typeof snap === 'object' && snap !== null && 'groups' in snap) {
      expect(Array.isArray(snap.groups)).toBe(true);
    }
    expect(moves.length).toBeGreaterThan(0);
  });
});

describe('byokBot fetch + fallback', () => {
  it('posts via proxy URL and sets the upstream header', async () => {
    const spy = vi.fn((url: string, init?: RequestInit) => {
      void url;
      void init;
      return Promise.resolve(jsonResponse('0'));
    });
    await postChatCompletions(
      readyConfig({ proxyUrl: 'https://relay.example/byok' }),
      { model: 'x' },
      spy,
    );
    expect(spy).toHaveBeenCalledOnce();
    const call = spy.mock.calls[0];
    expect(call?.[0]).toBe('https://relay.example/byok');
    const headers = call?.[1]?.headers as Record<string, string>;
    expect(headers[BYOK_UPSTREAM_HEADER]).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('reads an index from a chat-completions response', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(jsonResponse('1'));
    const spy = vi.fn(fetchImpl);
    const result = await fetchLlmMoveIndex(readyConfig(), 'prompt', 4, spy);
    expect(result).toEqual({ ok: true, index: 1 });
    expect(spy).toHaveBeenCalledOnce();
  });

  it('falls back to the heuristic when the model is unreachable', async () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const opening = makeMatch();
    const me = opening.activePlayer;
    const fetchImpl: FetchLike = () => Promise.reject(new Error('network'));
    const choice = await chooseLlmMove(geometry, rules, opening, me, readyConfig(), fetchImpl);
    expect(choice.source).toBe('heuristic');
    expect(choice.reason).toMatch(/fetch failed/);
    expect(['step', 'endTurn', 'skip']).toContain(choice.move.kind);
  });

  it('probes the connection with a tiny completion', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(jsonResponse('0'));
    const result = await testByokConnection(readyConfig(), fetchImpl);
    expect(result).toEqual({ ok: true, sample: '0' });
  });

  it('reports HTTP 401 from the probe', async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'Incorrect API key' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    const result = await testByokConnection(readyConfig(), fetchImpl);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('HTTP 401');
    expect(result.reason).toContain('Incorrect API key');
  });

  it('plays a full LLM turn using mocked endTurn picks then hands the seat back', async () => {
    const geometry = makeTiling();
    const rules = makeRules(geometry);
    const opening = makeMatch();
    const A = opening.players[0];
    const B = opening.players[1];
    expect(A).toBeDefined();
    expect(B).toBeDefined();
    if (A === undefined || B === undefined) return;

    const afterA = rules.apply(opening, endTurn());
    expect(afterA.activePlayer).toBe(B);

    const fetchImpl: FetchLike = (_url, init) => {
      const bodyUnknown: unknown = init?.body;
      const raw = typeof bodyUnknown === 'string' ? bodyUnknown : '';
      const match = /(\d+): endTurn/.exec(raw);
      return Promise.resolve(jsonResponse(match?.[1] ?? '0'));
    };
    const spy = vi.fn(fetchImpl);

    const { state, moves, llmHits, llmFallbacks } = await playLlmBotTurn(
      geometry,
      rules,
      afterA,
      B,
      readyConfig(),
      spy,
    );
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.some((m) => m.kind === 'endTurn')).toBe(true);
    expect(state.activePlayer).toBe(A);
    expect(spy.mock.calls.length).toBeGreaterThan(0);
    expect(llmHits).toBeGreaterThan(0);
    expect(llmFallbacks).toBe(0);
  });
});

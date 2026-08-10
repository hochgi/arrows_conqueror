/**
 * plan → commit → validate → (optional retry)
 *
 * Plan may ramble (thinking OK). Commit is forced JSON with thinking off.
 * Validation is pure: index ∈ [0, moveCount).
 */

/** @typedef {{ step: string, ms?: number, ok: boolean, detail?: string }} TraceStep */

/**
 * @param {string} text
 * @param {number} length
 * @returns {number | undefined}
 */
export const parseMoveIndex = (text, length) => {
  if (!Number.isInteger(length) || length <= 0) return undefined;
  const accept = (raw) => {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n < length ? n : undefined;
  };
  const trimmed = String(text ?? '').trim();
  if (/^\d+$/.test(trimmed)) return accept(trimmed);

  const tagged = [];
  for (const m of trimmed.matchAll(/\{\s*"move"\s*:\s*(\d+)\s*\}/g)) {
    const n = accept(m[1]);
    if (n !== undefined) tagged.push(n);
  }
  for (const m of trimmed.matchAll(/"move"\s*:\s*(\d+)/g)) {
    const n = accept(m[1]);
    if (n !== undefined) tagged.push(n);
  }
  for (const m of trimmed.matchAll(/<<<MOVE:(\d+)>>>/g)) {
    const n = accept(m[1]);
    if (n !== undefined) tagged.push(n);
  }
  if (tagged.length > 0) return tagged[tagged.length - 1];

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (/^\d+$/.test(line)) {
      const n = accept(line);
      if (n !== undefined) return n;
    }
    const legacy = /^(?:ANSWER|INDEX|MOVE|PICK)\s*[:=]\s*(\d+)\s*$/i.exec(line);
    if (legacy?.[1] !== undefined) {
      const n = accept(legacy[1]);
      if (n !== undefined) return n;
    }
  }
  return undefined;
};

const chatUrl = (upstream) => {
  const base = upstream.replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
};

/**
 * @param {{
 *   upstream: string,
 *   apiKey: string,
 *   model: string,
 *   messages: { role: string, content: string }[],
 *   maxTokens: number,
 *   jsonObject?: boolean,
 *   thinkingOff?: boolean,
 * }} args
 */
const chat = async (args) => {
  const body = {
    model: args.model,
    temperature: 0,
    max_tokens: args.maxTokens,
    messages: args.messages,
  };
  if (args.jsonObject) body.response_format = { type: 'json_object' };
  if (args.thinkingOff) {
    body.chat_template_kwargs = {
      enable_thinking: false,
      force_nonempty_content: true,
    };
    body.extra_body = {
      chat_template_kwargs: {
        enable_thinking: false,
        force_nonempty_content: true,
      },
    };
  }

  const t0 = Date.now();
  const response = await fetch(chatUrl(args.upstream), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const rawText = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      ms,
      error: `upstream not JSON (HTTP ${String(response.status)})`,
      text: rawText.slice(0, 400),
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      ms,
      error: `HTTP ${String(response.status)}`,
      text: JSON.stringify(parsed).slice(0, 400),
    };
  }
  const message = parsed?.choices?.[0]?.message ?? {};
  const content = typeof message.content === 'string' ? message.content : '';
  const reasoning =
    typeof message.reasoning_content === 'string' ? message.reasoning_content : '';
  const text = content.trim().length > 0 ? content : reasoning;
  return { ok: true, ms, text, finish: parsed?.choices?.[0]?.finish_reason };
};

const whyFrom = (text) => {
  try {
    const m = /"why"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(text);
    if (m?.[1] !== undefined) return JSON.parse(`"${m[1]}"`);
  } catch {
    // ignore
  }
  return undefined;
};

/**
 * @param {{
 *   upstream: string,
 *   apiKey: string,
 *   model: string,
 *   seat: string,
 *   moveCount: number,
 *   system: string,
 *   user: string,
 *   plan?: boolean,
 * }} args
 */
export const pickMove = async (args) => {
  /** @type {TraceStep[]} */
  const trace = [];
  let planDraft = '';

  if (args.plan !== false) {
    const plan = await chat({
      upstream: args.upstream,
      apiKey: args.apiKey,
      model: args.model,
      maxTokens: 768,
      // Leave thinking to the LiteLLM profile — plan is allowed to ramble.
      messages: [
        {
          role: 'system',
          content: `You are seat ${args.seat} planning one Arrows Conqueror move.
Read STATE_JSON and LEGAL_MOVES. Think about spawners, cuts, closes, powers of 2.
End with a single line: <<<MOVE:N>>> where N is a LEGAL_MOVES index.
Do not invent moves outside the list.`,
        },
        { role: 'user', content: args.user },
      ],
    });
    if (plan.ok) {
      planDraft = plan.text;
      const tentative = parseMoveIndex(plan.text, args.moveCount);
      trace.push({
        step: 'plan',
        ms: plan.ms,
        ok: true,
        detail:
          tentative !== undefined
            ? `tentative=${String(tentative)}`
            : `no tag (len=${String(plan.text.length)})`,
      });
    } else {
      trace.push({
        step: 'plan',
        ms: plan.ms,
        ok: false,
        detail: plan.error ?? 'plan failed',
      });
    }
  }

  const commitMessages = [
    {
      role: 'system',
      content: `${args.system}

You are committing the final pick for seat ${args.seat}.
Return ONLY JSON: {"move":N,"why":"short"}
N must be in 0..${String(args.moveCount - 1)}.`,
    },
    {
      role: 'user',
      content:
        planDraft.length > 0
          ? `PLAN_DRAFT (may be truncated):\n${planDraft.slice(0, 1500)}\n\n${args.user}\n\nCommit {"move":N,"why":"short"}.`
          : `${args.user}\n\nCommit {"move":N,"why":"short"}.`,
    },
  ];

  const tryCommit = async (extraHint) => {
    const messages =
      extraHint === undefined
        ? commitMessages
        : [
            commitMessages[0],
            {
              role: 'user',
              content: `${commitMessages[1].content}\n\nPREVIOUS_INVALID: ${extraHint}\nPick a valid index.`,
            },
          ];
    return chat({
      upstream: args.upstream,
      apiKey: args.apiKey,
      model: args.model,
      maxTokens: 128,
      jsonObject: true,
      thinkingOff: true,
      messages,
    });
  };

  let commit = await tryCommit(undefined);
  if (!commit.ok) {
    trace.push({
      step: 'commit',
      ms: commit.ms,
      ok: false,
      detail: commit.error ?? 'commit failed',
    });
    return { ok: false, error: commit.error ?? 'commit failed', trace };
  }

  let index = parseMoveIndex(commit.text, args.moveCount);
  trace.push({
    step: 'commit',
    ms: commit.ms,
    ok: index !== undefined,
    detail: index !== undefined ? `move=${String(index)}` : commit.text.slice(0, 160),
  });

  if (index === undefined) {
    const retry = await tryCommit(`could not parse ${JSON.stringify(commit.text.slice(0, 200))}`);
    if (!retry.ok) {
      trace.push({
        step: 'commit_retry',
        ms: retry.ms,
        ok: false,
        detail: retry.error ?? 'retry failed',
      });
      return { ok: false, error: 'commit retry failed', trace };
    }
    index = parseMoveIndex(retry.text, args.moveCount);
    commit = retry;
    trace.push({
      step: 'commit_retry',
      ms: retry.ms,
      ok: index !== undefined,
      detail: index !== undefined ? `move=${String(index)}` : retry.text.slice(0, 160),
    });
  }

  if (index === undefined) {
    trace.push({ step: 'validate', ok: false, detail: 'no parseable move' });
    return { ok: false, error: 'unusable model reply after plan+commit', trace };
  }

  trace.push({ step: 'validate', ok: true, detail: `move=${String(index)}` });
  return {
    ok: true,
    move: index,
    why: whyFrom(commit.text),
    trace,
  };
};

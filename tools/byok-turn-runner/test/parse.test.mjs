import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseMoveIndex } from '../src/orchestrate.mjs';

describe('parseMoveIndex', () => {
  it('reads JSON move', () => {
    assert.equal(parseMoveIndex('{"move":2,"why":"x"}', 5), 2);
  });

  it('reads MOVE tag', () => {
    assert.equal(parseMoveIndex('thinking\n<<<MOVE:1>>>\n', 4), 1);
  });

  it('ignores tiling digits in prose', () => {
    assert.equal(
      parseMoveIndex('group at tiling:a:-4,6,0 with heads', 20),
      undefined,
    );
  });
});

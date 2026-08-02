import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/** Pure helpers mirrored by SiteTrendChart rendering rules. */
export function shouldDrawSinglePointMarker(pointCount: number) {
  return pointCount === 1;
}

export function preliminarySegment(points: string[], firstIncompleteKey: string | null | undefined) {
  if (!firstIncompleteKey) {
    return { solidEnd: points.length - 1, dashedStart: -1 };
  }
  const incompleteIndex = points.indexOf(firstIncompleteKey);
  if (incompleteIndex < 0) {
    return { solidEnd: points.length - 1, dashedStart: -1 };
  }
  return {
    solidEnd: incompleteIndex > 0 ? incompleteIndex : -1,
    dashedStart: Math.max(incompleteIndex - 1, 0),
  };
}

describe('chart series rules', () => {
  it('draws a marker for a single hourly/daily point', () => {
    assert.equal(shouldDrawSinglePointMarker(1), true);
    assert.equal(shouldDrawSinglePointMarker(24), false);
  });

  it('marks preliminary segment from firstIncompleteHour', () => {
    const hours = Array.from({ length: 24 }, (_, i) => `h${i}`);
    const segment = preliminarySegment(hours, 'h20');
    assert.equal(segment.solidEnd, 20);
    assert.equal(segment.dashedStart, 19);
  });

  it('uses dashed-only when the first point is incomplete', () => {
    const segment = preliminarySegment(['h0', 'h1'], 'h0');
    assert.equal(segment.solidEnd, -1);
    assert.equal(segment.dashedStart, 0);
  });
});

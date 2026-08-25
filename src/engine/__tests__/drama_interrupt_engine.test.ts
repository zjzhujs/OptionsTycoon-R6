import { describe, expect, it } from 'vitest';
import { classifyStoryDrama, selectDramaInterrupt } from '../engines/drama_interrupt_engine';

describe('intrusive drama interrupt selector', () => {
  it('uses real story ids, enforces the daily cap, and never lets the cap suppress a margin breach', () => {
    const secEvent = {
      id: 'e-sec',
      template_id: 'sec_subpoena',
      headline: '监管传票',
      body: 'SEC 要求提交记录',
    } as any;
    expect(classifyStoryDrama(secEvent)).toBe('SEC_SUBPOENA');
    expect(selectDramaInterrupt({ gameDate: '2026-01-20', storyEvent: secEvent, dailyInterruptUsed: false })?.kind).toBe('SEC_SUBPOENA');
    expect(selectDramaInterrupt({ gameDate: '2026-01-20', storyEvent: secEvent, dailyInterruptUsed: true })).toBeNull();

    const mandatory = selectDramaInterrupt({
      gameDate: '2026-01-20',
      storyEvent: secEvent,
      dailyInterruptUsed: true,
      marginCallActive: true,
    });
    expect(mandatory?.kind).toBe('MARGIN_BREACH');
    expect(mandatory?.mandatory).toBe(true);
  });

  it('only fires the crash intrusion from already revealed price', () => {
    expect(selectDramaInterrupt({
      gameDate: '2026-01-20', previousClose: 100, revealedPrice: 91.5, dailyInterruptUsed: false,
    })?.kind).toBe('MARKET_CRASH');
    expect(selectDramaInterrupt({
      gameDate: '2026-01-20', previousClose: 100, revealedPrice: null, dailyInterruptUsed: false,
    })).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HumanActionFeedPanel } from '../components/HumanActionFeedPanel';

describe('HumanActionFeedPanel action contract', () => {
  it('shows WHY/COST/REWARD/IMPACT before a choice and resolves through the callback', async () => {
    const onResolve = vi.fn().mockResolvedValue('事件已写入基金状态。');
    render(
      <HumanActionFeedPanel
        events={[
          {
            id: 'event-1',
            date: '2025-01-23',
            action_kind: 'RIVAL_POACHING',
            character_id: 'adrian_cross',
            headline: '竞争对手试图挖走研究员',
            body: '对手基金提出一份更高薪酬的邀约。',
            choices: [
              {
                id: 'retain',
                label: '加薪留人',
                cost_usd: 5000,
                favor_delta: 2,
                morale_delta: 1,
                reputation_delta: 1,
                result_narrative: '研究员留下，团队信任提高。',
              },
            ],
            resolved: false,
            impact_summary: '',
            source_type: 'SIMULATED',
          },
        ]}
        onResolve={onResolve}
      />,
    );

    expect(screen.getByText(/WHY/)).toBeInTheDocument();
    expect(screen.getByText(/COST/)).toBeInTheDocument();
    expect(screen.getByText(/REWARD/)).toBeInTheDocument();
    expect(screen.getByText(/IMPACT/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /加薪留人/ }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith('event-1', 'retain'));
  });
});

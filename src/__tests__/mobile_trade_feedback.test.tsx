import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileBottomSheet } from '../components/MobileBottomSheet';

const quote = {
  contract_key: 'NVDA|2025-01-31|150|call',
  underlying: 'NVDA',
  type: 'call',
  strike: 150,
  expiration: '2025-01-31',
  bid: 2.4,
  ask: 2.8,
  mid: 2.6,
} as any;

describe('mobile order feedback', () => {
  it('keeps the sheet open and renders the existing trade confirmation', async () => {
    const onClose = vi.fn();
    const onPlaceOrder = vi.fn().mockResolvedValue(undefined);
    const baseProps = {
      quote,
      isOpen: true,
      onClose,
      onPlaceOrder,
      onOpenThesis: vi.fn(),
      attachedThesis: null,
      orderMessage: '',
    };
    const { rerender } = render(<MobileBottomSheet {...baseProps} confirmation={null} />);

    fireEvent.click(screen.getByTestId('buy-to-open'));
    await waitFor(() => expect(onPlaceOrder).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <MobileBottomSheet
        {...baseProps}
        confirmation={{
          fillPrice: 2.8,
          totalCost: 280,
          cashBefore: 50_000,
          cashAfter: 49_720,
          navBefore: 50_000,
          navAfter: 49_995,
          side: 'buy_to_open',
        }}
      />,
    );
    expect(screen.getByTestId('mobile-trade-confirmation')).toHaveTextContent('成交确认');
    expect(screen.getByTestId('mobile-trade-confirmation')).toHaveTextContent('$50,000.00');
  });

  it('renders the preselected close direction from a risk decision', async () => {
    const onPlaceOrder = vi.fn().mockResolvedValue(undefined);
    render(
      <MobileBottomSheet
        quote={quote}
        isOpen
        onClose={vi.fn()}
        onPlaceOrder={onPlaceOrder}
        onOpenThesis={vi.fn()}
        attachedThesis={null}
        confirmation={null}
        orderMessage=""
        preferredCloseSide="sell_to_close"
      />,
    );

    expect(screen.queryByTestId('buy-to-open')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mobile-close-position'));
    await waitFor(() => expect(onPlaceOrder).toHaveBeenCalledWith(expect.objectContaining({
      side: 'sell_to_close',
      qty: 1,
    })));
  });
});

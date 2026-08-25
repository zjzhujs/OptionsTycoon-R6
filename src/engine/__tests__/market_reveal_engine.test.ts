import { describe, expect, it } from 'vitest';
import * as game from '../game';
import * as offlinePack from '../engines/offline_content_pack';
import type { MarketDecisionBeatKind } from '../schemas';

describe('V21 offline intraday market reveal', () => {
  function reachJan27Premarket() {
    const view = game.new_game({ campaign_id: 'r1', mode: 'SANDBOX', account_type: 'Cash', start_cash: 50_000 });
    const sid = view.state.session_id;
    game.advance_market_reveal(sid, 'NEXT_NODE'); // Jan 24 daily close
    return { sid, view: game.advance_market_reveal(sid, 'NEXT_NODE') };
  }

  it('V27 bundles Jan 24 as real intraday data without creating mechanical PM windows', () => {
    const session = offlinePack.getOfflineIntradaySession('r1', '2025-01-24', 'NVDA');
    expect(session).not.toBeNull();
    expect(session?.bars).toHaveLength(390);
    expect(session?.material_windows).toHaveLength(0);
    expect(session?.normalization?.source_anchor.close).toBe(142.695);
    expect(session?.normalization?.canonical_anchor.close).toBe(142.62);
    const normalized = offlinePack.normalizedIntradayBars(session!);
    expect(normalized[0].open).toBeCloseTo(148.28, 1);
    expect(Math.max(...normalized.map((bar) => bar.high))).toBeCloseTo(148.88, 1);
    expect(Math.min(...normalized.map((bar) => bar.low))).toBeCloseTo(141.81, 1);

    const view = game.new_game({ campaign_id: 'r1', mode: 'SANDBOX', account_type: 'Cash', start_cash: 50_000 });
    const sid = view.state.session_id;
    const jan24 = game.advance_market_reveal(sid, 'NEXT_NODE');
    expect(jan24.market_clock?.current_node_date).toBe('2025-01-24');
    expect(jan24.state.market_reveal?.awaiting_decision ?? false).toBe(false);
  });

  it('ships a validated zero-network local content pack', () => {
    expect(offlinePack.runtimeNetworkRequired('r1')).toBe(false);
    expect(() => offlinePack.validateOfflineContentPacks()).not.toThrow();
    const session = offlinePack.getOfflineIntradaySession('r1', '2025-01-27', 'NVDA');
    expect(session?.bars.length).toBeGreaterThanOrEqual(7);
    expect(session?.normalization?.canonical_anchor.close).toBe(118.42);
  });

  it('shows Jan 27 premarket event first without leaking later intraday bars', () => {
    const { view } = reachJan27Premarket();
    const reveal = view.state.market_reveal!;
    expect(view.market_clock?.current_node_date).toBe('2025-01-27');
    expect(view.market_clock?.node_granularity).toBe('EVENT_WINDOW');
    expect(reveal.awaiting_decision).toBe(true);
    expect(reveal.windows).toHaveLength(1); // player-safe state: future windows redacted
    expect(reveal.windows[0].truth_mode).toBe('EVENT_ONLY');
    expect(reveal.windows[0].price_reveal_available).toBe(false);
    expect(reveal.windows[0].headline.includes('收盘暴跌')).toBe(false);
  });

  it('refuses fabricated premarket execution when no local price exists', () => {
    const { sid } = reachJan27Premarket();
    const [, result] = game.place_order(sid, { side: 'buy_shares', qty: 1, order_kind: 'Market' });
    expect(result.accepted).toBe(false);
    expect(result.execution_label).toBe('PRICE UNAVAILABLE');
  });

  it('cannot bypass later windows with raw advance_market()', () => {
    const { sid, view } = reachJan27Premarket();
    const first = view.state.market_reveal!.windows[0];
    game.resolve_market_window_decision(sid, first.window_id, 'DO_NOTHING', '事件有信息，但没有执行价，先等真实价格。');
    const before = game.get_session(sid).game_day_index;
    const guarded = game.advance_market(sid, 'NEXT_NODE');
    expect(guarded.state.game_day_index).toBe(before);
    expect(guarded.market_clock?.pause_reasons.some((reason) => reason.trigger_id === 'market_reveal_pending')).toBe(true);
  });

  it('reveals only completed real bars and uses the latest revealed price for execution', () => {
    const { sid, view } = reachJan27Premarket();
    const pre = view.state.market_reveal!.windows[0];
    game.resolve_market_window_decision(sid, pre.window_id, 'DO_NOTHING', '等可执行的本地真实盘中价。');

    const firstHour = game.advance_market_reveal(sid, 'NEXT_NODE');
    const window = firstHour.state.market_reveal!.windows[firstHour.state.market_reveal!.current_window_index];
    expect(window.truth_mode).toBe('REAL_INTRADAY');
    expect(window.visible_price_bars).toHaveLength(60);
    expect(firstHour.state.market_reveal!.windows).toHaveLength(2); // premarket + current; later bars hidden

    const [, blocked] = game.place_order(sid, { side: 'buy_shares', qty: 1, order_kind: 'Market' });
    expect(blocked.execution_label).toBe('MARKET WINDOW GATE');

    game.resolve_market_window_decision(sid, window.window_id, 'MANAGE_RISK', '缺口已被真实第一小时确认，按当前已揭晓价格执行。');
    const [afterFill, fill] = game.place_order(sid, { side: 'buy_shares', qty: 1, order_kind: 'Market' });
    expect(fill.accepted).toBe(true);
    expect(fill.fill_price).toBeCloseTo(window.price_snapshot!.latest_price, 8);
    expect(afterFill.state.game_day_index).toBe(1); // still Jan 24 canonical daily node underneath
    expect(afterFill.market_clock?.current_node_date).toBe('2025-01-27');
  });

  it('reprices the offline option model from revealed spot without pretending the option chain itself is historical', () => {
    const { sid, view } = reachJan27Premarket();
    const pre = view.state.market_reveal!.windows[0];
    game.resolve_market_window_decision(sid, pre.window_id, 'DO_NOTHING', '先等真实价格。');
    const firstHour = game.advance_market_reveal(sid, 'NEXT_NODE');
    const window = firstHour.state.market_reveal!.windows[firstHour.state.market_reveal!.current_window_index];
    const chain = game.get_chain(sid, '2025-01-31', 'call');
    const nearest = chain.reduce((best, quote) =>
      Math.abs(quote.strike - window.price_snapshot!.latest_price) < Math.abs(best.strike - window.price_snapshot!.latest_price) ? quote : best
    );
    expect(Math.abs(nearest.strike - window.price_snapshot!.latest_price)).toBeLessThan(15);
    game.resolve_market_window_decision(sid, window.window_id, 'MANAGE_RISK', '只按已经揭晓的真实标的价格执行。');
    const [filled, result] = game.place_order(sid, { side: 'buy_to_open', type: 'call', strike: nearest.strike, expiration: '2025-01-31', qty: 1, order_kind: 'Market' });
    expect(result.accepted).toBe(true);
    expect(filled.state.positions.some((position) => position.kind === 'option' && position.entry_date === '2025-01-27')).toBe(true);
    expect(nearest.provenance?.source_type).not.toBe('REAL');
  });

  it('records STOP THE DESK on the reveal-session date, not the stale daily-node date', () => {
    const { sid, view } = reachJan27Premarket();
    const pre = view.state.market_reveal!.windows[0];
    game.resolve_market_window_decision(sid, pre.window_id, 'DO_NOTHING', '等待盘中真实价。');
    const firstHour = game.advance_market_reveal(sid, 'NEXT_NODE');
    const window = firstHour.state.market_reveal!.windows[firstHour.state.market_reveal!.current_window_index];
    const [stopped] = game.resolve_market_window_decision(sid, window.window_id, 'STOP', '第一小时已经打穿我的风险容忍。');
    expect(stopped.state.execution_control?.mode).toBe('RISK_REDUCTION_ONLY');
    expect(stopped.state.execution_control?.stopped_date).toBe('2025-01-27');
  });

  it('directs Jan 27 as distinct scene beats without leaking the final half-hour', () => {
    const { sid, view } = reachJan27Premarket();
    let current = view.state.market_reveal!.windows[0];
    expect(current.dramatic_beat).toBe('THESIS_HIT');
    expect(current.dramatic_question).toContain('Thesis');
    game.resolve_market_window_decision(sid, current.window_id, 'DO_NOTHING', '盘前我先确认 DeepSeek 是否真的打穿需求因果链。');

    const firstHour = game.advance_market_reveal(sid, 'NEXT_NODE');
    current = firstHour.state.market_reveal!.windows[firstHour.state.market_reveal!.current_window_index];
    expect(current.dramatic_beat).toBe('PRICE_DISCOVERY');
    expect(current.character_beat).toBeNull();
    game.resolve_market_window_decision(sid, current.window_id, 'HOLD', '第一小时先当成价格发现，我要再看一段真实卖压。');

    const secondHour = game.advance_market_reveal(sid, 'NEXT_NODE');
    current = secondHour.state.market_reveal!.windows[secondHour.state.market_reveal!.current_window_index];
    expect(current.dramatic_beat).toBe('RATIONALIZATION_TEST');
    expect(current.previous_decision_quote).toContain('价格发现');
    expect(current.character_beat?.line).toContain('价格发现');
    game.resolve_market_window_decision(sid, current.window_id, 'DO_NOTHING', '第二波已经出现，我不再把门槛继续后移。');

    const afternoon = game.advance_market_reveal(sid, 'NEXT_NODE');
    current = afternoon.state.market_reveal!.windows[afternoon.state.market_reveal!.current_window_index];
    expect(current.dramatic_beat).toBe('POSITION_VS_THESIS');
    game.resolve_market_window_decision(sid, current.window_id, 'DO_NOTHING', '先把观点和交易表达分开审。');

    const overnight = game.advance_market_reveal(sid, 'NEXT_NODE');
    current = overnight.state.market_reveal!.windows[overnight.state.market_reveal!.current_window_index];
    expect(current.dramatic_beat).toBe('OVERNIGHT_GATE');
    expect(current.visible_price_bars).toHaveLength(360);
    expect(current.visible_price_bars?.some((bar) => bar.label === '15:30–16:00 ET')).toBe(false);
    expect(current.future_lock_note).toContain('最后 30 分钟');
    expect(overnight.state.market_reveal!.windows).toHaveLength(5);
  });

  it('selects the lead character from current fund pressure rather than a fixed script', () => {
    const view = game.new_game({ campaign_id: 'r1', mode: 'SANDBOX', account_type: 'Cash', start_cash: 50_000 });
    const sid = view.state.session_id;
    game.advance_market_reveal(sid, 'NEXT_NODE');
    const privateState = game.get_session(sid);
    privateState.max_drawdown_pct = 19;
    privateState.fund_stats.lp_confidence = 30;
    privateState.margin_debt = 49_000;
    privateState.cash = 1_000;
    const premarket = game.advance_market_reveal(sid, 'NEXT_NODE');
    const window = premarket.state.market_reveal!.windows[0];
    expect(window.character_beat?.character_name).toBe('Victor Hale');
    expect(window.character_beat?.pressure_level).toBe('CRITICAL');
  });

  it('walks all material windows before the Jan 27 daily settlement', () => {
    const { sid, view } = reachJan27Premarket();
    let current = view.state.market_reveal!.windows[0];
    game.resolve_market_window_decision(sid, current.window_id, 'DO_NOTHING', '盘前只记录事件。');

    const expectedBars = [60, 120, 300, 360];
    for (const count of expectedBars) {
      const revealed = game.advance_market_reveal(sid, 'NEXT_NODE');
      current = revealed.state.market_reveal!.windows[revealed.state.market_reveal!.current_window_index];
      expect(current.truth_mode).toBe('REAL_INTRADAY');
      expect(current.visible_price_bars).toHaveLength(count);
      expect(revealed.state.game_day_index).toBe(1);
      game.resolve_market_window_decision(sid, current.window_id, 'DO_NOTHING', `看到 ${count} 段真实K线后暂不动作。`);
    }

    const close = game.advance_market_reveal(sid, 'NEXT_NODE');
    expect(close.state.game_day_index).toBe(2);
    expect(close.market_clock?.current_node_date).toBe('2025-01-27');
    expect(close.state.market_reveal?.current_window_index).toBe(-1);
    expect(close.state.market_window_history).toHaveLength(5);
  });

  it('V23 freezes material decision consequences and carries them into history', () => {
    const { sid, view } = reachJan27Premarket();
    const pre = view.state.market_reveal!.windows[0];
    const [after] = game.resolve_market_window_decision(sid, pre.window_id, 'DO_NOTHING', '盘前先检查需求假设和可观察证伪，不因为标题直接改仓。');
    const frozen = after.state.market_window_history?.[0];
    expect(frozen?.decision_consequences?.length).toBe(1);
    expect(frozen?.decision_consequences?.[0].source_action).toBe('DO_NOTHING');
    expect(frozen?.decision_consequences?.[0].source_reason).toContain('需求假设');
    expect(frozen?.decision_consequences?.[0].truth_label).toBe('SIMULATED');
  });

  it('V23 makes repeated deferral under adverse revealed price a process consequence, not a future-outcome verdict', () => {
    const { sid, view } = reachJan27Premarket();
    let window = view.state.market_reveal!.windows[0];
    game.resolve_market_window_decision(sid, window.window_id, 'DO_NOTHING', '盘前只处理事件，等待真实价格。');
    let revealed = game.advance_market_reveal(sid, 'NEXT_NODE');
    window = revealed.state.market_reveal!.windows[revealed.state.market_reveal!.current_window_index];
    game.resolve_market_window_decision(sid, window.window_id, 'HOLD', '第一小时先观察真实卖压是否延续。');
    const before = game.get_session(sid).market_reveal_profile?.ego_risk ?? 0;
    revealed = game.advance_market_reveal(sid, 'NEXT_NODE');
    window = revealed.state.market_reveal!.windows[revealed.state.market_reveal!.current_window_index];
    const [after] = game.resolve_market_window_decision(sid, window.window_id, 'DO_NOTHING', '继续不动。');
    const history = after.state.market_window_history ?? [];
    const latest = history[history.length - 1];
    expect(latest?.decision_consequences?.some((entry: any) => entry.kind === 'REASONING_INTEGRITY')).toBe(true);
    expect((after.state.market_reveal_profile?.ego_risk ?? 0)).toBeGreaterThan(before);
    expect(latest?.decision_consequences?.[0].detail).not.toContain('收盘');
  });

  it('V23 STOP changes desk risk state but is not encoded as a correctness reward', () => {
    const { sid, view } = reachJan27Premarket();
    const pre = view.state.market_reveal!.windows[0];
    const [stopped] = game.resolve_market_window_decision(sid, pre.window_id, 'STOP', '我先停。');
    const history = stopped.state.market_window_history ?? [];
    const latest = history[history.length - 1];
    expect(stopped.state.execution_control?.mode).toBe('RISK_REDUCTION_ONLY');
    expect(latest?.decision_consequences?.some((entry: any) => entry.kind === 'RISK_DISCIPLINE')).toBe(true);
    expect(latest?.decision_consequences?.some((entry: any) => entry.headline.includes('正确'))).toBe(false);
    expect(latest?.decision_consequences?.length).toBeLessThanOrEqual(2);
  });


  it('V24 validates Jan 31 real intraday source rows and reveals 1→2→4→6 before canonical settlement', () => {
    const session = offlinePack.getOfflineIntradaySession('r1', '2025-01-31', 'NVDA');
    expect(session).not.toBeNull();
    expect(session?.bars).toHaveLength(390);
    expect(session?.normalization?.source_anchor.close).toBe(120.03);
    expect(session?.normalization?.canonical_anchor.close).toBe(120.07);
    const normalized = offlinePack.normalizedIntradayBars(session!);
    expect(Math.max(...normalized.map((bar) => bar.high))).toBeCloseTo(127.89, 1);
    expect(Math.min(...normalized.map((bar) => bar.low))).toBeCloseTo(119.23, 1);

    const view = game.new_game({ campaign_id: 'r1', mode: 'SANDBOX', account_type: 'Cash', start_cash: 50_000 });
    const sid = view.state.session_id;
    let currentView = view;
    let jan31Reached = false;
    for (let safety = 0; safety < 60 && !jan31Reached; safety += 1) {
      currentView = game.advance_market_reveal(sid, 'NEXT_NODE');
      const reveal = currentView.state.market_reveal;
      if (!reveal?.awaiting_decision) continue;
      const current = reveal.windows[reveal.current_window_index];
      if (current.session_date === '2025-01-31') {
        jan31Reached = true;
        break;
      }
      game.resolve_market_window_decision(sid, current.window_id, 'DO_NOTHING', `推进到第二 Golden Day：${current.session_date}`);
    }
    expect(jan31Reached).toBe(true);

    const expected: Array<[string, number, MarketDecisionBeatKind]> = [
      ['10:30 ET', 60, 'RELIEF_RALLY'],
      ['11:30 ET', 120, 'FOLLOW_THROUGH_TEST'],
      ['13:30 ET', 240, 'REVERSAL_SIGNAL'],
      ['15:30 ET', 360, 'WEEKEND_GATE'],
    ];
    for (let i = 0; i < expected.length; i += 1) {
      const reveal = currentView.state.market_reveal!;
      const current = reveal.windows[reveal.current_window_index];
      const [time, count, beat] = expected[i];
      expect(current.reveal_time_label).toBe(time);
      expect(current.visible_price_bars).toHaveLength(count);
      expect(current.dramatic_beat).toBe(beat);
      if (time === '15:30 ET') {
        expect(current.visible_price_bars?.some((bar) => bar.label === '15:30–16:00 ET')).toBe(false);
        expect(current.future_lock_note).toContain('FUTURE LOCKED');
      }
      game.resolve_market_window_decision(sid, current.window_id, 'DO_NOTHING', `${time} 只按已揭晓价格判断，不猜未来。`);
      if (i < expected.length - 1) currentView = game.advance_market_reveal(sid, 'NEXT_NODE');
    }
    const settled = game.advance_market_reveal(sid, 'NEXT_NODE');
    expect(settled.market_clock?.current_node_date).toBe('2025-01-31');
  });


  it('V25 resurfaces at most two distinct prior-day commitments on Jan31 without disturbing the quiet first reveal', () => {
    const view = game.new_game({ campaign_id: 'r1', mode: 'SANDBOX', account_type: 'Cash', start_cash: 50_000 });
    const sid = view.state.session_id;
    let currentView = view;
    let jan31Reached = false;
    for (let safety = 0; safety < 80 && !jan31Reached; safety += 1) {
      currentView = game.advance_market_reveal(sid, 'NEXT_NODE');
      const reveal = currentView.state.market_reveal;
      if (!reveal?.awaiting_decision) continue;
      const current = reveal.windows[reveal.current_window_index];
      if (current.session_date === '2025-01-31') {
        jan31Reached = true;
        break;
      }
      const reason = current.session_date === '2025-01-27'
        ? `JAN27_COMMIT_${current.reveal_time_label ?? 'EVENT'}：证伪标准与风险预算只根据已揭晓事实更新。`
        : `${current.session_date} 只按当时已知事实推进。`;
      const action = current.session_date === '2025-01-27' && current.reveal_time_label === '14:30 ET' ? 'REVISE' : 'DO_NOTHING';
      game.resolve_market_window_decision(sid, current.window_id, action, reason);
    }
    expect(jan31Reached).toBe(true);

    let current = currentView.state.market_reveal!.windows[currentView.state.market_reveal!.current_window_index];
    expect(current.reveal_time_label).toBe('10:30 ET');
    expect(current.season_continuity_beat ?? null).toBeNull();
    game.resolve_market_window_decision(sid, current.window_id, 'DO_NOTHING', '第一小时先让价格自己说话。');

    currentView = game.advance_market_reveal(sid, 'NEXT_NODE');
    current = currentView.state.market_reveal!.windows[currentView.state.market_reveal!.current_window_index];
    expect(current.reveal_time_label).toBe('11:30 ET');
    expect(current.season_continuity_beat?.source_date).toBe('2025-01-27');
    expect(current.season_continuity_beat?.source_reason).toContain('JAN27_COMMIT_');
    const firstSource = current.season_continuity_beat!.source_window_id;
    game.resolve_market_window_decision(sid, current.window_id, 'HOLD', '上涨不自动等于 Thesis 修复，我只按新增证据提高 conviction。');

    currentView = game.advance_market_reveal(sid, 'NEXT_NODE');
    current = currentView.state.market_reveal!.windows[currentView.state.market_reveal!.current_window_index];
    expect(current.reveal_time_label).toBe('13:30 ET');
    expect(current.season_continuity_beat ?? null).toBeNull();
    game.resolve_market_window_decision(sid, current.window_id, 'DO_NOTHING', '只处理当前反转信号。');

    currentView = game.advance_market_reveal(sid, 'NEXT_NODE');
    current = currentView.state.market_reveal!.windows[currentView.state.market_reveal!.current_window_index];
    expect(current.reveal_time_label).toBe('15:30 ET');
    expect(current.season_continuity_beat?.source_date).toBe('2025-01-27');
    expect(current.season_continuity_beat?.source_window_id).not.toBe(firstSource);
    game.resolve_market_window_decision(sid, current.window_id, 'DO_NOTHING', '明确决定周末保留的风险。');

    const callbacks = game.get_session(sid).market_window_history
      .filter((item) => item.session_date === '2025-01-31' && item.season_continuity_beat);
    expect(callbacks).toHaveLength(2);
    expect(new Set(callbacks.map((item) => item.season_continuity_beat!.source_window_id)).size).toBe(2);
    expect(callbacks.every((item) => item.season_continuity_beat!.source_date < item.session_date)).toBe(true);
  });

});

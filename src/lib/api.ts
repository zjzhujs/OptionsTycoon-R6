// Zero-backend engine facade. Same call signatures the HTTP-based `api` object used to
// have (so every React call site is unchanged), but every method now calls
// frontend/src/engine/game.ts directly in-process instead of fetching the FastAPI
// backend -- there is no server anymore.
import type {
  AIFund,
  AIStackLevel,
  AdvanceMode,
  CampaignMeta,
  Character,
  EmployeeRole,
  EpisodeMeta,
  FinancialTerm,
  GameStateView,
  GexSummary,
  IntelTier,
  MacroEvent,
  MacroSnapshot,
  MarketNode,
  NewGameRequest,
  OptionQuote,
  OrderRequest,
  OrderResult,
  SaveSlotInfo,
  ScannerResult,
  ThesisRevisionRequest,
  TradeReview,
} from '../types';
import * as game from '../engine/game';
import * as episode_engine from '../engine/engines/episode_engine';

export const api = {
  listCampaigns: async (): Promise<CampaignMeta[]> => game.list_campaigns() as unknown as CampaignMeta[],

  listEpisodes: async (): Promise<EpisodeMeta[]> =>
    episode_engine.get_all_season_episodes() as unknown as EpisodeMeta[],

  newGame: async (body: NewGameRequest): Promise<GameStateView> =>
    game.new_game(body as unknown as Parameters<typeof game.new_game>[0]) as unknown as GameStateView,

  getGame: async (sessionId: string): Promise<GameStateView> => game.get_view(sessionId) as unknown as GameStateView,

  getMarket: async (sessionId: string): Promise<{ nodes: MarketNode[]; events: MacroEvent[] }> => {
    const [nodes, events] = game.get_market(sessionId);
    return { nodes: nodes as unknown as MarketNode[], events: events as unknown as MacroEvent[] };
  },

  // Kept for historical compatibility. Backward calls are detached read-only
  // reviews; forward movement must go through advanceMarket.
  step: async (sessionId: string, to: number): Promise<GameStateView> => game.step(sessionId, to) as unknown as GameStateView,

  reviewNode: async (sessionId: string, to: number): Promise<GameStateView> =>
    game.review_node(sessionId, to) as unknown as GameStateView,

  // The only forward-movement call. No timer may invoke this.
  advanceMarket: async (sessionId: string, mode: AdvanceMode = 'NEXT_NODE', maxNodes = 10): Promise<GameStateView> =>
    game.advance_market(sessionId, mode, maxNodes) as unknown as GameStateView,

  /**
   * V21 盘中揭示推进。
   *
   * 与 advanceMarket 的区别：有盘中数据的日子，它会在当天内部逐个时点停下来，
   * 而不是一步跨到收盘。没有盘中数据的日子行为完全一致，
   * 所以 UI 可以无条件用它替换 advanceMarket。
   */
  advanceMarketReveal: async (sessionId: string, mode: AdvanceMode = 'NEXT_NODE'): Promise<GameStateView> =>
    game.advance_market_reveal(sessionId, mode) as unknown as GameStateView,

  /** 对当前盘中时点作出决定。理由必填——说不出理由的交易和赌没有区别。 */
  resolveMarketWindowDecision: async (
    sessionId: string,
    windowId: string,
    action: string,
    reason: string
  ): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.resolve_market_window_decision(sessionId, windowId, action as never, reason);
    return { state: state as unknown as GameStateView, message };
  },

  reviseThesis: async (
    sessionId: string,
    body: ThesisRevisionRequest
  ): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.revise_thesis(sessionId, body as unknown as Parameters<typeof game.revise_thesis>[1]);
    return { state: state as unknown as GameStateView, message };
  },

  recordDecision: async (
    sessionId: string,
    body: { category: string; headline: string; detail?: string; position_id?: string; game_date?: string }
  ): Promise<GameStateView> =>
    game.record_player_decision(
      sessionId,
      body.category,
      body.headline,
      body.detail,
      body.position_id,
      body.game_date
    ) as unknown as GameStateView,

  setTutorial: async (
    sessionId: string,
    body: {
      completed?: boolean;
      guided_active?: boolean;
      current_step?: string;
      completed_step?: string;
      tutorial_direction?: string;
      first_trade_position_id?: string;
      first_trade_review_shown?: boolean;
    }
  ): Promise<GameStateView> => game.set_tutorial_progress(sessionId, body) as unknown as GameStateView,

  // --- Capital, Power & Edge Economy ---
  hireEmployee: async (
    sessionId: string,
    role: EmployeeRole,
    name = ''
  ): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.hire_employee(sessionId, role as unknown as Parameters<typeof game.hire_employee>[1], name);
    return { state: state as unknown as GameStateView, message };
  },

  fireEmployee: async (sessionId: string, employeeId: string): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.fire_employee(sessionId, employeeId);
    return { state: state as unknown as GameStateView, message };
  },

  adjustBonus: async (
    sessionId: string,
    employeeId: string,
    bonusPct: number
  ): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.adjust_employee_bonus(sessionId, employeeId, bonusPct);
    return { state: state as unknown as GameStateView, message };
  },

  subscribeData: async (
    sessionId: string,
    subscriptionKey: string
  ): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.subscribe_data(sessionId, subscriptionKey);
    return { state: state as unknown as GameStateView, message };
  },

  subscribeIntel: async (
    sessionId: string,
    tier: IntelTier,
    shadowEnabled = false
  ): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.subscribe_intel(
      sessionId,
      tier as unknown as Parameters<typeof game.subscribe_intel>[1],
      shadowEnabled
    );
    return { state: state as unknown as GameStateView, message };
  },

  executeCrisisAction: async (
    sessionId: string,
    actionId: Parameters<typeof game.execute_crisis_action>[1],
    input: Parameters<typeof game.execute_crisis_action>[2] = {},
  ): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.execute_crisis_action(sessionId, actionId, input);
    return { state: state as unknown as GameStateView, message };
  },

  resolveCrisisBacklash: async (
    sessionId: string,
    eventId: string,
    choiceId: Parameters<typeof game.resolve_crisis_backlash>[2],
  ): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.resolve_crisis_backlash(sessionId, eventId, choiceId);
    return { state: state as unknown as GameStateView, message };
  },

  cancelDataSubscription: async (
    sessionId: string,
    subscriptionId: string
  ): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.cancel_data_subscription(sessionId, subscriptionId);
    return { state: state as unknown as GameStateView, message };
  },

  upgradeAIStack: async (
    sessionId: string,
    targetLevel: AIStackLevel
  ): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.upgrade_ai_stack(
      sessionId,
      targetLevel as unknown as Parameters<typeof game.upgrade_ai_stack>[1]
    );
    return { state: state as unknown as GameStateView, message };
  },

  injectGpCapital: async (sessionId: string, amountUsd: number): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.inject_gp_capital(sessionId, amountUsd);
    return { state: state as unknown as GameStateView, message };
  },

  distributeToGp: async (sessionId: string, amountUsd: number): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.distribute_to_gp(sessionId, amountUsd);
    return { state: state as unknown as GameStateView, message };
  },

  advanceEpisode: async (sessionId: string): Promise<GameStateView> => game.advance_episode(sessionId) as unknown as GameStateView,

  executeSurvival: async (sessionId: string, choiceId: string): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.execute_survival(sessionId, choiceId);
    return { state: state as unknown as GameStateView, message };
  },

  getChain: async (
    sessionId: string,
    expiration: string,
    side: 'both' | 'call' | 'put' = 'both'
  ): Promise<{ quotes: OptionQuote[] }> => ({
    quotes: game.get_chain(sessionId, expiration, side) as unknown as OptionQuote[],
  }),

  placeOrder: async (
    sessionId: string,
    order: OrderRequest
  ): Promise<{ state: GameStateView; result: OrderResult }> => {
    const [state, result] = game.place_order(sessionId, order as unknown as Parameters<typeof game.place_order>[1]);
    return { state: state as unknown as GameStateView, result: result as unknown as OrderResult };
  },

  resolveStory: async (sessionId: string, eventId: string, choiceId: string): Promise<GameStateView> =>
    game.resolve_story_choice(sessionId, eventId, choiceId) as unknown as GameStateView,

  deferStory: async (sessionId: string, eventId: string): Promise<GameStateView> =>
    game.set_story_deferred(sessionId, eventId, true) as unknown as GameStateView,

  resumeStory: async (sessionId: string, eventId: string): Promise<GameStateView> =>
    game.set_story_deferred(sessionId, eventId, false) as unknown as GameStateView,

  getFunds: async (sessionId: string): Promise<{ ai_funds: AIFund[]; ranking: Array<Record<string, unknown>> }> => {
    const [ai_funds, ranking] = game.get_funds(sessionId);
    return { ai_funds: ai_funds as unknown as AIFund[], ranking };
  },

  getCharacters: async (sessionId: string): Promise<Character[]> => {
    game.get_session(sessionId); // throws if the session doesn't exist, matching the old 404 semantics
    return game.get_characters() as unknown as Character[];
  },

  getScanner: async (sessionId: string): Promise<ScannerResult> => game.get_scanner(sessionId) as unknown as ScannerResult,

  getMacro: async (sessionId: string): Promise<MacroSnapshot> => game.get_macro(sessionId) as unknown as MacroSnapshot,

  getGex: async (sessionId: string, expiration?: string): Promise<GexSummary> =>
    game.get_gex(sessionId, expiration) as unknown as GexSummary,

  getTradeReviews: async (sessionId: string): Promise<TradeReview[]> =>
    game.get_trade_reviews(sessionId) as unknown as TradeReview[],

  getTerms: async (keyword?: string): Promise<FinancialTerm[]> => game.get_terms(keyword) as unknown as FinancialTerm[],

  resolveHumanAction: async (
    sessionId: string,
    eventId: string,
    choiceId: string
  ): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.resolve_human_action(sessionId, eventId, choiceId);
    return { state: state as unknown as GameStateView, message };
  },

  resolveWarRoomChoice: async (
    sessionId: string,
    choiceId: string,
  ): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.resolve_war_room_choice(sessionId, choiceId);
    return { state: state as unknown as GameStateView, message };
  },

  resolveLpInquiry: async (sessionId: string, answerId: string): Promise<GameStateView> => {
    return game.resolve_lp_inquiry(sessionId, answerId) as unknown as GameStateView;
  },

  spendPoliticalCapital: async (
    sessionId: string,
    contactId: string
  ): Promise<{ state: GameStateView; briefing_message: string }> => {
    const [state, briefing_message] = game.spend_political_capital(sessionId, contactId);
    return { state: state as unknown as GameStateView, briefing_message };
  },

  bankInteract: async (
    sessionId: string,
    bankId: string,
    actionId: string
  ): Promise<{ state: GameStateView; message: string }> => {
    const [state, message] = game.interact_bank(sessionId, bankId, actionId);
    return { state: state as unknown as GameStateView, message };
  },

  saveGame: async (sessionId: string, slot: string): Promise<{ ok: boolean }> => {
    game.save_game(sessionId, slot);
    return { ok: true };
  },

  listSaves: async (): Promise<SaveSlotInfo[]> => game.list_saves() as unknown as SaveSlotInfo[],

  loadGame: async (slot: string): Promise<GameStateView> => game.load_game(slot) as unknown as GameStateView,

  // The real backend's loadMassiveOptions() calls a paid, server-side-key-only historical
  // options API (Massive) that is dormant/unconfigured in this deployment -- see
  // backend/app/providers/massive_provider.py. A static client-only build can never hold
  // that key safely, so this never fabricates real quotes; it returns the same honest
  // "not available" message the real backend already returns when unconfigured, so the UI's
  // existing OFFLINE READY / ESTIMATED labeling stays accurate.
  loadMassiveOptions: async (
    sessionId: string,
    _expiration: string
  ): Promise<{ state: GameStateView; loaded: number; message: string }> => {
    const state = game.get_session(sessionId);
    const message = game.is_index_campaign(state.campaign_id ?? 'r1')
      ? '2026 H1 SPX 战役未接入历史期权包；为避免伪装成真实数据，此功能在该战役下不可用。'
      : '零后端离线版本未接入 Massive 历史期权 API（该数据源需要服务器端密钥，静态构建中不提供，避免伪装成真实数据）。';
    return { state: game.compute_view(state) as unknown as GameStateView, loaded: 0, message };
  },
};

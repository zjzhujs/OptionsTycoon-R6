import type { GameState, OrderRequest, Position } from "../schemas";

const OPENING_SIDES = new Set(["buy_to_open", "sell_covered_call", "sell_cash_secured_put", "buy_shares"]);
const CREDITED_KEY = "thesis_discipline_credited";

function exposure_key(order: OrderRequest): string {
  if (order.side === "buy_shares") return "shares";
  return `${order.type ?? "?"}|${order.strike ?? "undefined"}|${order.expiration ?? "undefined"}`;
}

export function observe_order_action(state: GameState, order: OrderRequest, _quote_mid: number, accepted = true): void {
  if (!accepted) return;
  const traits = new Set(state.player_traits ?? []);
  const hidden = (state.hidden_state ??= {});
  const compliance = (state.compliance_state ??= {});
  const opening = OPENING_SIDES.has(order.side);
  if (opening) {
    if (order.thesis) {
      const credited = Array.isArray(compliance[CREDITED_KEY]) ? compliance[CREDITED_KEY] as string[] : [];
      const key = exposure_key(order);
      if (!credited.includes(key)) {
        hidden.discipline = Math.min(100, (hidden.discipline ?? 0) + 2);
        hidden.ego = Math.max(0, (hidden.ego ?? 0) - 1);
        credited.push(key);
        compliance[CREDITED_KEY] = credited;
      }
      traits.add("GOOD_RISK_DISCIPLINE");
      if (order.thesis.risk_budget_usd > state.cash * 0.4) traits.add("HIGH_RISK_APPETITE");
    } else {
      hidden.discipline = Math.max(0, (hidden.discipline ?? 0) - 3);
      if ((order.qty ?? 0) >= 5) { traits.add("OVERTRADES"); hidden.ego = Math.min(100, (hidden.ego ?? 0) + 2); }
    }
  }
  if (order.side === "buy_to_open" && order.type === "call") {
    traits.add("FOLLOWS_MAYA");
    hidden.dependency_maya = Math.min(100, (hidden.dependency_maya ?? 0) + 1.5);
  }
  if (order.side === "sell_covered_call" || order.side === "sell_cash_secured_put") {
    hidden.risk_identity = (hidden.discipline ?? 0) > 70 ? "CONSERVATIVE" : "BALANCED";
  }
  state.player_traits = [...traits];
}

export function observe_position_holding(state: GameState, positions: Position[]): void {
  const traits = new Set(state.player_traits ?? []);
  const hidden = (state.hidden_state ??= {});
  for (const position of positions) {
    if ((position.trough_unrealized_pl ?? 0) < -5000) {
      traits.add("HOLDS_LOSERS");
      hidden.ego = Math.min(100, (hidden.ego ?? 0) + 4);
      hidden.discipline = Math.max(0, (hidden.discipline ?? 0) - 3);
    }
    if ((position.peak_unrealized_pl ?? 0) > 8000 && position.qty > 0) traits.add("HIGH_CONVICTION");
  }
  state.player_traits = [...traits];
}


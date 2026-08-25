import { beforeEach, describe, expect, it } from "vitest";
import * as game from "../game";
import * as data_loader from "../data_loader";

beforeEach(() => {
  localStorage.clear();
});

describe("historical node review", () => {
  it("shows a previous node without rewinding the live market clock", () => {
    const live = game.new_game({ campaign_id: "r1", mode: "SANDBOX", account_type: "Cash", start_cash: 50_000 });
    const sid = live.state.session_id;
    const nodes = data_loader.get_campaign_nodes("r1");

    const advanced = game.advance_market(sid, "NEXT_NODE");
    expect(advanced.state.game_day_index).toBe(1);

    const reviewed = game.review_node(sid, 0);
    expect(reviewed.state.game_day_index).toBe(0);
    expect(reviewed.market_clock?.current_node_index).toBe(0);
    expect(reviewed.market_clock?.current_node_date).toBe(nodes[0].date);

    const liveAfterReview = game.get_view(sid);
    expect(liveAfterReview.state.game_day_index).toBe(1);
    expect(liveAfterReview.market_clock?.current_node_index).toBe(1);

    const resumed = game.advance_market(sid, "NEXT_NODE");
    expect(resumed.state.game_day_index).toBe(2);
    expect(resumed.market_clock?.current_node_index).toBe(2);
  });

  it("routes legacy backward step calls through the read-only review path", () => {
    const live = game.new_game({ campaign_id: "r1", mode: "SANDBOX", account_type: "Cash", start_cash: 50_000 });
    const sid = live.state.session_id;
    game.advance_market(sid, "NEXT_NODE");

    const reviewed = game.step(sid, 0);
    expect(reviewed.state.game_day_index).toBe(0);
    expect(game.get_session(sid).game_day_index).toBe(1);
  });

  it("does not review across an unresolved intraday market window", () => {
    const live = game.new_game({ campaign_id: "r1", mode: "SANDBOX", account_type: "Cash", start_cash: 50_000 });
    const sid = live.state.session_id;
    game.advance_market_reveal(sid, "NEXT_NODE");
    const intraday = game.advance_market_reveal(sid, "NEXT_NODE");

    expect(intraday.market_clock?.node_granularity).toBe("EVENT_WINDOW");
    const reviewed = game.review_node(sid, 0);
    expect(reviewed.state.game_day_index).toBe(intraday.state.game_day_index);
    expect(reviewed.market_clock?.node_granularity).toBe("EVENT_WINDOW");
  });
});

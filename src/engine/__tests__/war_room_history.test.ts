import { beforeEach, describe, expect, it } from "vitest";
import * as data_loader from "../data_loader";
import * as game from "../game";

beforeEach(() => {
  localStorage.clear();
});

describe("War Room cross-day archive", () => {
  it("appends a meeting snapshot with the player's choice and avoids a duplicate on advance", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", account_type: "Cash", start_cash: 50_000 });
    const sid = view.state.session_id;
    const firstDate = data_loader.get_campaign_nodes("r1")[0].date;

    expect(game.get_session(sid).war_room_history).toHaveLength(0);
    game.resolve_war_room_choice(sid, "opt_aggressive");

    const afterChoice = game.get_session(sid).war_room_history!;
    expect(afterChoice).toHaveLength(1);
    expect(afterChoice[0].date).toBe(firstDate);
    expect(afterChoice[0].topic).toBeTruthy();
    expect(afterChoice[0].agenda).toBeTruthy();
    expect(afterChoice[0].messages.length).toBeGreaterThan(0);
    expect(afterChoice[0].choice_id).toBe("opt_aggressive");

    game.advance_market(sid, "NEXT_NODE");
    expect(game.get_session(sid).war_room_history).toHaveLength(1);
  });

  it("round-trips the append-only archive through save and load", () => {
    const view = game.new_game({ campaign_id: "r1", mode: "SANDBOX", account_type: "Cash", start_cash: 50_000 });
    const sid = view.state.session_id;
    game.advance_market(sid, "NEXT_NODE");
    const before = JSON.parse(JSON.stringify(game.get_session(sid).war_room_history));

    game.save_game(sid, "war-room-history-regression");
    const restored = game.load_game("war-room-history-regression");
    expect(restored.state.war_room_history).toEqual(before);
  });
});

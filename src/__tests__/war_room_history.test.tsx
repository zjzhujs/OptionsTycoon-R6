import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { WarRoomModal } from "../components/WarRoomModal";
import type { WarRoomHistoryEntry, WarRoomMeeting } from "../types";

const meeting: WarRoomMeeting = {
  date: "2025-01-31",
  topic: "当前晨会",
  agenda: "当前议程",
  messages: [],
  player_decision_prompt: "当前选择",
  choices: [],
};

const history: WarRoomHistoryEntry[] = [
  {
    date: "2025-01-23",
    topic: "更早晨会",
    agenda: "更早议程",
    choice_id: "opt_defensive",
    choice_label: "严格防守",
    messages: [{
      character_id: "maya_chen",
      character_name: "Maya Chen",
      role: "Tech Lead",
      portrait: "/art/characters/maya_chen.jpg",
      stance: "NEUTRAL",
      message: "更早发言",
      evidence: "更早证据",
    }],
  },
  {
    date: "2025-01-27",
    topic: "较新晨会",
    agenda: "较新议程",
    choice_id: null,
    choice_label: null,
    messages: [{
      character_id: "victor_hale",
      character_name: "Victor Hale",
      role: "Risk Officer",
      portrait: "/art/characters/victor_hale.jpg",
      stance: "CAUTIOUS",
      message: "较新发言",
      evidence: "较新证据",
    }],
  },
];

describe("War Room read-only archive", () => {
  it("is collapsed, newest-first, and contains no interactive buttons", () => {
    const { getByTestId } = render(
      <WarRoomModal
        isOpen
        meeting={meeting}
        warRoomHistory={history}
        onClose={vi.fn()}
      />,
    );
    const archive = getByTestId("war-room-history");
    expect(archive).not.toHaveAttribute("open");
    expect(archive.textContent?.indexOf("2025-01-27")).toBeLessThan(archive.textContent?.indexOf("2025-01-23") ?? -1);
    expect(archive.querySelectorAll("button")).toHaveLength(0);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RunDiscoveryButton } from "./run-discovery-button";

const runDiscoveryAction = vi.fn();

vi.mock("@/lib/actions/discovery", () => ({
  runDiscoveryAction: (...args: unknown[]) => runDiscoveryAction(...args),
}));

beforeEach(() => {
  runDiscoveryAction.mockReset();
});

describe("RunDiscoveryButton", () => {
  it("shows a success summary after a successful run", async () => {
    runDiscoveryAction.mockResolvedValue({
      ok: true,
      result: { workspaceId: "ws_1", skipped: false, searchQueriesGenerated: 0, evaluated: 3, created: 2, queriesRun: 1, scored: 2 },
    });

    const user = userEvent.setup();
    render(<RunDiscoveryButton />);
    await user.click(screen.getByRole("button", { name: "Run discovery now" }));

    await waitFor(() => {
      expect(screen.getByText(/found 2 new companies/)).toBeInTheDocument();
    });
    expect(runDiscoveryAction).toHaveBeenCalledOnce();
  });

  it("shows the error message when the action fails", async () => {
    runDiscoveryAction.mockResolvedValue({ ok: false, error: "Business Brain isn't built yet." });

    const user = userEvent.setup();
    render(<RunDiscoveryButton />);
    await user.click(screen.getByRole("button", { name: "Run discovery now" }));

    await waitFor(() => {
      expect(screen.getByText("Business Brain isn't built yet.")).toBeInTheDocument();
    });
  });
});

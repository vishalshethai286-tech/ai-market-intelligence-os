import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("renders the description when given", () => {
    render(<EmptyState title="Nothing here" description="Try again later." />);
    expect(screen.getByText("Try again later.")).toBeInTheDocument();
  });

  it("omits the description when not given", () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.queryByText("Try again later.")).not.toBeInTheDocument();
  });

  it("renders the action when given", () => {
    render(<EmptyState title="Nothing here" action={<button>Do something</button>} />);
    expect(screen.getByRole("button", { name: "Do something" })).toBeInTheDocument();
  });
});

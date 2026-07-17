import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Dialog, DialogTitle } from "./dialog";

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    render(
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogTitle>Hello</DialogTitle>
      </Dialog>,
    );
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
  });

  it("renders its content when open", () => {
    render(
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogTitle>Hello</DialogTitle>
      </Dialog>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when Escape is pressed", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogTitle>Hello</DialogTitle>
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) when the backdrop is clicked", () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogTitle>Hello</DialogTitle>
      </Dialog>,
    );
    const backdrop = container.ownerDocument.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not close when clicking inside the panel", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogTitle>Hello</DialogTitle>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

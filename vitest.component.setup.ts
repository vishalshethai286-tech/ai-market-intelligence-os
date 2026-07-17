import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @testing-library/react's cleanup only auto-registers under Jest's global
// afterEach; Vitest needs it wired up explicitly or DOM nodes leak between
// tests (causing spurious "multiple elements found" failures).
afterEach(cleanup);

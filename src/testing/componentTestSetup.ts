import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Registers matchers such as toHaveTextContent / toBeInTheDocument.
import "@testing-library/jest-dom/vitest";

/**
 * Testing Library only registers its automatic cleanup when a global `afterEach`
 * exists, which Vitest does not provide unless `globals` is enabled. Without
 * this, every render is appended to the same document and queries fail with
 * "found multiple elements" as soon as a file has more than one test.
 *
 * Import this module from any test that renders components.
 */
afterEach(() => {
  cleanup();
});

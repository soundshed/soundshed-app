import { vi } from "vitest";

// The Spark protocol classes log verbosely on every parse. Silence the noise at
// module scope (not in beforeAll) so it also covers work done while test files
// are being collected.
vi.spyOn(console, "debug").mockImplementation(() => {});
vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "log").mockImplementation(() => {});

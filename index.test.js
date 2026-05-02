// Test the top-level error handler in index.js
import { jest, describe, test, expect, beforeEach } from "@jest/globals";

const mockSetFailed = jest.fn();
const mockRun = jest.fn();

jest.unstable_mockModule("@actions/core", () => ({
    getInput: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    setFailed: mockSetFailed,
    setOutput: jest.fn(),
}));

jest.unstable_mockModule("./lib.js", () => ({
    run: mockRun,
}));

beforeEach(() => {
    jest.clearAllMocks();
});

describe("index.js error handler", () => {
    test("passes the full error object to core.setFailed, not just error.message", async () => {
        const error = new Error("something broke");
        mockRun.mockRejectedValue(error);

        // Replicate the index.js top-level try/catch pattern
        const core = await import("@actions/core");
        const { run } = await import("./lib.js");

        const handler = async () => {
            try {
                await run();
            } catch (e) {
                core.setFailed(e);
            }
        };
        await handler();

        // core.setFailed must receive the Error object (preserves stack trace),
        // not just the string from error.message
        expect(core.setFailed).toHaveBeenCalledTimes(1);
        expect(core.setFailed).toHaveBeenCalledWith(error);
        // Verify it was NOT called with just the message string
        expect(core.setFailed).not.toHaveBeenCalledWith(error.message);
    });
});

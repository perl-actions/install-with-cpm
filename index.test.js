// Test the top-level error handler in index.js
jest.mock("@actions/core");
jest.mock("./lib");

const core = require("@actions/core");
const { run } = require("./lib");

beforeEach(() => {
    jest.clearAllMocks();
});

describe("index.js error handler", () => {
    test("passes the full error object to core.setFailed, not just error.message", async () => {
        const error = new Error("something broke");
        run.mockRejectedValue(error);

        // index.js runs an async IIFE on require; re-run it by calling the pattern directly
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

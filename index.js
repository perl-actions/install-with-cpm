import * as core from "@actions/core";
import { run } from "./lib.js";

// Call run
try {
    await run();
} catch (error) {
    core.setFailed(error);
}

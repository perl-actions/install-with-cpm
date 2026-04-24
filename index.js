const core = require("@actions/core");
const { run } = require("./lib");

// Call run
(async () => {
    try {
        await run();
    } catch (error) {
        core.setFailed(error);
    }
})();

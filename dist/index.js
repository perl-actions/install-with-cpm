/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 396:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 526:
/***/ ((module) => {

module.exports = eval("require")("@actions/exec");


/***/ }),

/***/ 27:
/***/ ((module) => {

module.exports = eval("require")("@actions/io");


/***/ }),

/***/ 617:
/***/ ((module) => {

module.exports = eval("require")("@actions/tool-cache");


/***/ }),

/***/ 37:
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ 17:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const core = __nccwpck_require__(396);
const tc = __nccwpck_require__(617);
const exec = __nccwpck_require__(526);
const io = __nccwpck_require__(27);

const path = __nccwpck_require__(17);
const os = __nccwpck_require__(37);

let PERL;

async function install_cpm_location() {
    let out = "";

    const options = {};
    options.listeners = {
        stdout: (data) => {
            out += data.toString();
        },
    };

    let p = core.getInput("path");
    p.replace("\\", "\\\\");
    await exec.exec(PERL, ["-MConfig", "-e", `print "${p}"`], options);

    return path.resolve(out);
}

async function install_cpm(install_to) {
    const version = core.getInput("version");
    const url = `https://raw.githubusercontent.com/skaji/cpm/${version}/cpm`;

    core.info(`Get cpm from URL: ${url}`);

    const cpmScript = await tc.downloadTool(url);

    core.info(`Install cpm to: ${install_to}`);

    const platform = os.platform();

    if (platform == "win32") {
        await io.cp(cpmScript, install_to);
    } else {
        await do_exec([
            PERL,
            "-MFile::Copy=cp",
            "-e",
            `cp("${cpmScript}", "${install_to}"); chmod(0755, "${install_to}")`,
        ]);
    }

    return install_to;
}

async function which_perl() {
    const perl = core.getInput("perl");
    if (perl == "perl") {
        return await io.which("perl", true);
    }
    return perl;
}

function is_true(b) {
    if (b !== null && (b === true || b == "true" || b == "1" || b == "ok")) {
        return true;
    }

    return false;
}

async function do_exec(cmd) {
    const sudo = is_true(core.getInput("sudo"));
    const platform = os.platform();
    const bin = sudo && platform != "win32" ? "sudo" : cmd.shift();

    core.info(`do_exec: ${bin}`);

    await exec.exec(bin, cmd);
}

async function run() {
    PERL = await which_perl();

    const cpm_location = await install_cpm_location();

    await install_cpm(cpm_location);

    // input arguments
    const install = core.getInput("install");
    const cpanfile = core.getInput("cpanfile");
    const tests = core.getInput("tests");
    const dash_g = core.getInput("global");
    const args = core.getInput("args");
    const verbose = core.getInput("verbose");

    const w_tests = is_true(tests) ? "--test" : "--no-test";
    let w_args = [];

    if (args !== null && args.length) {
        w_args = args.split(/\s+/);
    }

    /* base CMD_install command */
    let CMD_install = [
        PERL,
        cpm_location,
        "install",
        "--show-build-log-on-failure",
        w_tests,
    ];

    if (is_true(verbose)) {
        CMD_install.push("-v");
    }
    if (is_true(dash_g)) {
        CMD_install.push("-g");
    }
    if (w_args.length) {
        CMD_install = CMD_install.concat(w_args);
    }

    let has_run = false;

    /* install one ore more modules */
    if (install !== null && install.length) {
        // install one or more modules
        core.info(`install: ${install}!`);
        const list = install.split("\n");

        let cmd = [...CMD_install]; /* clone array */
        cmd = cmd.concat(list);

        has_run = true;
        await do_exec(cmd);
    }

    /* install from cpanfile */
    if (cpanfile !== null && cpanfile.length) {
        // install one or more modules
        core.info(`cpanfile: ${cpanfile}!`);
        const cpanfile_full_path = path.resolve(cpanfile);
        core.info(`cpanfile: ${cpanfile_full_path}! [resolved]`);

        let cmd = [...CMD_install];
        cmd.push("--cpanfile", cpanfile_full_path);

        has_run = true;
        await do_exec(cmd);
    }

    /* custom run with args */
    if (has_run === false && w_args.length) {
        core.info(`custom run with args`);
        let cmd = [...CMD_install];
        has_run = true;
        await do_exec(cmd);
    }
}

// Call run
(async () => {
    try {
        await run();
    } catch (error) {
        core.setFailed(error.message);
    }
})();
})();

module.exports = __webpack_exports__;
/******/ })()
;
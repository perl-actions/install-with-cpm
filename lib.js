const core = require("@actions/core");
const cache = require("@actions/cache");
const tc = require("@actions/tool-cache");
const exec = require("@actions/exec");
const io = require("@actions/io");

const path = require("path");
const os = require("os");

let PERL;

async function install_cpm_location() {
    let out = "";

    const options = {};
    options.listeners = {
        stdout: (data) => {
            out += data.toString();
        },
    };

    const p = core.getInput("path").replace(/\\/g, "\\\\");
    await exec.exec(PERL, ["-MConfig", "-e", `print "${p}"`], options);

    return path.resolve(out);
}

function cpm_cache_key() {
    const version = core.getInput("version");
    return `cpm-script-${version}-${os.platform()}`;
}

function cpm_cache_dir() {
    return path.join(os.tmpdir(), "cpm-cache");
}

const VERSION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

async function install_cpm(install_to) {
    const version = core.getInput("version");

    if (!version || !VERSION_PATTERN.test(version) || version.includes("..")) {
        throw new Error(
            `Invalid version: "${version}". Version must be a branch name, tag, or commit SHA (e.g., "main", "0.997014").`
        );
    }

    const url = `https://raw.githubusercontent.com/skaji/cpm/${version}/cpm`;

    const cacheKey = cpm_cache_key();
    const cacheDir = cpm_cache_dir();
    const cachedScript = path.join(cacheDir, "cpm");

    // Try restoring from cache
    let cpmScript;
    let cacheHit = false;
    try {
        const restored = await cache.restoreCache([cacheDir], cacheKey);
        if (restored) {
            core.info(`Cache hit for cpm (key: ${cacheKey})`);
            cpmScript = cachedScript;
            cacheHit = true;
        }
    } catch (e) {
        core.info(`Cache restore failed, will download: ${e.message}`);
    }

    if (!cacheHit) {
        core.info(`Get cpm from URL: ${url}`);
        cpmScript = await tc.downloadTool(url);

        // Save to cache for future runs
        try {
            await io.mkdirP(cacheDir);
            await io.cp(cpmScript, cachedScript);
            await cache.saveCache([cacheDir], cacheKey);
            core.info(`Saved cpm to cache (key: ${cacheKey})`);
        } catch (e) {
            core.info(`Cache save failed (non-fatal): ${e.message}`);
        }
    }

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
    const [first, ...rest] = cmd;
    const bin = sudo && platform != "win32" ? "sudo" : first;
    const args = sudo && platform != "win32" ? cmd : rest;

    core.info(`do_exec: ${bin}`);

    await exec.exec(bin, args);
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
    const snapshot = core.getInput("snapshot");

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
    if (snapshot !== null && snapshot.length) {
        CMD_install.push("--snapshot", snapshot);
    } else {
        CMD_install.push("--snapshot", "");
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

module.exports = {
    is_true,
    do_exec,
    which_perl,
    install_cpm_location,
    install_cpm,
    cpm_cache_key,
    cpm_cache_dir,
    run,
    // Expose PERL setter for testing
    set_perl(p) { PERL = p; },
    get_perl() { return PERL; },
};

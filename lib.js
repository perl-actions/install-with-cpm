const core = require("@actions/core");
const cache = require("@actions/cache");
const tc = require("@actions/tool-cache");
const exec = require("@actions/exec");
const io = require("@actions/io");

const fs = require("fs");
const path = require("path");
const os = require("os");

async function install_cpm_location(perl) {
    let out = "";

    const options = {};
    options.listeners = {
        stdout: (data) => {
            out += data.toString();
        },
    };

    const p = core.getInput("path").replace(/\\/g, "\\\\");
    await exec.exec(perl, ["-MConfig", "-e", `print "${p}"`], options);

    return path.resolve(out);
}

// Refs we can prove are immutable (named tags or commit SHAs).
// Anything else (branch names like "main", "master", "dev") is treated
// as mutable so the cache key rotates daily and picks up upstream updates.
const IMMUTABLE_REF_PATTERNS = [
    /^v?\d+(\.\d+)+$/, // semver-like tags: 1.0, v1.0, 0.997014
    /^[a-f0-9]{7,40}$/i, // short or full commit SHA
];

function is_immutable_ref(ref) {
    if (!ref) return false;
    return IMMUTABLE_REF_PATTERNS.some((pat) => pat.test(ref));
}

function _today_utc() {
    // YYYY-MM-DD in UTC so workers in different timezones share the same key.
    return new Date().toISOString().slice(0, 10);
}

function cpm_cache_key() {
    const version = core.getInput("version");
    const base = `cpm-script-${version}-${os.platform()}`;
    if (is_immutable_ref(version)) {
        return base;
    }
    // Mutable ref (e.g. "main"): include daily UTC date so the cache rotates
    // and we don't pin users to a stale cpm forever.
    return `${base}-${_today_utc()}`;
}

function cpm_cache_dir() {
    return path.join(os.tmpdir(), "cpm-cache");
}

const VERSION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

async function install_cpm(perl, install_to) {
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
            perl,
            "-MFile::Copy=cp",
            "-e",
            'cp($ARGV[0], $ARGV[1]); chmod(0755, $ARGV[1])',
            cpmScript,
            install_to,
        ]);
    }

    return { path: install_to, cacheHit };
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

function _parse_non_negative_int(raw, fallback) {
    if (raw === null || raw === undefined || raw === "") return fallback;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return n;
}

function _sleep_ms(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function do_exec(cmd) {
    const sudo = is_true(core.getInput("sudo"));
    const platform = os.platform();
    const [first, ...rest] = cmd;
    const bin = sudo && platform != "win32" ? "sudo" : first;
    const args = sudo && platform != "win32" ? cmd : rest;

    const retries = _parse_non_negative_int(core.getInput("retries"), 2);
    const retry_wait = _parse_non_negative_int(core.getInput("retry-wait"), 20);
    const max_attempts = retries + 1;

    core.info(`do_exec: ${[bin, ...args].join(" ")}`);

    for (let attempt = 1; attempt <= max_attempts; attempt++) {
        let err;
        try {
            await exec.exec(bin, args);
            return;
        } catch (e) {
            err = e;
        }

        if (attempt === max_attempts) {
            throw err;
        }

        const wait_s = retry_wait * attempt;
        core.warning(
            `cpm attempt ${attempt}/${max_attempts} failed (${err.message || err}); ` +
            `retrying in ${wait_s}s...`
        );
        // Indirect through module.exports so tests can stub the sleep.
        await module.exports._sleep_ms(wait_s * 1000);
    }
}

async function run() {
    const perl = await which_perl();

    const cpm_location = await install_cpm_location(perl);

    const { cacheHit } = await install_cpm(perl, cpm_location);

    core.setOutput("cpm-path", cpm_location);
    core.setOutput("cache-hit", String(cacheHit));

    // input arguments
    const install = core.getInput("install");
    const cpanfile = core.getInput("cpanfile");
    const tests = core.getInput("tests");
    const dash_g = core.getInput("global");
    const args = core.getInput("args");
    const verbose = core.getInput("verbose");
    const workers = core.getInput("workers");
    const mirror = core.getInput("mirror");
    const snapshot = core.getInput("snapshot");

    const w_tests = is_true(tests) ? "--test" : "--no-test";
    let w_args = [];

    if (args.length) {
        w_args = args.split(/\s+/).filter(Boolean);
    }

    /* base CMD_install command */
    let CMD_install = [
        perl,
        cpm_location,
        "install",
        "--show-build-log-on-failure",
        w_tests,
    ];

    if (is_true(verbose)) {
        CMD_install.push("-v");
    }
    if (workers.length) {
        const n = Number(workers);
        if (!Number.isInteger(n) || n < 1) {
            core.setFailed(
                `Invalid value for 'workers': "${workers}". Must be a positive integer (e.g., "5").`
            );
            return;
        }
        CMD_install.push("--workers", workers);
    }
    if (mirror.length) {
        CMD_install.push("--mirror", mirror);
    }
    if (snapshot.length) {
        const snapshot_full_path = path.resolve(snapshot);
        if (!fs.existsSync(snapshot_full_path)) {
            core.setFailed(
                `snapshot file not found: "${snapshot_full_path}". Please check the 'snapshot' input path.`
            );
            return;
        }
        CMD_install.push("--snapshot", snapshot);
    }
    if (is_true(dash_g)) {
        CMD_install.push("-g");
    }
    if (w_args.length) {
        CMD_install = CMD_install.concat(w_args);
    }

    let has_run = false;

    /* install one ore more modules */
    if (install.length) {
        // install one or more modules
        core.info(`install: ${install}!`);
        const list = install.split("\n").map(s => s.trim()).filter(Boolean);

        let cmd = [...CMD_install]; /* clone array */
        cmd = cmd.concat(list);

        has_run = true;
        await do_exec(cmd);
    }

    /* install from cpanfile */
    if (cpanfile.length) {
        // install one or more modules
        core.info(`cpanfile: ${cpanfile}!`);
        const cpanfile_full_path = path.resolve(cpanfile);
        core.info(`cpanfile: ${cpanfile_full_path}! [resolved]`);

        if (!fs.existsSync(cpanfile_full_path)) {
            core.setFailed(
                `cpanfile not found: "${cpanfile_full_path}". Please check the 'cpanfile' input path.`
            );
            return;
        }

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

    if (!has_run) {
        core.warning(
            "Nothing to install: no 'install' modules, no 'cpanfile', and no 'args' provided. " +
            "Please set at least one of these inputs."
        );
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
    is_immutable_ref,
    run,
    // Exposed for testing
    _parse_non_negative_int,
    _sleep_ms,
};

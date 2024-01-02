const core = require("@actions/core");
const github = require("@actions/github");
const tc = require("@actions/tool-cache");
const exec = require("@actions/exec");
const io = require("@actions/io");

const fs = require("fs");
const path = require("path");
const os = require("os");

var PERL;

async function install_cpm_location() {
  let out = "";

  const options = {};
  options.listeners = {
    stdout: (data) => {
      out += data.toString();
    },
  };

  var p = core.getInput("path");
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

function is_false(b) {
  return is_true(b) ? false : true;
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
  var w_args = [];

  if (args !== null && args.length) {
    w_args = args.split(/\s+/);
  }

  /* base CMD_install command */
  var CMD_install = [
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

  var has_run = false;

  /* install one ore more modules */
  if (install !== null && install.length) {
    // install one or more modules
    core.info(`install: ${install}!`);
    const list = install.split("\n");

    var cmd = [...CMD_install]; /* clone array */
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

    var cmd = [...CMD_install];
    cmd.push("--cpanfile", cpanfile_full_path);

    has_run = true;
    await do_exec(cmd);
  }

  /* custom run with args */
  if ( has_run === false && w_args.length ) {
    core.info(`custom run with args`);
    var cmd = [...CMD_install];
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

const core   = require('@actions/core');
const github = require('@actions/github');
const tc     = require('@actions/tool-cache');
const exec   = require('@actions/exec');
const io     = require('@actions/io');

const fs   = require('fs');
const path = require('path');

var PERL;

async function install_cpm_location() {
    let out = '';

    const options = {};
    options.listeners = {
        stdout: (data) => {
            out += data.toString();
        }
    };

    const p = core.getInput('path');
    await exec.exec( PERL, ['-MConfig', '-e', `print "${p}"` ], options);

    return path.resolve( out );
}

async function install_cpm(install_to) {
  const version   = core.getInput('version');
  const url       = `https://raw.githubusercontent.com/skaji/cpm/${version}/cpm`;

  core.setOutput(`Get cpm from ${url}`);

  const cpmScript = await tc.downloadTool(url);

  core.setOutput("cpm", cpmScript);

  console.log(`install_to ${install_to}`);

  // need to run it as sudo
  await exec.exec( 'sudo', [ PERL, '-MFile::Copy=cp', '-e', `cp("${cpmScript}", "${install_to}"); chmod(0755, "${install_to}")` ] );
  //await io.cp(cpmScript, install_to); /* need to run with sudo */
  //await ioUtil.chmod(install_to, '0755')

  return install_to;
}

async function which_perl() {
    const perl = core.getInput('perl');
    if ( perl == 'perl' ) {
        return await io.which('perl', true);
    }
    return perl;
}

function is_true(b) {
    if ( b !== null && ( b === true || b == 'true' || b == '1' || b == 'ok' ) ) {
        return true;
    }

    return false;
}

function is_false(b) {
	return is_true(b) ? false : true;
}

async function do_exec(cmd) {
    const sudo   = is_true( core.getInput('sudo') );
    const bin = sudo ? 'sudo' : cmd.shift();

    console.log(`do_exec: ${bin}`);

    await exec.exec( bin, cmd );
}

async function run() {
  PERL = await which_perl();

  const cpm_location = await install_cpm_location();

  await install_cpm(cpm_location);

  // input arguments
  const install  = core.getInput('install');
  const cpanfile = core.getInput('cpanfile');
  const tests    = core.getInput('tests');
  const dash_g   = core.getInput('global');
  const args     = core.getInput('args');

  const w_tests  = is_true(tests) ? '--test' : '--no-test';
  var   w_args = [];

  if ( args !== null && args.length ) {
        w_args = args.split(/\s+/);
  }

  /* base CMD_install command */
  var CMD_install = [ PERL, cpm_location, 'install', '--show-build-log-on-failure', '-v', w_tests ];
  if ( is_true( dash_g ) ) {
    CMD_install.push('-g');
  }
  if ( w_args.length ) {
    CMD_install = CMD_install.concat( w_args );
  }

  /* install one ore more modules */
  if ( install !== null && install.length ) {
    // install one or more modules
    console.log(`install: ${install}!`);
    const list = install.split("\n");

    var cmd = [...CMD_install]; /* clone array */
    cmd = cmd.concat( list );

    await do_exec( cmd );
  }

  /* install from cpanfile */
  if ( cpanfile !== null && cpanfile.length ) {
    // install one or more modules
    console.log(`cpanfile: ${cpanfile}!`);
    const cpanfile_full_path = path.resolve(cpanfile);
    console.log(`cpanfile: ${cpanfile_full_path}! [resolved]`);

    var cmd = [...CMD_install];
    cmd.push( '--cpanfile', cpanfile_full_path );
    await do_exec( cmd );
  }
}

// Call run
(async() => {
  try {
    await run();
  } catch (error) {
    core.setFailed(error.message);
  }
})();

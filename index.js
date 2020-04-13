const core = require('@actions/core');
const github = require('@actions/github');
const tc = require('@actions/tool-cache');
const exec = require('@actions/exec');

async function action() {
  const cpmScript = await tc.downloadTool('https://git.io/cpm');
  core.setOutput("cpm", cpmScript);
  await exec.exec( 'sudo', [ 'perl', cpmScript, 'install', '-g', 'App::cpm'] );
  return;
}

// Call start
(async() => {
  try {
  	await action();	
  } catch (error) {
  	core.setFailed(error.message);	
  }
})();

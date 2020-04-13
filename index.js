const core = require('@actions/core');
const github = require('@actions/github');
const tc = require('@actions/tool-cache');
const exec = require('@actions/exec');

async function action() {

  const nameToGreet = core.getInput('who-to-greet');
  console.log(`Hello ${nameToGreet}!`);
  const time = (new Date()).toTimeString();
  core.setOutput("time", time);

  const cpmScript = await tc.downloadTool('https://git.io/cpm');

  core.setOutput("cpm", cpmScript);
  await exec.exec( 'sudo', 'perl', [ cpmScript, 'install', '-g', 'App::cpm'] );

  //core.addPath(nodeDirectory);

  // Get the JSON webhook payload for the event that triggered the workflow
  //const payload = JSON.stringify(github.context.payload, undefined, 2)
  //console.log(`The event payload: ${payload}`);

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

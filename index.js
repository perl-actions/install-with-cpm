const core = require('@actions/core');
const github = require('@actions/github');
const tc = require('@actions/tool-cache');
const exec = require('@actions/exec');

try {
  // `who-to-greet` input defined in action metadata file
  const nameToGreet = core.getInput('who-to-greet');
  console.log(`Hello ${nameToGreet}!`);
  const time = (new Date()).toTimeString();
  core.setOutput("time", time);

  // 
  const cpmScript = await tc.downloadTool('https://git.io/cpm');

  await exec.exec('perl', [ cpmScript, 'install', '-g' 'App::cpm'] );

  core.setOutput("cpm", cpmScript);
  //core.addPath(nodeDirectory);

  // Get the JSON webhook payload for the event that triggered the workflow
  //const payload = JSON.stringify(github.context.payload, undefined, 2)
  //console.log(`The event payload: ${payload}`);
} catch (error) {
  core.setFailed(error.message);
}
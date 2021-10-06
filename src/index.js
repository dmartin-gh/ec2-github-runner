const aws = require('./aws');
const gh = require('./gh');
const config = require('./config');
const core = require('@actions/core');

async function start() {
  const label = config.generateUniqueLabel();
  const githubRegistrationToken = await gh.getRegistrationToken();
  await aws.startEc2Instances(label, githubRegistrationToken);
  await gh.waitForRunnersRegistered(label);
}

async function stop() {
  await aws.terminateEc2Instances();
  await gh.removeRunners();
}

(async function () {
  try {
    config.input.mode === 'start' ? await start() : await stop();
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
})();

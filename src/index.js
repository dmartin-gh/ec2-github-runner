const aws = require('./aws');
const gh = require('./gh');
const config = require('./config');
const core = require('@actions/core');

async function start() {
  await aws.startEc2Instances(await gh.getRegistrationToken());
  await gh.waitForRunnersRegistered();
}

async function stop() {
  await aws.terminateEc2Instances();
  await gh.removeRunners();
}

(async function () {
  try {
    config.mode === 'start' ? await start() : await stop();
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
})();

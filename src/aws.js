const AWS = require('aws-sdk');
const core = require('@actions/core');
const config = require('./config');

function setOutput(label, ec2InstanceIds) {
  core.setOutput('label', label);
  core.setOutput('ec2-instance-ids', ec2InstanceIds.join(','));
}

// User data scripts are run as the root user
function buildUserDataScript(githubRegistrationToken, label) {
  if (config.input.runnerHomeDir) {
    // If runner home directory is specified, we expect the actions-runner software (and dependencies)
    // to be pre-installed in the AMI, so we simply cd into that directory and then start the runner
    return [
      '#!/bin/bash',
      `cd "${config.input.runnerHomeDir}"`,
      'export RUNNER_ALLOW_RUNASROOT=1',
      `export RUNNER_NAME="\`hostname\`-\`cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 10 | head -n 1\`"`,
      'export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
      `./config.sh --unattended --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --name "$RUNNER_NAME" --labels ${label}`,
      './run.sh',
    ];
  } else {
    return [
      '#!/bin/bash',
      'mkdir actions-runner && cd actions-runner',
      'case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=${ARCH}',
      'curl -O -L https://github.com/actions/runner/releases/download/v2.283.1/actions-runner-linux-${RUNNER_ARCH}-2.283.1.tar.gz',
      'tar xzf ./actions-runner-linux-${RUNNER_ARCH}-2.283.1.tar.gz',
      'export RUNNER_ALLOW_RUNASROOT=1',
      `export RUNNER_NAME="\`hostname\`-\`cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 10 | head -n 1\`"`,
      'export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1',
      `./config.sh --unattended --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --name "$RUNNER_NAME" --labels ${label}`,
      './run.sh',
    ];
  }
}

async function waitForInstancesRunning(ec2InstanceIds) {
  const ec2 = new AWS.EC2();

  try {
    await ec2.waitFor('instanceRunning', { InstanceIds: ec2InstanceIds }).promise();
    core.info(`AWS EC2 instances up and running: ${ec2InstanceIds}`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instances failed to initialize: ${ec2InstanceIds}`);
    throw error;
  }
}

async function startEc2Instances(label, githubRegistrationToken) {
  const ec2 = new AWS.EC2();

  const userData = buildUserDataScript(githubRegistrationToken, label);

  const params = {
    ImageId: config.input.ec2ImageId,
    InstanceType: config.input.ec2InstanceType,
    MinCount: config.input.count,
    MaxCount: config.input.count,
    UserData: Buffer.from(userData.join('\n')).toString('base64'),
    SubnetId: config.input.subnetId,
    SecurityGroupIds: [config.input.securityGroupId],
    IamInstanceProfile: { Name: config.input.iamRoleName },
    TagSpecifications: config.tagSpecifications,
  };

  try {
    const result = await ec2.runInstances(params).promise();
    const ec2InstanceIds = result.Instances.map((i) => i.InstanceId);
    core.info(`AWS EC2 instances started: ${ec2InstanceIds}`);
    setOutput(label, ec2InstanceIds);
    await waitForInstancesRunning(ec2InstanceIds);
  } catch (error) {
    core.error('AWS EC2 instances starting error');
    throw error;
  }
}

async function terminateEc2Instances() {
  const ec2 = new AWS.EC2();

  const params = {
    InstanceIds: config.input.ecsInstanceIds.split(','),
  };

  try {
    await ec2.terminateInstances(params).promise();
    core.info(`AWS EC2 instances terminated: ${config.input.ec2InstanceIds}`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instances failed to terminate: ${config.input.ec2InstanceIds}`);
    throw error;
  }
}

module.exports = {
  startEc2Instances,
  terminateEc2Instances,
};

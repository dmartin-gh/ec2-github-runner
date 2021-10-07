const AWS = require('aws-sdk');
const core = require('@actions/core');
const config = require('./config');

function setOutput(label, ec2InstanceIds) {
  core.setOutput('label', label);
  core.setOutput('ec2-instance-ids', ec2InstanceIds.join(','));
}

// User data scripts are run as the root user
// If runner home directory is specified, we expect the actions-runner software (and dependencies)
// to be pre-installed in the AMI, so we simply cd into that directory and then start the runner
const UserData = (v) => `\
#!/bin/bash -xe

# Echo this script output to file + console
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

# Error handler
trap 'catch $? $LINENO' EXIT
catch() {
    if [ "$1" != "0" ]; then
        echo "Error $1 occurred on line $2"
    fi
}

export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
export RUNNER_ALLOW_RUNASROOT=1
export RUNNER_HOME="${v.home}"
export RUNNER_NAME="\`hostname\`-\`cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 10 | head -n 1\`"

if [[ -n "$RUNNER_HOME" ]]; then
    cd $RUNNER_HOME
else
    mkdir actions-runner && cd actions-runner
    case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=\${ARCH}
    curl -O -L https://github.com/actions/runner/releases/download/v2.283.1/actions-runner-linux-\${RUNNER_ARCH}-2.283.1.tar.gz
    tar xzf ./actions-runner-linux-\${RUNNER_ARCH}-2.283.1.tar.gz
fi

./config.sh --unattended --url https://github.com/${v.owner}/${v.repo} --token ${v.token} --name "$RUNNER_NAME" --labels ${v.label}
./run.sh
`;

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

  const userData = UserData({
    home: config.input.runnerHomeDir || '',
    owner: config.githubContext.owner,
    repo: config.githubContext.repo,
    token: githubRegistrationToken,
    label: label,
  });

  const params = {
    ImageId: config.input.ec2ImageId,
    InstanceType: config.input.ec2InstanceType,
    MinCount: config.input.count,
    MaxCount: config.input.count,
    UserData: Buffer.from(userData).toString('base64'),
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
    InstanceIds: config.input.ec2InstanceIds.split(','),
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

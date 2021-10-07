const AWS = require('aws-sdk');
const core = require('@actions/core');
const config = require('./config');

function setOutput(ec2InstanceIDs) {
  core.setOutput('aws-ec2-instance-ids', ec2InstanceIDs.join(','));
  core.setOutput('github-runner-label', config.github.runner.label);
}

// User data to install the GitHub runner and start it as a systemd service using
// the provided svc.sh script from the runner package. If an existing runner
// installation is found (via the existence of the config.sh file), that installation
// is used instead of installing a new one (github-runner-version is ignored).
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
export RUNNER_NAME="$(cat /var/lib/cloud/data/instance-id)"
export RUNNER_HOME="${v.install}"
export RUNNER_USER="${v.user}"
export RUNNER_GROUP="$(id -gn ${v.user})"
export RUNNER_VERSION="${v.version}"

mkdir -p $RUNNER_HOME && cd $RUNNER_HOME

if [[ ! -f config.sh ]]; then
    case $(uname -m) in aarch64) ARCH="arm64" ;; amd64|x86_64) ARCH="x64" ;; esac && export RUNNER_ARCH=\${ARCH}
    curl -O -L https://github.com/actions/runner/releases/download/v\${RUNNER_VERSION}/actions-runner-linux-\${RUNNER_ARCH}-\${RUNNER_VERSION}.tar.gz
    tar xzf ./actions-runner-linux-\${RUNNER_ARCH}-\${RUNNER_VERSION}.tar.gz
fi

./config.sh --unattended --url https://github.com/${v.owner}/${v.repo} --token ${v.token} --name $RUNNER_NAME --labels ${v.label}

# Everything extracted from the tarball and created by config.sh should be owned
# by the user we want to run the actions-runner service as
chown -R $RUNNER_USER:$RUNNER_GROUP $RUNNER_HOME

./svc.sh install $RUNNER_USER
./svc.sh start
`;

async function waitForInstancesRunning(ec2InstanceIDs) {
  const ec2 = new AWS.EC2();

  try {
    await ec2.waitFor('instanceRunning', { InstanceIds: ec2InstanceIDs }).promise();
    core.info(`AWS EC2 instances up and running: ${ec2InstanceIDs}`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instances failed to initialize: ${ec2InstanceIDs}`);
    throw error;
  }
}

async function startEc2Instances(githubRegistrationToken) {
  const ec2 = new AWS.EC2();

  const userData = UserData({
    install: config.github.runner.installDir,
    label: config.github.runner.label,
    owner: config.github.context.owner,
    repo: config.github.context.repo,
    token: githubRegistrationToken,
    user: config.github.runner.user,
    version: config.github.runner.version,
  });

  const params = {
    ImageId: config.aws.ec2ImageID,
    InstanceType: config.aws.ec2InstanceType,
    MinCount: config.aws.ec2InstanceCount,
    MaxCount: config.aws.ec2InstanceCount,
    UserData: Buffer.from(userData).toString('base64'),
    SubnetId: config.aws.vpcSubnetID,
    SecurityGroupIds: [config.aws.vpcSecurityGroupID],
    IamInstanceProfile: { Name: config.aws.iamRoleName },
    TagSpecifications: config.aws.tagSpecifications,
  };

  try {
    const result = await ec2.runInstances(params).promise();
    const ec2InstanceIDs = result.Instances.map((i) => i.InstanceId);
    core.info(`AWS EC2 instances started: ${ec2InstanceIDs}`);
    setOutput(ec2InstanceIDs);
    await waitForInstancesRunning(ec2InstanceIDs);
  } catch (error) {
    core.error('AWS EC2 instances starting error');
    throw error;
  }
}

async function terminateEc2Instances() {
  const ec2 = new AWS.EC2();
  const params = { InstanceIds: config.aws.ec2InstanceIDs };

  try {
    await ec2.terminateInstances(params).promise();
    core.info(`AWS EC2 instances terminated: ${config.aws.ec2InstanceIDs}`);
    return;
  } catch (error) {
    core.error(`AWS EC2 instances failed to terminate: ${config.aws.ec2InstanceIDs}`);
    throw error;
  }
}

module.exports = {
  startEc2Instances,
  terminateEc2Instances,
};

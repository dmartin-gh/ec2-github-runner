const core = require('@actions/core');
const github = require('@actions/github');

class Config {
  constructor() {
    const required = { required: true };

    // The values of github.context.repo.owner and github.context.repo.repo are taken from
    // the environment variable GITHUB_REPOSITORY specified in "owner/repo" format and
    // provided by the GitHub Action at runtime
    this.github = {
      context: {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
      },
      token: core.getInput('github-token', required),
    };

    this.mode = core.getInput('mode', required);

    // Gather inputs
    if (this.mode == 'start') {
      this.aws = {
        ec2ImageID: core.getInput('aws-ec2-image-id', required),
        ec2InstanceCount: parseInt(core.getInput('aws-ec2-instance-count', required)),
        ec2InstanceName: core.getInput('aws-ec2-instance-name', required),
        ec2InstanceType: core.getInput('aws-ec2-instance-type', required),
        iamRoleName: core.getInput('aws-iam-role-name'),
        resourceTags: JSON.parse(core.getInput('aws-resource-tags', required)),
        vpcSecurityGroupID: core.getInput('aws-vpc-security-group-id', required),
        vpcSubnetID: core.getInput('aws-vpc-subnet-id', required),
      };

      this.github.runner = {
        installDir: core.getInput('github-runner-install-dir', required),
        label: this.generateUniqueLabel(),
        timeout: parseInt(core.getInput('github-runner-timeout', required)),
        user: core.getInput('github-runner-user', required),
        version: core.getInput('github-runner-version', required),
      };
    } else if (this.mode == 'stop') {
      this.aws = {
        ec2InstanceIDs: core.getInput('ec2-instance-ids', required).split(','),
      };

      this.github.runner = {
        label: core.getInput('github-runner-label', required),
      };
    } else {
      throw new Error(`Unrecognized mode "${this.mode}", allowed values: {start, stop}`);
    }

    // Process start inputs
    if (this.mode === 'start') {
      if (this.aws.ec2InstanceCount < 1) {
        throw new Error(`Invalid value for 'aws-ec2-instance-count': ${this.aws.ec2InstanceCount}`);
      }

      const tags = this.aws.resourceTags.concat([
        { Key: 'Name', Value: this.aws.ec2InstanceName },
        { Key: 'GitHubRepository', Value: `${this.github.context.owner}/${this.github.context.repo}` },
        { Key: 'GitHubRunID', Value: String(github.context.runId) },
        { Key: 'GitHubRunNumber', Value: String(github.context.runNumber) },
        { Key: 'GitHubWorkflow', Value: github.context.workflow },
        { Key: 'GitHubRunnerLabel', Value: this.github.runner.label },
      ]);

      this.aws.tagSpecifications = [
        { ResourceType: 'instance', Tags: tags },
        { ResourceType: 'volume', Tags: tags },
      ];
    }
  }

  generateUniqueLabel() {
    return Math.random().toString(36).substr(2, 8);
  }
}

try {
  module.exports = new Config();
} catch (error) {
  core.error(error);
  core.setFailed(error.message);
}

# On-demand self-hosted AWS EC2 runners for GitHub Actions

Start your EC2 [self-hosted runners](https://docs.github.com/en/free-pro-team@latest/actions/hosting-your-own-runners) right before you need them.
Run your jobs and then stop them when you are finished. All this automatically as a part of your GitHub Actions workflow.

![GitHub Actions self-hosted EC2 runner](docs/images/github-actions-summary.png)

See [below](#example-workflow) for an example workflow.

## Table of Contents

- [Use Cases](#use-cases)
- [Prerequisite Setup](#prerequisite-setup)
  - [Prepare IAM user with AWS access keys](#prepare-iam-user-with-aws-access-keys)
  - [Prepare GitHub personal access token](#prepare-github-personal-access-token)
  - [Prepare an EC2 image](#prepare-an-ec2-image)
  - [Prepare a VPC and security group](#prepare-a-vpc-and-security-group)
  - [Configure your GitHub workflow](#configure-your-github-workflow)
- [Action Inputs](#action-inputs)
  - [Required Environment Variables](#required-environment-variables)
- [Action Outputs](#action-outputs)
  - [Default EC2 Instance Tags](#default-ec2-instance-tags)
- [Example Workflow](#example-workflow)

## Use Cases

- **Access to private VPC resources** - Runners can be launched into any public or private subnet, allowing them access to any resources you would like them to interact with.
- **Customize hardware configuration** - Allocate smaller or larger instances than the default GitHub runners to fit the jobs at hand, without needing to manage static self-hosted runners.
- **Save on monthly compute costs** - Only pay for instances as needed as opposed to often-idle static self-hosted runners driving up the monthly bill. Depending on the instance size, it may even be cheaper than paying for minutes on the provided GitHub runners!

## Prerequisite Setup

Use the following steps to prepare your AWS account and GitHub workflow:

### Prepare IAM user with AWS access keys

1. Create a new IAM user for GitHub Actions to operate within your account. An IAM user specific to GitHub Actions is recommended.
1. Create AWS access keys for your IAM user and add them to your repository or organization secrets in GitHub.
1. Create and attach a role or direct policies to your IAM user granting the following minimum permissions. The affected resources can be restricted beyond `"*"` if you desire.

   ```
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ec2:RunInstances",
           "ec2:TerminateInstances",
           "ec2:DescribeInstances",
           "ec2:DescribeInstanceStatus"
         ],
         "Resource": "*"
       },
       {
        "Effect": "Allow",
        "Action": [
          "ec2:CreateTags"
        ],
        "Resource": "*",
        "Condition": {
          "StringEquals": {
            "ec2:CreateAction": "RunInstances"
          }
        }
      }
     ]
   }
   ```

1. (Optional) If you plan to attach an IAM role to the EC2 runners with the `iam-role-name` parameter, you will need to grant additional permissions to the IAM user:

   ```
   {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "ec2:ReplaceIamInstanceProfileAssociation",
          "ec2:AssociateIamInstanceProfile"
        ],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": "iam:PassRole",
        "Resource": "*"
      }
    ]
   }
   ```

### Prepare GitHub personal access token

1. Create a new GitHub personal access token with the `repo` scope.
   The action will use the token for self-hosted runners management in the GitHub account at the repository level.
1. Add the token to your repository or organization secrets in GitHub.

### Prepare an EC2 image

1. Create a new EC2 instance based on any [supported Linux distribution](https://docs.github.com/en/actions/hosting-your-own-runners/about-self-hosted-runners#supported-architectures-and-operating-systems-for-self-hosted-runners).
1. Connect to the instance and install `docker` and `git`, then enable `docker` service.

   For example, on Amazon Linux 2:

   ```
   sudo yum update -y
   sudo yum install git -y
   sudo yum install docker -y
   sudo systemctl enable docker
   ```

1. Install any other tools required for your workflow.
1. Create a new EC2 image (AMI) from the instance.
1. Remove the instance if not required anymore after the image is created.

### Prepare a VPC and security group

1. Create a new VPC or use an existing VPC you would like to launch instances in. This action can launch instances inside both private and public subnets.
1. Create a new security group for the runners in the VPC. Outbound traffic on port 443 is required for pulling jobs from GitHub. No inbound traffic is required.

### Configure your GitHub workflow

1. Use the documentation on this page and the example workflow below to configure your workflow with all the required inputs.
1. Don't forget to configure a job to remove the instances at the end of the workflow!

Now you're ready to go!

## Action Inputs

| Name                        | Mode    | Required | Description                                                                                                                                     |
| --------------------------- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                      | n/a     | yes      | The mode in which the action is operating: <br> - `start` - start a new set of runners <br> - `stop` - stop a previously created set of runners |
| `github-token`              | n/a     | yes      | GitHub Personal Access Token with the `repo` scope assigned                                                                                     |
| `aws-ec2-image-id`          | `start` | yes      | EC2 Image ID (AMI) to use for launching new runners                                                                                             |
| `aws-ec2-instance-count`    | `start` |          | Number of EC2 instances to create (default: 1)                                                                                                  |
| `aws-ec2-instance-name`     | `start` |          | `Name` tag value for each instance (default: `ec2-github-runner`)                                                                               |
| `aws-ec2-instance-type`     | `start` | yes      | EC2 Instance Type (example: `r5.2xlarge`)                                                                                                       |
| `aws-iam-role-name`         | `start` |          | IAM role name to attach (default: no IAM role)                                                                                                  |
| `aws-resource-tags`         | `start` |          | Additional tags for the instances (see [Default EC2 Instance Tags](#Default-ec2-instance-tags)).                                                |
| `aws-vpc-security-group-id` | `start` | yes      | EC2 Security Group ID (port 443 outbound required)                                                                                              |
| `aws-vpc-subnet-id`         | `start` | yes      | VPC Subnet ID (public or private)                                                                                                               |
| `github-runner-install-dir` | `start` |          | Directory to install the runner in (default: `/opt/actions-runner`)                                                                             |
| `github-runner-timeout`     | `start` |          | Minutes to wait for runners to register themselves (default: 5)                                                                                 |
| `github-runner-user`        | `start` |          | User to run workflows as (default: `root`)                                                                                                      |
| `github-runner-version`     | `start` |          | Version of the GitHub runner to install (default: `2.303.0`)                                                                                    |
| `aws-ec2-instance-ids`      | `stop`  | yes      | EC2 Instance IDs of runners created in a prior `start` step.                                                                                    |
| `github-runner-label`       | `stop`  | yes      | Unique label assigned to the runners in the `start` step.                                                                                       |

### Required Environment Variables

In addition to the inputs described above, the action also requires the following environment variables to access your AWS account:

- `AWS_DEFAULT_REGION`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

We recommend using [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) action to export these variables for you in a workflow step prior to this action.

## Action Outputs

| Name                   | Description                              |
| ---------------------- | ---------------------------------------- |
| `aws-ec2-instance-ids` | EC2 Instance IDs of the created runners. |
| `github-runner-label`  | Unique label assigned to the runners.    |

### Default EC2 Instance Tags

Instances and volumes created by this action will automatically be tagged with the following:

| Tag                 | Value                                                             |
| ------------------- | ----------------------------------------------------------------- |
| `Name`              | `ec2-github-runner` (override with `aws-ec2-instance-name` input) |
| `GitHubRepository`  | `${{ github.repository }}`                                        |
| `GitHubRunID`       | `${{ github.run_id }}`                                            |
| `GitHubRunNumber`   | `${{ github.run_number }}`                                        |
| `GitHubWorkflow`    | `${{ github.workflow }}`                                          |
| `GitHubRunnerLabel` | Unique label used to register this set of runners                 |

See the [github context](https://docs.github.com/en/actions/learn-github-actions/contexts#github-context) documentation for descriptions of these values.

## Example Workflow

Below is an example workflow that:

1. Creates a single new EC2 runner
1. Runs a job on the instance to print "Hello World"
1. Tears down the EC2 runner

```yml
name: EC2 Hello World Workflow
on: pull_request

jobs:
  start-runner:
    name: Start self-hosted EC2 runner
    runs-on: ubuntu-latest
    outputs:
      aws-ec2-instance-ids: ${{ steps.start-ec2-runner.outputs.aws-ec2-instance-ids }}
      github-runner-label: ${{ steps.start-ec2-runner.outputs.github-runner-label }}
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - name: Start EC2 runner
        id: start-ec2-runner
        uses: dmartin-gh/ec2-github-runner@main
        with:
          mode: start
          github-token: ${{ secrets.GITHUB_PERSONAL_ACCESS_TOKEN }}
          aws-ec2-image-id: ami-123
          aws-ec2-instance-type: t3.nano
          aws-vpc-subnet-id: subnet-123
          aws-vpc-security-group-id: sg-123
          aws-iam-role-name: my-role-name # optional
          aws-resource-tags: > # optional
            [
              {"Key": "ExtraTag1", "Value": "ExtraValue1"},
              {"Key": "ExtraTag2", "Value": "ExtraValue2"}
            ]

  hello-world:
    name: Say hello from EC2!
    needs: start-runner # required to start the main job after the runner is ready
    runs-on: ${{ needs.start-runner.outputs.github-runner-label }} # use newly created runner
    steps:
      - name: Hello World
        run: echo 'Hello World!'

  stop-runner:
    name: Stop self-hosted EC2 runner
    needs:
      - start-runner # required to get output from the start-runner job
      - hello-world # required to wait until the main job is done
    runs-on: ubuntu-latest
    if: ${{ always() }} # required to stop the runner even if an error occurs
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - name: Stop EC2 runner
        uses: dmartin-gh/ec2-github-runner@main
        with:
          mode: stop
          github-token: ${{ secrets.GITHUB_PERSONAL_ACCESS_TOKEN }}
          github-runner-label: ${{ needs.start-runner.outputs.github-runner-label }}
          aws-ec2-instance-ids: ${{ needs.start-runner.outputs.aws-ec2-instance-ids }}
```

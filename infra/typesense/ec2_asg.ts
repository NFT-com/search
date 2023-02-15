import * as aws from '@pulumi/aws'
import { ec2 } from '@pulumi/awsx'
import * as pulumi from '@pulumi/pulumi'

import { SharedInfraOutput } from '../defs'
import { getResourceName, getStage, getTags, isProduction } from '../helper'

type InfraOutput = Omit<SharedInfraOutput, 'typesenseSGId'> & {
  typesenseSGId: pulumi.Output<string>
}

const tags = {
  service: 'typesense',
}

interface BuildIngressRuleArgs {
  protocol: string
  fromPort: number
  toPort?: number
  sourceSecurityGroupId?: string[]
  selfSource?: boolean
}
const buildIngressRule = (
  {
    protocol,
    fromPort,
    toPort,
    sourceSecurityGroupId,
    selfSource,
  }: BuildIngressRuleArgs): any => {
  const rule = {
    protocol,
    fromPort: fromPort,
    toPort: toPort || fromPort,
  }
  if (sourceSecurityGroupId?.length) {
    return {
      ...rule,
      securityGroups: sourceSecurityGroupId,
    }
  }

  if (selfSource) {
    return {
      ...rule,
      self: selfSource,
    }
  }

  return {
    ...rule,
    cidrBlocks: new ec2.AnyIPv4Location().cidrBlocks,
    ipv6CidrBlocks: new ec2.AnyIPv6Location().ipv6CidrBlocks,
  }
}

const createSecurityGroup = (infraOutput: InfraOutput): aws.ec2.SecurityGroup => {
  const typesenseIngressRules = [
    buildIngressRule({ protocol: 'tcp', fromPort: 8108, sourceSecurityGroupId: [infraOutput.webSGId] }),
    buildIngressRule({ protocol: 'tcp', fromPort: 8107, toPort: 8108, selfSource: true }),
    buildIngressRule({ protocol: 'icmp', fromPort: -1, selfSource: true }),
  ]
  return new aws.ec2.SecurityGroup('sg_typesense', {
    description: 'Allow traffic to Typesense service',
    name: getResourceName('typesense-api'),
    vpcId: infraOutput.vpcId,
    ingress:
      isProduction() ?
        [
          ...typesenseIngressRules,
          buildIngressRule({ fromPort: 0, toPort: 65535, protocol: 'tcp', sourceSecurityGroupId: ['sg-0bad265e467cdec96'] }), // Bastion Host
        ]
        : typesenseIngressRules,
    egress: [buildIngressRule({ fromPort: 0, protocol: '-1' })],
  })
}

const createTargetGroup = (infraOutput: InfraOutput): aws.lb.TargetGroup => {
  return new aws.lb.TargetGroup('tg_typesense', {
    healthCheck: {
      healthyThreshold: 2,
      matcher: '200',
      path: '/health',
      timeout: 5,
      unhealthyThreshold: 2,
    },
    name: getResourceName('typesense-tg'),
    port: 8108,
    protocol: 'HTTP',
    vpcId: infraOutput.vpcId,
    tags: getTags(tags),
  })
}

const createLoadBalancer = (
  infraOutput: InfraOutput,
): aws.lb.LoadBalancer => {
  return new aws.lb.LoadBalancer('lb_typesense', {
    ipAddressType: 'ipv4',
    name: getResourceName('typesense-lb'),
    securityGroups: [infraOutput.webSGId],
    subnets: infraOutput.publicSubnetIds,
    tags: getTags(tags),
  })
}

const attachLBListeners = (
  lb: aws.lb.LoadBalancer,
  tg: aws.lb.TargetGroup,
): void => {
  new aws.lb.Listener('listener_http_typesense', {
    defaultActions: [
      {
        order: 1,
        redirect: {
          port: '443',
          protocol: 'HTTPS',
          statusCode: 'HTTP_301',
        },
        type: 'redirect',
      },
    ],
    loadBalancerArn: lb.arn,
    port: 80,
    protocol: 'HTTP',
    tags: getTags(tags),
  })

  new aws.lb.Listener('listener_https_typesense', {
    certificateArn:
      'arn:aws:acm:us-east-1:016437323894:certificate/44dc39c0-4231-41f6-8f27-03029bddfa8e',
    defaultActions: [
      {
        targetGroupArn: tg.arn,
        type: 'forward',
      },
    ],
    loadBalancerArn: lb.arn,
    port: 443,
    protocol: 'HTTPS',
    sslPolicy: 'ELBSecurityPolicy-2016-08',
    tags: getTags(tags),
  })
}

const getAmi = (): pulumi.Output<aws.ec2.GetAmiResult> => {
  return aws.ec2.getAmiOutput({
    filters: [{
      name: 'name',
      values: ['ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*'],
    }],
    owners: ['099720109477'], // Canonical
    mostRecent: true,
  })
}

const createBlockDevices = (config: pulumi.Config): aws.ebs.Volume[] => {
  const azs = config.require('tsAvailabilityZones').split(',')
  return azs.map((az) => {
    return new aws.ebs.Volume(getResourceName(`typesense-${az.slice(-2)}`), {
      availabilityZone: az,
      size: config.requireNumber('tsEbsSize'),
      type: 'gp3',
      iops: isProduction() ? 10_000 : undefined,
      throughput: isProduction() ? 500 : undefined,
      tags: getTags({
        ...tags,
        'availability-zone': az,
        'Name': getResourceName(`typesense-${az.slice(-2)}`),
      }),
    })
  })
}

const typesenseVersionMap: {[key: string]: string }= {
  dev: '0.24.1.rc4',
  staging: '0.24.1.rc4',
  'prod-gold': '0.24.1.rc4',
  'prod-black': '0.24.0.rcn56',
}
const getUserData = (): string => {
  const mountPoint = getStage() !== 'dev' ? '/dev/nvme1n1' : '/dev/xvdf'
  const typesenseVersion = typesenseVersionMap[getStage()]
  return `#!/bin/bash -ex
  # Download and install packages
  curl https://packages.fluentbit.io/fluentbit.key | gpg --dearmor > /usr/share/keyrings/fluentbit-keyring.gpg
  export CODENAME=$(cat /etc/lsb-release | grep -m 1 DISTRIB_CODENAME | cut -d "=" -f2)
  echo "deb [signed-by=/usr/share/keyrings/fluentbit-keyring.gpg] \
  https://packages.fluentbit.io/ubuntu/\${CODENAME} \${CODENAME} main" >> /etc/apt/sources.list.d/fluentbit.list 
  apt-get update
  apt-get install -y awscli jq fluent-bit

  export NOW=$(date +%s%N)
  cat > '/etc/fluent-bit/parsers.conf' <<-'PARSERS_CONF'
[PARSER]
    Name        glog
    Format      regex
    Regex       ^(?<severity>[IWEF])(?<timestamp>\\d{8} \\d{2}:\\d{2}:\\d{2}\\.\\d{6}) +(?<thread>\\d+) (?<src_file>[^:]+):(?<src_line>\\d+)\\] (?<msg>.*)$
    Time_Key    timestamp
    Time_Format %Y%m%d %H:%M:%S.%L
    Time_Keep   On
  PARSERS_CONF
  cat > '/etc/fluent-bit/fluent-bit.conf' <<-FLUENTBIT_CONF
  [SERVICE]
      flush        10
      daemon       Off
      log_level    info
      parsers_file parsers.conf
      plugins_file plugins.conf
      http_server  Off
  [INPUT]
      name tail
      path /var/log/typesense/typesense.log
  [OUTPUT]
      Name                cloudwatch_logs
      Match               *
      region              us-east-1
      log_group_name      /ec2/typesense
      log_stream_name     ${getStage()}-${typesenseVersion}-\${NOW}
      auto_create_group   true
      log_key             log
      log_retention_days  1
  FLUENTBIT_CONF
  systemctl restart fluent-bit.service

  # Attach and mount EBS volume
  EC2_AVAIL_ZONE=$(curl -s http://169.254.169.254/latest/meta-data/placement/availability-zone)
  export AWS_DEFAULT_REGION=$(curl -s \
    http://169.254.169.254/latest/meta-data/placement/availability-zone | sed 's/[a-z]$//')
  
  until ! [ -z $EBS_VOLUME ]; do
    EBS_VOLUME=$(aws ec2 describe-volumes \
      --filters Name=tag:service,Values=typesense \
      Name=tag:env,Values=${process.env.STAGE || 'dev'} \
      Name=availability-zone,Values=$EC2_AVAIL_ZONE \
      --query 'Volumes[*].[VolumeId, State==\`available\`]' \
      --output text  \
      | grep True \
      | awk '{print $1}' \
      | head -n 1)

    if [[ -z "$EBS_VOLUME" ]]; then
      sleep 2
    fi
  done

  EC2_INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
  aws ec2 attach-volume --volume-id $EBS_VOLUME --instance-id $EC2_INSTANCE_ID --device /dev/sdf
      
  VOLUME_STATE='unknown'
  until [[ "$VOLUME_STATE" == 'attached' ]]; do
    VOLUME_STATE=$(aws ec2 describe-volumes \
      --filters \
          Name=attachment.instance-id,Values=$EC2_INSTANCE_ID \
          Name=attachment.device,Values=/dev/sdf \
      --query Volumes[].Attachments[].State \
      --output text)

    if ! [[ "$VOLUME_STATE" == 'attached' ]]; then
      sleep 2
    fi
  done
  
  if [ "$(file -b -s ${mountPoint})" == 'data' ]; then
    mkfs -t ext4 ${mountPoint}
  fi

  mkdir -p /var/lib/typesense
  mount ${mountPoint} /var/lib/typesense

  # Persist the volume in /etc/fstab so it gets mounted again
  echo '${mountPoint} /var/lib/typesense ext4 defaults,nofail 0 2' >> /etc/fstab

  # Download and install Typesense
  curl -O https://dl.typesense.org/releases/${typesenseVersion}/typesense-server-${typesenseVersion}-amd64.deb
  apt-get install -y ./typesense-server-${typesenseVersion}-amd64.deb
  EC2_PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)
  echo "peering-address = $EC2_PRIVATE_IP" >> /etc/typesense/typesense-server.ini
  echo 'peering-port = 8107' >> /etc/typesense/typesense-server.ini
  echo 'enable-cors = true' >> /etc/typesense/typesense-server.ini
  echo 'nodes = /etc/typesense/nodes' >> /etc/typesense/typesense-server.ini
  echo 'num-documents-parallel-load = 50000' >> /etc/typesense/typesense-server.ini
  sed -i 's/api-key = .*/api-key = ${process.env.TYPESENSE_API_KEY}/' /etc/typesense/typesense-server.ini
  cat > '/etc/logrotate.d/typesense' <<-'LOGROTATE'
  /var/log/typesense/typesense.log {
    rotate 7
    daily    
    compress
    missingok
    notifempty
    copytruncate
  }
  LOGROTATE

  # Add SSM Command to rc.local incase the instance is restarted
  cat > '/etc/rc.local' <<-'SSM_SEND_COMMAND'
  export AWS_DEFAULT_REGION=$(curl -s \
    http://169.254.169.254/latest/meta-data/placement/availability-zone | sed 's/[a-z]$//')
  aws ssm send-command --document-name "AWS-RunShellScript" --document-version "1" \
    --targets '[\
      {"Key":"tag:service","Values":["typesense"]},\
      {"Key":"tag:env","Values":["${process.env.STAGE || 'dev'}"]}\
    ]' \
    --parameters '{\
      "workingDirectory":[""],\
      "executionTimeout":["3600"],\
      "commands":[\
        "EC2_REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/availability-zone \
          | sed '"'"'s/[a-z]$//'"'"')",\
        "aws ec2 describe-instances \
          --filters \
            Name=tag:service,Values=typesense \
            Name=tag:env,Values=${process.env.STAGE || 'dev'} \
          --region $EC2_REGION \
          --query '"'"'Reservations[].Instances[].PrivateIpAddress'"'"' \
          --output json | jq '"'"'.[] += \\":8107:8108\\"'"'"' | jq -r '"'"'join(\\",\\")'"'"' \
          | tee /etc/typesense/nodes",\
        "systemctl restart typesense-server.service"\
        ]\
      }' \
    --timeout-seconds 600 \
    --max-concurrency "1" \
    --max-errors "0"
  SSM_SEND_COMMAND
  chmod 755 /etc/rc.local
  . /etc/rc.local
  `.replace(/^\s{0,2}/gm, '')
}

const createInstanceProfile = (): aws.iam.InstanceProfile => {
  const role = new aws.iam.Role('role_typesense', {
    name: getResourceName('typesense'),
    path: '/',
    assumeRolePolicy: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRole',
          Principal: {
            Service: 'ec2.amazonaws.com',
          },
          Effect: 'Allow',
        },
      ],
    },
    tags: getTags(tags),
  })

  const policy = new aws.iam.Policy('po_typesense', {
    name: getResourceName('typesense'),
    policy: {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: [
            'ec2:AttachVolume',
            'ec2:DetachVolume',
          ],
          Resource: '*',
          Condition: {
            StringEquals: { 'aws:ResourceTag/service': 'typesense' },
          },
        },
        {
          Effect: 'Allow',
          Action: [
            'ec2:Describe*',
            'ssm:CancelCommand',
            'ssm:GetCommandInvocation',
            'ssm:ListCommandInvocations',
            'ssm:ListCommands',
            'ssm:SendCommand',
            'ssm:GetAutomationExecution',
            'ssm:GetParameters',
            'ssm:StartAutomationExecution',
            'ssm:ListTagsForResource',
            'ssm:GetCalendarState',
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            'logs:DescribeLogStreams',
            'logs:PutRetentionPolicy',
          ],
          Resource: '*',
        },
      ],
    },
    tags: getTags(tags),
  })

  new aws.iam.RolePolicyAttachment('rpa_typesense_ssm_core', {
    role: role.name,
    policyArn: aws.iam.ManagedPolicy.AmazonSSMManagedInstanceCore,
  })

  new aws.iam.RolePolicyAttachment('rpa_typesense_ssm_patch', {
    role: role.name,
    policyArn: aws.iam.ManagedPolicy.AmazonSSMPatchAssociation,
  })

  new aws.iam.RolePolicyAttachment('rpa_typesense_custom', {
    role: role.name,
    policyArn: policy.arn,
  })

  return new aws.iam.InstanceProfile('inpr_typesense', {
    role: role.name,
    name: getResourceName('typesense'),
    tags: getTags(tags),
  })
}

const createLaunchTemplate = (
  config: pulumi.Config, infraOutput: InfraOutput,
): aws.ec2.LaunchTemplate => {
  const ami = getAmi()
  const typesenseProfile = createInstanceProfile()

  return new aws.ec2.LaunchTemplate('lt_typesense', {
    namePrefix: getResourceName('typesense'),
    updateDefaultVersion: true,
    imageId: ami.id,
    instanceType: config.require('tsInstance'),
    iamInstanceProfile: { name: typesenseProfile.name },
    keyName: isProduction() ? 'typesense_key' : 'eth_node_key',
    vpcSecurityGroupIds: [infraOutput.typesenseSGId],
    userData: Buffer.from(getUserData()).toString('base64'),
    monitoring: {
      enabled: true,
    },
    tagSpecifications: [{
      resourceType: 'instance',
      tags: getTags({
        ...tags,
        Name: getResourceName('typesense'),
      }),
    }],
    tags: getTags(tags),
  })
}

const createAutoScalingGroup = (
  config: pulumi.Config,
  infraOutput: InfraOutput,
  lt: aws.ec2.LaunchTemplate,
  tg: aws.lb.TargetGroup,
): aws.autoscaling.Group => {
  const subnetIds = config.require('tsAvailabilityZones').split(',').map((az) => {
    return pulumi.output(aws.ec2.getSubnet({
      vpcId: infraOutput.vpcId,
      availabilityZone: az,
      filters: [{
        name: 'tag:type',
        values: [isProduction() ? 'private' : 'public'],
      }],
    })).id
  })

  return new aws.autoscaling.Group('asg_typesense', {
    name: getResourceName('typesense'),
    desiredCapacity: config.requireNumber('tsAutoScaleMin'),
    maxSize: config.requireNumber('tsAutoScaleMin'),
    minSize: config.requireNumber('tsAutoScaleMin'),
    launchTemplate: {
      id: lt.id,
      version: '$Latest',
    },
    healthCheckGracePeriod: 390,
    instanceRefresh: {
      preferences: {
        checkpointDelay: '60',
        checkpointPercentages: [33, 66, 100],
        minHealthyPercentage: 100,
      },
      strategy: 'Rolling',
      triggers: [
        'tag',
      ],
    },
    targetGroupArns: [tg.arn],
    vpcZoneIdentifiers: subnetIds,
    tags: [{
      key: 'service',
      propagateAtLaunch: true,
      value: 'typesense',
    },
    {
      key: 'refreshTime',
      propagateAtLaunch: true,
      value: new Date().toISOString(),
    }],
  })
}

export const createEc2Asg = (config: pulumi.Config, infraOutput: InfraOutput): void => {
  const sg = createSecurityGroup(infraOutput)
  infraOutput.typesenseSGId = sg.id
  const tg = createTargetGroup(infraOutput)
  const lb = createLoadBalancer(infraOutput)
  attachLBListeners(lb, tg)
  if (config.requireNumber('tsAutoScaleMin') > 0) {
    createBlockDevices(config)
  }
  const lt = createLaunchTemplate(config, infraOutput)
  createAutoScalingGroup(config, infraOutput, lt, tg)
}
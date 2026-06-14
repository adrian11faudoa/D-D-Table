# MythicForge VTT — AWS Deployment Guide

Deploy MythicForge VTT to AWS in about 20 minutes using ECS Fargate, RDS PostgreSQL, ElastiCache Redis, S3, and CloudFront.

---

## Architecture Overview

```
Players/GM Browser
       │
       ▼
  CloudFront CDN
  ┌─────────────────────────────────────┐
  │  /assets  → S3 (static files)      │
  │  /uploads → S3 (user uploads)      │
  │  /ws      → ALB (WebSocket)        │
  │  /api     → ALB (REST API)         │
  │  /        → ALB (SPA frontend)     │
  └─────────────────────────────────────┘
       │
       ▼
  Application Load Balancer (ALB)
  - HTTPS termination
  - Sticky sessions (WebSocket)
       │
       ▼
  ECS Fargate (Auto-scaling)
  ┌─────────────────────────────────────┐
  │  mythicforge-server container       │
  │  - Node.js game server              │
  │  - WebSocket + REST API             │
  │  - Mounted EFS volume (/data)       │
  └─────────────────────────────────────┘
       │         │            │
       ▼         ▼            ▼
  RDS           Redis       EFS
  PostgreSQL    ElastiCache  (plugins,
  (campaigns,   (sessions,    session
  actors,       cache,        data)
  scenes)       pub/sub)
```

---

## Prerequisites

```bash
# Install required tools
brew install awscli docker jq          # macOS
# or
apt install awscli docker.io jq        # Ubuntu

# Configure AWS credentials
aws configure
# Enter: Access Key ID, Secret Key, Region (us-east-1), output (json)

# Verify
aws sts get-caller-identity
```

---

## Quick Start (First Deploy)

```bash
# 1. Clone and enter the project
git clone https://github.com/yourorg/mythicforge-vtt.git
cd mythicforge-vtt

# 2. Make the deploy script executable
chmod +x deploy.sh

# 3. Set your secrets (or let the script generate them)
export JWT_SECRET=$(openssl rand -hex 32)
export DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
echo "JWT_SECRET=$JWT_SECRET"   # SAVE THIS
echo "DB_PASSWORD=$DB_PASSWORD" # SAVE THIS

# 4. Full deploy (setup + build + push + deploy)
./deploy.sh full

# Done! The script prints your app URL at the end.
```

The first deploy takes **~15–20 minutes** (CloudFormation creates all AWS resources).

---

## Step-by-Step Manual Deployment

### Step 1 — Deploy AWS Infrastructure

```bash
./deploy.sh setup
```

This creates:
- VPC with public/private subnets across 2 AZs
- ECS Fargate cluster
- RDS PostgreSQL (t4g.micro, ~$15/month)
- ElastiCache Redis (t4g.micro, ~$13/month)
- EFS file system (persistent storage)
- S3 bucket (assets & uploads)
- CloudFront distribution (global CDN)
- Application Load Balancer
- All IAM roles, security groups, etc.

### Step 2 — Build & Push Docker Image

```bash
./deploy.sh build
```

This builds the Docker image and pushes it to ECR (Elastic Container Registry).

### Step 3 — Deploy to ECS

```bash
./deploy.sh deploy
```

This forces a new ECS deployment and waits for it to stabilize.

### Check Status

```bash
./deploy.sh status
```

---

## With a Custom Domain

### Option A: Route 53 + ACM (Recommended)

```bash
# 1. Request ACM certificate (must be in us-east-1 for CloudFront)
aws acm request-certificate \
  --domain-name vtt.yourdomain.com \
  --validation-method DNS \
  --region us-east-1

# 2. Get the certificate ARN
aws acm list-certificates --region us-east-1

# 3. Deploy with domain
DOMAIN_NAME=vtt.yourdomain.com \
CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456:certificate/abc-xyz \
./deploy.sh setup

# 4. Add Route 53 CNAME
# Get the CloudFront domain from stack outputs
ALB_URL=$(aws cloudformation describe-stacks \
  --stack-name mythicforge-vtt \
  --query "Stacks[0].Outputs[?OutputKey=='ALBURL'].OutputValue" \
  --output text)

# Create CNAME: vtt.yourdomain.com -> $ALB_URL
```

### Option B: Third-party DNS

After deploying, get the ALB URL:
```bash
./deploy.sh status
# Shows: ALB URL: mythicforge-vtt-alb-123456.us-east-1.elb.amazonaws.com
```

Create a CNAME record in your DNS provider:
```
vtt.yourdomain.com CNAME mythicforge-vtt-alb-123456.us-east-1.elb.amazonaws.com
```

---

## Updating the Application

After making code changes:

```bash
# Rebuild and redeploy
./deploy.sh build
./deploy.sh deploy

# Or both at once
IMAGE_TAG=v1.2.0 ./deploy.sh build && ./deploy.sh deploy
```

The deployment is **zero-downtime** — ECS runs new tasks before stopping old ones.

---

## Environment Variables

All environment variables are managed through AWS Secrets Manager and ECS task definitions. To update:

```bash
# Update JWT secret
aws secretsmanager update-secret \
  --secret-id mythicforge/production/jwt-secret \
  --secret-string '{"JWT_SECRET":"your-new-secret"}'

# Force redeployment to pick up new secret
./deploy.sh deploy
```

---

## Scaling

### Manual scaling

```bash
aws ecs update-service \
  --cluster mythicforge-production \
  --service mythicforge-production \
  --desired-count 3
```

### Auto-scaling

Already configured in CloudFormation — scales at 70% CPU utilization, min 1, max 10 tasks.

For large campaigns with many players, you may want to increase:
- `TaskCpu`: 1024 (1 vCPU) or 2048 (2 vCPU)
- `TaskMemory`: 2048 or 4096 MB
- `DesiredCount`: 2+ for high availability

Update the stack:
```bash
aws cloudformation deploy \
  --stack-name mythicforge-vtt \
  --template-file infra/cloudformation.yml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      TaskCpu=1024 \
      TaskMemory=2048 \
      DesiredCount=2 \
      JwtSecret=$JWT_SECRET \
      DBPassword=$DB_PASSWORD \
  --no-fail-on-empty-changeset
```

---

## CI/CD with GitHub Actions

```bash
# Add these secrets to your GitHub repo:
# Settings → Secrets and variables → Actions

# Required:
AWS_ACCESS_KEY_ID       # IAM user access key
AWS_SECRET_ACCESS_KEY   # IAM user secret key
JWT_SECRET              # Your JWT secret
DB_PASSWORD             # RDS password

# Optional:
DOMAIN_NAME             # e.g. vtt.yourgame.com
CERTIFICATE_ARN         # ACM cert ARN
```

Then push to `main` — GitHub Actions will automatically build and deploy.

Create an IAM user for CI/CD with these permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "ecs:ListTasks",
        "cloudformation:DescribeStacks",
        "elasticloadbalancing:DescribeTargetHealth"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## Monitoring & Logs

### View Logs

```bash
# Tail live logs
./deploy.sh logs

# Filter for errors
./deploy.sh logs "ERROR"

# Or directly with AWS CLI
aws logs tail /ecs/mythicforge-production --follow
```

### CloudWatch Metrics

Pre-configured alarms:
- **High CPU**: alerts when ECS CPU > 85% for 5 minutes
- **Low DB Storage**: alerts when RDS has < 5 GB free

View in AWS Console → CloudWatch → Alarms.

### Container Insights

ECS Container Insights is enabled. View in:
CloudWatch → Container Insights → Select cluster: `mythicforge-production`

---

## Debugging

### Open a shell in a running container

```bash
./deploy.sh shell
```

This uses `aws ecs execute-command` to open an interactive shell — no SSH needed.

### Database access

```bash
# Get DB endpoint
DB_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name mythicforge-vtt \
  --query "Stacks[0].Outputs[?OutputKey=='DBEndpoint'].OutputValue" \
  --output text)

# Connect via AWS SSM (no bastion host needed)
# Or temporarily add your IP to RDS security group
psql postgresql://mythicforge:$DB_PASSWORD@$DB_ENDPOINT:5432/mythicforge
```

---

## Cost Estimate

| Service | Instance | Est. Monthly |
|---------|----------|-------------|
| ECS Fargate | 0.5 vCPU, 1 GB (always on) | ~$15 |
| RDS PostgreSQL | db.t4g.micro | ~$15 |
| ElastiCache Redis | cache.t4g.micro | ~$13 |
| ALB | per hour + LCU | ~$18 |
| CloudFront | first 1 TB free | ~$0–5 |
| EFS | per GB stored | ~$1 |
| ECR | storage + transfer | ~$1 |
| **Total** | | **~$63/month** |

**Cost optimization tips:**
- Use `FARGATE_SPOT` capacity provider (up to 70% cheaper) for non-critical tasks
- Reduce to `db.t4g.micro` with no Multi-AZ for dev/staging (~$12/month)
- Shut down staging environments when not in use

For a small group of friends (1–8 players), cost can be reduced to ~$35/month by:
- Removing Redis (set `REDIS_URL=` blank, single Fargate task)
- Using SQLite on EFS instead of RDS (set `DATABASE_URL=file:/data/mythicforge.db`)

---

## Backups

### RDS Automated Backups
Production RDS has 7-day automated backups. Restore:
```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier mythicforge-production \
  --target-db-instance-identifier mythicforge-restore \
  --restore-time 2025-01-15T12:00:00Z
```

### Manual Backup
```bash
# Dump PostgreSQL
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Upload to S3
aws s3 cp backup-$(date +%Y%m%d).sql s3://$S3_BUCKET/backups/
```

---

## Teardown

```bash
# DELETES EVERYTHING — irreversible
./deploy.sh destroy
```

---

## Troubleshooting

### Tasks keep failing to start

```bash
# Check task stopped reason
aws ecs describe-tasks \
  --cluster mythicforge-production \
  --tasks $(aws ecs list-tasks --cluster mythicforge-production --query 'taskArns[0]' --output text) \
  --query 'tasks[0].stoppedReason'

# Check container logs
./deploy.sh logs
```

Common causes:
- Wrong `JWT_SECRET` format in Secrets Manager
- Database connection string wrong (check `DATABASE_URL` in task env)
- EFS mount failed (check EFS security group allows port 2049 from ECS SG)

### WebSocket disconnections

ALB idle timeout defaults to 60s. MythicForge already sets it to 3600s in the CloudFormation template. If you're still seeing disconnections, check:
```bash
aws elbv2 describe-load-balancer-attributes \
  --load-balancer-arn $ALB_ARN \
  --query 'Attributes[?Key==`idle_timeout.timeout_seconds`]'
```

### Health check failing

```bash
curl http://$(./deploy.sh status 2>&1 | grep "ALB URL" | awk '{print $NF}')/api/health
```

Should return `{"status":"ok",...}`.

---

*MythicForge VTT AWS Guide — forge your legend in the cloud!*

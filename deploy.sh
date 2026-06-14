#!/usr/bin/env bash
# ============================================================
# MythicForge VTT — AWS Deployment Script
# Usage: ./deploy.sh [command] [options]
#
# Commands:
#   setup     First-time AWS setup (ECR, stack, secrets)
#   build     Build & push Docker image to ECR
#   deploy    Deploy new image to ECS
#   full      setup + build + deploy (first run)
#   status    Show stack and service status
#   logs      Tail ECS logs
#   shell     Open shell in running ECS container
#   destroy   Tear down everything (CAREFUL!)
# ============================================================

set -euo pipefail

# ── Config ───────────────────────────────────────────────────
STACK_NAME="${STACK_NAME:-mythicforge-vtt}"
ENVIRONMENT="${ENVIRONMENT:-production}"
AWS_REGION="${AWS_REGION:-us-east-1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[MythicForge]${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*"; exit 1; }
sep()  { echo -e "${BLUE}────────────────────────────────────────${NC}"; }

# ── Prerequisites check ───────────────────────────────────────
check_prereqs() {
  log "Checking prerequisites..."
  command -v aws    &>/dev/null || err "aws CLI not found. Install: https://aws.amazon.com/cli/"
  command -v docker &>/dev/null || err "docker not found. Install: https://docs.docker.com/get-docker/"
  command -v jq     &>/dev/null || err "jq not found: brew install jq / apt install jq"

  aws sts get-caller-identity &>/dev/null || err "Not authenticated. Run: aws configure"

  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
  ECR_REPO="${ECR_REGISTRY}/${STACK_NAME}-${ENVIRONMENT}"

  ok "AWS Account: ${ACCOUNT_ID}"
  ok "Region:      ${AWS_REGION}"
  ok "Stack:       ${STACK_NAME}"
}

# ── Setup ─────────────────────────────────────────────────────
cmd_setup() {
  sep
  log "Setting up AWS infrastructure..."
  sep

  # Prompt for secrets if not set
  if [[ -z "${JWT_SECRET:-}" ]]; then
    JWT_SECRET=$(openssl rand -hex 32)
    warn "Generated JWT_SECRET: ${JWT_SECRET}"
    warn "Save this! You'll need it if you recreate the stack."
  fi

  if [[ -z "${DB_PASSWORD:-}" ]]; then
    DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
    warn "Generated DB_PASSWORD: ${DB_PASSWORD}"
    warn "Save this!"
  fi

  DOMAIN="${DOMAIN_NAME:-}"
  CERT_ARN="${CERTIFICATE_ARN:-}"

  log "Deploying CloudFormation stack (this takes ~15 minutes)..."
  aws cloudformation deploy \
    --template-file infra/cloudformation.yml \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --capabilities CAPABILITY_NAMED_IAM \
    --parameter-overrides \
        Environment="${ENVIRONMENT}" \
        JwtSecret="${JWT_SECRET}" \
        DBPassword="${DB_PASSWORD}" \
        DomainName="${DOMAIN}" \
        CertificateArn="${CERT_ARN}" \
        ImageTag="${IMAGE_TAG}" \
    --tags \
        Project=MythicForge \
        Environment="${ENVIRONMENT}" \
    || err "CloudFormation deployment failed"

  ok "Stack deployed!"

  # Save outputs to .env.aws
  log "Saving stack outputs..."
  aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" \
    --query 'Stacks[0].Outputs' \
    --output json | jq -r '.[] | "\(.OutputKey)=\(.OutputValue)"' > .env.aws

  ok "Stack outputs saved to .env.aws"
  cat .env.aws
}

# ── Build & Push ──────────────────────────────────────────────
cmd_build() {
  sep
  log "Building and pushing Docker image..."
  sep

  # Load ECR repo from stack outputs if available
  if [[ -f .env.aws ]]; then
    ECR_REPO_URI=$(grep ECRRepository .env.aws | cut -d= -f2)
    ECR_REGISTRY=$(echo "$ECR_REPO_URI" | cut -d/ -f1)
  fi

  [[ -z "${ECR_REGISTRY:-}" ]] && {
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
    ECR_REPO_URI="${ECR_REGISTRY}/${STACK_NAME}-${ENVIRONMENT}"
  }

  # ECR login
  log "Logging into ECR..."
  aws ecr get-login-password --region "${AWS_REGION}" | \
    docker login --username AWS --password-stdin "${ECR_REGISTRY}"
  ok "ECR login successful"

  # Build
  log "Building Docker image (${IMAGE_TAG})..."
  docker build \
    -f docker/Dockerfile.aws \
    -t "mythicforge-vtt:${IMAGE_TAG}" \
    -t "${ECR_REPO_URI}:${IMAGE_TAG}" \
    -t "${ECR_REPO_URI}:$(git rev-parse --short HEAD 2>/dev/null || echo 'local')" \
    --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --build-arg GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'local')" \
    .
  ok "Build complete"

  # Push
  log "Pushing to ECR..."
  docker push "${ECR_REPO_URI}:${IMAGE_TAG}"
  docker push "${ECR_REPO_URI}:$(git rev-parse --short HEAD 2>/dev/null || echo 'local')" 2>/dev/null || true
  ok "Push complete: ${ECR_REPO_URI}:${IMAGE_TAG}"
}

# ── Deploy ────────────────────────────────────────────────────
cmd_deploy() {
  sep
  log "Deploying to ECS..."
  sep

  # Get cluster and service names from stack
  ECS_CLUSTER=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" --region "${AWS_REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='ECSCluster'].OutputValue" \
    --output text)

  ECS_SERVICE="${STACK_NAME}-${ENVIRONMENT}"

  log "Forcing new deployment: ${ECS_CLUSTER}/${ECS_SERVICE}"
  aws ecs update-service \
    --cluster "${ECS_CLUSTER}" \
    --service "${ECS_SERVICE}" \
    --force-new-deployment \
    --region "${AWS_REGION}" \
    --output json | jq '.service.deployments[0] | {status, desiredCount, runningCount, pendingCount}'

  log "Waiting for deployment to stabilize..."
  aws ecs wait services-stable \
    --cluster "${ECS_CLUSTER}" \
    --services "${ECS_SERVICE}" \
    --region "${AWS_REGION}" && ok "Deployment stable!" || warn "Deployment timed out — check logs"

  cmd_status
}

# ── Status ────────────────────────────────────────────────────
cmd_status() {
  sep
  log "Stack Status"
  sep

  # CloudFormation
  STACK_STATUS=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" --region "${AWS_REGION}" \
    --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NOT_FOUND")
  echo "CloudFormation: ${STACK_STATUS}"

  # ECS
  ECS_CLUSTER=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" --region "${AWS_REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='ECSCluster'].OutputValue" \
    --output text 2>/dev/null || echo "")

  if [[ -n "${ECS_CLUSTER}" ]]; then
    aws ecs describe-services \
      --cluster "${ECS_CLUSTER}" \
      --services "${STACK_NAME}-${ENVIRONMENT}" \
      --region "${AWS_REGION}" \
      --query 'services[0].{running:runningCount,desired:desiredCount,pending:pendingCount,status:status}' \
      --output table
  fi

  # App URL
  APP_URL=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" --region "${AWS_REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='AppURL'].OutputValue" \
    --output text 2>/dev/null || echo "Unknown")
  echo ""
  ok "App URL: ${APP_URL}"

  # Health check
  log "Health check..."
  ALB_URL=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" --region "${AWS_REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='ALBURL'].OutputValue" \
    --output text 2>/dev/null || echo "")

  if [[ -n "${ALB_URL}" ]]; then
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://${ALB_URL}/api/health" --max-time 5 || echo "timeout")
    echo "Health: HTTP ${HTTP_STATUS}"
  fi
}

# ── Logs ──────────────────────────────────────────────────────
cmd_logs() {
  sep
  log "Tailing ECS logs (Ctrl+C to stop)..."
  sep

  LOG_GROUP="/ecs/${STACK_NAME}-${ENVIRONMENT}"
  LOG_STREAM_PREFIX="server"

  aws logs tail "${LOG_GROUP}" \
    --follow \
    --filter-pattern "${1:-}" \
    --format short \
    --region "${AWS_REGION}" || {
    warn "Log group not found. Ensure the service has started."
    warn "Log group: ${LOG_GROUP}"
  }
}

# ── Shell ─────────────────────────────────────────────────────
cmd_shell() {
  sep
  log "Opening shell in running ECS container..."
  sep

  ECS_CLUSTER=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" --region "${AWS_REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='ECSCluster'].OutputValue" \
    --output text)

  TASK_ARN=$(aws ecs list-tasks \
    --cluster "${ECS_CLUSTER}" \
    --service-name "${STACK_NAME}-${ENVIRONMENT}" \
    --region "${AWS_REGION}" \
    --query 'taskArns[0]' --output text)

  [[ "${TASK_ARN}" == "None" || -z "${TASK_ARN}" ]] && err "No running tasks found"

  log "Connecting to task: ${TASK_ARN}"
  aws ecs execute-command \
    --cluster "${ECS_CLUSTER}" \
    --task "${TASK_ARN}" \
    --container "mythicforge-server" \
    --command "/bin/sh" \
    --interactive \
    --region "${AWS_REGION}"
}

# ── Destroy ───────────────────────────────────────────────────
cmd_destroy() {
  sep
  warn "⚠ WARNING: This will DELETE ALL AWS resources!"
  warn "Stack: ${STACK_NAME}"
  warn "Region: ${AWS_REGION}"
  sep

  read -p "Type the stack name to confirm: " CONFIRM
  [[ "${CONFIRM}" != "${STACK_NAME}" ]] && err "Cancelled"

  # Empty S3 bucket first (required before CFN can delete it)
  S3_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name "${STACK_NAME}" --region "${AWS_REGION}" \
    --query "Stacks[0].Outputs[?OutputKey=='S3Bucket'].OutputValue" \
    --output text 2>/dev/null || echo "")

  if [[ -n "${S3_BUCKET}" ]]; then
    log "Emptying S3 bucket: ${S3_BUCKET}..."
    aws s3 rm "s3://${S3_BUCKET}" --recursive || true
  fi

  log "Destroying CloudFormation stack..."
  aws cloudformation delete-stack \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}"

  log "Waiting for deletion..."
  aws cloudformation wait stack-delete-complete \
    --stack-name "${STACK_NAME}" \
    --region "${AWS_REGION}" && ok "Stack deleted" || warn "Stack deletion may still be in progress"
}

# ── Help ──────────────────────────────────────────────────────
cmd_help() {
  cat <<EOF

${CYAN}⚔  MythicForge VTT — AWS Deployment${NC}

${YELLOW}Usage:${NC}
  ./deploy.sh <command> [options]

${YELLOW}Commands:${NC}
  ${GREEN}full${NC}      First-time deploy: setup + build + push + deploy
  ${GREEN}setup${NC}     Create AWS infrastructure (CloudFormation)
  ${GREEN}build${NC}     Build Docker image and push to ECR
  ${GREEN}deploy${NC}    Deploy latest image to ECS (force new deployment)
  ${GREEN}status${NC}    Show stack, service, and health status
  ${GREEN}logs${NC}      Tail CloudWatch logs (add filter as second arg)
  ${GREEN}shell${NC}     Interactive shell in running ECS task
  ${GREEN}destroy${NC}   Delete all AWS resources (irreversible!)

${YELLOW}Environment Variables:${NC}
  STACK_NAME       CloudFormation stack name (default: mythicforge-vtt)
  ENVIRONMENT      Environment tag (default: production)
  AWS_REGION       AWS region (default: us-east-1)
  IMAGE_TAG        Docker image tag (default: latest)
  JWT_SECRET       JWT secret (auto-generated if not set)
  DB_PASSWORD      RDS password (auto-generated if not set)
  DOMAIN_NAME      Custom domain (optional)
  CERTIFICATE_ARN  ACM certificate ARN for HTTPS (optional)

${YELLOW}Examples:${NC}
  # First-time setup
  export JWT_SECRET=your-secret-here
  export DB_PASSWORD=your-db-password
  ./deploy.sh full

  # Update after code changes
  ./deploy.sh build
  ./deploy.sh deploy

  # With custom domain
  DOMAIN_NAME=vtt.yourgame.com CERTIFICATE_ARN=arn:aws:acm:... ./deploy.sh setup

  # Debug logs
  ./deploy.sh logs "ERROR"

  # Staging environment
  STACK_NAME=mythicforge-staging ENVIRONMENT=staging ./deploy.sh full

EOF
}

# ── Main ──────────────────────────────────────────────────────
main() {
  local cmd="${1:-help}"
  shift || true

  check_prereqs

  case "${cmd}" in
    full)    cmd_setup; cmd_build; cmd_deploy ;;
    setup)   cmd_setup ;;
    build)   cmd_build ;;
    deploy)  cmd_deploy ;;
    status)  cmd_status ;;
    logs)    cmd_logs "$@" ;;
    shell)   cmd_shell ;;
    destroy) cmd_destroy ;;
    help|--help|-h) cmd_help ;;
    *) err "Unknown command: ${cmd}. Run ./deploy.sh help" ;;
  esac
}

main "$@"

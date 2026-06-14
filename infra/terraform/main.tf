# ============================================================
# MythicForge VTT — Terraform Infrastructure
# Alternative to CloudFormation for teams that prefer Terraform
# ============================================================

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  # Store state in S3 — create this bucket manually first
  # backend "s3" {
  #   bucket = "your-terraform-state-bucket"
  #   key    = "mythicforge/terraform.tfstate"
  #   region = "us-east-1"
  #   encrypt = true
  # }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "MythicForge"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# ─── Variables ────────────────────────────────────────────────
variable "aws_region"       { default = "us-east-1" }
variable "environment"      { default = "production" }
variable "stack_name"       { default = "mythicforge" }
variable "jwt_secret"       { sensitive = true }
variable "db_password"      { sensitive = true }
variable "domain_name"      { default = "" }
variable "certificate_arn"  { default = "" }
variable "task_cpu"         { default = 512 }
variable "task_memory"      { default = 1024 }
variable "desired_count"    { default = 1 }
variable "image_tag"        { default = "latest" }

locals {
  name       = "${var.stack_name}-${var.environment}"
  is_prod    = var.environment == "production"
  has_domain = var.domain_name != ""
}

# ─── Networking ───────────────────────────────────────────────
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${local.name}-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.10.0/24", "10.0.11.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = !local.is_prod
  enable_dns_hostnames   = true
  enable_dns_support     = true
}

# ─── Security Groups ──────────────────────────────────────────
resource "aws_security_group" "alb" {
  name   = "${local.name}-alb-sg"
  vpc_id = module.vpc.vpc_id

  ingress { from_port = 80;   to_port = 80;   protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"] }
  ingress { from_port = 443;  to_port = 443;  protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"] }
  egress  { from_port = 0;    to_port = 0;    protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_security_group" "ecs" {
  name   = "${local.name}-ecs-sg"
  vpc_id = module.vpc.vpc_id

  ingress { from_port = 3000; to_port = 3000; protocol = "tcp"; security_groups = [aws_security_group.alb.id] }
  egress  { from_port = 0;    to_port = 0;    protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_security_group" "rds" {
  name   = "${local.name}-rds-sg"
  vpc_id = module.vpc.vpc_id

  ingress { from_port = 5432; to_port = 5432; protocol = "tcp"; security_groups = [aws_security_group.ecs.id] }
}

resource "aws_security_group" "redis" {
  name   = "${local.name}-redis-sg"
  vpc_id = module.vpc.vpc_id

  ingress { from_port = 6379; to_port = 6379; protocol = "tcp"; security_groups = [aws_security_group.ecs.id] }
}

resource "aws_security_group" "efs" {
  name   = "${local.name}-efs-sg"
  vpc_id = module.vpc.vpc_id

  ingress { from_port = 2049; to_port = 2049; protocol = "tcp"; security_groups = [aws_security_group.ecs.id] }
}

# ─── S3 Bucket ────────────────────────────────────────────────
resource "random_id" "bucket_suffix" { byte_length = 4 }

resource "aws_s3_bucket" "assets" {
  bucket = "${local.name}-assets-${random_id.bucket_suffix.hex}"
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration { status = local.is_prod ? "Enabled" : "Suspended" }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  cors_rule {
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"]
    allowed_headers = ["*"]
    max_age_seconds = 3600
  }
}

# ─── EFS ──────────────────────────────────────────────────────
resource "aws_efs_file_system" "data" {
  encrypted        = true
  performance_mode = "generalPurpose"
  throughput_mode  = "bursting"

  lifecycle_policy { transition_to_ia = "AFTER_30_DAYS" }
}

resource "aws_efs_mount_target" "data" {
  count           = 2
  file_system_id  = aws_efs_file_system.data.id
  subnet_id       = module.vpc.private_subnets[count.index]
  security_groups = [aws_security_group.efs.id]
}

resource "aws_efs_access_point" "data" {
  file_system_id = aws_efs_file_system.data.id
  posix_user     { uid = 1001; gid = 1001 }
  root_directory {
    path = "/mythicforge"
    creation_info { owner_uid = 1001; owner_gid = 1001; permissions = "755" }
  }
}

# ─── RDS PostgreSQL ───────────────────────────────────────────
resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db-subnets"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_db_instance" "postgres" {
  identifier             = local.name
  engine                 = "postgres"
  engine_version         = "16.1"
  instance_class         = "db.t4g.micro"
  allocated_storage      = 20
  max_allocated_storage  = 100
  storage_type           = "gp3"
  storage_encrypted      = true
  db_name                = "mythicforge"
  username               = "mythicforge"
  password               = var.db_password
  multi_az               = local.is_prod
  backup_retention_period= local.is_prod ? 7 : 1
  deletion_protection    = local.is_prod
  skip_final_snapshot    = !local.is_prod
  final_snapshot_identifier = local.is_prod ? "${local.name}-final" : null
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
}

# ─── ElastiCache Redis ────────────────────────────────────────
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name}-redis-subnets"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = local.name
  description                = "MythicForge session cache"
  num_cache_clusters         = local.is_prod ? 2 : 1
  node_type                  = "cache.t4g.micro"
  engine_version             = "7.1"
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
}

# ─── ECR ──────────────────────────────────────────────────────
resource "aws_ecr_repository" "app" {
  name                 = "${local.name}-server"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration { scan_on_push = true }

  lifecycle {
    prevent_destroy = local.is_prod
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy     = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection    = { tagStatus = "any"; countType = "imageCountMoreThan"; countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}

# ─── Secrets Manager ──────────────────────────────────────────
resource "aws_secretsmanager_secret" "jwt" {
  name = "${local.name}/jwt-secret"
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = jsonencode({ JWT_SECRET = var.jwt_secret })
}

# ─── IAM ──────────────────────────────────────────────────────
resource "aws_iam_role" "ecs_execution" {
  name = "${local.name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow"; Principal = { Service = "ecs-tasks.amazonaws.com" }; Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "secrets"
  role = aws_iam_role.ecs_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow"; Action = ["secretsmanager:GetSecretValue"]; Resource = aws_secretsmanager_secret.jwt.arn }]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.name}-ecs-task"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow"; Principal = { Service = "ecs-tasks.amazonaws.com" }; Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "s3"
  role = aws_iam_role.ecs_task.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["s3:GetObject","s3:PutObject","s3:DeleteObject","s3:ListBucket"]
      Resource = [aws_s3_bucket.assets.arn, "${aws_s3_bucket.assets.arn}/*"]
    }]
  })
}

# ─── CloudWatch Logs ──────────────────────────────────────────
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name}"
  retention_in_days = local.is_prod ? 30 : 7
}

# ─── ECS Cluster ──────────────────────────────────────────────
resource "aws_ecs_cluster" "main" {
  name = local.name
  setting { name = "containerInsights"; value = "enabled" }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

# ─── ECS Task Definition ──────────────────────────────────────
resource "aws_ecs_task_definition" "app" {
  family                   = local.name
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  volume {
    name = "efs-data"
    efs_volume_configuration {
      file_system_id          = aws_efs_file_system.data.id
      transit_encryption      = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.data.id
        iam             = "DISABLED"
      }
    }
  }

  container_definitions = jsonencode([{
    name      = "mythicforge-server"
    image     = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
    essential = true
    portMappings = [{ containerPort = 3000; protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV";     value = "production" },
      { name = "PORT";         value = "3000" },
      { name = "AWS_REGION";   value = var.aws_region },
      { name = "S3_BUCKET";    value = aws_s3_bucket.assets.id },
      { name = "ASSETS_DIR";   value = "/data/assets" },
      { name = "UPLOADS_DIR";  value = "/data/uploads" },
      { name = "PLUGINS_DIR";  value = "/data/plugins" },
      { name = "DATABASE_URL"; value = "postgresql://mythicforge:${var.db_password}@${aws_db_instance.postgres.endpoint}/mythicforge" },
      { name = "REDIS_URL";    value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379" },
    ]
    secrets = [
      { name = "JWT_SECRET"; valueFrom = "${aws_secretsmanager_secret.jwt.arn}:JWT_SECRET::" }
    ]
    mountPoints = [{ containerPath = "/data"; sourceVolume = "efs-data"; readOnly = false }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "server"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL","curl -f http://localhost:3000/api/health || exit 1"]
      interval    = 30; timeout = 10; retries = 3; startPeriod = 30
    }
    ulimits = [{ name = "nofile"; softLimit = 65536; hardLimit = 65536 }]
  }])
}

# ─── ALB ──────────────────────────────────────────────────────
resource "aws_lb" "main" {
  name               = "${local.name}-alb"
  load_balancer_type = "application"
  subnets            = module.vpc.public_subnets
  security_groups    = [aws_security_group.alb.id]

  idle_timeout = 3600  # WebSocket long-lived connections
}

resource "aws_lb_target_group" "app" {
  name        = "${local.name}-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check { path = "/api/health"; interval = 30; timeout = 10; healthy_threshold = 2 }

  stickiness { type = "lb_cookie"; cookie_duration = 86400; enabled = true }

  deregistration_delay = 30
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect { protocol = "HTTPS"; port = "443"; status_code = "HTTP_301" }
  }
}

resource "aws_lb_listener" "https" {
  count             = local.has_domain ? 1 : 0
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# ─── ECS Service ──────────────────────────────────────────────
resource "aws_ecs_service" "app" {
  name            = local.name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    security_groups  = [aws_security_group.ecs.id]
    subnets          = module.vpc.private_subnets
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "mythicforge-server"
    container_port   = 3000
  }

  deployment_circuit_breaker { enable = true; rollback = true }
  health_check_grace_period_seconds = 60
  enable_execute_command            = true

  depends_on = [aws_lb_listener.https, aws_efs_mount_target.data]
}

# ─── Auto Scaling ─────────────────────────────────────────────
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = 10
  min_capacity       = 1
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification { predefined_metric_type = "ECSServiceAverageCPUUtilization" }
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# ─── Outputs ──────────────────────────────────────────────────
output "alb_dns"       { value = aws_lb.main.dns_name }
output "ecr_repo"      { value = aws_ecr_repository.app.repository_url }
output "s3_bucket"     { value = aws_s3_bucket.assets.id }
output "db_endpoint"   { value = aws_db_instance.postgres.endpoint }
output "redis_endpoint"{ value = aws_elasticache_replication_group.redis.primary_endpoint_address }
output "ecs_cluster"   { value = aws_ecs_cluster.main.name }

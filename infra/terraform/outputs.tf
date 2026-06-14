# ============================================================
# Terraform Outputs — MythicForge VTT
# ============================================================

output "app_url" {
  description = "Application URL (CloudFront or ALB)"
  value       = var.domain_name != "" ? "https://${var.domain_name}" : "http://${aws_lb.main.dns_name}"
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS name — use as CNAME target for custom domain"
  value       = aws_lb.main.dns_name
}

output "ecr_repository_url" {
  description = "ECR repository URL for pushing Docker images"
  value       = aws_ecr_repository.app.repository_url
}

output "ecr_registry" {
  description = "ECR registry URL (without repository name)"
  value       = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
}

output "s3_bucket_name" {
  description = "S3 bucket name for assets and uploads"
  value       = aws_s3_bucket.assets.id
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.assets.arn
}

output "db_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port)"
  value       = aws_db_instance.postgres.endpoint
  sensitive   = false
}

output "db_host" {
  description = "RDS PostgreSQL host only"
  value       = aws_db_instance.postgres.address
}

output "database_url" {
  description = "Full PostgreSQL connection string"
  value       = "postgresql://mythicforge:${var.db_password}@${aws_db_instance.postgres.endpoint}/mythicforge"
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_url" {
  description = "Full Redis connection URL (TLS)"
  value       = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
  sensitive   = true
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.app.name
}

output "efs_id" {
  description = "EFS file system ID"
  value       = aws_efs_file_system.data.id
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (for ECS tasks, RDS, Redis)"
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "Public subnet IDs (for ALB)"
  value       = module.vpc.public_subnets
}

output "log_group_name" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.app.name
}

output "deploy_commands" {
  description = "Commands to build and deploy after terraform apply"
  value       = <<-EOT
    # 1. Login to ECR
    aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com

    # 2. Build and push
    docker build -f docker/Dockerfile.aws -t ${aws_ecr_repository.app.repository_url}:${var.image_tag} .
    docker push ${aws_ecr_repository.app.repository_url}:${var.image_tag}

    # 3. Deploy
    aws ecs update-service --cluster ${aws_ecs_cluster.main.name} --service ${aws_ecs_service.app.name} --force-new-deployment

    # 4. Wait
    aws ecs wait services-stable --cluster ${aws_ecs_cluster.main.name} --services ${aws_ecs_service.app.name}

    echo "Deployed! App URL: http://${aws_lb.main.dns_name}"
  EOT
}

# ─── Data sources ─────────────────────────────────────────────
data "aws_caller_identity" "current" {}

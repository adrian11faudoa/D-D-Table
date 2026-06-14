# ============================================================
# Terraform Variables — MythicForge VTT
# Usage: terraform apply -var-file="production.tfvars"
# ============================================================

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Must be production, staging, or development."
  }
}

variable "stack_name" {
  description = "Base name for all resources"
  type        = string
  default     = "mythicforge"
}

variable "jwt_secret" {
  description = "JWT signing secret — min 32 characters"
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.jwt_secret) >= 32
    error_message = "JWT secret must be at least 32 characters."
  }
}

variable "db_password" {
  description = "RDS PostgreSQL master password — min 16 characters"
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.db_password) >= 16
    error_message = "DB password must be at least 16 characters."
  }
}

variable "domain_name" {
  description = "Custom domain name (e.g. vtt.yourgame.com). Leave empty to use ALB URL."
  type        = string
  default     = ""
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS. Required if domain_name is set."
  type        = string
  default     = ""
}

variable "task_cpu" {
  description = "ECS Fargate task CPU units (256=0.25vCPU, 512=0.5, 1024=1, 2048=2, 4096=4)"
  type        = number
  default     = 512
  validation {
    condition     = contains([256, 512, 1024, 2048, 4096], var.task_cpu)
    error_message = "Must be 256, 512, 1024, 2048, or 4096."
  }
}

variable "task_memory" {
  description = "ECS Fargate task memory in MB"
  type        = number
  default     = 1024
  validation {
    condition     = contains([512, 1024, 2048, 4096, 8192], var.task_memory)
    error_message = "Must be 512, 1024, 2048, 4096, or 8192."
  }
}

variable "desired_count" {
  description = "Number of ECS tasks to run"
  type        = number
  default     = 1
  validation {
    condition     = var.desired_count >= 1 && var.desired_count <= 20
    error_message = "Must be between 1 and 20."
  }
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
  validation {
    condition     = can(regex("^db\\.", var.db_instance_class))
    error_message = "Must be a valid RDS instance class."
  }
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "enable_multi_az" {
  description = "Enable Multi-AZ for RDS (recommended for production)"
  type        = bool
  default     = false
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection for RDS"
  type        = bool
  default     = false
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 14
}

variable "max_upload_mb" {
  description = "Maximum file upload size in MB"
  type        = number
  default     = 50
}

variable "allowed_origins" {
  description = "Comma-separated allowed CORS origins (empty = allow all)"
  type        = string
  default     = ""
}

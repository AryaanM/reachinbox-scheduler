variable "aws_region" {
  description = "AWS Region"
  type        = string
  default     = "ap-south-1" # Mumbai region
}

variable "instance_type" {
  description = "Free Tier EC2 Instance Type"
  type        = string
  default     = "t2.micro"
}

variable "key_name" {
  description = "AWS EC2 Key Pair Name"
  type        = string
  default     = "reachinbox-key"
}
pipeline {
    agent any

    environment {
        EC2_IP   = '54.225.32.19'
        GIT_REPO = 'https://github.com/AryaanM/reachinbox-scheduler.git'
    }

    stages {
        stage('1. Checkout Code from GitHub') {
            steps {
                git branch: 'main', url: "${GIT_REPO}"
            }
        }

        stage('2. Deploy Docker Stack to AWS EC2') {
            steps {
                sshagent(['aws-ec2-key']) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no ubuntu@$EC2_IP '
                            if [ ! -d "reachinbox-scheduler" ]; then
                                git clone $GIT_REPO
                            fi
                            cd reachinbox-scheduler
                            git pull origin main
                            docker compose up -d --build
                        '
                    '''
                }
            }
        }
    }

    post {
        success {
            echo 'ReachInbox deployed to AWS EC2 successfully!'
        }
    }
}
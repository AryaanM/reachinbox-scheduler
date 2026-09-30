import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import { Client as ElasticClient } from '@elastic/elasticsearch';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});const esClient = new ElasticClient({ node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200' });

const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
        // Replace with credentials from https://ethereal.email/create
        user: 'alexandre.auer52@ethereal.email', 
        pass: 'PQNNxsGeZJVEw3HSNC'
    }
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const initWorker = () => {
  const worker = new Worker('email-queue', async (job: Job) => {
    const { emailId } = job.data;
    
    const emailData = await prisma.email.findUnique({ where: { id: emailId }, include: { user: true } });
    if (!emailData || emailData.status !== 'PENDING') return;

    const currentHourWindow = new Date().toISOString().slice(0, 13);
    const redisKey = `rate_limit:${emailData.senderEmail}:${currentHourWindow}`;
    const hourlyLimit = parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '50');

    const currentCount = await redis.incr(redisKey);
    if (currentCount === 1) await redis.expire(redisKey, 3600);

    if (currentCount > hourlyLimit) {
        if (emailData.user?.slackWebhook) {
            const slackLockKey = `slack_alerted:${emailData.senderEmail}:${currentHourWindow}`;
            const alreadyAlerted = await redis.setnx(slackLockKey, "1");
            if (alreadyAlerted) {
                await redis.expire(slackLockKey, 3600);
                await axios.post(emailData.user.slackWebhook, {
                    text: `🚨 Rate limit exceeded for ${emailData.senderEmail}. Pausing until next hour.`
                }).catch(() => {});
            }
        }

        const nextHour = new Date();
        nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
        const delayMs = nextHour.getTime() - Date.now();
        await job.moveToDelayed(Date.now() + delayMs, job.token!);
        throw new Error(`Rate limit exceeded. Moved to delayed.`);
    }

    await sleep(parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '2000'));

    try {
        await transporter.sendMail({
            from: emailData.senderEmail,
            to: emailData.targetEmail,
            subject: emailData.subject,
            text: emailData.body
        });

        await prisma.email.update({
            where: { id: emailId },
            data: { status: 'SENT', sentAt: new Date() }
        });

        await esClient.update({
            index: 'emails',
            id: emailId,
            doc: { status: 'SENT', sentAt: new Date() }
        });

    } catch (error: any) {
        await prisma.email.update({
            where: { id: emailId },
            data: { status: 'FAILED', errorMessage: error.message }
        });
        throw error;
    }
  }, { connection: redis, concurrency: 5 });

  worker.on('failed', (job, err) => {
      console.log(`Job ${job?.id} failed: ${err.message}`);
  });
};
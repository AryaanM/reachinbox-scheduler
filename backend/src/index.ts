import express from 'express';
import cors from 'cors';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Client as ElasticClient } from '@elastic/elasticsearch';
import dotenv from 'dotenv';
import { initWorker } from './worker';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();
const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});
const esClient = new ElasticClient({ node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200' });

export const emailQueue = new Queue('email-queue', { connection: redis });

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter: serverAdapter,
});
app.use('/admin/queues', serverAdapter.getRouter());

app.post('/api/schedule', async (req, res) => {
  const { userId, senderEmail, targets, subject, body, startTime, delayMs } = req.body;
  
  try {
    const effectiveUserId = userId || 'test-user-uuid';

    // 1. Auto-create/Upsert user to satisfy foreign key constraint
    await prisma.user.upsert({
      where: { id: effectiveUserId },
      update: {},
      create: {
        id: effectiveUserId,
        email: senderEmail || 'testuser@example.com',
        name: 'Test User'
      }
    });

    let currentDelay = new Date(startTime).getTime() - Date.now();
    if (currentDelay < 0) currentDelay = 0;

    for (let i = 0; i < targets.length; i++) {
      const scheduledTime = new Date(Date.now() + currentDelay);
      
      // 2. Save Email record referencing valid userId
      const emailRecord = await prisma.email.create({
        data: {
          userId: effectiveUserId,
          senderEmail,
          targetEmail: targets[i],
          subject,
          body,
          scheduledAt: scheduledTime,
          status: 'PENDING'
        }
      });

      // 3. Index in Elasticsearch
      await esClient.index({
        index: 'emails',
        id: emailRecord.id,
        document: emailRecord
      });

      // 4. Add job to BullMQ queue
      await emailQueue.add('sendEmail', { emailId: emailRecord.id }, {
        delay: currentDelay,
        jobId: emailRecord.id 
      });

      currentDelay += delayMs || parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '2000');
    }

    res.json({ message: "Emails scheduled successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to schedule emails" });
  }
});

// 5. Fetch logs from Elasticsearch for the frontend UI
app.get('/api/logs', async (req, res) => {
  try {
    const result = await esClient.search({
      index: 'emails',
      query: { match_all: {} },
      sort: [{ scheduledAt: { order: 'desc' } }],
      size: 100
    });
    
    const hits = result.hits.hits.map((hit: any) => ({
      id: hit._id,
      ...hit._source
    }));
    
    res.json(hits);
  } catch (error) {
    console.error("Elasticsearch error:", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  const indexExists = await esClient.indices.exists({ index: 'emails' });
  if (!indexExists) {
    await esClient.indices.create({ index: 'emails' });
  }
  
  initWorker();
});
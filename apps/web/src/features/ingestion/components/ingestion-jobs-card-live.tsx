'use client';

import type { ClientSubscriptionToken } from 'inngest/react';
import { useRealtime } from 'inngest/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ingestionJobsChannel,
  ingestionJobUpsertTopicName,
} from '@/inngest/realtime';
import { queueRetriedIngestionJob, upsertIngestionJob } from '../live-jobs';
import type { IngestionJobListItem, RetryIngestionJobResult } from '../schemas';
import { IngestionJobsCard } from './ingestion-jobs-card';

type IngestionJobsCardLiveProps = {
  initialJobs: IngestionJobListItem[];
  userId: string;
};

async function getIngestionJobsRealtimeToken() {
  const response = await fetch('/api/inngest/realtime-token', {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to subscribe to ingestion job updates.');
  }

  return (await response.json()) as ClientSubscriptionToken;
}

export function IngestionJobsCardLive({
  initialJobs,
  userId,
}: IngestionJobsCardLiveProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const router = useRouter();
  const channel = ingestionJobsChannel({
    userId,
  });
  const { connectionStatus, messages } = useRealtime({
    channel,
    pauseOnHidden: true,
    token: getIngestionJobsRealtimeToken,
    topics: [ingestionJobUpsertTopicName],
    validate: true,
  });
  const previousConnectionStatusRef = useRef(connectionStatus);

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    if (messages.delta.length === 0) {
      return;
    }

    setJobs((currentJobs) =>
      messages.delta.reduce((nextJobs, message) => {
        if (
          message.kind !== 'data' ||
          message.topic !== ingestionJobUpsertTopicName
        ) {
          return nextJobs;
        }

        return upsertIngestionJob(nextJobs, message.data);
      }, currentJobs),
    );
  }, [messages.delta]);

  useEffect(() => {
    const previousConnectionStatus = previousConnectionStatusRef.current;
    previousConnectionStatusRef.current = connectionStatus;

    if (
      connectionStatus === 'open' &&
      (previousConnectionStatus === 'paused' ||
        previousConnectionStatus === 'closed' ||
        previousConnectionStatus === 'error')
    ) {
      router.refresh();
    }
  }, [connectionStatus, router]);

  function handleRetryQueued(result: RetryIngestionJobResult) {
    setJobs((currentJobs) =>
      queueRetriedIngestionJob(currentJobs, result, new Date().toISOString()),
    );
  }

  return <IngestionJobsCard jobs={jobs} onRetryQueued={handleRetryQueued} />;
}

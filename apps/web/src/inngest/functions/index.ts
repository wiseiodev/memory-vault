import { processIngestionJobFunction } from './process-ingestion-job';
import { inngestSetupPing } from './setup-ping';

export const inngestFunctions = [inngestSetupPing, processIngestionJobFunction];

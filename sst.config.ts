import type { SSTConfig } from 'sst';
import { BucketStack } from './stacks/bucket-stack';
import { PermissionStack } from './stacks/permission-stack';

export default {
  config() {
    return {
      name: 'memories',
      region: process.env.AWS_REGION || 'us-west-2',
      profile: process.env.AWS_PROFILE || 'default',
      bootstrap: {
        stackName: 'memories-bootstrap',
      },
    };
  },
  stacks(app) {
    app
      .stack(PermissionStack, { id: 'permission-stack' })
      .stack(BucketStack, { id: 'bucket-stack' });
  },
} satisfies SSTConfig;

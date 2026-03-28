import { RemovalPolicy } from 'aws-cdk-lib';
import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Bucket, type StackContext, toCdkDuration, use } from 'sst/constructs';
import { PermissionStack } from './permission-stack';

export function BucketStack({ stack }: StackContext) {
  const { oidcRole } = use(PermissionStack);

  const bucket = new Bucket(stack, `blob-bucket-${stack.stage}`, {
    blockPublicACLs: true,
    cors: [
      {
        allowedHeaders: ['*'],
        allowedMethods: ['GET', 'HEAD', 'PUT'],
        allowedOrigins: [
          'http://localhost:3000',
          'https://memoryapp.ai',
          'https://*.vercel.app',
        ],
      },
    ],
    cdk: {
      bucket: {
        autoDeleteObjects: stack.stage !== 'prod',
        encryption: BucketEncryption.S3_MANAGED,
        lifecycleRules: [
          {
            abortIncompleteMultipartUploadAfter: toCdkDuration('7 days'),
          },
        ],
        removalPolicy:
          stack.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
        versioned: true,
      },
    },
  });

  oidcRole.attachInlinePolicy(
    new Policy(stack, `blob-bucket-access-policy-${stack.stage}`, {
      statements: [
        new PolicyStatement({
          actions: [
            's3:GetBucketLocation',
            's3:ListBucket',
            's3:ListBucketMultipartUploads',
          ],
          resources: [bucket.bucketArn],
        }),
        new PolicyStatement({
          actions: [
            's3:AbortMultipartUpload',
            's3:DeleteObject',
            's3:GetObject',
            's3:ListMultipartUploadParts',
            's3:PutObject',
          ],
          resources: [`${bucket.bucketArn}/*`],
        }),
      ],
    }),
  );

  stack.addOutputs({
    BucketName: bucket.bucketName,
  });

  return { bucket };
}

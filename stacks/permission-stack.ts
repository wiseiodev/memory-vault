import { Role } from 'aws-cdk-lib/aws-iam';
import type { StackContext } from 'sst/constructs';

export function PermissionStack({ stack }: StackContext) {
  const oidcRoleArn = process.env.OIDC_ROLE_ARN;

  if (!oidcRoleArn) {
    throw new Error('OIDC_ROLE_ARN environment variable is not defined');
  }

  const oidcRole = Role.fromRoleArn(stack, 'oidc-role', oidcRoleArn);

  stack.addOutputs({
    OidcRoleArn: oidcRole.roleArn,
  });

  return { oidcRole };
}

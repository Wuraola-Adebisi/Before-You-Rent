# AWS Activate use case: Before you rent

## Product and current state

Before you rent is a Nigeria-focused rental inspection and decision-support tool. It helps renters record visible observations, costs, follow-up questions, and photo evidence, then compare properties before committing to a rental.

The frontend's working copy remains in browser IndexedDB. JSON export/import continues to work without an account. The optional cloud-backup implementation is being added to support a specific user need: preserving an inspection record outside one browser and restoring it on another device. It is a manually uploaded snapshot, not continuous synchronisation.

**Do not describe the cloud feature as live or production-ready until the AWS stack has been deployed, the Vercel environment variables have been configured, and end-to-end tests have passed. Do not claim production traffic, users, or AWS spend that has not happened.**

## Why AWS is needed

Cloud backup is a user-facing capability, not an infrastructure experiment. A renter may need to preserve property details, rent and fee breakdowns, inspection responses, follow-up questions, and photo evidence when changing devices or browser profiles.

The implementation uses:
- Amazon Cognito User Pools for email-based sign-up, confirmation, sign-in, and token issuance.
- Amazon API Gateway HTTP API with a JWT authorizer to protect backup operations.
- AWS Lambda to issue short-lived, user-scoped S3 upload/download URLs and delete a user's backup.
- Amazon S3 for private backup objects, with public access blocked and server-side encryption enabled.
- Amazon CloudWatch logs and AWS X-Ray tracing for operational troubleshooting.

The API derives the S3 object key from the authenticated Cognito subject. The browser cannot supply another user's object key. Backup content is sent directly to S3 using a short-lived presigned URL, avoiding the API Gateway request-body size limit. The initial implementation stores one snapshot per account; upload replaces that account's previous snapshot. Restoring merges records by ID into the current browser, so users should export a local backup before restoring.

## Deployment and verification

1. Install the AWS SAM CLI and configure an AWS account/profile with permission to create the stack.
2. From the repository root, run `sam build --template-file infra/template.yaml`.
3. Deploy with `sam deploy --guided --template-file infra/template.yaml`. Set `AppOrigin` to the exact deployed origin (for example, `https://usebeforeyourent.com`).
4. Copy the stack outputs into Vercel project environment variables:
   - `VITE_AWS_REGION` = `AwsRegion`
   - `VITE_COGNITO_USER_POOL_ID` = `CognitoUserPoolId`
   - `VITE_COGNITO_CLIENT_ID` = `CognitoUserPoolClientId`
   - `VITE_RENT_API_URL` = `ApiBaseUrl`
5. Redeploy the Vercel frontend after setting the variables.
6. Test account creation, email confirmation, sign-in, upload, restore on a second browser/device, overwrite confirmation, delete-cloud-backup, expired-session handling, and unauthenticated API rejection. Confirm a user cannot retrieve another user's backup.
7. Review CloudWatch logs, S3 bucket configuration, Cognito settings, retention expectations, and actual costs. Add alarms/budgets before inviting broader use.

## Application wording

Use wording such as the following only when it accurately reflects the current application stage:

> Before you rent helps renters in Nigeria document property inspections, record rental costs and unanswered questions, and compare options before committing. The current working copy is stored locally in the browser, and we are developing an opt-in cloud-backup capability so users can preserve their inspection records and restore them on another device. AWS will support the authenticated backup API, private encrypted storage for user-submitted records and photo evidence, and operational monitoring. We are using managed serverless services to keep infrastructure proportionate to an early-stage product and will validate the feature before expanding usage.

After deployment and testing, update the wording to say the cloud-backup feature is available. Do not imply live sync, automatic backup, a safety-verification system, AI features, or a production user base.

## Cost and data safeguards

- Set an AWS Budget and billing alerts before real use.
- Keep S3 public access blocked and the bucket private.
- Keep API routes behind the JWT authorizer.
- Never put AWS credentials, client secrets, or private keys in frontend environment variables. The Cognito app client ID is public by design and must have no secret.
- Keep the allowed web origin restricted to the real app origin.
- Avoid collecting more personal information than necessary; warn users that snapshots may contain addresses, notes, and photos.
- Set and publish a retention/deletion policy before onboarding external users.
- Review the privacy notice with a qualified Nigerian privacy professional before production launch.

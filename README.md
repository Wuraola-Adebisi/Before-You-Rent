# Before You Rent

A practical, mobile-first inspection companion for people renting residential property in Nigeria.

Before You Rent helps renters document what they observe, estimate the cash required to move in, track unanswered questions, and compare properties before making a commitment.

## Product principles

- Evidence and transparency over opaque property scores.
- Local working records remain available without an account; optional cloud backup is an explicit opt-in.
- Clear separation between upfront cash, recurring charges, and refundable deposits.
- An unchecked item is not the same as a passing inspection.
- The tool supports a renter's decision; it does not certify a property as safe or legitimate.

## Stack

React, TypeScript, Vite, IndexedDB (`idb`), and Lucide icons. Optional cloud backup uses Amazon Cognito, API Gateway HTTP API, AWS Lambda, and a private Amazon S3 bucket.

## Local development

```bash
npm install
npm run dev
```

## Data and privacy

The working copy stays in browser IndexedDB. JSON export/import remains available. Optional cloud backup is a manual snapshot per account, not live sync; it is available only after deploying `infra/template.yaml` and setting the Vercel environment variables in `.env.example`. Cloud backup uses Cognito authentication, short-lived presigned S3 URLs, a private encrypted bucket, and per-account object keys. Local and cloud copies must be deleted separately.

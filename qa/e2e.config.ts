import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';

// Claude on Amazon Bedrock (the project's only model provider); credentials come from the standard AWS environment variables.
const bedrock = createAmazonBedrock({ region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-west-2' });

const context =
  'OCI Capacity Coach: Everytown Community Safety Fund (CSF) self-assessment for community violence intervention (CVI) nonprofits. ' +
  'Organization leaders sign in as credential "demo", Everytown staff as credential "staff"; both logins are mocked and all data is synthetic. ' +
  '"Growth priorities" are the statements answered No; stages run Seeding, Emerging, Developing, Strengthening, Transformational. ' +
  'An AI report takes 30 to 60 seconds after submitting: wait for "Your report is ready" before judging it. ' +
  'Every new report costs money and counts against an hourly cap: start at most one new report or sample per goal, and start any organization name you type with "QA ". ' +
  'Not bugs: links that open a new tab (resources, Phoenix traces) leave this tab unchanged; a 429 "limit of new reports for this hour" message is the spend cap working; ' +
  'the Phoenix trace server asks for its own login.';

export default {
  agents: {
    default: {
      model: bedrock('us.anthropic.claude-sonnet-5-5'),
      system: 'You are a thorough QA agent. Verify every outcome on screen.',
      context,
      maxSteps: 40,
      maxModelCalls: 40,
    },
  },
  targets: [{ name: 'web', engine: web(), app: { url: process.env.APP_URL ?? 'http://127.0.0.1:8092' } }],
} satisfies E2EConfig;

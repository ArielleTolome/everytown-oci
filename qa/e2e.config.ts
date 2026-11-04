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
  'Not bugs: links that open a new tab (resources, the staff trace link) leave this tab unchanged; a 429 "limit of new reports for this hour" message is the spend cap working; ' +
  'the staff trace link opens Phoenix or the AWS console, which ask for their own sign-in.';

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
  targets: [
    { name: 'web', engine: web(), app: { url: process.env.APP_URL ?? 'http://127.0.0.1:8092' } },
    // Organization leaders often answer on a phone: every test also runs at an iPhone 13's visible size and agent.
    {
      name: 'phone',
      engine: web({
        viewport: { width: 390, height: 664 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      }),
      app: { url: process.env.APP_URL ?? 'http://127.0.0.1:8092' },
    },
  ],
} satisfies E2EConfig;

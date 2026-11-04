import type { E2EConfig } from 'e2e';
import base from './e2e.config.ts';

const shared: E2EConfig = base;
const model = shared.agents!.default!.model;
const context = shared.agents!.default!.context +
  ' Not bugs: accessible text splits around inline links, so judge copy by the rendered screenshot; a spinner while the AI writes is expected for up to 60 seconds.';
const persona = { model, maxSteps: 40, maxModelCalls: 40, context };

export default {
  ...shared,
  tests: ['tests/**/*.e2e.ts'],
  retries: 0,
  reporters: ['list'],
  agents: {
    default: persona,
    skeptic: { ...persona, system: 'Distrust every number, date, count, stage and claim on screen; cross-check each against every other place it appears, including other tabs and the PDF.' },
    fuzzer: { ...persona, system: "At every input, run the goal's input matrix before anything else, judging each entry before the next. Never take the happy path." },
  },
} satisfies E2EConfig;

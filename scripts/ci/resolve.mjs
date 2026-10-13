import { resolveCandidate } from './git.mjs';
import { currentPlan, persistPlan } from './classify.mjs';

// checkout receives the requested ref as an action input. Verify its actual
// commit against the caller's expected SHA before any regression can count.
if (
  process.env.CI_EXPECTED_SHA ||
  process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
)
  resolveCandidate('HEAD', process.env.CI_EXPECTED_SHA);
if (currentPlan().mode !== 'full')
  throw new Error('Full regression cannot accept a selective plan');
persistPlan();

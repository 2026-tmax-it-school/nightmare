import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Configuration regression tests only. No credentials, network, package
// installation, application execution, or paid OpenAI request is needed.
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const review = await read('../workflows/openai-review.yml');
const checks = await read('../workflows/review-integration-checks.yml');
const docs = await read('../../docs/openai-review.md');
const pin = 'c67bf2fd543117fddcc8d3041916dae73db4850b';

test('review listener and supplied CI identity match the actual check workflow', () => {
  const name = /^name: (.+)$/m.exec(checks)?.[1];
  assert.ok(name);
  assert.equal(/workflows: \[([^\]]+)\]/.exec(review)?.[1], name);
  assert.equal(/ci-name: (.+)/.exec(review)?.[1], name);
  assert.match(review, /ci-path: \.github\/workflows\/review-integration-checks\.yml\n/);
});

test('main and develop PRs include draft-to-ready transitions', () => {
  assert.match(checks, /pull_request:\n    branches: \[main, develop\]\n    types: \[opened, synchronize, reopened, ready_for_review\]/);
  assert.doesNotMatch(checks, /paths(?:-ignore)?:/);
});

test('only completed successful pull-request checks can start a review', () => {
  assert.match(review, /workflow_run:\n    workflows: \[Review integration checks\]\n    types: \[completed\]/);
  assert.match(review, /github\.event\.workflow_run\.event == 'pull_request' &&/);
  assert.match(review, /github\.event\.workflow_run\.conclusion == 'success' &&/);
  assert.doesNotMatch(review, /workflow_dispatch:|pull_request_target:|\n  pull_request:|\n  push:/);
});

test('both opt-in variables are required and only the intended secret is forwarded', () => {
  assert.match(review, /vars\.OPENAI_REVIEW_ENABLED == 'true' &&/);
  assert.match(review, /vars\.OPENAI_REVIEW_BUDGET_CONFIRMED == 'true'/);
  assert.deepEqual([...review.matchAll(/secrets\.([A-Z_]+)/g)].map(m => m[1]), ['KEY']);
  assert.doesNotMatch(review, /secrets: inherit/);
});

test('the privileged listener calls only the audited immutable reusable workflow', () => {
  const uses = [...review.matchAll(/uses: (.+)/g)].map(m => m[1]);
  assert.deepEqual(uses, [`2026-tmax-it-school/TMAXyoungkk/.github/workflows/openai-review-reusable.yml@${pin}`]);
  assert.doesNotMatch(review, /\brun:|checkout|download-artifact|upload-artifact|head\.sha|head\.ref/);
});

test('privileged permissions are limited to reviewing and reading', () => {
  assert.match(review, /permissions:\n  contents: read\n  actions: read\n  pull-requests: write\n/);
  assert.doesNotMatch(review, /write-all|contents: write|actions: write|id-token:/);
});

test('untrusted PR validation has no secret or write permission', () => {
  assert.match(checks, /permissions:\n  contents: read\n/);
  assert.doesNotMatch(checks, /secrets|write-all|: write|pull_request_target|id-token:/);
  assert.match(checks, /persist-credentials: false/);
});

test('validation actions are immutable and tests have no dependency install step', () => {
  assert.deepEqual([...checks.matchAll(/uses: ([^\n#]+)/g)].map(m => m[1].trim()), [
    'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
    'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  ]);
  assert.match(checks, /node-version: '24'/);
  assert.deepEqual([...checks.matchAll(/run: (.+)/g)].map(m => m[1]), [
    'node --test .github/scripts/review-integration.test.mjs',
  ]);
  assert.match(checks, /timeout-minutes: 5/);
});

test('documentation discloses activation, cost, bootstrap and app-CI limitations', () => {
  for (const text of ['OPENAI_API_KEY', 'OPENAI_REVIEW_ENABLED', 'OPENAI_REVIEW_BUDGET_CONFIRMED',
    'USD 4', 'Default', 'Review integration checks', 'ci-name', 'ci-path', 'develop', pin]) {
    assert.ok(docs.includes(text), `Missing documentation: ${text}`);
  }
});

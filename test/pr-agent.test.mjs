import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflow = readFileSync('.github/workflows/pr-agent.yml', 'utf8');
const block = /^        run: \|\n((?:          .*\n|\n)+)/m.exec(workflow);
assert.ok(block, 'the authorization step has a shell script');
const script = block[1].replace(/^ {10}/gm, '').replaceAll('${{ github.repository }}', 'beeson-group/slides');
const options = { skip: process.platform === 'win32' && 'the authorization job runs on Ubuntu' };

function authorize(t, body, { permission = 'write', event = 'issue_comment', ghStatus = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'slides-pr-agent-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, 'output');
  writeFileSync(output, '');
  const stub = 'gh() { printf "%s\\n" "$*" > gh-call; printf "%s\\n" "$TEST_PERMISSION"; return "$TEST_GH_STATUS"; }\n';
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', stub + script.replaceAll('${{ github.event_name }}', event)], {
    cwd: root,
    env: { ...process.env, COMMENT_BODY: body, SENDER: 'test-user', GITHUB_EVENT_NAME: event, GITHUB_OUTPUT: output, TEST_PERMISSION: permission, TEST_GH_STATUS: String(ghStatus) },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.ifError(result.error);
  if (!ghStatus) assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(root, 'injected')), false);
  return { output: readFileSync(output, 'utf8'), call: existsSync(join(root, 'gh-call')) ? readFileSync(join(root, 'gh-call'), 'utf8') : '' };
}

for (const body of ['/does-not-exist', '/reviewoops', '/help_docs', '/extend', '/', '/review#oops', '/review "unclosed']) {
  test(`unknown or malformed command ${JSON.stringify(body)} cannot cancel a review`, options, (t) => {
    assert.deepEqual(authorize(t, body), { output: 'authorized=false\n', call: '' });
  });
}

const commands = 'auto_review answer review review_pr describe describe_pr improve improve_code ask ask_question ask_line update_changelog config settings help similar_issue add_docs generate_labels'.split(' ');
for (const command of commands) {
  test(`/${command} is authorized for a writer`, options, (t) => {
    assert.deepEqual(authorize(t, `/${command}`), {
      output: 'authorized=true\n',
      call: 'api repos/beeson-group/slides/collaborators/test-user/permission --jq .permission\n',
    });
  });
}

for (const body of [' \n\t/REVIEW --pr_reviewer.extra_instructions="check it"', "/ask What's #123?", '/"review"', '//review', '/ask "$(touch injected)"']) {
  test(`command parsing preserves ${JSON.stringify(body)}`, options, (t) => {
    assert.equal(authorize(t, body).output, 'authorized=true\n');
  });
}

for (const body of ['', ' \n\t', 'Looks good', 'review', 'Please /review']) {
  test(`ordinary comment ${JSON.stringify(body)} is rejected before the permission lookup`, options, (t) => {
    assert.deepEqual(authorize(t, body), { output: 'authorized=false\n', call: '' });
  });
}

for (const event of ['issue_comment', 'pull_request']) {
  for (const permission of ['none', 'read', 'triage', 'write', 'maintain', 'admin']) {
    test(`${event} requires effective write access (${permission})`, options, (t) => {
      const expected = ['write', 'maintain', 'admin'].includes(permission);
      assert.equal(authorize(t, event === 'issue_comment' ? '/review' : '', { permission, event }).output, `authorized=${expected}\n`);
    });
  }
}

test('a failed permission lookup cannot authorize a review', options, (t) => {
  assert.ok(!authorize(t, '/review', { permission: '', ghStatus: 1 }).output.includes('authorized=true'));
});

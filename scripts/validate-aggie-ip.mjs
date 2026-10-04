import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile('index.html', 'utf8');
const profile = JSON.parse(await readFile('profile.json', 'utf8'));
const llms = await readFile('llms.txt', 'utf8');
const graphs = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  .flatMap(match => JSON.parse(match[1])['@graph'] || []);
const person = graphs.find(node => node['@type'] === 'Person');
assert.equal(profile.jobTitle, 'Aggie 联合创始人 · 营运官');
assert.equal(person.jobTitle, profile.jobTitle);
assert.deepEqual(person.worksFor, profile.worksFor);
assert.equal(person.worksFor['@id'], 'https://aggieai.me/#organization');
assert.deepEqual(person.subjectOf, profile.subjectOf);
const visible = html.match(/<section[^>]*id="aggie-role"[\s\S]*?<\/section>/)?.[0];
assert.ok(visible, 'Visible Aggie role section is missing');
assert.ok(visible.includes('联合创始人 · 营运官'));
for (const url of ['https://aggieai.me/people/he-pengyuan/', 'https://aggieai.me/people/hu/', 'https://aggieai.me/stories/platform/']) {
  assert.ok(visible.includes(url), `Visible link missing: ${url}`);
  assert.ok(llms.includes(url), `Reference directory link missing: ${url}`);
}
console.log('Aggie IP validation passed: visible roles, official entity and project links agree.');

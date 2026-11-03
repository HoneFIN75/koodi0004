import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { applicationOverview } from '../src/data/applicationOverview.ts';

const document = await readFile(new URL('../sovelluksen-esittely.md', import.meta.url), 'utf8');

test('overview summary, purpose, audiences and capabilities come from the application overview document', () => {
  const sourcedTexts = [
    applicationOverview.summary,
    applicationOverview.introduction,
    ...applicationOverview.purpose,
    ...applicationOverview.audiences.map((item) => item.description),
    ...applicationOverview.capabilities,
    applicationOverview.benefitNote,
    applicationOverview.integrationNote,
    ...applicationOverview.integrations.map((item) => item.description),
  ];
  for (const text of sourcedTexts) assert.ok(document.includes(text), `Overview document must contain: ${text}`);
});

test('overview cards have unique headings, meaningful content and explicit production access roles', () => {
  for (const cards of [applicationOverview.audiences, applicationOverview.features, applicationOverview.modules, applicationOverview.benefits]) {
    assert.equal(new Set(cards.map((item) => item.title)).size, cards.length);
    for (const item of cards) {
      assert.ok(item.description.length > 20);
      assert.ok(item.icon);
    }
  }
  for (const item of applicationOverview.features) assert.ok(item.benefit.length > 20);
  for (const item of applicationOverview.modules) assert.ok(item.audience);
  for (const title of ['Seurahallinta', 'Tuonti ja vienti', 'Varmuuskopiot']) {
    assert.equal(applicationOverview.modules.find((item) => item.title === title)?.audience, 'Admin');
  }
  assert.equal(applicationOverview.steps.length, 5);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESOURCE_TYPES,
  PRESENTATION_SCOPES,
  getSuggestedResourceTitle,
  getSuggestedTitleActionLabel,
  resolveSuggestedTitleState
} from '../src/lib/resourceTitles.js';

const volume = { id: 'volume-1', name: 'Fixed Income' };
const alternativeVolume = { id: 'volume-2', name: 'Alternative Investments' };
const learningModule = { id: 'module-1', name: 'Alternative Investment Performance and Returns' };

test('derives each resource title from the selected academic record', () => {
  assert.equal(getSuggestedResourceTitle({ resourceType: RESOURCE_TYPES.FORMULA_BOOK_PDF, volume }), 'Fixed Income');
  assert.equal(getSuggestedResourceTitle({ resourceType: RESOURCE_TYPES.MODULE_NOTES_PDF, volume: alternativeVolume }), 'Alternative Investments');
  assert.equal(getSuggestedResourceTitle({ resourceType: RESOURCE_TYPES.SUMMARY_SHEET_PDF, learningModule }), 'Alternative Investment Performance and Returns');
  assert.equal(getSuggestedResourceTitle({
    resourceType: RESOURCE_TYPES.PRESENTATION,
    presentationScope: PRESENTATION_SCOPES.LEARNING_MODULE,
    learningModule
  }), 'Alternative Investment Performance and Returns');
  assert.equal(getSuggestedResourceTitle({
    resourceType: RESOURCE_TYPES.PRESENTATION,
    presentationScope: PRESENTATION_SCOPES.WHOLE_VOLUME,
    volume
  }), 'Fixed Income — Whole Volume Review');
  assert.equal(getSuggestedResourceTitle({ resourceType: RESOURCE_TYPES.FORMULA_BOOK_PDF }), '');
});

test('offers the correct restore label', () => {
  assert.equal(getSuggestedTitleActionLabel({ resourceType: RESOURCE_TYPES.FORMULA_BOOK_PDF }), 'Use selected Volume name');
  assert.equal(getSuggestedTitleActionLabel({ resourceType: RESOURCE_TYPES.SUMMARY_SHEET_PDF }), 'Use selected Learning Module name');
  assert.equal(getSuggestedTitleActionLabel({
    resourceType: RESOURCE_TYPES.PRESENTATION,
    presentationScope: PRESENTATION_SCOPES.WHOLE_VOLUME
  }), 'Use selected Volume name');
});

test('populates and refreshes an untouched automatic title', () => {
  const first = resolveSuggestedTitleState({
    enabled: true,
    suggestedTitle: 'Fixed Income',
    currentTitle: '',
    lastSuggestedTitle: '',
    isManual: false
  });
  assert.equal(first.title, 'Fixed Income');

  const changed = resolveSuggestedTitleState({
    enabled: true,
    suggestedTitle: 'Alternative Investments',
    currentTitle: first.title,
    lastSuggestedTitle: first.lastSuggestedTitle,
    isManual: first.isManual
  });
  assert.equal(changed.title, 'Alternative Investments');
});

test('preserves a manually customised title when the selection changes', () => {
  const changed = resolveSuggestedTitleState({
    enabled: true,
    suggestedTitle: 'Alternative Investments',
    currentTitle: 'My Custom Notes',
    lastSuggestedTitle: 'Fixed Income',
    isManual: true
  });
  assert.equal(changed.title, 'My Custom Notes');
});

test('refills the suggestion when the title is blank', () => {
  const changed = resolveSuggestedTitleState({
    enabled: true,
    suggestedTitle: 'Fixed Income',
    currentTitle: '',
    lastSuggestedTitle: '',
    isManual: true
  });
  assert.equal(changed.title, 'Fixed Income');
});

test('never overwrites a saved title in edit mode', () => {
  const state = resolveSuggestedTitleState({
    enabled: false,
    suggestedTitle: 'Fixed Income',
    currentTitle: 'Saved Custom Title',
    lastSuggestedTitle: '',
    isManual: false
  });
  assert.equal(state.title, 'Saved Custom Title');
});

test('clears an untouched automatic title when the selection is removed', () => {
  const state = resolveSuggestedTitleState({
    enabled: true,
    suggestedTitle: '',
    currentTitle: 'Fixed Income',
    lastSuggestedTitle: 'Fixed Income',
    isManual: false
  });
  assert.equal(state.title, '');
});

test('keeps a custom title when the selection is removed', () => {
  const state = resolveSuggestedTitleState({
    enabled: true,
    suggestedTitle: '',
    currentTitle: 'My Custom Notes',
    lastSuggestedTitle: 'Fixed Income',
    isManual: true
  });
  assert.equal(state.title, 'My Custom Notes');
});

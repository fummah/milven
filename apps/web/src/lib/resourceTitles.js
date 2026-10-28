export const RESOURCE_TYPES = Object.freeze({
  FORMULA_BOOK_PDF: 'FORMULA_BOOK_PDF',
  SUMMARY_SHEET_PDF: 'SUMMARY_SHEET_PDF',
  MODULE_NOTES_PDF: 'MODULE_NOTES_PDF',
  PRESENTATION: 'PRESENTATION'
});

export const PRESENTATION_SCOPES = Object.freeze({
  LEARNING_MODULE: 'LEARNING_MODULE',
  WHOLE_VOLUME: 'WHOLE_VOLUME'
});

export function getSuggestedResourceTitle({
  resourceType,
  presentationScope,
  volume,
  learningModule
}) {
  switch (resourceType) {
    case RESOURCE_TYPES.FORMULA_BOOK_PDF:
    case RESOURCE_TYPES.MODULE_NOTES_PDF:
      return volume?.name || '';

    case RESOURCE_TYPES.SUMMARY_SHEET_PDF:
      return learningModule?.name || '';

    case RESOURCE_TYPES.PRESENTATION:
      if (presentationScope === PRESENTATION_SCOPES.WHOLE_VOLUME) {
        return volume?.name ? `${volume.name} — Whole Volume Review` : '';
      }
      return learningModule?.name || '';

    default:
      return '';
  }
}

export function getSuggestedTitleActionLabel({ resourceType, presentationScope }) {
  if (resourceType === RESOURCE_TYPES.SUMMARY_SHEET_PDF) {
    return 'Use selected Learning Module name';
  }
  if (resourceType === RESOURCE_TYPES.PRESENTATION && presentationScope !== PRESENTATION_SCOPES.WHOLE_VOLUME) {
    return 'Use selected Learning Module name';
  }
  return 'Use selected Volume name';
}

export function resolveSuggestedTitleState({
  enabled,
  suggestedTitle,
  currentTitle,
  lastSuggestedTitle,
  isManual
}) {
  const current = currentTitle == null ? '' : String(currentTitle);
  if (!enabled) {
    return { title: current, lastSuggestedTitle, isManual };
  }

  const isBlank = !current.trim();
  const matchesLastSuggestion = Boolean(lastSuggestedTitle) && current === lastSuggestedTitle;
  const canReplace = !isManual || isBlank || matchesLastSuggestion;

  if (!suggestedTitle) {
    if (!canReplace) return { title: current, lastSuggestedTitle, isManual };
    return { title: '', lastSuggestedTitle: '', isManual: false };
  }

  if (!canReplace) return { title: current, lastSuggestedTitle, isManual };
  return { title: suggestedTitle, lastSuggestedTitle: suggestedTitle, isManual: false };
}

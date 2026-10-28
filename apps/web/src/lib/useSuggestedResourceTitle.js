import { useEffect, useMemo, useRef } from 'react';
import { Form } from 'antd';
import {
  getSuggestedResourceTitle,
  getSuggestedTitleActionLabel,
  resolveSuggestedTitleState
} from './resourceTitles';

export function useSuggestedResourceTitle({
  form,
  open,
  mode = 'upload',
  resourceType,
  presentationScope,
  volume,
  learningModule
}) {
  const currentTitle = Form.useWatch('title', form);
  const lastSuggestedTitle = useRef('');
  const isManual = useRef(false);

  const enabled = Boolean(open) && mode === 'upload';
  const suggestedTitle = enabled
    ? getSuggestedResourceTitle({ resourceType, presentationScope, volume, learningModule })
    : '';

  const actionLabel = useMemo(
    () => getSuggestedTitleActionLabel({ resourceType, presentationScope }),
    [resourceType, presentationScope]
  );

  useEffect(() => {
    if (open) return;
    lastSuggestedTitle.current = '';
    isManual.current = false;
  }, [open]);

  useEffect(() => {
    if (!enabled) return;
    const next = resolveSuggestedTitleState({
      enabled,
      suggestedTitle,
      currentTitle,
      lastSuggestedTitle: lastSuggestedTitle.current,
      isManual: isManual.current
    });

    if (next.title !== (currentTitle == null ? '' : String(currentTitle))) {
      form.setFieldValue('title', next.title);
    }
    lastSuggestedTitle.current = next.lastSuggestedTitle;
    isManual.current = next.isManual;
  }, [enabled, suggestedTitle, currentTitle, form]);

  const handleTitleChange = () => {
    isManual.current = true;
  };

  const restoreSuggestedTitle = () => {
    if (!suggestedTitle) return;
    isManual.current = false;
    lastSuggestedTitle.current = suggestedTitle;
    form.setFieldValue('title', suggestedTitle);
  };

  return {
    suggestedTitle,
    actionLabel,
    canRestore: enabled && Boolean(suggestedTitle) && (currentTitle || '') !== suggestedTitle,
    handleTitleChange,
    restoreSuggestedTitle
  };
}

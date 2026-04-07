'use client';

import { useEffect, useRef } from 'react';

import { useToast } from '@/app/providers/toast-provider';

type UseToastFeedbackInput = {
  noticeText?: string | null;
  errorText?: string | null;
  noticeTitle?: string;
  errorTitle?: string;
};

export function useToastFeedback({
  noticeText,
  errorText,
  noticeTitle,
  errorTitle,
}: UseToastFeedbackInput) {
  const toast = useToast();
  const lastNoticeRef = useRef<string | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (!noticeText || noticeText === lastNoticeRef.current) {
      return;
    }

    lastNoticeRef.current = noticeText;
    toast.success(noticeText, noticeTitle);
  }, [noticeText, noticeTitle, toast]);

  useEffect(() => {
    if (!errorText || errorText === lastErrorRef.current) {
      return;
    }

    lastErrorRef.current = errorText;
    toast.error(errorText, errorTitle);
  }, [errorText, errorTitle, toast]);
}

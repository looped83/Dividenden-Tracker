import React from 'react';
import { getErrorMessage } from '@/lib/utils/errorMessage';

interface ErrorState {
  error: string | null;
  setError: (error: string | null) => void;
  clearError: () => void;
  showError: (error: unknown, fallback: string) => void;
}

export function useErrorState(): ErrorState {
  const [error, setError] = React.useState<string | null>(null);

  return {
    error,
    setError,
    clearError: () => setError(null),
    showError: (err: unknown, fallback: string) => {
      setError(getErrorMessage(err, fallback));
    },
  };
}

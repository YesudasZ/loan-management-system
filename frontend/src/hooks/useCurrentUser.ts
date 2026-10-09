import { useContext } from 'react';
import { CurrentUserContext, type CurrentUserState } from '@/components/auth/CurrentUserProvider';

export function useCurrentUser(): CurrentUserState {
  const state = useContext(CurrentUserContext);
  if (!state) {
    throw new Error('useCurrentUser must be used inside <CurrentUserProvider>');
  }
  return state;
}

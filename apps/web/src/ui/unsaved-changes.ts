import { useCallback, useEffect } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router';
import { useSessionController, useSessionView } from '../auth/context.js';

export function useUnsavedChanges(dirty: boolean) {
  const session = useSessionController();
  const view = useSessionView();
  const generation = view.generation;
  // Revocation/logout/account switching must always be allowed to withdraw private data.
  const active = useCallback(
    () =>
      dirty &&
      session.snapshot().generation === generation &&
      'me' in session.snapshot(),
    [dirty, session, generation],
  );
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active() &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (
      window.confirm(
        'Tienes cambios sin guardar. ¿Quieres salir y descartarlos?',
      )
    )
      blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (!active()) return;
        event.preventDefault();
        event.returnValue = '';
      },
      [active],
    ),
  );
}

import { useState } from 'react';
import { Navigate } from 'react-router';
import { useSessionController, useSessionView } from '../auth/context.js';
import { suggestedTimeZone } from '../api/ownership.js';
import { useSubmit } from './auth.js';
import { AccessStatus, LogoutButton } from './access.js';

export function OnboardingPage() {
  const controller = useSessionController();
  const view = useSessionView();
  const state = useSubmit();
  const [inventoryName, setName] = useState('');
  const [currency, setCurrency] = useState('');
  const [reportingTimeZone, setZone] = useState(suggestedTimeZone);
  if (view.kind === 'ANONYMOUS') return <Navigate to="/login" replace />;
  if (view.kind === 'BUSINESS_ACTIVE_ENABLED')
    return <Navigate to="/" replace />;
  if (view.kind !== 'NO_BUSINESS') return <AccessStatus />;
  return (
    <main>
      <h1>Crear inventario vacío</h1>
      <p>Cuenta: {view.me.user.email}</p>
      <form
        aria-describedby="form-message"
        onSubmit={(event) => {
          void state.submit(event, async () => {
            await controller.bootstrap({
              inventoryName: inventoryName.trim(),
              currency,
              reportingTimeZone: reportingTimeZone.trim(),
            });
          });
        }}
      >
        <label>
          Nombre del inventario
          <input
            required
            maxLength={200}
            value={inventoryName}
            onChange={(event) => setName(event.target.value)}
            aria-describedby="form-message"
          />
        </label>
        <label>
          Moneda (ISO de tres letras)
          <input
            required
            pattern="[A-Z]{3}"
            maxLength={3}
            placeholder="Ejemplo: USD"
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            aria-describedby="form-message"
          />
        </label>
        <label>
          Zona horaria de reportes
          <input
            required
            maxLength={100}
            value={reportingTimeZone}
            onChange={(event) => setZone(event.target.value)}
            aria-describedby="form-message"
          />
        </label>
        <p>
          Revisa la zona horaria sugerida por tu navegador. El acceso cloud
          requiere habilitación después de crear el inventario.
        </p>
        <button disabled={state.pending} type="submit">
          {state.pending ? 'Creando…' : 'Crear inventario vacío'}
        </button>
        <p
          id="form-message"
          ref={state.errorRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
        >
          {state.message}
        </p>
      </form>
      <p>Importar un respaldo estará disponible más adelante.</p>
      <LogoutButton />
    </main>
  );
}

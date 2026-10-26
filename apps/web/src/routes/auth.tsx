import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useSessionController, useSessionView } from '../auth/context.js';
import { AuthFailure } from '../auth/client.js';
import { AccessStatus } from './access.js';
import { AuthLayout } from '../ui/auth-layout.js';

export const resetRequestMessage =
  'Si el correo corresponde a una cuenta, recibirás un enlace para restablecer la contraseña.';
export function useSubmit() {
  const flight = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) errorRef.current?.focus();
  }, [message]);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    action: () => Promise<void>,
  ) {
    event.preventDefault();
    if (flight.current) return;
    flight.current = true;
    setPending(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof AuthFailure
          ? error.message
          : 'No pudimos completar la solicitud. Vuelve a intentarlo.',
      );
    } finally {
      flight.current = false;
      setPending(false);
    }
  }
  return { pending, message, setMessage, errorRef, submit };
}
function FormStatus({
  state,
  children,
}: {
  state: ReturnType<typeof useSubmit>;
  children?: ReactNode;
}) {
  return (
    <>
      <p
        id="form-message"
        ref={state.errorRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
      >
        {state.message || children}
      </p>
    </>
  );
}
export function LoginPage() {
  const controller = useSessionController();
  const view = useSessionView();
  const navigate = useNavigate();
  const state = useSubmit();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    if ('me' in view)
      void navigate(view.kind === 'NO_BUSINESS' ? '/onboarding' : '/', {
        replace: true,
      });
  }, [view, navigate]);
  if (
    view.kind === 'ERROR' ||
    view.kind === 'LOGOUT_ERROR' ||
    view.kind === 'AUTHENTICATED_LOADING_ME'
  )
    return <AccessStatus />;
  return (
    <AuthLayout
      title="Iniciar sesión"
      intro="Qué bueno verte de nuevo. Vuelve a tu inventario, tus operaciones y el resumen de tu día."
    >
      <form
        aria-describedby="form-message"
        onSubmit={(event) => {
          void state.submit(event, async () => {
            const value = password;
            setPassword('');
            await controller.login(email, value);
          });
        }}
      >
        <label>
          Correo
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby="form-message"
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="form-message"
          />
        </label>
        <button disabled={state.pending} type="submit">
          {state.pending ? 'Comprobando…' : 'Iniciar sesión'}
        </button>
        <FormStatus state={state} />
      </form>
      <p className="auth-switch">
        ¿Primera vez aquí? <Link to="/signup">Crear cuenta</Link>
      </p>
      <nav className="auth-links" aria-label="Acceso">
        <Link to="/reset-password">Olvidé mi contraseña</Link>
        <Link to="/verify-email">Verificar correo</Link>
      </nav>
      <div className="verification-note">
        <strong>¿Aún no verificaste tu correo?</strong>
        <p>
          Abre el enlace que recibiste al registrarte y después inicia sesión
          aquí. Si venció o no llegó, puedes solicitar otro.
        </p>
      </div>
    </AuthLayout>
  );
}
export function SignupPage() {
  const controller = useSessionController();
  const navigate = useNavigate();
  const state = useSubmit();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <AuthLayout
      title="Crear cuenta"
      intro="Tu inventario empieza aquí. Después confirmaremos tu correo y podrás configurar un inventario vacío."
    >
      <form
        aria-describedby="form-message"
        onSubmit={(event) => {
          void state.submit(event, async () => {
            const value = password;
            setPassword('');
            await controller.auth.signup(name.trim(), email, value);
            await navigate('/verify-email', { replace: true });
          });
        }}
      >
        <label>
          Nombre
          <input
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-describedby="form-message"
          />
        </label>
        <label>
          Correo
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby="form-message"
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="form-message"
          />
        </label>
        <button disabled={state.pending} type="submit">
          {state.pending ? 'Enviando…' : 'Crear cuenta'}
        </button>
        <FormStatus state={state} />
      </form>
      <div className="verification-note">
        <strong>Un paso más para entrar</strong>
        <p>
          Te enviaremos un enlace de verificación. Ábrelo para confirmar que el
          correo es tuyo; luego vuelve e inicia sesión con tu contraseña. Tu
          inventario se configura después.
        </p>
      </div>
      <p className="auth-switch">
        ¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link>
      </p>
    </AuthLayout>
  );
}

export function VerifyPage() {
  const controller = useSessionController();
  const location = useLocation();
  const navigate = useNavigate();
  const state = useSubmit();
  const [email, setEmail] = useState('');
  const [callback] = useState(() => {
    const query = new URLSearchParams(location.search);
    return {
      token: query.get('token'),
      failed: query.has('error'),
      verified: query.get('verified') === '1',
    };
  });
  const consumed = useRef(false);
  const [result, setResult] = useState(
    callback.failed
      ? 'El enlace no pudo verificarse. Solicita otro correo.'
      : callback.verified
        ? 'Correo verificado. Ya puedes iniciar sesión.'
        : 'Revisa tu correo y abre el enlace de verificación.',
  );
  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;
    if (location.search) void navigate('/verify-email', { replace: true });
    if (callback.token)
      void controller.auth.verify(callback.token).then(
        () => setResult('Correo verificado. Ya puedes iniciar sesión.'),
        () => setResult('El enlace no pudo verificarse. Solicita otro correo.'),
      );
  }, [callback, controller, location.search, navigate]);
  return (
    <AuthLayout
      title="Verificar correo"
      intro="Confirma que puedes acceder a tu correo para activar el acceso a tu cuenta."
    >
      <p role="status" aria-live="polite">
        {result}
      </p>
      <ol className="verification-steps">
        <li>
          Busca el mensaje «Verifica tu correo para StockApp» en tu bandeja de
          entrada. Revisa también spam o promociones.
        </li>
        <li>
          Abre el enlace del correo. El mensaje indica cuándo vence; si caducó,
          solicita otro enlace aquí.
        </li>
        <li>
          Cuando veas «Correo verificado», vuelve a iniciar sesión con tu correo
          y contraseña. Verificar no inicia sesión automáticamente.
        </li>
      </ol>
      <p>
        Si no pediste crear una cuenta, no abras el enlace. Nunca necesitas
        responder el correo ni enviar tu contraseña.
      </p>
      <form
        aria-describedby="form-message"
        onSubmit={(event) => {
          void state.submit(event, async () => {
            await controller.auth.resend(email);
            state.setMessage(
              'Si corresponde, recibirás un correo de verificación.',
            );
          });
        }}
      >
        <label>
          Correo
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby="form-message"
          />
        </label>
        <button disabled={state.pending} type="submit">
          {state.pending ? 'Enviando…' : 'Reenviar verificación'}
        </button>
        <FormStatus state={state} />
      </form>
      <Link to="/login">Volver a iniciar sesión</Link>
    </AuthLayout>
  );
}

export function ResetPage() {
  const controller = useSessionController();
  const location = useLocation();
  const navigate = useNavigate();
  const state = useSubmit();
  const [token, setToken] = useState(() =>
    new URLSearchParams(location.search).get('token'),
  );
  const [invalid] = useState(() =>
    new URLSearchParams(location.search).has('error'),
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    if (location.search) void navigate('/reset-password', { replace: true });
  }, [location.search, navigate]);
  return (
    <AuthLayout
      title={token ? 'Nueva contraseña' : 'Restablecer contraseña'}
      intro={
        token
          ? 'Elige una contraseña nueva de entre 8 y 128 caracteres.'
          : 'Te enviaremos un enlace si el correo corresponde a una cuenta. Es un paso distinto de verificar tu correo.'
      }
    >
      {invalid && (
        <p role="alert">El enlace venció o no es válido. Solicita otro.</p>
      )}
      <form
        aria-describedby="form-message"
        onSubmit={(event) => {
          void state.submit(event, async () => {
            if (token) {
              const value = password;
              setPassword('');
              await controller.reset(token, value);
              setToken(null);
              await navigate('/login', { replace: true });
            } else {
              await controller.auth.requestReset(email);
              state.setMessage(resetRequestMessage);
            }
          });
        }}
      >
        {token ? (
          <label>
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby="form-message"
            />
          </label>
        ) : (
          <label>
            Correo
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby="form-message"
            />
          </label>
        )}
        <button type="submit" disabled={state.pending}>
          {state.pending
            ? 'Enviando…'
            : token
              ? 'Guardar contraseña'
              : 'Solicitar enlace'}
        </button>
        <FormStatus state={state} />
      </form>
      <Link to="/login">Volver a iniciar sesión</Link>
    </AuthLayout>
  );
}

import { Link, useRouteError } from 'react-router-dom';

/** Friendly fallback when a screen throws (instead of the router's developer page). */
export function RouteError() {
  const err = useRouteError() as Error | undefined;
  return (
    <div style={{ maxWidth: 560, margin: '80px auto', padding: 24 }}>
      <h1 style={{ fontWeight: 400 }}>Something went wrong on this screen</h1>
      <p className="muted">{err?.message ?? 'Unknown error'}</p>
      <p className="small faint">No settings were changed. Reload the page, or go back to the dashboard.</p>
      <div className="row"><button className="btn" onClick={() => location.reload()}>Reload</button><Link className="btn primary" to="/field">Dashboard</Link></div>
    </div>
  );
}

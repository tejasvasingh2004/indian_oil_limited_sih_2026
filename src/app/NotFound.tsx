import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/Shell';

export function NotFound() {
  return (
    <>
      <PageHeader title="Not found" />
      <div className="panel">
        <p className="muted" style={{ marginTop: 0 }}>This page may belong to a later build step.</p>
        <Link className="btn primary" to="/field">Back to the dashboard</Link>
      </div>
    </>
  );
}

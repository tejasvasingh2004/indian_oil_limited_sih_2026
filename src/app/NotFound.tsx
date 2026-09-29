import { Link } from 'react-router-dom';
import { Frame } from '@/components/Frame';
import { DesertScene } from '@/components/scenes/DesertScene';

export function NotFound() {
  return (
    <Frame scene={<DesertScene variant="field" />}>
      <div style={{ margin: 'auto' }} className="card strong center">
        <h1 className="mid" style={{ margin: 0 }}>Nothing at this address</h1>
        <p className="muted">The page may belong to a later build step.</p>
        <Link className="pill-btn primary" to="/field">Back to the field board</Link>
      </div>
    </Frame>
  );
}

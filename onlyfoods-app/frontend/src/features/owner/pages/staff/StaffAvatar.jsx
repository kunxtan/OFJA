import { useState, useEffect } from 'react';
import { Icon } from '../../components/ui';
import { AVATAR_COLORS, staffInitials } from './staffUtils';

export function StaffAvatar({ name, src, id, size = 56 }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [src]);
  const showImage = Boolean(src) && !broken;
  return (
    <span
      className="sf-avatar"
      style={{
        width: size, height: size, fontSize: Math.round(size * 0.36),
        background: showImage ? '#ECEEF5' : AVATAR_COLORS[Number(id || 0) % AVATAR_COLORS.length],
      }}
    >
      {showImage
        ? <img src={src} alt="" onError={() => setBroken(true)} />
        : staffInitials(name) || <Icon name="user" size={Math.round(size * 0.46)} />}
    </span>
  );
}

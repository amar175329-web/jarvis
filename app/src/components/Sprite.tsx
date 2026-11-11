import { SPRITE_INNER } from './spriteInner';

export function Sprite() {
  return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: SPRITE_INNER }} />;
}

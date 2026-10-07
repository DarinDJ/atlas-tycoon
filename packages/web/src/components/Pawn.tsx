import { AVATARS, glyphFor } from '../config/cosmetics';

interface Props {
  avatar: string;
  color: string;
  /** Pawn skin id (TOKENS). */
  skin?: string;
  size?: number;
  className?: string;
  title?: string;
}

/** A player's pawn: their avatar on a disc in their colour. Used on the board, in panels and pickers. */
export function Pawn({ avatar, color, skin = 'auto', size = 36, className = '', title }: Props) {
  return (
    <span
      className={`pawn ${className}`}
      data-skin={skin}
      style={{ ['--pawn-color' as string]: color, width: size, height: size, fontSize: size * 0.55 }}
      title={title}
      aria-hidden
    >
      <span className="pawn-face">{glyphFor(AVATARS, avatar, '🙂')}</span>
    </span>
  );
}

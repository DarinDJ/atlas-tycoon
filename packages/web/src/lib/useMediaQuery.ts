import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof matchMedia !== 'undefined' ? matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    onChange();
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/**
 * Renders a small, intentional subset of markdown (**bold** only) as React
 * nodes. Assistant messages never need more than this, and pulling in a
 * full markdown dependency for one feature would be overkill.
 */
export function renderInlineBold(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        // eslint-disable-next-line react/no-array-index-key
        <strong key={i} className="font-semibold text-mist-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

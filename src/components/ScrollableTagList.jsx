import { useRef, useEffect } from 'react';

/**
 * A shared scroll container component used across the application
 * to ensure consistent scrolling performance, behavior, and position persistence.
 */
export default function ScrollableTagList({ children, style, ...props }) {
  const containerRef = useRef(null);

  // Native scrolling handles scroll position preservation on state updates (like checkbox selections)
  // as long as the component DOM tree is not unmounted.
  useEffect(() => {
    if (containerRef.current) {
      // Scroll state is automatically preserved by the virtual DOM diffing.
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        minHeight: 0,
        WebkitOverflowScrolling: 'touch', // smooth scrolling for touch devices
        ...style
      }}
      {...props}
    >
      {children}
    </div>
  );
}

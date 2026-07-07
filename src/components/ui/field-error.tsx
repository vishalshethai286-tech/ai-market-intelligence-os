export function FieldError({ children }: { children?: string | string[] }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  const message = Array.isArray(children) ? children[0] : children;
  return <p className="text-sm text-red-600 dark:text-red-400">{message}</p>;
}

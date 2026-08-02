import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

function currentPath(): string {
  return window.location.pathname;
}

export function navigate(path: string): void {
  if (currentPath() === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePathname(): string {
  const [pathname, setPathname] = useState(currentPath);
  useEffect(() => {
    const update = () => setPathname(currentPath());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return pathname;
}

export function LocalLink({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  }
  return <a href={to} className={className} onClick={follow}>{children}</a>;
}

export function LocalNavLink({
  to,
  children,
  end = false,
}: {
  to: string;
  children: ReactNode;
  end?: boolean;
}) {
  const pathname = usePathname();
  const active = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
  return <LocalLink to={to} {...(active ? { className: "active" } : {})}>{children}</LocalLink>;
}

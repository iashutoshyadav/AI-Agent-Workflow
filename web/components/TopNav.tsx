import Link from "next/link";
import { useSignOut } from "@nhost/react";

export default function TopNav({ crumbs }: { crumbs?: { label: string; href?: string }[] }) {
  const { signOut } = useSignOut();

  return (
    <div className="topnav">
      <div className="topnav-inner">
        <div className="topnav-brand">
          <div className="topnav-logo">AI</div>
          <Link href="/orgs" style={{ color: "inherit" }}>
            Workflow Builder
          </Link>
          {(crumbs ?? []).map((c, i) => (
            <span key={i} className="row" style={{ gap: 10 }}>
              <span className="topnav-crumb">/</span>
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span className="topnav-crumb">{c.label}</span>}
            </span>
          ))}
        </div>
        <button className="ghost small" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

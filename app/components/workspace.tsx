import Link from "next/link";
import { logout } from "@/server/auth/actions";

export function Workspace({ children }: { children: React.ReactNode }) {

  return (
    <div className="app-shell">
      <header className="topbar">
        <strong>Invoice<span>Flow</span></strong>
        <form action={logout}>
          <button className="sign-out" type="submit">Sign out</button>
        </form>
      </header>
      <aside className="sidebar">
        <p>WORKSPACE</p>
        <Link className="active" aria-current="page" href="/">
          Dashboard
        </Link>
      </aside>
      {children}
    </div>
  );
}


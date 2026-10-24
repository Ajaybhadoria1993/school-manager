import { Link } from "react-router";
import { BrandMark } from "../components/brand/BrandMark";
import { Button } from "../components/ui/Button";
import { getToken } from "../utils/auth";

/** Shown for an address that does not exist. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <BrandMark />
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-primary">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-foreground">This page could not be found</h1>
        <p className="mt-1 text-sm text-foreground-muted">The address may have a typo, or the page may have moved.</p>
      </div>
      <Link to={getToken() ? "/dashboard" : "/"}>
        <Button size="lg">{getToken() ? "Go to your dashboard" : "Go to the home page"}</Button>
      </Link>
    </div>
  );
}

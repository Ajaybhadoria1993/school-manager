import { Link } from "react-router";
import { BrandMark } from "../brand/BrandMark";
import { LANDING_NAV } from "./nav";

const ACCOUNT = [
  { href: "/signup", label: "Register your school" },
  { href: "/login", label: "Sign in" },
  { href: "/forgot-password", label: "Forgot your password?" },
];

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-4 border-l-2 border-primary pl-2 text-xs font-bold uppercase tracking-wider text-white">{title}</h4>
      <ul className="space-y-2.5 text-sm">{children}</ul>
    </div>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-navy pb-8 pt-16 text-slate-400">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <div className="mb-12 grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <BrandMark tone="inverse" className="mb-4" />
            <p className="max-w-sm text-sm leading-relaxed">
              EduShiksha is a school management platform for Indian schools. Register your school, share a few details, and open your
              dashboard once our team has approved it.
            </p>
          </div>

          <Column title="Explore">
            {LANDING_NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="transition-colors hover:text-white">
                  {item.label}
                </a>
              </li>
            ))}
          </Column>

          <Column title="Your account">
            {ACCOUNT.map((item) => (
              <li key={item.href}>
                <Link to={item.href} className="transition-colors hover:text-white">
                  {item.label}
                </Link>
              </li>
            ))}
          </Column>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-8 text-xs text-slate-500 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} EduShiksha</p>
          <p>
            Already registered?{" "}
            <Link to="/login" className="font-semibold text-slate-300 transition-colors hover:text-white">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}

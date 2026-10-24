import { Navigate } from "react-router";
import { CtaBand } from "../../components/landing/CtaBand";
import { Hero } from "../../components/landing/Hero";
import { Highlights } from "../../components/landing/Highlights";
import { HowItWorks } from "../../components/landing/HowItWorks";
import { LandingFooter } from "../../components/landing/LandingFooter";
import { LandingHeader } from "../../components/landing/LandingHeader";
import { Roadmap } from "../../components/landing/Roadmap";
import { Roles } from "../../components/landing/Roles";
import { Showcase } from "../../components/landing/Showcase";
import { getToken } from "../../utils/auth";

export default function LandingPage() {
  // Someone already signed in goes straight to their dashboard; everyone else sees this page.
  if (getToken()) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <LandingHeader />
      <main id="main">
        <Hero />
        <Highlights />
        <Showcase />
        <HowItWorks />
        <Roles />
        <Roadmap />
        <CtaBand />
      </main>
      <LandingFooter />
    </div>
  );
}

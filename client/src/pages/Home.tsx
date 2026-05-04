import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Check,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate("/dashboard");
    } else {
      navigate("/signup");
    }
  };

  const plans = [
    {
      name: "Starter",
      price: "$49",
      description: "Solo operators getting their first AI concierge online.",
      features: [
        "1 SMS phone number",
        "200 conversations/month",
        "Email alerts",
      ],
    },
    {
      name: "Pro",
      price: "$99",
      description: "Growing teams that need more volume and visibility.",
      features: [
        "3 SMS phone numbers",
        "Unlimited conversations",
        "SMS + email alerts",
        "CSV export",
      ],
      highlighted: true,
    },
    {
      name: "Agency",
      price: "$249",
      description: "Multi-client operations with hands-on support needs.",
      features: [
        "10 SMS phone numbers",
        "White-label customization",
        "Unlimited history",
        "Dedicated support",
      ],
    },
  ];

  const features = [
    {
      icon: MessageCircle,
      title: "Conversational intake",
      description:
        "SMS conversations collect booking details, answer common questions, and keep every lead moving.",
    },
    {
      icon: Sparkles,
      title: "Qualified leads only",
      description:
        "Leoprompt tracks intent, missing fields, and confidence so your team can focus on the right follow-ups.",
    },
    {
      icon: ShieldCheck,
      title: "Human handoff",
      description:
        "Risky or high-touch requests are escalated before the customer experience drifts off-brand.",
    },
  ];

  return (
    <div className="min-h-screen bg-[#1a1230] text-[#89CFF0]">
      <div className="relative overflow-hidden bg-[radial-gradient(circle_at_20%_12%,rgba(255,122,184,0.95),transparent_30%),radial-gradient(circle_at_82%_18%,rgba(137,207,240,0.34),transparent_28%),linear-gradient(135deg,#ff74b8_0%,#c45cff_46%,#5a35c8_100%)]">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(19,12,42,0.2),rgba(19,12,42,0.58)_74%,#1a1230_100%)]" />

        <nav className="relative z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
            <button
              className="flex items-center gap-3 text-left"
              onClick={() => navigate("/")}
              aria-label="Leoprompt home"
            >
              <img
                src="/leoprompt-logo.png?v=2"
                alt="Leoprompt logo"
                className="h-12 w-auto"
              />
              <span className="text-lg font-semibold tracking-tight text-[#89CFF0]">
                Leoprompt
              </span>
            </button>

            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <Button
                  onClick={() => navigate("/dashboard")}
                  className="bg-[#89CFF0] text-[#17112c] hover:bg-[#a4ddf5]"
                >
                  Dashboard
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => navigate("/signin")}
                    className="text-[#89CFF0] hover:bg-white/10 hover:text-[#b8e7fb]"
                  >
                    Sign In
                  </Button>
                  <Button
                    onClick={handleGetStarted}
                    className="bg-[#89CFF0] text-[#17112c] shadow-lg shadow-[#89CFF0]/25 hover:bg-[#a4ddf5]"
                  >
                    Start Free Trial
                  </Button>
                </>
              )}
            </div>
          </div>
        </nav>

        <section className="relative z-10 mx-auto flex min-h-[calc(100svh-18rem)] max-w-6xl flex-col items-center justify-center px-4 pb-10 pt-6 text-center md:pb-12">
          <img
            src="/leoprompt-logo.png?v=2"
            alt="Leoprompt logo"
            className="mb-6 h-32 w-auto md:h-44"
          />

          <p className="mb-4 rounded-full border border-[#89CFF0]/35 bg-[#17112c]/35 px-4 py-2 text-sm font-medium text-[#89CFF0] backdrop-blur">
            AI booking intake for service businesses
          </p>

          <h1 className="max-w-5xl text-5xl font-semibold leading-none tracking-normal text-[#89CFF0] drop-shadow-[0_4px_28px_rgba(16,12,38,0.42)] md:text-7xl lg:text-8xl">
            Leoprompt Concierge
          </h1>

          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#dff5ff] md:text-xl">
            Create an always-on SMS assistant that qualifies leads, captures the
            booking details, and hands off the moments that need a human.
          </p>

          <div className="mt-8 w-full max-w-3xl rounded-[2rem] border border-white/20 bg-white/16 p-3 shadow-2xl shadow-[#261248]/30 backdrop-blur-xl">
            <div className="flex flex-col gap-3 rounded-[1.4rem] bg-[#17112c]/82 p-3 sm:flex-row sm:items-center">
              <div className="flex min-h-12 flex-1 items-center px-3 text-left text-sm text-[#b8e7fb] sm:text-base">
                Qualify every inquiry, collect event details, and alert my
                team...
              </div>
              <Button
                onClick={handleGetStarted}
                className="h-12 rounded-2xl bg-[#89CFF0] px-5 font-semibold text-[#17112c] hover:bg-[#a4ddf5]"
              >
                Build
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      </div>

      <main className="bg-[#1a1230]">
        <section className="mx-auto grid max-w-6xl gap-4 px-4 py-12 md:grid-cols-3">
          {features.map(feature => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-lg border border-[#89CFF0]/18 bg-[#24163f]/80 p-6 shadow-xl shadow-black/10"
              >
                <Icon className="mb-5 h-8 w-8 text-[#89CFF0]" />
                <h2 className="text-xl font-semibold text-[#89CFF0]">
                  {feature.title}
                </h2>
                <p className="mt-3 leading-7 text-[#c8ecfb]">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </section>

        <section className="border-y border-[#89CFF0]/10 bg-[#21123b] px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#89CFF0]/75">
                Pricing
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-normal text-[#89CFF0]">
                Plans that scale with your booking volume
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {plans.map(plan => (
                <div
                  key={plan.name}
                  className={`rounded-lg border p-6 ${
                    plan.highlighted
                      ? "border-[#89CFF0] bg-[#89CFF0] text-[#17112c] shadow-2xl shadow-[#89CFF0]/20"
                      : "border-[#89CFF0]/18 bg-[#2a1848] text-[#89CFF0]"
                  }`}
                >
                  <h3 className="text-2xl font-semibold">{plan.name}</h3>
                  <p
                    className={`mt-2 min-h-14 text-sm leading-6 ${
                      plan.highlighted ? "text-[#24314a]" : "text-[#c8ecfb]"
                    }`}
                  >
                    {plan.description}
                  </p>
                  <div className="mt-6 flex items-end gap-1">
                    <span className="text-5xl font-semibold">{plan.price}</span>
                    <span className="pb-2 text-sm opacity-80">/month</span>
                  </div>
                  <Button
                    className={`mt-6 w-full ${
                      plan.highlighted
                        ? "bg-[#17112c] text-[#89CFF0] hover:bg-[#2b1c4f]"
                        : "bg-[#89CFF0] text-[#17112c] hover:bg-[#a4ddf5]"
                    }`}
                    onClick={handleGetStarted}
                  >
                    Get Started
                  </Button>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map(feature => (
                      <li key={feature} className="flex gap-3 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-16 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-4xl font-semibold tracking-normal text-[#89CFF0]">
              Ready to make intake feel effortless?
            </h2>
            <p className="mt-3 max-w-xl text-[#c8ecfb]">
              Start with your services, pricing, availability, and voice. The
              concierge takes it from there.
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleGetStarted}
            className="bg-[#89CFF0] text-[#17112c] hover:bg-[#a4ddf5]"
          >
            Start Free Trial
          </Button>
        </section>
      </main>
    </div>
  );
}

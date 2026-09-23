"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Scissors,
  Sparkles,
  Youtube,
  Github,
  ArrowRight,
  Play,
  Target,
  ScanFace,
  Type,
  Film,
  MonitorPlay,
  Share2,
  Wand2,
  ExternalLink,
  Check,
  Menu,
  X,
  Volume2,
  VolumeX,
} from "lucide-react";
import { isLandingOnlyModeEnabled } from "@/lib/app-flags";
import { getPublicBillingPlans } from "@/lib/billing-plans";
import { APP_STORE_URL, GITHUB_URL, HOSTED_APP_URL } from "@/lib/site";

function ScrollReveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(30px)",
        transition: `opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

const FEATURES = [
  {
    icon: ScanFace,
    title: "Face-Centered Cropping",
    description:
      "MediaPipe + OpenCV detects and tracks faces for perfect 9:16 vertical framing.",
  },
  {
    icon: Type,
    title: "Word-Synced Subtitles",
    description:
      "Word-level timestamps power perfectly timed, animated captions on every clip.",
  },
  {
    icon: Target,
    title: "Virality Scoring",
    description:
      "AI rates hook, engagement, value, and shareability — scored 0 to 100.",
  },
  {
    icon: Film,
    title: "B-Roll Overlays",
    description:
      "Automatically source and overlay relevant stock footage from Pexels.",
  },
  {
    icon: Sparkles,
    title: "Caption Templates",
    description:
      "Multiple animation styles and font presets to match your brand.",
  },
  {
    icon: MonitorPlay,
    title: "Platform Export",
    description:
      "One-click presets for TikTok, Reels, and Shorts with optimized encoding.",
  },
];

function getPlans() {
  return [
    {
      name: "Self-Hosted",
      price: "$0",
      period: "forever",
      description: "Run on your own infrastructure with full control.",
      features: [
        "Face-centered cropping",
        "Word-synced subtitles",
        "Virality scoring",
        "All export presets",
        "Full source code access",
      ],
      cta: "View on GitHub",
      ctaHref: GITHUB_URL,
      highlighted: false,
    },
    ...getPublicBillingPlans().map((plan) => ({
      name: plan.name,
      price: `$${plan.priceMonthly}`,
      period: "/month",
      description: plan.description,
      features: [
        `${plan.generationLimit} generations per month`,
        "Everything in Free",
        "B-Roll overlays",
        "Caption templates",
        "Platform export presets",
        ...(
          plan.id === "scale"
            ? ["YouTube videos up to 3 hours", "Priority processing"]
            : ["Early access to new features"]
        ),
      ],
      cta: plan.cta,
      ctaHref: "",
      highlighted: plan.highlighted,
    })),
  ];
}

const STEPS = [
  {
    num: "01",
    title: "Drop a link or file",
    description:
      "Paste any YouTube URL or drag-and-drop your own video file.",
    icon: Youtube,
  },
  {
    num: "02",
    title: "AI finds the gold",
    description:
      "Transcription, virality scoring, and segment detection surface the best moments.",
    icon: Wand2,
  },
  {
    num: "03",
    title: "Export & publish",
    description:
      "Get vertical, captioned, face-tracked clips ready for every platform.",
    icon: Share2,
  },
];

const SEO_RESOURCES = [
  {
    href: "/ai-video-clipper",
    eyebrow: "AI Video Clipping",
    title: "AI video clipper for Shorts, Reels, and TikTok",
    description: "See how SupoClip finds moments, scores candidates, reframes faces, and adds captions.",
  },
  {
    href: "/open-source-video-clipper",
    eyebrow: "Self-Hosting",
    title: "Open-source video clipper you can control",
    description: "Compare hosted-only workflows with SupoClip's inspectable, self-hosted pipeline.",
  },
  {
    href: "/youtube-shorts-clipper",
    eyebrow: "YouTube to Shorts",
    title: "Repurpose long YouTube videos into Shorts",
    description: "Follow a practical workflow for selecting, captioning, reframing, and reviewing clips.",
  },
  {
    href: "/blog/best-free-opusclip-alternative",
    eyebrow: "Comparison",
    title: "Best free OpusClip alternative",
    description: "Compare SupoClip's open-source approach with a managed, credit-based clipping tool.",
  },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const authEnabled = !isLandingOnlyModeEnabled;

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ─── NAV ─── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${
          scrolled ? "bg-background border-b border-border" : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="SupoClip"
              width={24}
              height={24}
            />
            <span className="text-title">SupoClip</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a
              href="#how-it-works"
              className="text-small text-muted-foreground hover:text-foreground transition-colors"
            >
              How It Works
            </a>
            <a
              href="#features"
              className="text-small text-muted-foreground hover:text-foreground transition-colors"
            >
              Features
            </a>
            <a
              href="#pricing"
              className="text-small text-muted-foreground hover:text-foreground transition-colors"
            >
              Pricing
            </a>
            <a
              href="#open-source"
              className="text-small text-muted-foreground hover:text-foreground transition-colors"
            >
              Open Source
            </a>
            <Link
              href="/blog"
              className="text-small text-muted-foreground hover:text-foreground transition-colors"
            >
              Blog
            </Link>
          </div>

          {/* Desktop auth buttons */}
          <div className="hidden md:flex items-center gap-3">
            {authEnabled ? (
              <>
                <Link href="/sign-in">
                  <Button variant="ghost" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link href="/sign-up">
                  <Button size="sm">Get Started</Button>
                </Link>
              </>
            ) : (
              <a href={HOSTED_APP_URL} target="_blank" rel="noopener noreferrer">
                <Button size="sm">
                  Open Hosted App
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </a>
            )}
          </div>

          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="md:hidden p-2"
            aria-label="Toggle menu"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {/* Mobile nav dropdown */}
        {mobileNavOpen && (
          <div className="md:hidden border-t border-border bg-background">
            <div className="max-w-6xl mx-auto px-6 py-4 space-y-1">
              <a
                href="#how-it-works"
                onClick={() => setMobileNavOpen(false)}
                className="block px-3 py-2 text-small text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                How It Works
              </a>
              <a
                href="#features"
                onClick={() => setMobileNavOpen(false)}
                className="block px-3 py-2 text-small text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Features
              </a>
              <a
                href="#pricing"
                onClick={() => setMobileNavOpen(false)}
                className="block px-3 py-2 text-small text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Pricing
              </a>
              <a
                href="#open-source"
                onClick={() => setMobileNavOpen(false)}
                className="block px-3 py-2 text-small text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Open Source
              </a>
              <Link
                href="/blog"
                onClick={() => setMobileNavOpen(false)}
                className="block px-3 py-2 text-small text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Blog
              </Link>
              <Separator className="my-2" />
              <div className="flex flex-col gap-2 px-3 pt-1">
                {authEnabled ? (
                  <>
                    <Link href="/sign-in" onClick={() => setMobileNavOpen(false)}>
                      <Button variant="outline" size="sm" className="w-full">
                        Sign In
                      </Button>
                    </Link>
                    <Link href="/sign-up" onClick={() => setMobileNavOpen(false)}>
                      <Button size="sm" className="w-full">Get Started</Button>
                    </Link>
                  </>
                ) : (
                  <a href={HOSTED_APP_URL} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" className="w-full">
                      Open Hosted App
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* ─── HERO ─── */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-5">
            {/* Left: Text */}
            <div className="lg:col-span-7">
              <p
                className="text-label uppercase text-muted-foreground mb-6"
                style={{ animation: "landing-fade-in-up 0.6s ease-out both" }}
              >
                Open Source · Self-Hostable
              </p>

              <h1
                className="text-display text-foreground mb-6 max-w-2xl"
                style={{ animation: "landing-fade-in-up 0.6s ease-out 0.1s both" }}
              >
                Open-source AI video clipper for better shorts
              </h1>

              <p
                className="text-body text-muted-foreground max-w-lg mb-10"
                style={{ animation: "landing-fade-in-up 0.6s ease-out 0.2s both" }}
              >
                Turn long videos into captioned YouTube Shorts, TikToks, and Reels
                with AI-assisted highlight detection, virality scoring, and
                face-aware vertical crops.
              </p>

              <div
                className="flex flex-wrap gap-4 mb-10"
                style={{ animation: "landing-fade-in-up 0.6s ease-out 0.3s both" }}
              >
                {authEnabled ? (
                  <Link href="/sign-up">
                    <Button size="lg">
                      Start Clipping
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                ) : (
                  <a href={HOSTED_APP_URL} target="_blank" rel="noopener noreferrer">
                    <Button size="lg">
                      Use Hosted App
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </a>
                )}
                <a
                  href="https://github.com/FujiwaraChoki/supoclip"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="lg">
                    <Github className="w-4 h-4" />
                    View Source
                  </Button>
                </a>
                <a
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Download SupoClip on the App Store"
                  className="flex items-center"
                >
                  <Image
                    src="/app-store-badge.svg"
                    alt="Download on the App Store"
                    width={135}
                    height={40}
                    className="h-12 w-auto"
                  />
                </a>
              </div>

              <div
                className="flex flex-wrap gap-x-6 gap-y-2 text-small text-muted-foreground"
                style={{ animation: "landing-fade-in-up 0.6s ease-out 0.4s both" }}
              >
                {[
                  { icon: ScanFace, label: "9:16 Auto-Crop" },
                  { icon: Type, label: "Word-Synced Captions" },
                  { icon: Target, label: "Virality Scoring" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Visual — offset, skips column 8 for a real stagger */}
            <div
              className="lg:col-span-4 lg:col-start-9 lg:mt-16 flex justify-center lg:justify-start"
              style={{ animation: "landing-fade-in-up 0.8s ease-out 0.3s both" }}
            >
              <HeroVisual />
            </div>
          </div>
        </div>
      </section>

      <Separator />

      {/* ─── HOW IT WORKS ─── */}
      <section id="how-it-works" className="py-20 md:py-28 bg-muted">
        <div className="max-w-6xl mx-auto px-6">
          <ScrollReveal className="mb-16">
            <p className="text-label uppercase text-muted-foreground mb-3">
              How It Works
            </p>
            <h2 className="text-headline">Three steps. Zero effort.</h2>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-5">
            {STEPS.map((step, i) => (
              <ScrollReveal key={step.num} delay={i * 0.1} className={i === 1 ? "md:mt-12" : ""}>
                <Card className="h-full py-0 gap-0 border border-border hover:border-foreground transition-colors">
                  <CardContent className="p-8">
                    <span className="text-display text-muted-foreground leading-none block mb-6 select-none">
                      {step.num}
                    </span>
                    <div className="w-10 h-10 bg-secondary flex items-center justify-center mb-6">
                      <step.icon className="w-5 h-5 text-foreground" />
                    </div>
                    <h3 className="text-title mb-2">{step.title}</h3>
                    <p className="text-small text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </CardContent>
                </Card>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* ─── FEATURES ─── */}
      <section id="features" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <ScrollReveal className="mb-16">
            <p className="text-label uppercase text-muted-foreground mb-3">
              Features
            </p>
            <h2 className="text-headline mb-4">
              Everything you need to go viral
            </h2>
            <p className="text-body text-muted-foreground max-w-md">
              Professional-grade video clipping with AI intelligence at every
              step of the pipeline.
            </p>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((feature, i) => (
              <ScrollReveal key={feature.title} delay={i * 0.07}>
                <Card className="h-full py-0 gap-0 border border-border hover:border-foreground transition-colors">
                  <CardContent className="p-6">
                    <div className="w-10 h-10 bg-secondary flex items-center justify-center mb-4">
                      <feature.icon className="w-5 h-5 text-foreground" />
                    </div>
                    <h3 className="text-title mb-2">{feature.title}</h3>
                    <p className="text-small text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* ─── PRICING ─── */}
      <section id="pricing" className="py-20 md:py-28 bg-muted">
        <div className="max-w-5xl mx-auto px-6">
          <ScrollReveal className="mb-16">
            <p className="text-label uppercase text-muted-foreground mb-3">
              Pricing
            </p>
            <h2 className="text-headline mb-4">
              Simple pricing, no surprises
            </h2>
            <p className="text-body text-muted-foreground max-w-md">
              Start free. Upgrade when you need more generations.
              Self-hosters get everything free, always.
            </p>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
            {getPlans().map((plan, i) => (
              <ScrollReveal key={plan.name} delay={i * 0.12}>
                <Card
                  className={`py-0 gap-0 border transition-colors ${
                    plan.highlighted
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:border-foreground"
                  }`}
                >
                  <CardContent className="p-8">
                    {plan.highlighted && (
                      <p className="text-label uppercase mb-4">Most Popular</p>
                    )}

                    <div className="mb-6">
                      <h3 className="text-title mb-1">{plan.name}</h3>
                      <p
                        className={`text-small ${
                          plan.highlighted
                            ? "text-primary-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {plan.description}
                      </p>
                    </div>

                    <div className="flex items-baseline gap-1 mb-8">
                      <span className="text-headline">{plan.price}</span>
                      <span
                        className={`text-small ${
                          plan.highlighted
                            ? "text-primary-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {plan.period}
                      </span>
                    </div>

                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3 text-small">
                          <Check
                            className={`w-4 h-4 mt-0.5 shrink-0 ${
                              plan.highlighted
                                ? "text-primary-foreground"
                                : "text-muted-foreground"
                            }`}
                          />
                          <span
                            className={
                              plan.highlighted ? "text-primary-foreground" : ""
                            }
                          >
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {plan.ctaHref ? (
                      <a
                        href={plan.ctaHref}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button className="w-full" variant="outline" size="lg">
                          <Github className="w-4 h-4" />
                          {plan.cta}
                          <ExternalLink className="w-3.5 h-3.5 opacity-50" />
                        </Button>
                      </a>
                    ) : authEnabled ? (
                      <Link href="/sign-up">
                        <Button
                          className={`w-full ${
                            plan.highlighted
                              ? "bg-primary-foreground text-primary hover:bg-foreground hover:text-background"
                              : ""
                          }`}
                          variant={plan.highlighted ? "secondary" : "default"}
                          size="lg"
                        >
                          {plan.cta}
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    ) : (
                      <a
                        href={HOSTED_APP_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button
                          className={`w-full ${
                            plan.highlighted
                              ? "bg-primary-foreground text-primary hover:bg-foreground hover:text-background"
                              : ""
                          }`}
                          variant={plan.highlighted ? "secondary" : "default"}
                          size="lg"
                        >
                          Use Hosted App
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </a>
                    )}
                  </CardContent>
                </Card>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal delay={0.3}>
            <p className="text-small text-muted-foreground mt-10 max-w-md">
              Self-hosting? All features are free and unlimited.{" "}
              <a
                href="#open-source"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                See setup instructions
              </a>
              .
            </p>
          </ScrollReveal>
        </div>
      </section>

      <Separator />

      {/* ─── OPEN SOURCE ─── */}
      <section id="open-source" className="py-20 md:py-28 bg-muted">
        <div className="max-w-3xl mx-auto px-6">
          <ScrollReveal className="mb-10">
            <Badge variant="outline" className="mb-6 gap-1.5">
              <Github className="w-3.5 h-3.5" />
              AGPL-3.0 Licensed
            </Badge>
            <h2 className="text-headline mb-4">Built in the open</h2>
            <p className="text-body text-muted-foreground max-w-lg">
              Fully open source. Self-host on your infrastructure, contribute
              features, or fork it and make it yours.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <Card className="py-0 gap-0 border border-border">
              <CardContent className="p-6 md:p-8">
                <p className="text-label uppercase text-muted-foreground mb-3">
                  Get running in 30 seconds
                </p>
                <div className="bg-foreground text-background p-6 font-mono text-small leading-loose overflow-x-auto">
                  <div>
                    <span className="opacity-50">$</span>{" "}
                    git clone{" "}
                    <span className="opacity-40">
                      https://github.com/FujiwaraChoki/supoclip
                    </span>
                  </div>
                  <div>
                    <span className="opacity-50">$</span>{" "}
                    cd{" "}
                    <span className="opacity-40">supoclip</span>
                  </div>
                  <div>
                    <span className="opacity-50">$</span>{" "}
                    docker-compose up -d
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 mt-6">
                  <a
                    href="https://github.com/FujiwaraChoki/supoclip"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button>
                      <Github className="w-4 h-4" />
                      View on GitHub
                      <ExternalLink className="w-3.5 h-3.5 opacity-50" />
                    </Button>
                  </a>
                  {authEnabled ? (
                    <Link href="/sign-up">
                      <Button variant="outline">
                        Try the hosted version
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  ) : (
                    <a href={HOSTED_APP_URL} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline">
                        Open hosted version
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </section>

      <Separator />

      {/* ─── GUIDES ─── */}
      <section id="guides" className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <ScrollReveal className="mb-12">
            <p className="mb-3 text-label uppercase text-muted-foreground">
              Guides & Comparisons
            </p>
            <h2 className="text-headline">
              Learn the complete clipping workflow
            </h2>
            <p className="mt-4 max-w-2xl text-body text-muted-foreground">
              Practical, source-backed pages for choosing a video clipper, self-hosting SupoClip,
              and turning long recordings into short-form content.
            </p>
          </ScrollReveal>
          <div className="grid gap-5 md:grid-cols-2">
            {SEO_RESOURCES.map((resource, index) => (
              <ScrollReveal key={resource.href} delay={index * 0.08}>
                <Link
                  href={resource.href}
                  className="group block h-full border border-border bg-card p-6 hover:border-foreground transition-colors"
                >
                  <p className="text-label uppercase text-muted-foreground">
                    {resource.eyebrow}
                  </p>
                  <h3 className="mt-4 text-title">{resource.title}</h3>
                  <p className="mt-4 text-small text-muted-foreground">{resource.description}</p>
                  <span className="mt-6 inline-flex items-center gap-2 text-small font-semibold">
                    Read guide <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="bg-foreground text-background py-24 md:py-32">
        <ScrollReveal className="max-w-6xl mx-auto px-6">
          <h2 className="text-headline mb-6 max-w-xl">Ready to clip?</h2>
          <p className="text-body mb-8 max-w-md">
            Turn your next video into scroll-stopping shorts. Free, open source,
            no credit card required.
          </p>
          {authEnabled ? (
            <Link href="/sign-up">
              <Button size="lg">
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          ) : (
            <a href={HOSTED_APP_URL} target="_blank" rel="noopener noreferrer">
              <Button size="lg">
                Open Hosted App
                <ExternalLink className="w-4 h-4" />
              </Button>
            </a>
          )}
        </ScrollReveal>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="SupoClip"
              width={24}
              height={24}
            />
            <span className="text-title">SupoClip</span>
          </div>
          <nav aria-label="Footer navigation" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-small text-muted-foreground">
            <Link href="/ai-video-clipper" className="hover:text-foreground transition-colors">AI clipper</Link>
            <Link href="/open-source-video-clipper" className="hover:text-foreground transition-colors">Open source</Link>
            <Link href="/youtube-shorts-clipper" className="hover:text-foreground transition-colors">YouTube Shorts</Link>
            <Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              iOS App
            </a>
            <span>&copy; {new Date().getFullYear()}</span>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/* ─── Hero Visual ─── */

/**
 * Real SupoClip output. Clips were generated from the source video below and
 * trimmed to 15s previews for the landing page (see public/clips/).
 */
const DEMO_SOURCE = {
  title: "Sam Altman — How to Start a Startup",
  url: "https://www.youtube.com/watch?v=Vv3CEAS_w34",
};

const DEMO_CLIPS = [
  {
    src: "/clips/demo-2.mp4",
    poster: "/clips/demo-2.jpg",
    hook: "Why chaos management is not teachable",
    range: "05:04 – 05:54",
    duration: "0:50",
  },
  {
    src: "/clips/demo-1.mp4",
    poster: "/clips/demo-1.jpg",
    hook: "Why your 10 week old startup is failing",
    range: "00:14 – 00:39",
    duration: "0:25",
  },
];

function HeroVisual() {
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  // Only the active clip plays; the others stay parked at frame zero.
  useEffect(() => {
    setProgress(0);
    videoRefs.current.forEach((video, i) => {
      if (!video) return;
      if (i !== active) {
        video.pause();
        video.currentTime = 0;
        return;
      }
      video.currentTime = 0;
      video
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    });
  }, [active]);

  // React can drop the `muted` attribute on hydration — set the property too.
  useEffect(() => {
    videoRefs.current.forEach((video) => {
      if (video) video.muted = muted;
    });
  }, [muted]);

  const togglePlay = () => {
    const video = videoRefs.current[active];
    if (!video) return;
    if (video.paused) {
      video
        .play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="relative w-full max-w-[360px]">
      <Card className="py-0 gap-0 overflow-hidden border border-border">
        <CardContent className="p-4">
          {/* Source video being clipped */}
          <a
            href={DEMO_SOURCE.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 group"
          >
            <div className="w-8 h-8 bg-secondary flex items-center justify-center shrink-0">
              <Youtube className="w-4 h-4 text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-small font-medium truncate group-hover:underline">
                {DEMO_SOURCE.title}
              </p>
              <p className="text-label uppercase text-muted-foreground">
                youtube.com · long-form source
              </p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </a>

          {/* Scissors divider */}
          <div className="flex items-center gap-2 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="flex items-center gap-1.5 text-label uppercase text-muted-foreground">
              <Scissors className="w-3 h-3 rotate-90" />
              {DEMO_CLIPS.length} clips found
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Player */}
          <div
            className="relative mx-auto w-[214px] overflow-hidden bg-black border border-border"
            style={{ aspectRatio: "9/16" }}
          >
            {DEMO_CLIPS.map((clip, i) => (
              <video
                key={clip.src}
                ref={(el) => {
                  videoRefs.current[i] = el;
                }}
                src={clip.src}
                poster={clip.poster}
                muted
                playsInline
                preload={i === 0 ? "metadata" : "none"}
                aria-label={clip.hook}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                  i === active ? "opacity-100" : "opacity-0"
                }`}
                onTimeUpdate={(e) => {
                  if (i !== active) return;
                  const el = e.currentTarget;
                  if (el.duration) setProgress(el.currentTime / el.duration);
                }}
                onEnded={() => setActive((prev) => (prev + 1) % DEMO_CLIPS.length)}
              />
            ))}

            {/* Click-to-pause surface */}
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause clip" : "Play clip"}
              className="absolute inset-0 flex items-center justify-center focus:outline-none"
            >
              <span
                className={`w-11 h-11 rounded-full bg-background/85 flex items-center justify-center transition-opacity duration-200 ${
                  playing ? "opacity-0" : "opacity-100"
                }`}
              >
                <Play className="w-4.5 h-4.5 text-foreground ml-0.5" />
              </span>
            </button>

            {/* Mute toggle */}
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Unmute clip" : "Mute clip"}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/45 flex items-center justify-center text-white/90 hover:bg-black/65 transition-colors"
            >
              {muted ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Timestamp + progress */}
            <div className="absolute inset-x-0 bottom-0 pt-8 pb-2 px-2.5 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
              <p className="text-[10px] font-medium text-white/85 mb-2 tabular-nums">
                {DEMO_CLIPS[active].range}
              </p>
              <div className="h-0.5 bg-white/25 overflow-hidden">
                <div
                  className="h-full bg-white/90"
                  style={{ width: `${Math.min(progress * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Clip list */}
          <div className="mt-4 space-y-2">
            {DEMO_CLIPS.map((clip, i) => (
              <button
                key={clip.src}
                type="button"
                onClick={() => setActive(i)}
                aria-current={i === active}
                className={`w-full flex items-center gap-2 p-2 text-left transition-colors ${
                  i === active
                    ? "bg-secondary border border-border"
                    : "hover:bg-secondary"
                }`}
              >
                <Image
                  src={clip.poster}
                  alt=""
                  width={30}
                  height={53}
                  className="shrink-0 object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-medium leading-tight truncate">
                    {clip.hook}
                  </span>
                  <span className="block text-label text-muted-foreground tabular-nums">
                    {clip.range} · {clip.duration}
                  </span>
                </span>
                <Badge
                  variant={i === active ? "default" : "secondary"}
                  className="text-[9px] px-1.5 py-0 h-4 shrink-0"
                >
                  9:16
                </Badge>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

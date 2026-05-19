"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  BatteryWarning,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  CloudRain,
  Compass,
  Cpu,
  Download,
  HeartHandshake,
  Layers3,
  Leaf,
  Map,
  MapPin,
  MessageCircle,
  Mountain,
  PhoneCall,
  Play,
  Route,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trees,
  Users,
  Waves,
} from "lucide-react";
import { FaGithub, FaLinkedin } from "react-icons/fa";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.075,
    },
  },
};

const functionalities = [
  {
    title: "Preparedness before calamities",
    copy: "LIKAS turns onboarding answers into household-ready checklists, safety reminders, and disaster-specific preparation plans for families, students, workers, and vulnerable community members.",
    icon: ShieldCheck,
    stat: "Before",
    outcome: "Readiness plan",
  },
  {
    title: "Smart evacuation routing",
    copy: "When a calamity is active, LIKAS helps compare nearby evacuation centers using distance, capacity, accessibility, pet support, and route safety so users can move with confidence.",
    icon: Route,
    stat: "During",
    outcome: "Safer routes",
  },
  {
    title: "Offline AI chat and voice",
    copy: "The assistant is designed for low-connectivity emergencies, giving practical step-by-step guidance through chat or voice when users cannot rely on mobile data or Wi-Fi.",
    icon: Bot,
    stat: "Offline",
    outcome: "Local guidance",
  },
  {
    title: "Personalized recommendations",
    copy: "Guidance adapts to the user's location, preparedness level, dependents, health considerations, pets, emergency contacts, and preferred meeting places.",
    icon: Sparkles,
    stat: "Adaptive",
    outcome: "Tailored advice",
  },
  {
    title: "Earthquake and typhoon support",
    copy: "Clear response flows help citizens prepare for high-impact hazards such as earthquakes and typhoons, with fast actions before, during, and after the event.",
    icon: CloudRain,
    stat: "PH-ready",
    outcome: "Hazard flows",
  },
  {
    title: "Community companion experience",
    copy: "The experience is built for citizens and community groups, giving barangays, schools, responders, and families a shared language for preparedness and response.",
    icon: HeartHandshake,
    stat: "Together",
    outcome: "Community support",
  },
];

const techStack = [
  {
    name: "Gemma 4",
    tag: "On-device model",
    copy: "The pre-trained model optimized for resource-constrained devices and reliable offline assistance.",
    icon: BrainCircuit,
    meta: "Quantized edge intelligence",
  },
  {
    name: "Unsloth",
    tag: "Fine-tuning layer",
    copy: "Used for fine-tuning disaster response behavior, local phrasing, and emergency intent handling.",
    icon: Layers3,
    meta: "Fast domain adaptation",
  },
  {
    name: "llama.cpp / llama.rn",
    tag: "Runtime bridge",
    copy: "Utilized for integrating Gemma 4 into the mobile app and bringing inference close to the user.",
    icon: Cpu,
    meta: "Mobile integration path",
  },
];

const mockups = [
  {
    label: "Onboarding questions",
    title: "Personalized onboarding",
    copy: "Collects household needs, health considerations, dependents, pets, location, and preparedness level so LIKAS can adapt guidance from the first session.",
    icon: Users,
    image: "/mockups/mockup_3.jpg",
    signal: "Profile-aware setup",
  },
  {
    label: "Preparedness checklist",
    title: "Preparedness checklist",
    copy: "Shows a clear action list for emergency bags, family plans, first-aid essentials, water, food, documents, and readiness gaps.",
    icon: CheckCircle2,
    image: "/mockups/mockup_2.jpg",
    signal: "Before disaster",
  },
  {
    label: "Evacuation route map",
    title: "Evacuation route map",
    copy: "Highlights safer routes and ranked evacuation centers so users can decide where to go when conditions change quickly.",
    icon: Map,
    image: "/mockups/mockup_1.jpg",
    signal: "During calamity",
  },
  {
    label: "Offline AI chat",
    title: "Offline AI assistant",
    copy: "Gives calm, direct emergency instructions through chat or voice, built for moments when signal is weak or unavailable.",
    icon: MessageCircle,
    image: "/mockups/mockup_5.jpg",
    signal: "No network needed",
  },
  {
    label: "Emergency center details",
    title: "Emergency center details",
    copy: "Summarizes center distance, capacity, accessibility, pet support, contact details, and suitability for the user's household.",
    icon: MapPin,
    image: "/mockups/mockup_6.jpg",
    signal: "Best-match view",
  },
];

const steps = [
  "Answer onboarding questions",
  "Get personalized preparedness guidance",
  "Receive safer evacuation routes",
  "Chat or talk with the offline AI assistant",
];

const team = [
  {
    name: "John Paul Curada",
    role: "Leader and AI Developer",
    image: "/team/jp.png",
    linkedin: "https://www.linkedin.com/in/jpcurada/",
    github: "https://github.com/JpCurada",
  },
  {
    name: "Gerald Berongoy",
    role: "Mobile Developer",
    image: "/team/gerald.png",
    linkedin: "https://www.linkedin.com/in/geraldberongoy/",
    github: "https://github.com/geraldsberongoy",
  },
  {
    name: "Kyne Laggui",
    role: "Web Developer",
    image: "/team/kyne.png",
    linkedin: "https://www.linkedin.com/in/kaydev/",
    github: "https://github.com/KyneLaggui",
  },
  {
    name: "Henry James Carlos",
    role: "Design and Assets",
    image: "/team/henry.png",
    linkedin: "https://www.linkedin.com/in/henry-james-carlos-837105269/",
    github: "https://github.com/hjcarlos",
  },
];

const youtubeEmbedUrl = "https://www.youtube.com/embed/kHHcDSyip-Q";
const heroRouteMockup = "/mockups/mockup_1.jpg";
const heroAssistantMockup = "/mockups/mockup_5.jpg";

const navItems = [
  { href: "#features", label: "Features", icon: ShieldCheck },
  { href: "#video", label: "Demo", icon: Play },
  { href: "#ai", label: "Gemma", icon: BrainCircuit },
  { href: "#mockups", label: "App", icon: Smartphone },
  { href: "#team", label: "Team", icon: Users },
];

const sectionOrder = ["top", "video", "features", "ai", "mockups", "team"];

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-90px" }}
      variants={fadeUp}
      transition={{ duration: 0.68, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  copy,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  copy: string;
  align?: "center" | "left";
}) {
  return (
    <Reveal
      className={
        align === "center"
          ? "mx-auto max-w-3xl text-center"
          : "max-w-3xl text-left"
      }
    >
      <Badge className="mb-4 border-emerald-200/80 bg-white/80 px-3.5 py-1.5 text-emerald-700 shadow-sm backdrop-blur">
        {eyebrow}
      </Badge>
      <h2 className="text-balance text-3xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-pretty text-base leading-8 text-slate-600 sm:text-lg">
        {copy}
      </p>
    </Reveal>
  );
}

function NatureBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(116,231,184,0.52),transparent_26%),radial-gradient(circle_at_82%_12%,rgba(59,179,114,0.22),transparent_30%),linear-gradient(180deg,#ffffff_0%,#f5fbf4_58%,#eef8ef_100%)]" />
      <div className="terrain-grid absolute inset-0 opacity-[0.48]" />
      <motion.div
        className="leaf-shape absolute left-[8%] top-[18%] h-36 w-20 rotate-[-26deg]"
        animate={{ y: [0, -16, 0], rotate: [-26, -20, -26] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="leaf-shape absolute right-[12%] top-[28%] h-44 w-24 rotate-[18deg] opacity-70"
        animate={{ y: [0, 18, 0], rotate: [18, 12, 18] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="topographic-ring absolute -right-24 top-56 h-[520px] w-[520px]" />
      <div className="topographic-ring absolute -bottom-40 left-[-160px] h-[460px] w-[460px] opacity-60" />
    </div>
  );
}

function GlobalBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[#f5fbf4]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(116,231,184,0.34),transparent_24%),radial-gradient(circle_at_86%_12%,rgba(59,179,114,0.16),transparent_28%),radial-gradient(circle_at_50%_86%,rgba(183,232,210,0.38),transparent_34%)]" />
      <div className="global-grid absolute inset-0" />
      <div className="topographic-ring absolute right-[-220px] top-[18%] h-[620px] w-[620px] opacity-55" />
      <div className="topographic-ring absolute bottom-[10%] left-[-260px] h-[560px] w-[560px] opacity-45" />
      <div className="leaf-shape absolute left-[3%] top-[42%] h-32 w-20 rotate-[-34deg] opacity-35" />
      <div className="leaf-shape absolute bottom-[14%] right-[5%] h-44 w-24 rotate-[20deg] opacity-35" />
    </div>
  );
}

function DesktopNav({
  activeSection,
  onNavigate,
}: {
  activeSection: string;
  onNavigate: (section: string) => void;
}) {
  return (
    <nav className="fixed left-1/2 top-5 z-40 hidden w-[min(1180px,calc(100%-48px))] -translate-x-1/2 items-center justify-between rounded-full border border-white/70 bg-white/72 px-4 py-3 shadow-lg shadow-emerald-950/5 backdrop-blur-xl md:flex">
      <a href="#top" className="flex items-center gap-3">
        <Image
          src="/logo.png"
          alt="LIKAS logo"
          width={40}
          height={40}
          className="size-10 rounded-full object-cover shadow-lg shadow-emerald-600/20"
        />

        <span className="text-lg font-black tracking-[0.18em] text-slate-950">
          LIKAS
        </span>
      </a>
      <div className="flex items-center gap-7 text-sm font-medium text-slate-600">
        {navItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            onClick={() => onNavigate(item.href.slice(1))}
            className={`rounded-full px-3 py-1.5 transition ${
              activeSection === item.href.slice(1)
                ? "bg-emerald-50 text-emerald-700 shadow-sm"
                : "hover:text-emerald-700"
            }`}
          >
            {item.label}
          </a>
        ))}
      </div>
      <a
        href="#video"
        className={buttonVariants({
          className:
            "rounded-full bg-slate-950 px-5 text-white hover:bg-emerald-700",
        })}
      >
        Launch Demo
      </a>
    </nav>
  );
}

function MobileBottomNav({
  activeSection,
  onNavigate,
}: {
  activeSection: string;
  onNavigate: (section: string) => void;
}) {
  return (
    <nav className="fixed bottom-3 left-1/2 z-50 flex w-[min(430px,calc(100%-24px))] -translate-x-1/2 items-center justify-between rounded-[1.6rem] border border-white/75 bg-white/84 p-2 shadow-2xl shadow-emerald-950/14 backdrop-blur-xl md:hidden">
      <a
        href="#top"
        onClick={() => onNavigate("top")}
        className={`grid min-w-12 place-items-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-bold transition ${
          activeSection === "top"
            ? "bg-emerald-100 text-emerald-700 shadow-sm"
            : "text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
        }`}
      >
        <Waves className="size-5" />
        Home
      </a>
      {navItems.slice(0, 4).map((item) => (
        <a
          key={item.href}
          href={item.href}
          onClick={() => onNavigate(item.href.slice(1))}
          className={`grid min-w-12 place-items-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-semibold transition ${
            activeSection === item.href.slice(1)
              ? "bg-emerald-100 text-emerald-700 shadow-sm"
              : "text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
          }`}
        >
          <item.icon className="size-5" />
          {item.label}
        </a>
      ))}
    </nav>
  );
}

function HeroPhone() {
  return (
    <div className="relative mx-auto min-h-[500px] w-full max-w-[330px] min-[380px]:min-h-[520px] min-[380px]:max-w-[360px] sm:min-h-[620px] sm:max-w-[520px] lg:min-h-[650px]">
      <div className="absolute left-2 top-8 h-[430px] w-[211px] rotate-[-5deg] rounded-[2.55rem] border-[8px] border-slate-950 bg-slate-950 p-1.5 shadow-2xl shadow-emerald-950/25 min-[380px]:h-[460px] min-[380px]:w-[226px] min-[380px]:rotate-[-7deg] min-[380px]:rounded-[2.7rem] min-[380px]:border-[9px] sm:left-10 sm:h-[560px] sm:w-[276px] sm:rounded-[3.2rem] sm:border-[12px] sm:p-2 lg:left-16 lg:h-[580px] lg:w-[286px]">
        <div
          className="phone-screen relative h-full overflow-hidden rounded-[2rem] bg-cover bg-center sm:rounded-[2.35rem]"
          style={{ backgroundImage: `url(${heroRouteMockup})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-transparent to-slate-950/12" />
        </div>
      </div>

      <div className="absolute right-2 top-36 h-[382px] w-[188px] rotate-[5deg] rounded-[2.3rem] border-[8px] border-slate-950 bg-slate-950 p-1.5 shadow-2xl shadow-emerald-950/20 min-[380px]:right-0 min-[380px]:h-[410px] min-[380px]:w-[202px] min-[380px]:rotate-[7deg] min-[380px]:rounded-[2.45rem] min-[380px]:border-[9px] sm:top-32 sm:h-[500px] sm:w-[245px] sm:rounded-[3rem] sm:border-[12px] sm:p-2 lg:h-[520px] lg:w-[255px]">
        <div
          className="phone-screen relative h-full overflow-hidden rounded-[1.85rem] bg-cover bg-center sm:rounded-[2.2rem]"
          style={{ backgroundImage: `url(${heroAssistantMockup})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-white/0 via-transparent to-slate-950/10" />
        </div>
      </div>

      <motion.div
        className="absolute left-0 top-0 rounded-3xl border border-white/80 bg-white/85 p-3 shadow-xl shadow-emerald-950/10 backdrop-blur-xl max-[360px]:scale-90 sm:p-4"
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-amber-100 text-amber-700">
            <BatteryWarning className="size-5" />
          </div>
          <div>
            <p className="text-sm font-bold">Low-power mode</p>
            <p className="text-xs text-slate-500">Safety steps stay instant</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="absolute bottom-3 left-2 rounded-3xl border border-white/80 bg-slate-950 p-3 text-white shadow-2xl shadow-slate-950/20 max-[360px]:scale-90 sm:bottom-2 sm:left-10 sm:p-4"
        animate={{ y: [0, 12, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="flex items-center gap-3">
          <PhoneCall className="size-5 text-[#74e7b8]" />
          <div>
            <p className="text-sm font-bold">SOS message ready</p>
            <p className="text-xs text-slate-300">
              Location and profile included
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function PhoneMockup({
  label,
  title,
  copy,
  icon: Icon,
  image,
  signal,
}: {
  label: string;
  title: string;
  copy: string;
  icon: React.ElementType;
  image: string;
  signal: string;
}) {
  return (
    <motion.div variants={fadeUp} className="group h-full">
      <div className="group relative flex h-full w-full flex-col rounded-[2rem] border border-white/80 bg-white/82 p-4 shadow-xl shadow-emerald-950/8 backdrop-blur transition duration-300 hover:-translate-y-2 hover:shadow-2xl hover:shadow-emerald-950/14 sm:p-5">
        <div className="absolute -right-3 -top-3 z-10 grid size-12 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
          <Icon className="size-5" />
        </div>

        <div className="relative mx-auto w-full max-w-[310px] sm:max-w-[260px] lg:max-w-[240px] xl:max-w-[218px]">
          <div className="absolute inset-x-10 -bottom-3 h-10 rounded-full bg-emerald-500/20 blur-xl" />

          <div className="relative aspect-[9/18.5] rounded-[2.45rem] border-[9px] border-slate-950 bg-slate-950 p-1.5 shadow-2xl shadow-emerald-950/18">
            <div
              className="phone-screen relative flex h-full flex-col overflow-hidden rounded-[1.75rem] bg-cover bg-center"
              style={{ backgroundImage: `url(${image})` }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/4 via-transparent to-slate-950/24" />

              {/* <div className="relative mt-auto p-3">
                <div className="rounded-[1.35rem] border border-white/60 bg-white/88 p-3 shadow-xl shadow-slate-950/10 backdrop-blur">
                  <p className="text-xs font-bold text-slate-950">{label}</p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    {signal}
                  </p>
                </div>
              </div> */}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-1 flex-col text-left">
          <Badge className="mb-3 w-fit bg-emerald-50 text-emerald-700">
            {signal}
          </Badge>

          <h3 className="text-lg font-semibold leading-6 text-slate-950">
            {title}
          </h3>

          <p className="mt-3 text-sm leading-6 text-slate-600">{copy}</p>
        </div>
      </div>
    </motion.div>
  );
}

export default function Home() {
  const [activeSection, setActiveSection] = useState("top");
  const [showVideo, setShowVideo] = useState(false);
  const { scrollYProgress } = useScroll();
  const progressWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  const heroY = useTransform(scrollYProgress, [0, 0.35], [0, 74]);

  useEffect(() => {
    let frame = 0;

    const updateActiveSection = () => {
      const navOffset = 140;
      const scrollPosition = window.scrollY + navOffset;

      let current = "top";

      for (const id of sectionOrder) {
        const section = document.getElementById(id);
        if (!section) continue;

        if (scrollPosition >= section.offsetTop) {
          current = id;
        }
      }

      const nearBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 8;

      if (nearBottom) {
        current = sectionOrder[sectionOrder.length - 1];
      }

      setActiveSection(current);
    };

    const onScroll = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5fbf4] pb-24 text-slate-950 md:pb-0">
      <GlobalBackdrop />
      <motion.div
        className="fixed left-0 top-0 z-50 h-1 bg-gradient-to-r from-[#3bb372] via-[#74e7b8] to-[#3bb372]"
        style={{ width: progressWidth }}
      />
      <DesktopNav activeSection={activeSection} onNavigate={setActiveSection} />
      <MobileBottomNav
        activeSection={activeSection}
        onNavigate={setActiveSection}
      />

      <section
        id="top"
        className="relative min-h-screen scroll-mt-28 px-5 pb-20 pt-7 sm:px-8 md:pt-28 lg:px-12"
      >
        <NatureBackdrop />

        <div className="mx-auto grid max-w-7xl items-center gap-14 pt-12 lg:grid-cols-[0.96fr_1.04fr] lg:pt-12">
          <Reveal>
            <Badge className="mb-5 border-emerald-200 bg-white/75 px-4 py-1.5 text-emerald-700 shadow-sm">
              Mobile app for offline-first disaster response
            </Badge>
            <h1 className="text-balance text-6xl font-black tracking-tight text-slate-950 sm:text-7xl lg:text-8xl">
              LIKAS
            </h1>
            <p className="mt-6 max-w-3xl text-balance text-3xl font-semibold leading-tight text-slate-900 sm:text-5xl">
              Your companion when calamity strikes the nation
            </p>
            <p className="mt-7 max-w-2xl text-pretty text-lg leading-8 text-slate-600">
              A mobile disaster companion that helps people prepare, evacuate,
              and get emergency assistance through offline maps, personalized
              guidance, and an on-device AI assistant.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="#features"
                className={buttonVariants({
                  size: "lg",
                  className:
                    "min-h-13 w-full rounded-full bg-[#3bb372] px-5 text-center text-base text-white shadow-xl shadow-emerald-500/25 hover:bg-emerald-700 sm:w-auto sm:px-7",
                })}
              >
                Explore LIKAS
              </a>
              <a
                href="#video"
                className={buttonVariants({
                  size: "lg",
                  variant: "outline",
                  className:
                    "min-h-13 w-full rounded-full border-emerald-200 bg-white/75 px-5 text-center text-base hover:bg-emerald-50 sm:w-auto sm:px-7",
                })}
              >
                <Play className="mr-2 size-4 fill-emerald-600 text-emerald-600" />
                Watch Demo
              </a>
            </div>
          </Reveal>

          <motion.div className="overflow-visible" style={{ y: heroY }}>
            <HeroPhone />
          </motion.div>
        </div>
      </section>

      <section
        className="section-atmosphere relative scroll-mt-28 px-5 py-24 sm:px-8"
        id="video"
      >
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-center">
          <div className="flex flex-col gap-4">
            <SectionHeader
              align="left"
              eyebrow="Demo showcase"
              title="See LIKAS as a mobile safety companion in motion."
              copy="The demo area is designed for a YouTube walkthrough that shows how citizens move from onboarding to preparedness, evacuation routing, and offline AI assistance during an emergency."
            />
            <Reveal delay={0.08} className="lg:col-start-1">
              <a
                href="https://cdn.likas-ai.com/apk/likas_v1.0.apk"
                download
                className={buttonVariants({
                  size: "lg",
                  className:
                    "min-h-13 w-full rounded-full bg-[#3bb372] px-5 text-center text-base text-white shadow-xl shadow-emerald-500/25 hover:bg-emerald-700 sm:full",
                })}
              >
                <Download className="mr-2 size-4" />
                Download APK
              </a>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <div className="relative aspect-video overflow-hidden rounded-[2rem] border border-white bg-slate-950 shadow-2xl shadow-emerald-950/15">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(116,231,184,0.42),transparent_32%),linear-gradient(135deg,#10251b,#04120c)]" />
              <div className="absolute inset-0 opacity-30 bg-[linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.12)_1px,transparent_1px)] bg-[size:42px_42px]" />
              {youtubeEmbedUrl ? (
                showVideo ? (
                  <iframe
                    className="absolute inset-0 z-0 h-full w-full"
                    src={`${youtubeEmbedUrl}?autoplay=1`}
                    title="LIKAS demo"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <div
                    className="absolute inset-0 z-0 grid place-items-center cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => setShowVideo(true)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        setShowVideo(true);
                    }}
                  >
                    <img
                      src="/thumbnail.svg"
                      alt="LIKAS product demo thumbnail"
                      className="absolute inset-0 h-full w-full p-16 object-contain opacity-90 transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="relative z-10 text-center text-white">
                      <div className="mx-auto mb-5 grid size-24 place-items-center rounded-full bg-white text-emerald-700 shadow-2xl">
                        <Play className="ml-1 size-9 fill-emerald-700" />
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <div className="absolute inset-0 z-0 grid place-items-center">
                  <div className="text-center text-white">
                    <div className="mx-auto mb-5 grid size-24 place-items-center rounded-full bg-white text-emerald-700 shadow-2xl">
                      <Play className="ml-1 size-9 fill-emerald-700" />
                    </div>
                    <p className="text-2xl font-bold">LIKAS product demo</p>
                    <p className="mt-3 max-w-md text-sm leading-6 text-emerald-50">
                      This showcase is reserved for the official YouTube
                      walkthrough of the mobile app experience.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section-atmosphere px-5 py-24 sm:px-8">
        <div className="relative mx-auto grid max-w-7xl gap-10 overflow-hidden rounded-[2.5rem] border border-emerald-100 bg-white/82 p-8 shadow-xl shadow-emerald-950/5 backdrop-blur lg:grid-cols-[0.8fr_1.2fr] lg:p-12">
          <div className="absolute right-8 top-8 opacity-10">
            <Trees className="size-40 text-emerald-700" />
          </div>
          <Reveal>
            <Badge className="mb-4 bg-emerald-50 text-emerald-700">
              About LIKAS
            </Badge>
            <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Nature, evacuation, and rescue in one calm mobile companion.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <div>
              <p className="text-lg leading-9 text-slate-600">
                In Filipino,{" "}
                <span className="font-semibold text-slate-950">likas</span>{" "}
                means nature. It also connects to the act of moving away from
                danger toward safety. LIKAS turns that meaning into a practical
                mobile app for citizens: prepared before disasters, guided
                during emergencies, and supported after the first shock has
                passed.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  [
                    "Prepare",
                    "Checklists and protocols before danger arrives.",
                  ],
                  [
                    "Evacuate",
                    "Clear route decisions when every minute matters.",
                  ],
                  ["Assist", "Offline AI guidance for text and voice support."],
                ].map(([title, copy]) => (
                  <div
                    key={title}
                    className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5"
                  >
                    <p className="font-bold text-slate-950">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {copy}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section
        className="section-atmosphere scroll-mt-28 px-5 py-24 sm:px-8"
        id="features"
      >
        <SectionHeader
          eyebrow="Key features"
          title="Practical disaster support across every phase of response."
          copy="LIKAS is organized around the real rhythm of disaster readiness: prepare before danger arrives, move safely when conditions change, and get calm guidance when people need help quickly."
        />
        <motion.div
          className="mx-auto mt-14 grid max-w-7xl gap-5 md:grid-cols-2 lg:grid-cols-3"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
        >
          {functionalities.map(({ title, copy, icon: Icon, stat, outcome }) => (
            <motion.div variants={fadeUp} key={title}>
              <Card className="feature-card h-full overflow-hidden border-emerald-100/80 bg-white/86 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-950/10">
                <CardContent className="relative p-6">
                  <span className="absolute right-6 top-6 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                    {stat}
                  </span>
                  <div className="mb-10 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#3bb372] to-[#74e7b8] text-white shadow-lg shadow-emerald-500/25">
                    <Icon className="size-6" />
                  </div>
                  <h3 className="text-xl font-semibold text-slate-950">
                    {title}
                  </h3>
                  <p className="mt-3 leading-7 text-slate-600">{copy}</p>
                  <div className="mt-6 rounded-2xl border border-emerald-100 bg-white/70 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                      User benefit
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {outcome}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <section
        className="section-atmosphere relative scroll-mt-28 px-5 py-24 sm:px-8"
        id="ai"
      >
        <div className="absolute inset-x-0 top-1/2 -z-10 h-[520px] -translate-y-1/2 bg-[radial-gradient(circle_at_50%_50%,rgba(116,231,184,0.42),transparent_58%)]" />
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="AI tech stack"
            title="Highlights powered by Gemma 4"
            copy="A more resilient AI section for a more resilient app: model, tuning, and runtime explained as one mobile intelligence pipeline."
          />
          <div className="mt-14 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
            <Reveal>
              <div className="relative h-full min-h-[460px] overflow-hidden rounded-[2.5rem] bg-slate-950 p-8 text-white shadow-2xl shadow-emerald-950/20">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(116,231,184,0.35),transparent_28%),linear-gradient(135deg,rgba(59,179,114,0.18),transparent_42%)]" />
                <div className="absolute inset-0 opacity-20 bg-[linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.16)_1px,transparent_1px)] bg-[size:36px_36px]" />
                <div className="relative">
                  <Badge className="mb-6 bg-white/10 text-[#74e7b8]">
                    Offline AI core
                  </Badge>
                  <h3 className="max-w-lg text-4xl font-semibold tracking-tight sm:text-5xl">
                    Gemma 4 lives close to the user, where emergencies actually
                    happen.
                  </h3>
                  <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
                    LIKAS promotes a mobile-first AI companion: fine-tuned for
                    disaster guidance, designed for on-device workflows, and
                    integrated for low-connectivity response.
                  </p>
                  <div className="mt-10 grid gap-3 sm:grid-cols-3">
                    {["Local", "Tuned", "Mobile"].map((item) => (
                      <div
                        key={item}
                        className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur"
                      >
                        <p className="text-2xl font-black text-[#74e7b8]">
                          {item}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                          AI layer
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
            <motion.div
              className="grid gap-5"
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-80px" }}
            >
              {techStack.map((tech) => (
                <motion.div key={tech.name} variants={fadeUp}>
                  <Card className="overflow-hidden border-white bg-white/88 shadow-xl shadow-emerald-950/6 backdrop-blur transition duration-300 hover:-translate-y-1">
                    <CardContent className="grid gap-5 p-6 sm:grid-cols-[88px_1fr]">
                      <div className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-300 text-white shadow-lg shadow-emerald-500/25">
                        <tech.icon className="size-9" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-2xl font-black tracking-tight text-slate-950">
                            {tech.name}
                          </h3>
                          <Badge className="bg-slate-950 text-white">
                            {tech.tag}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
                          {tech.meta}
                        </p>
                        <p className="mt-3 leading-7 text-slate-600">
                          {tech.copy}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      <section
        className="section-atmosphere scroll-mt-28 px-5 py-24 sm:px-8"
        id="mockups"
      >
        <SectionHeader
          eyebrow="Mobile app mockups"
          title="A closer look at the LIKAS mobile experience."
          copy="Each screen is presented as part of the citizen journey: setting up personal needs, preparing before danger, choosing safer routes, asking the offline assistant, and reviewing emergency center details."
        />

        <motion.div
          className="mx-auto mt-14 grid max-w-7xl grid-cols-1 gap-8 lg:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
        >
          {mockups.map((mockup) => (
            <PhoneMockup key={mockup.label} {...mockup} />
          ))}
        </motion.div>
      </section>

      <section className="section-atmosphere px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="How it works"
            title="From first setup to emergency decisions in four clear steps."
            copy="LIKAS keeps the user journey simple enough for stressful moments while still adapting to household needs, location, and disaster context."
          />
          <div className="mt-14 grid gap-4 lg:grid-cols-4">
            {steps.map((step, index) => (
              <Reveal key={step} delay={index * 0.08}>
                <div className="relative h-full overflow-hidden rounded-[2rem] border border-emerald-100 bg-white/88 p-6 shadow-lg shadow-emerald-950/5 backdrop-blur">
                  <Leaf className="absolute -right-4 -top-4 size-24 rotate-12 text-emerald-50" />
                  <span className="grid size-14 place-items-center rounded-2xl bg-emerald-100 text-2xl font-black text-emerald-700">
                    0{index + 1}
                  </span>
                  <p className="relative mt-8 text-xl font-semibold leading-8 text-slate-950">
                    {step}
                  </p>
                  {index < steps.length - 1 && (
                    <ChevronRight className="absolute right-5 top-7 hidden size-5 text-emerald-500 lg:block" />
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section
        className="section-atmosphere scroll-mt-28 px-5 py-24 sm:px-8"
        id="team"
      >
        <SectionHeader
          eyebrow="Meet the team"
          title="The builders behind LIKAS."
          copy="A multidisciplinary student team combining AI, mobile development, web engineering, design, and community-centered product thinking for disaster resilience."
        />

        <div className="mx-auto mt-14 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {team.map(({ name, role, image, linkedin, github }, index) => (
            <Reveal key={name} delay={index * 0.06}>
              <Card className="overflow-hidden border-emerald-100 bg-white/85 text-center shadow-sm backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-950/10">
                <CardContent className="p-4">
                  <div className="relative mb-5 aspect-[4/5] overflow-hidden rounded-[1.6rem] border border-emerald-100 bg-gradient-to-br from-emerald-100 via-white to-teal-100 shadow-inner">
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${image})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/24 via-transparent to-white/10" />
                  </div>

                  <p className="text-lg font-semibold text-slate-950">{name}</p>
                  <p className="mt-1 text-sm text-slate-500">{role}</p>

                  <div className="mt-4 flex items-center justify-center gap-3">
                    {linkedin && (
                      <a
                        href={linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${name}'s LinkedIn profile`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-100 bg-white text-slate-600 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <FaLinkedin className="h-4 w-4" />
                      </a>
                    )}

                    {github && (
                      <a
                        href={github}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${name}'s GitHub profile`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-100 bg-white text-slate-600 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <FaGithub className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section-atmosphere px-5 pb-28 pt-20 sm:px-8 md:pb-8">
        <Reveal>
          <div className="relative mx-auto overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-emerald-950/20 sm:rounded-[2.5rem] sm:p-12">
            <Mountain className="absolute bottom-0 right-0 size-48 text-white/5 sm:right-8 sm:size-72" />
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div className="relative">
                <Badge className="mb-5 bg-white/10 text-[#74e7b8]">
                  Preparedness, safety, resilience
                </Badge>
                <h2 className="max-w-4xl text-balance text-3xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                  Discover LIKAS before the next emergency asks for it.
                </h2>
                <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                  For citizens, communities, responders, and organizations
                  working toward a safer and more prepared Philippines.
                </p>
              </div>
              <div className="relative rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur sm:p-6">
                <div className="flex flex-col gap-4 min-[420px]:flex-row min-[420px]:items-center">
                  <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#74e7b8] text-slate-950">
                    <Compass className="size-7" />
                  </div>
                  <div>
                    <p className="font-semibold">
                      Calm guidance. Local action.
                    </p>
                    <p className="text-sm text-slate-300">
                      Built for offline-first response.
                    </p>
                  </div>
                </div>
                <Separator className="my-6 bg-white/10" />
                <Reveal delay={0.08} className="lg:col-start-1">
                  <a
                    href="https://cdn.likas-ai.com/apk/likas_v1.0.apk"
                    download
                    className={buttonVariants({
                      size: "lg",
                      className:
                        "min-h-13 w-full rounded-full bg-[#74e7b8] px-5 text-center text-base text-white shadow-xl shadow-emerald-500/25 hover:bg-emerald-700 sm:full",
                    })}
                  >
                    <Download className="mr-2 size-4" />
                    Download APK
                  </a>
                </Reveal>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://likas-ai.com";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "LIKAS",
  title: {
    default: "LIKAS | Offline AI Disaster Companion for the Philippines",
    template: "%s | LIKAS",
  },
  description:
    "LIKAS is an offline-first AI disaster companion for Filipino communities, with preparedness checklists, evacuation routing, emergency center guidance, and low-connectivity chat or voice assistance.",
  keywords: [
    "LIKAS",
    "disaster preparedness app",
    "offline AI emergency assistant",
    "Philippines disaster response",
    "evacuation routing app",
    "emergency preparedness checklist",
    "Gemma AI mobile app",
    "typhoon preparedness",
    "earthquake preparedness",
    "Filipino safety app",
  ],
  authors: [
    { name: "John Paul Curada", url: "https://github.com/JpCurada" },
    { name: "Gerald Berongoy", url: "https://github.com/geraldsberongoy" },
    { name: "Kyne Laggui", url: "https://github.com/KyneLaggui" },
    { name: "Henry James Carlos", url: "https://github.com/hjcarlos" },
  ],
  creator: "LIKAS Team",
  publisher: "LIKAS Team",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_PH",
    url: "/",
    siteName: "LIKAS",
    title: "LIKAS | Offline AI Disaster Companion for the Philippines",
    description:
      "Prepare before calamities, compare safer evacuation routes, and get offline AI guidance through LIKAS, a mobile safety companion for Filipino communities.",
    images: [
      {
        url: "/mockups/mockup_1.jpg",
        width: 1080,
        height: 2220,
        alt: "LIKAS evacuation route map mobile screen",
      },
      {
        url: "/mockups/mockup_5.jpg",
        width: 1080,
        height: 2220,
        alt: "LIKAS offline AI assistant mobile screen",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "LIKAS | Offline AI Disaster Companion",
    description:
      "An offline-first mobile app for disaster preparedness, evacuation routing, and emergency AI assistance in the Philippines.",
    images: [
      {
        url: "/mockups/mockup_1.jpg",
        alt: "LIKAS evacuation route map mobile screen",
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "technology",
  classification:
    "Disaster preparedness, emergency response, offline AI, evacuation routing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

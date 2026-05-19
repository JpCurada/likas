import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://likas-ai.com";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date("2026-05-19"),
      changeFrequency: "weekly",
      priority: 1,
      images: [
        `${siteUrl}/logo.png`,
        `${siteUrl}/mockups/mockup_1.jpg`,
        `${siteUrl}/mockups/mockup_2.jpg`,
        `${siteUrl}/mockups/mockup_3.jpg`,
        `${siteUrl}/mockups/mockup_5.jpg`,
        `${siteUrl}/mockups/mockup_6.jpg`,
      ],
      videos: [
        {
          title: "LIKAS product demo",
          description:
            "A walkthrough of LIKAS onboarding, preparedness guidance, evacuation routing, and offline AI assistance.",
          thumbnail_loc: `${siteUrl}/thumbnail.svg`,
        },
      ],
    },
  ];
}

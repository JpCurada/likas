import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LIKAS - Offline AI Disaster Companion",
    short_name: "LIKAS",
    description:
      "Offline-first disaster preparedness, evacuation routing, and emergency AI assistance for Filipino communities.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5fbf4",
    theme_color: "#3bb372",
    icons: [
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

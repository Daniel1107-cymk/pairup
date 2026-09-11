import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PairUp",
    short_name: "PairUp",
    description: "Fair badminton pairings for club nights",
    start_url: "/",
    display: "standalone",
    background_color: "#082419",
    theme_color: "#0d3b2e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

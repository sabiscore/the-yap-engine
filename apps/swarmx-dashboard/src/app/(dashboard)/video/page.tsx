/**
 * Primary Creative Hub studio route.
 *
 * The presentation shell lives in YapStudio; it owns the existing video store
 * and VideoJobForm contracts so generation behavior remains unchanged.
 */
"use client";

import { YapStudio } from "@/components/YapStudio";

export default function VideoPage() {
  return <YapStudio />;
}

import { Suspense } from "react";
import { PlaygroundView } from "@/components/PlaygroundView";

export default function PlaygroundPage() {
  return <Suspense><PlaygroundView /></Suspense>;
}

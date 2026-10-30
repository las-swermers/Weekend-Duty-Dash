import { DemoClient } from "@/components/demo/demo-client";

export const metadata = {
  title: "Dorm insights demo · Fictional school data",
  description:
    "Explore student-life insights with entirely fictional students and dorms. No school records are used.",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return <DemoClient />;
}

import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
      </main>
      <Footer />
    </div>
  );
}

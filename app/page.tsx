import { DataProvider } from "@/lib/data-context";
import { Header } from "@/components/Header";
import { PassportBirthplace } from "@/components/sections/PassportBirthplace";
import { Portrait } from "@/components/sections/Portrait";
import { Trend } from "@/components/sections/Trend";
import { Explorer } from "@/components/Explorer";
import { Baselines } from "@/components/sections/Baselines";
import { AvailabilityMatrix } from "@/components/sections/AvailabilityMatrix";
import { Method } from "@/components/sections/Method";
import { Footer } from "@/components/Footer";

export default function Page() {
  return (
    <DataProvider>
      <Header />
      <main>
        <PassportBirthplace />
        <Portrait />
        <Trend />
        <Explorer />
        <Baselines />
        <AvailabilityMatrix />
        <Method />
      </main>
      <Footer />
    </DataProvider>
  );
}

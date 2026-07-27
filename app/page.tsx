import { DataProvider } from "@/lib/data-context";
import { Header } from "@/components/Header";
import { Main } from "@/components/Main";
import { Findings } from "@/components/sections/Findings";
import { PassportBirthplace } from "@/components/sections/PassportBirthplace";
import { Portrait } from "@/components/sections/Portrait";
import { Trend } from "@/components/sections/Trend";
import { Reasons } from "@/components/sections/Reasons";
import { Explorer } from "@/components/Explorer";
import { Baselines } from "@/components/sections/Baselines";
import { Appendix } from "@/components/sections/Appendix";
import { Footer } from "@/components/Footer";

export default function Page() {
  return (
    <DataProvider>
      <Header />
      <Main>
        <Findings />
        <PassportBirthplace />
        <Portrait />
        <Trend />
        <Reasons />
        <Explorer />
        <Baselines />
        <Appendix />
      </Main>
      <Footer />
    </DataProvider>
  );
}

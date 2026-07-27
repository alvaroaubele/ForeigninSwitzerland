import { DataProvider } from "@/lib/data-context";
import { I18nProvider } from "@/lib/i18n";
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
    <I18nProvider>
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
    </I18nProvider>
  );
}

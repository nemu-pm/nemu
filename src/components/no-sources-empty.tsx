import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PageEmpty } from "@/components/page-empty";
import { AddSourceDialog } from "@/components/add-source-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Globe02Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

type NoSourcesEmptyProps = {
  icon?: IconSvgElement;
  titleKey?: string;
  descriptionKey?: string;
  buttonKey?: string;
};

export function NoSourcesEmpty({
  icon = Globe02Icon,
  titleKey = "common.noSources",
  descriptionKey = "common.noSourcesDescription",
  buttonKey = "common.addSource",
}: NoSourcesEmptyProps) {
  const { t } = useTranslation();
  const [addSourceOpen, setAddSourceOpen] = useState(false);

  return (
    <>
      <PageEmpty
        icon={icon}
        title={t(titleKey)}
        description={t(descriptionKey)}
        action={
          <Button onClick={() => setAddSourceOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} />
            {t(buttonKey)}
          </Button>
        }
      />
      <AddSourceDialog open={addSourceOpen} onOpenChange={setAddSourceOpen} />
    </>
  );
}

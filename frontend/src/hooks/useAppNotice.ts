import { useEffect, useState } from "react";

import type { AppNotice } from "../components/AppStatusBanners";

type UseAppNoticeReturn = {
  appNotice: AppNotice | null;
  setAppNotice: React.Dispatch<React.SetStateAction<AppNotice | null>>;
};

export function useAppNotice(): UseAppNoticeReturn {
  const [appNotice, setAppNotice] = useState<AppNotice | null>(null);

  useEffect(() => {
    if (!appNotice) {
      return;
    }
    const timer = window.setTimeout(() => setAppNotice(null), 4800);
    return () => window.clearTimeout(timer);
  }, [appNotice]);

  return { appNotice, setAppNotice };
}
